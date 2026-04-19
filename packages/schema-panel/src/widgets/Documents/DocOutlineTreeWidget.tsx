/**
 * DocOutlineTreeWidget.tsx
 *
 * Widget type: "doc-outline-tree"
 *
 * Panel Schema v0 Documents category widget.
 * Displays a hierarchical outline derived from document headings (H1–H6).
 * Used in Notion module (page_outline field): source = "mcp.notion.get_page_blocks"
 *
 * Interaction:
 *  - Read-only tree view by default
 *  - Drag-to-reorder headings (reflects structural reordering intent to engine)
 *  - Click a heading to focus/select it (value = selected heading id or anchor)
 *
 * TODO: Drag-and-drop integration
 *   Use @dnd-kit/sortable (Shell-standard DnD library) for drag reorder.
 *   Each heading node gets a useSortable handle; onDragEnd emits reordered
 *   heading id array via onChange.
 *
 * Shell-side import note:
 *   @/components/ui/scroll-area — shadcn ScrollArea
 */

import React, { useState } from "react";
// TODO: Shell resolves "@/" via tsconfig path alias
// import { ScrollArea } from "@/components/ui/scroll-area";
//
// TODO: DnD integration
// import { DndContext, closestCenter } from "@dnd-kit/core";
// import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";

import type { WidgetProps } from "../widget-types";
import { isVisible, resolveDisabled, resolveLabel } from "../widget-utils";

interface OutlineNode {
  id: string;
  level: number; // 1–6 (H1–H6)
  text: string;
  children?: OutlineNode[];
}

/**
 * Value shape: array of OutlineNode ids in current order.
 * The engine resolves source (e.g. mcp.notion.get_page_blocks) and provides
 * the tree structure via spec.options or a resolved spec.source_data.
 *
 * TODO: Phase 3a — confirm how engine injects resolved source data.
 * For now, widget reads spec.source_data as OutlineNode[] if present.
 */
type OutlineValue = string[] | null;

const INDENT_PX = 12;

const OutlineNodeRow: React.FC<{
  node: OutlineNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}> = ({ node, selectedId, onSelect, disabled }) => {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded px-2 py-0.5 text-sm cursor-pointer select-none hover:bg-accent ${
          selectedId === node.id ? "bg-primary/10 font-medium" : ""
        } ${disabled ? "pointer-events-none opacity-50" : ""}`}
        style={{ paddingLeft: `${(node.level - 1) * INDENT_PX + 8}px` }}
        onClick={() => !disabled && onSelect(node.id)}
      >
        {hasChildren && (
          <button
            type="button"
            className="text-muted-foreground text-[10px] w-3 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            aria-label={expanded ? "collapse" : "expand"}
          >
            {expanded ? "▼" : "▶"}
          </button>
        )}
        <span
          className="text-muted-foreground text-[10px] font-mono w-6 shrink-0"
          title={`H${node.level}`}
        >
          H{node.level}
        </span>
        <span className="truncate">{node.text}</span>
        {/* TODO: add DnD drag handle here (<GripVertical> icon) */}
      </div>

      {hasChildren && expanded && (
        <div>
          {node.children!.map((child) => (
            <OutlineNodeRow
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * DocOutlineTreeWidget (STUB)
 *
 * Current implementation: static tree rendered from spec.source_data.
 * Drag-to-reorder is stubbed — onChange emits selected node id only.
 *
 * Integration checklist (TODO):
 *  [ ] Connect spec.source + spec.source_args to engine MCP call
 *      and receive resolved OutlineNode[] before render
 *  [ ] Integrate @dnd-kit/sortable for drag-reorder UX (see Panel Schema v0 T-9d)
 *  [ ] onChange should emit reordered heading id array when drag completes
 *  [ ] Virtual scroll for very long documents (>200 headings)
 */
export const DocOutlineTreeWidget: React.FC<WidgetProps<OutlineValue>> = ({
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

  // Engine injects resolved source data into spec.source_data (TODO: confirm field name with Phase 3a)
  const nodes: OutlineNode[] = (spec.source_data as OutlineNode[] | undefined) ?? [];

  // Current selection = first item in value array, or null
  const selectedId: string | null = Array.isArray(value) ? (value[0] ?? null) : null;

  const handleSelect = (id: string) => {
    onChange([id]);
  };

  return (
    <div className="widget-doc-outline-tree flex flex-col gap-1">
      {label && (
        <p className="text-sm font-medium">{label}</p>
      )}

      <div className="rounded-md border bg-background min-h-[80px] max-h-64 overflow-y-auto py-1">
        {/* TODO: replace outer div with shadcn <ScrollArea> */}
        {nodes.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {spec.source
              ? "Loading outline… (engine resolves source)"
              : "No outline data. Provide spec.source pointing to an MCP block fetch tool."}
          </p>
        ) : (
          nodes.map((node) => (
            <OutlineNodeRow
              key={node.id}
              node={node}
              selectedId={selectedId}
              onSelect={handleSelect}
              disabled={disabled}
            />
          ))
        )}
      </div>

      {helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
};

DocOutlineTreeWidget.displayName = "DocOutlineTreeWidget";
