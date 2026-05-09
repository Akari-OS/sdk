/**
 * @file CrossVariantCompareView.tsx
 * AKARI-HUB-071 Phase 1 (T-17): cross-Variant 並列比較 view。
 *
 * 役割:
 *   - 2-3 Variant を split-screen で並列表示（横並び columns）
 *   - 各 Variant の Output / Asset / WorkState を render-prop で外側から差し込む
 *   - 共通 Asset / Variant 固有 override の差分を視覚的に区別する hint を提供
 *   - mode 切替: side-by-side（既定）/ overlay（重ね合わせ）
 *   - VariantTabBar の `compare with` action から起動される想定
 *
 * 設計指針:
 *   - 本 component は layout shell。具体的な Variant content（DOM 木 / preview /
 *     Inspector）は `renderVariant` render-prop で外側から差し込む（Variant の
 *     詳細な視覚化は app（design / video / writer）ごとに固有のため）
 *   - override / 共通 Asset の判定ロジックは外側で行い、本 component は受け取った
 *     `commonAssetIds` / `overrideAssetIds` を visual hint として使う
 *   - 4+ Variant grid mode は v0.3.0 候補（§10 OQ）。MVP は 2-3 個に制限
 *
 * 関連 spec / ADR:
 *   - spec-pool-ui-redesign-stage-context-pane (AKARI-HUB-071) §6 / AC-16
 *   - ADR-078 v0.2.0 §6-7（cross-Variant 操作: Compare）
 */

import * as React from "react"
import { useCallback, useMemo } from "react"
import { cn } from "./lib/cn"
import { PoolBadge } from "./PoolBadge"
import type { CompareViewState, VariantDisplay } from "./types/variant"

export interface CrossVariantCompareViewProps {
  /** 比較対象 Variant の表示情報（variant_ids と同じ順で渡す） */
  variants: VariantDisplay[]
  /** 比較 state（mode / highlight_overrides / variant_ids） */
  state: CompareViewState
  /** state を更新する callback（mode 切替 / 終了 / variant 追加削除） */
  onChange?: (next: CompareViewState) => void
  /** 比較を閉じる（VariantTabBar に戻る等） */
  onClose?: () => void
  /**
   * 各 Variant 列の中身を描画する render-prop。
   * ここで preview / Inspector / Asset list 等を返す。
   *
   * `assetIsOverride(assetId)` は引数 helper として渡され、override Asset を
   * 視覚強調するかの判定に使う。
   */
  renderVariant: (
    variant: VariantDisplay,
    helpers: {
      assetIsOverride: (assetId: string) => boolean
      assetIsCommon: (assetId: string) => boolean
    },
  ) => React.ReactNode
  /**
   * 全 Variant で共通参照される Asset ID 一覧。
   * 視覚 hint（同じ素材を異なる Variant で扱っているマーク）に使う。
   */
  commonAssetIds?: string[]
  /**
   * Variant ごとに override されている Asset ID マップ。
   * key = variantId、value = override されている assetId 配列。
   */
  overrideAssetIdsByVariant?: Record<string, string[]>
  className?: string
}

/**
 * 1 Variant 列のヘッダ（Variant 名 + format/preset + close button）。
 */
function VariantColumnHeader({
  variant,
  onRemove,
}: {
  variant: VariantDisplay
  onRemove?: () => void
}) {
  const formatLabel = variant.preset
    ? `${variant.format}/${variant.preset}`
    : variant.format
  return (
    <header className="flex items-center justify-between gap-2 border-b border-border bg-card/40 px-2 py-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        {variant.is_primary && (
          <span aria-label="primary" title="primary" className="text-amber-300">
            ★
          </span>
        )}
        <span className="truncate text-[12px] font-semibold">{variant.name}</span>
        <span className="text-[10px] text-muted-foreground">{formatLabel}</span>
        {variant.is_archived && (
          <PoolBadge variant="inactive" compact label="archived" />
        )}
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded px-1 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          title="この Variant を比較から外す"
          aria-label="remove from compare"
        >
          ×
        </button>
      )}
    </header>
  )
}

/**
 * cross-Variant 比較 view 本体。
 *
 * @example
 *   <CrossVariantCompareView
 *     variants={list.variants.filter(v => state.variant_ids.includes(v.id))}
 *     state={state}
 *     commonAssetIds={common}
 *     overrideAssetIdsByVariant={overrides}
 *     renderVariant={(v, h) => <DesignPreview variant={v} highlight={h} />}
 *     onChange={setState}
 *     onClose={() => setState(null)}
 *   />
 */
export function CrossVariantCompareView({
  variants,
  state,
  onChange,
  onClose,
  renderVariant,
  commonAssetIds = [],
  overrideAssetIdsByVariant = {},
  className,
}: CrossVariantCompareViewProps): React.ReactElement {
  // variant_ids の順を尊重しつつ、与えられた variants を並べる。
  const ordered = useMemo(() => {
    const byId = new Map(variants.map((v) => [v.id, v]))
    const out: VariantDisplay[] = []
    for (const id of state.variant_ids) {
      const v = byId.get(id)
      if (v) out.push(v)
    }
    return out
  }, [variants, state.variant_ids])

  const commonSet = useMemo(() => new Set(commonAssetIds), [commonAssetIds])

  const setMode = useCallback(
    (mode: CompareViewState["diff_mode"]) => {
      if (!onChange) return
      onChange({ ...state, diff_mode: mode })
    },
    [onChange, state],
  )

  const toggleHighlight = useCallback(() => {
    if (!onChange) return
    onChange({ ...state, highlight_overrides: !state.highlight_overrides })
  }, [onChange, state])

  const removeVariant = useCallback(
    (variantId: string) => {
      if (!onChange) return
      const remaining = state.variant_ids.filter((id) => id !== variantId)
      // 1 件以下になったら compare 自体終了（onClose）
      if (remaining.length < 2) {
        onClose?.()
        return
      }
      onChange({ ...state, variant_ids: remaining })
    },
    [onChange, onClose, state],
  )

  if (ordered.length < 2) {
    return (
      <div
        className={cn(
          "rounded-md border border-border bg-card/40 p-3 text-[11px] text-muted-foreground",
          className,
        )}
      >
        cross-Variant compare は 2 件以上の Variant が必要です。
      </div>
    )
  }
  // 4+ は MVP scope 外。3 件で打ち止め（VariantTabBar 側で抑止する想定）。
  const limited = ordered.slice(0, 3)

  return (
    <div
      data-component="CrossVariantCompareView"
      data-work-id={state.work_id}
      data-mode={state.diff_mode}
      className={cn("flex flex-col gap-2", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card/30 px-2 py-1.5">
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="font-semibold">Cross-Variant Compare</span>
          <span className="text-muted-foreground">
            {limited.length} variants
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div role="tablist" aria-label="diff mode" className="flex gap-1">
            {(["side-by-side", "overlay"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={state.diff_mode === m}
                onClick={() => setMode(m)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                  state.diff_mode === m
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {m === "side-by-side" ? "並列" : "重ね"}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={toggleHighlight}
            className={cn(
              "rounded border px-1.5 py-0.5 text-[10px] font-medium",
              state.highlight_overrides
                ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
            title="Variant-local override を視覚的に強調"
          >
            ⛯ override
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
              title="比較を閉じる"
            >
              閉じる
            </button>
          )}
        </div>
      </div>
      <div
        className={cn(
          state.diff_mode === "side-by-side"
            ? "grid gap-2"
            : "relative grid gap-2",
        )}
        style={{
          gridTemplateColumns: `repeat(${limited.length}, minmax(0, 1fr))`,
        }}
      >
        {limited.map((v) => {
          const overrides = new Set(overrideAssetIdsByVariant[v.id] ?? [])
          const helpers = {
            assetIsOverride: (id: string) =>
              state.highlight_overrides && overrides.has(id),
            assetIsCommon: (id: string) => commonSet.has(id),
          }
          return (
            <section
              key={v.id}
              aria-label={`Variant ${v.name}`}
              className={cn(
                "flex flex-col rounded-md border border-border bg-background",
                state.diff_mode === "overlay" && "opacity-90",
              )}
            >
              <VariantColumnHeader
                variant={v}
                onRemove={limited.length > 2 ? () => removeVariant(v.id) : undefined}
              />
              <div className="flex-1 min-h-0">{renderVariant(v, helpers)}</div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
