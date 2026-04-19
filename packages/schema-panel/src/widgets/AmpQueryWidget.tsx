/**
 * AmpQueryWidget.tsx
 *
 * Widget type: "amp-query"
 *
 * AKARI-specific widget for searching and selecting Agent Memory Protocol (AMP) records.
 * AMP stores structured agent memory across kinds (e.g. "task", "note", "person", etc.).
 *
 * Runtime contract:
 *   context.amp.search({ kind, q, limit }) → unknown[]
 *   Falls back gracefully if context.amp is undefined.
 *   Also accessible via context.runtime?.amp?.search() for future compatibility.
 *
 * Shell-side import note:
 *   @/components/ui/input    — shadcn Input
 *   @/components/ui/badge    — shadcn Badge
 *   @/components/ui/button   — shadcn Button
 */

import React, { useCallback, useEffect, useState } from "react";
// TODO: Shell resolves these paths via tsconfig path alias "@/"
// import { Input }  from "@/components/ui/input";
// import { Badge }  from "@/components/ui/badge";
// import { Button } from "@/components/ui/button";

import type { WidgetProps } from "./widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "./widget-utils";

interface AmpRecord {
  id: string;
  kind: string;
  title?: string;
  summary?: string;
  [key: string]: unknown;
}

/** Selected value: array of AMP record ids */
type AmpQueryValue = string[];

/**
 * AmpQueryWidget
 *
 * Features:
 *  - Keyword search against AMP records, optionally filtered by `spec.record_kind`
 *  - Result list showing kind badge + title + summary snippet
 *  - Chip list of selected records with remove
 *  - Respects spec.max selection limit
 */
export const AmpQueryWidget: React.FC<WidgetProps<AmpQueryValue>> = ({
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
  const recordKind = spec.record_kind as string | undefined;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AmpRecord[]>([]);
  const [loading, setLoading] = useState(false);

  // Resolve the amp client — prefer context.amp, fall back to runtime escape hatch
  const ampClient = context.amp ?? (context.runtime?.amp as typeof context.amp);

  const search = useCallback(
    async (q: string) => {
      if (!ampClient) return;
      setLoading(true);
      try {
        const raw = await ampClient.search({
          kind: recordKind,
          q: q || undefined,
          limit: 20,
        });
        setResults(raw as AmpRecord[]);
      } catch {
        // TODO: surface error via context.action or toast mechanism
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [ampClient, recordKind]
  );

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
    <div className="widget-amp-query flex flex-col gap-2">
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
                {item?.kind && (
                  <span className="rounded bg-primary/20 px-1 text-[10px] uppercase">
                    {item.kind}
                  </span>
                )}
                {item?.title ?? id}
                <button
                  type="button"
                  onClick={() => removeItem(id)}
                  disabled={disabled}
                  className="ml-0.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
                  aria-label={`remove ${item?.title ?? id}`}
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
        placeholder={`Search AMP${recordKind ? ` (${recordKind})` : ""}…`}
        disabled={disabled || !ampClient}
        className="rounded-md border bg-background px-3 py-2 text-sm disabled:opacity-50"
        // TODO: replace with shadcn <Input>
      />

      {!ampClient && (
        <p className="text-xs text-yellow-600 bg-yellow-50 rounded px-2 py-1">
          AMP client not available — context.amp is undefined.
          Provide an AmpClient in RenderContext to enable search.
        </p>
      )}

      {/* Results list */}
      {ampClient && (
        <div className="max-h-48 overflow-y-auto rounded-md border bg-background divide-y text-sm">
          {loading && (
            <p className="px-3 py-2 text-muted-foreground text-xs">Loading…</p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-2 text-muted-foreground text-xs">
              {query ? "No AMP records found." : "No AMP records available."}
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
                className={`w-full flex flex-col px-3 py-2 text-left hover:bg-accent disabled:opacity-40 ${
                  isSelected ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-muted px-1 text-[10px] uppercase font-mono">
                    {item.kind}
                  </span>
                  <span className="font-medium truncate">{item.title ?? item.id}</span>
                  {isSelected && (
                    <span className="ml-auto text-primary text-xs shrink-0">Selected</span>
                  )}
                </div>
                {item.summary && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {item.summary}
                  </p>
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

AmpQueryWidget.displayName = "AmpQueryWidget";
