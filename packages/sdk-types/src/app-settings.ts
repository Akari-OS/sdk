/**
 * @file app-settings.ts
 * Type definitions for app-provided settings — the SDK contract for
 * declaring user-configurable fields in `akari.toml`.
 *
 * AKARI-HUB-064 Phase 1b — App-provided Settings SDK
 *
 * Apps declare a `[[settings.section]]` / `[[settings.section.field]]` block
 * in their `akari.toml`. The Shell parses it at install / discovery time and
 * renders the fields generically inside the Settings UI. Apps remain in
 * control of how the saved values are interpreted at runtime — the Shell
 * only persists them to `~/.akari/apps/<app-id>/settings.json` on user edit.
 */

// ---------------------------------------------------------------------------
// Fields (8 kinds)
// ---------------------------------------------------------------------------

interface AppSettingsFieldBase {
  /** Field identifier (unique within its section). */
  id: string
  /** Human-readable label shown next to the input. */
  label: string
  /** Optional explanatory text rendered under the label. */
  description?: string
}

export interface AppSettingsToggleField extends AppSettingsFieldBase {
  kind: "toggle"
  default: boolean
}

export interface AppSettingsTextField extends AppSettingsFieldBase {
  kind: "text"
  default?: string
  placeholder?: string
}

export interface AppSettingsNumberField extends AppSettingsFieldBase {
  kind: "number"
  default?: number
  min?: number
  max?: number
  step?: number
}

export interface AppSettingsSliderField extends AppSettingsFieldBase {
  kind: "slider"
  default: number
  min: number
  max: number
  step?: number
}

export interface AppSettingsSelectOption {
  value: string
  label: string
}

export interface AppSettingsSelectField extends AppSettingsFieldBase {
  kind: "select"
  default: string
  options: AppSettingsSelectOption[]
}

export interface AppSettingsColorField extends AppSettingsFieldBase {
  kind: "color"
  default?: string
}

export interface AppSettingsPathField extends AppSettingsFieldBase {
  kind: "path"
  default?: string
  /** `"file"` for a single file, `"directory"` for a directory. */
  mode: "file" | "directory"
}

/**
 * Secret value (API key, token, etc.) persisted to the OS Keychain — **never**
 * to `settings.json`. The Shell stores via `keychain_set` under
 * `senderId = "app:${appId}"`, `account = ${field.id}`. App runtime fetches
 * via `keychain_get` (or the helper exposed in the SDK).
 *
 * AKARI-HUB-064 Phase 1c.
 */
export interface AppSettingsSecretField extends AppSettingsFieldBase {
  kind: "secret"
  placeholder?: string
}

/**
 * Discriminated union over the 8 supported field kinds.
 * The Shell renders each kind with the matching React control.
 */
export type AppSettingsField =
  | AppSettingsToggleField
  | AppSettingsTextField
  | AppSettingsNumberField
  | AppSettingsSliderField
  | AppSettingsSelectField
  | AppSettingsColorField
  | AppSettingsPathField
  | AppSettingsSecretField

/** Default value type for a given field kind. */
export type AppSettingsValue = boolean | string | number

// ---------------------------------------------------------------------------
// Sections + Schema
// ---------------------------------------------------------------------------

export interface AppSettingsSection {
  /** Section identifier (unique within the app). */
  id: string
  /** Section heading rendered in the pane. */
  title: string
  /** Optional explanatory paragraph under the heading. */
  description?: string
  /** Ordered list of fields that belong to this section. */
  fields: AppSettingsField[]
}

/**
 * Top-level settings schema for an app. Empty `sections` is valid and means
 * the app does not contribute any user-facing settings.
 */
export interface AppSettingsSchema {
  /** App ID this schema belongs to (matches `akari.toml [app].id`). */
  appId: string
  sections: AppSettingsSection[]
}
