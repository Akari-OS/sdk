/**
 * naming.ts — App / Agent 命名規約 Lint (ADR-009 / ADR-011)
 *
 * Validates:
 *   1. [app] id — reverse-DNS format (AKARI-HUB-024 §6.7 / ADR-009)
 *   2. [agents.<role>] keys — <app-short-id>_<agent-role> snake_case (ADR-011)
 *   3. Agent roles do not collide with Core 7 reference defaults (ADR-011 §4)
 *
 * Reference:
 *   ADR-011-app-agent-naming-convention.md
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Core 7 reference default agent IDs.
 * No App-supplied agent may use these exact strings as their full ID.
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
 * Reverse-DNS app ID pattern.
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
 * Extract the app short-id from a reverse-DNS app id.
 * The short-id is the last segment, with kebab-case converted to snake_case.
 *
 * E.g.:
 *   "com.akari.writer"        → "writer"
 *   "com.third.pdf-reader"    → "pdf_reader"
 *   "com.corp.research-tool"  → "research_tool"
 *
 * (ADR-011 §1)
 */
export function extractAppShortId(appId: string): string {
  const segments = appId.split(".");
  const last = segments[segments.length - 1];
  // kebab-case → snake_case
  return last.replace(/-/g, "_");
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/**
 * Validate [app] id field against reverse-DNS naming convention.
 */
export function validateAppId(appId: unknown): NamingLintResult {
  const errors: NamingError[] = [];
  const warnings: string[] = [];

  if (typeof appId !== "string" || appId.trim() === "") {
    return {
      valid: false,
      errors: [{ field: "[app] id", message: "App id must be a non-empty string", code: "INVALID_APP_ID_TYPE" }],
      warnings,
    };
  }

  if (!REVERSE_DNS_PATTERN.test(appId)) {
    errors.push({
      field: "[app] id",
      message: `App id "${appId}" does not match reverse-DNS format. ` +
        `Must match: ^[a-z][a-z0-9]*(\\.[a-z][a-z0-9_-]+)+$ ` +
        `(e.g. "com.akari.writer", "com.corp.pdf-reader")`,
      code: "APP_ID_NOT_REVERSE_DNS",
    });
  }

  const dotCount = (appId.match(/\./g) ?? []).length;
  if (dotCount < 2) {
    warnings.push(
      `App id "${appId}" has only ${dotCount + 1} component(s). ` +
        "Recommended: at least 3 components (e.g. com.<org>.<name>)"
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate all [agents] keys in a manifest.
 *
 * Each key must:
 *   1. Start with <app-short-id>_ prefix
 *   2. Be snake_case
 *   3. Not collide with Core 7 reference defaults (exact match)
 *
 * (ADR-011 §2, §4)
 */
export function validateAgentNames(
  appId: string,
  agents: Record<string, unknown>
): NamingLintResult {
  const errors: NamingError[] = [];
  const warnings: string[] = [];

  const shortId = extractAppShortId(appId);
  const requiredPrefix = `${shortId}_`;

  for (const [agentKey, agentPath] of Object.entries(agents)) {
    const field = `[agents] ${agentKey}`;

    // Check Core 7 collision (exact match)
    if ((CORE_7_DEFAULTS as readonly string[]).includes(agentKey)) {
      errors.push({
        field,
        message: `Agent id "${agentKey}" collides with a Core 7 reference default. ` +
          `Core defaults: ${CORE_7_DEFAULTS.join(", ")}. Use "<app-short-id>_<role>" format.`,
        code: "AGENT_ID_CORE_COLLISION",
      });
      continue;
    }

    // Check prefix
    if (!agentKey.startsWith(requiredPrefix)) {
      errors.push({
        field,
        message: `Agent id "${agentKey}" must start with app short-id prefix "${requiredPrefix}". ` +
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
  app: { id?: string };
  agents?: Record<string, unknown>;
}): NamingLintResult {
  const allErrors: NamingError[] = [];
  const allWarnings: string[] = [];

  // 1. App ID
  const appIdResult = validateAppId(manifest.app?.id);
  allErrors.push(...appIdResult.errors);
  allWarnings.push(...appIdResult.warnings);

  // 2. Agent names
  if (manifest.agents && typeof manifest.agents === "object" && manifest.app?.id) {
    const agentResult = validateAgentNames(
      manifest.app.id,
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
