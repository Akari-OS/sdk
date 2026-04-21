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
 *   7. Contract Test stub runner (contract-test.ts)
 *   8. Print colour-coded report + exit with appropriate code
 *
 * Exit codes:
 *   0 — all checks passed (CI safe)
 *   1 — one or more errors found
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const chalk = require("chalk");
    return chalk as ChalkLike;
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
const WARN = c.yellow("⚠ WARN");
const STUB = c.cyan("○ STUB");
const SKIP = c.dim("– SKIP");

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

export async function runCertify(appDir: string): Promise<number> {
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
      const tcMarker = tc.status === "SKIP" ? SKIP : tc.status === "STUB" ? STUB : tc.status === "FAIL" ? FAIL : PASS;
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
  if (overallPassed) {
    console.log(c.green(c.bold("\n✓ Certification PASSED")));
    console.log(c.dim("  Note: Contract tests are currently stubs (not yet executed)."));
    console.log(c.dim("  Manual Review may still be required for Marketplace submission."));
  } else {
    console.log(c.red(c.bold("\n✗ Certification FAILED")));
    console.log(c.dim("  Fix the errors above and re-run: akari app certify"));
  }
  console.log();

  return overallPassed ? 0 : 1;
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
    .action(async (options: { dir: string }) => {
      const exitCode = await runCertify(options.dir);
      process.exit(exitCode);
    });
}
