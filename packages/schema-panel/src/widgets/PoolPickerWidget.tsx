/**
 * PoolPickerWidget.tsx
 *
 * Widget type: "pool-picker"
 *
 * AKARI-specific widget for selecting items from the Pool Knowledge Store.
 * Used in Notion module (notion-module-panel.schema.json): page_picker, export_pool_items.
 *
 * Runtime contract:
 *   context.pool.query({ types, q, limit }) → PoolQueryResult[]
 *   Falls back gracefully if context.pool is undefined (non-AKARI Shell).
 *   Also accessible via context.runtime.pool?.query() for future compatibility.
 *
 * Shell-side import note:
 *   @/components/ui/input    — shadcn Input (search field)
 *   @/components/ui/button   — shadcn Button
 *   @/components/ui/badge    — shadcn Badge (item chip)
 */

import React, { useCallback, useEffect, useState } from "react";
// TODO: Shell resolves these paths via tsconfig path alias "@/"
// import { Input }  from "@/components/ui/input";
// import { Button } from "@/components/ui/button";
// import { Badge }  from "@/components/ui/badge";

import type { PoolQueryResult, WidgetProps } from "./widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "./widget-utils";

/** Selected value is an array of Pool item ids (single selection = array of 1 when max=1). */
type PoolPickerValue = string[];

/**
 * PoolPickerWidget
 *
 * Features:
 *  - Search input that calls context.pool.query() with `accept` type filter
 *  - Result list with thumbnails (when available)
 *  - Chip list of selected items with remove button
 *  - Respects spec.max to cap the number of selectable items
 *  - Graceful stub when context.pool is unavailable
 */
export const PoolPickerWidget: React.FC<WidgetProps<PoolPickerValue>> = ({
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
  const accept = (spec.accept as string[] | undefined) ?? [];

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PoolQueryResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Resolve the pool client — prefer context.pool, fall back to runtime escape hatch
  const poolClient = context.pool ?? (context.runtime?.pool as typeof context.pool);

  const search = useCallback(
    async (q: string) => {
      if (!poolClient) return;
      setLoading(true);
      try {
        const r = await poolClient.query({
          types: accept.length > 0 ? accept : undefined,
          q: q || undefined,
          limit: 20,
        });
        setResults(r);
      } catch {
        // TODO: surface error via context.action or toast mechanism
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [poolClient, accept]
  );

  // Initial load
  useEffect(() => {
    void search("");
  }, [search]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    void search(e.target.value);
  };

  const toggleItem = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else if (selected.length < max) {
      onChange([...selected, id]);
    }
  };

  const removeItem = (id: string) => onChange(selected.filter((x) => x !== id));

  return (
    <div className="widget-pool-picker flex flex-col gap-2">
      {label && (
        <p className="text-sm font-medium">
          {label}
          {spec.required && <span className="text-destructive ml-1">*</span>}
        </p>
      )}

      {/* Selected items chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((id) => {
            const item = results.find((r) => r.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium"
              >
                {item?.thumbnail && (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="h-3 w-3 rounded-sm object-cover"
                  />
                )}
                {item?.name ?? id}
                <button
                  type="button"
                  onClick={() => removeItem(id)}
                  disabled={disabled}
                  className="ml-0.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
                  aria-label={`remove ${item?.name ?? id}`}
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Search input */}
      <input
        type="search"
        value={query}
        onChange={handleSearch}
        placeholder={`Search Pool${accept.length > 0 ? ` (${accept.join(", ")})` : ""}…`}
        disabled={disabled || !poolClient}
        className="rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
        // TODO: replace with shadcn <Input>
      />

      {!poolClient && (
        <p className="text-xs text-yellow-600 bg-yellow-50 rounded px-2 py-1">
          {/* Shown in dev environments where Pool MCP client is not initialized */}
          Pool client not available — context.pool is undefined.
          Provide a PoolClient in RenderContext to enable search.
        </p>
      )}

      {/* Results list */}
      {poolClient && (
        <div className="max-h-48 overflow-y-auto rounded-md border bg-background divide-y text-sm">
          {loading && (
            <p className="px-3 py-2 text-muted-foreground text-xs">Loading…</p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-muted-foreground text-xs">
              {query ? "No results found." : "No items in Pool."}
            </p>
          )}
          {results.map((item) => {
            const isSelected = selected.includes(item.id);
            const isMaxReached = !isSelected && selected.length >= max;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleItem(item.id)}
                disabled={disabled || isMaxReached}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent disabled:opacity-40 ${
                  isSelected ? "bg-primary/5 font-medium" : ""
                }`}
              >
                {item.thumbnail ? (
                  <img
                    src={item.thumbnail}
                    alt=""
                    className="h-6 w-6 rounded object-cover shrink-0"
                  />
                ) : (
                  <span className="h-6 w-6 rounded bg-muted shrink-0 flex items-center justify-center text-[10px] uppercase">
                    {item.type?.[0] ?? "?"}
                  </span>
                )}
                <span className="truncate">{item.name}</span>
                {isSelected && (
                  <span className="ml-auto text-primary text-xs">Selected</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {max !== Infinity && (
        <p className="text-xs text-muted-foreground">
          {selected.length} / {max} selected
        </p>
      )}

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

PoolPickerWidget.displayName = "PoolPickerWidget";
