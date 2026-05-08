/**
 * @file index.ts
 * Public API surface for `@akari-os/sdk` — TypeScript type definitions.
 *
 * All types for the seven AKARI App SDK API groups, Panel Schema v0,
 * the App Manifest, and shared error types are re-exported from here.
 *
 * @example
 * ```typescript
 * import type {
 *   AgentAPI,
 *   HandoffPayload,
 *   PanelSchema,
 *   PermissionScope,
 * } from "@akari-os/sdk"
 * ```
 */

// ---------------------------------------------------------------------------
// Shared errors
// ---------------------------------------------------------------------------
export type { AkariError } from "./errors.js"
export { AkariErrorCode } from "./errors.js"

// ---------------------------------------------------------------------------
// (1) Agent API
// ---------------------------------------------------------------------------
export type {
  AgentId,
  ReferenceDefaultId,
  AgentSpec,
  AgentInvokeOptions,
  SpawnContext,
  AgentInvokeResult,
  SpawnHandle,
  DelegationRecord,
  AgentEvent,
  AgentEventHandler,
  HandoffPayload,
  HandoffResult,
  HandoffNote,
  PersonaSwitchOptions,
  AmpWriteTarget,
} from "./agent.js"

export {
  AgentError,
  AgentNotFoundError,
  AgentTimeoutError,
  AgentAbortError,
  AgentPermissionError,
  AgentInvalidSpecError,
  AgentRuntimeError,
  AgentNameConflictError,
} from "./agent.js"

// ---------------------------------------------------------------------------
// (2) Memory API
// ---------------------------------------------------------------------------
export type {
  ContentHash,
  PoolPutInput,
  PoolItem,
  PoolTier,
  PoolSearchQuery,
  PoolSearchResult,
  AmpKind,
  AmpRecordInput,
  AmpRecord,
  AmpQueryInput,
  AmpQueryResult,
  ScoredAmpRecord,
  PoolProviderInfo,
  AmpProviderInfo,
} from "./memory.js"

export { MemoryError, MemoryErrorCode } from "./memory.js"

// ---------------------------------------------------------------------------
// (3) Context API
// ---------------------------------------------------------------------------
export type {
  ContextItemKind,
  ContextItemSource,
  ContextItem,
  PackedContextItem,
  AceContext,
  SelectOptions,
  AmpQueryFilter,
  LintSeverity,
  LintIssue,
} from "./context.js"

// ---------------------------------------------------------------------------
// (4) UI API (Shell API)
// ---------------------------------------------------------------------------
export type {
  Unsubscribe,
  PanelSlot,
  PanelMountOptions,
  SchemaPanelMountOptions,
  TextSelection,
  DialogOptions,
  DialogAction,
  DialogResult,
  ToastOptions,
  NotificationOptions,
  HITLTemplate,
  HITLPreviewOptions,
  HITLPreviewResult,
  ThemeInfo,
  WorkspaceContext,
  ShellAPI,
} from "./ui.js"

// ---------------------------------------------------------------------------
// (5) Inter-App API
// ---------------------------------------------------------------------------
export type {
  HandoffRefs,
  HandoffHints,
  IncomingHandoff,
  HandoffResponse,
  HandoffHandler,
  AppAPI,
} from "./inter-app.js"

// Re-export HandoffPayload and HandoffResult from inter-app (the canonical definition)
// Note: agent.ts defines HandoffPayload for agent.handoff(); inter-app.ts defines
// HandoffPayload for app.handoff(). They share the same name but differ in shape.
// We alias the Inter-App variant as AppHandoffPayload to avoid the collision.
export type {
  HandoffPayload as AppHandoffPayload,
  HandoffResult as AppHandoffResult,
} from "./inter-app.js"

// ---------------------------------------------------------------------------
// (6) Permission API
// ---------------------------------------------------------------------------
export type {
  PermissionScope,
  PermissionGateOptions,
  PermissionStatus,
  PermissionAuditRecord,
  PermissionAPI,
} from "./permission.js"

export { PermissionDeniedError } from "./permission.js"

// ---------------------------------------------------------------------------
// (7) Skill API
// ---------------------------------------------------------------------------
export type {
  JSONSchema7,
  SkillContext,
  SkillPoolClient,
  SkillAmpClient,
  SkillDef,
  SkillInvokeOptions,
  SkillAPI,
  SkillMemoryRecord,
} from "./skill.js"

export {
  SkillError,
  SkillNotFoundError,
  SkillUndeclaredImportError,
  SkillVersionMismatchError,
  SkillInputValidationError,
  SkillOutputValidationError,
  SkillTimeoutError,
} from "./skill.js"

// ---------------------------------------------------------------------------
// Panel Schema v0
// ---------------------------------------------------------------------------
export type {
  PanelSchema,
  PanelLayout,
  WidgetType,
  Binding,
  SchemaField,
  SchemaAction,
  HITLConfig,
  ActionFeedback,
  Widget,
} from "./panel-schema.js"

// ---------------------------------------------------------------------------
// Manifest (akari.toml)
// ---------------------------------------------------------------------------
export type {
  AppSection,
  AppTier,
  PermissionsSection,
  McpSection,
  PanelsSection,
  PanelDeclaration,
  AgentsSection,
  SkillsSection,
  Manifest,
} from "./manifest.js"

// ---------------------------------------------------------------------------
// Compatibility Manifest (compatibility.toml)
// ---------------------------------------------------------------------------
export type {
  ComponentName,
  SemVerVersion,
  VersionRange,
  DependencyConstraints,
  ProvidesMap,
  ComponentSpec,
  CompatibilityManifest,
  ParsedVersion,
  ValidationError,
  ValidationResult,
} from "./compatibility.js"

export {
  validateCompatibilityManifest,
  isValidSemVer,
  isValidVersionRange,
  parseSemVer,
  compareVersions,
} from "./compatibility.js"

// ---------------------------------------------------------------------------
// Generated from upstream JSON Schemas (AMP v0.1 / M2C v0.2)
// Do not edit manually. Regenerate with `pnpm codegen` at repo root.
// Upstream SSOT: akari-amp/spec/v0.1/*.schema.json, akari-m2c/spec/v0.2/*.schema.json
// ---------------------------------------------------------------------------
export * from "./generated/index.js"
