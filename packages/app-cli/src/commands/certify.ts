/**
 * certify.ts — `akari app certify` command (AKARI-HUB-024 §6.8 / §6.9)
 *
 * Runs the full Certification pipeline:
 *   1. Parse + validate akari.toml (manifest.ts)
 *   2. Detect panel tier (Full vs MCP-Declarative)
 *   3. Validate panel.schema.json for MCP-Declarative panels (panel-schema.ts)
 *   4. Naming lint — app id, agent ids (naming.ts / ADR-011)
 *   5. Category lint (category.ts / ADR-013)
 *   6. JSONLogic expression lint on panel.schema.json (expression.ts / ADR-012)
 *   7. Contract Test runner (contract-test.ts) — Permission API is real, others still STUB
 *   8. Print colour-coded report + exit with appropriate code
 *
 * Verdict（2026-06-12 クリーンルーム監査 PASS_WITH_STUBS 区別勧告への対応, P1-6）:
 *   - PASS             — 全チェック PASS、かつ Contract Test に STUB が 1 つも残っていない
 *   - PASS_WITH_STUBS  — エラーは無いが、Contract Test の一部スイートがまだ STUB
 *                        （スタブのため動作保証なし）。--strict 指定時のみ FAIL 相当に格上げ
 *   - FAIL             — 1 つ以上のエラー
 *
 * Exit codes:
 *   0 — PASS または PASS_WITH_STUBS（--strict なし）
 *   1 — FAIL、または PASS_WITH_STUBS で --strict 指定時
 *
 * Spec reference: AKARI-HUB-024 §6.8 Certification, §6.9 Toolchain
 */

import type { Command } from "commander";
import path from "path";
import { loadAndValidateManifest, type ManifestValidationResult } from "./validators/manifest.js";
import { loadAndValidatePanelSchema } from "./validators/panel-schema.js";
import { runNamingLint } from "./validators/naming.js";
import { validateCategoryFromManifest } from "./validators/category.js";
import { validateAllExpressions } from "./validators/expression.js";
import { runContractTests } from "./validators/contract-test.js";

// ---------------------------------------------------------------------------
// Chalk helper (gracefully degrades if chalk is not available)
// ---------------------------------------------------------------------------

type ChalkLike = {
  red: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
  blue: (s: string) => string;
  bold: (s: string) => string;
  dim: (s: string) => string;
  cyan: (s: string) => string;
};

function makeChalk(): ChalkLike {
  try {
    // chalk v5 は ESM-only。CJS バンドル経由の require では ESM namespace（{ default }）が
    // 返り c.green が undefined になる（Node v25 等）。default を unwrap し、関数形状を確認して
    // から採用する。形状が想定外なら identity にフォールバック。
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("chalk");
    const chalk = mod && mod.default ? mod.default : mod;
    if (chalk && typeof chalk.green === "function") {
      return chalk as ChalkLike;
    }
    throw new Error("chalk shape unexpected");
  } catch {
    // No chalk — return identity functions
    const id = (s: string) => s;
    return { red: id, green: id, yellow: id, blue: id, bold: id, dim: id, cyan: id };
  }
}

const c = makeChalk();

// ---------------------------------------------------------------------------
// Report helpers
// ---------------------------------------------------------------------------

const PASS = c.green("✓ PASS");
const FAIL = c.red("✗ FAIL");
const STUB = c.cyan("○ STUB");
const SKIP = c.dim("– SKIP");
const WARN = c.yellow("! WARN");

function printSection(title: string, passed: boolean, stubbed = false): void {
  const marker = stubbed ? STUB : (passed ? PASS : FAIL);
  console.log(`\n${marker}  ${c.bold(title)}`);
}

function printErrors(errors: { field?: string; path?: string; message: string; code: string }[]): void {
  for (const err of errors) {
    const location = err.field ?? err.path ?? "";
    console.log(`  ${c.red("→")} [${err.code}] ${location ? c.cyan(location) + ": " : ""}${err.message}`);
  }
}

function printWarnings(warnings: string[]): void {
  for (const w of warnings) {
    console.log(`  ${c.yellow("!")} ${w}`);
  }
}

// ---------------------------------------------------------------------------
// Main certify runner
// ---------------------------------------------------------------------------

export interface RunCertifyOptions {
  /** PASS_WITH_STUBS を FAIL 相当（exit 1）として扱う */
  strict?: boolean;
}

export async function runCertify(appDir: string, options: RunCertifyOptions = {}): Promise<number> {
  const { strict = false } = options;
  const absDir = path.resolve(appDir);
  console.log(c.bold(`\nAKARI App Certify — ${absDir}`));
  console.log(c.dim("─".repeat(60)));

  let overallPassed = true;

  // ── Step 1: Parse + validate akari.toml ────────────────────────────────
  console.log(`\n${c.blue("→")} Step 1: Reading akari.toml...`);
  const manifestResult: ManifestValidationResult = await loadAndValidateManifest(absDir);

  printSection("Manifest (akari.toml)", manifestResult.valid);
  if (!manifestResult.valid) {
    printErrors(manifestResult.errors);
    overallPassed = false;
  }
  if (manifestResult.warnings.length > 0) {
    printWarnings(manifestResult.warnings);
  }

  // compat.shell_api の出力（P1: HUB-108 K-3 cleanroom 対応）
  if (manifestResult.manifest) {
    const compatApi = manifestResult.manifest.compat?.shell_api;
    if (compatApi) {
      console.log(`  ${c.green("✓")} compat.shell_api: ${c.cyan(compatApi)}`);
    } else {
      console.log(`  ${c.yellow("!")} compat.shell_api 未宣言 — [compat] shell_api = "^0.1" の追加を推奨`);
    }
  }

  // If manifest is invalid, we can't proceed with tier-dependent checks
  if (!manifestResult.manifest) {
    console.log(c.red("\n✗ Certification aborted — fix akari.toml errors above first."));
    return 1;
  }

  const manifest = manifestResult.manifest;
  const tier = manifest.app.tier;

  console.log(c.dim(`  App: ${manifest.app.id} (${manifest.app.name}), tier=${tier}`));

  // ── Step 2 + 3: Panel Schema validation (MCP-Declarative only) ─────────
  console.log(`\n${c.blue("→")} Step 2/3: Panel checks...`);

  if (tier === "mcp-declarative" && manifest.panels) {
    for (const [panelId, panel] of Object.entries(manifest.panels)) {
      if (panel.schema) {
        const schemaPath = path.join(absDir, panel.schema);
        console.log(c.dim(`  Checking panel "${panelId}" schema: ${panel.schema}`));

        const panelResult = await loadAndValidatePanelSchema(schemaPath);
        printSection(`Panel Schema [${panelId}] (HUB-025)`, panelResult.valid);
        if (!panelResult.valid) {
          printErrors(panelResult.errors);
          overallPassed = false;
        }
        if (panelResult.warnings.length > 0) {
          printWarnings(panelResult.warnings);
        }

        // ── Step 6: Expression lint (done per-schema file) ────────────────
        let parsedSchema: unknown = undefined;
        try {
          const fs = await import("fs/promises");
          const raw = await fs.readFile(schemaPath, "utf-8");
          parsedSchema = JSON.parse(raw);
        } catch {
          // Already caught by loadAndValidatePanelSchema above
        }

        if (parsedSchema !== undefined) {
          const exprResult = validateAllExpressions(parsedSchema);
          printSection(`JSONLogic Expressions [${panelId}] (ADR-012)`, exprResult.valid);
          if (!exprResult.valid) {
            printErrors(exprResult.errors);
            overallPassed = false;
          }
          if (exprResult.warnings.length > 0) {
            printWarnings(exprResult.warnings);
          }
        }
      }
    }
  } else if (tier === "full") {
    console.log(c.dim("  Full Tier — Panel Schema check skipped (React panels not validated by certify)"));
    console.log(SKIP + "  Panel Schema validation (Full Tier uses React components)");
  }

  // ── Step 4: Naming lint ─────────────────────────────────────────────────
  console.log(`\n${c.blue("→")} Step 4: Naming lint (ADR-011)...`);
  const namingResult = runNamingLint(manifest as { app: { id?: string }; agents?: Record<string, unknown> });
  printSection("Naming Convention (ADR-011)", namingResult.valid);
  if (!namingResult.valid) {
    printErrors(namingResult.errors);
    overallPassed = false;
  }
  if (namingResult.warnings.length > 0) {
    printWarnings(namingResult.warnings);
  }

  // ── Step 5: Category lint ───────────────────────────────────────────────
  console.log(`\n${c.blue("→")} Step 5: Category lint (ADR-013)...`);
  const categoryResult = validateCategoryFromManifest(manifest as { app?: { category?: unknown } });
  printSection("Category Enum (ADR-013)", categoryResult.valid);
  if (!categoryResult.valid) {
    printErrors(categoryResult.errors);
    overallPassed = false;
  }
  if (categoryResult.warnings.length > 0) {
    printWarnings(categoryResult.warnings);
  }

  // ── Step 7: Contract Tests ──────────────────────────────────────────────
  console.log(`\n${c.blue("→")} Step 7: Contract Tests (HUB-024 §6.8)...`);
  const contractResult = await runContractTests(manifest, absDir);

  for (const suite of contractResult.suites) {
    const isStub = suite.status === "STUB";
    const isSkip = suite.status === "SKIP";
    const isFail = suite.status === "FAIL";

    const marker = isSkip ? SKIP : isStub ? STUB : isFail ? FAIL : PASS;
    console.log(`\n${marker}  ${c.bold(suite.suite)}`);

    if (isFail && suite.error) {
      console.log(`  ${c.red("→")} ${suite.error}`);
      overallPassed = false;
    }

    for (const tc of suite.cases) {
      const tcMarker =
        tc.status === "SKIP" ? SKIP :
        tc.status === "STUB" ? STUB :
        tc.status === "FAIL" ? FAIL :
        tc.status === "WARN" ? WARN :
        PASS;
      console.log(`    ${tcMarker} ${tc.name}`);
      if (tc.message) {
        console.log(c.dim(`       ${tc.message}`));
      }
      if (tc.status === "FAIL") {
        overallPassed = false;
      }
    }
  }

  // ── Final Report ────────────────────────────────────────────────────────
  console.log(`\n${c.dim("─".repeat(60))}`);

  // Contract Test スイートが 1 つでも STUB のままなら PASS_WITH_STUBS（三値化, P1-6 §1）
  const anyStub = contractResult.suites.some((suite) => suite.status === "STUB");
  const verdict: "PASS" | "PASS_WITH_STUBS" | "FAIL" = !overallPassed
    ? "FAIL"
    : anyStub
      ? "PASS_WITH_STUBS"
      : "PASS";

  if (verdict === "PASS") {
    console.log(c.green(c.bold("\n✓ Certification PASSED")));
    console.log(c.dim("  All Contract Test suites ran with real assertions (no stubs remaining)."));
  } else if (verdict === "PASS_WITH_STUBS") {
    console.log(c.yellow(c.bold("\n✓ Certification PASSED_WITH_STUBS")));
    console.log(c.yellow("  スタブのため動作保証なし — 一部の Contract Test スイートはまだ STUB（未実装）です。"));
    console.log(c.dim("  Manual Review may still be required for Marketplace submission."));
    if (strict) {
      console.log(c.red("  --strict 指定のため PASS_WITH_STUBS を FAIL として扱います。"));
    }
  } else {
    console.log(c.red(c.bold("\n✗ Certification FAILED")));
    console.log(c.dim("  Fix the errors above and re-run: akari app certify"));
  }
  console.log();

  if (verdict === "FAIL") return 1;
  if (verdict === "PASS_WITH_STUBS") return strict ? 1 : 0;
  return 0;
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

/**
 * Register the `certify` sub-command on the `app` command object.
 * Called from cli.ts after the `app` Command is created.
 *
 * Usage: akari app certify [--dir <path>]
 */
export function registerCertifyCommand(appCmd: Command): void {
  appCmd
    .command("certify")
    .description(
      "Run Automated Lint + Contract Tests for the app in the current directory (AKARI-HUB-024 §6.8)"
    )
    .option("-d, --dir <path>", "App root directory (default: current working directory)", ".")
    .option(
      "--strict",
      "PASS_WITH_STUBS（Contract Test に STUB が残っている）を FAIL 扱いにし、exit code 1 で終了する",
      false
    )
    .action(async (options: { dir: string; strict: boolean }) => {
      const exitCode = await runCertify(options.dir, { strict: options.strict });
      process.exit(exitCode);
    });
}
