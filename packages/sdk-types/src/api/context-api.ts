/**
 * @file api/context-api.ts
 * Implementation skeleton for the AKARI Context API (ACE).
 *
 * Phase 0 stub: T-2 requirement. Full implementation deferred to Phase 1.
 */

import type {
  AceContext,
  ContextItem,
  LintIssue,
  SelectOptions,
  AmpQueryFilter,
} from "../context.js"

/**
 * The Context API for building ACE-compliant contexts.
 * Methods for assembling, validating, and optimizing context bundles.
 */
export interface ContextAPI {
  /**
   * Build an ACE context from sources (Pool / AMP / custom).
   */
  build(options: {
    intent: string
    goal_ref: string
    sources?: Array<{ kind: string; query?: string; filter?: AmpQueryFilter }>
  }): Promise<AceContext>

  /**
   * Lint a context for compliance with ACE spec.
   * Returns empty array if valid, array of issues if invalid.
   */
  lint(context: AceContext): Promise<LintIssue[]>

  /**
   * Reduce context size while preserving semantics (compression, truncation).
   */
  optimize(context: AceContext, maxTokens: number): Promise<AceContext>

  /**
   * Select a subset of context items by kind or query.
   */
  select(context: AceContext, options: SelectOptions): Promise<ContextItem[]>

  /**
   * Merge multiple contexts into one.
   */
  merge(...contexts: AceContext[]): Promise<AceContext>
}

/**
 * Context API implementation skeleton.
 * @throws {Error} "not implemented" — Phase 0 placeholder
 */
export function createContextAPI(): ContextAPI {
  return {
    async build() {
      throw new Error(
        "Context API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async lint() {
      throw new Error(
        "Context API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async optimize() {
      throw new Error(
        "Context API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async select() {
      throw new Error(
        "Context API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async merge() {
      throw new Error(
        "Context API not implemented in Phase 0. Defer to Phase 1."
      )
    },
  }
}
