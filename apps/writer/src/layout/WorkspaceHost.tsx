/**
 * WorkspaceHost — Module 共通の 5 レイヤー骨格コンポーネント。
 *
 * 左→右の情報フロー (spec AKARI-HUB-009 §2) を具現化する:
 *   [Tool Palette] → [Editor] → [Inspector] → [Chat]
 *
 * 各 Module は 4 つのスロットを埋めるだけで画面が完成する。
 * レイアウト制御 (リサイズ / 開閉) は WorkspaceHost が担当する。
 */

import { type ReactNode } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";

export interface WorkspaceHostProps {
  /** 上部バー (WorkBar) */
  topBar: ReactNode;
  /** 左サイド: ツール選択・素材一覧 */
  toolPalette: ReactNode;
  showToolPalette: boolean;
  onToggleToolPalette?: () => void;
  /** 中央: メインエディタ */
  editor: ReactNode;
  /** 右サイド: Inspector / プレビュー / 設定 */
  inspector?: ReactNode;
  showInspector: boolean;
  onToggleInspector?: () => void;
  /** 最右: AI チャット */
  chat?: ReactNode;
  showChat: boolean;
  onToggleChat?: () => void;
}

export function WorkspaceHost({
  topBar,
  toolPalette,
  showToolPalette,
  onToggleToolPalette,
  editor,
  inspector,
  showInspector,
  onToggleInspector,
  chat,
  showChat,
  onToggleChat,
}: WorkspaceHostProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Work Bar */}
      {topBar}

      {/* Panel Group */}
      <Group orientation="horizontal" className="flex-1 min-h-0">
        {/* 左サイド: Tool Palette */}
        {showToolPalette ? (
          <>
            <Panel
              defaultSize="220px"
              minSize="160px"
              maxSize="360px"
              groupResizeBehavior="preserve-pixel-size"
            >
              {toolPalette}
            </Panel>
            <Separator className="w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors" />
          </>
        ) : onToggleToolPalette ? (
          <button
            onClick={onToggleToolPalette}
            className="w-6 shrink-0 border-r border-border bg-card hover:bg-muted transition flex items-center justify-center"
            title="パネルを開く"
          >
            <span className="text-[9px] text-muted-foreground [writing-mode:vertical-rl]">SNS</span>
          </button>
        ) : null}

        {/* 中央: Editor */}
        <Panel minSize="280px">{editor}</Panel>

        {/* 右サイド: Inspector */}
        {showInspector && inspector ? (
          <>
            <Separator className="w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors" />
            <Panel
              defaultSize="280px"
              minSize="200px"
              maxSize="420px"
              groupResizeBehavior="preserve-pixel-size"
            >
              {inspector}
            </Panel>
          </>
        ) : inspector && onToggleInspector ? (
          <button
            onClick={onToggleInspector}
            className="w-6 shrink-0 border-l border-border bg-card hover:bg-muted transition flex items-center justify-center"
            title="Inspector を開く"
          >
            <span className="text-[9px] text-muted-foreground [writing-mode:vertical-rl]">Inspector</span>
          </button>
        ) : null}

        {/* 最右: Chat */}
        {showChat && chat ? (
          <>
            <Separator className="w-1 cursor-col-resize hover:bg-primary/30 active:bg-primary/50 transition-colors" />
            <Panel
              defaultSize="320px"
              minSize="240px"
              maxSize="480px"
              groupResizeBehavior="preserve-pixel-size"
            >
              {chat}
            </Panel>
          </>
        ) : chat && onToggleChat ? (
          <button
            onClick={onToggleChat}
            className="w-6 shrink-0 border-l border-border bg-card hover:bg-muted transition flex items-center justify-center"
            title="Chat を開く"
          >
            <span className="text-[9px] text-muted-foreground [writing-mode:vertical-rl]">Partner</span>
          </button>
        ) : null}
      </Group>
    </div>
  );
}
