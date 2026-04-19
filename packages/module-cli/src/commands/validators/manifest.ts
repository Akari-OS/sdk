/**
 * manifest.ts — akari.toml バリデータ (AKARI-HUB-024 §6.5)
 *
 * Parses and validates the Module Manifest (`akari.toml`) using @iarna/toml.
 * Validates required fields, tier-specific requirements, and SDK version range.
 *
 * Dependencies (add to package.json):
 *   @iarna/toml     — TOML parser
 *   zod             — schema validation (optional, we use manual checks here for zero-dep)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModuleTier = "full" | "mcp-declarative";

export interface ManifestModule {
  id: string;
  name: string;
  version?: string;
  author?: string;
  tier: ModuleTier;
  sdk?: string;
  category?: string;
}

export interface ManifestPermissions {
  pool?: string[];
  amp?: string[];
  "external-network"?: string[] | false;
  filesystem?: string[];
  oauth?: string[];
}

export interface ManifestPanel {
  title?: string;
  mount?: string;   // Full Tier: path to React component
  schema?: string;  // MCP-Declarative Tier: path to panel.schema.json
}

export interface ManifestMcp {
  server?: string;
  tools?: string[];
}

export interface ManifestAgents {
  [role: string]: string;
}

export interface ManifestSkillsExposed {
  [skillId: string]: string;
}

export interface ManifestSkillsImported {
  [skillId: string]: string;
}

export interface ManifestSkills {
  exposed?: ManifestSkillsExposed;
  imported?: ManifestSkillsImported;
}

export interface ModuleManifest {
  module: ManifestModule;
  permissions: ManifestPermissions;
  panels?: { [panelId: string]: ManifestPanel };
  mcp?: ManifestMcp;
  agents?: ManifestAgents;
  skills?: ManifestSkills;
}

// ---------------------------------------------------------------------------
// Validation Result
// ---------------------------------------------------------------------------

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ManifestValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  manifest?: ModuleManifest;
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

/**
 * Validate a parsed TOML object as a ModuleManifest.
 * Call parseToml() first, then pass the result here.
 */
export function validateManifest(raw: unknown): ManifestValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  if (typeof raw !== "object" || raw === null) {
    return {
      valid: false,
      errors: [{ field: "root", message: "Manifest is not an object", code: "MANIFEST_NOT_OBJECT" }],
      warnings,
    };
  }

  const data = raw as Record<string, unknown>;

  // ── [module] section ─────────────────────────────────────────────────────
  if (!data.module || typeof data.module !== "object") {
    errors.push({ field: "[module]", message: "Missing required [module] section", code: "MISSING_MODULE_SECTION" });
  } else {
    const mod = data.module as Record<string, unknown>;

    if (!mod.id || typeof mod.id !== "string") {
      errors.push({ field: "[module] id", message: "Missing required field: id", code: "MISSING_FIELD" });
    }
    if (!mod.name || typeof mod.name !== "string") {
      errors.push({ field: "[module] name", message: "Missing required field: name", code: "MISSING_FIELD" });
    }
    if (!mod.tier || typeof mod.tier !== "string") {
      errors.push({ field: "[module] tier", message: "Missing required field: tier", code: "MISSING_FIELD" });
    } else if (mod.tier !== "full" && mod.tier !== "mcp-declarative") {
      errors.push({
        field: "[module] tier",
        message: `Invalid tier "${mod.tier}". Must be "full" or "mcp-declarative"`,
        code: "INVALID_TIER",
      });
    }
    if (mod.sdk && typeof mod.sdk !== "string") {
      errors.push({ field: "[module] sdk", message: "Field sdk must be a string (semver range, e.g. '>=0.1.0 <1.0')", code: "INVALID_SDK_RANGE" });
    }
    if (!mod.category) {
      warnings.push("[module] category is missing — recommended for Marketplace categorisation");
    }
  }

  // ── [permissions] section ─────────────────────────────────────────────────
  if (!data.permissions || typeof data.permissions !== "object") {
    errors.push({ field: "[permissions]", message: "Missing required [permissions] section", code: "MISSING_PERMISSIONS_SECTION" });
  }

  // ── Tier-specific checks ──────────────────────────────────────────────────
  const tier = (data.module as Record<string, unknown>)?.tier as string | undefined;

  if (tier === "mcp-declarative") {
    // MCP-Declarative requires [mcp] server entry
    if (!data.mcp || typeof data.mcp !== "object") {
      errors.push({
        field: "[mcp]",
        message: "Tier 'mcp-declarative' requires a [mcp] section with server declaration",
        code: "MCP_DECLARATIVE_MISSING_MCP",
      });
    } else {
      const mcp = data.mcp as Record<string, unknown>;
      if (!mcp.server || typeof mcp.server !== "string") {
        errors.push({
          field: "[mcp] server",
          message: "Tier 'mcp-declarative' requires [mcp] server to be a string path or URL",
          code: "MCP_DECLARATIVE_MISSING_SERVER",
        });
      }
    }

    // MCP-Declarative panels must use schema (not mount)
    if (data.panels && typeof data.panels === "object") {
      for (const [panelId, panel] of Object.entries(data.panels as Record<string, unknown>)) {
        if (typeof panel === "object" && panel !== null) {
          const p = panel as Record<string, unknown>;
          if (p.mount) {
            errors.push({
              field: `[panels.${panelId}] mount`,
              message: "Tier 'mcp-declarative' panels must use 'schema' (path to panel.schema.json), not 'mount' (React component)",
              code: "MCP_DECLARATIVE_REACT_PANEL",
            });
          }
          if (!p.schema && !p.title) {
            warnings.push(`[panels.${panelId}] should declare a 'schema' path pointing to panel.schema.json`);
          }
        }
      }
    }
  }

  if (tier === "full") {
    // Full Tier should have at least one panel with a mount (React component)
    if (!data.panels || typeof data.panels !== "object" || Object.keys(data.panels as object).length === 0) {
      warnings.push("Tier 'full' typically declares at least one panel under [panels]");
    }
  }

  const valid = errors.length === 0;
  if (!valid) {
    return { valid, errors, warnings };
  }

  return {
    valid: true,
    errors: [],
    warnings,
    manifest: raw as unknown as ModuleManifest,
  };
}

/**
 * Parse a TOML string into a raw object.
 *
 * NOTE: Requires `@iarna/toml` at runtime.
 * Add to package.json dependencies: "@iarna/toml": "^2.2.5"
 */
export async function parseToml(tomlContent: string): Promise<unknown> {
  // Dynamic import to avoid hard dependency at module load time.
  // If @iarna/toml is not installed, this throws a clear error.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const TOML = require("@iarna/toml") as { parse: (s: string) => unknown };
    return TOML.parse(tomlContent);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Cannot find module")) {
      throw new Error(
        "Missing dependency: @iarna/toml is required. Add it to package.json:\n" +
          '  npm install @iarna/toml'
      );
    }
    throw err;
  }
}

/**
 * High-level helper: read, parse, and validate akari.toml from a directory.
 */
export async function loadAndValidateManifest(
  moduleDir: string
): Promise<ManifestValidationResult> {
  const fs = await import("fs/promises");
  const path = await import("path");

  const manifestPath = path.join(moduleDir, "akari.toml");

  let tomlContent: string;
  try {
    tomlContent = await fs.readFile(manifestPath, "utf-8");
  } catch {
    return {
      valid: false,
      errors: [
        {
          field: "akari.toml",
          message: `Cannot read akari.toml at ${manifestPath}`,
          code: "MANIFEST_NOT_FOUND",
        },
      ],
      warnings: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = await parseToml(tomlContent);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      valid: false,
      errors: [{ field: "akari.toml", message: `TOML parse error: ${msg}`, code: "TOML_PARSE_ERROR" }],
      warnings: [],
    };
  }

  return validateManifest(parsed);
}
