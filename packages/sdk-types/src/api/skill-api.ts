/**
 * @file api/skill-api.ts
 * Implementation skeleton for the AKARI Skill API.
 *
 * Phase 0 stub: T-2 requirement. Full implementation deferred to Phase 1.
 */

import type {
  SkillAPI,
} from "../skill.js"

/**
 * The Skill API for defining and invoking inter-App functions.
 * Typed RPC layer with JSON Schema validation.
 */
export interface SkillAPIImpl extends SkillAPI {
  // SkillAPI base methods: register / invoke / call
  // No additional methods in Phase 0
}

/**
 * Skill API implementation skeleton.
 * @throws {Error} "not implemented" — Phase 0 placeholder
 */
export function createSkillAPI(): SkillAPIImpl {
  return {
    register() {
      throw new Error(
        "Skill API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async invoke() {
      throw new Error(
        "Skill API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async call() {
      throw new Error(
        "Skill API not implemented in Phase 0. Defer to Phase 1."
      )
    },
  }
}
