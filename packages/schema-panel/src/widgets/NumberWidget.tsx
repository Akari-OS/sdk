/**
 * NumberWidget.tsx
 *
 * Handles widget types: "number" | "stepper" | "slider"
 *
 * Shell-side import note:
 *   @/components/ui/input  — shadcn Input (Shell resolves path)
 *   @/components/ui/slider — shadcn Slider (Shell resolves path)
 */

import React from "react";
// TODO: Shell resolves these paths via tsconfig path alias "@/"
// import { Input }  from "@/components/ui/input";
// import { Slider } from "@/components/ui/slider";

import type { WidgetProps } from "./widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "./widget-utils";

type NumberValue = number | null;

/**
 * NumberWidget
 *
 * Covers three numeric widget variants:
 *  - "number"  → plain numeric <input> with optional step / precision
 *  - "stepper" → numeric input with +/- stepper buttons (used by Notion schema: db_page_size)
 *  - "slider"  → horizontal range slider between min and max
 */
export const NumberWidget: React.FC<WidgetProps<NumberValue>> = ({
  spec,
  value,
  onChange,
  context,
  disabled: parentDisabled,
}) => {
  if (!isVisible(spec, context)) return null;

  const disabled = resolveDisabled(spec, context, parentDisabled);
  const label = resolveLabel(spec.label, context);
  const helperText = resolveLabel(spec.helperText ?? spec.help, context);

  const step = spec.step ?? 1;
  const min = spec.min ?? -Infinity;
  const max = spec.max ?? Infinity;
  const precision = spec.precision ?? 0;

  const clamp = (v: number) =>
    Math.max(
      spec.min ?? -Infinity,
      Math.min(spec.max ?? Infinity, v)
    );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "" || raw === "-") {
      onChange(null);
      return;
    }
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) onChange(clamp(parseFloat(parsed.toFixed(precision))));
  };

  const increment = () =>
    onChange(clamp(parseFloat(((value ?? 0) + step).toFixed(precision))));
  const decrement = () =>
    onChange(clamp(parseFloat(((value ?? 0) - step).toFixed(precision))));

  return (
    <div className="widget-number flex flex-col gap-1">
      {label && (
        <label htmlFor={spec.id} className="text-sm font-medium">
          {label}
          {spec.required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}

      {spec.type === "slider" ? (
        // TODO: replace with shadcn <Slider> once Shell resolves @/
        <input
          id={spec.id}
          type="range"
          value={value ?? spec.min ?? 0}
          min={spec.min}
          max={spec.max}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full accent-primary disabled:opacity-50"
        />
      ) : spec.type === "stepper" ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={decrement}
            disabled={disabled || (value ?? 0) <= min}
            className="h-8 w-8 rounded-md border text-sm font-medium disabled:opacity-50 hover:bg-accent"
            aria-label="decrement"
          >
            −
          </button>
          <input
            id={spec.id}
            type="number"
            value={value ?? ""}
            onChange={handleInputChange}
            disabled={disabled}
            min={spec.min}
            max={spec.max}
            step={step}
            className="w-20 rounded-md border bg-background px-2 py-1 text-center text-sm disabled:opacity-50"
            // TODO: replace with shadcn <Input>
          />
          <button
            type="button"
            onClick={increment}
            disabled={disabled || (value ?? 0) >= max}
            className="h-8 w-8 rounded-md border text-sm font-medium disabled:opacity-50 hover:bg-accent"
            aria-label="increment"
          >
            +
          </button>
        </div>
      ) : (
        // type === "number"
        <input
          id={spec.id}
          type="number"
          value={value ?? ""}
          onChange={handleInputChange}
          disabled={disabled}
          min={spec.min}
          max={spec.max}
          step={step}
          className="rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
          // TODO: replace with shadcn <Input>
        />
      )}

      {spec.type === "slider" && value !== null && value !== undefined && (
        <p className="text-xs text-muted-foreground text-right">{value}</p>
      )}

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

NumberWidget.displayName = "NumberWidget";
