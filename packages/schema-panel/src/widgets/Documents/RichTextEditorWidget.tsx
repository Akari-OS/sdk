/**
 * RichTextEditorWidget.tsx
 *
 * Widget type: "rich-text-editor"
 *
 * Panel Schema v0 Documents category widget.
 * Used in Notion app (page_body field): bound to "mcp.notion.append_block_children.children"
 *
 * TODO: Tiptap integration
 *   Install: @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-code-block
 *   Replace the stub <textarea> with:
 *     import { useEditor, EditorContent } from "@tiptap/react";
 *     import StarterKit from "@tiptap/starter-kit";
 *   The editor output should serialize to AKARI Block format (JSON array of blocks)
 *   matching the MCP tool input schema for append_block_children.children.
 *
 * Shell-side import note:
 *   @/components/ui/button       — shadcn Button (toolbar buttons)
 *   @/components/ui/separator    — shadcn Separator (toolbar divider)
 *   Tiptap CSS: @tiptap/react → Shell must include Tiptap's base prose styles.
 */

import React from "react";
// TODO: Shell resolves "@/" via tsconfig path alias
// import { Button }    from "@/components/ui/button";
// import { Separator } from "@/components/ui/separator";
//
// TODO: Tiptap integration (install @tiptap/react @tiptap/starter-kit etc.)
// import { useEditor, EditorContent } from "@tiptap/react";
// import StarterKit from "@tiptap/starter-kit";
// import Link from "@tiptap/extension-link";

import type { WidgetProps } from "../widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "../widget-utils";

/** Rich-text value: serialized JSON string (AKARI Block format) or plain markdown string. */
type RichTextValue = string | null;

const TOOLBAR_ICONS: Record<string, string> = {
  bold: "B",
  italic: "I",
  heading: "H",
  "bullet-list": "•",
  "numbered-list": "1.",
  code: "</>",
  link: "🔗",
};

/**
 * RichTextEditorWidget (STUB)
 *
 * Current implementation: plain <textarea> as a functional placeholder.
 * Accepts the same toolbar configuration from spec.toolbar and renders
 * a visual toolbar row — buttons are no-ops until Tiptap is integrated.
 *
 * Integration checklist (TODO):
 *  [ ] Install Tiptap packages in Shell
 *  [ ] Replace <textarea> with <EditorContent editor={editor} />
 *  [ ] Implement useEditor with extensions matching spec.toolbar items
 *  [ ] Serialize editor JSON → AKARI Block array on onChange
 *  [ ] Deserialize incoming value (Block array / markdown) back to editor doc
 *  [ ] Add Notion-block-specific extensions (callout, toggle, database embed)
 */
export const RichTextEditorWidget: React.FC<WidgetProps<RichTextValue>> = ({
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
  const toolbar: string[] = (spec.toolbar as string[] | undefined) ?? [
    "bold",
    "italic",
    "heading",
    "bullet-list",
    "code",
  ];

  return (
    <div className="widget-rich-text-editor flex flex-col gap-1">
      {label && (
        <p className="text-sm font-medium">
          {label}
          {spec.required && <span className="text-destructive ml-1">*</span>}
        </p>
      )}

      {/* Toolbar row — visual stub, no-op until Tiptap wired up */}
      <div className="flex items-center gap-0.5 rounded-t-md border border-b-0 bg-muted/30 px-1 py-0.5">
        {toolbar.map((item) => (
          <button
            key={item}
            type="button"
            disabled={disabled}
            className="rounded px-1.5 py-0.5 text-xs font-mono hover:bg-accent disabled:opacity-40"
            aria-label={item}
            title={item}
            // TODO: connect to Tiptap editor.chain().focus().<command>().run()
          >
            {TOOLBAR_ICONS[item] ?? item}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground bg-yellow-100 rounded px-1">
          TODO: Tiptap
        </span>
      </div>

      {/* Editor body — stub: plain textarea */}
      <textarea
        id={spec.id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Enter content…"}
        disabled={disabled}
        rows={8}
        className="rounded-b-md border bg-background px-3 py-2 text-sm font-mono disabled:opacity-50 resize-y"
        // TODO: replace with <EditorContent editor={editor} className="..." />
        //       EditorContent renders a contenteditable div, not a textarea
      />

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

RichTextEditorWidget.displayName = "RichTextEditorWidget";
