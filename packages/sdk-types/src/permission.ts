/**
 * @file permission.ts
 * Type definitions for the AKARI App SDK — Permission API.
 *
 * The Permission API enforces the Principle of Least Privilege.
 * Apps declare required scopes in `akari.toml [permissions]`.
 * At runtime, `permission.gate()` verifies the declaration and optionally
 * presents a Human-in-the-Loop (HITL) approval dialog to the user.
 *
 * Every `gate()` call (pass or deny) is automatically recorded in AMP
 * as a `"permission-grant"` or `"permission-deny"` record.
 *
 * @see https://github.com/Akari-OS/sdk/blob/main/docs/api-reference/permission-api.md
 */

// ---------------------------------------------------------------------------
// Scope type
// ---------------------------------------------------------------------------

/**
 * Typed permission scope used by all Permission API methods.
 *
 * | Pattern | Example | Meaning |
 * |---|---|---|
 * | `pool:read` | — | Read from Pool |
 * | `pool:write` | — | Write to Pool |
 * | `amp:read` | — | Read from AMP |
 * | `amp:write` | — | Write to AMP |
 * | `mcp:<tool>` | `mcp:x.post` | Call a specific MCP tool |
 * | `inter-app:<app-id>` | `inter-app:com.akari.video` | Handoff to an app |
 * | `network:<domain>` | `network:api.x.com` | HTTP to a domain |
 * | `oauth:<domain>` | `oauth:x.com` | OAuth flow for a service |
 * | `filesystem:read:<key>` | `filesystem:read:user-docs` | Read a path key |
 * | `filesystem:write:<key>` | `filesystem:write:exports` | Write a path key |
 */
export type PermissionScope =
  | `pool:${"read" | "write"}`
  | `amp:${"read" | "write"}`
  | `mcp:${string}`
  | `inter-app:${string}`
  | `network:${string}`
  | `oauth:${string}`
  | `filesystem:${"read" | "write"}:${string}`

// ---------------------------------------------------------------------------
// Gate options
// ---------------------------------------------------------------------------

/**
 * Options for `permission.gate()`.
 * Called immediately before any privileged operation.
 */
export interface PermissionGateOptions {
  /** The scope being checked. Must be declared in `akari.toml [permissions]`. */
  scope: PermissionScope

  /**
   * Human-readable explanation displayed in the approval dialog.
   * Be specific: e.g. `"Post draft to X: 'Hello, world...'"`.
   */
  reason: string

  /**
   * Whether to require explicit user approval via a HITL dialog.
   * - `true`  — irreversible operations (post, delete, send, charge)
   * - `false` — low-risk operations (pool read/write) allowed by policy
   */
  hitl: boolean

  /**
   * Preview type shown in the HITL dialog (only relevant when `hitl: true`).
   * Corresponds to Panel Schema v0 `action.hitl.preview`.
   */
  preview?: "text-summary" | "schedule-summary" | "diff" | "custom-markdown"

  /**
   * Markdown template for the `"custom-markdown"` preview type.
   * Required when `preview === "custom-markdown"`.
   */
  previewTemplate?: string
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Current permission status for a scope.
 * Returned by `permission.check()` and `permission.request()`.
 */
export interface PermissionStatus {
  /** The scope this status describes. */
  scope: PermissionScope

  /** Whether the scope is currently granted. */
  granted: boolean

  /**
   * Auto-approval policy selected by the user.
   * - `"always"` — auto-approve every time
   * - `"session"` — auto-approve for the current Shell session only
   * - `"ask"` — show the HITL dialog every time
   */
  policy: "always" | "session" | "ask"

  /** ISO 8601 timestamp when the grant was recorded. */
  grantedAt?: Date

  /**
   * ISO 8601 expiry for `policy: "session"` grants.
   * The grant is invalidated when the Shell session ends.
   */
  expiresAt?: Date
}

// ---------------------------------------------------------------------------
// Audit record
// ---------------------------------------------------------------------------

/**
 * Shape of the AMP record written automatically by the Core whenever
 * `permission.gate()` is called. Apps do not write this themselves.
 */
export interface PermissionAuditRecord {
  kind: "permission-grant" | "permission-deny"
  app_id: string
  scope: PermissionScope
  reason: string
  result: "granted" | "denied"
  policy: "always" | "session" | "ask"
  /** Whether the user confirmed through a HITL dialog. */
  hitl_confirmed: boolean
  timestamp: Date
  session_id: string
}

// ---------------------------------------------------------------------------
// PermissionAPI interface
// ---------------------------------------------------------------------------

/**
 * The `permission` object exported from `@akari-os/sdk`.
 */
export interface PermissionAPI {
  /**
   * Verify that the scope is declared and optionally require HITL approval.
   *
   * - Resolves when the operation is permitted.
   * - Throws `PermissionDeniedError` when denied, timed out, or not declared.
   */
  gate(options: PermissionGateOptions): Promise<void>

  /**
   * Request a new scope grant (e.g. OAuth initial authorisation).
   * Regardless of current grant status, the user is prompted.
   * Returns the resulting `PermissionStatus`.
   */
  request(scope: PermissionScope): Promise<PermissionStatus>

  /**
   * Synchronously check the current grant status without showing any UI.
   * Use this for enabling/disabling UI elements.
   */
  check(scope: PermissionScope): PermissionStatus

  /**
   * Revoke a previously granted scope.
   * For OAuth scopes, the Core notifies the MCP server to invalidate tokens.
   */
  revoke(scope: PermissionScope): Promise<void>
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Thrown by `permission.gate()` when the operation is not permitted.
 */
export class PermissionDeniedError extends Error {
  readonly scope: PermissionScope

  /**
   * Why the permission was denied.
   * - `"not-declared"` — scope missing from `akari.toml [permissions]`
   * - `"user-denied"` — user clicked Cancel in the HITL dialog
   * - `"policy-denied"` — automatic policy rejected the request
   * - `"timeout"` — HITL dialog timed out without a user response
   */
  readonly reason: "not-declared" | "user-denied" | "policy-denied" | "timeout"

  constructor(
    scope: PermissionScope,
    reason: "not-declared" | "user-denied" | "policy-denied" | "timeout",
  ) {
    super(`Permission denied for scope "${scope}": ${reason}`)
    this.name = "PermissionDeniedError"
    this.scope = scope
    this.reason = reason
  }
}
