/**
 * @file inter-app.ts
 * Type definitions for the AKARI Module SDK — Inter-App API.
 *
 * Modules communicate exclusively by passing **Pool / AMP IDs**.
 * Raw bytes and object references must never be included in a handoff payload.
 * Every handoff is automatically recorded in AMP for full traceability.
 *
 * @see https://github.com/Akari-OS/sdk/blob/main/docs/api-reference/inter-app-api.md
 */

// ---------------------------------------------------------------------------
// Handoff payload
// ---------------------------------------------------------------------------

/**
 * Pool / AMP ID references carried in a handoff.
 * Every value must be a Pool `ContentHash`, an AMP record ID, or an array
 * of the same. Raw bytes or plain objects are prohibited.
 *
 * The index signature allows Module-specific fields as long as they are IDs.
 */
export interface HandoffRefs {
  /** Generic Pool item IDs. */
  poolIds?: string[]

  /** Pool IDs for media assets (images, video, audio). */
  assets?: string[]

  /** Pool or AMP ID for the primary draft being handed off. */
  draft?: string

  /** A specific AMP record ID. */
  ampRecordId?: string

  /** AMP `goal_ref` to propagate to the receiving module. */
  goalRef?: string

  /** Module-specific ID fields. */
  [key: string]: string | string[] | undefined
}

/**
 * Optional hints to help the receiving Module interpret the handoff.
 * The receiving module is free to ignore any hint without breaking the flow.
 */
export interface HandoffHints {
  /**
   * Semantic action name for the receiver.
   * @example "post-to-x", "knowledge-base-entry"
   */
  intent?: string

  /**
   * Target integration or platform within the receiving module.
   * @example "google-sheets", "notion", "powerpoint"
   */
  targetOutlet?: string

  /**
   * Content format of the primary payload.
   * @example "markdown", "plain-text"
   */
  format?: string

  /** Additional module-specific hints. */
  [key: string]: unknown
}

/**
 * Payload sent via `module.handoff()`.
 *
 * Standard `kind` values (inter-operability baseline):
 * - `"publish-draft"` — Writer → Publishing module
 * - `"export-to-doc"` — Writer / Research → Documents module
 * - `"insert-to-slide"` — Video / Writer → Documents (PPT / Slides)
 * - `"append-to-sheet"` — Research / Analytics → Documents (Sheets / Excel)
 * - `"asset-ready"` — Asset Generation → Pool Browser / Writer
 * - `"translation-ready"` — Translation → Writer
 */
export interface HandoffPayload {
  /**
   * Identifies the purpose of the handoff.
   * Use kebab-case or snake_case.
   */
  kind: string

  /**
   * Pool / AMP ID references.
   * Never embed raw bytes or serialised objects here.
   */
  ref: HandoffRefs

  /** Optional hints for the receiver. */
  hints?: HandoffHints
}

// ---------------------------------------------------------------------------
// Handoff result (sender side)
// ---------------------------------------------------------------------------

/**
 * Result returned by `module.handoff()` on the sending side.
 */
export interface HandoffResult {
  /**
   * Final status of the handoff.
   * - `"accepted"` — receiver processed the payload successfully
   * - `"rejected"` — receiver returned `accept: false` (e.g. unsupported `kind`)
   * - `"pending"` — receiver queued the job and will complete asynchronously
   * - `"not-installed"` — target module is not installed on this device
   */
  status: "accepted" | "rejected" | "pending" | "not-installed"

  /** AMP record ID of the auto-logged handoff trace. */
  handoffId: string

  /**
   * Human-readable explanation, present when `status` is `"rejected"` or
   * `"not-installed"`.
   */
  reason?: string
}

// ---------------------------------------------------------------------------
// Incoming handoff (receiver side)
// ---------------------------------------------------------------------------

/**
 * Object delivered to the `HandoffHandler` on the receiving module.
 */
export interface IncomingHandoff {
  /** AMP record ID of this handoff event. */
  handoffId: string

  /** Module ID of the sender. */
  from: string

  /** Payload as sent by the sender. */
  payload: HandoffPayload

  /** ISO 8601 timestamp when the handoff was created. */
  timestamp: string
}

/**
 * Response the receiving module must return from its `HandoffHandler`.
 */
export interface HandoffResponse {
  /**
   * Whether the module accepted the handoff.
   * Return `false` (with a `reason`) for unsupported `kind` values or
   * when the referenced resources cannot be found.
   */
  accept: boolean

  /** Optional explanation shown to the user when `accept` is `false`. */
  reason?: string
}

/**
 * Handler function registered via `module.onHandoff()`.
 */
export type HandoffHandler = (
  handoff: IncomingHandoff
) => Promise<HandoffResponse>

// ---------------------------------------------------------------------------
// ModuleAPI interface
// ---------------------------------------------------------------------------

/**
 * The `module` object exported from `@akari-os/sdk`.
 * Provides the Inter-App handoff API.
 */
export interface ModuleAPI {
  /**
   * Send a handoff to another module.
   *
   * `targetId` accepts:
   * - A specific module ID: `"com.akari.x-sender"`
   * - A category selector: `"category:publishing"` — Core resolves the
   *   best-matching installed module, or prompts the user if there are
   *   multiple candidates.
   *
   * All handoffs are automatically recorded in AMP.
   * For external-network actions, call `permission.gate()` with `hitl: true`
   * **before** calling `handoff()`.
   */
  handoff(targetId: string, payload: HandoffPayload): Promise<HandoffResult>

  /**
   * Register a handler for incoming handoffs.
   * Only one handler per module is supported; calling this a second time
   * replaces the previous handler.
   */
  onHandoff(handler: HandoffHandler): void
}
