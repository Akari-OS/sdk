/**
 * SelectionBubbleMenu — テキスト選択時のフローティングメニュー
 *
 * tiptap の BubbleMenu を使用。「Partner に送る」「コピー」ボタンを表示。
 */

import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { MessageCircle } from "lucide-react";
import { createTextSelectionContext, type ContextItem } from "@/lib/context-selection";

interface SelectionBubbleMenuProps {
  editor: Editor;
  onSendContext?: (ctx: ContextItem) => void;
}

export function SelectionBubbleMenu({ editor, onSendContext }: SelectionBubbleMenuProps) {
  function getSelectedText(): string {
    const { from, to } = editor.state.selection;
    if (from === to) return "";
    return editor.state.doc.textBetween(from, to, "\n");
  }

  function handleSendToPartner() {
    const text = getSelectedText();
    if (!text.trim() || !onSendContext) return;
    const ctx = createTextSelectionContext(text, 0, text.length);
    onSendContext(ctx);
  }

  function handleCopy() {
    const text = getSelectedText();
    if (!text.trim()) return;
    void navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <BubbleMenu editor={editor}>
      <div
        data-akari-pointer-exempt
        className="flex items-center gap-1 px-1 py-1 bg-popover border border-border rounded-md shadow-xl"
      >
        {onSendContext && (
          <button
            onClick={handleSendToPartner}
            className="flex items-center gap-1 px-2 py-1 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90 transition"
          >
            <MessageCircle className="w-3 h-3" />
            Partner に送る
          </button>
        )}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted rounded transition"
          title="クリップボードにコピー"
        >
          📋 コピー
        </button>
      </div>
    </BubbleMenu>
  );
}
