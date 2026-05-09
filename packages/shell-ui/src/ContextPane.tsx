/**
 * @file ContextPane.tsx
 * AKARI-HUB-071 Phase 1 (T-6): Agent パネル内「現在のコンテキスト」 pane。
 *
 * 役割:
 *   - useContextPane で取得した attach 中の Pool / Stage / Asset を list 表示（AC-8）
 *   - 各行の右端に attach/detach toggle を出し、useContextToggle で個別切替（AC-9）
 *   - 折りたたみ toggle（spec §9 Risk: LocalStorage `akari-os.shell-ui.material-panel.collapsed`
 *     と区別する別 key `akari-os.shell-ui.context-pane.collapsed` を使う）
 *
 * 設計指針:
 *   - 一画面化原則（ルール 9 / 11）: モーダル禁止、即時反映 toggle、Undo は MVP 後
 *   - shell-ui パッケージは Tauri に直接依存しないため adapter (DI) を props で受け取る
 *   - `<PoolBadge>` で active / system / ambient バッジを再利用
 *   - resolver で Pool 名等の表示メタを join、未提供時は id fallback
 *
 * 関連:
 *   - spec: AKARI-HUB-071 §6 / AC-8 / AC-9
 *   - hooks/useContextPane.ts / hooks/useContextToggle.ts
 *   - PoolBadge.tsx / StageView.tsx
 */

import * as React from "react"
import { useCallback, useEffect, useState } from "react"
import { cn } from "./lib/cn"
import { PoolBadge } from "./PoolBadge"
import { useContextPane } from "./hooks/useContextPane"
import { useContextToggle } from "./hooks/useContextToggle"
import type {
  ContextAttachAdapter,
  ContextDisplayResolver,
  ContextToggleTarget,
} from "./types/context-attach"
import type { PoolDisplay, StageKind } from "./types/pool"

/** ContextPane 折りたたみ用 LocalStorage key */
export const CONTEXT_PANE_COLLAPSED_LS_KEY =
  "akari-os.shell-ui.context-pane.collapsed"

/** Stage label の日本語化（StageView と同じ）。インポートを避けて duplication を許容 */
const STAGE_LABEL_JA: Record<StageKind, string> = {
  upload: "Upload",
  workstate: "WorkState",
  output: "Output",
}

export interface ContextPaneProps {
  /** pool-impl 接続用 adapter（shell 側 DI） */
  adapter: ContextAttachAdapter
  /** 現在編集中の Work ID */
  workId: string | null | undefined
  /** Variant ID — set 系で必須、get は省略時 primary fallback */
  variantId?: string
  /** Pool / Asset 表示メタの resolver */
  resolver?: ContextDisplayResolver
  /**
   * 折りたたみ初期値の override。
   * 未指定時は LocalStorage を参照、無ければ false（展開）。
   */
  defaultCollapsed?: boolean
  /** 制御モード: 折りたたみ state を外側で持つ */
  collapsed?: boolean
  onCollapsedChange?: (next: boolean) => void
  /** className override（Agent panel 内 layout 整え用） */
  className?: string
  /**
   * Personal Pool 等の ambient な Pool は detach できないようにする ID 集合。
   * 未指定時は空（全 toggle 可能）。
   */
  ambientPoolIds?: ReadonlySet<string>
}

function readLsCollapsed(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false
  try {
    return window.localStorage.getItem(CONTEXT_PANE_COLLAPSED_LS_KEY) === "1"
  } catch {
    return false
  }
}

function writeLsCollapsed(next: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return
  try {
    window.localStorage.setItem(
      CONTEXT_PANE_COLLAPSED_LS_KEY,
      next ? "1" : "0",
    )
  } catch {
    /* localStorage 不可環境（SSR / private mode）は静かに無視 */
  }
}

/**
 * 「現在のコンテキスト」 pane。
 *
 * Agent panel（PartnerAgentPane 等）の頭または専用タブに置く想定。
 * `workId` 未指定（Work 未選択）時は guidance を表示してそのまま終わる。
 */
export function ContextPane({
  adapter,
  workId,
  variantId,
  resolver,
  defaultCollapsed,
  collapsed: collapsedProp,
  onCollapsedChange,
  className,
  ambientPoolIds,
}: ContextPaneProps): React.ReactElement {
  const [internalCollapsed, setInternalCollapsed] = useState<boolean>(
    () => defaultCollapsed ?? readLsCollapsed(),
  )
  const collapsed = collapsedProp ?? internalCollapsed

  const handleToggleCollapse = useCallback(() => {
    const next = !collapsed
    if (collapsedProp === undefined) {
      setInternalCollapsed(next)
      writeLsCollapsed(next)
    }
    onCollapsedChange?.(next)
  }, [collapsed, collapsedProp, onCollapsedChange])

  const { state, loading, error, refresh } = useContextPane({
    adapter,
    workId,
    variantId,
    resolver,
  })

  const { toggle, pending } = useContextToggle({
    adapter,
    workId: workId ?? "",
    // detach は variantId が必須。未指定の場合は空文字（pool-impl 側で 400 系エラー）
    variantId: variantId ?? "",
    onChange: () => void refresh(),
  })

  // Work 切替・variant 切替時に折りたたみ状態は維持、refresh は hook 内 useEffect が走る
  useEffect(() => {
    /* noop — hook が refresh する */
  }, [workId, variantId])

  const headerClass =
    "flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card/40"

  if (!workId) {
    return (
      <div
        className={cn(
          "flex flex-col rounded-md border border-border bg-card/30",
          className,
        )}
        data-context-pane
      >
        <div className={headerClass}>
          <span className="text-xs font-semibold text-muted-foreground">
            現在のコンテキスト
          </span>
        </div>
        <p className="px-3 py-2 text-[11px] text-muted-foreground">
          Work が選択されていません。Work を選ぶと attach 中の Pool / Stage / Asset
          が表示されます。
        </p>
      </div>
    )
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={handleToggleCollapse}
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-card/30 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition w-full text-left",
          className,
        )}
        title="現在のコンテキストを開く"
        aria-expanded={false}
        data-context-pane-collapsed
      >
        <span className="font-semibold">現在のコンテキスト</span>
        <span className="text-[10px]">▸</span>
      </button>
    )
  }

  const counts = {
    pools: state?.attached_pools.length ?? 0,
    stages: state?.attached_stages.length ?? 0,
    assets: state?.attached_assets.length ?? 0,
  }

  const handleTogglePool = (pool: PoolDisplay) => {
    if (pool.is_system || ambientPoolIds?.has(pool.id)) return
    void toggle({ kind: "pool", id: pool.id, pool_kind: pool.kind }, false)
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-md border border-border bg-card/30",
        className,
      )}
      data-context-pane
    >
      {/* Header */}
      <div className={headerClass}>
        <button
          type="button"
          onClick={handleToggleCollapse}
          className="flex items-center gap-1 text-xs font-semibold hover:text-primary transition"
          aria-expanded={true}
          title="現在のコンテキストを折りたたむ"
        >
          <span>現在のコンテキスト</span>
          <span className="text-[10px] text-muted-foreground">▾</span>
        </button>
        <span
          className="text-[10px] tabular-nums text-muted-foreground"
          aria-live="polite"
        >
          P{counts.pools}/S{counts.stages}/A{counts.assets}
          {loading && <span className="ml-1 opacity-70">…</span>}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 p-2">
        {error && (
          <div
            role="alert"
            className="rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[10px] text-destructive"
          >
            読み込みエラー: {error.message}
            <button
              type="button"
              onClick={() => void refresh()}
              className="ml-2 underline hover:no-underline"
            >
              再試行
            </button>
          </div>
        )}

        {/* Pools */}
        <section aria-label="attach 中の Pool">
          <h4 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pool ({counts.pools})
          </h4>
          {state && state.attached_pools.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {state.attached_pools.map((p) => {
                const isAmbient =
                  p.kind === "personal" || ambientPoolIds?.has(p.id) === true
                const protectedRow = p.is_system || isAmbient
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-accent/40"
                    data-pool-id={p.id}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <PoolBadge
                        variant={isAmbient ? "ambient" : "active"}
                        compact
                      />
                      <span className="truncate text-[11px]">{p.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTogglePool(p)}
                      disabled={pending || protectedRow}
                      className={cn(
                        "shrink-0 rounded border px-1.5 py-px text-[10px] transition",
                        protectedRow
                          ? "border-border text-muted-foreground/60 cursor-not-allowed"
                          : "border-border text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40",
                      )}
                      title={
                        protectedRow
                          ? "system / ambient Pool は detach できません"
                          : "detach"
                      }
                      data-action="detach-pool"
                    >
                      detach
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-1 px-1 text-[10px] text-muted-foreground">
              attach 中の Pool はありません
            </p>
          )}
        </section>

        {/* Stages */}
        <section aria-label="attach 中の Stage">
          <h4 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Stage ({counts.stages})
          </h4>
          {state && state.attached_stages.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {state.attached_stages.map((s, idx) => (
                <li
                  key={`${s.workId}-${s.stage.kind}-${idx}`}
                  className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-accent/40"
                  data-stage-kind={s.stage.kind}
                >
                  <span className="flex items-center gap-1.5">
                    <PoolBadge variant="active" compact />
                    <span className="text-[11px]">
                      {STAGE_LABEL_JA[s.stage.kind]}
                    </span>
                    {s.stage.asset_refs.length > 0 && (
                      <span className="rounded-full bg-muted px-1.5 text-[9px] tabular-nums text-muted-foreground">
                        {s.stage.asset_refs.length}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      void toggle({ kind: "stage", id: s.stage.kind }, false)
                    }
                    disabled={pending}
                    className="shrink-0 rounded border border-border px-1.5 py-px text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition disabled:opacity-50"
                    title="この Stage を detach"
                    data-action="detach-stage"
                  >
                    detach
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 px-1 text-[10px] text-muted-foreground">
              attach 中の Stage はありません
            </p>
          )}
        </section>

        {/* Assets */}
        <section aria-label="attach 中の Asset">
          <h4 className="px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Asset ({counts.assets})
          </h4>
          {state && state.attached_assets.length > 0 ? (
            <ul className="mt-1 space-y-1">
              {state.attached_assets.map((a) => {
                const meta = resolver?.resolveAsset?.(a.assetId) ?? null
                return (
                  <li
                    key={a.assetId}
                    className="flex items-center justify-between gap-2 rounded px-1.5 py-1 hover:bg-accent/40"
                    data-asset-id={a.assetId}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      <PoolBadge variant="active" compact />
                      <span className="truncate text-[11px]">
                        {meta?.name ?? a.assetId}
                      </span>
                      {a.reason === "inherited" && (
                        <span
                          className="rounded bg-muted px-1 text-[9px] text-muted-foreground"
                          title="親 Pool / Stage の attach から自動継承された Asset"
                        >
                          継承
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void toggle({ kind: "asset", id: a.assetId }, false)
                      }
                      disabled={pending || a.reason === "inherited"}
                      className="shrink-0 rounded border border-border px-1.5 py-px text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition disabled:opacity-50"
                      title={
                        a.reason === "inherited"
                          ? "継承 Asset は親 Pool / Stage 側で外してください"
                          : "Asset を detach"
                      }
                      data-action="detach-asset"
                    >
                      detach
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="mt-1 px-1 text-[10px] text-muted-foreground">
              attach 中の Asset はありません
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

/**
 * 単純な ContextToggleTarget 構築 helper（型補完用）。
 * caller 側で type narrowing を効かせやすくするため exposed。
 */
export function poolTarget(id: string): ContextToggleTarget {
  return { kind: "pool", id }
}
export function stageTarget(stage: StageKind): ContextToggleTarget {
  return { kind: "stage", id: stage }
}
export function assetTarget(id: string): ContextToggleTarget {
  return { kind: "asset", id }
}
