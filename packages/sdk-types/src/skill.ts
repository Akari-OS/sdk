/**
 * @file skill.ts
 * Type definitions for the AKARI App SDK — Skill API.
 *
 * A Skill is the typed, reusable capability unit that one App exposes
 * for other Apps (or Workflow steps) to call. Skills must be declared in
 * `akari.toml [skills.exposed]` and validated against Zod or JSON Schema 7.
 *
 * @see https://github.com/Akari-OS/sdk/blob/main/docs/api-reference/skill-api.md
 */

// ---------------------------------------------------------------------------
// Minimal JSON Schema 7 shim
// (avoids a hard dependency on `@types/json-schema` in a types-only package)
// ---------------------------------------------------------------------------

/**
 * Minimal representation of a JSON Schema 7 object used as Skill
 * input / output schemas when Zod is not available.
 *
 * For full type safety, use Zod — the SDK resolves `z.infer<T>` for you.
 */
export type JSONSchema7 = {
  type?: string | string[]
  properties?: Record<string, JSONSchema7>
  required?: string[]
  additionalProperties?: boolean | JSONSchema7
  description?: string
  enum?: unknown[]
  items?: JSONSchema7
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Skill context (available inside handler)
// ---------------------------------------------------------------------------

/**
 * Execution context passed as the second argument to `SkillDef.handler`.
 * Provides scoped access to Pool and AMP without importing them directly.
 */
export interface SkillContext {
  /**
   * AMP goal reference propagated from the `SkillInvokeOptions.goal_ref`
   * of the caller.
   */
  goal_ref?: string

  /** Milliseconds elapsed since the skill invocation started. */
  elapsed_ms: number

  /**
   * Scoped Pool client.
   * Behaves identically to the top-level `pool` export from `@akari-os/sdk`.
   */
  pool: SkillPoolClient

  /**
   * Scoped AMP client.
   * Behaves identically to the top-level `amp` export from `@akari-os/sdk`.
   */
  amp: SkillAmpClient
}

/**
 * Minimal Pool operations available inside a Skill handler.
 * The full type is defined in `memory.ts`; this interface prevents
 * a circular dependency between `skill.ts` and `memory.ts`.
 */
export interface SkillPoolClient {
  get(id: string): Promise<unknown>
  put(input: unknown): Promise<string>
  search(query: unknown): Promise<unknown[]>
}

/**
 * Minimal AMP operations available inside a Skill handler.
 */
export interface SkillAmpClient {
  record(input: unknown): Promise<unknown>
  query(input: unknown): Promise<unknown>
}

// ---------------------------------------------------------------------------
// SkillDef
// ---------------------------------------------------------------------------

/**
 * Full Skill definition passed to `skill.register()`.
 *
 * Use the generic parameters for end-to-end type safety when both
 * `input` and `output` are Zod schemas:
 *
 * ```typescript
 * import { z } from "zod"
 * import type { SkillDef } from "@akari-os/sdk"
 *
 * const skill: SkillDef<typeof InputSchema, typeof OutputSchema> = { ... }
 * ```
 *
 * When using plain JSON Schema 7, omit the generics.
 */
export interface SkillDef<
  TInput = unknown,
  TOutput = unknown,
> {
  /**
   * Fully-qualified Skill ID.
   * Format: `"<app-short-id>.<skill-name>"` in snake_case.
   * Must be listed in `akari.toml [skills.exposed]`.
   * @example "writer.generate_draft"
   */
  id: string

  /**
   * Semantic version of this Skill.
   * Callers declare a semver range in `[skills.imported]`;
   * a mismatch causes `SKILL_VERSION_MISMATCH`.
   * @example "0.1.0"
   */
  version: string

  /**
   * Human-readable description.
   * The LLM uses this when selecting Skills inside Workflow steps.
   */
  description: string

  /**
   * Input schema — Zod schema object or JSON Schema 7 object.
   * The SDK validates `invoke()` input against this schema automatically.
   * Include `additionalProperties: false` for JSON Schema.
   */
  input: TInput

  /**
   * Output schema — Zod schema object or JSON Schema 7 object.
   * The SDK validates the return value of `handler` against this schema.
   */
  output: TOutput

  /**
   * Whether the Skill is idempotent (same input → same output).
   * Idempotent Skills can be safely retried in Workflow runners.
   * @default false
   */
  idempotent?: boolean

  /**
   * AKARI-HUB-072 (T-7) — Workflow Step.tool が呼ぶ Tool / Skill が消費する
   * 推定 token 数。Workflow Engine（akari-agents）が実行前に Step 別 + 累積で
   * 集計し、`ContextBudgetBar` 等で「コップから水があふれる UI」として表示する。
   *
   * 使い分け（spec §6 / AC-9〜AC-12 / AC-12 / spec §9 Risks）:
   *   - 静的に推定可能なら `estimated_tokens` に固定値を入れる
   *   - 入力依存で動的に算出したい場合は `estimateTokens(input)` を実装する
   *     （実装側は `estimated_tokens` を omit してよい）
   *   - 両方未指定の場合、Workflow Engine 側は `0` を default にしてもよいが、
   *     Context Budget の精度が落ちるため可能な限りどちらか実装する
   *
   * 既存利用箇所への impact 最小化のため両方とも optional（後方互換）。
   *
   * @see akari-os/docs/sdd/specs/spec-workflow-checkpoint-context-budget-learning-loop.md
   */
  estimated_tokens?: number

  /**
   * 入力依存で token 推定を動的に算出する optional method。
   * `estimated_tokens` の固定値で表現できない場合に実装する。
   *
   * Workflow Engine（akari-agents）の `engine.estimate_context_budget()` から
   * 実行前に呼ばれる。実装は同期かつ side-effect free を期待される
   * （実 LLM 呼び出しを行わず、heuristic で推定する）。
   *
   * @param input - `SkillDef.input` schema を通った input
   * @returns 推定 token 数
   */
  estimateTokens?: (input: unknown) => number

  /**
   * Implementation function.
   * `input` is automatically validated and typed via the schema generics.
   * `ctx` provides scoped Pool / AMP access and runtime metadata.
   */
  handler: (input: unknown, ctx: SkillContext) => Promise<unknown>
}

// ---------------------------------------------------------------------------
// Invoke options
// ---------------------------------------------------------------------------

/**
 * Options for `skill.invoke()` / `skill.call()`.
 */
export interface SkillInvokeOptions {
  /**
   * Timeout in milliseconds.
   * Throws `SkillTimeoutError` when exceeded.
   */
  timeout_ms?: number

  /**
   * AMP goal reference propagated into the skill's `SkillContext.goal_ref`.
   * Recommended for traceability.
   */
  goal_ref?: string

  /**
   * Distributed trace ID.
   * Useful for correlating skill calls across Workflow steps in logs.
   */
  trace_id?: string
}

// ---------------------------------------------------------------------------
// SkillAPI interface
// ---------------------------------------------------------------------------

/**
 * The `skill` object exported from `@akari-os/sdk`.
 */
export interface SkillAPI {
  /**
   * Register one or more Skills with the Core at app mount time.
   * Every ID must be listed in `akari.toml [skills.exposed]`.
   */
  register(skill: SkillDef | SkillDef[]): void

  /**
   * Invoke a Skill by ID and await its result.
   * The ID must be declared in `akari.toml [skills.imported]`.
   *
   * @typeParam T - Expected return type (matches the target Skill's output schema)
   */
  invoke<T = unknown>(
    id: string,
    input: unknown,
    options?: SkillInvokeOptions,
  ): Promise<T>

  /**
   * Alias for `invoke()`.
   * @see {@link SkillAPI.invoke}
   */
  call<T = unknown>(
    id: string,
    input: unknown,
    options?: SkillInvokeOptions,
  ): Promise<T>
}

// ---------------------------------------------------------------------------
// AMP skill-memory record
// ---------------------------------------------------------------------------

/**
 * Shape of an AMP record written when logging Skill execution history.
 * Write via `ctx.amp.record({ kind: "skill-memory", ... })`.
 * The AKARI Feedback Learning Loop reads these records to
 * evolve Skill definitions over time.
 */
export interface SkillMemoryRecord {
  kind: "skill-memory"
  /** Fully-qualified Skill ID. */
  skill_id: string
  /** Hash of the input (raw input is never stored for privacy). */
  input_hash: string
  /** Pool content ID where the output was persisted. */
  output_ref: string
  /** Execution latency in milliseconds. */
  latency_ms: number
  /** AMP goal reference. */
  goal_ref: string
  /** ISO 8601 execution timestamp. */
  timestamp: string
}

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/** Base class for all Skill API errors. */
export class SkillError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = "SkillError"
    this.code = code
  }
}

/** Skill ID not found in the registry. */
export class SkillNotFoundError extends SkillError {
  constructor(id: string) {
    super(`Skill not found: ${id}`, "SKILL_NOT_FOUND")
    this.name = "SkillNotFoundError"
  }
}

/** Skill is called but not declared in `[skills.imported]`. */
export class SkillUndeclaredImportError extends SkillError {
  constructor(id: string) {
    super(`Skill "${id}" is not declared in [skills.imported]`, "SKILL_UNDECLARED_IMPORT")
    this.name = "SkillUndeclaredImportError"
  }
}

/** Installed Skill version does not satisfy the declared semver range. */
export class SkillVersionMismatchError extends SkillError {
  constructor(id: string, required: string, installed: string) {
    super(
      `Skill "${id}" version mismatch: required ${required}, found ${installed}`,
      "SKILL_VERSION_MISMATCH",
    )
    this.name = "SkillVersionMismatchError"
  }
}

/** Skill input failed schema validation. */
export class SkillInputValidationError extends SkillError {
  readonly details: unknown
  constructor(id: string, details: unknown) {
    super(`Skill "${id}" input validation failed`, "SKILL_INPUT_VALIDATION")
    this.name = "SkillInputValidationError"
    this.details = details
  }
}

/** Skill output failed schema validation. */
export class SkillOutputValidationError extends SkillError {
  readonly details: unknown
  constructor(id: string, details: unknown) {
    super(`Skill "${id}" output validation failed`, "SKILL_OUTPUT_VALIDATION")
    this.name = "SkillOutputValidationError"
    this.details = details
  }
}

/** Skill invocation exceeded `timeout_ms`. */
export class SkillTimeoutError extends SkillError {
  readonly timeoutMs: number
  constructor(id: string, timeoutMs: number) {
    super(`Skill "${id}" timed out after ${timeoutMs}ms`, "SKILL_TIMEOUT")
    this.name = "SkillTimeoutError"
    this.timeoutMs = timeoutMs
  }
}
