/**
 * useTiptapEditor — tiptap エディターのカスタムフック
 *
 * モード切替（Markdown / プレーンテキスト）、データ変換、外部 draft 同期を担う。
 */

import { useEffect, useRef, useMemo, useCallback } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { markdownToHtml, htmlToMarkdown } from "@/lib/markdown";

interface UseTiptapEditorOptions {
  /** 現在のテキスト（Markdown or プレーンテキスト） */
  draft: string;
  /** テキスト変更コールバック */
  onDraftChange: (text: string) => void;
  /** Markdown モードかどうか */
  isMarkdownMode: boolean;
  /** プレースホルダー */
  placeholder?: string;
}

export function useTiptapEditor({
  draft,
  onDraftChange,
  isMarkdownMode,
  placeholder,
}: UseTiptapEditorOptions) {
  // 外部更新中は onUpdate を無視するためのガード
  const isExternalUpdate = useRef(false);
  // デバウンス用タイマー
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 最新の draft を保持（onUpdate クロージャ内で参照）
  const latestDraft = useRef(draft);
  latestDraft.current = draft;

  const extensions = useMemo(() => {
    const placeholderExt = Placeholder.configure({
      placeholder: placeholder ?? "テキストを入力...",
    });

    if (isMarkdownMode) {
      // Markdown モード: StarterKit フル
      return [StarterKit, placeholderExt];
    }

    // プレーンテキストモード: 最小限のエクステンション
    return [
      StarterKit.configure({
        bold: false,
        italic: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        strike: false,
      }),
      placeholderExt,
    ];
  }, [isMarkdownMode, placeholder]);

  const editor = useEditor({
    extensions,
    content: isMarkdownMode ? markdownToHtml(draft) : draft,
    onUpdate: ({ editor: ed }) => {
      if (isExternalUpdate.current) return;

      if (isMarkdownMode) {
        // Markdown モード: HTML → Markdown 変換（デバウンス付き）
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          const html = ed.getHTML();
          // 空エディターの場合は空文字を返す
          if (html === "<p></p>") {
            onDraftChange("");
            return;
          }
          const md = htmlToMarkdown(html);
          onDraftChange(md);
        }, 150);
      } else {
        // プレーンテキストモード: getText で直接取得
        const text = ed.getText({ blockSeparator: "\n" });
        onDraftChange(text);
      }
    },
    editorProps: {
      attributes: {
        class: "tiptap outline-none min-h-[120px] text-sm leading-relaxed",
      },
    },
  });

  // 外部から draft が変更された場合（AI エンハンス等）にエディターを同期
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;

    // エディター内部の現在値を取得
    let currentContent: string;
    if (isMarkdownMode) {
      const html = editor.getHTML();
      currentContent = html === "<p></p>" ? "" : htmlToMarkdown(html);
    } else {
      currentContent = editor.getText({ blockSeparator: "\n" });
    }

    // 内容が同じなら何もしない（無限ループ防止）
    if (currentContent === draft) return;

    isExternalUpdate.current = true;
    if (isMarkdownMode) {
      editor.commands.setContent(markdownToHtml(draft));
    } else {
      // プレーンテキスト: 段落に分割して設定
      editor.commands.setContent(
        draft
          ? draft.split("\n").map((line) => `<p>${line || "<br>"}</p>`).join("")
          : "<p></p>",
      );
    }
    // 次のマイクロタスクでガード解除
    setTimeout(() => {
      isExternalUpdate.current = false;
    }, 0);
  }, [editor, draft, isMarkdownMode]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  /** 選択テキストを取得 */
  const getSelectedText = useCallback((): string => {
    if (!editor) return "";
    const { from, to } = editor.state.selection;
    if (from === to) return "";
    return editor.state.doc.textBetween(from, to, "\n");
  }, [editor]);

  return { editor, getSelectedText };
}
