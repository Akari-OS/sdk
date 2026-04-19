/**
 * @file manifest.ts
 * Type definitions for the AKARI Module Manifest (`akari.toml`).
 *
 * The manifest is the single source of truth for a Module's identity,
 * tier, SDK compatibility range, permissions, panels, agents, and skills.
 * It is validated by the Core at install and launch time.
 *
 * @see https://github.com/Akari-OS/sdk/blob/main/docs/api-reference/
 */

// ---------------------------------------------------------------------------
// Module section
// ---------------------------------------------------------------------------

/**
 * `[module]` section of `akari.toml`.
 * Declares identity and compatibility metadata.
 */
export interface ModuleSection {
  /**
   * Reverse-domain Module ID.
   * @example "com.akari.writer", "com.x.sender"
   */
  id: string

  /** Human-readable display name. */
  name: string

  /**
   * Semantic version of this Module release.
   * @example "0.1.0"
   */
  version: string

  /**
   * Author or organisation name.
   * @example "Akari", "My Company"
   */
  author?: string

  /**
   * Module tier.
   * - `"full"` — React Panel + full Agent / Skill API access
   * - `"mcp-declarative"` — MCP server + `panel.schema.json` only
   * @default "full"
   */
  tier: ModuleTier

  /**
   * Core SDK compatibility range (semver range string).
   * The Core rejects the Module when the installed SDK version is outside
   * this range.
   * @example ">=0.1.0 <1.0"
   */
  sdk: string
}

/** Module tier declaration. */
export type ModuleTier = "full" | "mcp-declarative"

// ---------------------------------------------------------------------------
// Permissions section
// ---------------------------------------------------------------------------

/**
 * `[permissions]` section of `akari.toml`.
 * Declares every scope the Module may request at runtime.
 * Requesting an undeclared scope causes an immediate `PermissionDeniedError`.
 */
export interface PermissionsSection {
  /**
   * Pool access.
   * - `["read"]` — read-only
   * - `["write"]` — write-only
   * - `["read", "write"]` — both
   */
  pool?: Array<"read" | "write">

  /** AMP access. Same values as `pool`. */
  amp?: Array<"read" | "write">

  /**
   * Allowed external network domains.
   * - String array: `["api.x.com", "upload.x.com"]`
   * - `false`: offline-only module (external network forbidden)
   */
  "external-network"?: string[] | false

  /**
   * OAuth provider domains.
   * @example ["x.com", "notion.com"]
   */
  oauth?: string[]

  /**
   * MCP tool names the Module is allowed to call.
   * @example ["x.post", "x.schedule"]
   */
  mcp?: string[]

  /**
   * Module IDs this Module is allowed to send handoffs to.
   * @example ["com.akari.video"]
   */
  "inter-app"?: string[]

  /**
   * Filesystem path keys.
   * Format: `"read:<key>"` or `"write:<key>"`.
   * @example ["read:user-docs"]
   */
  filesystem?: string[]
}

// ---------------------------------------------------------------------------
// MCP section (MCP-Declarative Tier only)
// ---------------------------------------------------------------------------

/**
 * `[mcp]` section of `akari.toml`.
 * Required for `tier = "mcp-declarative"` Modules.
 */
export interface McpSection {
  /**
   * Path to the bundled MCP server binary or script,
   * or a remote URL for cloud-hosted MCP servers.
   * @example "mcp-servers/x-sender"
   */
  server: string

  /**
   * MCP tool names exposed by this server.
   * Must match `permissions.mcp` entries.
   */
  tools: string[]
}

// ---------------------------------------------------------------------------
// Panels section
// ---------------------------------------------------------------------------

/**
 * `[panels]` section of `akari.toml`.
 * Declares the named panels this Module provides.
 *
 * Each key is a panel alias (e.g. `"main"`, `"settings"`).
 *
 * Full Tier example:
 * ```toml
 * [panels]
 * main = { title = "Writer", mount = "panels/writer.tsx" }
 * ```
 *
 * MCP-Declarative Tier example:
 * ```toml
 * [panels]
 * main = { title = "X Sender", schema = "panels/x-sender.schema.json" }
 * ```
 */
export type PanelsSection = Record<string, PanelDeclaration>

/**
 * A single panel declaration in `[panels]`.
 */
export interface PanelDeclaration {
  /** Panel display title. */
  title: string

  /**
   * React component entry file (Full Tier panels).
   * @example "panels/writer.tsx"
   */
  mount?: string

  /**
   * Panel Schema JSON file path (MCP-Declarative Tier panels).
   * @example "panels/x-sender.schema.json"
   */
  schema?: string
}

// ---------------------------------------------------------------------------
// Agents section
// ---------------------------------------------------------------------------

/**
 * `[agents]` section of `akari.toml` (Full Tier only).
 * Maps agent IDs to their spec file paths.
 *
 * Key format: `<module-short-id>_<role>` (snake_case, ADR-011).
 *
 * @example
 * ```toml
 * [agents]
 * writer_editor = "agents/editor.md"
 * writer_reviewer = "agents/reviewer.md"
 * ```
 */
export type AgentsSection = Record<string, string>

// ---------------------------------------------------------------------------
// Skills section
// ---------------------------------------------------------------------------

/**
 * `[skills]` section of `akari.toml`.
 */
export interface SkillsSection {
  /**
   * Skills this Module exposes to other Modules.
   * Key: fully-qualified Skill ID. Value: path to implementation file.
   * @example { "writer.generate_draft": "skills/generate-draft.ts" }
   */
  exposed?: Record<string, string>

  /**
   * Skills this Module consumes from other Modules.
   * Key: Skill ID. Value: semver range string.
   * @example { "pool.search": ">=0.1", "m2c.extract_features": ">=0.1" }
   */
  imported?: Record<string, string>
}

// ---------------------------------------------------------------------------
// Full manifest
// ---------------------------------------------------------------------------

/**
 * Complete representation of an `akari.toml` manifest file.
 * Used for programmatic reading, validation, and scaffolding.
 */
export interface Manifest {
  /** Module identity and compatibility. */
  module: ModuleSection

  /** Declared permission scopes. */
  permissions?: PermissionsSection

  /** MCP server binding (MCP-Declarative Tier only). */
  mcp?: McpSection

  /** Panel declarations. */
  panels?: PanelsSection

  /** Agent declarations (Full Tier only). */
  agents?: AgentsSection

  /** Skill declarations. */
  skills?: SkillsSection
}
