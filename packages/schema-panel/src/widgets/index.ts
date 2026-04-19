/**
 * widgets/index.ts
 *
 * Master barrel export for all Schema Panel widgets.
 * Provides `registerAllWidgets(registry)` to wire widgets into Phase 3a's WidgetRegistry.
 *
 * Usage (Phase 3a engine init):
 *   import { registerAllWidgets } from "./widgets";
 *   import { createWidgetRegistry } from "./engine/WidgetRegistry"; // Phase 3a
 *
 *   const registry = createWidgetRegistry();
 *   registerAllWidgets(registry);
 *
 * TODO: Phase 3a integration
 *   - Replace `WidgetRegistry` import with the real engine implementation:
 *     import { WidgetRegistry } from "../engine/WidgetRegistry";
 *   - Remove the local WidgetRegistry interface from widget-types.ts
 */

// ---------------------------------------------------------------------------
// Re-export shared types (convenience — consumers can import from here)
// ---------------------------------------------------------------------------
export type {
  WidgetProps,
  WidgetSpec,
  WidgetRegistry,
  RenderContext,
  Widget,
} from "./widget-types";

// ---------------------------------------------------------------------------
// Individual widget exports (direct imports for Full-Tier usage, Panel Schema v0 §6.9)
// ---------------------------------------------------------------------------

// Text input
export { TextWidget } from "./TextWidget";

// Number
export { NumberWidget } from "./NumberWidget";

// Selection
export { SelectWidget } from "./SelectWidget";

// DateTime
export { DateTimeWidget } from "./DateTimeWidget";

// AKARI-specific
export { PoolPickerWidget } from "./PoolPickerWidget";
export { AmpQueryWidget } from "./AmpQueryWidget";

// Documents
export {
  RichTextEditorWidget,
  DocOutlineTreeWidget,
  SheetRowPickerWidget,
  CellRangePickerWidget,
  SlideTemplatePickerWidget,
  SlidePreviewWidget,
} from "./Documents";

// Structural
export {
  SectionWidget,
  TabsWidget,
  RepeatWidget,
} from "./Structural";

// Display
export {
  TableWidget,
  MarkdownWidget,
  TextDisplayWidget,
} from "./Display";

// Action
export { ActionWidget } from "./Action";

// ---------------------------------------------------------------------------
// WidgetRegistry registration
// ---------------------------------------------------------------------------

import type { Widget, WidgetRegistry } from "./widget-types";
import { TextWidget } from "./TextWidget";
import { NumberWidget } from "./NumberWidget";
import { SelectWidget } from "./SelectWidget";
import { DateTimeWidget } from "./DateTimeWidget";
import { PoolPickerWidget } from "./PoolPickerWidget";
import { AmpQueryWidget } from "./AmpQueryWidget";
import {
  RichTextEditorWidget,
  DocOutlineTreeWidget,
  SheetRowPickerWidget,
  CellRangePickerWidget,
  SlideTemplatePickerWidget,
  SlidePreviewWidget,
} from "./Documents";
import { SectionWidget, TabsWidget, RepeatWidget } from "./Structural";
import { TableWidget, MarkdownWidget, TextDisplayWidget } from "./Display";
import { ActionWidget } from "./Action";

/**
 * registerAllWidgets
 *
 * Register every Panel Schema v0 widget into the provided WidgetRegistry.
 * Call once during engine initialization.
 *
 * @param registry - Phase 3a's WidgetRegistry instance
 */
export function registerAllWidgets(registry: WidgetRegistry): void {
  // --- Text input widgets ---
  registry.register("text", TextWidget as Widget);
  registry.register("textarea", TextWidget as Widget);
  registry.register("password", TextWidget as Widget);
  registry.register("email", TextWidget as Widget);
  registry.register("url", TextWidget as Widget);

  // --- Number widgets ---
  registry.register("number", NumberWidget as Widget);
  registry.register("stepper", NumberWidget as Widget);
  registry.register("slider", NumberWidget as Widget);

  // --- Selection widgets ---
  registry.register("select", SelectWidget as Widget);
  registry.register("multi-select", SelectWidget as Widget);
  registry.register("radio", SelectWidget as Widget);
  registry.register("checkbox", SelectWidget as Widget);
  registry.register("toggle", SelectWidget as Widget);

  // --- DateTime widgets ---
  registry.register("date", DateTimeWidget as Widget);
  registry.register("time", DateTimeWidget as Widget);
  registry.register("datetime", DateTimeWidget as Widget);
  registry.register("datetime-optional", DateTimeWidget as Widget);
  registry.register("duration", DateTimeWidget as Widget);

  // --- AKARI-specific widgets ---
  registry.register("pool-picker", PoolPickerWidget as Widget);
  registry.register("amp-query", AmpQueryWidget as Widget);

  // --- Documents widgets ---
  registry.register("rich-text-editor", RichTextEditorWidget as Widget);
  registry.register("doc-outline-tree", DocOutlineTreeWidget as Widget);
  registry.register("sheet-row-picker", SheetRowPickerWidget as Widget);
  registry.register("cell-range-picker", CellRangePickerWidget as Widget);
  registry.register("slide-template-picker", SlideTemplatePickerWidget as Widget);
  registry.register("slide-preview", SlidePreviewWidget as Widget);

  // --- Structural widgets ---
  registry.register("section", SectionWidget as Widget);
  registry.register("group", SectionWidget as Widget); // alias: Panel Schema v0 §6.2 "group"
  registry.register("tabs", TabsWidget as Widget);
  registry.register("repeat", RepeatWidget as Widget);
  registry.register("repeater", RepeatWidget as Widget); // alias: Panel Schema v0 §6.2 "repeater"

  // --- Display widgets ---
  registry.register("table", TableWidget as Widget);
  registry.register("markdown", MarkdownWidget as Widget);
  registry.register("text-display", TextDisplayWidget as Widget);
  registry.register("stat", TextDisplayWidget as Widget);
  registry.register("badge", TextDisplayWidget as Widget);
  registry.register("progress", TextDisplayWidget as Widget);
  registry.register("divider", TextDisplayWidget as Widget);

  // --- Action widgets ---
  registry.register("action", ActionWidget as Widget);
  registry.register("button", ActionWidget as Widget);
  registry.register("link", ActionWidget as Widget);
  registry.register("submit", ActionWidget as Widget);
}

// ---------------------------------------------------------------------------
// Widget type → component map (static lookup, useful for debugging / tooling)
// ---------------------------------------------------------------------------

export const WIDGET_TYPE_MAP: Readonly<Record<string, Widget>> = {
  text: TextWidget as Widget,
  textarea: TextWidget as Widget,
  password: TextWidget as Widget,
  email: TextWidget as Widget,
  url: TextWidget as Widget,

  number: NumberWidget as Widget,
  stepper: NumberWidget as Widget,
  slider: NumberWidget as Widget,

  select: SelectWidget as Widget,
  "multi-select": SelectWidget as Widget,
  radio: SelectWidget as Widget,
  checkbox: SelectWidget as Widget,
  toggle: SelectWidget as Widget,

  date: DateTimeWidget as Widget,
  time: DateTimeWidget as Widget,
  datetime: DateTimeWidget as Widget,
  "datetime-optional": DateTimeWidget as Widget,
  duration: DateTimeWidget as Widget,

  "pool-picker": PoolPickerWidget as Widget,
  "amp-query": AmpQueryWidget as Widget,

  "rich-text-editor": RichTextEditorWidget as Widget,
  "doc-outline-tree": DocOutlineTreeWidget as Widget,
  "sheet-row-picker": SheetRowPickerWidget as Widget,
  "cell-range-picker": CellRangePickerWidget as Widget,
  "slide-template-picker": SlideTemplatePickerWidget as Widget,
  "slide-preview": SlidePreviewWidget as Widget,

  section: SectionWidget as Widget,
  group: SectionWidget as Widget,
  tabs: TabsWidget as Widget,
  repeat: RepeatWidget as Widget,
  repeater: RepeatWidget as Widget,

  table: TableWidget as Widget,
  markdown: MarkdownWidget as Widget,
  "text-display": TextDisplayWidget as Widget,
  stat: TextDisplayWidget as Widget,
  badge: TextDisplayWidget as Widget,
  progress: TextDisplayWidget as Widget,
  divider: TextDisplayWidget as Widget,

  action: ActionWidget as Widget,
  button: ActionWidget as Widget,
  link: ActionWidget as Widget,
  submit: ActionWidget as Widget,
};
