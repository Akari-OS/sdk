/**
 * @file context.ts
 * Type definitions for the AKARI Module SDK — Context API.
 *
 * The Context API (ACE — Agent Context Engineering) provides typed helpers
 * for assembling the context objects passed to Agent Runtime invocations.
 * It handles token-budget management, priority-based truncation, and
 * Lint checks for quality assurance.
 *
 * @see https://github.com/Akari-OS/sdk/blob/main/docs/api-reference/context-api.md
 */

// ---------------------------------------------------------------------------
// ContextItem kinds and sources
// ---------------------------------------------------------------------------

/**
 * Discriminates what kind of information a `ContextItem` represents.
 */
export type ContextItemKind =
  | "pool-item"      // Asset stored in Pool
  | "amp-memory"     // AMP record (decision / style / goal log)
  | "text-selection" // UI text range selection (Context Selection / Context Handoff)
  | "element-ref"    // UI element reference (Context Selection / Context Handoff)
  | "file-ref"       // File path reference
  | "image-region"   // Rectangular region of an image
  | "video-frame"    // Single video frame
  | "video-range"    // Time range within a video
  | "m2c-feature"    // M2C semantic feature extracted from media
  | "system-note"    // Module-supplied system annotation

/**
 * Describes where a `ContextItem`'s content originated.
 * Used by the SDK to resolve and fetch the actual content when building
 * the `AceContext`.
 */
export type ContextItemSource =
  | { type: "pool"; id: string }
  | { type: "amp"; filter: AmpQueryFilter }
  | { type: "handoff"; session_id: string }
  | { type: "selection"; app: string }
  | { type: "inline" }  // Module assembled the content directly

// ---------------------------------------------------------------------------
// ContextItem
// ---------------------------------------------------------------------------

/**
 * A single piece of context to include in an `AceContext`.
 * Pass an array of `ContextItem` to `context.build()`.
 */
export interface ContextItem {
  /**
   * Module-scoped unique identifier for this item.
   * Used by Lint to detect duplicates.
   */
  id: string

  /** What kind of information this item contains. */
  kind: ContextItemKind

  /** Where the content was sourced from. */
  source: ContextItemSource

  /**
   * Priority score in `[0.0, 1.0]`.
   * When the token budget is exceeded, items with lower scores are dropped
   * first. Use `1.0` for the current user instruction or active selection.
   *
   * Guidance:
   * - `1.0`    — must not be omitted (active instruction / selection)
   * - `0.8–0.9` — strongly relevant (top memories for this goal)
   * - `0.5–0.7` — useful reference (style preferences, older drafts)
   * - `0.1–0.4` — nice-to-have background
   */
  score: number

  /** The text representation passed to the LLM. */
  content: string

  /**
   * Goal reference.
   * **Required** — items without `goal_ref` fail the `context.lint()` check
   * with code `"MISSING_GOAL_REF"`.
   */
  goal_ref: string

  /** Human-readable label shown in the Shell context chip UI. */
  label?: string

  /** Kind-specific supplementary metadata. */
  meta?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Packed / built context
// ---------------------------------------------------------------------------

/**
 * A `ContextItem` that has been packed into the `AceContext` budget,
 * enriched with a `token_count` estimate.
 */
export interface PackedContextItem extends ContextItem {
  /** Estimated token count for this item. */
  token_count: number
}

/**
 * ACE-compliant context object.
 * Pass this as `options.context` to `agent.invoke()` or `agent.spawn()`.
 */
export interface AceContext {
  /** ACE protocol version. */
  ace_version: string

  /** Common goal reference for all items in this context. */
  goal_ref: string

  /** Items that fit within the token budget, sorted by score descending. */
  items: PackedContextItem[]

  /** Estimated total token count. */
  token_count: number

  /**
   * Number of items dropped because the budget was exceeded.
   * Non-zero means some lower-priority context was cut.
   */
  truncated_count: number

  /** ISO 8601 timestamp when this context was built. */
  timestamp: string
}

// ---------------------------------------------------------------------------
// context.select options
// ---------------------------------------------------------------------------

/**
 * Options for the automatic `context.select()` helper.
 * The SDK queries Pool and AMP for items relevant to `goal` and
 * returns a ready-to-use `AceContext`.
 */
export interface SelectOptions {
  /**
   * Goal reference. All collected items will be tagged with this ref.
   * **Required.**
   */
  goal_ref: string

  /**
   * Natural-language description of the current intent.
   * Used for semantic similarity search across Pool and AMP.
   */
  goal: string

  /**
   * Token budget for the resulting context.
   * @default 8000
   */
  budget?: number

  /**
   * Restrict collection to specific source types.
   * Omit to search all sources.
   */
  sources?: Array<"pool" | "amp" | "handoff" | "selection">

  /** Only include items of these kinds. */
  kinds?: ContextItemKind[]

  /**
   * Maximum number of candidate items before budget truncation.
   * @default 20
   */
  max_items?: number
}

// ---------------------------------------------------------------------------
// AMP query filter (used in ContextItemSource)
// ---------------------------------------------------------------------------

/**
 * Filter passed to AMP when resolving an `amp`-sourced `ContextItemSource`.
 */
export interface AmpQueryFilter {
  /** Filter by goal reference. */
  goal_ref?: string

  /** Filter by AMP record kind. */
  kind?: string

  /** ISO 8601 lower bound for record creation. */
  since?: string

  /** ISO 8601 upper bound for record creation. */
  until?: string
}

// ---------------------------------------------------------------------------
// Lint
// ---------------------------------------------------------------------------

/** Severity levels returned by `context.lint()`. */
export type LintSeverity = "error" | "warning"

/**
 * A single issue found by `context.lint()`.
 * `item_id: null` means the issue applies to the whole context.
 */
export interface LintIssue {
  /**
   * ID of the offending `ContextItem`, or `null` for context-level issues.
   */
  item_id: string | null

  severity: LintSeverity

  /**
   * Machine-readable code.
   * Common codes:
   * - `"MISSING_GOAL_REF"` — `goal_ref` is empty
   * - `"SENSITIVE_CONTENT"` — potential PII / credential pattern detected
   * - `"EMPTY_CONTENT"` — `content` is an empty string
   * - `"DUPLICATE_ID"` — two items share the same `id`
   * - `"INVALID_SCORE"` — `score` is outside `[0.0, 1.0]`
   */
  code: string

  /** Human-readable explanation. */
  message: string
}
