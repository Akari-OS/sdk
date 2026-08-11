/**
 * contract-test.ts — Contract Test ランナー (AKARI-HUB-024 §6.8 / §8)
 *
 * 2026-06-12 クリーンルーム監査を受け、7 スイート中「Permission API」を
 * STUB → 実テスト化した（P1-6, 実装は permission-scan.ts）。
 * 残り 6 スイート（Agent / Memory / UI / Inter-App / Offline / MCP）は
 * まだ STUB のまま — certify.ts は STUB が残っている限り "PASS_WITH_STUBS"
 * を返し、無条件の PASS とは区別する（P1-6 §1）。
 *
 * Intended future shape:
 *   - Run trait-based contract tests for each of the 7 App APIs
 *     (Agent / Memory / Context / UI / Inter-App / Permission / Skill)
 *   - Run MCP tool input/output contract checks
 *   - Verify offline operation (external-network=false scenario)
 *
 * How to extend:
 *   Replace each TODO stub below with a real runner that exercises the App
 *   against a lightweight Core mock, following the trait contract
 *   defined in spec-akari-app-sdk.md §8 (Testing Strategy).
 *
 * Reference:
 *   AKARI-HUB-024 §6.8 Certification, §8 Testing Strategy
 *   AKARI-HUB-025 §6.6 Validation (MCP contract vs. panel.schema.json)
 */

import type { AppManifest } from "./manifest.js";
import { runPermissionScan } from "./permission-scan.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContractTestResult {
  /** Overall pass/fail for the contract test suite */
  passed: boolean;
  suites: ContractSuiteResult[];
  /** Human-readable summary */
  summary: string;
}

export interface ContractSuiteResult {
  /** Name of the API trait being tested */
  suite: string;
  /** STUB | PASS | FAIL | SKIP */
  status: "STUB" | "PASS" | "FAIL" | "SKIP";
  /** Individual test case results */
  cases: ContractCase[];
  /** Error detail if FAIL */
  error?: string;
}

export interface ContractCase {
  name: string;
  /** STUB | PASS | FAIL | SKIP | WARN（WARN は Permission Suite の over-declaration 検出等で使用） */
  status: "STUB" | "PASS" | "FAIL" | "SKIP" | "WARN";
  message?: string;
}

// ---------------------------------------------------------------------------
// Contract Test Suites
//
// Each suite corresponds to one of the 7 App API traits from HUB-024.
// Permission API（runPermissionApiSuite）以外はまだ STUB。
// TODO: Replace the remaining stub logic with real assertions against a Core mock.
// ---------------------------------------------------------------------------

/**
 * Suite 1 — Agent API Contract (HUB-024 §6.6.1)
 *
 * TODO: Verify that each agent defined in [agents] has a valid spec file (.md),
 *       is reachable, and that defineAgent() + invoke() calls conform to the API.
 */
function runAgentApiSuite(manifest: AppManifest): ContractSuiteResult {
  const cases: ContractCase[] = [];

  const agentCount = manifest.agents ? Object.keys(manifest.agents).length : 0;

  cases.push({
    name: "agents[] spec files are readable",
    status: "STUB",
    message: `TODO: Check that ${agentCount} agent spec file(s) exist and are non-empty .md files`,
  });

  cases.push({
    name: "defineAgent() call conforms to Agent API shape",
    status: "STUB",
    message: "TODO: Parse agent .md files and verify required fields (id, persona, tools, model)",
  });

  cases.push({
    name: "invoke() + spawn() usage does not retain state",
    status: "STUB",
    message: "TODO: Static analysis — agent invocations must not capture mutable app-level state",
  });

  return {
    suite: "Agent API (HUB-024 §6.6.1)",
    status: "STUB",
    cases,
  };
}

/**
 * Suite 2 — Memory API Contract (HUB-024 §6.6.2)
 *
 * TODO: Verify that the app does not maintain its own DB and all data access
 *       goes through pool / amp APIs. Also verify goal_ref is set on all amp.record() calls.
 */
function runMemoryApiSuite(_manifest: AppManifest): ContractSuiteResult {
  return {
    suite: "Memory API (HUB-024 §6.6.2)",
    status: "STUB",
    cases: [
      {
        name: "No self-managed DB (SQLite / IndexedDB / local file writes)",
        status: "STUB",
        message: "TODO: Scan app source for disallowed DB patterns (Guidelines rule 2)",
      },
      {
        name: "All pool.put() / pool.get() calls use @akari/sdk",
        status: "STUB",
        message: "TODO: Import graph analysis — only @akari/sdk pool access allowed",
      },
      {
        name: "amp.record() calls include goal_ref",
        status: "STUB",
        message: "TODO: AST scan for amp.record() without goal_ref field",
      },
    ],
  };
}

/**
 * Suite 3 — Permission API Contract (HUB-024 §6.6.6)
 *
 * P1-6 でスタブから実装に変更。形状検証 + 静的スキャンの実体は permission-scan.ts。
 * ここではケース結果から suite 全体の status を集計するだけの薄いラッパー。
 */
async function runPermissionApiSuite(manifest: AppManifest, appDir: string): Promise<ContractSuiteResult> {
  const cases = await runPermissionScan(manifest, appDir);

  const hasFail = cases.some((c) => c.status === "FAIL");
  const allSkip = cases.length > 0 && cases.every((c) => c.status === "SKIP");
  const status: ContractSuiteResult["status"] = hasFail ? "FAIL" : allSkip ? "SKIP" : "PASS";

  return {
    suite: "Permission API (HUB-024 §6.6.6)",
    status,
    cases,
  };
}

/**
 * Suite 4 — UI API Contract (HUB-024 §6.6.4)
 *
 * TODO: For Full Tier, verify that shell.mountPanel() is called with valid panel id
 *       matching [panels] in manifest. For MCP-Declarative, verify panel.schema.json exists.
 */
function runUiApiSuite(manifest: AppManifest): ContractSuiteResult {
  const tier = manifest.app.tier;
  return {
    suite: "UI API (HUB-024 §6.6.4)",
    status: "STUB",
    cases: [
      {
        name: tier === "full"
          ? "shell.mountPanel() ids match [panels] in manifest"
          : "panel.schema.json referenced in [panels] exists on disk",
        status: "STUB",
        message: "TODO: Verify panel declarations are consistent between manifest and source/schema files",
      },
      {
        name: "No independent window creation (Guidelines rule 3)",
        status: "STUB",
        message: "TODO: Scan for createWindow / BrowserWindow / electron calls (disallowed)",
      },
    ],
  };
}

/**
 * Suite 5 — Inter-App API Contract (HUB-024 §6.6.5)
 *
 * TODO: Verify app.handoff() sends only Pool/AMP IDs, not raw bytes.
 */
function runInterAppApiSuite(_manifest: AppManifest): ContractSuiteResult {
  return {
    suite: "Inter-App API (HUB-024 §6.6.5)",
    status: "STUB",
    cases: [
      {
        name: "handoff() payload contains only Pool / AMP IDs, not raw bytes",
        status: "STUB",
        message: "TODO: AST scan — handoff payload values should be string IDs, not Buffer / ArrayBuffer",
      },
      {
        name: "No direct cross-app calls (Guidelines rule 4)",
        status: "STUB",
        message: "TODO: Verify no import of other app's src/ paths",
      },
    ],
  };
}

/**
 * Suite 6 — Offline Contract (HUB-024 §6.8 / AC-8)
 *
 * TODO: If external-network = false, verify the app does not make
 *       network calls in its main execution paths.
 */
function runOfflineSuite(manifest: AppManifest): ContractSuiteResult {
  const externalNetwork = manifest.permissions?.["external-network"];
  const offlineRequired = externalNetwork === false;

  return {
    suite: "Offline Contract (HUB-024 AC-8)",
    status: offlineRequired ? "STUB" : "SKIP",
    cases: [
      {
        name: "App works with external-network disabled",
        status: offlineRequired ? "STUB" : "SKIP",
        message: offlineRequired
          ? "TODO: Run app in sandboxed environment with network blocked and verify no fetch() errors"
          : "Skipped: external-network is not set to false — offline test not required",
      },
    ],
  };
}

/**
 * Suite 7 — MCP Tool Contract (HUB-024 §6.6 / HUB-025 §6.6)
 *
 * TODO: For MCP-Declarative Tier, verify that MCP tool input schemas are consistent
 *       with the `bind` declarations in panel.schema.json.
 */
function runMcpContractSuite(manifest: AppManifest): ContractSuiteResult {
  const tier = manifest.app.tier;
  if (tier !== "mcp-declarative") {
    return {
      suite: "MCP Tool Contract (HUB-025 §6.6)",
      status: "SKIP",
      cases: [
        {
          name: "MCP contract check",
          status: "SKIP",
          message: `Skipped: Tier is "${tier}" — MCP contract check only applies to mcp-declarative`,
        },
      ],
    };
  }

  return {
    suite: "MCP Tool Contract (HUB-025 §6.6)",
    status: "STUB",
    cases: [
      {
        name: "MCP tool names declared in [mcp] tools[] are discoverable",
        status: "STUB",
        message: "TODO: Start MCP server and call tools/list to verify tool names match manifest",
      },
      {
        name: "MCP tool input schema matches panel.schema.json bind targets",
        status: "STUB",
        message: "TODO: For each field with bind=mcp.<tool>.<param>, verify MCP tool input schema includes that param",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all contract test suites for the given app.
 *
 * Permission API is now a real suite (P1-6); the remaining 6 suites still
 * return STUB status — this is the scaffold for future implementation.
 * Each stub suite logs what a real test would verify.
 *
 * @param manifest  Parsed and validated AppManifest from manifest.ts
 * @param appDir    Path to the app root directory (for file access)
 */
export async function runContractTests(
  manifest: AppManifest,
  appDir: string
): Promise<ContractTestResult> {
  const suites: ContractSuiteResult[] = [
    runAgentApiSuite(manifest),
    runMemoryApiSuite(manifest),
    await runPermissionApiSuite(manifest, appDir),
    runUiApiSuite(manifest),
    runInterAppApiSuite(manifest),
    runOfflineSuite(manifest),
    runMcpContractSuite(manifest),
  ];

  // Count genuine failures (FAIL status, not STUB or SKIP)
  const failures = suites.filter((s) => s.status === "FAIL");
  const stubs = suites.filter((s) => s.status === "STUB");
  const passed = failures.length === 0;

  const summary =
    `Contract Test: ${passed ? "PASS" : "FAIL"} — ` +
    `${suites.length} suite(s), ${failures.length} failure(s), ` +
    `${stubs.length} stub(s) (not yet implemented), ` +
    `${suites.filter((s) => s.status === "SKIP").length} skipped`;

  return { passed, suites, summary };
}
