/**
 * @file hooks/useContextToggle.ts
 * AKARI-HUB-071 Phase 1 (T-7): Pool / Stage / Asset の attach/detach 切替 hook。
 *
 * 役割:
 *   - pool-impl `context_attach_set` を adapter 経由で呼ぶ
 *   - 即時反映（楽観更新は呼び出し側で実施 — useContextPane の refresh と組み合わせる）
 *   - 連打防止 / エラー伝播
 *
 * 設計指針:
 *   - hook 自身は server state を持たず、`adapter.set` 後に `onChange` callback で
 *     parent に通知（典型: parent が useContextPane().refresh() を呼ぶ）
 *   - これにより楽観更新 / pessimistic 更新どちらも parent が選べる
 *
 * 関連:
 *   - spec: AKARI-HUB-071 §6 API "useContextToggle(target)"
 */

import { useCallback, useState } from "react"
import type {
  ContextAttachAdapter,
  ContextToggleTarget,
  UseContextToggleResult,
} from "../types/context-attach"

export interface UseContextToggleOptions {
  /** pool-impl 接続用 adapter（shell 側から DI） */
  adapter: ContextAttachAdapter
  /** 現在編集中の Work ID */
  workId: string
  /** Variant ID — set 系は必須（HUB-074 AC-15c 以降の Variant 単位） */
  variantId: string
  /**
   * 成功後 callback。typically `useContextPane.refresh` を呼ぶ。
   * 失敗時は callback されない（エラーが throw され caller に伝わる）。
   */
  onChange?: (target: ContextToggleTarget, attached: boolean) => void
}

/**
 * 個別 target の attach/detach を切り替える hook。
 *
 * @example
 *   const { toggle, pending } = useContextToggle({ adapter, workId, variantId,
 *     onChange: () => refresh() })
 *   // ...
 *   <button disabled={pending} onClick={() => toggle({ kind: 'pool', id: 'p1' }, true)}>
 *     attach
 *   </button>
 */
export function useContextToggle({
  adapter,
  workId,
  variantId,
  onChange,
}: UseContextToggleOptions): UseContextToggleResult {
  const [pending, setPending] = useState(false)

  const toggle = useCallback<UseContextToggleResult["toggle"]>(
    async (target, attached) => {
      setPending(true)
      try {
        await adapter.set(workId, variantId, target, attached)
        onChange?.(target, attached)
      } finally {
        setPending(false)
      }
    },
    [adapter, workId, variantId, onChange],
  )

  return { toggle, pending }
}
