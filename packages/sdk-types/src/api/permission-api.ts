/**
 * @file api/permission-api.ts
 * Implementation skeleton for the AKARI Permission API.
 *
 * Phase 0 stub: T-2 requirement. Full implementation deferred to Phase 1.
 */

import type {
  PermissionAuditRecord,
  PermissionAPI,
} from "../permission.js"

/**
 * The Permission API for gating actions and checking permission status.
 * Methods for runtime permission checks with optional HITL (human-in-the-loop).
 */
export interface PermissionAPIImpl extends PermissionAPI {
  /**
   * Get audit log of all permission checks and gate decisions.
   */
  auditLog(): Promise<PermissionAuditRecord[]>
}

/**
 * Permission API implementation skeleton.
 * @throws {Error} "not implemented" — Phase 0 placeholder
 */
export function createPermissionAPI(): PermissionAPIImpl {
  return {
    async gate() {
      throw new Error(
        "Permission API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async request() {
      throw new Error(
        "Permission API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    check() {
      throw new Error(
        "Permission API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async revoke() {
      throw new Error(
        "Permission API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async auditLog() {
      throw new Error(
        "Permission API not implemented in Phase 0. Defer to Phase 1."
      )
    },
  }
}
