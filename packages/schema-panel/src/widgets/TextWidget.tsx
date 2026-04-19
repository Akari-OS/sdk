/**
 * TextWidget.tsx
 *
 * Handles widget types: "text" | "textarea" | "password" | "email" | "url"
 *
 * Shell-side import note:
 *   Input / Textarea come from shadcn/ui — path resolved by Shell's tsconfig alias:
 *   @/components/ui/input  →  shell/src/components/ui/input.tsx
 *   @/components/ui/textarea  →  shell/src/components/ui/textarea.tsx
 *   @/components/ui/label     →  shell/src/components/ui/label.tsx
 */

import React from "react";
// TODO: Shell resolves these paths via tsconfig path alias "@/"
// import { Input }    from "@/components/ui/input";
// import { Textarea } from "@/components/ui/textarea";
// import { Label }    from "@/components/ui/label";

import type { WidgetProps } from "./widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "./widget-utils";

type TextValue = string;

/**
 * TextWidget
 *
 * Covers all plain-text widget variants differentiated by `spec.type`:
 *  - "text"     → <input type="text">
 *  - "textarea" → <textarea>
 *  - "password" → <input type="password">
 *  - "email"    → <input type="email">
 *  - "url"      → <input type="url">
 */
export const TextWidget: React.FC<WidgetProps<TextValue>> = ({
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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => onChange(e.target.value);

  const inputType =
    spec.type === "password"
      ? "password"
      : spec.type === "email"
        ? "email"
        : spec.type === "url"
          ? "url"
          : "text";

  return (
    <div className="widget-text flex flex-col gap-1">
      {label && (
        <label htmlFor={spec.id} className="text-sm font-medium">
          {label}
          {spec.required && <span className="text-destructive ml-1">*</span>}
        </label>
        // TODO: replace <label> with shadcn <Label> once Shell resolves @/
      )}

      {spec.type === "textarea" ? (
        <textarea
          id={spec.id}
          value={value ?? ""}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={spec.read_only}
          minLength={spec.minLength}
          maxLength={spec.maxLength}
          rows={4}
          className="rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
          // TODO: replace with shadcn <Textarea>
        />
      ) : (
        <input
          id={spec.id}
          type={inputType}
          value={value ?? ""}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={spec.read_only}
          minLength={spec.minLength}
          maxLength={spec.maxLength}
          className="rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
          // TODO: replace with shadcn <Input>
        />
      )}

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}

      {spec.maxLength && (
        <p className="text-xs text-muted-foreground text-right">
          {(value ?? "").length} / {spec.maxLength}
        </p>
      )}
    </div>
  );
};

TextWidget.displayName = "TextWidget";
