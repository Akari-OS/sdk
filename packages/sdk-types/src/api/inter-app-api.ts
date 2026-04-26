/**
 * @file api/inter-app-api.ts
 * Implementation skeleton for the AKARI Inter-App API.
 *
 * Phase 0 stub: T-2 requirement. Full implementation deferred to Phase 1.
 */

import type {
  HandoffRefs,
  HandoffHints,
} from "../inter-app.js"

/**
 * The Inter-App API for handoffs between Apps.
 * Methods for sending and receiving handoff payloads.
 */
export interface InterAppAPI {
  /**
   * Send a handoff to another App.
   * Only Pool / AMP IDs are transmitted; full payloads stay in-memory.
   */
  handoff(
    targetId: string,
    payload: { kind: string; ref: HandoffRefs; hints?: HandoffHints }
  ): Promise<{ accepted: boolean; response?: unknown }>

}

/**
 * Inter-App API implementation skeleton.
 * @throws {Error} "not implemented" — Phase 0 placeholder
 */
export function createInterAppAPI(): InterAppAPI {
  return {
    async handoff() {
      throw new Error(
        "Inter-App API not implemented in Phase 0. Defer to Phase 1."
      )
    },
  }
}
