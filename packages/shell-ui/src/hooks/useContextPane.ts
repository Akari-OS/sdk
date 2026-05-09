/**
 * @file hooks/useContextPane.ts
 * AKARI-HUB-071 Phase 1 (T-7): 「現在のコンテキスト」 pane の state 取得 hook。
 *
 * 役割:
 *   - pool-impl `context_attach_get` を adapter 経由で呼び、ContextAttachRecord
 *     列を取得 → ContextPaneState に整形する
 *   - workId / variantId が変わったら refetch
 *   - manual refresh / 楽観更新（外部からの上書き）にも対応
 *
 * 設計指針:
 *   - shell-ui は Tauri / MCP 直叩き禁止 → adapter (DI) で抽象化（types/context-attach.ts）
 *   - ContextPaneState の表示用 PoolDisplay 等は ContextDisplayResolver で
 *     resolve（Pool 名 / Asset 名 / inherited reason 等）
 *   - 連続呼び出しを避けるため request id で stale 結果を破棄
 *
 * 関連:
 *   - spec: AKARI-HUB-071 §6 API / Protocol "useContextPane()"
 *   - hooks/useContextToggle.ts （対応の attach/detach hook）
 */

import { useCallback, useEffect, useRef, useState } from "react"
import type {
  ContextAttachAdapter,
  ContextAttachRecord,
  ContextDisplayResolver,
  UseContextPaneResult,
} from "../types/context-attach"
import type {
  ContextPaneState,
  PoolDisplay,
  StageKind,
} from "../types/pool"
import { STAGE_ORDER } from "../StageView"

export interface UseContextPaneOptions {
  /** pool-impl 接続用 adapter（shell 側から DI） */
  adapter: ContextAttachAdapter
  /** 現在編集中の Work ID。null/undefined なら hook は noop（state=null） */
  workId: string | null | undefined
  /** Variant ID — 省略時は pool-impl 側で primary variant に fallback */
  variantId?: string
  /** Pool / Asset の表示メタ resolver（shell 側 store から join） */
  resolver?: ContextDisplayResolver
}

/**
 * RPC 結果から ContextPaneState を組み立てる。
 *
 * - target_kind='pool' → attached_pools
 * - target_kind='stage' → attached_stages（StageKind 制限・workId で wrap）
 * - target_kind='asset' → attached_assets
 */
function recordsToPaneState(
  records: ContextAttachRecord[],
  workId: string,
  resolver: ContextDisplayResolver | undefined,
): ContextPaneState {
  const pools: PoolDisplay[] = []
  const stages: ContextPaneState["attached_stages"] = []
  const assets: ContextPaneState["attached_assets"] = []

  for (const rec of records) {
    if (!rec.attached) continue // 履歴に残るが表示は省く（AC-9 即時反映 semantics）
    if (rec.target_kind === "pool") {
      const resolved = resolver?.resolvePool?.(rec.target_id) ?? null
      if (resolved) {
        pools.push({ ...resolved, is_active: true })
      } else {
        // resolver 未提供 / 未知 Pool: id ベースの fallback PoolDisplay
        pools.push({
          id: rec.target_id,
          kind: "cross-work",
          name: rec.target_id,
          is_system: false,
          is_pinned: false,
          is_archived: false,
          is_active: true,
          last_activity: rec.updated_at,
        })
      }
    } else if (rec.target_kind === "stage") {
      const stageKind = rec.target_id as StageKind
      if (!STAGE_ORDER.includes(stageKind)) continue // 防御的 skip
      stages.push({
        workId,
        stage: { kind: stageKind, is_active: true, asset_refs: [] },
      })
    } else if (rec.target_kind === "asset") {
      const resolved = resolver?.resolveAsset?.(rec.target_id) ?? null
      assets.push({
        assetId: rec.target_id,
        reason: resolved?.reason ?? "manual",
      })
    }
  }

  return {
    attached_pools: pools,
    attached_stages: stages,
    attached_assets: assets,
  }
}

/**
 * 現在のコンテキスト state を返す hook。
 *
 * @example
 *   const { state, loading, refresh } = useContextPane({
 *     adapter,
 *     workId,
 *     variantId,
 *     resolver: { resolvePool: (id) => pools.find(p => p.id === id) ?? null },
 *   })
 */
export function useContextPane({
  adapter,
  workId,
  variantId,
  resolver,
}: UseContextPaneOptions): UseContextPaneResult {
  const [state, setState] = useState<ContextPaneState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const reqIdRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!workId) {
      setState(null)
      return
    }
    const reqId = ++reqIdRef.current
    setLoading(true)
    setError(null)
    try {
      const records = await adapter.get(workId, variantId)
      // 競合する request の結果は捨てる（最新 only 保持）
      if (reqId !== reqIdRef.current) return
      setState(recordsToPaneState(records, workId, resolver))
    } catch (e) {
      if (reqId !== reqIdRef.current) return
      setError(e instanceof Error ? e : new Error(String(e)))
      // state は前回値を温存（user に空表示でちらつかせない）
    } finally {
      if (reqId === reqIdRef.current) setLoading(false)
    }
  }, [adapter, workId, variantId, resolver])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { state, loading, error, refresh }
}

/**
 * 内部関数 — テスト / 他 hook から再利用するため export。
 * spec §6 で示した RPC 結果 → ContextPaneState 変換ロジック。
 */
export const __internalRecordsToPaneState = recordsToPaneState
