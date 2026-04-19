/**
 * CellRangePickerWidget.tsx
 *
 * Widget type: "cell-range-picker"
 *
 * Panel Schema v0 Documents category widget.
 * Allows selecting a spreadsheet cell range (e.g. "A1:C5", "Sheet1!B2:D10").
 * Common use case: bind to MCP tool arg for "range" parameter in Sheets/Excel operations.
 *
 * Value: string in A1 notation, e.g. "A1:B5" or "Sheet1!A1:C10"
 *
 * Interaction modes:
 *  1. Free-text input (basic): user types the range notation directly
 *  2. Visual picker (advanced, TODO): mini grid where user drags to select
 *
 * Shell-side import note:
 *   @/components/ui/input  — shadcn Input
 */

import React, { useState } from "react";
// TODO: Shell resolves "@/" via tsconfig path alias
// import { Input } from "@/components/ui/input";

import type { WidgetProps } from "../widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "../widget-utils";

type CellRangeValue = string | null;

/** Parse A1 notation: returns { sheet, startCol, startRow, endCol, endRow } or null */
function parseA1(range: string): {
  sheet?: string;
  startCol: string;
  startRow: number;
  endCol: string;
  endRow: number;
} | null {
  const sheetSep = range.indexOf("!");
  let notation = range;
  let sheet: string | undefined;

  if (sheetSep !== -1) {
    sheet = range.slice(0, sheetSep);
    notation = range.slice(sheetSep + 1);
  }

  const match = notation.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/i);
  if (!match) return null;

  return {
    sheet,
    startCol: match[1].toUpperCase(),
    startRow: parseInt(match[2], 10),
    endCol: match[3].toUpperCase(),
    endRow: parseInt(match[4], 10),
  };
}

/**
 * CellRangePickerWidget (STUB)
 *
 * Current implementation: text input with A1 notation validation.
 * Visual grid picker is deferred.
 *
 * Integration checklist (TODO):
 *  [ ] Visual mini-grid picker that renders the first N rows/cols of the target sheet
 *      and lets the user drag-select a rectangular region
 *  [ ] Sheet tab selector (when spec.sheets is provided by engine)
 *  [ ] Named range autocomplete (from spec.named_ranges injected by engine)
 *  [ ] Validate endRow >= startRow and endCol >= startCol
 */
export const CellRangePickerWidget: React.FC<WidgetProps<CellRangeValue>> = ({
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

  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.trim();
    if (!raw) {
      setError(null);
      onChange(null);
      return;
    }

    const parsed = parseA1(raw);
    if (!parsed) {
      setError("Invalid A1 notation. Use format: A1:B5 or Sheet1!A1:C10");
    } else {
      setError(null);
    }
    // Always emit raw value; validation error is advisory
    onChange(raw);
  };

  const parsed = value ? parseA1(value) : null;

  return (
    <div className="widget-cell-range-picker flex flex-col gap-1">
      {label && (
        <label htmlFor={spec.id} className="text-sm font-medium">
          {label}
          {spec.required && <span className="text-destructive ml-1">*</span>}
        </label>
      )}

      <input
        id={spec.id}
        type="text"
        value={value ?? ""}
        onChange={handleChange}
        placeholder={placeholder ?? "e.g. A1:C10 or Sheet1!B2:D20"}
        disabled={disabled}
        className={`rounded-md border bg-background px-3 py-2 text-sm font-mono disabled:opacity-50 ${
          error ? "border-destructive" : ""
        }`}
        // TODO: replace with shadcn <Input>
      />

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {/* Range summary */}
      {parsed && !error && (
        <div className="flex gap-3 text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
          {parsed.sheet && <span>Sheet: <strong>{parsed.sheet}</strong></span>}
          <span>Start: <strong>{parsed.startCol}{parsed.startRow}</strong></span>
          <span>End: <strong>{parsed.endCol}{parsed.endRow}</strong></span>
          <span>
            Size: <strong>
              {(parsed.endCol.charCodeAt(0) - parsed.startCol.charCodeAt(0) + 1)} col ×{" "}
              {parsed.endRow - parsed.startRow + 1} row
            </strong>
          </span>
        </div>
      )}

      {/* TODO: Visual mini-grid picker */}
      <p className="text-xs text-muted-foreground bg-yellow-50 rounded px-1 py-0.5">
        TODO: Visual grid picker (drag-select range) — text input only for now.
      </p>

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

CellRangePickerWidget.displayName = "CellRangePickerWidget";
