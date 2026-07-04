/**
 * @file ContextChipRow.tsx
 * Writer 改修 Phase F（spec-writer-renovation-2026 §3.8）: Context Composer が
 * 合成した `ContextChip[]` を可視化する presentational component。
 *
 * 「テンプレプロンプト + 自分の辞書 + Work 方針 + 追加指示を 1 回で送る」機構の UI 面。
 * 校正タブ・チャット送信欄の上に
 * `[ブランド規約] [この Work の方針] [文体: 自分の声 v3] [テンプレ: 添削] [+追加指示]`
 * のようなチップ列として合成内容を可視化し、`removable` なチップは個別に外せる。
 *
 * 設計指針:
 *   - Pool API を直接知らない（疎結合）。呼び出し側（Writer 等）が
 *     `composeContext()`（`@akari-os/sdk/pool`）の結果 `sections` をそのまま渡す想定。
 *   - チップを外す操作は `onRemove(chipId)` を呼ぶだけ。実際の除外（再合成）は
 *     呼び出し側が `composeContext({ ..., excludeChipIds })` を再実行して担う。
 *   - モーダル / popover 不使用（一画面化原則）。
 *
 * 関連:
 *   - spec: akari-os/docs/planning/../akari-writer/docs/specs/spec-writer-renovation-2026.md §3.8
 *   - `@akari-os/sdk/pool` の `ContextChip` / `ComposedPrompt` / `composeContext`
 */

import * as React from "react"
import { X } from "lucide-react"
import { cn } from "./lib/cn"
import type { ContextChip, ContextChipKind } from "@akari-os/sdk/pool"

const KIND_BADGE_CLS: Record<ContextChipKind, string> = {
  brand: "border-violet-500/30 bg-violet-500/15 text-violet-300",
  work: "border-sky-500/30 bg-sky-500/15 text-sky-300",
  style: "border-amber-500/30 bg-amber-500/15 text-amber-300",
  template: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
  adhoc: "border-rose-500/30 bg-rose-500/15 text-rose-300",
}

const KIND_LABEL: Record<ContextChipKind, string> = {
  brand: "ブランド",
  work: "Work",
  style: "文体",
  template: "テンプレ",
  adhoc: "追加指示",
}

export interface ContextChipRowProps {
  /** 表示する chip 一覧（`composeContext()` の `ComposedPrompt.sections` を想定）。 */
  chips: ContextChip[]
  /**
   * チップの削除ボタン押下時 callback。省略時は削除ボタン自体を出さない
   * （読み取り専用の可視化のみ）。
   */
  onRemove?: (chipId: string) => void
  /** 外側 wrapper への merge class。 */
  className?: string
}

/**
 * Context Composer の合成結果をチップ列として表示する。
 *
 * @example
 *   const { sections } = await composeContext(input)
 *   <ContextChipRow chips={sections} onRemove={(id) => setExcluded((s) => [...s, id])} />
 */
export function ContextChipRow({
  chips,
  onRemove,
  className,
}: ContextChipRowProps): React.ReactElement | null {
  if (chips.length === 0) return null

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1.5", className)}
      data-component="context-chip-row"
    >
      {chips.map((chip) => (
        <span
          key={chip.id}
          title={chip.body}
          className={cn(
            "inline-flex max-w-[16rem] items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-none",
            KIND_BADGE_CLS[chip.kind],
          )}
        >
          <span className="shrink-0 opacity-70">{KIND_LABEL[chip.kind]}</span>
          <span className="truncate">{chip.label}</span>
          {chip.removable && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(chip.id)}
              aria-label={`${chip.label} を外す`}
              title={`${chip.label} を外す`}
              className="shrink-0 rounded-full p-0.5 opacity-70 transition hover:bg-black/10 hover:opacity-100"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
    </div>
  )
}
