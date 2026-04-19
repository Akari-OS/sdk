/**
 * SectionWidget.tsx
 *
 * Widget type: "section" (structural / layout)
 *
 * Groups child widgets under an optional heading with collapsible support.
 * Passes disabled state down to all children.
 * Children are rendered by the engine's WidgetRenderer (not directly by this widget).
 *
 * Shell-side import note:
 *   @/components/ui/separator — shadcn Separator (divider under heading)
 */

import React, { useState } from "react";
// TODO: Shell resolves "@/" via tsconfig path alias
// import { Separator } from "@/components/ui/separator";

import type { WidgetProps } from "../widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "../widget-utils";

/**
 * SectionWidget value: record mapping child field ids to their values.
 * The engine aggregates and distributes child values.
 * TODO: Phase 3a — confirm section value shape with engine design.
 */
type SectionValue = Record<string, unknown>;

/**
 * SectionWidget
 *
 * Renders a labeled group box around child widgets.
 * When `spec.collapsible` is true, shows a toggle button to expand/collapse.
 * disabled_when / visible_when apply at the section level, propagated to children
 * via the `disabled` prop of each child widget.
 *
 * Note: Actual child rendering is delegated to the engine's WidgetRenderer.
 * The engine calls this component and passes a `children` render prop.
 * TODO: Phase 3a — confirm whether children prop or spec.children iteration is used.
 */
export const SectionWidget: React.FC<
  WidgetProps<SectionValue> & { children?: React.ReactNode }
> = ({ spec, value: _value, onChange: _onChange, context, disabled: parentDisabled, children }) => {
  if (!isVisible(spec, context)) return null;

  const disabled = resolveDisabled(spec, context, parentDisabled);
  const label = resolveLabel(spec.label, context);
  const helperText = resolveLabel(spec.helperText ?? spec.help, context);

  const collapsible = Boolean(spec.collapsible);
  const defaultExpanded = spec.default_expanded !== false; // true by default
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <fieldset
      disabled={disabled}
      className={`widget-section rounded-md border px-3 pt-2 pb-3 ${
        disabled ? "opacity-50" : ""
      }`}
    >
      {label && (
        <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold">
          {label}
          {collapsible && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-muted-foreground text-[10px] hover:text-foreground"
              aria-expanded={expanded}
              aria-label={expanded ? "collapse section" : "expand section"}
            >
              {expanded ? "▼" : "▶"}
            </button>
          )}
        </legend>
      )}

      {(!collapsible || expanded) && (
        <div className="flex flex-col gap-3 mt-1">
          {/*
           * Engine renders child widgets here.
           * When engine passes a `children` render prop, it appears below.
           * When engine iterates spec.children directly, this <div> is the mount point.
           * TODO: Phase 3a — confirm child rendering strategy.
           */}
          {children ?? (
            <p className="text-xs text-muted-foreground">
              {/* Shown only in dev when engine hasn't injected children */}
              {spec.children && spec.children.length > 0
                ? `${spec.children.length} child widget(s) — engine renders these`
                : "No children defined in spec.children"}
            </p>
          )}
        </div>
      )}

      {helperText && (
        <p className="text-xs text-muted-foreground mt-1">{helperText}</p>
      )}
    </fieldset>
  );
};

SectionWidget.displayName = "SectionWidget";
