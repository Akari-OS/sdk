/**
 * InspectorShell — インスペクター右パネル外枠。
 *
 * タブヘッダ + スクロール可能コンテンツ枠の外枠のみを担う。
 * 中身は children として受け取り、このコンポーネントは構造だけを提供する。
 *
 * 設計指針:
 *   - tabs 省略時はヘッダなし single-pane（children をそのまま表示）
 *   - mode / modeLabel でバッジ表示（例: "Preview" / "Inspector"）
 *   - onClose を指定するとヘッダ右端に × ボタンを表示
 *   - タブ制御は PanelTabs に委譲（controlled / uncontrolled 両対応）
 *   - モーダル禁止・画面遷移禁止（RULES.md ルール 9 / 11）
 *
 * 関連 spec: AKARI-HUB-038 §6 / AKARI-HUB-037
 */

import { type ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "./lib/cn"
import { PanelTabs, type PanelTabDef } from "./PanelTabs"

// ─── 型 ────────────────────────────────────────────────────────────────────

export interface InspectorShellProps {
  /** タブ定義（省略時はヘッダなし single-pane） */
  tabs?: PanelTabDef[]
  /** controlled: アクティブタブ ID */
  activeTab?: string
  /** controlled: タブ変更コールバック */
  onTabChange?: (id: string) => void
  /** uncontrolled: 初期タブ ID */
  defaultTab?: string

  /**
   * モード識別子（例: "preview" / "inspector"）。
   * modeLabel と組み合わせてヘッダにバッジ表示する。
   */
  mode?: string
  /** モードバッジのラベル文字列 */
  modeLabel?: string

  /** ヘッダ右端に × ボタンを表示して閉じるコールバック */
  onClose?: () => void

  /** パネル本体のコンテンツ */
  children?: ReactNode

  /** ルート要素の追加 className */
  className?: string
}

// ─── コンポーネント ────────────────────────────────────────────────────────

export function InspectorShell({
  tabs,
  activeTab,
  onTabChange,
  defaultTab,
  mode: _mode,
  modeLabel,
  onClose,
  children,
  className,
}: InspectorShellProps) {
  // tabs あり → PanelTabs に委譲
  if (tabs && tabs.length > 0) {
    return (
      <div className={cn("h-full flex flex-col bg-card overflow-hidden", className)}>
        {/* mode バッジ + 閉じるボタン */}
        {(modeLabel || onClose) && (
          <div className="sticky top-0 z-30 flex items-center justify-between gap-2 px-2 py-1.5 border-b border-border bg-card/95 backdrop-blur">
            <div className="flex items-center gap-1 min-w-0">
              {modeLabel && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium whitespace-nowrap">
                  {modeLabel}
                </span>
              )}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="パネルを閉じる"
                aria-label="閉じる"
                className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0">
          {/* PanelTabs のタブバー部分をそのまま利用 */}
          <PanelTabs
            tabs={tabs}
            selected={activeTab}
            onSelect={onTabChange}
            defaultTabId={defaultTab}
            className="h-full"
          >
            {children}
          </PanelTabs>
        </div>
      </div>
    )
  }

  // tabs なし → ヘッダなし single-pane
  return (
    <div className={cn("h-full flex flex-col bg-card overflow-hidden", className)}>
      {/* ヘッダ（mode バッジ / 閉じるボタンがある場合のみ） */}
      {(modeLabel || onClose) && (
        <div className="sticky top-0 z-30 flex items-center justify-between px-2 py-1.5 border-b border-border shrink-0 bg-card/95 backdrop-blur">
          <div className="flex items-center gap-1">
            {modeLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                {modeLabel}
              </span>
            )}
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="パネルを閉じる"
              aria-label="閉じる"
              className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      )}

      {/* コンテンツ。min-h-0 が無いと flex item の自動最小高さで縮まず、
          内容が縦に溢れたときスクロールせずクリップされる（WKWebView で顕在化、
          2026-06-25 報告）。tabs ありの分岐（上）と対称に min-h-0 を付ける。 */}
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  )
}
