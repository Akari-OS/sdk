/**
 * @file app-settings.ts
 * Type definitions + Zod runtime schemas for app-provided settings — the SDK
 * contract for declaring user-configurable fields in `akari.toml`.
 *
 * AKARI-HUB-064 Phase 1b — App-provided Settings SDK
 * AKARI-HUB-064 Phase 1c — Zod runtime validation (parseAppSettings 等)
 *
 * Apps declare a `[[settings.section]]` / `[[settings.section.field]]` block
 * in their `akari.toml`. The Shell parses it at install / discovery time and
 * renders the fields generically inside the Settings UI. Apps remain in
 * control of how the saved values are interpreted at runtime — the Shell
 * only persists them to `~/.akari/apps/<app-id>/settings.json` on user edit.
 *
 * Types are derived from Zod schemas via `z.infer<>` so the static types and
 * the runtime validators stay in lock-step (single source of truth).
 */

import { z } from "zod"

// ---------------------------------------------------------------------------
// Field base
// ---------------------------------------------------------------------------

const fieldBaseShape = {
  /** Field identifier (unique within its section). */
  id: z.string(),
  /** Human-readable label shown next to the input. */
  label: z.string(),
  /** Optional explanatory text rendered under the label. */
  description: z.string().optional(),
}

// ---------------------------------------------------------------------------
// Fields (8 kinds)
// ---------------------------------------------------------------------------

export const appSettingsToggleFieldSchema = z.object({
  ...fieldBaseShape,
  kind: z.literal("toggle"),
  default: z.boolean(),
})
export type AppSettingsToggleField = z.infer<typeof appSettingsToggleFieldSchema>

export const appSettingsTextFieldSchema = z.object({
  ...fieldBaseShape,
  kind: z.literal("text"),
  default: z.string().optional(),
  placeholder: z.string().optional(),
})
export type AppSettingsTextField = z.infer<typeof appSettingsTextFieldSchema>

export const appSettingsNumberFieldSchema = z.object({
  ...fieldBaseShape,
  kind: z.literal("number"),
  default: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().optional(),
})
export type AppSettingsNumberField = z.infer<typeof appSettingsNumberFieldSchema>

export const appSettingsSliderFieldSchema = z.object({
  ...fieldBaseShape,
  kind: z.literal("slider"),
  default: z.number(),
  min: z.number(),
  max: z.number(),
  step: z.number().optional(),
})
export type AppSettingsSliderField = z.infer<typeof appSettingsSliderFieldSchema>

export const appSettingsSelectOptionSchema = z.object({
  value: z.string(),
  label: z.string(),
})
export type AppSettingsSelectOption = z.infer<typeof appSettingsSelectOptionSchema>

export const appSettingsSelectFieldSchema = z.object({
  ...fieldBaseShape,
  kind: z.literal("select"),
  default: z.string(),
  options: z.array(appSettingsSelectOptionSchema),
})
export type AppSettingsSelectField = z.infer<typeof appSettingsSelectFieldSchema>

export const appSettingsColorFieldSchema = z.object({
  ...fieldBaseShape,
  kind: z.literal("color"),
  default: z.string().optional(),
})
export type AppSettingsColorField = z.infer<typeof appSettingsColorFieldSchema>

export const appSettingsPathFieldSchema = z.object({
  ...fieldBaseShape,
  kind: z.literal("path"),
  default: z.string().optional(),
  /** `"file"` for a single file, `"directory"` for a directory. */
  mode: z.union([z.literal("file"), z.literal("directory")]),
})
export type AppSettingsPathField = z.infer<typeof appSettingsPathFieldSchema>

/**
 * Secret value (API key, token, etc.) persisted to the OS Keychain — **never**
 * to `settings.json`. The Shell stores via `keychain_set` under
 * `senderId = "app:${appId}"`, `account = ${field.id}`. App runtime fetches
 * via `keychain_get` (or the helper exposed in the SDK).
 *
 * AKARI-HUB-064 Phase 1c.
 */
export const appSettingsSecretFieldSchema = z.object({
  ...fieldBaseShape,
  kind: z.literal("secret"),
  placeholder: z.string().optional(),
})
export type AppSettingsSecretField = z.infer<typeof appSettingsSecretFieldSchema>

/**
 * Discriminated union over the 8 supported field kinds.
 * The Shell renders each kind with the matching React control.
 */
export const appSettingsFieldSchema = z.discriminatedUnion("kind", [
  appSettingsToggleFieldSchema,
  appSettingsTextFieldSchema,
  appSettingsNumberFieldSchema,
  appSettingsSliderFieldSchema,
  appSettingsSelectFieldSchema,
  appSettingsColorFieldSchema,
  appSettingsPathFieldSchema,
  appSettingsSecretFieldSchema,
])
export type AppSettingsField = z.infer<typeof appSettingsFieldSchema>

/** Default value type for a given field kind. */
export const appSettingsValueSchema = z.union([
  z.boolean(),
  z.string(),
  z.number(),
])
export type AppSettingsValue = z.infer<typeof appSettingsValueSchema>

// ---------------------------------------------------------------------------
// Sections + Schema
// ---------------------------------------------------------------------------

export const appSettingsSectionSchema = z.object({
  /** Section identifier (unique within the app). */
  id: z.string(),
  /** Section heading rendered in the pane. */
  title: z.string(),
  /** Optional explanatory paragraph under the heading. */
  description: z.string().optional(),
  /** Ordered list of fields that belong to this section. */
  fields: z.array(appSettingsFieldSchema),
})
export type AppSettingsSection = z.infer<typeof appSettingsSectionSchema>

/**
 * Top-level settings schema for an app. Empty `sections` is valid and means
 * the app does not contribute any user-facing settings.
 */
export const appSettingsSchemaSchema = z.object({
  /** App ID this schema belongs to (matches `akari.toml [app].id`). */
  appId: z.string(),
  sections: z.array(appSettingsSectionSchema),
})
export type AppSettingsSchema = z.infer<typeof appSettingsSchemaSchema>

// ---------------------------------------------------------------------------
// Persisted values (`~/.akari/apps/<app-id>/settings.json` shape)
// AKARI-HUB-064 Phase 1c — runtime validation
// ---------------------------------------------------------------------------

/**
 * Shape of `settings.json`: `{ [sectionId]: { [fieldId]: value } }`.
 *
 * Per-field type checking is delegated to consumers (the Shell holds the
 * declared schema and can cross-check kinds when needed). At this layer we
 * only enforce the outer shape so corrupt or non-object JSON is rejected
 * before it reaches the merge / render path.
 */
export const appSettingsValuesSchema = z.record(
  z.string(),
  z.record(z.string(), z.unknown()),
)
export type AppSettingsValues = z.infer<typeof appSettingsValuesSchema>

// ---------------------------------------------------------------------------
// Parsers (HUB-064 Phase 1c)
// ---------------------------------------------------------------------------

/**
 * Validate an `AppSettingsSchema` declaration (typically produced by the
 * Shell's `akari.toml` parser). Throws `z.ZodError` on shape mismatch — the
 * caller is expected to surface this as a manifest error so the offending
 * app is excluded from the Settings UI rather than crashing the Shell.
 */
export function parseAppSettings(input: unknown): AppSettingsSchema {
  return appSettingsSchemaSchema.parse(input)
}

/**
 * Validate persisted user values loaded from
 * `~/.akari/apps/<app-id>/settings.json`. Throws `z.ZodError` if the JSON
 * is not a `Record<string, Record<string, unknown>>`.
 *
 * Per-field kind checking is intentionally **not** done here: the Shell
 * holds the schema and can apply field-level validation when it has both
 * pieces in hand. This parser exists to reject obviously corrupt files
 * (e.g. `null`, array, scalar) before they propagate into React state.
 */
export function parseAppSettingsValues(input: unknown): AppSettingsValues {
  return appSettingsValuesSchema.parse(input)
}
