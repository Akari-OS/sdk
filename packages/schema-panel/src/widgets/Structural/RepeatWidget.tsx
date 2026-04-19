/**
 * RepeatWidget.tsx
 *
 * Widget type: "repeat" / "repeater" (structural / layout)
 *
 * Renders an array of identical sub-form instances.
 * Each item in the array is an instance of spec.item_schema (a nested WidgetSpec).
 * Used for "add another" patterns (e.g. multiple recipients, tag list, line items).
 *
 * Value: array of item value objects.
 *
 * Shell-side import note:
 *   @/components/ui/button — shadcn Button (add / remove)
 */

import React from "react";
// TODO: Shell resolves "@/" via tsconfig path alias
// import { Button } from "@/components/ui/button";

import type { WidgetProps, WidgetSpec } from "../widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "../widget-utils";

type RepeatValue = unknown[];

/**
 * RepeatWidget
 *
 * Renders a list of item sub-forms. Each item has:
 *  - A remove button
 *  - Sub-widgets rendered by the engine from spec.item_schema
 *
 * Add button appends a new empty item (spec.item_default or {}).
 * Max items: spec.max (default: unlimited).
 * Min items: spec.min (default: 0).
 *
 * TODO: Phase 3a — confirm how engine renders spec.item_schema for each array index.
 *   The engine likely needs to provide a `renderItem(index, itemValue, onItemChange)` prop.
 *   This widget manages the array shape; engine manages per-item widget rendering.
 */
export const RepeatWidget: React.FC<
  WidgetProps<RepeatValue> & {
    /**
     * Engine render prop: renders item_schema widgets for one array index.
     * Receives item value + onChange scoped to that index.
     */
    renderItem?: (params: {
      index: number;
      itemSpec: WidgetSpec;
      value: unknown;
      onChange: (v: unknown) => void;
    }) => React.ReactNode;
  }
> = ({ spec, value, onChange, context, disabled: parentDisabled, renderItem }) => {
  if (!isVisible(spec, context)) return null;

  const disabled = resolveDisabled(spec, context, parentDisabled);
  const label = resolveLabel(spec.label, context);
  const helperText = resolveLabel(spec.helperText ?? spec.help, context);

  const items: unknown[] = Array.isArray(value) ? value : [];
  const min = (spec.min as number | undefined) ?? 0;
  const max = (spec.max as number | undefined) ?? Infinity;
  const itemDefault = spec.item_default ?? {};

  const itemSchema = spec.item_schema as WidgetSpec | undefined;

  const addItem = () => {
    if (items.length >= max) return;
    onChange([...items, structuredClone(itemDefault)]);
  };

  const removeItem = (index: number) => {
    if (items.length <= min) return;
    onChange(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, newVal: unknown) => {
    const next = [...items];
    next[index] = newVal;
    onChange(next);
  };

  const addLabel = resolveLabel(
    (spec.add_label as string | undefined) ?? "Add item",
    context
  );

  return (
    <div className="widget-repeat flex flex-col gap-2">
      {label && (
        <p className="text-sm font-medium">
          {label}
          {spec.required && <span className="text-destructive ml-1">*</span>}
        </p>
      )}

      {/* Item list */}
      <div className="flex flex-col gap-2">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2 rounded-md border border-dashed">
            No items yet. Click "{addLabel}" to add one.
          </p>
        )}

        {items.map((item, index) => (
          <div
            key={index}
            className="relative rounded-md border bg-background px-3 pt-2 pb-3"
          >
            {/* Remove button */}
            {!disabled && items.length > min && (
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-destructive text-xs"
                aria-label={`Remove item ${index + 1}`}
              >
                ✕
              </button>
            )}

            {/* Item index label */}
            <p className="text-[10px] text-muted-foreground mb-1.5">
              #{index + 1}
            </p>

            {/* Engine renders item_schema widgets here */}
            {renderItem && itemSchema ? (
              renderItem({
                index,
                itemSpec: itemSchema,
                value: item,
                onChange: (v) => updateItem(index, v),
              })
            ) : (
              <p className="text-xs text-muted-foreground">
                {itemSchema
                  ? `Engine renders spec.item_schema (type: "${itemSchema.type}") — TODO: Phase 3a renderItem prop`
                  : "No spec.item_schema defined for this repeater."}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Add button */}
      {!disabled && items.length < max && (
        <button
          type="button"
          onClick={addItem}
          className="self-start rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
          // TODO: replace with shadcn <Button variant="outline" size="sm">
        >
          + {addLabel}
        </button>
      )}

      {max !== Infinity && (
        <p className="text-xs text-muted-foreground">
          {items.length} / {max} items
        </p>
      )}

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

RepeatWidget.displayName = "RepeatWidget";
