/**
 * SelectWidget.tsx
 *
 * Handles widget types: "select" | "multi-select" | "radio" | "checkbox" | "toggle"
 *
 * Shell-side import note:
 *   @/components/ui/select         — shadcn Select
 *   @/components/ui/checkbox       — shadcn Checkbox
 *   @/components/ui/switch         — shadcn Switch (toggle)
 *   @/components/ui/radio-group    — shadcn RadioGroup
 */

import React from "react";
// TODO: Shell resolves these paths via tsconfig path alias "@/"
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { Checkbox }    from "@/components/ui/checkbox";
// import { Switch }      from "@/components/ui/switch";
// import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import type { SelectOption, WidgetProps } from "./widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "./widget-utils";

type SelectValue = string | string[] | boolean | null;

/**
 * SelectWidget
 *
 * Covers selection variants:
 *  - "select"       → dropdown (single value)
 *  - "multi-select" → multi-value chips / checkboxes
 *  - "radio"        → radio button group
 *  - "checkbox"     → single boolean checkbox (rare; usually "toggle" is preferred)
 *  - "toggle"       → boolean switch / toggle
 *
 * Note: `options_source` (dynamic options from MCP) requires runtime resolution by
 * the engine before this widget renders. The engine should pre-resolve and inject
 * resolved options into `spec.options`. Widget only handles static options.
 * TODO: Phase 3a — confirm how engine passes resolved options_source back into spec.
 */
export const SelectWidget: React.FC<WidgetProps<SelectValue>> = ({
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

  const options: SelectOption[] = (spec.options ?? []).map((o) => ({
    value: o.value,
    label: context.i18n.resolve(o.label),
  }));

  // --- toggle / checkbox ---
  if (spec.type === "toggle" || spec.type === "checkbox") {
    const checked = Boolean(value);
    return (
      <div className="widget-toggle flex items-center gap-2">
        {/* TODO: replace with shadcn <Switch> (toggle) or <Checkbox> */}
        <input
          id={spec.id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="h-4 w-4 accent-primary disabled:opacity-50"
        />
        {label && (
          <label htmlFor={spec.id} className="text-sm font-medium cursor-pointer">
            {label}
          </label>
        )}
        {helperText && (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        )}
      </div>
    );
  }

  // --- radio ---
  if (spec.type === "radio") {
    return (
      <div className="widget-radio flex flex-col gap-1">
        {label && (
          <p className="text-sm font-medium">
            {label}
            {spec.required && <span className="text-destructive ml-1">*</span>}
          </p>
        )}
        {/* TODO: replace with shadcn <RadioGroup> */}
        <div className="flex flex-col gap-1 pl-1">
          {options.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name={spec.id}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange(opt.value)}
                disabled={disabled}
                className="accent-primary disabled:opacity-50"
              />
              {opt.label}
            </label>
          ))}
        </div>
        {helperText && (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        )}
      </div>
    );
  }

  // --- multi-select ---
  if (spec.type === "multi-select") {
    const selected: string[] = Array.isArray(value) ? (value as string[]) : [];
    const toggle = (v: string) => {
      const next = selected.includes(v)
        ? selected.filter((x) => x !== v)
        : [...selected, v];
      onChange(next);
    };
    return (
      <div className="widget-multi-select flex flex-col gap-1">
        {label && (
          <p className="text-sm font-medium">
            {label}
            {spec.required && <span className="text-destructive ml-1">*</span>}
          </p>
        )}
        {/* TODO: replace with shadcn <Checkbox> items or a combobox multi-select */}
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const active = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value)}
                disabled={disabled}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-accent"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {placeholder && selected.length === 0 && (
          <p className="text-xs text-muted-foreground">{placeholder}</p>
        )}
        {helperText && (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        )}
      </div>
    );
  }

  // --- select (single value, dropdown) ---
  return (
    <div className="widget-select flex flex-col gap-1">
      {label && (
        <label htmlFor={spec.id} className="text-sm font-medium">
          {label}
          {spec.required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}
      {/* TODO: replace with shadcn <Select> */}
      <select
        id={spec.id}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
        className="rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

SelectWidget.displayName = "SelectWidget";
