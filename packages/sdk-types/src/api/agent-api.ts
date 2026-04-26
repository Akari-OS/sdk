/**
 * @file api/agent-api.ts
 * Implementation skeleton for the AKARI Agent API.
 *
 * Phase 0 stub: T-2 requirement. Full implementation deferred to Phase 1.
 */

import type {
  AgentId,
  AgentSpec,
  AgentInvokeOptions,
  AgentInvokeResult,
  SpawnHandle,
  SpawnContext,
  AgentEventHandler,
} from "../agent.js"

/**
 * The Agent API for App development.
 * Methods for registering App-supplied agents and invoking them.
 */
export interface AgentAPI {
  /**
   * Register an App-supplied agent with the Agent Runtime.
   */
  register(id: AgentId, spec: AgentSpec): Promise<void>

  /**
   * Invoke an agent synchronously (blocking until response).
   */
  invoke(
    agentId: AgentId,
    prompt: string,
    options?: AgentInvokeOptions
  ): Promise<AgentInvokeResult>

  /**
   * Spawn an agent asynchronously (non-blocking).
   * Returns a handle to poll or await the result.
   */
  spawn(
    agentId: AgentId,
    prompt: string,
    context?: SpawnContext
  ): Promise<SpawnHandle>

  /**
   * Subscribe to agent runtime events (e.g., agent start, finish, error).
   */
  on(eventType: string, handler: AgentEventHandler): () => void

  /**
   * Get current list of registered agents (both Core reference and App-supplied).
   */
  listAgents(): Promise<Array<{ id: AgentId; persona: string }>>
}

/**
 * Agent API implementation skeleton.
 * @throws {Error} "not implemented" — Phase 0 placeholder
 */
export function createAgentAPI(): AgentAPI {
  return {
    async register() {
      throw new Error(
        "Agent API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async invoke() {
      throw new Error(
        "Agent API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async spawn() {
      throw new Error(
        "Agent API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    on() {
      throw new Error(
        "Agent API not implemented in Phase 0. Defer to Phase 1."
      )
    },
    async listAgents() {
      throw new Error(
        "Agent API not implemented in Phase 0. Defer to Phase 1."
      )
    },
  }
}
