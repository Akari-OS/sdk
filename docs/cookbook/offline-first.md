# Cookbook — オフラインファーストパターン

> **対象**: AKARI Module SDK（HUB-024）でオフライン対応 Module を実装する開発者
> **前提**: Pool / AMP の基礎知識（Memory API）
> **関連 spec**: AKARI-HUB-024 §6.7 Guideline 6, AKARI-HUB-023 Pool Tiered Storage, AKARI-HUB-026 Notion §9

---

## オフラインファーストの設計原則

AKARI Module の Certification 必須要件（HUB-024 §6.8 Contract Test）に「AC-8: オフライン時でも Core + Module 単体で動作する」がある。

これは「ネットワーク接続なしで全機能が動く」という意味ではなく、次の条件を満たすことを指す：

1. **読み取り系操作は最新キャッシュで動作する**（「キャッシュ表示中」バッジは表示）
2. **書き込み系操作はキューに積まれ、オンライン復帰後に実行される**
3. **ユーザーにオフライン状態が明確に伝わる UI がある**
4. **同期競合が発生した場合に安全な解決手段がある**

これを実現するために Pool の tier 構造を活用する。

---

## Pool の tier 構造とオフライン設計

Pool は素材を 3 つの tier で管理する：

| Tier | 場所 | 役割 | アクセス速度 |
|---|---|---|---|
| **Hot** | ローカル SSD（全量） | 頻用素材・直近作業 | μs（即時） |
| **Warm** | ローカル HDD or NAS | 中期アーカイブ | ms |
| **Cold** | クラウド（S3 等） | 長期保管 | 秒〜分 |

オフライン時は **Hot tier のみ**アクセス可能。  
設計のポイントは「**オフライン中に必要な素材を Hot に置いておく**」こと。

---

## レシピ 1 — Pool キャッシュ戦略（Hot に頻用素材を置く）

### 戦略の考え方

```typescript
// Hot tier に置くべき素材
// - 現在作業中のドラフト
// - 最近 7 日間にアクセスした素材
// - ユーザーが「ピン留め」した素材
// - 外部サービスからのキャッシュ（Notion ページ, X アカウント情報等）

// Warm/Cold に移してよい素材
// - 1 ヶ月以上未アクセスの完成済みコンテンツ
// - バックアップ用の重複素材
// - 高解像度原本（編集時はサムネを Hot に置く）
```

### 外部サービスのレスポンスを Pool にキャッシュ

```typescript
// notion-mcp/src/cache/notion-cache.ts
import { pool, amp } from "@akari/sdk"

const CACHE_TTL_MS = 24 * 60 * 60 * 1000  // 24 時間

export async function cachedQueryDatabase(
  databaseId: string,
  filter?: Record<string, unknown>
): Promise<{ items: unknown[]; from_cache: boolean; cached_at?: string }> {
  const cacheKey = `notion:db:${databaseId}:${JSON.stringify(filter ?? {})}`

  // 1. Hot tier からキャッシュを探す
  const cached = await pool.search({
    query: cacheKey,
    tags: ["notion-cache"],
    tier: "hot",
    limit: 1,
  })

  if (cached.length > 0) {
    const item = cached[0]
    const age = Date.now() - new Date(item.created_at).getTime()

    if (age < CACHE_TTL_MS) {
      const data = JSON.parse(new TextDecoder().decode(item.bytes))
      return {
        items:       data.items,
        from_cache:  true,
        cached_at:   item.created_at,
      }
    }
  }

  // 2. キャッシュがない or 期限切れ → Notion API を呼ぶ
  const authHeader = await getNotionAuthHeader()

  const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: "POST",
    headers: {
      Authorization:    authHeader,
      "Content-Type":   "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify(filter ? { filter } : {}),
  })

  if (!res.ok) throw new Error(`Notion query failed: ${res.status}`)
  const data = await res.json()

  // 3. 結果を Hot tier にキャッシュ
  const bytes = new TextEncoder().encode(JSON.stringify({ items: data.results }))
  await pool.put({
    bytes,
    mime: "application/json",
    tags: ["notion-cache", `db:${databaseId}`],
    meta: { cache_key: cacheKey, database_id: databaseId },
    tier: "hot",
  })

  return { items: data.results, from_cache: false }
}
```

### 「キャッシュ表示中」バッジの Panel Schema

```json
{
  "$schema": "akari://panel-schema/v0",
  "title": "Notion Database",
  "layout": "list",
  "fields": [
    {
      "id":           "cache_notice",
      "type":         "badge",
      "label":        "キャッシュ表示中 — {{$cached_at|date}} 時点",
      "variant":      "warning",
      "visible_when": "$from_cache == true"
    },
    {
      "id":    "records",
      "type":  "table",
      "label": "",
      "bind":  "mcp.notion.query_database.items"
    }
  ],
  "actions": [
    {
      "id":           "refresh",
      "label":        "最新データを取得",
      "kind":         "ghost",
      "mcp":          { "tool": "notion.refresh_cache", "args": {} },
      "visible_when": "$from_cache == true",
      "enabled_when": "$is_online == true"
    }
  ]
}
```

### キャッシュの定期更新（バックグラウンドジョブ）

```typescript
// notion-mcp/src/jobs/cache-refresh.ts

// Module 起動時（または定期的）にキャッシュを更新するジョブ
export async function refreshNotionCaches(): Promise<void> {
  const recentDatabases = await getRecentlyAccessedDatabases()

  for (const dbId of recentDatabases) {
    try {
      await cachedQueryDatabase(dbId)  // キャッシュを更新
    } catch (err) {
      if (isNetworkError(err)) {
        // オフライン中はスキップ（次回オンライン時にトリガー）
        console.log(`[Cache] Skipping ${dbId} — offline`)
        break
      }
      console.error(`[Cache] Failed to refresh ${dbId}:`, err)
    }
  }
}

async function getRecentlyAccessedDatabases(): Promise<string[]> {
  const records = await amp.query({
    goal_ref: "com.akari.notion",
    filter: { kind: "export-action" },
    order: "desc",
    limit: 10,
  })

  // 直近アクセスした database ID を重複排除して返す
  const ids = records
    .map(r => r.metadata?.database_id as string)
    .filter(Boolean)

  return [...new Set(ids)]
}
```

---

## レシピ 2 — 書き込みキュー（オフライン時に積んで、オンライン時に flush）

### キューの設計

```typescript
// shared/write-queue.ts

export interface QueuedWrite {
  id:          string
  module_id:   string
  tool:        string
  args:        Record<string, unknown>
  goal_ref:    string
  queued_at:   string
  retry_count: number
  status:      "pending" | "flushing" | "failed"
}

const QUEUE_TAG = "pending-write"

// キューに書き込みを積む
export async function enqueueWrite(write: Omit<QueuedWrite, "id" | "queued_at" | "retry_count" | "status">): Promise<string> {
  const queued: QueuedWrite = {
    ...write,
    id:          crypto.randomUUID(),
    queued_at:   new Date().toISOString(),
    retry_count: 0,
    status:      "pending",
  }

  const bytes = new TextEncoder().encode(JSON.stringify(queued))
  const poolId = await pool.put({
    bytes,
    mime: "application/json",
    tags: [QUEUE_TAG, write.module_id, write.tool],
    meta: { queue_id: queued.id, goal_ref: write.goal_ref },
    tier: "hot",
  })

  await amp.record({
    kind:     "write-queued",
    content:  `オフライン中のため ${write.tool} をキューに積みました`,
    goal_ref: write.goal_ref,
    metadata: { queue_id: queued.id, pool_id: poolId, tool: write.tool },
  })

  return queued.id
}

// キューを flush する（オンライン復帰時に呼ぶ）
export async function flushWriteQueue(moduleId: string): Promise<{
  flushed: number
  failed:  number
}> {
  const pending = await pool.search({
    tags: [QUEUE_TAG, moduleId],
    tier: "hot",
  })

  let flushed = 0
  let failed  = 0

  for (const item of pending) {
    const write = JSON.parse(new TextDecoder().decode(item.bytes)) as QueuedWrite

    if (write.status !== "pending") continue

    try {
      // HITL 再確認（重要操作のみ）
      if (requiresHitlOnFlush(write.tool)) {
        const confirmed = await requestHitlConfirmation(write)
        if (!confirmed) {
          await markQueuedWriteStatus(item.id, "failed", "user_cancelled")
          failed++
          continue
        }
      }

      // MCP ツールを実行
      await executeMcpTool(write.tool, write.args)

      // 成功 → Pool からキューアイテムを削除
      await pool.delete(item.id)

      await amp.record({
        kind:     "write-flushed",
        content:  `キューの ${write.tool} を実行しました`,
        goal_ref: write.goal_ref,
        metadata: { queue_id: write.id, tool: write.tool },
      })

      flushed++
    } catch (err) {
      write.retry_count++
      write.status = write.retry_count >= 3 ? "failed" : "pending"

      // Pool のアイテムを更新（status を書き換え）
      const bytes = new TextEncoder().encode(JSON.stringify(write))
      await pool.update(item.id, { bytes })

      if (write.status === "failed") {
        await shell.notify({
          title: "書き込みに失敗しました",
          body:  `${write.tool} の実行に 3 回失敗しました。手動で再実行してください。`,
          action: { type: "open-queue-manager", moduleId },
        })
      }

      failed++
    }
  }

  return { flushed, failed }
}

function requiresHitlOnFlush(tool: string): boolean {
  // 外部公開操作（SNS 投稿 / ドキュメント上書き等）は flush 時にも確認
  const hitlRequired = ["x.post", "notion.create_page", "notion.append_block_children"]
  return hitlRequired.includes(tool)
}
```

### X Sender でのオフライン書き込みキュー使用例

```typescript
// x-mcp/src/tools/post.ts

export const xPostTool = {
  name: "x.post",
  handler: async (input: { text: string; media?: string[]; goal_ref?: string }) => {
    // ネットワーク疎通確認
    const isOnline = await checkNetworkAvailability("api.twitter.com")

    if (!isOnline) {
      // オフライン → キューに積んで下書き保存を提案
      const queueId = await enqueueWrite({
        module_id: "com.akari.x-sender",
        tool:      "x.post",
        args:      { text: input.text, media: input.media },
        goal_ref:  input.goal_ref ?? "com.akari.x-sender",
      })

      // Pool に下書きとしても保存（UI 復元用）
      await pool.put({
        bytes: new TextEncoder().encode(input.text),
        mime:  "text/plain",
        tags:  ["draft", "x-sender"],
        meta:  { queue_id: queueId },
        tier:  "hot",
      })

      // Shell にトーストを表示
      await shell.toast({
        message: "オフライン中です。オンライン復帰後に自動投稿します。",
        kind:    "warning",
        action:  { label: "キューを見る", type: "open-queue-manager" },
      })

      return {
        success:  true,
        queued:   true,
        queue_id: queueId,
        message:  "オフライン中のためキューに積みました",
      }
    }

    // オンライン → 通常の投稿処理
    return await executeXPost(input)
  },
}
```

### オンライン復帰時の自動 flush トリガー

```typescript
// shared/network-monitor.ts
import { shell } from "@akari/sdk"

export function startNetworkMonitor(moduleId: string): () => void {
  let wasOffline = false

  const handleOnline = async () => {
    if (!wasOffline) return

    wasOffline = false
    const pending = await getPendingQueueCount(moduleId)

    if (pending > 0) {
      await shell.toast({
        message: `オンラインに復帰しました。${pending} 件の保留中の書き込みを処理します。`,
        kind:    "info",
        duration: 5000,
      })

      // 少し待ってから flush（接続の安定を待つ）
      setTimeout(() => flushWriteQueue(moduleId), 2000)
    }
  }

  const handleOffline = () => {
    wasOffline = true
    shell.toast({
      message:  "オフラインになりました。書き込みは復帰後に実行されます。",
      kind:     "warning",
      duration: 3000,
    })
  }

  // Shell のネットワーク状態変化イベントを購読
  const unsubscribeOnline  = shell.onNetworkChange("online",  handleOnline)
  const unsubscribeOffline = shell.onNetworkChange("offline", handleOffline)

  return () => {
    unsubscribeOnline()
    unsubscribeOffline()
  }
}
```

---

## レシピ 3 — 同期競合解決

オフライン中に Notion 側でも同一ページが更新された場合、3 種類の競合解決戦略を使い分ける。

### 戦略の選択基準

| 操作の種類 | 競合リスク | 推奨戦略 |
|---|---|---|
| プロパティ更新（タイトル等） | 低（UI の単一値） | Last-Write-Wins |
| ブロック追記 | 中（位置依存） | 3-way merge |
| 削除操作 | 高（不可逆） | Manual Resolve 必須 |
| 一括追加（database エントリ） | 低〜中（行は独立） | Last-Write-Wins + 重複チェック |

### Last-Write-Wins（プロパティ更新）

```typescript
// shared/conflict/last-write-wins.ts

export async function resolveWithLastWriteWins(params: {
  tool:      string
  args:      Record<string, unknown>
  queued_at: string
  goal_ref:  string
}): Promise<{ resolved: boolean; strategy: string }> {
  // 最後に書いたほうを正とし、競合を自動解決
  // AMP に競合解決の記録を残す

  await amp.record({
    kind:     "conflict-resolved",
    content:  `${params.tool} の競合を Last-Write-Wins で解決しました`,
    goal_ref: params.goal_ref,
    metadata: {
      strategy:  "last-write-wins",
      tool:      params.tool,
      queued_at: params.queued_at,
      resolved_at: new Date().toISOString(),
    },
  })

  return { resolved: true, strategy: "last-write-wins" }
}
```

### 3-way Merge（ブロック追記）

3-way merge は「共通の祖先」「ローカル変更」「リモート変更」の 3 つを比較してマージする。
ブロック追記の場合は「追加順序」「ブロック ID の競合」がマージポイントになる。

```typescript
// shared/conflict/three-way-merge.ts

interface BlockList { blocks: NotionBlock[] }

export async function threeWayMerge(params: {
  ancestor:     BlockList
  local_change: BlockList  // オフライン中に追加しようとしたブロック
  remote:       BlockList  // 現在の Notion の状態
  page_id:      string
  goal_ref:     string
}): Promise<{ merged: BlockList; has_conflict: boolean; conflict_details?: string }> {
  const { ancestor, local_change, remote } = params

  // ブロック ID ベースで差分を計算
  const ancestorIds = new Set(ancestor.blocks.map(b => b.id))
  const remoteIds   = new Set(remote.blocks.map(b => b.id))

  // リモートで追加されたブロック（ancestor にはない）
  const remoteAdded = remote.blocks.filter(b => !ancestorIds.has(b.id))

  // ローカルで追加しようとしているブロック（すべて新規 = IDなし）
  const localAdded = local_change.blocks

  // 衝突チェック: リモートで削除されたブロックをローカルが変更しようとしている場合
  const remoteDeleted = ancestor.blocks.filter(b => !remoteIds.has(b.id))
  const hasConflict   = remoteDeleted.length > 0

  if (hasConflict) {
    return {
      merged:           remote,  // 安全のためリモートをベースとする
      has_conflict:     true,
      conflict_details: `${remoteDeleted.length} 件のブロックがリモートで削除されています。`,
    }
  }

  // 競合なし: リモートの状態にローカルの追加ブロックを末尾に追加
  const merged: BlockList = {
    blocks: [
      ...remote.blocks,
      ...localAdded,
    ],
  }

  return { merged, has_conflict: false }
}
```

### Manual Resolve（削除操作）

削除のような不可逆操作はシステムが自動解決せず、必ずユーザーに判断を委ねる。

```typescript
// shared/conflict/manual-resolve.ts
import { shell } from "@akari/sdk"

export async function requestManualConflictResolution(params: {
  description: string
  options: Array<{ id: string; label: string; description: string }>
  goal_ref: string
}): Promise<string> {
  // Shell の競合解決ダイアログを表示（HITL の拡張）
  const choice = await shell.showConflictDialog({
    title:       "同期競合が発生しました",
    description: params.description,
    options:     params.options,
  })

  await amp.record({
    kind:     "conflict-resolved",
    content:  `同期競合をユーザーが手動解決しました: ${choice}`,
    goal_ref: params.goal_ref,
    metadata: { strategy: "manual", choice },
  })

  return choice
}

// 使用例（Notion 削除操作での競合）
export async function resolveDeleteConflict(params: {
  block_id:     string
  queued_at:    string
  remote_state: "modified" | "already_deleted"
  goal_ref:     string
}): Promise<"proceed" | "cancel"> {
  if (params.remote_state === "already_deleted") {
    // すでにリモートで削除済みならキャンセルで問題なし（自動解決）
    return "cancel"
  }

  const choice = await requestManualConflictResolution({
    description: "オフライン中にリモートで変更されたブロックを削除しようとしています。",
    options: [
      { id: "proceed", label: "それでも削除する", description: "リモートの変更を上書きして削除します" },
      { id: "cancel",  label: "キャンセルする",   description: "削除を取り消し、現在の状態を維持します" },
    ],
    goal_ref: params.goal_ref,
  })

  return choice as "proceed" | "cancel"
}
```

---

## レシピ 4 — Cold 素材の rehydration UX

Cold tier に移動した素材を必要なときに Hot に戻す（rehydration）フローを実装する。

### rehydration の起点

```typescript
// shared/pool/rehydration.ts
import { pool, shell } from "@akari/sdk"

export async function getItemWithRehydration(
  poolId: string
): Promise<{ bytes: Uint8Array; mime: string; tier: "hot" | "warm" | "cold" }> {
  const item = await pool.get(poolId)

  if (!item) throw new Error(`Pool item not found: ${poolId}`)

  // Hot tier なら即返す
  if (item.tier === "hot") {
    return { bytes: item.bytes, mime: item.mime, tier: "hot" }
  }

  // Warm tier: 自動で Hot に昇格してから返す（数 ms 〜 数百 ms）
  if (item.tier === "warm") {
    await pool.promoteToHot(poolId)
    return { bytes: item.bytes, mime: item.mime, tier: "warm" }
  }

  // Cold tier: ユーザーに rehydration を通知してから取得（数秒〜数十秒）
  return await rehydrateFromCold(poolId, item)
}

async function rehydrateFromCold(
  poolId: string,
  item: { mime: string; meta?: Record<string, unknown> }
): Promise<{ bytes: Uint8Array; mime: string; tier: "cold" }> {
  // rehydration 開始をユーザーに通知
  const toastId = await shell.toast({
    message:      "クラウドから素材を取得しています…",
    kind:         "info",
    persistent:   true,   // 完了するまで消えない
    progress:     true,
  })

  try {
    // Cold → Hot へのコピーをリクエスト（非同期 / streaming）
    const bytes = await pool.rehydrate(poolId, {
      onProgress: async (percent) => {
        await shell.updateToast(toastId, {
          message:  `素材を取得中… ${percent}%`,
          progress: percent / 100,
        })
      },
    })

    await shell.dismissToast(toastId)
    await shell.toast({
      message:  "素材の取得が完了しました",
      kind:     "success",
      duration: 2000,
    })

    return { bytes, mime: item.mime, tier: "cold" }
  } catch (err) {
    await shell.dismissToast(toastId)
    await shell.toast({
      message: `素材の取得に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      kind:    "error",
    })
    throw err
  }
}
```

### サムネイルを Hot に置いて Cold 素材のプレビューを高速化

```typescript
// shared/pool/thumbnail-strategy.ts

export async function putWithThumbnail(params: {
  bytes:     Uint8Array
  mime:      string
  thumbnail: Uint8Array   // 事前に生成したサムネイル（100px 程度）
  tags:      string[]
  goal_ref:  string
}): Promise<{ original_id: string; thumbnail_id: string }> {
  // 原本は Warm/Cold tier に保存（サイズが大きい素材）
  const originalId = await pool.put({
    bytes:    params.bytes,
    mime:     params.mime,
    tags:     [...params.tags, "original"],
    tier:     "warm",           // 最初は Warm、長期未使用で Cold に移行
  })

  // サムネイルは Hot tier に常駐（UI 表示用）
  const thumbnailId = await pool.put({
    bytes:    params.thumbnail,
    mime:     "image/webp",
    tags:     [...params.tags, "thumbnail"],
    meta:     { original_id: originalId },
    tier:     "hot",
  })

  await amp.record({
    kind:     "asset-stored",
    content:  `素材を保存しました（サムネイル付き）`,
    goal_ref: params.goal_ref,
    metadata: { original_id: originalId, thumbnail_id: thumbnailId },
  })

  return { original_id: originalId, thumbnail_id: thumbnailId }
}
```

### Cold 素材を含む Panel Schema（pool-picker での表示）

```json
{
  "id":    "media",
  "type":  "pool-picker",
  "label": "添付素材",
  "accept": ["image", "video"],
  "max":   4,
  "bind":  "mcp.x.post.media",
  "display": {
    "thumbnail_field": "thumbnail_id",
    "cold_indicator":  true,
    "cold_label":      "クラウド保管（選択で取得）"
  }
}
```

---

## レシピ 5 — ネットワーク状態検知と UI フォールバック

### ネットワーク状態の検知

```typescript
// shared/network/availability.ts
import { shell } from "@akari/sdk"

interface NetworkStatus {
  is_online:     boolean
  latency_ms?:   number
  last_checked:  string
}

// 特定のエンドポイントへの疎通確認
export async function checkNetworkAvailability(
  endpoint: string,
  timeoutMs = 3000
): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    const res = await fetch(`https://${endpoint}/robots.txt`, {
      method:  "HEAD",
      signal:  controller.signal,
    })

    clearTimeout(timer)
    return res.ok || res.status < 500
  } catch {
    return false
  }
}

// 複数プローブで総合判断（一つが落ちていても他で判断）
export async function getNetworkStatus(): Promise<NetworkStatus> {
  const probes = [
    checkNetworkAvailability("api.twitter.com"),
    checkNetworkAvailability("api.notion.com"),
    checkNetworkAvailability("1.1.1.1"),    // Cloudflare DNS（高速）
  ]

  const start   = Date.now()
  const results = await Promise.allSettled(probes)
  const latency = Date.now() - start

  const online = results.some(
    r => r.status === "fulfilled" && r.value === true
  )

  return {
    is_online:    online,
    latency_ms:   latency,
    last_checked: new Date().toISOString(),
  }
}
```

### フォールバック付きのデータ取得ユーティリティ

```typescript
// shared/network/fetch-with-fallback.ts

interface FetchWithFallbackOptions<T> {
  // ネットワーク経由でデータを取得する関数
  fetcher: () => Promise<T>
  // キャッシュからデータを取得する関数
  fallback: () => Promise<T | null>
  // キャッシュが有効かどうかを判断する関数（省略時は常に有効）
  isCacheValid?: (cached: T) => boolean
  // フォールバック使用時のユーザー通知メッセージ
  offlineMessage?: string
}

export async function fetchWithFallback<T>(
  opts: FetchWithFallbackOptions<T>
): Promise<{ data: T; from_cache: boolean }> {
  // まずネットワーク取得を試みる
  try {
    const data = await opts.fetcher()
    return { data, from_cache: false }
  } catch (err) {
    if (!isNetworkError(err)) throw err  // ネットワーク以外のエラーは再 throw
  }

  // ネットワークエラー → キャッシュにフォールバック
  const cached = await opts.fallback()

  if (cached === null) {
    throw new Error("オフライン中です。この機能にはネットワーク接続が必要です。")
  }

  if (opts.isCacheValid && !opts.isCacheValid(cached)) {
    // キャッシュが無効（期限切れ等）でも、オフライン中は使う（ただし警告）
    await shell.toast({
      message:  opts.offlineMessage ?? "オフライン中です。古いキャッシュを表示しています。",
      kind:     "warning",
      duration: 4000,
    })
  }

  return { data: cached, from_cache: true }
}

// 使用例: Notion database のクエリ
const { data: records, from_cache } = await fetchWithFallback({
  fetcher: () => queryNotionDatabase(databaseId),
  fallback: async () => {
    const cached = await pool.search({ tags: [`notion-cache`, `db:${databaseId}`], tier: "hot" })
    if (cached.length === 0) return null
    return JSON.parse(new TextDecoder().decode(cached[0].bytes))
  },
  offlineMessage: "オフライン中です。最新の Notion データを表示できません。",
})
```

### ネットワーク状態に応じた Panel の動的変更

```json
{
  "$schema": "akari://panel-schema/v0",
  "title": "Notion Database",
  "layout": "list",
  "fields": [
    {
      "id":           "offline_banner",
      "type":         "markdown",
      "label":        "",
      "value":        "**オフライン中** — キャッシュ ({{$cached_at|date}}) を表示しています",
      "variant":      "warning",
      "visible_when": "$is_online == false"
    },
    {
      "id":    "records",
      "type":  "table",
      "label": "",
      "bind":  "mcp.notion.query_database.items"
    }
  ],
  "actions": [
    {
      "id":           "create",
      "label":        "新規作成",
      "kind":         "primary",
      "mcp":          { "tool": "notion.create_page", "args": { "database_id": "$database_id" } },
      "hitl":         { "require": true, "preview": "text-summary" },
      "enabled_when": "$is_online == true",
      "visible_when": "$is_online == true"
    },
    {
      "id":           "create_offline",
      "label":        "オフライン下書き（復帰後に送信）",
      "kind":         "ghost",
      "mcp":          { "tool": "notion.queue_create_page", "args": { "database_id": "$database_id" } },
      "visible_when": "$is_online == false"
    }
  ]
}
```

---

## オフライン対応チェックリスト

`akari module certify` の Contract Test で検証されるオフライン要件：

- `external-network` permission に必要なドメインのみを宣言している
- 読み取り系 MCP ツールはキャッシュがあればオフラインでも動作する
- 書き込み系 MCP ツールはオフライン時にキューへの積み込みを提案する
- ユーザーにオフライン状態を明示する UI（バッジ・バナー・トースト）がある
- キャッシュには有効期限（TTL）を設定している
- キューの flush 時に重要操作は HITL 再確認を行う
- 同期競合が発生した場合の解決フロー（LWW / 3-way merge / manual）が実装されている
- Cold 素材の rehydration 中にプログレス表示がある
- AMP に全てのオフライン関連イベント（queued / flushed / conflict-resolved 等）を `goal_ref` 付きで記録している

---

## 関連ドキュメント

- [OAuth パターン](./oauth-patterns.md) — 認証トークンのオフライン時の扱い
- [HITL パターン](./hitl-patterns.md) — flush 時の HITL 再確認フロー
- Tiered Storage (internal spec) — Pool tier 管理の詳細仕様
- AKARI-HUB-026 Notion Reference §9 — オフライン挙動の具体実装
- AKARI-HUB-024 §6.7 Guideline 6 — 「オフライン対応必須」のガイドライン根拠
