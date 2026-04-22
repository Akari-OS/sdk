/**
 * TiptapEditor — WYSIWYG エディター本体
 *
 * useTiptapEditor フック + EditorContent + MarkdownToolbar + SelectionBubbleMenu を統合。
 * Markdown ソース編集モードの切替もサポート。
 */

import { useState } from "react";
import { EditorContent } from "@tiptap/react";
import { useTiptapEditor } from "./useTiptapEditor";
import { MarkdownToolbar } from "./MarkdownToolbar";
import { SelectionBubbleMenu } from "./SelectionBubbleMenu";
import type { ContextItem } from "@/lib/context-selection";

interface TiptapEditorProps {
  draft: string;
  onDraftChange: (text: string) => void;
  isMarkdownMode: boolean;
  placeholder?: string;
  onSendContext?: (ctx: ContextItem) => void;
}

export function TiptapEditor({
  draft,
  onDraftChange,
  isMarkdownMode,
  placeholder,
  onSendContext,
}: TiptapEditorProps) {
  const [isSourceMode, setIsSourceMode] = useState(false);

  const { editor } = useTiptapEditor({
    draft,
    onDraftChange,
    isMarkdownMode: isMarkdownMode && !isSourceMode,
    placeholder,
  });

  if (!editor) return null;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Markdown ツールバー（WYSIWYG + ソース切替） */}
      {isMarkdownMode && (
        <MarkdownToolbar
          editor={editor}
          isSourceMode={isSourceMode}
          onToggleSourceMode={() => setIsSourceMode((v) => !v)}
        />
      )}

      {isSourceMode ? (
        /* Markdown ソース編集モード */
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={placeholder ?? "Markdown を入力..."}
          className="flex-1 overflow-y-auto px-1 min-h-[120px] resize-none bg-transparent text-sm leading-relaxed font-mono placeholder:text-muted-foreground focus:outline-none"
        />
      ) : (
        <>
          {/* WYSIWYG エディター本体 */}
          <EditorContent
            editor={editor}
            className="flex-1 overflow-y-auto px-1"
          />

          {/* テキスト選択ポップアップ */}
          <SelectionBubbleMenu editor={editor} onSendContext={onSendContext} />
        </>
      )}
    </div>
  );
}
