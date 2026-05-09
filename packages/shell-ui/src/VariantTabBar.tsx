/**
 * @file VariantTabBar.tsx
 * AKARI-HUB-071 Phase 1 (T-15): Pool browser の Work 配下に表示する
 * 並列創作ブランチ用 Variant 一覧バー。
 *
 * 役割:
 *   - 1 Work に紐づく N Variant を横並びタブとして列挙
 *   - primary Variant を先頭に固定（⭐ バッジ）
 *   - active Variant をハイライト（現在 app instance で開いている方）
 *   - archived は既定で折りたたみ、toggle で展開
 *   - `+ New Variant` ドロップダウン:
 *       - Fork from current (default, Cmd+D)
 *       - Fork from another Variant ▶
 *       - + New Empty Variant
 *   - Variant 数（active_count）> 10 で soft 警告 UI（ADR-078 v0.2.0 §6-6）
 *   - 右クリックで VariantContextMenu を起動
 *
 * 設計指針:
 *   - 状態管理は外部に委ね、render のみを担当（onSelect / onAction で外側に通知）
 *   - dropdown / context menu の実 UI ホスト（ポータル）は外側で行う前提で、本
 *     component はトリガと callback の wiring のみを提供（dependency 軽量化）
 *   - Cmd+D（macOS）/ Ctrl+D（others）は document keydown で listen
 *   - aria-roletype は role=\"tablist\" + role=\"tab\" で揃え、StageView と整合
 *
 * 関連 spec / ADR:
 *   - spec-pool-ui-redesign-stage-context-pane (AKARI-HUB-071) §6 / AC-14, AC-17
 *   - ADR-078 v0.2.0 §6-1〜6-7（Variant 並列ブランチ + Cross-Variant 操作）
 */

import * as React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { cn } from "./lib/cn"
import { PoolBadge } from "./PoolBadge"
import type {
  VariantAction,
  VariantDisplay,
  VariantList,
} from "./types/variant"

/**
 * `+ New Variant` ドロップダウンの選択肢。
 * `from` は VariantAction['fork']['from'] と整合（'current' | 'empty' | <variant_id>）。
 */
export type NewVariantChoice = "current" | "empty" | { fromVariantId: string }

export interface VariantTabBarProps {
  /** 表示する Variant 一覧（VariantList を rich shape のまま受け取る） */
  list: VariantList
  /**
   * Variant が選択（クリック / Enter）されたときに発火。
   * 親側で active_variant_id 更新 + app instance 切替を行う。
   */
  onSelect?: (variantId: string) => void
  /**
   * 右クリック / context menu 起動。
   * 親側で VariantContextMenu を popover として描画する。
   */
  onContextRequest?: (variantId: string, anchor: { x: number; y: number }) => void
  /**
   * Variant action（promote / archive / fork / compare）発火。
   * 主に VariantContextMenu や `+ New Variant` ドロップダウンから呼ばれる。
   */
  onAction?: (action: VariantAction) => void
  /**
   * archived な Variant を初期状態で展開するか（default false = 折りたたみ）。
   */
  initialShowArchived?: boolean
  /**
   * Cmd+D / Ctrl+D で fork from current ショートカットを listen するか。
   * 複数 VariantTabBar が同時マウントされる状況を避けるため、
   * 親 view 側で「現在 visible な VariantTabBar のみ true にする」運用を想定。
   * default true。
   */
  enableForkShortcut?: boolean
  /**
   * Variant 数の soft 警告閾値。default 10（ADR-078 v0.2.0 §6-6）。
   */
  softWarnLimit?: number
  className?: string
}

/**
 * Variant の表示順:
 *   1. primary（is_primary=true）
 *   2. その他 active（is_archived=false）— last_activity 降順
 *   3. archived（is_archived=true）— last_activity 降順
 */
function sortVariants(variants: VariantDisplay[]): VariantDisplay[] {
  const sorted = [...variants]
  sorted.sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
    if (a.is_archived !== b.is_archived) return a.is_archived ? 1 : -1
    return b.last_activity.localeCompare(a.last_activity)
  })
  return sorted
}

/** 1 Variant 分のタブ button（primary バッジ + active hi-light + archived 表示）。 */
function VariantTab({
  variant,
  isActive,
  onSelect,
  onContextRequest,
}: {
  variant: VariantDisplay
  isActive: boolean
  onSelect?: (id: string) => void
  onContextRequest?: VariantTabBarProps["onContextRequest"]
}) {
  const handleContext = useCallback(
    (e: React.MouseEvent) => {
      if (!onContextRequest) return
      e.preventDefault()
      onContextRequest(variant.id, { x: e.clientX, y: e.clientY })
    },
    [onContextRequest, variant.id],
  )

  const formatLabel = variant.preset
    ? `${variant.format}/${variant.preset}`
    : variant.format

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      data-variant-id={variant.id}
      data-archived={variant.is_archived ? "true" : "false"}
      data-primary={variant.is_primary ? "true" : "false"}
      onClick={() => onSelect?.(variant.id)}
      onContextMenu={handleContext}
      title={`${variant.name} (${formatLabel})`}
      className={cn(
        "group flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium leading-none transition whitespace-nowrap",
        isActive
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
        variant.is_archived && "opacity-60",
      )}
    >
      {variant.is_primary && (
        <span aria-label="primary Variant" title="primary" className="text-amber-300">
          ★
        </span>
      )}
      <span className="font-semibold">{variant.name}</span>
      <span className="text-muted-foreground/80 text-[10px]">{formatLabel}</span>
      {variant.is_archived && (
        <PoolBadge variant="inactive" compact label="archived" />
      )}
    </button>
  )
}

/** `+ New Variant` ドロップダウン（軽量 popover）。 */
function NewVariantDropdown({
  list,
  onPick,
}: {
  list: VariantList
  onPick: (choice: NewVariantChoice) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  // outside click で閉じる
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const otherActiveVariants = list.variants.filter(
    (v) => !v.is_archived && v.id !== list.active_variant_id,
  )

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md border border-dashed border-primary/40 px-2 py-1 text-[11px] font-medium leading-none text-primary hover:bg-primary/10"
        title="新しい Variant を作成（Cmd+D で「現 Variant から fork」）"
      >
        <span aria-hidden="true">＋</span>
        <span>New Variant</span>
        <span aria-hidden="true" className="text-[9px]">
          ▾
        </span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label="New Variant の作成方法"
          className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-border bg-popover p-1 text-[11px] shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center justify-between rounded px-2 py-1 hover:bg-accent"
            onClick={() => {
              onPick("current")
              setOpen(false)
            }}
          >
            <span>Fork from current</span>
            <span className="text-muted-foreground text-[9px]">⌘D</span>
          </button>
          {otherActiveVariants.length > 0 && (
            <details className="rounded">
              <summary className="cursor-pointer rounded px-2 py-1 hover:bg-accent">
                Fork from another Variant ▶
              </summary>
              <div className="mt-0.5 ml-2 flex flex-col gap-0.5">
                {otherActiveVariants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="menuitem"
                    className="rounded px-2 py-1 text-left hover:bg-accent"
                    onClick={() => {
                      onPick({ fromVariantId: v.id })
                      setOpen(false)
                    }}
                  >
                    {v.name} <span className="text-muted-foreground">({v.format})</span>
                  </button>
                ))}
              </div>
            </details>
          )}
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center rounded px-2 py-1 hover:bg-accent"
            onClick={() => {
              onPick("empty")
              setOpen(false)
            }}
          >
            ＋ New Empty Variant
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Variant 一覧バー本体。
 *
 * @example
 *   <VariantTabBar
 *     list={list}
 *     onSelect={(id) => switchActiveVariant(id)}
 *     onAction={(a) => dispatchVariantAction(a)}
 *     onContextRequest={(id, anchor) => showContextMenu(id, anchor)}
 *   />
 */
export function VariantTabBar({
  list,
  onSelect,
  onContextRequest,
  onAction,
  initialShowArchived = false,
  enableForkShortcut = true,
  softWarnLimit = 10,
  className,
}: VariantTabBarProps): React.ReactElement {
  const [showArchived, setShowArchived] = useState(initialShowArchived)

  const sorted = useMemo(() => sortVariants(list.variants), [list.variants])
  const active = sorted.filter((v) => !v.is_archived)
  const archived = sorted.filter((v) => v.is_archived)
  const overSoftLimit = list.active_count > softWarnLimit

  // Cmd+D / Ctrl+D: fork from current
  useEffect(() => {
    if (!enableForkShortcut || !onAction) return
    const onKey = (e: KeyboardEvent) => {
      const isModD = (e.metaKey || e.ctrlKey) && e.key === "d"
      if (!isModD) return
      // textarea / input にフォーカスがある場合はネイティブ動作（Bookmark 等）に
      // 干渉しないようスキップする運用も検討余地あり。MVP は常時 intercept。
      e.preventDefault()
      onAction({ kind: "fork", from: "current" })
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [enableForkShortcut, onAction])

  const handlePickNew = useCallback(
    (choice: NewVariantChoice) => {
      if (!onAction) return
      if (choice === "current" || choice === "empty") {
        onAction({ kind: "fork", from: choice })
      } else {
        onAction({ kind: "fork", from: choice.fromVariantId })
      }
    },
    [onAction],
  )

  return (
    <div
      data-component="VariantTabBar"
      data-work-id={list.work_id}
      className={cn("flex flex-col gap-1.5", className)}
    >
      <div
        role="tablist"
        aria-label="Variant 一覧"
        className="flex flex-wrap items-center gap-1.5"
      >
        {active.map((v) => (
          <VariantTab
            key={v.id}
            variant={v}
            isActive={v.id === list.active_variant_id}
            onSelect={onSelect}
            onContextRequest={onContextRequest}
          />
        ))}
        <NewVariantDropdown list={list} onPick={handlePickNew} />
        {archived.length > 0 && (
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="rounded-md border border-border px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-accent"
            title={
              showArchived
                ? "archived な Variant を隠す"
                : "archived な Variant を表示"
            }
          >
            archived ({archived.length}) {showArchived ? "▾" : "▸"}
          </button>
        )}
      </div>
      {showArchived && archived.length > 0 && (
        <div
          role="list"
          aria-label="archived Variant"
          className="flex flex-wrap items-center gap-1.5 border-t border-dashed border-border pt-1.5"
        >
          {archived.map((v) => (
            <VariantTab
              key={v.id}
              variant={v}
              isActive={v.id === list.active_variant_id}
              onSelect={onSelect}
              onContextRequest={onContextRequest}
            />
          ))}
        </div>
      )}
      {overSoftLimit && (
        <div
          role="status"
          className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200"
          title="ADR-078 v0.2.0 §6-6: Variant 数 soft 警告 max 10"
        >
          ⚠ Variant 数が {list.active_count} 件です（推奨上限 {softWarnLimit}）。
          育てる軸を絞ることを検討してください（archive / promote の活用）。
        </div>
      )}
    </div>
  )
}
