/**
 * MarkdownToolbar — tiptap コマンドベースのフォーマットボタン
 *
 * Markdown 対応プラットフォーム（note, blog, x_long）で表示。
 * 右端に Markdown ソース編集の切替トグルを配置。
 */

import type { Editor } from "@tiptap/react";
import { Bold, Italic, Heading1, Heading2, Heading3, List, Quote, Code } from "lucide-react";

interface MarkdownToolbarProps {
  editor: Editor;
  /** Markdown ソース編集モードかどうか */
  isSourceMode?: boolean;
  /** ソース編集モード切替 */
  onToggleSourceMode?: () => void;
}

interface ToolbarAction {
  id: string;
  icon: typeof Bold;
  label: string;
  command: (ed: Editor) => void;
  isActive: (ed: Editor) => boolean;
}

const ACTIONS: ToolbarAction[] = [
  {
    id: "bold",
    icon: Bold,
    label: "太字 (Cmd+B)",
    command: (ed) => { ed.chain().focus().toggleBold().run(); },
    isActive: (ed) => ed.isActive("bold"),
  },
  {
    id: "italic",
    icon: Italic,
    label: "斜体 (Cmd+I)",
    command: (ed) => { ed.chain().focus().toggleItalic().run(); },
    isActive: (ed) => ed.isActive("italic"),
  },
  {
    id: "h1",
    icon: Heading1,
    label: "見出し1",
    command: (ed) => { ed.chain().focus().toggleHeading({ level: 1 }).run(); },
    isActive: (ed) => ed.isActive("heading", { level: 1 }),
  },
  {
    id: "h2",
    icon: Heading2,
    label: "見出し2",
    command: (ed) => { ed.chain().focus().toggleHeading({ level: 2 }).run(); },
    isActive: (ed) => ed.isActive("heading", { level: 2 }),
  },
  {
    id: "h3",
    icon: Heading3,
    label: "見出し3",
    command: (ed) => { ed.chain().focus().toggleHeading({ level: 3 }).run(); },
    isActive: (ed) => ed.isActive("heading", { level: 3 }),
  },
  {
    id: "list",
    icon: List,
    label: "リスト",
    command: (ed) => { ed.chain().focus().toggleBulletList().run(); },
    isActive: (ed) => ed.isActive("bulletList"),
  },
  {
    id: "quote",
    icon: Quote,
    label: "引用",
    command: (ed) => { ed.chain().focus().toggleBlockquote().run(); },
    isActive: (ed) => ed.isActive("blockquote"),
  },
];

export function MarkdownToolbar({ editor, isSourceMode, onToggleSourceMode }: MarkdownToolbarProps) {
  return (
    <div className="flex items-center gap-0.5 border-b border-border pb-1 mb-2">
      {/* フォーマットボタン群 */}
      {!isSourceMode && ACTIONS.map(({ id, icon: Icon, label, command, isActive }) => (
        <button
          key={id}
          type="button"
          title={label}
          onClick={() => command(editor)}
          className={`px-2 py-1 text-[10px] rounded transition ${
            isActive(editor)
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
        </button>
      ))}

      {isSourceMode && (
        <span className="text-[10px] text-muted-foreground px-2">Markdown ソース編集</span>
      )}

      {/* 右寄せ: Markdown ソース切替 */}
      {onToggleSourceMode && (
        <>
          <div className="flex-1" />
          <button
            type="button"
            title={isSourceMode ? "WYSIWYG に戻す" : "Markdown ソースで編集"}
            onClick={onToggleSourceMode}
            className={`px-2 py-1 text-[10px] rounded transition ${
              isSourceMode
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Code className="w-3.5 h-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
