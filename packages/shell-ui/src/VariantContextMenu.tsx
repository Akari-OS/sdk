/**
 * @file VariantContextMenu.tsx
 * AKARI-HUB-071 Phase 1 (T-15): Variant 右クリック context menu。
 *
 * 役割:
 *   - 1 Variant に対する操作を一覧で提供
 *       - promote (primary に昇格)
 *       - archive (履歴保持で非 active 化)
 *       - fork (default = 現 Variant から fork)
 *       - compare with...（cross-Variant compare）
 *   - VariantTabBar の onContextRequest からアンカー座標で表示される想定
 *   - 親側で popover host を持ち、本 component は menu 中身のみを描画
 *
 * 設計指針:
 *   - 表示位置や open/close 制御は呼び出し側に委ねる（軽量実装）
 *   - menu item は role=\"menuitem\"、外側コンテナに role=\"menu\" を付与
 *   - 「現 Variant から fork」がデフォルト。空 fork / 他 Variant からの fork は
 *     VariantTabBar の `+ New Variant` ドロップダウンに集約してあり、本 menu は
 *     右クリック対象 1 Variant に対する単一 fork action のみを提供
 *
 * 関連 spec / ADR:
 *   - spec-pool-ui-redesign-stage-context-pane (AKARI-HUB-071) §6 / AC-17
 *   - ADR-078 v0.2.0 §6-7（Cross-Variant 操作）
 */

import * as React from "react"
import { useEffect, useMemo, useRef } from "react"
import { cn } from "./lib/cn"
import type { VariantAction, VariantDisplay } from "./types/variant"

export interface VariantContextMenuProps {
  /** 右クリック対象の Variant */
  variant: VariantDisplay
  /**
   * 比較候補（self を除いた active な Variant 一覧）。
   * `compare with...` サブメニューに表示される。
   */
  compareCandidates?: VariantDisplay[]
  /**
   * Variant が他 Variant に依存（depended_by）されているかの判定 helper。
   * archive 操作時の警告表示に使う（ADR-078 v0.2.0 §6-8）。
   */
  isReferencedByOthers?: boolean
  /** menu 操作後 / 外側クリック時に呼ばれる close 通知 */
  onClose?: () => void
  /** action 発火（promote / archive / fork / compare） */
  onAction?: (action: VariantAction) => void
  className?: string
}

/**
 * 右クリック context menu 本体（中身だけ描画）。
 * 表示位置・portal は親側で wrap する。
 *
 * @example
 *   {anchor && (
 *     <div style={{ position: "fixed", left: anchor.x, top: anchor.y }}>
 *       <VariantContextMenu variant={v} onClose={() => setAnchor(null)} ... />
 *     </div>
 *   )}
 */
export function VariantContextMenu({
  variant,
  compareCandidates = [],
  isReferencedByOthers = false,
  onClose,
  onAction,
  className,
}: VariantContextMenuProps): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  // Esc / outside click で close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.()
    }
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) onClose?.()
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onDoc)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onDoc)
    }
  }, [onClose])

  const dispatch = (action: VariantAction) => {
    onAction?.(action)
    onClose?.()
  }

  const compareItems = useMemo(
    () => compareCandidates.filter((v) => v.id !== variant.id && !v.is_archived),
    [compareCandidates, variant.id],
  )

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`Variant ${variant.name} の操作`}
      className={cn(
        "min-w-56 rounded-md border border-border bg-popover p-1 text-[11px] shadow-md",
        className,
      )}
    >
      <div className="px-2 py-1 text-[10px] text-muted-foreground">
        {variant.name}
      </div>
      <div className="border-t border-border my-1" />
      <button
        type="button"
        role="menuitem"
        disabled={variant.is_primary}
        className={cn(
          "flex w-full items-center justify-between rounded px-2 py-1 text-left",
          variant.is_primary
            ? "cursor-not-allowed text-muted-foreground/50"
            : "hover:bg-accent",
        )}
        onClick={() => dispatch({ kind: "promote" })}
      >
        <span>★ primary に昇格</span>
        {variant.is_primary && (
          <span className="text-[9px] text-muted-foreground">既に primary</span>
        )}
      </button>
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center rounded px-2 py-1 text-left hover:bg-accent"
        onClick={() => dispatch({ kind: "fork", from: "current" })}
      >
        ⑂ この Variant から fork
        <span className="ml-auto text-[9px] text-muted-foreground">⌘D</span>
      </button>
      {compareItems.length > 0 && (
        <details className="rounded">
          <summary className="cursor-pointer rounded px-2 py-1 hover:bg-accent">
            ⊞ compare with... ▶
          </summary>
          <div className="mt-0.5 ml-2 flex flex-col gap-0.5">
            {compareItems.slice(0, 5).map((v) => (
              <button
                key={v.id}
                type="button"
                role="menuitem"
                className="rounded px-2 py-1 text-left hover:bg-accent"
                onClick={() => dispatch({ kind: "compare", with: [variant.id, v.id] })}
              >
                {v.name} <span className="text-muted-foreground">({v.format})</span>
              </button>
            ))}
            {compareItems.length >= 2 && (
              <button
                type="button"
                role="menuitem"
                className="rounded px-2 py-1 text-left text-muted-foreground hover:bg-accent"
                onClick={() =>
                  dispatch({
                    kind: "compare",
                    with: [
                      variant.id,
                      ...compareItems.slice(0, 2).map((v) => v.id),
                    ],
                  })
                }
              >
                上位 2 件と並列 compare（最大 3）
              </button>
            )}
          </div>
        </details>
      )}
      <div className="border-t border-border my-1" />
      <button
        type="button"
        role="menuitem"
        disabled={variant.is_archived}
        className={cn(
          "flex w-full items-start gap-1 rounded px-2 py-1 text-left",
          variant.is_archived
            ? "cursor-not-allowed text-muted-foreground/50"
            : "hover:bg-accent",
        )}
        onClick={() => dispatch({ kind: "archive" })}
      >
        <span className="flex-1">
          ⌫ archive
          {isReferencedByOthers && (
            <span className="ml-1 text-amber-300">⚠</span>
          )}
        </span>
        {isReferencedByOthers && (
          <span className="text-[9px] text-amber-300">
            他 Variant が参照中
          </span>
        )}
      </button>
    </div>
  )
}
