/**
 * @file StageView.tsx
 * AKARI-HUB-071 Phase 1 (T-3): Work Pool 配下の Upload / WorkState / Output
 * 固定 3 段 Stage を表示する component。
 *
 * 役割:
 *   - 3 種の StageKind を「tab 横並び」または「縦並び accordion」で固定 3 段表示
 *   - 各 Stage の active バッジ（🟢/⚪）と asset 件数バッジを表示
 *   - 削除メニュー / 並び替え禁止（system Stage、AC-5）
 *   - 各 Stage の中身（Asset list 等）は children render-prop で外側から差し込む
 *
 * 設計指針:
 *   - render-prop による content 差し替え: shell の PoolBrowser から具体的な
 *     Asset list を渡すケースと、空の placeholder で先行 layout 整備するケースを
 *     両立させる
 *   - tab / column の表示方式は v0.1.0 の Open Question (§10) であるため、props
 *     `layout` で切替可能にしておき、後で user テスト結果に応じて default を決める
 *   - active toggle 自体は本 component の責務外（PoolBadge を表示するのみ、
 *     toggle は ContextPane 側で扱う / T-7）
 *
 * 関連 spec / ADR:
 *   - spec-pool-ui-redesign-stage-context-pane (AKARI-HUB-071)
 *   - ADR-094 (Stage 概念 / 固定 3 段)
 */

import * as React from "react"
import { useState, useCallback } from "react"
import { cn } from "./lib/cn"
import { PoolBadge } from "./PoolBadge"
import type { StageDisplay, StageKind } from "./types/pool"

/** Stage の固定順序（ADR-094: Upload → WorkState → Output） */
export const STAGE_ORDER: readonly StageKind[] = [
  "upload",
  "workstate",
  "output",
] as const

/** UI ラベル（日本語） */
const STAGE_LABEL_JA: Record<StageKind, string> = {
  upload: "Upload",
  workstate: "WorkState",
  output: "Output",
}

/** Stage の説明（tooltip / accordion subtitle 等で使用） */
const STAGE_DESCRIPTION_JA: Record<StageKind, string> = {
  upload: "取り込んだ素材（一次資料）",
  workstate: "編集中の作業状態（中間生成物）",
  output: "出力候補・公開用 Variant",
}

export type StageViewLayout = "tabs" | "columns"

export interface StageViewProps {
  /**
   * 3 種の Stage の表示用 state。`STAGE_ORDER` の順で必ず 3 件渡す前提だが、
   * 安全のため undefined でも fallback する（is_active=false / asset_refs=[]）。
   */
  stages: Partial<Record<StageKind, StageDisplay>>
  /**
   * tab レイアウト時の初期選択 stage。default 'upload'。
   * 制御モード（外側 state を持ちたい場合）は `selected` + `onSelect` を使う。
   */
  defaultStage?: StageKind
  /** 制御モード: 外側で選択 stage を保持する場合 */
  selected?: StageKind
  onSelect?: (stage: StageKind) => void
  /**
   * tabs (横並び切替) / columns (縦並び 3 段同時表示)。
   * v0.1.0 §10 Open Question — default は "tabs"（user テストで再評価）。
   */
  layout?: StageViewLayout
  /**
   * 各 Stage の中身を描画する render prop。
   * Asset list 等の具体的内容は外側から差し込む（render-prop で疎結合）。
   * 省略時は asset 件数だけを示す placeholder を表示。
   */
  renderStageContent?: (stage: StageKind, display: StageDisplay) => React.ReactNode
  className?: string
}

const EMPTY_STAGE: StageDisplay = {
  // kind は loop 側で上書き
  kind: "upload",
  is_active: false,
  asset_refs: [],
}

function resolveStage(
  stage: StageKind,
  stages: StageViewProps["stages"],
): StageDisplay {
  return stages[stage] ?? { ...EMPTY_STAGE, kind: stage }
}

/**
 * 1 Stage の見出し（タブ or accordion ヘッダ共通）。
 * - active バッジ（🟢/⚪）
 * - asset 件数（asset_refs.length が > 0 のときのみ）
 * - system バッジ（compact） — 削除不可を視覚化
 */
function StageHeader({
  stage,
  display,
  active,
  onClick,
  role,
}: {
  stage: StageKind
  display: StageDisplay
  /** tab がアクティブ表示中か（layout="tabs" 用） */
  active?: boolean
  onClick?: () => void
  /** "tab" | "header" — accessibility 用 */
  role: "tab" | "header"
}) {
  const Cmp = role === "tab" ? "button" : "div"
  return (
    <Cmp
      type={role === "tab" ? "button" : undefined}
      role={role === "tab" ? "tab" : undefined}
      aria-selected={role === "tab" ? !!active : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 text-[11px] font-medium transition rounded-md",
        role === "tab" && "border",
        role === "tab" && active
          ? "border-primary/40 bg-primary/10 text-primary"
          : role === "tab"
            ? "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            : "text-foreground",
      )}
      title={STAGE_DESCRIPTION_JA[stage]}
    >
      <span className="font-semibold">{STAGE_LABEL_JA[stage]}</span>
      <PoolBadge
        variant={display.is_active ? "active" : "inactive"}
        compact
      />
      {display.asset_refs.length > 0 && (
        <span
          className="rounded-full bg-muted px-1.5 text-[9px] tabular-nums text-muted-foreground"
          title={`${display.asset_refs.length} 件の Asset`}
        >
          {display.asset_refs.length}
        </span>
      )}
      <PoolBadge variant="system" compact />
    </Cmp>
  )
}

/**
 * Stage の中身。renderStageContent が指定されていればそれを使い、
 * なければ件数だけの placeholder を出す。
 */
function StageContent({
  stage,
  display,
  renderStageContent,
}: {
  stage: StageKind
  display: StageDisplay
  renderStageContent?: StageViewProps["renderStageContent"]
}) {
  if (renderStageContent) {
    return <>{renderStageContent(stage, display)}</>
  }
  return (
    <div className="px-2 py-2 text-[11px] text-muted-foreground">
      {display.asset_refs.length === 0
        ? `${STAGE_LABEL_JA[stage]} に Asset はありません`
        : `${display.asset_refs.length} 件の Asset`}
    </div>
  )
}

/**
 * Upload / WorkState / Output 固定 3 段の Stage view。
 *
 * - layout="tabs"    : 横並びタブ + 1 Stage 分の content 表示
 * - layout="columns" : 3 Stage を縦に並べて全件同時表示
 *
 * 削除 / 並び替え機能は意図的に持たない（system Stage / AC-5）。
 */
export function StageView({
  stages,
  defaultStage = "upload",
  selected,
  onSelect,
  layout = "tabs",
  renderStageContent,
  className,
}: StageViewProps): React.ReactElement {
  const [internal, setInternal] = useState<StageKind>(defaultStage)
  const active: StageKind = selected ?? internal
  const handleSelect = useCallback(
    (s: StageKind) => {
      if (selected === undefined) setInternal(s)
      onSelect?.(s)
    },
    [selected, onSelect],
  )

  if (layout === "columns") {
    return (
      <div
        className={cn("flex flex-col gap-2", className)}
        data-stage-layout="columns"
      >
        {STAGE_ORDER.map((stage) => {
          const d = resolveStage(stage, stages)
          return (
            <section
              key={stage}
              aria-label={STAGE_LABEL_JA[stage]}
              className="rounded-md border border-border bg-card/40"
            >
              <StageHeader stage={stage} display={d} role="header" />
              <div className="border-t border-border">
                <StageContent
                  stage={stage}
                  display={d}
                  renderStageContent={renderStageContent}
                />
              </div>
            </section>
          )
        })}
      </div>
    )
  }

  // layout === "tabs"
  const activeDisplay = resolveStage(active, stages)
  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-stage-layout="tabs"
    >
      <div
        role="tablist"
        aria-label="Work Stage"
        className="flex items-center gap-1.5"
      >
        {STAGE_ORDER.map((stage) => {
          const d = resolveStage(stage, stages)
          return (
            <StageHeader
              key={stage}
              stage={stage}
              display={d}
              active={active === stage}
              onClick={() => handleSelect(stage)}
              role="tab"
            />
          )
        })}
      </div>
      <div role="tabpanel" className="rounded-md border border-border bg-card/30">
        <StageContent
          stage={active}
          display={activeDisplay}
          renderStageContent={renderStageContent}
        />
      </div>
    </div>
  )
}
