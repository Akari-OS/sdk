/**
 * @file errors.ts
 * Shared error types for the AKARI Module SDK.
 *
 * Each API group (Agent, Memory, Permission, Skill) extends `AkariError`
 * with a typed `code` property drawn from `AkariErrorCode`.
 *
 * @see https://github.com/Akari-OS/sdk/blob/main/docs/api-reference/
 */

// ---------------------------------------------------------------------------
// Base error
// ---------------------------------------------------------------------------

/**
 * Base class for all AKARI SDK errors.
 * All domain-specific errors extend this class.
 */
export class AkariError extends Error {
  /** Machine-readable error code. */
  readonly code: AkariErrorCode | string

  constructor(message: string, code: AkariErrorCode | string) {
    super(message)
    this.name = "AkariError"
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Error code enum
// ---------------------------------------------------------------------------

/**
 * Exhaustive set of error codes used across the AKARI Module SDK.
 * API-specific errors reference a subset of these codes.
 */
export enum AkariErrorCode {
  // -- Agent API --
  /** Agent ID not found in the manifest `[agents]` section. */
  AgentNotFound = "AGENT_NOT_FOUND",
  /** Agent invocation timed out. */
  AgentTimeout = "AGENT_TIMEOUT",
  /** Agent execution was cancelled via `AbortSignal`. */
  AgentAbort = "AGENT_ABORT",
  /** Required permission scope was not granted before invoking the agent. */
  AgentPermissionDenied = "AGENT_PERMISSION_DENIED",
  /** Agent spec file path or ID format is invalid (ADR-011 violation). */
  AgentInvalidSpec = "AGENT_INVALID_SPEC",
  /** Unexpected error inside the Agent Runtime (Core internal). */
  AgentRuntimeError = "AGENT_RUNTIME_ERROR",
  /** Agent ID conflicts with a Core reference default (e.g. "partner"). */
  AgentNameConflict = "AGENT_NAME_CONFLICT",

  // -- Memory API --
  /** Pool item or AMP record was not found. */
  MemoryNotFound = "MEMORY_NOT_FOUND",
  /** Access to another Module's private memory was denied. */
  MemoryPermissionDenied = "MEMORY_PERMISSION_DENIED",
  /** Requested record's confidence is below `minConfidence`. */
  MemoryConfidenceTooLow = "MEMORY_CONFIDENCE_TOO_LOW",
  /** Requested search strategy is unavailable. */
  MemoryStrategyUnavailable = "MEMORY_STRATEGY_UNAVAILABLE",
  /** Duplicate content detected in Pool. */
  MemoryDuplicate = "MEMORY_DUPLICATE",
  /** Cold storage backend is offline; rehydration impossible. */
  MemoryTierUnavailable = "MEMORY_TIER_UNAVAILABLE",
  /** `goal_ref` was missing from an `amp.record()` call. */
  MemoryGoalRefRequired = "MEMORY_GOAL_REF_REQUIRED",
  /** Cold-to-Hot rehydration timed out. */
  MemoryRehydrationTimeout = "MEMORY_REHYDRATION_TIMEOUT",

  // -- Permission API --
  /** Requested scope is not declared in `akari.toml [permissions]`. */
  PermissionNotDeclared = "PERMISSION_NOT_DECLARED",
  /** User denied the permission request at the HITL dialog. */
  PermissionUserDenied = "PERMISSION_USER_DENIED",
  /** Automatic policy rejected the request. */
  PermissionPolicyDenied = "PERMISSION_POLICY_DENIED",
  /** HITL approval dialog timed out. */
  PermissionTimeout = "PERMISSION_TIMEOUT",

  // -- Skill API --
  /** Skill ID was not found in the registry. */
  SkillNotFound = "SKILL_NOT_FOUND",
  /** Skill is used but not declared in `[skills.imported]`. */
  SkillUndeclaredImport = "SKILL_UNDECLARED_IMPORT",
  /** Skill version does not satisfy the declared semver range. */
  SkillVersionMismatch = "SKILL_VERSION_MISMATCH",
  /** Skill input failed schema validation. */
  SkillInputValidation = "SKILL_INPUT_VALIDATION",
  /** Skill output failed schema validation. */
  SkillOutputValidation = "SKILL_OUTPUT_VALIDATION",
  /** Skill invocation timed out. */
  SkillTimeout = "SKILL_TIMEOUT",
  /** Skill is not declared in `[skills.exposed]`. */
  SkillUndeclared = "SKILL_UNDECLARED",
  /** Skill ID is already registered. */
  SkillAlreadyRegistered = "SKILL_ALREADY_REGISTERED",
  /** Skill schema does not satisfy JSON Schema 7 / Zod requirements. */
  SkillSchemaInvalid = "SKILL_SCHEMA_INVALID",
}
