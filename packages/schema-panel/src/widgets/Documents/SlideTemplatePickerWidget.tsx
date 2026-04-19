/**
 * SlideTemplatePickerWidget.tsx
 *
 * Widget type: "slide-template-picker"
 *
 * Panel Schema v0 Documents category widget.
 * Displays a grid of presentation template thumbnails (PPT / Google Slides).
 * User selects one template; value = template id string.
 *
 * Data source: spec.source (MCP tool call) resolves to a list of templates.
 * Engine injects resolved data into spec.source_data before render.
 *
 * TODO: Phase 3a — confirm spec.source_data injection field name.
 *
 * Shell-side import note:
 *   @/components/ui/scroll-area — shadcn ScrollArea
 *   @/components/ui/badge       — shadcn Badge (category label)
 */

import React, { useState } from "react";
// TODO: Shell resolves "@/" via tsconfig path alias
// import { ScrollArea } from "@/components/ui/scroll-area";
// import { Badge }      from "@/components/ui/badge";

import type { WidgetProps } from "../widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "../widget-utils";

interface SlideTemplate {
  id: string;
  name: string;
  thumbnail?: string; // URL to thumbnail image
  category?: string;
  /** "pptx" | "gslides" | "odp" etc. */
  format?: string;
}

/** Value: selected template id */
type SlideTemplatePickerValue = string | null;

/**
 * SlideTemplatePickerWidget (STUB)
 *
 * Current implementation: thumbnail grid using <img> with placeholder fallback.
 * Template data comes from spec.source_data (engine-resolved).
 *
 * Integration checklist (TODO):
 *  [ ] Connect spec.source + spec.source_args to engine MCP call
 *  [ ] Inject resolved SlideTemplate[] into spec.source_data
 *  [ ] Add category filter tabs (spec.categories from engine)
 *  [ ] Keyboard navigation within grid (arrow keys)
 *  [ ] Hover preview (larger thumbnail in tooltip/popover)
 *  [ ] Search by template name
 */
export const SlideTemplatePickerWidget: React.FC<WidgetProps<SlideTemplatePickerValue>> = ({
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

  const templates: SlideTemplate[] =
    (spec.source_data as SlideTemplate[] | undefined) ?? [];

  const [filter, setFilter] = useState("");
  const filtered = filter
    ? templates.filter(
        (t) =>
          t.name.toLowerCase().includes(filter.toLowerCase()) ||
          t.category?.toLowerCase().includes(filter.toLowerCase())
      )
    : templates;

  const categories = Array.from(
    new Set(templates.map((t) => t.category).filter(Boolean) as string[])
  );

  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const displayed = activeCategory
    ? filtered.filter((t) => t.category === activeCategory)
    : filtered;

  return (
    <div className="widget-slide-template-picker flex flex-col gap-2">
      {label && (
        <p className="text-sm font-medium">
          {label}
          {spec.required && <span className="text-destructive ml-1">*</span>}
        </p>
      )}

      {templates.length === 0 ? (
        <p className="text-xs text-muted-foreground bg-muted/30 rounded px-3 py-4 text-center">
          {spec.source
            ? "Loading templates… (engine resolves source)"
            : "No templates available. Provide spec.source pointing to an MCP template list tool."}
          {/* TODO: Loading skeleton grid */}
        </p>
      ) : (
        <>
          {/* Search + category filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search templates…"
              disabled={disabled}
              className="rounded-md border bg-background px-2 py-1 text-xs flex-1 min-w-[120px] disabled:opacity-50"
            />
            {categories.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setActiveCategory(null)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    activeCategory === null
                      ? "bg-primary text-primary-foreground border-primary"
                      : "hover:bg-accent"
                  }`}
                >
                  All
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() =>
                      setActiveCategory(activeCategory === cat ? null : cat)
                    }
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      activeCategory === cat
                        ? "bg-primary text-primary-foreground border-primary"
                        : "hover:bg-accent"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Template grid */}
          <div className="grid grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
            {/* TODO: replace outer div with shadcn <ScrollArea> */}
            {displayed.map((tmpl) => {
              const isSelected = value === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  onClick={() => onChange(isSelected ? null : tmpl.id)}
                  disabled={disabled}
                  className={`flex flex-col rounded-md border overflow-hidden text-left transition-all disabled:opacity-40 ${
                    isSelected
                      ? "ring-2 ring-primary border-primary"
                      : "hover:border-primary/50 hover:shadow-sm"
                  }`}
                  aria-pressed={isSelected}
                  aria-label={tmpl.name}
                >
                  {/* Thumbnail */}
                  <div className="aspect-video bg-muted flex items-center justify-center overflow-hidden">
                    {tmpl.thumbnail ? (
                      <img
                        src={tmpl.thumbnail}
                        alt={tmpl.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        {tmpl.format?.toUpperCase() ?? "PPT"}
                      </span>
                    )}
                  </div>
                  {/* Name */}
                  <div className="px-1.5 py-1">
                    <p className="text-[11px] font-medium truncate">{tmpl.name}</p>
                    {tmpl.category && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {tmpl.category}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}

            {displayed.length === 0 && (
              <p className="col-span-3 text-center text-xs text-muted-foreground py-4">
                No templates match the current filter.
              </p>
            )}
          </div>
        </>
      )}

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

SlideTemplatePickerWidget.displayName = "SlideTemplatePickerWidget";
