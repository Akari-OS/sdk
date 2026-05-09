/**
 * @file use-variant.ts
 * AKARI-HUB-071 Phase 1 (T-17): Variant 並列創作ブランチ用 hooks。
 *
 * 提供する hook:
 *   - useVariantList(workId, deps): Work に紐づく VariantList を返す。
 *   - useActiveVariant(workId, deps): 現在 app instance で開いている Variant ID
 *     を返す + 切替 setter。
 *   - useVariantAction(workId, deps): VariantAction（promote / archive / fork /
 *     compare）を pool-impl RPC へ dispatch する。
 *
 * 設計指針:
 *   - 本パッケージ（@akari-os/shell-ui）は shell / 子アプリ両方で読まれるため、
 *     Tauri invoke のような環境依存は import しない。代わりに `VariantBackend`
 *     interface を引数 deps として受け取り、shell 側で Tauri に bind し、子アプリ
 *     側で stub or shell からの IPC に bind する。
 *   - 本 hook は subscription / cache 層を持たない最小実装（fetch on mount + 手動
 *     refresh）。Suspense / TanStack Query ベースに置き換える余地は残す。
 *   - HUB-074 で実装済の RPC（list_variants / create_variant / promote_variant /
 *     archive_variant / update_variant_deps）を呼ぶ薄い wrapper として配置する。
 *
 * 関連 spec / ADR:
 *   - spec-pool-ui-redesign-stage-context-pane (AKARI-HUB-071) §6 / AC-14〜17
 *   - HUB-074 §6 / §7（pool-impl variants table + Variant RPC）
 *   - ADR-078 v0.2.0 §6-1〜6-7
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type {
  CompareViewState,
  VariantAction,
  VariantList,
} from "./types/variant"

/**
 * pool-impl RPC を抽象化した backend。shell 側は Tauri invoke で実装し、
 * 子アプリ側は shell から渡された IPC client で実装する。
 *
 * すべてのメソッドは VariantList / 該当 Variant 状態の最新 snapshot を返す
 * ことが期待される（promote / archive / fork 後に再 fetch する手間を省く）。
 */
export interface VariantBackend {
  /** HUB-074 RPC: variants_list(work_id) */
  listVariants(workId: string): Promise<VariantList>
  /**
   * HUB-074 RPC: variant_create(work_id, opts)
   * fork_from は 'current' / 'empty' / 既存 variant_id を渡す。
   * 'current' 時の解釈は shell 側で active_variant_id に解決する。
   */
  createVariant(
    workId: string,
    opts: { fork_from?: string | "empty" },
  ): Promise<VariantList>
  /** HUB-074 RPC: variant_promote(work_id, variant_id) */
  promoteVariant(workId: string, variantId: string): Promise<VariantList>
  /** HUB-074 RPC: variant_archive(work_id, variant_id) */
  archiveVariant(workId: string, variantId: string): Promise<VariantList>
  /** HUB-074 RPC: variant_update_deps(work_id, variant_id, depends_on) */
  updateVariantDeps(
    workId: string,
    variantId: string,
    dependsOn: string[],
  ): Promise<VariantList>
}

/**
 * useVariantList
 *
 * Work に紐づく VariantList を fetch + refresh する。
 *
 * @param workId 対象 Work ID（undefined なら no-op 状態）
 * @param backend pool-impl RPC adapter
 */
export function useVariantList(
  workId: string | undefined,
  backend: VariantBackend | undefined,
): {
  list: VariantList | undefined
  loading: boolean
  error: Error | undefined
  refresh: () => Promise<void>
  setList: (next: VariantList) => void
} {
  const [list, setList] = useState<VariantList | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)

  const refresh = useCallback(async () => {
    if (!workId || !backend) return
    setLoading(true)
    setError(undefined)
    try {
      const next = await backend.listVariants(workId)
      setList(next)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      setLoading(false)
    }
  }, [workId, backend])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { list, loading, error, refresh, setList }
}

/**
 * useActiveVariant
 *
 * 現在開いている Variant ID を保持。
 * 初期値は VariantList の active_variant_id を使い、外側で切替えたい場合は
 * setActive で更新する。VariantList が refresh されると（新しい active_variant_id
 * が来た場合）追従する。
 */
export function useActiveVariant(list: VariantList | undefined): {
  activeVariantId: string | undefined
  setActive: (variantId: string) => void
} {
  const [override, setOverride] = useState<string | undefined>(undefined)

  // list の active_variant_id が変わったら override をリセット（list が SSOT）
  const lastListActiveRef = useRef<string | undefined>(list?.active_variant_id)
  useEffect(() => {
    if (lastListActiveRef.current !== list?.active_variant_id) {
      lastListActiveRef.current = list?.active_variant_id
      setOverride(undefined)
    }
  }, [list?.active_variant_id])

  const activeVariantId = override ?? list?.active_variant_id

  const setActive = useCallback((variantId: string) => {
    setOverride(variantId)
  }, [])

  return { activeVariantId, setActive }
}

/**
 * useVariantAction
 *
 * VariantAction を pool-impl RPC（HUB-074）へ dispatch する hook。
 * promote / archive / fork は backend を呼んで最新 VariantList を返す。
 * compare は外部 state（CompareViewState）を返すだけ（fetch しない）。
 *
 * @param workId 対象 Work ID
 * @param backend pool-impl RPC adapter
 * @param activeVariantId 現在 active な Variant ID（fork from 'current' の解決用）
 */
export function useVariantAction(
  workId: string | undefined,
  backend: VariantBackend | undefined,
  activeVariantId: string | undefined,
): {
  /** action を発火。promote / archive / fork は VariantList を返し、compare は CompareViewState を返す */
  dispatch: (action: VariantAction) => Promise<
    | { kind: "list"; list: VariantList }
    | { kind: "compare"; state: CompareViewState }
    | { kind: "noop" }
  >
  pending: boolean
  error: Error | undefined
} {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<Error | undefined>(undefined)

  const dispatch = useCallback(
    async (
      action: VariantAction,
    ): Promise<
      | { kind: "list"; list: VariantList }
      | { kind: "compare"; state: CompareViewState }
      | { kind: "noop" }
    > => {
      if (!workId || !backend) return { kind: "noop" }
      setPending(true)
      setError(undefined)
      try {
        switch (action.kind) {
          case "promote": {
            if (!activeVariantId) return { kind: "noop" }
            const list = await backend.promoteVariant(workId, activeVariantId)
            return { kind: "list", list }
          }
          case "archive": {
            if (!activeVariantId) return { kind: "noop" }
            const list = await backend.archiveVariant(workId, activeVariantId)
            return { kind: "list", list }
          }
          case "fork": {
            const fork_from =
              action.from === "current"
                ? activeVariantId
                : action.from === "empty"
                  ? "empty"
                  : action.from
            const list = await backend.createVariant(workId, {
              fork_from: fork_from ?? "empty",
            })
            return { kind: "list", list }
          }
          case "compare": {
            // pool-impl RPC は呼ばず、UI 側 state のみ生成する。
            return {
              kind: "compare",
              state: {
                work_id: workId,
                variant_ids: action.with.slice(0, 3),
                diff_mode: "side-by-side",
                highlight_overrides: true,
              },
            }
          }
          default: {
            // exhaustiveness check: VariantAction が将来拡張された場合 type error
            const _exhaustive: never = action
            void _exhaustive
            return { kind: "noop" }
          }
        }
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        setError(e)
        throw e
      } finally {
        setPending(false)
      }
    },
    [workId, backend, activeVariantId],
  )

  return useMemo(
    () => ({ dispatch, pending, error }),
    [dispatch, pending, error],
  )
}
