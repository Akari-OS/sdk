/**
 * @file manifest.ts
 * Type definitions for the AKARI App Manifest (`akari.toml`).
 *
 * The manifest is the single source of truth for an App's identity,
 * tier, SDK compatibility range, permissions, panels, agents, and skills.
 * It is validated by the Core at install and launch time.
 *
 * @see https://github.com/Akari-OS/sdk/blob/main/docs/api-reference/
 */

// ---------------------------------------------------------------------------
// App section
// ---------------------------------------------------------------------------

/**
 * `[app]` section of `akari.toml`.
 * Declares identity and compatibility metadata.
 */
export interface AppSection {
  /**
   * Reverse-domain App ID.
   * @example "com.akari.writer", "com.x.sender"
   */
  id: string

  /** Human-readable display name. */
  name: string

  /**
   * Semantic version of this App release.
   * @example "0.1.0"
   */
  version: string

  /**
   * Author or organisation name.
   * @example "Akari", "My Company"
   */
  author?: string

  /**
   * App tier.
   * - `"full"` — React Panel + full Agent / Skill API access
   * - `"mcp-declarative"` — MCP server + `panel.schema.json` only
   * @default "full"
   */
  tier: AppTier

  /**
   * Core SDK compatibility range (semver range string).
   * The Core rejects the App when the installed SDK version is outside
   * this range.
   * @example ">=0.1.0 <1.0"
   */
  sdk: string

  /**
   * Short display name used where horizontal space is constrained
   * (e.g. ActivityBar タブ幅)。
   * @example "Writer", "Video", "Sheets"
   */
  short_name?: string

  /**
   * lucide-react のアイコン名（ActivityBar 表示用）。
   * Shell 側の whitelist（akari-shell/src/lib/app-icon.ts）への事前登録が必要。
   * @example "PenLine", "Film", "BarChart3"
   */
  icon?: string

  /**
   * Marketplace カテゴリ。Core 11 固定値（ADR-013 / HUB-005）
   * または `"x-<slug>"` 拡張パターン。
   * @example "studio", "publishing", "x-education"
   */
  category?: string

  /**
   * Shell AppLayout のペイン構成プロファイル（Full Tier のみ）。
   * - `"studio"` — 4 ペイン構成
   * - `"compact"` — 2 分割構成
   * `akari app create` のスキャフォールドが出力するフィールド（AKARI-HUB-088）。
   * @default "studio"
   */
  profile?: "studio" | "compact"

  /**
   * ロケール別の表示名・説明（`[app.i18n]` サブテーブル）。
   */
  i18n?: AppI18nSection
}

/** App tier declaration. */
export type AppTier = "full" | "mcp-declarative"

/**
 * `[app.i18n]` section of `akari.toml`.
 * ロケール別の表示名・説明。実運用の akari.toml では既定ロケール（英語）の
 * `description` もこのテーブル配下に置く慣習になっている
 * （例: `akari-writer/akari.toml`, `akari-video/akari.toml` 等）。
 */
export interface AppI18nSection {
  /** 日本語の表示名。 */
  name_ja?: string

  /** 日本語の短縮表示名。 */
  short_name_ja?: string

  /** 既定ロケールの説明文（Marketplace 掲載用）。 */
  description?: string

  /** 日本語の説明文。 */
  description_ja?: string
}

// ---------------------------------------------------------------------------
// Permissions section
// ---------------------------------------------------------------------------

/**
 * `[permissions]` section of `akari.toml`.
 * Declares every scope the App may request at runtime.
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
   * - `false`: offline-only app (external network forbidden)
   */
  "external-network"?: string[] | false

  /**
   * OAuth provider domains.
   * @example ["x.com", "notion.com"]
   */
  oauth?: string[]

  /**
   * MCP tool names the App is allowed to call.
   * @example ["x.post", "x.schedule"]
   */
  mcp?: string[]

  /**
   * App IDs this App is allowed to send handoffs to.
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
 * Required for `tier = "mcp-declarative"` Apps.
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
 * Declares the named panels this App provides.
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
 * Key format: `<app-short-id>_<role>` (snake_case, ADR-011).
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
   * Skills this App exposes to other Apps.
   * Key: fully-qualified Skill ID. Value: path to implementation file.
   * @example { "writer.generate_draft": "skills/generate-draft.ts" }
   */
  exposed?: Record<string, string>

  /**
   * Skills this App consumes from other Apps.
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
  /** App identity and compatibility. */
  app: AppSection

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
