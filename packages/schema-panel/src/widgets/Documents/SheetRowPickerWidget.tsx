/**
 * SheetRowPickerWidget.tsx
 *
 * Widget type: "sheet-row-picker"
 *
 * Panel Schema v0 Documents category widget.
 * Renders a spreadsheet-style table (Google Sheets / Excel style) where
 * the user selects one or more rows. Bound value is an array of row indices
 * or row id strings, depending on spec configuration.
 *
 * Data source: spec.source (MCP tool call) + spec.source_args.
 * Engine resolves source and injects rows into spec.source_data before render.
 *
 * TODO: Phase 3a — confirm spec.source_data injection field name.
 *
 * Shell-side import note:
 *   @/components/ui/table      — shadcn Table
 *   @/components/ui/checkbox   — shadcn Checkbox (row selection)
 *   @/components/ui/scroll-area — shadcn ScrollArea
 */

import React, { useState } from "react";
// TODO: Shell resolves "@/" via tsconfig path alias
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// import { Checkbox }    from "@/components/ui/checkbox";
// import { ScrollArea }  from "@/components/ui/scroll-area";

import type { WidgetProps } from "../widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "../widget-utils";

interface SheetRow {
  _id: string; // synthetic row identifier (row index string or provided id)
  [column: string]: unknown;
}

interface SheetColumn {
  key: string;
  label: string;
  type?: string;
}

/** Value: array of selected row _id strings */
type SheetRowPickerValue = string[];

/**
 * SheetRowPickerWidget (STUB)
 *
 * Current implementation: renders a basic HTML table with checkbox selection.
 * Row data comes from spec.source_data (engine-resolved).
 *
 * Integration checklist (TODO):
 *  [ ] Connect spec.source + spec.source_args to engine MCP call
 *  [ ] Inject resolved SheetRow[] + SheetColumn[] into spec.source_data
 *  [ ] Replace <table> with shadcn Table components
 *  [ ] Add column sorting (click header)
 *  [ ] Add search/filter row
 *  [ ] Virtualize large datasets (>500 rows) with @tanstack/react-virtual
 *  [ ] Support "select all" checkbox in header
 */
export const SheetRowPickerWidget: React.FC<WidgetProps<SheetRowPickerValue>> = ({
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

  const selected: string[] = Array.isArray(value) ? value : [];
  const max = (spec.max as number | undefined) ?? Infinity;

  // Engine injects resolved data here (TODO: confirm field names with Phase 3a)
  const rows: SheetRow[] = (spec.source_data as SheetRow[] | undefined) ?? [];
  const columns: SheetColumn[] = (spec.columns as SheetColumn[] | undefined) ??
    (rows[0]
      ? Object.keys(rows[0])
          .filter((k) => k !== "_id")
          .map((k) => ({ key: k, label: k }))
      : []);

  const [filter, setFilter] = useState("");
  const filteredRows = filter
    ? rows.filter((row) =>
        Object.values(row).some((v) =>
          String(v).toLowerCase().includes(filter.toLowerCase())
        )
      )
    : rows;

  const toggleRow = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else if (selected.length < max) {
      onChange([...selected, id]);
    }
  };

  return (
    <div className="widget-sheet-row-picker flex flex-col gap-1">
      {label && (
        <p className="text-sm font-medium">
          {label}
          {spec.required && <span className="text-destructive ml-1">*</span>}
        </p>
      )}

      {rows.length > 0 && (
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter rows…"
          disabled={disabled}
          className="rounded-md border bg-background px-3 py-1 text-xs disabled:opacity-50"
        />
      )}

      <div className="rounded-md border overflow-auto max-h-64">
        {/* TODO: replace with shadcn Table + ScrollArea */}
        {rows.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {spec.source
              ? "Loading rows… (engine resolves source)"
              : "No row data. Provide spec.source pointing to an MCP sheet fetch tool."}
          </p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/80">
              <tr>
                <th className="w-8 px-2 py-1 text-left font-medium border-b" />
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-2 py-1 text-left font-medium border-b whitespace-nowrap"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isSelected = selected.includes(row._id);
                const isMaxReached = !isSelected && selected.length >= max;
                return (
                  <tr
                    key={row._id}
                    onClick={() => !disabled && !isMaxReached && toggleRow(row._id)}
                    className={`cursor-pointer hover:bg-accent ${
                      isSelected ? "bg-primary/5" : ""
                    } ${isMaxReached || disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <td className="px-2 py-1 border-b">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(row._id)}
                        disabled={disabled || isMaxReached}
                        className="accent-primary"
                        // TODO: replace with shadcn <Checkbox>
                      />
                    </td>
                    {columns.map((col) => (
                      <td key={col.key} className="px-2 py-1 border-b whitespace-nowrap truncate max-w-[200px]">
                        {String(row[col.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        {selected.length} row{selected.length !== 1 ? "s" : ""} selected
        {max !== Infinity && ` (max ${max})`}
      </p>

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

SheetRowPickerWidget.displayName = "SheetRowPickerWidget";
