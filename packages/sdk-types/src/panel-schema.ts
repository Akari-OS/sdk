/**
 * @file panel-schema.ts
 * Type definitions for AKARI Panel Schema v0.
 *
 * Panel Schema v0 is a declarative UI format for MCP-Declarative Tier Apps.
 * A `panel.schema.json` file describes the layout, fields, bindings, and
 * actions of a panel. The Shell's generic Schema Renderer turns it into
 * a live UI without any React code from the App.
 *
 * Full Tier Apps can also use `<SchemaPanel schema={...} />` from
 * `@akari-os/sdk/react` to embed Schema-driven widgets inside a custom panel.
 *
 * @see https://github.com/Akari-OS/sdk/blob/main/docs/api-reference/
 */

// ---------------------------------------------------------------------------
// Top-level schema
// ---------------------------------------------------------------------------

/**
 * Root object of a `panel.schema.json` file (Panel Schema v0).
 *
 * @example
 * ```json
 * {
 *   "$schema": "akari://panel-schema/v0",
 *   "title": "X Sender",
 *   "layout": "form",
 *   "fields": [...],
 *   "actions": [...]
 * }
 * ```
 */
export interface PanelSchema {
  /**
   * Schema version declaration.
   * Must be `"akari://panel-schema/v0"` for Schema v0.
   */
  $schema: "akari://panel-schema/v0"

  /** Panel display title. */
  title?: string

  /**
   * Top-level layout mode.
   * - `"form"` — vertical field list (default)
   * - `"tabs"` — tabbed sections (fields declare `tab` membership)
   * - `"split"` — left / right two-pane layout
   * - `"dashboard"` — grid-based card layout
   * - `"list"` — master–detail list
   */
  layout: PanelLayout

  /** Form field definitions. */
  fields: SchemaField[]

  /** Action button definitions. */
  actions: SchemaAction[]
}

/** Supported top-level layout modes. */
export type PanelLayout = "form" | "tabs" | "split" | "dashboard" | "list"

// ---------------------------------------------------------------------------
// Widget types
// ---------------------------------------------------------------------------

/**
 * All widget type identifiers supported in Panel Schema v0.
 *
 * Categories:
 * - **Text input**: `text`, `textarea`, `password`, `email`, `url`
 * - **Numeric**: `number`, `slider`, `stepper`
 * - **Selection**: `select`, `multi-select`, `radio`, `checkbox`, `toggle`
 * - **Date/Time**: `date`, `time`, `datetime`, `datetime-optional`, `duration`
 * - **AKARI-specific**: `pool-picker`, `amp-query`, `app-picker`, `agent-picker`
 * - **Documents**: `rich-text-editor`, `doc-outline-tree`, `sheet-row-picker`,
 *   `cell-range-picker`, `slide-template-picker`, `slide-preview`
 * - **File**: `file-upload`, `image-preview`, `video-preview`
 * - **Display**: `markdown`, `badge`, `stat`, `progress`, `image`, `divider`
 * - **Structure**: `tabs`, `accordion`, `split`, `group`, `repeater`
 * - **Data**: `table`, `list`, `card-grid`
 * - **Action**: `button`, `link`, `menu`
 */
export type WidgetType =
  // Text input
  | "text" | "textarea" | "password" | "email" | "url"
  // Numeric
  | "number" | "slider" | "stepper"
  // Selection
  | "select" | "multi-select" | "radio" | "checkbox" | "toggle"
  // Date / Time
  | "date" | "time" | "datetime" | "datetime-optional" | "duration"
  // AKARI-specific
  | "pool-picker" | "amp-query" | "app-picker" | "agent-picker"
  // Documents (Office-class)
  | "rich-text-editor" | "doc-outline-tree"
  | "sheet-row-picker" | "cell-range-picker"
  | "slide-template-picker" | "slide-preview"
  // File
  | "file-upload" | "image-preview" | "video-preview"
  // Display
  | "markdown" | "badge" | "stat" | "progress" | "image" | "divider"
  // Structure
  | "tabs" | "accordion" | "split" | "group" | "repeater"
  // Data
  | "table" | "list" | "card-grid"
  // Action
  | "button" | "link" | "menu"

// ---------------------------------------------------------------------------
// Binding
// ---------------------------------------------------------------------------

/**
 * Binding expression for a field's value source or write target.
 *
 * | Pattern | Example | Meaning |
 * |---|---|---|
 * | MCP argument | `mcp.x.post.text` | Binds to a MCP tool argument |
 * | Pool query | `pool.<query_id>` | Initialises from a Pool search result |
 * | AMP record | `amp.<kind>.<field>` | Initialises from / writes to AMP |
 * | Panel state | `state.<key>` | Panel-local ephemeral state |
 * | Constant | `const.<value>` | Fixed value |
 */
export type Binding = string

// ---------------------------------------------------------------------------
// SchemaField
// ---------------------------------------------------------------------------

/**
 * A single form field inside a `PanelSchema`.
 *
 * Field values can be referenced in action `args` using `$<field-id>`.
 * Conditional display / enable uses simple expression strings
 * (e.g. `"$when != null"`).
 */
export interface SchemaField {
  /**
   * Field identifier — unique within the schema.
   * Referenced as `$<id>` in action args and condition expressions.
   */
  id: string

  /** Widget type. */
  type: WidgetType

  /** Display label (supports `{{t:key}}` i18n notation). */
  label?: string

  /**
   * Data binding expression.
   * Controls where the initial value comes from and where writes go.
   */
  bind?: Binding

  /** Placeholder text shown when the field is empty. */
  placeholder?: string

  /** Helper / description text shown below the field. */
  helperText?: string

  /**
   * Whether the field must be non-empty before an action can be submitted.
   * @default false
   */
  required?: boolean

  // JSON Schema validation constraints

  /** Maximum character length (applies to text/textarea). */
  maxLength?: number

  /** Minimum character length. */
  minLength?: number

  /** Regex pattern the value must match. */
  pattern?: string

  /** Allowed enumeration values. */
  enum?: unknown[]

  // AKARI-specific field options

  /**
   * Accepted MIME types for `pool-picker` and `file-upload`.
   * @example ["image", "video"]
   */
  accept?: string[]

  /**
   * Maximum number of selected items for `pool-picker` and `multi-select`.
   */
  max?: number

  /**
   * Tab key for `"tabs"` layout — declares which tab this field belongs to.
   */
  tab?: string

  /**
   * Conditional visibility expression.
   * Field is hidden when the expression evaluates to falsy.
   * @example "$mediaType == 'video'"
   */
  visible_when?: string

  /**
   * Conditional enable expression.
   * Field is disabled when the expression evaluates to falsy.
   */
  enabled_when?: string

  /** Additional widget-specific options. */
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// SchemaAction
// ---------------------------------------------------------------------------

/**
 * An action button at the bottom of (or within) a panel.
 * Each action can invoke a MCP tool, trigger an App handoff,
 * or both sequentially.
 */
export interface SchemaAction {
  /** Action identifier — unique within the schema. */
  id: string

  /** Button label (supports `{{t:key}}` i18n notation). */
  label: string

  /**
   * Visual intent.
   * @default "secondary"
   */
  kind?: "primary" | "secondary" | "destructive" | "ghost"

  /**
   * MCP tool call triggered by this action.
   * Mutually exclusive with `handoff` (only one can be specified).
   */
  mcp?: {
    /** MCP tool name declared in `akari.toml [mcp] tools`. */
    tool: string
    /** Arguments mapping — values use `$<field-id>` references. */
    args: Record<string, unknown>
  }

  /**
   * Inter-App handoff triggered by this action.
   * Mutually exclusive with `mcp`.
   */
  handoff?: {
    /** Target app ID. */
    to: string
    /** Handoff intent. */
    intent: string
    /** Payload — values use `$<field-id>` references. */
    payload: Record<string, unknown>
  }

  /**
   * Human-in-the-Loop gate configuration.
   * When `require: true`, the Shell presents an approval dialog
   * before executing `mcp` or `handoff`.
   */
  hitl?: HITLConfig

  /**
   * Conditional enable expression.
   * Button is disabled when this evaluates to falsy.
   * @example "$when != null"
   */
  enabled_when?: string

  /**
   * Conditional visibility expression.
   * Button is hidden when this evaluates to falsy.
   */
  visible_when?: string

  /** Feedback shown after successful execution. */
  on_success?: ActionFeedback

  /** Feedback shown after a failed execution. */
  on_error?: ActionFeedback
}

// ---------------------------------------------------------------------------
// HITL config
// ---------------------------------------------------------------------------

/**
 * Human-in-the-Loop configuration for a `SchemaAction`.
 */
export interface HITLConfig {
  /**
   * Whether to show an approval dialog before executing this action.
   * @default false
   */
  require: boolean

  /**
   * Preview type rendered inside the approval dialog.
   * - `"text-summary"` — shows text field content
   * - `"schedule-summary"` — shows datetime / recurrence
   * - `"diff"` — shows before / after diff
   * - `"custom-markdown"` — renders `preview_template`
   */
  preview?: "text-summary" | "schedule-summary" | "diff" | "custom-markdown"

  /**
   * Markdown template used when `preview === "custom-markdown"`.
   * Use `{{field_id}}` placeholders for dynamic values.
   */
  preview_template?: string
}

// ---------------------------------------------------------------------------
// Action feedback
// ---------------------------------------------------------------------------

/**
 * Feedback configuration shown after an action completes.
 */
export interface ActionFeedback {
  /**
   * Toast message.
   * Supports `{{error}}` placeholder in `on_error`.
   */
  toast?: string

  /**
   * Navigation target — panel ID or URL to open after the action.
   */
  navigate?: string
}

// ---------------------------------------------------------------------------
// Widget (generic field resolved at runtime)
// ---------------------------------------------------------------------------

/**
 * A resolved widget instance produced by the Schema Renderer.
 * App developers typically work with `SchemaField`; `Widget` is used
 * internally by the Shell and in test utilities.
 */
export interface Widget {
  /** Resolved field ID. */
  id: string

  /** Widget type. */
  type: WidgetType

  /** Current value. */
  value: unknown

  /** Whether the field is currently visible. */
  visible: boolean

  /** Whether the field is currently enabled. */
  enabled: boolean
}
