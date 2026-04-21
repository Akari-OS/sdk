/**
 * @file agent.ts
 * Type definitions for the AKARI App SDK — Agent API.
 *
 * App developers use `agent.register()`, `agent.invoke()`, and
 * `agent.spawn()` to interact with the Agent Runtime inside AKARI Core.
 * All agents are ephemeral: they start on demand and vanish after responding.
 * State must always be persisted via the Memory API (Pool / AMP).
 *
 * @see https://github.com/Akari-OS/sdk/blob/main/docs/api-reference/agent-api.md
 */

import type { AceContext } from "./context.js"
import type { AkariError, AkariErrorCode } from "./errors.js"

// ---------------------------------------------------------------------------
// Agent IDs
// ---------------------------------------------------------------------------

/**
 * App-supplied agent ID.
 * Must follow the pattern `<app-short-id>_<role>` in snake_case (ADR-011).
 *
 * @example "writer_editor", "pdf_reader_extractor"
 */
export type AgentId = string

/**
 * Core reference defaults — the seven built-in agents every App can call.
 * These IDs are reserved and cannot be used as App agent IDs.
 */
export type ReferenceDefaultId =
  | "partner"
  | "analyst"
  | "researcher"
  | "guardian"
  | "memoriist"
  | "operator"

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/**
 * Specification passed to `agent.register()` when registering an
 * App-supplied agent with the Agent Runtime.
 */
export interface AgentSpec {
  /**
   * Short description of the agent's role.
   * Used as the foundation for the system prompt.
   */
  persona: string

  /**
   * Path to the agent spec file inside `agents/` (relative to app root).
   * Must be a `*.md` file following the Claude Code agent format.
   */
  specFile: string

  /** MCP tool IDs the agent is allowed to call. */
  tools?: string[]

  /**
   * LLM model identifier.
   * Defaults to the Core global default when omitted.
   * @example "claude-sonnet-4-6"
   */
  model?: string

  /**
   * Maximum output tokens.
   * Defaults to the Core global default when omitted.
   */
  maxTokens?: number
}

// ---------------------------------------------------------------------------
// invoke / spawn options
// ---------------------------------------------------------------------------

/**
 * Options passed to `agent.invoke()`.
 */
export interface AgentInvokeOptions {
  /**
   * ACE-compliant context object built via the Context API.
   * `goal_ref` inside the context is required for traceability.
   */
  context?: AceContext

  /**
   * Conversation ID for multi-turn continuations.
   * Use the `conversationId` returned by a previous `InvokeResult`.
   */
  conversationId?: string

  /** Additional MCP tool IDs to make available for this invocation. */
  tools?: string[]

  /**
   * Enable streaming responses.
   * When `true`, the return type changes to `AsyncIterable<string>`.
   * @default false
   */
  stream?: boolean

  /** AbortSignal for cancellation. @see {@link AgentAbortError} */
  signal?: AbortSignal

  /**
   * Invocation timeout in milliseconds.
   * @default 120000
   */
  timeoutMs?: number

  /** Event handler for real-time execution updates. @see {@link AgentEvent} */
  onEvent?: AgentEventHandler
}

/**
 * Context passed to `agent.spawn()` to start an ephemeral agent
 * asynchronously (fire-and-forget or parallel execution).
 */
export interface SpawnContext {
  /** Instruction prompt for the agent. */
  prompt: string

  /** ACE-compliant context. */
  aceContext?: AceContext

  /**
   * AMP write target for automatically persisting the agent's output.
   * The agent writes its result to AMP when finished.
   */
  outputTarget?: AmpWriteTarget

  /** Event handler for real-time updates. */
  onEvent?: AgentEventHandler

  /** AbortSignal for cancellation. */
  signal?: AbortSignal
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/**
 * Return value from `agent.invoke()` (non-streaming mode).
 */
export interface AgentInvokeResult {
  /** The agent's response text. */
  text: string

  /**
   * Conversation ID to be passed to the next turn via
   * `AgentInvokeOptions.conversationId`.
   */
  conversationId: string

  /** Reason the agent stopped generating. */
  finishReason: "stop" | "max_tokens" | "abort" | "error"

  /** Token usage for the invocation. */
  usage: { inputTokens: number; outputTokens: number }

  /** Sub-agent delegations that occurred during this invocation. */
  delegations?: DelegationRecord[]
}

/**
 * Handle returned by `agent.spawn()`.
 * Allows the caller to wait for the result or abort mid-flight.
 */
export interface SpawnHandle {
  /** Unique execution ID assigned by the Agent Runtime. */
  executionId: string

  /** Promise that resolves with the final `AgentInvokeResult`. */
  result: Promise<AgentInvokeResult>

  /** Force-terminate the spawned agent. */
  abort: () => void
}

/**
 * Record of a sub-agent delegation that occurred inside an invocation.
 */
export interface DelegationRecord {
  /** The agent that received the delegation. */
  delegateTo: AgentId | ReferenceDefaultId

  /** Human-readable reason for the delegation. */
  reason: string

  /** Result returned by the delegated agent. */
  result: AgentInvokeResult

  /** Unix timestamp (ms) when the delegation started. */
  startedAt: number

  /** Unix timestamp (ms) when the delegation completed. */
  completedAt: number
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Discriminated union of all agent execution events.
 * Subscribe via `AgentInvokeOptions.onEvent` or `SpawnContext.onEvent`.
 */
export type AgentEvent =
  | { type: "on_start"; executionId: string; agentId: AgentId; startedAt: number }
  | { type: "on_progress"; executionId: string; chunk: string; totalChars: number }
  | { type: "on_delegation"; executionId: string; delegateTo: AgentId; reason: string }
  | { type: "on_complete"; executionId: string; result: AgentInvokeResult }
  | { type: "on_error"; executionId: string; error: AgentError }
  | { type: "on_abort"; executionId: string; abortedAt: number }

/** Callback signature for `AgentEvent` subscribers. */
export type AgentEventHandler = (event: AgentEvent) => void

// ---------------------------------------------------------------------------
// Handoff
// ---------------------------------------------------------------------------

/**
 * Payload for `agent.handoff()`.
 * All data references must be Pool / AMP IDs — never raw bytes or objects.
 *
 * @see https://github.com/Akari-OS/sdk/blob/main/docs/api-reference/agent-api.md#8-handoff
 */
export interface HandoffPayload {
  /** AMP record ID referencing the draft. */
  draftRef?: string

  /** Pool item IDs for assets being handed off. */
  assets?: string[]

  /**
   * Short summary of the current work state.
   * Usually auto-generated by the Partner agent.
   */
  summary?: string

  /** Description of what the user wants to do next. */
  userIntent?: string

  /** App ID of the sending app. */
  fromApp: string

  /** App ID of the receiving app. */
  toApp: string
}

/**
 * Return value from `agent.handoff()`.
 */
export interface HandoffResult {
  /** Unique ID of the created handoff record. */
  handoffId: string

  /** Auto-generated note injected into the next app's system prompt. */
  handoffNote: HandoffNote

  /** AMP record ID where the handoff was logged. */
  ampRecordId: string
}

/**
 * Auto-generated summary injected into the receiving app's system prompt
 * so the agent understands the context from the previous app.
 */
export interface HandoffNote {
  /** App ID that initiated the handoff. */
  fromApp: string

  /** LLM-generated summary of the conversation so far. */
  summary: string

  /** Arbitrary payload (Pool / AMP ID references). */
  payload: Record<string, unknown>

  /** User's declared next intent. */
  userIntent: string

  /** Unix timestamp (ms) when this note was created. */
  createdAt: number
}

// ---------------------------------------------------------------------------
// Persona / Costume switch
// ---------------------------------------------------------------------------

/**
 * Options for `agent.switchPersona()`.
 * Used to tailor the Partner's system prompt when an App mounts.
 */
export interface PersonaSwitchOptions {
  /**
   * Additional text appended to the Partner's system prompt
   * to establish app-specific expertise.
   */
  systemPromptSuffix?: string

  /** Display name shown in the Chat UI header (external, Japanese). */
  agentName?: string

  /** Internal English identifier for the Agent Runtime. */
  agentNameInternal?: string

  /** MCP server name to connect when persona is active. */
  mcpServer?: string

  /**
   * Whether to auto-generate a Handoff Note before switching personas.
   * @default true
   */
  generateHandoffNote?: boolean
}

// ---------------------------------------------------------------------------
// AMP write target (used in SpawnContext)
// ---------------------------------------------------------------------------

/**
 * Describes where a spawned agent should persist its output in AMP.
 */
export interface AmpWriteTarget {
  kind: "amp"
  /** AMP `goal_ref` under which the result is recorded. */
  goal_ref: string
  /** AMP `kind` label for the result record. */
  kind_label: string
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/** Base class for all Agent API errors. */
export class AgentError extends Error {
  readonly code: AkariErrorCode | string
  /** Agent ID involved in the error, if applicable. */
  readonly agentId?: AgentId

  constructor(message: string, code: AkariErrorCode | string, agentId?: AgentId) {
    super(message)
    this.name = "AgentError"
    this.code = code
    this.agentId = agentId
  }
}

/** The specified agent ID was not found in the manifest `[agents]` section. */
export class AgentNotFoundError extends AgentError {
  override readonly code = AkariErrorCode.AgentNotFound as const
  override readonly agentId: AgentId

  constructor(agentId: AgentId) {
    super(`Agent not found: ${agentId}`, AkariErrorCode.AgentNotFound, agentId)
    this.name = "AgentNotFoundError"
    this.agentId = agentId
  }
}

/** Agent invocation exceeded the configured timeout. */
export class AgentTimeoutError extends AgentError {
  override readonly code = AkariErrorCode.AgentTimeout as const
  readonly timeoutMs: number

  constructor(agentId: AgentId, timeoutMs: number) {
    super(`Agent timed out after ${timeoutMs}ms: ${agentId}`, AkariErrorCode.AgentTimeout, agentId)
    this.name = "AgentTimeoutError"
    this.timeoutMs = timeoutMs
  }
}

/** Agent execution was cancelled via `AbortSignal`. */
export class AgentAbortError extends AgentError {
  override readonly code = AkariErrorCode.AgentAbort as const

  constructor(agentId?: AgentId) {
    super("Agent execution was aborted", AkariErrorCode.AgentAbort, agentId)
    this.name = "AgentAbortError"
  }
}

/** The required permission scope was not granted before invoking the agent. */
export class AgentPermissionError extends AgentError {
  override readonly code = AkariErrorCode.AgentPermissionDenied as const
  readonly requiredPermission: string

  constructor(agentId: AgentId, requiredPermission: string) {
    super(`Permission denied for agent ${agentId}: ${requiredPermission}`, AkariErrorCode.AgentPermissionDenied, agentId)
    this.name = "AgentPermissionError"
    this.requiredPermission = requiredPermission
  }
}

/** Agent spec file path or ID format is invalid (ADR-011 violation). */
export class AgentInvalidSpecError extends AgentError {
  override readonly code = AkariErrorCode.AgentInvalidSpec as const
  readonly reason: string

  constructor(agentId: AgentId, reason: string) {
    super(`Invalid agent spec for ${agentId}: ${reason}`, AkariErrorCode.AgentInvalidSpec, agentId)
    this.name = "AgentInvalidSpecError"
    this.reason = reason
  }
}

/** An unexpected error occurred inside the Agent Runtime (Core internal). */
export class AgentRuntimeError extends AgentError {
  override readonly code = AkariErrorCode.AgentRuntimeError as const

  constructor(message: string, agentId?: AgentId) {
    super(message, AkariErrorCode.AgentRuntimeError, agentId)
    this.name = "AgentRuntimeError"
  }
}

/** Agent ID conflicts with a Core reference default (e.g. "partner"). */
export class AgentNameConflictError extends AgentError {
  override readonly code = AkariErrorCode.AgentNameConflict as const
  readonly conflictWith: ReferenceDefaultId

  constructor(agentId: AgentId, conflictWith: ReferenceDefaultId) {
    super(`Agent ID "${agentId}" conflicts with Core default "${conflictWith}"`, AkariErrorCode.AgentNameConflict, agentId)
    this.name = "AgentNameConflictError"
    this.conflictWith = conflictWith
  }
}

// Re-export AkariErrorCode for convenience
export { AkariErrorCode }
