/**
 * @file AppLayout.tsx
 * AKARI-HUB-088 §2-1 (S0-1): スタジオ系アプリ共通のレイアウト枠。
 *
 * Video の VideoStudio.tsx のペイン構成（react-resizable-panels v4 + 折り畳みレール +
 * リサイズ永続）を汎用化したもの。各アプリは「中身のパネル」だけを props で差し込む。
 * 上部バー・戻る・テーマは Shell 所有なので本コンポーネントは扱わない（再発明禁止、設計書 §1）。
 *
 *   profile="studio"  : 縦 70/30、上段は横 4 分割（左 / 中央 / 右 / AIチャット）。下段あり。
 *   profile="compact" : 横 2 分割（左 / 中央）。下段・右・チャットなし。
 *
 * 設計 SSOT: docs/design/creator-app-shell-standard-2026-06-03.md §7-1
 */

import { useRef, useState, type ReactNode } from "react"
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type PanelImperativeHandle,
  type PanelSize,
} from "react-resizable-panels"

export type AppLayoutProfile = "studio" | "compact"

export type AppLayoutProps = {
  /** studio = フルスタジオ（4 ペイン + 下段）/ compact = 横 2 分割。 */
  profile: AppLayoutProfile
  /** 左ペイン（WorkPool / 素材 / プリセット等）。省略可。 */
  left?: ReactNode
  /** 中央ペイン（Canvas / Preview。アプリ固有の編集面）。必須。 */
  center: ReactNode
  /** 右ペイン（Inspector）。studio のみ。 */
  right?: ReactNode
  /** AI チャットペイン（右端、折り畳み既定）。studio のみ。 */
  chat?: ReactNode
  /** 下段ペイン（タイムライン / トラック等）。studio のみ。 */
  bottom?: ReactNode
  /** フッター（ステータスバー）。 */
  footer?: ReactNode
  /** リサイズ永続の localStorage キー prefix（"akari.<appId>.layout"）。 */
  appId: string
  /** 各ペインの初期サイズ（%）。 */
  defaultSizes?: Partial<{
    left: number
    center: number
    right: number
    chat: number
    bottom: number
  }>
  /** AI チャットを折り畳んで開始（既定 true）。 */
  chatDefaultCollapsed?: boolean
  /** 下段を折り畳んで開始（studio 既定 false / compact では無視）。 */
  bottomDefaultCollapsed?: boolean
}

const layoutStorage =
  typeof window !== "undefined" ? window.localStorage : undefined

/** 折り畳まれたペインを再展開する縦長ボタン（Video の expand-btn 相当）。 */
function ExpandTab({
  label,
  title,
  onClick,
}: {
  label: string
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="flex items-center justify-center rounded border border-border bg-card px-1 py-2 text-[10px] text-muted-foreground [writing-mode:vertical-rl] hover:border-primary hover:text-foreground"
    >
      {label}
    </button>
  )
}

function Pane({ children }: { children: ReactNode }) {
  return <div className="h-full min-h-0 overflow-hidden">{children}</div>
}

const SEP_H = "w-1 shrink-0 bg-border transition-colors hover:bg-primary/60"
const SEP_V = "h-1 shrink-0 bg-border transition-colors hover:bg-primary/60"

export function AppLayout({
  profile,
  left,
  center,
  right,
  chat,
  bottom,
  footer,
  appId,
  defaultSizes,
  chatDefaultCollapsed = true,
  bottomDefaultCollapsed = false,
}: AppLayoutProps) {
  // 折り畳み再展開用の imperative ref（studio のみ実使用）。
  const leftRef = useRef<PanelImperativeHandle | null>(null)
  const rightRef = useRef<PanelImperativeHandle | null>(null)
  const chatRef = useRef<PanelImperativeHandle | null>(null)
  const bottomRef = useRef<PanelImperativeHandle | null>(null)

  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [rightCollapsed, setRightCollapsed] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(chatDefaultCollapsed)
  const [bottomCollapsed, setBottomCollapsed] = useState(bottomDefaultCollapsed)

  // リサイズ永続（v4 ビルトイン）。上段/下段の縦 group と上段内の横 group を別キーで保存。
  const vLayout = useDefaultLayout({ id: `akari.${appId}.v`, storage: layoutStorage })
  const hLayout = useDefaultLayout({ id: `akari.${appId}.h`, storage: layoutStorage })

  const pct = (n: number | undefined, fallback: number) => `${n ?? fallback}%`

  // ── compact: 横 2 分割（左 / 中央） ────────────────────────────────────────
  if (profile === "compact") {
    const cols: ReactNode[] = []
    if (left) {
      cols.push(
        <Panel
          key="left"
          id="left"
          panelRef={leftRef}
          defaultSize={pct(defaultSizes?.left, 28)}
          minSize="160px"
          maxSize="60%"
          collapsible
          collapsedSize="0%"
          onResize={(s: PanelSize) => setLeftCollapsed(s.inPixels === 0)}
        >
          <Pane>{left}</Pane>
        </Panel>,
      )
      cols.push(<Separator key="sep-left" className={SEP_H} />)
    }
    cols.push(
      <Panel key="center" id="center" minSize="30%">
        <Pane>{center}</Pane>
      </Panel>,
    )

    return (
      <div className="relative flex h-full flex-col">
        <Group
          orientation="horizontal"
          defaultLayout={hLayout.defaultLayout}
          onLayoutChanged={hLayout.onLayoutChanged}
          className="min-h-0 flex-1"
        >
          {cols}
        </Group>
        {left && leftCollapsed && (
          <div className="absolute left-1 top-2 z-10">
            <ExpandTab
              label="▶ 素材"
              title="左パネルを開く"
              onClick={() => leftRef.current?.expand()}
            />
          </div>
        )}
        {footer && (
          <footer className="shrink-0 border-t border-border bg-card">
            {footer}
          </footer>
        )}
      </div>
    )
  }

  // ── studio: 縦 70/30、上段は横 4 分割 ─────────────────────────────────────
  const cols: ReactNode[] = []
  if (left) {
    cols.push(
      <Panel
        key="left"
        id="left"
        panelRef={leftRef}
        defaultSize={pct(defaultSizes?.left, 20)}
        minSize="180px"
        maxSize="50%"
        collapsible
        collapsedSize="0%"
        onResize={(s: PanelSize) => setLeftCollapsed(s.inPixels === 0)}
      >
        <Pane>{left}</Pane>
      </Panel>,
    )
    cols.push(<Separator key="sep-left" className={SEP_H} />)
  }
  cols.push(
    <Panel key="center" id="center" defaultSize={pct(defaultSizes?.center, 44)} minSize="20%">
      <Pane>{center}</Pane>
    </Panel>,
  )
  if (right) {
    cols.push(<Separator key="sep-right" className={SEP_H} />)
    cols.push(
      <Panel
        key="right"
        id="right"
        panelRef={rightRef}
        defaultSize={pct(defaultSizes?.right, 18)}
        minSize="200px"
        maxSize="50%"
        collapsible
        collapsedSize="0%"
        onResize={(s: PanelSize) => setRightCollapsed(s.inPixels === 0)}
      >
        <Pane>{right}</Pane>
      </Panel>,
    )
  }
  if (chat) {
    cols.push(<Separator key="sep-chat" className={SEP_H} />)
    cols.push(
      <Panel
        key="chat"
        id="chat"
        panelRef={chatRef}
        defaultSize={chatDefaultCollapsed ? "0%" : pct(defaultSizes?.chat, 20)}
        minSize="220px"
        maxSize="50%"
        collapsible
        collapsedSize="0%"
        onResize={(s: PanelSize) => setChatCollapsed(s.inPixels === 0)}
      >
        <Pane>{chat}</Pane>
      </Panel>,
    )
  }

  const rows: ReactNode[] = [
    <Panel key="top" id="top" defaultSize="70%" minSize="40%">
      <Group
        orientation="horizontal"
        defaultLayout={hLayout.defaultLayout}
        onLayoutChanged={hLayout.onLayoutChanged}
        className="h-full"
      >
        {cols}
      </Group>
    </Panel>,
  ]
  if (bottom) {
    rows.push(<Separator key="sep-bottom" className={SEP_V} />)
    rows.push(
      <Panel
        key="bottom"
        id="bottom"
        panelRef={bottomRef}
        defaultSize={bottomDefaultCollapsed ? "0%" : pct(defaultSizes?.bottom, 30)}
        minSize="120px"
        maxSize="60%"
        collapsible
        collapsedSize="0%"
        onResize={(s: PanelSize) => setBottomCollapsed(s.inPixels === 0)}
      >
        <Pane>{bottom}</Pane>
      </Panel>,
    )
  }

  const showRightRail =
    (right && rightCollapsed) || (chat && chatCollapsed)

  return (
    <div className="relative flex h-full flex-col">
      <Group
        orientation="vertical"
        defaultLayout={vLayout.defaultLayout}
        onLayoutChanged={vLayout.onLayoutChanged}
        className="min-h-0 flex-1"
      >
        {rows}
      </Group>

      {/* 折り畳み再展開レール（Video の expand-btn 相当） */}
      {left && leftCollapsed && (
        <div className="absolute left-1 top-2 z-10">
          <ExpandTab
            label="▶ 素材"
            title="左パネルを開く"
            onClick={() => leftRef.current?.expand()}
          />
        </div>
      )}
      {showRightRail && (
        <div className="absolute right-1 top-2 z-10 flex flex-col gap-2">
          {right && rightCollapsed && (
            <ExpandTab
              label="◀ Inspector"
              title="インスペクターを開く"
              onClick={() => rightRef.current?.expand()}
            />
          )}
          {chat && chatCollapsed && (
            <ExpandTab
              label="🤖 Chat"
              title="AI チャットを開く"
              onClick={() => chatRef.current?.expand()}
            />
          )}
        </div>
      )}
      {bottom && bottomCollapsed && (
        <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
          <button
            type="button"
            onClick={() => bottomRef.current?.expand()}
            title="下段パネルを開く"
            aria-label="下段パネルを開く"
            className="rounded border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground hover:border-primary hover:text-foreground"
          >
            ▲ タイムライン
          </button>
        </div>
      )}

      {footer && (
        <footer className="shrink-0 border-t border-border bg-card">
          {footer}
        </footer>
      )}
    </div>
  )
}
