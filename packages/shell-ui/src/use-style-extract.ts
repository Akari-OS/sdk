/**
 * @file use-style-extract.ts
 * AKARI-HUB-073 Phase 1 (T-5): Style 抽出 trigger hook。
 *
 * 役割:
 *   - StyleEditor (TM-B) / StylePanel (TM-A) から呼ばれる手動 trigger
 *     ("Style を抽出する" ボタンの onClick handler 相当)
 *   - akari-agents `extractor.ts` を adapter pattern (DI) 経由で呼ぶ
 *   - pending / error / lastResult を state として保持し、UI が連打防止 +
 *     toast / inline Checkpoint 表示に使えるようにする
 *
 * 設計指針:
 *   - hook 自身は server state を持たず、抽出結果は state cache のみ
 *     (永続化は親コンポーネント or pool-impl 側の責務)
 *   - adapter.extract() の throw を error state に reflect、auto reset せず
 *     次回 `extract()` 呼び出しまで保持 (UX 一画面化原則 — トースト不要に)
 *   - 連打防止: pending=true 中の `extract()` は queue せず最後の呼び出しを
 *     優先するため await の上書きを許容 (caller 側で disabled state を組む)
 *
 * 関連:
 *   - spec: AKARI-HUB-073 §6 API extract_rules / §7 T-5
 *   - HUB-071 useContextToggle と同じ DI / pending / onChange 哲学
 */

import { useCallback, useState } from "react"
import type {
  ExtractRulesRequest,
  ExtractRulesResponse,
  StyleExtractAdapter,
  UseStyleExtractResult,
} from "./types/style-extract"

export interface UseStyleExtractOptions {
  /** akari-agents extractor 接続用 adapter（shell 側から DI） */
  adapter: StyleExtractAdapter
  /**
   * 成功後 callback。typically StyleEditor 側で「inline Checkpoint」表示
   * (extracted_rules のレビュー UI) を開く。
   */
  onResult?: (result: ExtractRulesResponse, request: ExtractRulesRequest) => void
  /**
   * 失敗時 callback。error は throw もされるので caller は片方を選んで使う。
   */
  onError?: (err: Error, request: ExtractRulesRequest) => void
}

/**
 * Style 抽出を起動する hook。
 *
 * @example
 *   const adapter = useMemo(() => createLocalStorageStyleExtractAdapter(), [])
 *   const { extract, pending, lastResult, error } = useStyleExtract({ adapter })
 *
 *   <button disabled={pending} onClick={() => extract({
 *     style_id: 'style-1',
 *     references: pickedAssets,
 *     domain: 'writing',
 *     kind: 'manual',
 *   })}>
 *     {pending ? '抽出中...' : 'Style を抽出する'}
 *   </button>
 */
export function useStyleExtract({
  adapter,
  onResult,
  onError,
}: UseStyleExtractOptions): UseStyleExtractResult {
  const [pending, setPending] = useState(false)
  const [lastResult, setLastResult] = useState<ExtractRulesResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const extract = useCallback<UseStyleExtractResult["extract"]>(
    async (request) => {
      setPending(true)
      setError(null)
      try {
        const result = await adapter.extract(request)
        setLastResult(result)
        onResult?.(result, request)
        return result
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e))
        setError(err)
        onError?.(err, request)
        throw err
      } finally {
        setPending(false)
      }
    },
    [adapter, onResult, onError],
  )

  const reset = useCallback(() => {
    setLastResult(null)
    setError(null)
  }, [])

  return { extract, lastResult, pending, error, reset }
}
