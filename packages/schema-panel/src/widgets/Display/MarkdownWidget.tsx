/**
 * MarkdownWidget.tsx
 *
 * Widget type: "markdown" (display)
 *
 * Renders a markdown string as formatted HTML.
 * Read-only display widget — no onChange.
 * Value is a markdown string (can be i18n template resolved first).
 *
 * Used in Notion module (export_preview field): bound to "state.export_preview_md"
 *
 * Shell-side import note:
 *   The Shell may provide a shared markdown renderer. Options:
 *   1. react-markdown (recommended): import ReactMarkdown from "react-markdown"
 *   2. @/lib/markdown — Shell's own wrapper around react-markdown + remark-gfm
 *
 * TODO: Markdown renderer integration
 *   Install: react-markdown remark-gfm
 *   Replace the <pre> stub with:
 *     import ReactMarkdown from "react-markdown";
 *     import remarkGfm from "remark-gfm";
 *     <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm dark:prose-invert">
 *       {resolvedContent}
 *     </ReactMarkdown>
 */

import React from "react";
// TODO: import ReactMarkdown from "react-markdown";
// TODO: import remarkGfm from "remark-gfm";

import type { WidgetProps } from "../widget-types";
import { isVisible, resolveLabel } from "../widget-utils";

type MarkdownValue = string | null;

/**
 * MarkdownWidget (STUB)
 *
 * Current implementation: renders markdown content in a <pre> block
 * with monospace font. No real markdown parsing.
 *
 * Integration checklist (TODO):
 *  [ ] Install react-markdown + remark-gfm in Shell
 *  [ ] Replace <pre> with <ReactMarkdown> component
 *  [ ] Add Tailwind Typography prose classes for consistent rendering
 *  [ ] Handle code blocks with syntax highlighting (rehype-highlight or shiki)
 *  [ ] Sanitize HTML in markdown (rehype-sanitize)
 */
export const MarkdownWidget: React.FC<WidgetProps<MarkdownValue>> = ({
  spec,
  value,
  onChange: _onChange,
  context,
}) => {
  if (!isVisible(spec, context)) return null;

  const label = resolveLabel(spec.label, context);
  const helperText = resolveLabel(spec.helperText ?? spec.help, context);

  // Resolve i18n templates in the markdown content itself
  const content = value ? context.i18n.resolve(value) : null;

  if (!content) {
    return null; // Display widgets hide when empty (no error state)
  }

  return (
    <div className="widget-markdown flex flex-col gap-1">
      {label && (
        <p className="text-sm font-medium">{label}</p>
      )}

      {/*
       * TODO: replace with <ReactMarkdown remarkPlugins={[remarkGfm]}
       *   className="prose prose-sm dark:prose-invert max-w-none">
       *   {content}
       * </ReactMarkdown>
       */}
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
          {content}
        </pre>
        <p className="text-[10px] text-yellow-600 mt-1">
          TODO: Tiptap/react-markdown renderer — showing raw markdown
        </p>
      </div>

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

MarkdownWidget.displayName = "MarkdownWidget";
