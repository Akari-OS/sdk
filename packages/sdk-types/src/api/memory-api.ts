/**
 * @file api/memory-api.ts
 * Implementation skeleton for the AKARI Memory API (Pool + AMP).
 *
 * Phase 0 stub: T-2 requirement. Full implementation deferred to Phase 1.
 */

import type {
  ContentHash,
  PoolPutInput,
  PoolItem,
  PoolSearchQuery,
  PoolSearchResult,
  AmpRecordInput,
  AmpRecord,
  AmpQueryInput,
  AmpQueryResult,
} from "../memory.js"

/**
 * Pool API — content-addressed storage for assets.
 */
export interface PoolAPI {
  /**
   * Store an item in the Pool (content-addressed).
   */
  put(input: PoolPutInput): Promise<ContentHash>

  /**
   * Retrieve an item from the Pool by its hash.
   */
  get(hash: ContentHash): Promise<PoolItem | null>

  /**
   * Search the Pool for items matching a query.
   */
  search(query: PoolSearchQuery): Promise<PoolSearchResult>

  /**
   * Delete an item from the Pool.
   */
  delete(hash: ContentHash): Promise<void>

  /**
   * List all items in a given tier (hot / warm / cold).
   */
  list(tier: string): Promise<PoolItem[]>
}

/**
 * AMP API — agent memory persistence and goal tracking.
 */
export interface AmpAPI {
  /**
   * Record a memory entry tied to a goal.
   */
  record(input: AmpRecordInput): Promise<AmpRecord>

  /**
   * Query memory entries by goal_ref and optional filters.
   */
  query(input: AmpQueryInput): Promise<AmpQueryResult>

  /**
   * Delete a memory entry.
   */
  delete(recordId: string): Promise<void>

  /**
   * Get statistics about memory usage.
   */
  stats(): Promise<{ total: number; byGoal: Record<string, number> }>
}

/**
 * The unified Memory API (Pool + AMP).
 */
export interface MemoryAPI {
  pool: PoolAPI
  amp: AmpAPI
}

/**
 * Memory API implementation skeleton.
 * @throws {Error} "not implemented" — Phase 0 placeholder
 */
export function createMemoryAPI(): MemoryAPI {
  const pool: PoolAPI = {
    async put() {
      throw new Error(
        "Memory API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async get() {
      throw new Error(
        "Memory API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async search() {
      throw new Error(
        "Memory API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async delete() {
      throw new Error(
        "Memory API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async list() {
      throw new Error(
        "Memory API not implemented in Phase 0. Defer to Phase 1."
      )
    },
  }

  const amp: AmpAPI = {
    async record() {
      throw new Error(
        "Memory API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async query() {
      throw new Error(
        "Memory API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async delete() {
      throw new Error(
        "Memory API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async stats() {
      throw new Error(
        "Memory API not implemented in Phase 0. Defer to Phase 1."
      )
    },
  }

  return { pool, amp }
}
