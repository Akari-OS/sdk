/**
 * @file memory.ts
 * Type definitions for the AKARI App SDK — Memory API.
 *
 * The Memory API provides unified access to two persistence layers:
 * - **Pool** — Content-Addressed binary/text storage (blake3 hash IDs).
 * - **AMP** — Agent Memory Protocol: goal-linked decision and action records.
 *
 * Apps must NOT maintain their own databases.
 * All state must flow through Pool or AMP.
 *
 * @see https://github.com/Akari-OS/sdk/blob/main/docs/api-reference/memory-api.md
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

/**
 * Content-Addressed hash for a Pool item.
 * 64-character lowercase hex string (blake3, 256-bit).
 *
 * @example "d04b98f48e8f8bcc15c6ae5ac050801cd6dcfd428fb5f9e65c4e16e7807340fa"
 */
export type ContentHash = string

// ---------------------------------------------------------------------------
// Pool — input types
// ---------------------------------------------------------------------------

/**
 * Input for `pool.put()`.
 * Saves a binary or text asset to the Pool.
 */
export interface PoolPutInput {
  /** Asset bytes or UTF-8 text content. */
  bytes: Uint8Array | string

  /**
   * MIME type of the asset.
   * @example "text/markdown", "image/png"
   */
  mime: string

  /** Searchable tags for filtering. */
  tags?: string[]

  /** Arbitrary key-value metadata. */
  meta?: Record<string, unknown>

  /**
   * Pin the item in the Hot tier so it is never automatically demoted.
   * @default false
   */
  pinned?: boolean
}

// ---------------------------------------------------------------------------
// Pool — result types
// ---------------------------------------------------------------------------

/**
 * Full Pool item returned by `pool.get()`.
 */
export interface PoolItem {
  /** Content-Addressed ID. */
  id: ContentHash

  /** Raw bytes of the asset. */
  bytes: Uint8Array

  /** MIME type. */
  mime: string

  /** Tags attached at put time. */
  tags: string[]

  /** Arbitrary metadata. */
  meta: Record<string, unknown>

  /** Current storage tier. */
  tier: PoolTier

  /** Size in bytes. */
  sizeBytes: number

  /** ISO 8601 creation timestamp. */
  createdAt: string

  /** ISO 8601 timestamp of the last access. */
  lastAccessed: string

  /** Whether the item is pinned in the Hot tier. */
  pinned: boolean
}

/** Pool storage tier. */
export type PoolTier = "hot" | "warm" | "cold"

// ---------------------------------------------------------------------------
// Pool — search
// ---------------------------------------------------------------------------

/**
 * Query parameters for `pool.search()`.
 */
export interface PoolSearchQuery {
  /**
   * Natural-language semantic search query.
   * Omit to rely solely on `mime`, `tags`, or `tiers` filters.
   */
  q?: string

  /** Filter by MIME type (OR semantics). */
  mime?: string[]

  /** Filter by tags (AND semantics — item must have all listed tags). */
  tags?: string[]

  /** Restrict results to specific tiers. */
  tiers?: PoolTier[]

  /**
   * Maximum number of results.
   * @default 20
   */
  limit?: number

  /** ISO 8601 lower bound for `createdAt`. */
  after?: string

  /** ISO 8601 upper bound for `createdAt`. */
  before?: string
}

/**
 * A single result entry from `pool.search()`.
 * Does not include `bytes` — call `pool.get(id)` to fetch the full item.
 */
export interface PoolSearchResult {
  /** Content-Addressed ID. */
  id: ContentHash

  /** MIME type. */
  mime: string

  /** Tags. */
  tags: string[]

  /** Metadata. */
  meta: Record<string, unknown>

  /** Storage tier at search time. */
  tier: PoolTier

  /** Size in bytes. */
  sizeBytes: number

  /**
   * Semantic similarity score in the range `[0.0, 1.0]`.
   * Only meaningful when `q` was provided.
   */
  score: number

  /** ISO 8601 creation timestamp. */
  createdAt: string
}

// ---------------------------------------------------------------------------
// AMP — kinds
// ---------------------------------------------------------------------------

/**
 * Memory kind (category) for AMP records.
 *
 * Built-in kinds map to AMP spec memory types:
 * - `goal`, `plan`, `decision`, `error` → `episodic`
 * - `publish-action`, `research-result`, `style-preference` → `semantic`
 * - `working` → `working` (auto-decays at session end)
 *
 * Custom kinds must use the form `"<app-id>.<event-name>"`.
 * @example "com.myorg.myapp.custom-event"
 */
export type AmpKind =
  | "goal"
  | "plan"
  | "publish-action"
  | "research-result"
  | "decision"
  | "style-preference"
  | "error"
  | "working"
  | (string & Record<never, never>) // open for custom kinds

// ---------------------------------------------------------------------------
// AMP — record input
// ---------------------------------------------------------------------------

/**
 * Input for `amp.record()`.
 * All records **must** include `goal_ref`.
 */
export interface AmpRecordInput {
  /**
   * Memory kind. Determines decay half-life and AMP spec `type` mapping.
   * @see {@link AmpKind}
   */
  kind: AmpKind

  /** Natural-language description of the memory. */
  content: string

  /**
   * Goal reference — links this record to a goal or session.
   * Use App ID (`"com.akari.writer"`) or session ID (`"session-2026-04-19"`).
   * **Required** — records without `goal_ref` are rejected with `MEMORY_GOAL_REF_REQUIRED`.
   */
  goal_ref: string

  /**
   * Initial confidence score in `[0.0, 1.0]`.
   * Defaults are applied per `kind` when omitted.
   * - Direct user statement: ~0.9
   * - Agent observation: ~0.8
   * - Tool result: ~0.7
   * - Inference: ~0.5
   */
  confidence?: number

  /** Pool item IDs that this memory references. */
  pool_refs?: ContentHash[]

  /** Searchable tags. */
  tags?: string[]

  /** Arbitrary metadata. */
  meta?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// AMP — stored record
// ---------------------------------------------------------------------------

/**
 * Fully materialised AMP record returned by `amp.record()` and `amp.query()`.
 */
export interface AmpRecord {
  /** UUID v7 (time-sortable). */
  id: string

  kind: AmpKind
  content: string
  goal_ref: string
  confidence: number

  /**
   * Provenance chain — who created this record and how.
   * Conforms to AMP spec §4.2.
   */
  provenance: {
    agent: { id: string; name: string; platform: string }
    source: { kind: string; confidence: number }
    sessionId?: string
    chain?: Array<{
      timestamp: string
      operation: string
      agent: { id: string; name: string }
      description?: string
    }>
  }

  pool_refs: ContentHash[]
  tags: string[]

  /** ISO 8601 creation timestamp. */
  createdAt: string

  /** ISO 8601 last-update timestamp. */
  updatedAt: string

  /** Lifecycle status. */
  status: "active" | "consolidated" | "archived"
}

// ---------------------------------------------------------------------------
// AMP — query
// ---------------------------------------------------------------------------

/**
 * Query parameters for `amp.query()`.
 */
export interface AmpQueryInput {
  /** Filter by kind (single or multiple). */
  kind?: AmpKind | AmpKind[]

  /** Filter by goal reference. */
  goal_ref?: string

  /** Natural-language semantic search query. */
  q?: string

  /** Filter by tags. */
  tags?: string[]

  /**
   * Minimum confidence threshold.
   * @default 0.3
   */
  minConfidence?: number

  /** ISO 8601 lower bound for `createdAt`. */
  after?: string

  /** ISO 8601 upper bound for `createdAt`. */
  before?: string

  /**
   * Maximum number of records returned.
   * @default 10
   */
  limit?: number
}

/**
 * Result set from `amp.query()`.
 */
export interface AmpQueryResult {
  /** Records with their relevance scores. */
  records: ScoredAmpRecord[]

  /** Total count matching the query (may exceed `limit`). */
  totalCount: number

  /** Query execution time in milliseconds. */
  durationMs: number
}

/**
 * An AMP record paired with a relevance score from `amp.query()`.
 */
export interface ScoredAmpRecord {
  record: AmpRecord
  /**
   * Query relevance in `[0.0, 1.0]`.
   * Combines semantic similarity and `goal_ref` match weight.
   */
  relevance: number
}

// ---------------------------------------------------------------------------
// Pool provider info
// ---------------------------------------------------------------------------

/**
 * Runtime information about the current Pool backend.
 * Returned by `pool.providerInfo()`.
 */
export interface PoolProviderInfo {
  /** Provider name. */
  name: "local" | "akari-cloud" | "google-drive" | "lark-drive" | "s3" | string

  /** Whether the Hot tier is available offline. */
  offlineOk: boolean

  /** Physical location of the Hot tier. */
  locality: "local" | "remote"
}

/**
 * Runtime information about the current AMP backend.
 * Returned by `amp.providerInfo()`.
 */
export interface AmpProviderInfo {
  /** Provider name. */
  name: "local" | "akari-cloud" | string

  /** AMP protocol version. */
  protocolVersion: string

  /** Available search / retrieval strategies. */
  strategies: string[]
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * Error thrown by Pool and AMP operations.
 * Numeric codes correspond to AMP spec §14 JSON-RPC error codes.
 */
export class MemoryError extends Error {
  readonly code: MemoryErrorCode
  readonly data?: Record<string, unknown>

  constructor(message: string, code: MemoryErrorCode, data?: Record<string, unknown>) {
    super(message)
    this.name = "MemoryError"
    this.code = code
    this.data = data
  }
}

/**
 * Error codes for the Memory API.
 * Numeric values follow the AMP spec §14 JSON-RPC error code table.
 */
export enum MemoryErrorCode {
  /** `-34001` Pool item or AMP record not found. */
  NotFound = -34001,
  /** `-34002` Access denied to another App's private memory. */
  PermissionDenied = -34002,
  /** `-34003` Record confidence is below `minConfidence`. */
  ConfidenceTooLow = -34003,
  /** `-34004` Requested search strategy is unavailable. */
  StrategyUnavailable = -34004,
  /** `-34005` Duplicate content detected. */
  Duplicate = -34005,
  /** `"MEM-001"` Cold backend offline; rehydration impossible. */
  TierUnavailable = "MEM-001",
  /** `"MEM-002"` `amp.record()` called without `goal_ref`. */
  GoalRefRequired = "MEM-002",
  /** `"MEM-003"` Cold-to-Hot rehydration timed out. */
  RehydrationTimeout = "MEM-003",
}
