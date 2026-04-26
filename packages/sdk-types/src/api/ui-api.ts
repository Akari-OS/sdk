/**
 * @file api/ui-api.ts
 * Implementation skeleton for the AKARI UI API (Shell integration).
 *
 * Phase 0 stub: T-2 requirement. Full implementation deferred to Phase 1.
 */

import type {
  ShellAPI,
} from "../ui.js"

/**
 * The UI API for mounting panels and interacting with the Shell.
 * Extends ShellAPI with all panel mounting and notification methods.
 */
export interface UIAPI extends ShellAPI {
  // ShellAPI base methods: mountPanel, dialog, toast, notification, theme, etc.
  // No additional methods in Phase 0
}

/**
 * UI API implementation skeleton.
 * @throws {Error} "not implemented" — Phase 0 placeholder
 */
export function createUIAPI(): UIAPI {
  return {
    mountPanel() {
      throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
    },
    mountSchemaPanel() {
      throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
    },
    panel: {
      focus() {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
      show() {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
      hide() {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
      toggle() {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
    },
    onFocus() {
      throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
    },
    onBlur() {
      throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
    },
    onSelection() {
      throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
    },
    async getCurrentSelection() {
      throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
    },
    dialog: {
      async show() {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
    },
    toast: {
      success() {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
      error() {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
      info() {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
      warning() {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
    },
    notification: {
      push: () => {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
      dismiss: () => {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
      dismissAll: () => {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
    },
    preview: {
      show: async () => {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
    },
    theme: {
      get: () => {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
      onChange: () => {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
    },
    i18n: {
      resolve: () => {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
      locale: "en" as any,
      onLocaleChange: () => {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
    },
    workspace: {
      current: null as any,
      onChange: () => {
        throw new Error("UI API not implemented in Phase 0. Defer to Phase 1.")
      },
    },
  }
}
