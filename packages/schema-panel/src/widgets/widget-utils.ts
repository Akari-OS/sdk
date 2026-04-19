/**
 * widget-utils.ts
 *
 * Shared utility helpers used by all Widget components.
 * Keeps individual widget files lean.
 */

import type { WidgetSpec, RenderContext } from "./widget-types";

/** Resolve an i18n template or return the raw string unchanged. */
export function resolveLabel(
  value: string | undefined,
  ctx: RenderContext
): string | undefined {
  if (!value) return undefined;
  return ctx.i18n.resolve(value);
}

/**
 * Evaluate a Panel Schema v0 visibility/enabled expression.
 * Returns true when no expression is set (visible / enabled by default).
 */
export function evalExpr(
  expr: string | undefined,
  ctx: RenderContext
): boolean {
  if (!expr) return true;
  return ctx.expr.evaluate(expr);
}

/**
 * Derive the effective `disabled` state for a widget from:
 *  1. `spec.disabled` (static override)
 *  2. `spec.enabled_when` expression result
 *  3. parent-level `disabled` prop (e.g. from a containing Section)
 */
export function resolveDisabled(
  spec: WidgetSpec,
  ctx: RenderContext,
  parentDisabled?: boolean
): boolean {
  if (parentDisabled) return true;
  if (spec.disabled) return true;
  if (spec.enabled_when) return !ctx.expr.evaluate(spec.enabled_when);
  return false;
}

/**
 * Return null (hide) when `spec.visible_when` evaluates to false.
 * Use this at the top of each widget render: `if (!isVisible(spec, ctx)) return null;`
 */
export function isVisible(spec: WidgetSpec, ctx: RenderContext): boolean {
  return evalExpr(spec.visible_when, ctx);
}
