/**
 * DateTimeWidget.tsx
 *
 * Handles widget types: "date" | "time" | "datetime" | "datetime-optional" | "duration"
 *
 * Shell-side import note:
 *   @/components/ui/calendar      — shadcn Calendar (date picker)
 *   @/components/ui/popover       — shadcn Popover (calendar trigger)
 *   @/components/ui/button        — shadcn Button
 *   @/components/ui/input         — shadcn Input (time / duration)
 */

import React from "react";
// TODO: Shell resolves these paths via tsconfig path alias "@/"
// import { Calendar }    from "@/components/ui/calendar";
// import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
// import { Button }      from "@/components/ui/button";
// import { Input }       from "@/components/ui/input";

import type { WidgetProps } from "./widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "./widget-utils";

/**
 * DateTime value is an ISO 8601 string for date / datetime variants,
 * "HH:MM" string for time, ISO 8601 duration string for duration.
 * null is allowed for datetime-optional.
 */
type DateTimeValue = string | null;

/**
 * DateTimeWidget
 *
 * Variants:
 *  - "date"              → date only picker, value: "YYYY-MM-DD"
 *  - "time"              → time only input, value: "HH:MM"
 *  - "datetime"          → date + time picker, value: ISO 8601 datetime string (required)
 *  - "datetime-optional" → same as datetime but nullable (shows "clear" button)
 *  - "duration"          → ISO 8601 duration (e.g. "PT1H30M"), simple text input
 *
 * Implementation note:
 *   Using native <input type="date"/"time"/"datetime-local"> as a working baseline.
 *   TODO: replace with shadcn Calendar + Popover for polished UX consistent with Shell Theme.
 */
export const DateTimeWidget: React.FC<WidgetProps<DateTimeValue>> = ({
  spec,
  value,
  onChange,
  context,
  disabled: parentDisabled,
}) => {
  if (!isVisible(spec, context)) return null;

  const disabled = resolveDisabled(spec, context, parentDisabled);
  const label = resolveLabel(spec.label, context);
  const placeholder = resolveLabel(spec.placeholder, context);
  const helperText = resolveLabel(spec.helperText ?? spec.help, context);

  const isOptional = spec.type === "datetime-optional";
  const isDuration = spec.type === "duration";
  const isTimeOnly = spec.type === "time";
  const isDateOnly = spec.type === "date";

  const inputType = isDuration
    ? "text"
    : isTimeOnly
      ? "time"
      : isDateOnly
        ? "date"
        : "datetime-local";

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    onChange(v === "" ? null : v);
  };

  const handleClear = () => onChange(null);

  return (
    <div className="widget-datetime flex flex-col gap-1">
      {label && (
        <label htmlFor={spec.id} className="text-sm font-medium">
          {label}
          {spec.required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}

      <div className="flex items-center gap-2">
        <input
          id={spec.id}
          type={inputType}
          value={value ?? ""}
          onChange={handleChange}
          placeholder={placeholder ?? (isDuration ? "PT1H30M" : undefined)}
          disabled={disabled}
          className="rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50 flex-1"
          // TODO: replace date/datetime-local with shadcn Calendar + Popover pattern
        />
        {isOptional && value && (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled}
            className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
            aria-label="clear date"
          >
            ✕
          </button>
        )}
      </div>

      {isDuration && (
        <p className="text-xs text-muted-foreground">
          ISO 8601 duration (e.g. PT1H30M, P1D)
        </p>
      )}

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

DateTimeWidget.displayName = "DateTimeWidget";
