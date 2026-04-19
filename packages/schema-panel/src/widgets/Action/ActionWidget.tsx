/**
 * ActionWidget.tsx
 *
 * Widget type: "action" / "button" / "link" (Action category)
 *
 * Renders an action trigger: button, submit button, or link.
 * On click, dispatches the action to context.action.invoke(), which the engine
 * then resolves against the Action spec (MCP call / handoff / HITL gate).
 *
 * The widget itself does NOT perform MCP calls — it is a thin dispatch layer.
 * All logic (HITL confirmation, MCP invocation, on_success/on_error toasts) lives
 * in the engine's ActionDispatcher (Phase 3a).
 *
 * Shell-side import note:
 *   @/components/ui/button — shadcn Button
 */

import React, { useState } from "react";
// TODO: Shell resolves "@/" via tsconfig path alias
// import { Button } from "@/components/ui/button";

import type { WidgetProps } from "../widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "../widget-utils";

/**
 * ActionWidget has no meaningful "value" — it's a pure trigger.
 * We use `null` as the value type.
 */
type ActionValue = null;

/** Maps Panel Schema v0 action kind to a CSS class cluster */
const KIND_STYLES: Record<string, string> = {
  primary:
    "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent",
  secondary:
    "bg-secondary text-secondary-foreground hover:bg-secondary/80 border-secondary",
  destructive:
    "bg-destructive text-destructive-foreground hover:bg-destructive/90 border-transparent",
  ghost:
    "bg-transparent text-foreground hover:bg-accent border-transparent",
  link:
    "bg-transparent text-primary underline-offset-4 hover:underline border-transparent px-0",
};

/**
 * ActionWidget
 *
 * Renders:
 *  - "button" / "action": styled button dispatching to context.action.invoke
 *  - "link": anchor-like button (rendered as <button> for accessibility)
 *  - "submit": special kind that signals form submission to engine
 *
 * Loading state: while action is in-flight, button shows spinner + is disabled.
 * Error state: on_error is handled by engine's ActionDispatcher (toast); widget resets.
 *
 * enabled_when / visible_when apply normally via resolveDisabled / isVisible.
 */
export const ActionWidget: React.FC<WidgetProps<ActionValue>> = ({
  spec,
  value: _value,
  onChange: _onChange,
  context,
  disabled: parentDisabled,
}) => {
  if (!isVisible(spec, context)) return null;

  const disabled = resolveDisabled(spec, context, parentDisabled);
  const label = resolveLabel(spec.label, context);
  const kind = (spec.kind as string | undefined) ?? "secondary";
  const actionId = spec.action_id ?? spec.id;

  const [loading, setLoading] = useState(false);

  const kindStyle = KIND_STYLES[kind] ?? KIND_STYLES.secondary;

  const handleClick = async () => {
    if (loading || disabled) return;
    setLoading(true);
    try {
      // Engine's ActionDispatcher handles:
      //  1. Evaluating the bound ActionSpec (MCP / handoff / HITL)
      //  2. HITL confirmation dialog (if action.hitl.require === true)
      //  3. MCP tool invocation
      //  4. on_success / on_error toast + navigation
      await context.action.invoke(actionId as string, {
        // Widget can pass additional runtime context here if needed
        _widgetId: spec.id,
      });
    } catch {
      // on_error is handled by engine; widget just resets loading state
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type={kind === "submit" ? "submit" : "button"}
      id={spec.id}
      onClick={handleClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-1.5 rounded-md border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 ${kindStyle}`}
      aria-busy={loading}
      aria-label={label}
      // TODO: replace with shadcn <Button variant={kind}> once Shell resolves "@/"
    >
      {loading && (
        /* Spinner stub — replace with Lucide Loader2 icon + animate-spin */
        <span className="h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin shrink-0" />
      )}
      {label ?? spec.id}
    </button>
  );
};

ActionWidget.displayName = "ActionWidget";
