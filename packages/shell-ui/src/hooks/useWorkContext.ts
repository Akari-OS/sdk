/**
 * @file hooks/useWorkContext.ts
 * AKARI-HUB-086: Work レベルコンテキストを購読するための共通 hook。
 *
 * 役割:
 *   - `getWorkContext(library, workId, variantId)` を呼び、
 *     { context, loading, error, reload } を返す。
 *   - workId / variantId の一方でも未指定なら context=null を返す（no-op）。
 *   - workId / variantId / library が変わると自動 refetch。
 *   - reload() を呼ぶと手動 refetch。
 *   - stale request は破棄（reqIdRef で競合を排除）。
 *
 * freeze-safe:
 *   - getItem を呼ばず getWorkContext を使うため、Pool freeze 中でも
 *     Work コンテキスト層への read アクセスは安全。
 *
 * 使い方:
 *   ```tsx
 *   const { context, loading, error, reload } = useWorkContext({
 *     library: "my-pool",     // null で current pool に fallback
 *     workId: activeWork?.id,
 *     variantId: activeVariantId,
 *   })
 *   ```
 *
 * 関連:
 *   - pool.ts: getWorkContext
 *   - sdk-types/src/work-context.ts: WorkContextPayload
 *   - spec: docs/sdd/specs/spec-slot-and-work-context-schema.md (AKARI-HUB-086)
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { getWorkContext } from "@akari-os/sdk/pool"
import type { WorkContextPayload } from "@akari-os/sdk/work-context"

export interface UseWorkContextOptions {
  /**
   * Pool 名（null で current pool に fallback）。
   * `getWorkContext(library, ...)` に透過的に渡す。
   */
  library: string | null
  /**
   * 対象 Work ID。null/undefined のとき hook は no-op（context=null）。
   */
  workId: string | null | undefined
  /**
   * Variant ID。null/undefined のとき hook は no-op（context=null）。
   */
  variantId: string | null | undefined
}

export interface UseWorkContextResult {
  /** 取得済みの Work コンテキスト。未取得・未指定・エラー時は null */
  context: WorkContextPayload | null
  /** fetch 中は true */
  loading: boolean
  /** エラー発生時に格納 */
  error: Error | null
  /** 手動 refetch */
  reload: () => void
}

/**
 * Work レベルコンテキストを購読する hook。
 *
 * writer / design / video など各アプリが slot_definitions / slot_entries /
 * purpose / strategy / tone / references を購読するための共通 surface。
 */
export function useWorkContext({
  library,
  workId,
  variantId,
}: UseWorkContextOptions): UseWorkContextResult {
  const [context, setContext] = useState<WorkContextPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const reqIdRef = useRef(0)
  // 手動 reload のトリガー用カウンタ
  const [reloadKey, setReloadKey] = useState(0)

  const reload = useCallback(() => {
    setReloadKey((k) => k + 1)
  }, [])

  useEffect(() => {
    // workId / variantId が未指定なら no-op
    if (!workId || !variantId) {
      setContext(null)
      setLoading(false)
      setError(null)
      return
    }

    const reqId = ++reqIdRef.current
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const payload = await getWorkContext(library, workId, variantId)
        // 古い request の結果は捨てる（最新 only 保持）
        if (reqId !== reqIdRef.current) return
        setContext(payload)
      } catch (e) {
        if (reqId !== reqIdRef.current) return
        setError(e instanceof Error ? e : new Error(String(e)))
        // context は前回値を温存（ちらつき防止）
      } finally {
        if (reqId === reqIdRef.current) setLoading(false)
      }
    })()
  }, [library, workId, variantId, reloadKey])

  return { context, loading, error, reload }
}
