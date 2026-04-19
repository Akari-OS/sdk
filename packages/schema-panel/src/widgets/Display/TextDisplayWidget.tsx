/**
 * TextDisplayWidget.tsx
 *
 * Widget type: "text-display" / "stat" / "badge" / "progress" / "divider" (display)
 *
 * Pure display widgets with no onChange.
 * Groups several simple display types into one file for brevity.
 *
 * Shell-side import note:
 *   @/components/ui/badge     — shadcn Badge
 *   @/components/ui/progress  — shadcn Progress
 *   @/components/ui/separator — shadcn Separator
 */

import React from "react";
// TODO: Shell resolves "@/" via tsconfig path alias
// import { Badge }     from "@/components/ui/badge";
// import { Progress }  from "@/components/ui/progress";
// import { Separator } from "@/components/ui/separator";

import type { WidgetProps } from "../widget-types";
import { isVisible, resolveLabel } from "../widget-utils";

type DisplayValue = string | number | boolean | null;

/**
 * TextDisplayWidget
 *
 * Covers these read-only display widget types:
 *
 *  - "text-display": Plain text label. value is displayed inline.
 *  - "stat":         Large metric with optional label and unit. Good for dashboards.
 *  - "badge":        Colored status chip. spec.variant controls color.
 *  - "progress":     Horizontal progress bar. value 0–100.
 *  - "divider":      Horizontal rule with optional label. No value used.
 *
 * All are driven by `value` from the binding engine (read from state/AMP/Pool).
 */
export const TextDisplayWidget: React.FC<WidgetProps<DisplayValue>> = ({
  spec,
  value,
  onChange: _onChange,
  context,
}) => {
  if (!isVisible(spec, context)) return null;

  const label = resolveLabel(spec.label, context);
  const unit = resolveLabel(spec.unit as string | undefined, context);
  const helperText = resolveLabel(spec.helperText ?? spec.help, context);

  // --- divider ---
  if (spec.type === "divider") {
    return (
      <div className="widget-divider flex items-center gap-2 py-1">
        {/* TODO: replace with shadcn <Separator> */}
        {label ? (
          <>
            <hr className="flex-1 border-border" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
            <hr className="flex-1 border-border" />
          </>
        ) : (
          <hr className="flex-1 border-border" />
        )}
      </div>
    );
  }

  // --- progress ---
  if (spec.type === "progress") {
    const pct = Math.min(100, Math.max(0, Number(value ?? 0)));
    return (
      <div className="widget-progress flex flex-col gap-1">
        {label && (
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{label}</span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
        )}
        {/* TODO: replace with shadcn <Progress value={pct} /> */}
        <div className="w-full rounded-full bg-muted h-2 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
        {helperText && (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        )}
      </div>
    );
  }

  // --- badge ---
  if (spec.type === "badge") {
    const variant = (spec.variant as string | undefined) ?? "default";
    const variantStyles: Record<string, string> = {
      default: "bg-primary/10 text-primary",
      success: "bg-green-100 text-green-700",
      warning: "bg-yellow-100 text-yellow-700",
      destructive: "bg-red-100 text-red-700",
      secondary: "bg-muted text-muted-foreground",
    };
    const style = variantStyles[variant] ?? variantStyles.default;
    return (
      <div className="widget-badge inline-flex items-center gap-1">
        {label && <span className="text-xs text-muted-foreground">{label}:</span>}
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
          // TODO: replace with shadcn <Badge variant={...}>
        >
          {value !== null && value !== undefined ? String(value) : "—"}
        </span>
        {helperText && (
          <span className="text-xs text-muted-foreground">{helperText}</span>
        )}
      </div>
    );
  }

  // --- stat ---
  if (spec.type === "stat") {
    return (
      <div className="widget-stat flex flex-col gap-0.5">
        {label && (
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        )}
        <p className="text-2xl font-bold tabular-nums">
          {value !== null && value !== undefined ? String(value) : "—"}
          {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
        </p>
        {helperText && (
          <p className="text-xs text-muted-foreground">{helperText}</p>
        )}
      </div>
    );
  }

  // --- text-display (default) ---
  return (
    <div className="widget-text-display flex flex-col gap-0.5">
      {label && (
        <p className="text-xs text-muted-foreground">{label}</p>
      )}
      <p className="text-sm">
        {value !== null && value !== undefined ? String(value) : (
          <span className="text-muted-foreground/50">—</span>
        )}
        {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
      </p>
      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

TextDisplayWidget.displayName = "TextDisplayWidget";
