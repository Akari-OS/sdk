/**
 * contract-test.ts — Contract Test ランナースタブ (AKARI-HUB-024 §6.8 / §8)
 *
 * This is a STUB / scaffold for the Contract Test runner.
 * Actual test execution is NOT implemented here.
 *
 * Intended future shape:
 *   - Run trait-based contract tests for each of the 7 Module APIs
 *     (Agent / Memory / Context / UI / Inter-App / Permission / Skill)
 *   - Run MCP tool input/output contract checks
 *   - Verify offline operation (external-network=false scenario)
 *
 * How to extend:
 *   Replace each TODO stub below with a real runner that exercises the Module
 *   against a lightweight Core mock, following the trait contract
 *   defined in spec-akari-module-sdk.md §8 (Testing Strategy).
 *
 * Reference:
 *   AKARI-HUB-024 §6.8 Certification, §8 Testing Strategy
 *   AKARI-HUB-025 §6.6 Validation (MCP contract vs. panel.schema.json)
 */

import type { ModuleManifest } from "./manifest.js";

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
  status: "STUB" | "PASS" | "FAIL" | "SKIP";
  message?: string;
}

// ---------------------------------------------------------------------------
// Contract Test Suites (stubs)
//
// Each suite corresponds to one of the 7 Module API traits from HUB-024.
// TODO: Replace the stub logic with real assertions against a Core mock.
// ---------------------------------------------------------------------------

/**
 * Suite 1 — Agent API Contract (HUB-024 §6.6.1)
 *
 * TODO: Verify that each agent defined in [agents] has a valid spec file (.md),
 *       is reachable, and that defineAgent() + invoke() calls conform to the API.
 */
function runAgentApiSuite(manifest: ModuleManifest): ContractSuiteResult {
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
    message: "TODO: Static analysis — agent invocations must not capture mutable module-level state",
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
 * TODO: Verify that the module does not maintain its own DB and all data access
 *       goes through pool / amp APIs. Also verify goal_ref is set on all amp.record() calls.
 */
function runMemoryApiSuite(_manifest: ModuleManifest): ContractSuiteResult {
  return {
    suite: "Memory API (HUB-024 §6.6.2)",
    status: "STUB",
    cases: [
      {
        name: "No self-managed DB (SQLite / IndexedDB / local file writes)",
        status: "STUB",
        message: "TODO: Scan module source for disallowed DB patterns (Guidelines rule 2)",
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
 * TODO: Cross-check that all permission.gate() calls in source code reference
 *       permissions declared in [permissions] section of akari.toml.
 */
function runPermissionApiSuite(manifest: ModuleManifest): ContractSuiteResult {
  const declared = Object.keys(manifest.permissions ?? {});
  return {
    suite: "Permission API (HUB-024 §6.6.6)",
    status: "STUB",
    cases: [
      {
        name: `Declared permissions are non-empty (found: [${declared.join(", ")}])`,
        status: declared.length > 0 ? "STUB" : "FAIL",
        message:
          declared.length > 0
            ? "TODO: Verify runtime gate() calls match manifest declarations"
            : "No permissions declared in [permissions] — every module needs at least one",
      },
      {
        name: "No undeclared permission.gate() calls in source",
        status: "STUB",
        message: "TODO: AST scan for permission.gate({ action }) where action is not in [permissions]",
      },
    ],
  };
}

/**
 * Suite 4 — UI API Contract (HUB-024 §6.6.4)
 *
 * TODO: For Full Tier, verify that shell.mountPanel() is called with valid panel id
 *       matching [panels] in manifest. For MCP-Declarative, verify panel.schema.json exists.
 */
function runUiApiSuite(manifest: ModuleManifest): ContractSuiteResult {
  const tier = manifest.module.tier;
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
 * TODO: Verify module.handoff() sends only Pool/AMP IDs, not raw bytes.
 */
function runInterAppApiSuite(_manifest: ModuleManifest): ContractSuiteResult {
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
        name: "No direct cross-module calls (Guidelines rule 4)",
        status: "STUB",
        message: "TODO: Verify no import of other module's src/ paths",
      },
    ],
  };
}

/**
 * Suite 6 — Offline Contract (HUB-024 §6.8 / AC-8)
 *
 * TODO: If external-network = false, verify the module does not make
 *       network calls in its main execution paths.
 */
function runOfflineSuite(manifest: ModuleManifest): ContractSuiteResult {
  const externalNetwork = manifest.permissions?.["external-network"];
  const offlineRequired = externalNetwork === false;

  return {
    suite: "Offline Contract (HUB-024 AC-8)",
    status: offlineRequired ? "STUB" : "SKIP",
    cases: [
      {
        name: "Module works with external-network disabled",
        status: offlineRequired ? "STUB" : "SKIP",
        message: offlineRequired
          ? "TODO: Run module in sandboxed environment with network blocked and verify no fetch() errors"
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
function runMcpContractSuite(manifest: ModuleManifest): ContractSuiteResult {
  const tier = manifest.module.tier;
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
 * Run all contract test suites for the given module.
 *
 * Currently all suites return STUB status — this is the scaffold for future
 * implementation. Each suite logs what a real test would verify.
 *
 * @param manifest  Parsed and validated ModuleManifest from manifest.ts
 * @param moduleDir Path to the module root directory (for file access)
 */
export async function runContractTests(
  manifest: ModuleManifest,
  _moduleDir: string
): Promise<ContractTestResult> {
  const suites: ContractSuiteResult[] = [
    runAgentApiSuite(manifest),
    runMemoryApiSuite(manifest),
    runPermissionApiSuite(manifest),
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
