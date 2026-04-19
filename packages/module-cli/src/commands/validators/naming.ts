/**
 * naming.ts — Module / Agent 命名規約 Lint (ADR-009 / ADR-011)
 *
 * Validates:
 *   1. [module] id — reverse-DNS format (AKARI-HUB-024 §6.7 / ADR-009)
 *   2. [agents.<role>] keys — <module-short-id>_<agent-role> snake_case (ADR-011)
 *   3. Agent roles do not collide with Core 7 reference defaults (ADR-011 §4)
 *
 * Reference:
 *   ADR-011-module-agent-naming-convention.md
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Core 7 reference default agent IDs.
 * No Module-supplied agent may use these exact strings as their full ID.
 * (ADR-011 §4)
 */
export const CORE_7_DEFAULTS = [
  "partner",
  "studio",
  "operator",
  "researcher",
  "guardian",
  "memory",
  "analyst",
] as const;

/**
 * Reverse-DNS module ID pattern.
 * Must be at least two components separated by dots.
 * E.g. com.akari.writer, com.third.pdf-reader
 * (AKARI-HUB-024 §6.7 guideline 1)
 */
const REVERSE_DNS_PATTERN = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9_-]+)+$/;

/**
 * snake_case pattern for agent role suffix.
 * Allows lowercase letters, digits, underscores.
 */
const SNAKE_CASE_PATTERN = /^[a-z][a-z0-9_]*$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NamingError {
  field: string;
  message: string;
  code: string;
}

export interface NamingLintResult {
  valid: boolean;
  errors: NamingError[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the module short-id from a reverse-DNS module id.
 * The short-id is the last segment, with kebab-case converted to snake_case.
 *
 * E.g.:
 *   "com.akari.writer"        → "writer"
 *   "com.third.pdf-reader"    → "pdf_reader"
 *   "com.corp.research-tool"  → "research_tool"
 *
 * (ADR-011 §1)
 */
export function extractModuleShortId(moduleId: string): string {
  const segments = moduleId.split(".");
  const last = segments[segments.length - 1];
  // kebab-case → snake_case
  return last.replace(/-/g, "_");
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/**
 * Validate [module] id field against reverse-DNS naming convention.
 */
export function validateModuleId(moduleId: unknown): NamingLintResult {
  const errors: NamingError[] = [];
  const warnings: string[] = [];

  if (typeof moduleId !== "string" || moduleId.trim() === "") {
    return {
      valid: false,
      errors: [{ field: "[module] id", message: "Module id must be a non-empty string", code: "INVALID_MODULE_ID_TYPE" }],
      warnings,
    };
  }

  if (!REVERSE_DNS_PATTERN.test(moduleId)) {
    errors.push({
      field: "[module] id",
      message: `Module id "${moduleId}" does not match reverse-DNS format. ` +
        `Must match: ^[a-z][a-z0-9]*(\\.[a-z][a-z0-9_-]+)+$ ` +
        `(e.g. "com.akari.writer", "com.corp.pdf-reader")`,
      code: "MODULE_ID_NOT_REVERSE_DNS",
    });
  }

  const dotCount = (moduleId.match(/\./g) ?? []).length;
  if (dotCount < 2) {
    warnings.push(
      `Module id "${moduleId}" has only ${dotCount + 1} component(s). ` +
        "Recommended: at least 3 components (e.g. com.<org>.<name>)"
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate all [agents] keys in a manifest.
 *
 * Each key must:
 *   1. Start with <module-short-id>_ prefix
 *   2. Be snake_case
 *   3. Not collide with Core 7 reference defaults (exact match)
 *
 * (ADR-011 §2, §4)
 */
export function validateAgentNames(
  moduleId: string,
  agents: Record<string, unknown>
): NamingLintResult {
  const errors: NamingError[] = [];
  const warnings: string[] = [];

  const shortId = extractModuleShortId(moduleId);
  const requiredPrefix = `${shortId}_`;

  for (const [agentKey, agentPath] of Object.entries(agents)) {
    const field = `[agents] ${agentKey}`;

    // Check Core 7 collision (exact match)
    if ((CORE_7_DEFAULTS as readonly string[]).includes(agentKey)) {
      errors.push({
        field,
        message: `Agent id "${agentKey}" collides with a Core 7 reference default. ` +
          `Core defaults: ${CORE_7_DEFAULTS.join(", ")}. Use "<module-short-id>_<role>" format.`,
        code: "AGENT_ID_CORE_COLLISION",
      });
      continue;
    }

    // Check prefix
    if (!agentKey.startsWith(requiredPrefix)) {
      errors.push({
        field,
        message: `Agent id "${agentKey}" must start with module short-id prefix "${requiredPrefix}". ` +
          `Expected format: "${shortId}_<role>" (ADR-011 §2). ` +
          `Example: "${shortId}_editor"`,
        code: "AGENT_ID_MISSING_PREFIX",
      });
    }

    // Check snake_case
    if (!SNAKE_CASE_PATTERN.test(agentKey)) {
      errors.push({
        field,
        message: `Agent id "${agentKey}" must be snake_case (lowercase letters, digits, underscores only). ADR-011 §1`,
        code: "AGENT_ID_NOT_SNAKE_CASE",
      });
    }

    // Validate spec file path is a string
    if (typeof agentPath !== "string") {
      errors.push({
        field,
        message: `Agent spec path for "${agentKey}" must be a string path to a .md file`,
        code: "AGENT_PATH_NOT_STRING",
      });
    } else if (!agentPath.endsWith(".md")) {
      warnings.push(`Agent spec "${agentKey}" points to "${agentPath}" — expected a .md file (Claude Code agent format)`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Top-level naming lint runner.
 * Pass the parsed manifest (already validated by manifest.ts).
 */
export function runNamingLint(manifest: {
  module: { id?: string };
  agents?: Record<string, unknown>;
}): NamingLintResult {
  const allErrors: NamingError[] = [];
  const allWarnings: string[] = [];

  // 1. Module ID
  const moduleIdResult = validateModuleId(manifest.module?.id);
  allErrors.push(...moduleIdResult.errors);
  allWarnings.push(...moduleIdResult.warnings);

  // 2. Agent names
  if (manifest.agents && typeof manifest.agents === "object" && manifest.module?.id) {
    const agentResult = validateAgentNames(
      manifest.module.id,
      manifest.agents as Record<string, unknown>
    );
    allErrors.push(...agentResult.errors);
    allWarnings.push(...agentResult.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
  };
}
