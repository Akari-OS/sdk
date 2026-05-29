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
      <div className={cn("h-full flex flex-col bg-card", className)}>
        <div className="flex items-center shrink-0">
          {/* PanelTabs のタブバー部分をそのまま利用 */}
          <div className="flex-1 min-w-0">
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

          {/* mode バッジ + 閉じるボタン */}
          {(modeLabel || onClose) && (
            <div className="flex items-center gap-1 px-2 shrink-0 border-b border-border py-1.5">
              {modeLabel && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">
                  {modeLabel}
                </span>
              )}
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
        </div>
      </div>
    )
  }

  // tabs なし → ヘッダなし single-pane
  return (
    <div className={cn("h-full flex flex-col bg-card", className)}>
      {/* ヘッダ（mode バッジ / 閉じるボタンがある場合のみ） */}
      {(modeLabel || onClose) && (
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-border shrink-0">
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

      {/* コンテンツ */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
