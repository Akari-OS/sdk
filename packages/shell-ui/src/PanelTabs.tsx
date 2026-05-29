/**
 * PanelTabs — 汎用タブ切替コンポーネント。
 *
 * akari-writer の SidePanel / SidePanelTab を参考に、writer 固有 import を除いた
 * 共通版として shell-ui へ昇格。
 *
 * 特性:
 *   - controlled / uncontrolled 両対応（selected + onSelect / defaultTabId）
 *   - 同タブ再クリックで onCollapse を呼ぶ（VS Code 相当の折りたたみ）
 *   - role=tablist / role=tab / aria-selected で WAI-ARIA 準拠
 *   - Tailwind dark テーマ。アクティブ: text-primary bg-primary/10
 *   - tabs 幅溢れ時は overflow-x-auto で横スクロール
 *   - disabled タブはクリック不可・薄表示
 *
 * 関連 spec: AKARI-HUB-038 §6 / AKARI-HUB-037
 */

import { useState, type ReactNode } from "react"
import { cn } from "./lib/cn"

// ─── 型 ────────────────────────────────────────────────────────────────────

export interface PanelTabDef {
  id: string
  /** タブボタン内に表示するアイコン（任意） */
  icon?: ReactNode
  /** タブラベル文字列 */
  label: string
  /** true の場合クリック不可 + 薄表示 */
  disabled?: boolean
}

export interface PanelTabsProps {
  /** タブ定義一覧 */
  tabs: PanelTabDef[]
  /**
   * タブコンテンツの描画関数（renderContent または children のどちらか）。
   * renderContent が指定された場合はそちらを優先する。
   */
  renderContent?: (activeId: string) => ReactNode
  /** renderContent が無い場合に fallback として使う children */
  children?: ReactNode

  // --- controlled mode ---
  /** 現在アクティブなタブ ID（controlled） */
  selected?: string
  /** タブ変更時のコールバック（controlled） */
  onSelect?: (id: string) => void

  // --- uncontrolled mode ---
  /** 初期タブ ID（uncontrolled）。未指定なら tabs[0] */
  defaultTabId?: string

  // --- その他 ---
  /**
   * アクティブタブを同タブ再クリックしたときのコールバック。
   * 指定しない場合は uncontrolled モードで内部 state を null にして
   * タブなし状態（コンテンツ非表示）になる。
   */
  onCollapse?: () => void
  /** アクティブタブを ring でハイライト（プランモード等） */
  highlight?: boolean
  /** ルート要素の追加 className */
  className?: string
}

// ─── コンポーネント ────────────────────────────────────────────────────────

export function PanelTabs({
  tabs,
  renderContent,
  children,
  selected: controlledSelected,
  onSelect,
  defaultTabId,
  onCollapse,
  highlight,
  className,
}: PanelTabsProps) {
  const [internalId, setInternalId] = useState<string | null>(
    defaultTabId ?? tabs[0]?.id ?? null,
  )

  const isControlled = controlledSelected !== undefined
  const activeId = isControlled ? controlledSelected : internalId

  function handleTabClick(id: string) {
    const tab = tabs.find((t) => t.id === id)
    if (!tab || tab.disabled) return

    if (activeId === id) {
      // 同タブ再クリック → collapse
      if (onCollapse) {
        onCollapse()
      } else if (!isControlled) {
        setInternalId(null)
      }
    } else {
      if (isControlled) {
        onSelect?.(id)
      } else {
        setInternalId(id)
        onSelect?.(id)
      }
    }
  }

  const content =
    activeId !== null
      ? renderContent
        ? renderContent(activeId)
        : children
      : null

  return (
    <div className={cn("h-full flex flex-col bg-card", className)}>
      {/* タブリスト */}
      <div
        role="tablist"
        aria-label="パネルタブ"
        className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border overflow-x-auto shrink-0"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-disabled={tab.disabled}
              disabled={tab.disabled}
              onClick={() => handleTabClick(tab.id)}
              title={tab.label}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-[11px] transition whitespace-nowrap",
                isActive
                  ? "text-primary bg-primary/10 font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                tab.disabled && "opacity-40 cursor-not-allowed",
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* コンテンツ */}
      {content !== null && (
        <div
          role="tabpanel"
          className={cn(
            "flex-1 overflow-y-auto relative",
            highlight && "ring-2 ring-primary/40 ring-inset animate-pulse-slow",
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}
