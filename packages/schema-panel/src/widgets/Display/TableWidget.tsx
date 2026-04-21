/**
 * TableWidget.tsx
 *
 * Widget type: "table" (data display)
 *
 * Renders tabular data in a read-only or sortable table.
 * Used in Notion app (db_results field): bound to "state.db_results".
 * Column definitions come from spec.columns; rows from widget value.
 *
 * Shell-side import note:
 *   @/components/ui/table       — shadcn Table
 *   @/components/ui/scroll-area — shadcn ScrollArea
 *   @/components/ui/badge       — shadcn Badge (cell type rendering)
 */

import React, { useMemo, useState } from "react";
// TODO: Shell resolves "@/" via tsconfig path alias
// import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
// import { ScrollArea } from "@/components/ui/scroll-area";

import type { WidgetProps } from "../widget-types";
import { isVisible, resolveLabel } from "../widget-utils";

interface TableColumn {
  key: string;
  label: string;
  type?: string; // "text" | "number" | "boolean" | "date" | "badge"
  sortable?: boolean;
}

type TableRow = Record<string, unknown>;
type TableValue = TableRow[] | null;

type SortDir = "asc" | "desc";

function renderCell(value: unknown, type?: string): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  if (type === "boolean") {
    return (
      <span className={`text-xs font-medium ${value ? "text-green-600" : "text-muted-foreground"}`}>
        {value ? "Yes" : "No"}
      </span>
    );
  }
  if (type === "badge") {
    return (
      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium">
        {String(value)}
      </span>
    );
  }
  if (type === "date" && typeof value === "string") {
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * TableWidget
 *
 * Features:
 *  - Column definitions from spec.columns
 *  - Client-side sorting on sortable columns (click header)
 *  - Row click callback (if spec.on_row_click is defined — engine handles action dispatch)
 *  - Pagination: spec.page_size limits visible rows; Next/Prev controls
 *  - read_only is always effectively true (table is a display widget)
 */
export const TableWidget: React.FC<WidgetProps<TableValue>> = ({
  spec,
  value,
  onChange: _onChange,
  context,
}) => {
  if (!isVisible(spec, context)) return null;

  const label = resolveLabel(spec.label, context);
  const helperText = resolveLabel(spec.helperText ?? spec.help, context);

  const rows: TableRow[] = Array.isArray(value) ? value : [];
  const columns: TableColumn[] = (spec.columns as TableColumn[] | undefined) ??
    (rows[0]
      ? Object.keys(rows[0]).map((k) => ({ key: k, label: k, sortable: true }))
      : []);

  const pageSize = (spec.page_size as number | undefined) ?? 20;
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av ?? "").localeCompare(String(bv ?? ""));
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [rows, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const toggleSort = (key: string) => {
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
    setPage(0);
  };

  return (
    <div className="widget-table flex flex-col gap-1">
      {label && (
        <p className="text-sm font-medium">{label}</p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-md border bg-background px-4 py-6 text-center text-xs text-muted-foreground">
          No data. Run a query to populate this table.
        </div>
      ) : (
        <>
          <div className="rounded-md border overflow-auto">
            {/* TODO: replace with shadcn Table + ScrollArea */}
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-muted/80">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-3 py-2 text-left font-medium border-b whitespace-nowrap ${
                        col.sortable !== false ? "cursor-pointer hover:bg-accent/50 select-none" : ""
                      }`}
                      onClick={() => col.sortable !== false && toggleSort(col.key)}
                    >
                      <span className="flex items-center gap-1">
                        {col.label}
                        {sort?.key === col.key && (
                          <span className="text-primary">{sort.dir === "asc" ? "↑" : "↓"}</span>
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={i} className="hover:bg-accent/30 transition-colors">
                    {columns.map((col) => (
                      <td key={col.key} className="px-3 py-2 border-b last:border-b-0">
                        {renderCell(row[col.key], col.type)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of{" "}
                {sorted.length} rows
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded border px-2 py-0.5 hover:bg-accent disabled:opacity-40"
                >
                  ‹ Prev
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                  className="rounded border px-2 py-0.5 hover:bg-accent disabled:opacity-40"
                >
                  Next ›
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

TableWidget.displayName = "TableWidget";
