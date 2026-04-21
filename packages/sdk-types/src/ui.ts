/**
 * @file ui.ts
 * Type definitions for the AKARI App SDK — UI API (Shell API).
 *
 * Apps must NOT create their own windows or DOM nodes outside the Shell's
 * managed surfaces. All UI is presented through Panel, Dialog, Toast,
 * Notification, or HITL Preview surfaces exposed by this API.
 *
 * @see https://github.com/Akari-OS/sdk/blob/main/docs/api-reference/ui-api.md
 */

import type { PanelSchema } from "./panel-schema.js"

// ---------------------------------------------------------------------------
// Common utilities
// ---------------------------------------------------------------------------

/** Unsubscribe function returned by event-subscription methods. */
export type Unsubscribe = () => void

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/** Available slots inside the Shell WorkspaceHost. */
export type PanelSlot = "toolPalette" | "editor" | "inspector" | "chat"

/**
 * Options for mounting a Full Tier React Panel.
 * @see {@link ShellAPI.mountPanel}
 */
export interface PanelMountOptions {
  /**
   * Globally unique panel ID.
   * Recommended format: `"<app-id>.<slot-name>"`.
   * @example "com.akari.writer.inspector"
   */
  id: string

  /** WorkspaceHost slot where the panel appears by default. */
  defaultPosition: PanelSlot

  /** Title shown in the panel tab and tooltip. */
  title: string

  /** Icon name from the Shell icon set. */
  icon?: string

  /**
   * React component to render (Full Tier only).
   * Must be a pure functional component — no direct DOM manipulation.
   */
  component: unknown // typed as `React.ComponentType` at call-site

  /** Minimum panel width in pixels. Defaults to Shell minimum. */
  minWidth?: number

  /** Default panel width in pixels. Defaults to Shell default. */
  defaultWidth?: number

  /**
   * Whether the panel can be collapsed.
   * @default false
   */
  collapsible?: boolean
}

/**
 * Options for mounting a Panel Schema (MCP-Declarative Tier).
 * @see {@link ShellAPI.mountSchemaPanel}
 */
export interface SchemaPanelMountOptions {
  /** Globally unique panel ID. */
  id: string

  /** WorkspaceHost slot. */
  defaultPosition: PanelSlot

  /** Panel title. */
  title: string

  /**
   * Panel Schema v0 object (inline) or relative path to a
   * `panel.schema.json` file.
   */
  schema: PanelSchema | string

  /** Whether the panel can be collapsed. */
  collapsible?: boolean
}

/**
 * Text selection event payload fired by `shell.onSelection()`.
 */
export interface TextSelection {
  /** The selected text content. */
  text: string

  /** Start character offset. */
  start: number

  /** End character offset. */
  end: number

  /** ID of the panel where the selection occurred. */
  sourcePanelId: string
}

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

/**
 * Options for `shell.dialog.show()`.
 */
export interface DialogOptions {
  /** Dialog title. */
  title: string

  /**
   * Dialog body.
   * String for plain text; pass a React node (typed as `unknown` here
   * to keep this package free of React peer-dependency) for rich content.
   */
  content: string | unknown

  /** Action buttons shown at the bottom of the dialog. */
  actions: DialogAction[]

  /**
   * Dialog size.
   * @default "medium"
   */
  size?: "small" | "medium" | "large" | "fullscreen"

  /**
   * Whether clicking the backdrop dismisses the dialog.
   * @default true
   */
  dismissable?: boolean
}

/**
 * A single button in a `DialogOptions.actions` array.
 */
export interface DialogAction {
  /** Button label. */
  label: string

  /**
   * Visual intent.
   * @default "secondary"
   */
  kind?: "primary" | "secondary" | "destructive" | "ghost"

  /**
   * The value resolved in `DialogResult.action` when this button is clicked.
   */
  value: string

  /**
   * Optional keyboard shortcut binding.
   * - `"enter"` — triggered by the Enter key
   * - `"escape"` — triggered by the Escape key
   */
  shortcut?: "enter" | "escape"
}

/**
 * Return value from `shell.dialog.show()`.
 */
export interface DialogResult {
  /**
   * `value` of the button that was clicked, or `null` if the dialog was
   * dismissed by clicking the backdrop.
   */
  action: string | null
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

/**
 * Options for `shell.toast.*()` methods.
 */
export interface ToastOptions {
  /**
   * Auto-dismiss delay in milliseconds.
   * @default 3000
   */
  duration?: number

  /** Optional inline action link (e.g. "Undo"). */
  action?: {
    label: string
    onClick: () => void
  }

  /** Collapsible detail text shown below the main message. */
  detail?: string
}

// ---------------------------------------------------------------------------
// Notification
// ---------------------------------------------------------------------------

/**
 * Options for `shell.notification.push()`.
 * Unlike Toast, notifications persist in the notification center until
 * dismissed manually (unless `autoDismiss` is set).
 */
export interface NotificationOptions {
  /** Notification title. */
  title: string

  /** Notification body text. */
  body: string

  /** Visual intent. */
  kind: "success" | "error" | "info" | "warning"

  /** Action buttons shown in the notification. */
  actions?: Array<{
    label: string
    onClick: () => void
  }>

  /**
   * Automatically remove the notification after a short delay.
   * @default false
   */
  autoDismiss?: boolean
}

// ---------------------------------------------------------------------------
// HITL Preview
// ---------------------------------------------------------------------------

/**
 * Discriminated union of HITL preview content templates.
 * Matches `preview` values from Panel Schema v0 `action.hitl.preview`.
 */
export type HITLTemplate =
  | { kind: "text-summary"; text: string; charCount?: number; platform?: string }
  | { kind: "schedule-summary"; datetime: Date; recurrence?: string; timezone?: string }
  | { kind: "diff"; before: string; after: string; label?: string }
  | { kind: "custom-markdown"; markdown: string }

/**
 * Options for `shell.preview.show()`.
 * Presents a Human-in-the-Loop confirmation dialog before an irreversible
 * external action (post, delete, charge, etc.).
 */
export interface HITLPreviewOptions {
  /**
   * Preview type — controls which template is rendered inside the dialog.
   * - `"text-summary"` — displays a text field summary (post body, etc.)
   * - `"schedule-summary"` — displays a datetime / recurrence summary
   * - `"diff"` — displays a before/after diff (destructive operations)
   * - `"custom-markdown"` — renders arbitrary Markdown
   */
  type: "text-summary" | "schedule-summary" | "diff" | "custom-markdown"

  /** Dialog title. */
  title: string

  /**
   * Template data for the chosen `type`.
   * The `kind` discriminant must match `type`.
   */
  template: HITLTemplate

  /**
   * Label for the approval button.
   * @default "Approve"
   */
  approveLabel?: string

  /**
   * Label for the rejection button.
   * @default "Cancel"
   */
  rejectLabel?: string

  /**
   * Async callback invoked immediately before the Promise resolves
   * when the user approves. Use this for the actual side-effecting action.
   */
  onApprove?: () => Promise<void> | void

  /** Callback invoked when the user rejects. */
  onReject?: () => void
}

/**
 * Return value from `shell.preview.show()`.
 */
export interface HITLPreviewResult {
  /** The user's decision. */
  decision: "approved" | "rejected"
}

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/**
 * Current Shell theme information.
 * Returned by `shell.theme.get()` and emitted to `shell.theme.onChange()`.
 */
export interface ThemeInfo {
  /** Color mode. */
  mode: "dark" | "light"

  /** Primary brand color (use CSS custom properties in practice). */
  primaryColor: string

  /** Surface / background color. */
  surfaceColor: string

  /** Default text color. */
  textColor: string
}

// ---------------------------------------------------------------------------
// Workspace
// ---------------------------------------------------------------------------

/**
 * Current Shell workspace state.
 * Returned by `shell.workspace.current` and emitted to
 * `shell.workspace.onChange()`.
 */
export interface WorkspaceContext {
  /** Currently open Work, or `null` when no Work is active. */
  work: {
    id: string
    title: string
    appType: "writer" | "video" | "chat" | string
    status: "draft" | "published" | "archived"
  } | null

  /** ID of the panel that currently has focus, or `null`. */
  activePanelId: string | null

  /** ID of the currently active App. */
  activeAppId: string

  /**
   * Active platform tab key (e.g. `"x"`, `"bluesky"`) used by apps
   * like Writer that support multiple output platforms.
   */
  activePlatform: string | null
}

// ---------------------------------------------------------------------------
// ShellAPI interface
// ---------------------------------------------------------------------------

/**
 * The `shell` object exported from `@akari-os/sdk`.
 * Provides all Shell UI surfaces available to App code.
 */
export interface ShellAPI {
  // -- Panel mounting --

  /** Mount a Full Tier React component as a panel. */
  mountPanel(options: PanelMountOptions): void

  /** Mount a Panel Schema (MCP-Declarative Tier) as a panel. */
  mountSchemaPanel(options: SchemaPanelMountOptions): void

  /** Panel navigation and visibility controls. */
  panel: {
    /** Focus (activate) a panel by ID. */
    focus(id: string): void
    /** Show a hidden panel. */
    show(id: string): void
    /** Hide a visible panel. */
    hide(id: string): void
    /** Toggle panel visibility. */
    toggle(id: string): void
  }

  // -- Panel events --

  /** Subscribe to focus events for the current panel. */
  onFocus(callback: () => void): Unsubscribe

  /** Subscribe to blur events for the current panel. */
  onBlur(callback: () => void): Unsubscribe

  /** Subscribe to text-selection events. */
  onSelection(callback: (selection: TextSelection) => void): Unsubscribe

  /** Get the current text/element selection, or `null` if none. */
  getCurrentSelection(): Promise<TextSelection | null>

  // -- Dialog --

  dialog: {
    /** Show a modal dialog and await the user's button choice. */
    show(options: DialogOptions): Promise<DialogResult>
  }

  // -- Toast --

  toast: {
    /** Show a success toast. */
    success(message: string, options?: ToastOptions): void
    /** Show an error toast. */
    error(message: string, options?: ToastOptions): void
    /** Show an informational toast. */
    info(message: string, options?: ToastOptions): void
    /** Show a warning toast. */
    warning(message: string, options?: ToastOptions): void
  }

  // -- Notification --

  notification: {
    /** Push a persistent notification to the notification center. Returns the notification ID. */
    push(options: NotificationOptions): string
    /** Dismiss a specific notification. */
    dismiss(id: string): void
    /** Dismiss all notifications for this app. */
    dismissAll(): void
  }

  // -- HITL Preview --

  preview: {
    /** Show a Human-in-the-Loop confirmation dialog. */
    show(options: HITLPreviewOptions): Promise<HITLPreviewResult>
  }

  // -- Theme --

  theme: {
    /** Get the current theme synchronously. */
    get(): ThemeInfo
    /** Subscribe to theme changes. */
    onChange(callback: (theme: ThemeInfo) => void): Unsubscribe
  }

  // -- i18n --

  i18n: {
    /**
     * Resolve an i18n key such as `"{{t:post.body}}"` to the localised string.
     * Falls back to `en.json`, then to the raw key string.
     */
    resolve(key: string): string
    /** Current locale code (read-only). */
    readonly locale: string
    /** Subscribe to locale changes. */
    onLocaleChange(callback: (locale: string) => void): Unsubscribe
  }

  // -- Workspace --

  workspace: {
    /** Current workspace state (synchronous read). */
    readonly current: WorkspaceContext
    /** Subscribe to workspace context changes. */
    onChange(callback: (context: WorkspaceContext) => void): Unsubscribe
  }
}
