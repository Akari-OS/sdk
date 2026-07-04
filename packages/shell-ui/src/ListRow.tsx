/**
 * @file ListRow.tsx
 * 汎用行 primitive（左: icon + label、右: 任意アクション slot）。
 *
 * akari-video `WorksPanelPrimitives` の `WorksSelectableRow` + `WorksIconButton` の
 * 合成に相当する行 primitive を、shell-ui の Tailwind 慣習（`StylePanel.tsx` の
 * `StyleRow` と同じ流儀）で新規実装したもの。コピーではなく再実装。
 *
 * `<button>` ではなく `role="option"` の `<div>` をベースにしている点に注意:
 * 右 slot（`actions`）に Switch や削除ボタンなど「ネストした interactive 要素」を
 * 置く必要があり、`<button>` の中に `<button>` を置くことはできないため
 * （HTML 上不正 + a11y 的にも問題）。行自体をクリック可能にしたい場合は
 * `onClick` を渡す（role="option" + tabIndex + Enter/Space ハンドリングを自動付与）。
 *
 * 想定される最初の消費者: Writer 投稿先タブ（プラットフォーム行 + Switch + 削除ボタン）。
 */
import type { KeyboardEvent, ReactNode } from "react"

import { cn } from "./lib/cn"

export interface ListRowProps {
  /** 左側アイコン（lucide アイコン等、任意の ReactNode） */
  icon?: ReactNode
  /** 行の主ラベル */
  label: ReactNode
  /** ラベル下の補足説明（任意） */
  description?: ReactNode
  /** 選択状態（強調表示）。省略時は非選択扱い。 */
  selected?: boolean
  /** 無効化（クリック不可・視覚的に減光） */
  disabled?: boolean
  /**
   * 行クリック時 callback。指定すると行自体が `role="option"` の
   * インタラクティブ要素になる（キーボード操作: Enter / Space）。
   * 省略すると行は非インタラクティブな container になり、
   * `actions` 内のボタンのみが操作対象になる
   * （例: プラットフォーム行 = 行自体はクリック不可、Switch/削除ボタンのみ操作可）。
   */
  onClick?: () => void
  /** 右側 slot（Switch / 削除ボタンなど、任意個数のアクション） */
  actions?: ReactNode
  className?: string
}

/** 汎用行 primitive（左: icon+label、右: 任意アクション slot、selected/disabled 状態対応） */
export function ListRow({
  icon,
  label,
  description,
  selected = false,
  disabled = false,
  onClick,
  actions,
  className,
}: ListRowProps) {
  const interactive = !!onClick && !disabled

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      onClick?.()
    }
  }

  return (
    <div
      role={onClick ? "option" : undefined}
      aria-selected={onClick ? selected : undefined}
      aria-disabled={disabled || undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onClick : undefined}
      onKeyDown={handleKeyDown}
      className={cn(
        "group flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] transition",
        "focus:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        interactive ? "cursor-pointer" : "",
        disabled ? "cursor-not-allowed opacity-50" : "",
        selected
          ? "border-primary/50 bg-primary/10"
          : "border-border bg-card/30 hover:bg-accent/40",
        className,
      )}
    >
      {icon && (
        <span className="flex shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-foreground">{label}</p>
        {description && (
          <p className="truncate text-[10px] text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        // 行の onClick に伝播させない（Switch / 削除ボタン等の独立操作を優先）
        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  )
}
