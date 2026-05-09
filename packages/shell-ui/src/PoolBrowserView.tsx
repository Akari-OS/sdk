/**
 * @file PoolBrowserView.tsx
 * AKARI-HUB-071 Phase 1 (T-4): 3 領域 (Personal Pool / Work Pool / Pool) layout。
 *
 * 役割:
 *   - 左サイドバー / アプリ素材ペインの土台 layout を担う pure component
 *   - 上段 Personal Pool (1 件固定 / ambient) / 中段 Work Pool (現在 Work + StageView)
 *     / 下段 Pool (cross-work pinned + recent) の 3 領域に明示分離
 *   - 各領域の中身は render-prop (renderStageContent / renderPoolContent) で外側から
 *     差し込む。本 component 自身は asset の取得・表示は一切行わない
 *   - Personal Pool / Work Pool は AC-3 / AC-5 を構造で担保: PoolRow が
 *     `data-pool-kind=personal|work` のときは context menu / delete UI を出さない
 *     責務を負わない (callback も提供しない) ことで「削除メニューを出せない」状態を作る
 *   - VariantTabBar (v0.2.0 / T-15) を Work Pool ヘッダ直下に差し込めるよう
 *     `workVariantSlot` prop を予約
 *
 * 設計指針:
 *   - presentational only: 状態 (selected, expanded) は基本的に外側から制御
 *     できるが、selectedPoolId 等は uncontrolled でも動くよう default を持つ
 *   - 折りたたみ toggle (AC-13 / T-12) は別 task — 本 component は内側 layout のみ担当
 *   - asset 取得・分類ロジックは MaterialPanel (T-5) に持たせる。本 component は
 *     PoolDisplay / StageDisplay を受け取って表示するだけ
 *
 * 関連 spec / ADR:
 *   - spec-pool-ui-redesign-stage-context-pane (AKARI-HUB-071) §6 Components
 *   - ADR-094 (Pool / Stage 概念)
 *   - ADR-075 (Personal Pool ambient)
 *   - ADR-079 (Pool 統合 / pin max 10)
 */

import * as React from "react"
import { cn } from "./lib/cn"
import { PoolBadge } from "./PoolBadge"
import { StageView, type StageViewLayout } from "./StageView"
import type { PoolDisplay, StageDisplay, StageKind } from "./types/pool"

/**
 * Pool の pin 上限 (ADR-079: soft 制約)。
 * 超えても作成は許可し、警告 UI を表示する。
 */
export const POOL_PIN_MAX = 10

export interface PoolBrowserViewProps {
  /**
   * Personal Pool エントリ (上段)。null / undefined なら領域ごと非表示。
   * Personal Pool は ADR-075 で常時 attach (ambient) のため、is_active は
   * 通常 true で渡される想定。AC-2 / AC-3 の根拠。
   */
  personalPool?: PoolDisplay | null
  /**
   * 現在の Work Pool + Upload/WorkState/Output 3 段 stage (中段)。
   * null / undefined なら領域ごと非表示。AC-4 / AC-5 の根拠。
   */
  workPool?: {
    pool: PoolDisplay
    stages: Partial<Record<StageKind, StageDisplay>>
  } | null
  /**
   * Cross-Work pool 一覧 (下段)。pinned (max 10 を超えたら警告) +
   * 残りを last_activity 降順で表示。AC-7 の根拠。
   */
  crossWorkPools?: PoolDisplay[]
  /** pin 上限 (default: POOL_PIN_MAX = 10)。超過時に警告 banner 表示。 */
  pinnedMax?: number
  /**
   * Pool 行クリック時のコールバック。Cross-Work pool で呼ばれる主用途は
   * 「下段で 1 件選択 → renderPoolContent でその pool の中身を表示」。
   * Personal / Work pool で呼ばれた場合は通常 no-op で OK。
   */
  onPoolClick?: (pool: PoolDisplay) => void
  /** 選択中 pool ID (cross-work の選択ハイライト + content 表示対象) */
  selectedPoolId?: string | null
  /** Stage 選択 (制御モード) */
  selectedStage?: StageKind
  /** Stage 選択コールバック */
  onSelectStage?: (s: StageKind) => void
  /**
   * Stage の中身を描画する render prop。Asset thumbnail grid 等を返す。
   * StageView の renderStageContent にそのまま渡される。
   */
  renderStageContent?: (
    stage: StageKind,
    display: StageDisplay,
  ) => React.ReactNode
  /**
   * Pool の中身を描画する render prop。
   * - Personal Pool: 常に呼ばれる
   * - Cross-Work Pool: selected な pool についてのみ呼ばれる
   *   (下段は list 主体のため、選択された 1 件だけ展開する設計)
   */
  renderPoolContent?: (pool: PoolDisplay) => React.ReactNode
  /** StageView の layout (default: 'tabs') */
  stageLayout?: StageViewLayout
  /**
   * Work Pool ヘッダ直下に差し込むスロット。
   * v0.2.0 の VariantTabBar (T-15) を埋めるための拡張点。
   */
  workVariantSlot?: React.ReactNode
  /** ヘッダの subtitle 等を多言語化するための override slots */
  labels?: Partial<Record<"personal" | "work" | "pool", string>>
  className?: string
}

const DEFAULT_LABELS = {
  personal: "Personal Pool",
  work: "Work Pool",
  pool: "Pool",
} as const

/**
 * 3 領域 (Personal / Work / Cross-Work) で Pool 群を表示する layout。
 *
 * 各領域は border-b で視覚的に区切られ、ヘッダがそれぞれの意味を示す。
 * 内側のコンテンツ (asset list 等) は render prop で差し込む。
 */
export function PoolBrowserView({
  personalPool,
  workPool,
  crossWorkPools = [],
  pinnedMax = POOL_PIN_MAX,
  onPoolClick,
  selectedPoolId,
  selectedStage,
  onSelectStage,
  renderStageContent,
  renderPoolContent,
  stageLayout = "tabs",
  workVariantSlot,
  labels,
  className,
}: PoolBrowserViewProps): React.ReactElement {
  const lbl = { ...DEFAULT_LABELS, ...labels }

  // Cross-Work の pin / recent 仕分け (ADR-079)
  const pinned = crossWorkPools.filter((p) => p.is_pinned && !p.is_archived)
  // 非 pin は archived 含めて last_activity 降順
  const recent = crossWorkPools
    .filter((p) => !p.is_pinned)
    .slice()
    .sort((a, b) => b.last_activity.localeCompare(a.last_activity))
  const pinOverflow = pinned.length > pinnedMax

  // Cross-Work で選択中の pool (renderPoolContent 表示対象)
  const selectedCrossWork =
    selectedPoolId != null
      ? crossWorkPools.find((p) => p.id === selectedPoolId)
      : null

  return (
    <div
      className={cn("flex flex-col h-full overflow-y-auto", className)}
      data-component="PoolBrowserView"
    >
      {/* ===== Region 1: Personal Pool ===== */}
      {personalPool && (
        <PoolBrowserRegion
          title={lbl.personal}
          subtitle="ユーザー固有・常時 attach"
        >
          <PoolRow
            pool={personalPool}
            selected={selectedPoolId === personalPool.id}
            onClick={() => onPoolClick?.(personalPool)}
          />
          {renderPoolContent && (
            <div className="px-2 pb-2">{renderPoolContent(personalPool)}</div>
          )}
        </PoolBrowserRegion>
      )}

      {/* ===== Region 2: Work Pool ===== */}
      {workPool && (
        <PoolBrowserRegion title={lbl.work} subtitle="現在の Work">
          <PoolRow
            pool={workPool.pool}
            selected={selectedPoolId === workPool.pool.id}
            onClick={() => onPoolClick?.(workPool.pool)}
          />
          {workVariantSlot && (
            <div className="px-2 pb-1">{workVariantSlot}</div>
          )}
          <div className="px-2 pb-2">
            <StageView
              stages={workPool.stages}
              layout={stageLayout}
              selected={selectedStage}
              onSelect={onSelectStage}
              renderStageContent={renderStageContent}
            />
          </div>
        </PoolBrowserRegion>
      )}

      {/* ===== Region 3: Cross-Work Pool (pinned + recent) ===== */}
      <PoolBrowserRegion
        title={lbl.pool}
        subtitle="ピン留め・履歴"
        emptyHint={
          pinned.length === 0 && recent.length === 0
            ? "まだ Pool がありません"
            : undefined
        }
      >
        {pinOverflow && (
          <div className="mx-2 mb-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300">
            pin 上限 {pinnedMax} を超えています ({pinned.length} 件)。
            育てる軸を絞ることをおすすめします。
          </div>
        )}
        {pinned.length > 0 && (
          <PoolGroupSection title={`Pinned (${pinned.length}/${pinnedMax})`}>
            {pinned.map((p) => (
              <PoolRow
                key={p.id}
                pool={p}
                selected={selectedPoolId === p.id}
                onClick={() => onPoolClick?.(p)}
              />
            ))}
          </PoolGroupSection>
        )}
        {recent.length > 0 && (
          <PoolGroupSection title="Recent">
            {recent.map((p) => (
              <PoolRow
                key={p.id}
                pool={p}
                selected={selectedPoolId === p.id}
                onClick={() => onPoolClick?.(p)}
              />
            ))}
          </PoolGroupSection>
        )}
        {selectedCrossWork && renderPoolContent && (
          <div className="px-2 pb-2 pt-1">
            {renderPoolContent(selectedCrossWork)}
          </div>
        )}
      </PoolBrowserRegion>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Internal subcomponents                                                     */
/* -------------------------------------------------------------------------- */

function PoolBrowserRegion({
  title,
  subtitle,
  emptyHint,
  children,
}: {
  title: string
  subtitle?: string
  emptyHint?: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section
      aria-label={title}
      className="border-b border-border last:border-b-0 shrink-0"
    >
      <header className="px-3 pt-2 pb-1 sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold tracking-wide text-foreground">
            {title}
          </span>
          {subtitle && (
            <span className="text-[9px] text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </header>
      {emptyHint ? (
        <div className="px-3 py-2 text-[11px] text-muted-foreground">
          {emptyHint}
        </div>
      ) : (
        children
      )}
    </section>
  )
}

function PoolGroupSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div className="px-2 pb-1">
      <div className="px-1 pb-0.5 pt-1 text-[9px] uppercase tracking-wider text-muted-foreground/70">
        {title}
      </div>
      <div className="space-y-px">{children}</div>
    </div>
  )
}

/**
 * Pool 1 件の行表示。
 * - Personal Pool → ambient badge
 * - Work Pool → system badge
 * - Cross-Work → active / inactive badge (Agent attach 状態)
 *
 * 削除 / context menu callback は本 component は受け付けない。
 * Personal / Work pool の AC-3 / AC-5 (削除不可) を「callback がない」ことで
 * 構造的に担保する。Cross-Work pool での削除等は外側 layer (将来 task) で扱う。
 */
function PoolRow({
  pool,
  selected,
  onClick,
}: {
  pool: PoolDisplay
  selected?: boolean
  onClick?: () => void
}): React.ReactElement {
  const badgeVariant =
    pool.kind === "personal"
      ? "ambient"
      : pool.kind === "work"
        ? "system"
        : pool.is_active
          ? "active"
          : "inactive"

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick?.()
        }
      }}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 cursor-pointer transition rounded",
        selected
          ? "bg-primary/10 text-primary"
          : "text-foreground hover:bg-accent",
        pool.is_archived && "opacity-60",
      )}
      data-pool-id={pool.id}
      data-pool-kind={pool.kind}
      title={pool.name}
    >
      <PoolBadge variant={badgeVariant} compact />
      <span className="flex-1 truncate text-[12px] font-medium">{pool.name}</span>
      {pool.is_pinned && (
        <span
          aria-label="pinned"
          title="pinned"
          className="text-[9px] text-muted-foreground"
        >
          📌
        </span>
      )}
      {pool.is_archived && (
        <span className="text-[9px] text-muted-foreground">archived</span>
      )}
    </div>
  )
}
