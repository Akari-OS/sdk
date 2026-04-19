/**
 * SlidePreviewWidget.tsx
 *
 * Widget type: "slide-preview"
 *
 * Panel Schema v0 Documents category widget.
 * Displays a read-only slide thumbnail preview (PPT / Google Slides).
 * Typically used alongside slide-template-picker or as a confirmation step.
 *
 * Value: slide source reference — either:
 *  - A URL to a rendered thumbnail image
 *  - A template id (engine resolves to thumbnail URL via spec.source)
 *  - null (shows placeholder)
 *
 * Shell-side import note:
 *   @/components/ui/skeleton — shadcn Skeleton (loading state)
 *   @/components/ui/badge    — shadcn Badge (slide count)
 */

import React, { useState } from "react";
// TODO: Shell resolves "@/" via tsconfig path alias
// import { Skeleton } from "@/components/ui/skeleton";
// import { Badge }    from "@/components/ui/badge";

import type { WidgetProps } from "../widget-types";
import { isVisible, resolveLabel } from "../widget-utils";

/**
 * Value shape options:
 *  - string: direct thumbnail URL or template id
 *  - { thumbnail: string; title?: string; slide_count?: number } — rich preview object
 *  - null: no slide selected
 */
type SlidePreviewValue =
  | string
  | { thumbnail?: string; title?: string; slide_count?: number }
  | null;

/**
 * SlidePreviewWidget (STUB)
 *
 * Current implementation: renders a 16:9 aspect-ratio preview frame.
 * Loads thumbnail URL from value (string) or value.thumbnail (object).
 * Falls back to a placeholder graphic with text.
 *
 * Integration checklist (TODO):
 *  [ ] When value is a template id (not a URL), resolve to thumbnail via
 *      spec.source MCP call (engine handles this before widget render)
 *  [ ] Slide count badge ("12 slides") from value.slide_count
 *  [ ] "Open in editor" link button via spec.open_action
 *  [ ] Multi-slide filmstrip (horizontal scrollable thumbnails)
 *      when value is an array of slide thumbnail URLs
 *  [ ] Lazy-load + blur placeholder while image fetches
 */
export const SlidePreviewWidget: React.FC<WidgetProps<SlidePreviewValue>> = ({
  spec,
  value,
  onChange: _onChange,
  context,
}) => {
  if (!isVisible(spec, context)) return null;

  const label = resolveLabel(spec.label, context);
  const helperText = resolveLabel(spec.helperText ?? spec.help, context);

  const [imgError, setImgError] = useState(false);

  // Resolve thumbnail URL and metadata
  let thumbnailUrl: string | undefined;
  let title: string | undefined;
  let slideCount: number | undefined;

  if (typeof value === "string") {
    thumbnailUrl = value;
  } else if (value && typeof value === "object") {
    thumbnailUrl = value.thumbnail;
    title = value.title;
    slideCount = value.slide_count;
  }

  const showPlaceholder = !thumbnailUrl || imgError;

  return (
    <div className="widget-slide-preview flex flex-col gap-1">
      {label && (
        <p className="text-sm font-medium">{label}</p>
      )}

      {/* Preview frame — 16:9 aspect ratio */}
      <div className="relative w-full rounded-md border overflow-hidden bg-muted"
           style={{ paddingTop: "56.25%" /* 16:9 */ }}>
        <div className="absolute inset-0 flex items-center justify-center">
          {showPlaceholder ? (
            <div className="flex flex-col items-center gap-1 text-muted-foreground p-4 text-center">
              {/* Placeholder SVG mimicking a slide */}
              <svg
                width="64"
                height="40"
                viewBox="0 0 64 40"
                fill="none"
                className="opacity-30"
                aria-hidden
              >
                <rect width="64" height="40" rx="3" fill="currentColor" />
                <rect x="4" y="4" width="56" height="6" rx="1" fill="white" opacity="0.5" />
                <rect x="4" y="14" width="40" height="3" rx="1" fill="white" opacity="0.3" />
                <rect x="4" y="20" width="32" height="3" rx="1" fill="white" opacity="0.3" />
                <rect x="4" y="26" width="48" height="3" rx="1" fill="white" opacity="0.3" />
              </svg>
              <span className="text-xs">
                {value === null
                  ? "No slide selected"
                  : "Preview unavailable"}
              </span>
              {/* TODO: Loading skeleton while engine resolves thumbnail */}
            </div>
          ) : (
            <img
              src={thumbnailUrl}
              alt={title ?? "Slide preview"}
              className="w-full h-full object-contain"
              onError={() => setImgError(true)}
              loading="lazy"
            />
          )}
        </div>

        {/* Slide count badge */}
        {slideCount !== undefined && (
          <div className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded px-1.5 py-0.5 text-[10px] font-medium">
            {slideCount} slide{slideCount !== 1 ? "s" : ""}
            {/* TODO: replace with shadcn <Badge> */}
          </div>
        )}
      </div>

      {/* Title below preview */}
      {title && (
        <p className="text-xs font-medium truncate">{title}</p>
      )}

      {/* TODO: filmstrip for multi-slide decks */}

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

SlidePreviewWidget.displayName = "SlidePreviewWidget";
