---
title: Cookbook — Error Handling（エラー処理）
updated: 2026-04-19
related: [HUB-024, HUB-005, ADR-010]
---

# Cookbook — Error Handling（エラー処理）

> **このレシピで学ぶこと**:
> - AKARI のエラー階層（NetworkError / PermissionError / ValidationError / AppError）
> - ユーザー向けエラー UX（toast / dialog / retry）
> - Silent retry（Core の retry / deadletter — ADR-010）
> - エラーを AMP に記録するパターン
> - デバッグヒント（development mode のロギング）

---

## エラーの階層

AKARI App SDK は 4 層のエラー型を定義する。
各層は「どこで発生したか」「誰が処理すべきか」を明確にする。

```
NetworkError          — 外部 API / MCP サーバーへのネットワーク失敗
  └── TimeoutError    — タイムアウト
  └── RateLimitError  — レート制限（retry-after 付き）
  └── AuthError       — 認証失敗・token 失効

PermissionError       — AKARI 内の権限ゲートによる拒否
  └── HitlCancelled   — ユーザーが HITL で「キャンセル」を選択
  └── ManifestDenied  — manifest に宣言されていない権限を要求

ValidationError       — 入力データの検証失敗
  └── SchemaError     — Panel Schema の binding 型不一致
  └── PayloadError    — handoff payload の形式エラー
  └── ToolInputError  — MCP tool の input schema 違反

AppError           — App 固有のビジネスロジックエラー
  └── NotFoundError   — Pool / AMP の ID が存在しない
  └── ConflictError   — 同時書き込み競合（Notion / Sheets 等）
  └── QuotaError      — 外部サービスの利用上限超過
```

### TypeScript の型定義

```typescript
// @akari/sdk/errors からインポートして使う
import {
  AkariError,
  NetworkError,
  TimeoutError,
  RateLimitError,
  AuthError,
  PermissionError,
  HitlCancelled,
  ManifestDenied,
  ValidationError,
  AppError,
  NotFoundError,
  ConflictError,
} from "@akari/sdk/errors"

// 基底クラス
class AkariError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean = false,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

// 各エラーの例
const netErr = new NetworkError("API タイムアウト", { endpoint: "api.notion.com" })
netErr.retryable  // → true

const rateErr = new RateLimitError("レート制限", { retry_after_ms: 60_000 })
rateErr.retryAfterMs  // → 60000

const permErr = new HitlCancelled("ユーザーがキャンセル")
permErr.retryable  // → false（ユーザー判断なので自動リトライしない）
```

---

## Part 1: ユーザー向けエラー UX

### toast（軽微なエラー）

操作が失敗したが、ユーザーへの影響が小さい場合。
自動で消え、フローを遮断しない。

**Panel Schema（MCP-Declarative）での toast 宣言**:

```json
{
  "actions": [
    {
      "id":     "post",
      "label":  "投稿",
      "mcp":    { "tool": "x.post", "args": { "text": "$state.text" } },
      "hitl":   true,
      "on_success": {
        "toast": "投稿しました",
        "toast_level": "success"
      },
      "on_error": {
        "toast": "投稿に失敗しました: {{error.message}}",
        "toast_level": "error",
        "show_retry": "{{error.retryable}}"
      }
    }
  ]
}
```

**Full Tier（React）での toast**:

```typescript
import { shell } from "@akari/sdk"

// 成功 toast
shell.toast({ message: "投稿しました", level: "success", duration: 3000 })

// エラー toast（retryable なら Retry ボタン付き）
shell.toast({
  message:  "投稿に失敗しました",
  level:    "error",
  duration: 5000,
  action: err.retryable
    ? { label: "再試行", onClick: () => retryPost() }
    : undefined,
})

// ネットワークエラーの判定と toast
async function safePost(text: string) {
  try {
    await mcpClient.call("x.post", { text })
    shell.toast({ message: "投稿しました", level: "success" })
  } catch (err) {
    if (err instanceof RateLimitError) {
      shell.toast({
        message:  `レート制限中。${Math.ceil(err.retryAfterMs / 60_000)} 分後に再試行してください`,
        level:    "warning",
        duration: 8000,
      })
    } else if (err instanceof AuthError) {
      shell.toast({
        message: "認証が切れました。再認証してください",
        level:   "error",
        action:  { label: "再認証", onClick: () => shell.openSettings("auth") },
      })
    } else {
      shell.toast({ message: `エラー: ${err.message}`, level: "error" })
    }
  }
}
```

### dialog（重大なエラー・確認が必要）

データ損失・不可逆操作・認証切れなど、ユーザーの意思確認が必要な場合。

```typescript
import { shell } from "@akari/sdk"

// 削除失敗の確認ダイアログ
async function deletePageWithConfirm(pageId: string) {
  try {
    await mcpClient.call("notion.delete_block", { block_id: pageId })
  } catch (err) {
    if (err instanceof ConflictError) {
      const confirmed = await shell.dialog({
        title:   "競合が発生しました",
        message: "このページは別の場所で変更されています。強制的に削除しますか？",
        buttons: [
          { id: "force",  label: "強制削除", variant: "destructive" },
          { id: "cancel", label: "キャンセル", variant: "secondary" },
        ],
      })
      if (confirmed === "force") {
        await mcpClient.call("notion.delete_block", { block_id: pageId, force: true })
      }
    }
  }
}

// 認証切れダイアログ
async function handleAuthError(err: AuthError) {
  const result = await shell.dialog({
    title:   "認証が切れています",
    message: `${err.service} の認証が無効になりました。再認証すると操作を続けられます。`,
    buttons: [
      { id: "reauth", label: "再認証する",  variant: "primary" },
      { id: "later",  label: "後で",        variant: "secondary" },
    ],
  })
  if (result === "reauth") {
    await permission.gate({ action: "oauth.reauthorize", reason: "token 失効", hitl: true })
  }
}
```

### retry UI（ユーザーが再試行できる）

操作が失敗したが、ユーザーが「もう一度試したい」ケース。

```typescript
// Panel にエラー状態と再試行ボタンを表示
interface PostState {
  status:       "idle" | "loading" | "success" | "error"
  errorMessage: string | null
  retryable:    boolean
}

function PostButton({ onSubmit }: { onSubmit: () => Promise<void> }) {
  const [state, setState] = useState<PostState>({
    status: "idle", errorMessage: null, retryable: false,
  })

  const handleClick = async () => {
    setState({ status: "loading", errorMessage: null, retryable: false })
    try {
      await onSubmit()
      setState({ status: "success", errorMessage: null, retryable: false })
    } catch (err) {
      setState({
        status:       "error",
        errorMessage: err instanceof AkariError ? err.message : "予期しないエラー",
        retryable:    err instanceof AkariError ? err.retryable : false,
      })
    }
  }

  return (
    <div>
      <button onClick={handleClick} disabled={state.status === "loading"}>
        {state.status === "loading" ? "送信中..." : "投稿"}
      </button>
      {state.status === "error" && (
        <div className="error-block">
          <p>{state.errorMessage}</p>
          {state.retryable && (
            <button onClick={handleClick}>再試行</button>
          )}
        </div>
      )}
    </div>
  )
}
```

---

## Part 2: Silent Retry（Core の retry / deadletter — ADR-010）

ユーザーに見せずに Core がバックグラウンドでリトライする仕組み。
MCP-Declarative App の action は `hitl: false` の場合、Core のジョブキューに入る。

### どのエラーが silent retry されるか

| エラー種別 | retryable | Core の挙動 |
|---|---|---|
| `NetworkError`（一般） | ✅ | Exponential backoff でリトライ（最大 3 回） |
| `TimeoutError` | ✅ | タイムアウトを延ばして 1 回リトライ |
| `RateLimitError` | ✅ | `retry_after_ms` 後にリトライ |
| `AuthError` | ❌ | ユーザーに再認証を促す（自動リトライ不可） |
| `HitlCancelled` | ❌ | ユーザー判断なので再実行しない |
| `ManifestDenied` | ❌ | manifest を修正しない限り通らない |
| `ValidationError` | ❌ | 入力が変わらなければ何度やっても失敗 |
| `ConflictError` | ❌ | ユーザーに競合解決を求める |
| `QuotaError` | ❌ | 課金・上限変更が必要 |

### MCP サーバーでの `retryable` 宣言

MCP サーバーはエラーを返すとき、`retryable` フラグを付けて返す：

```typescript
// mcp-server/index.ts
server.tool(
  "x.post",
  "X に投稿する",
  { text: z.string(), goal_ref: z.string().optional() },
  async ({ text, goal_ref }) => {
    try {
      const result = await xApiClient.post({ text })
      return { content: [{ type: "text", text: JSON.stringify(result) }] }
    } catch (apiError) {
      // X API のエラーを AKARI のエラー型にマッピング
      if (apiError.status === 429) {
        // RateLimitError — retryable
        return {
          isError: true,
          content: [{
            type: "text",
            text: JSON.stringify({
              error_code:      "rate_limit",
              message:         "レート制限に達しました",
              retryable:       true,
              retry_after_ms:  (apiError.retryAfter ?? 60) * 1000,
            })
          }]
        }
      }
      if (apiError.status === 401) {
        // AuthError — not retryable
        return {
          isError: true,
          content: [{
            type: "text",
            text: JSON.stringify({
              error_code: "auth_failed",
              message:    "認証が無効です。再認証してください",
              retryable:  false,
            })
          }]
        }
      }
      // 一般的なネットワークエラー — retryable
      return {
        isError: true,
        content: [{
          type: "text",
          text: JSON.stringify({
            error_code: "network_error",
            message:    `API エラー: ${apiError.message}`,
            retryable:  true,
          })
        }]
      }
    }
  }
)
```

### deadletter — リトライ上限を超えたとき

3 回リトライして失敗したジョブは Core の deadletter キューに入る。
ユーザーには「実行できませんでした。手動で再試行してください」の通知が届く。

deadletter に入ったジョブは AMP に自動記録される：

```
AMP record:
  kind:     "action-failure"
  content:  "x.post 3 回リトライ後に deadletter に移動"
  goal_ref: "writer-session-2026"
  meta:
    tool:       "x.post"
    attempts:   3
    last_error: "rate_limit"
    payload:    { text_amp_id: "amp:rec:01J..." }  ← 本文は ID 参照
```

App はこの deadletter イベントを受信して、ユーザーに通知できる：

```typescript
// mcp-server/index.ts
import { app } from "@akari/sdk"

app.onDeadletter(async (job) => {
  // deadletter に入ったジョブを受信
  shell.toast({
    message:  `「${job.tool}」の実行に失敗しました（3 回リトライ済み）`,
    level:    "error",
    duration: 10_000,
    action:   { label: "手動で再試行", onClick: () => shell.openPanel("main") },
  })
})
```

---

## Part 3: エラーを AMP に記録するパターン

エラーの記録は**トレーサビリティ**と**デバッグ**の両方に機能する。
すべての重要なエラーは AMP に `kind: "action-failure"` で記録する。

### 基本パターン

```typescript
import { amp } from "@akari/sdk"

async function postWithRecording(
  text: string,
  goalRef: string,
) {
  try {
    const result = await mcpClient.call("x.post", { text, goal_ref: goalRef })

    // 成功を記録
    await amp.record({
      kind:     "action-success",
      content:  `x.post 成功: ${result.tweet_id}`,
      goal_ref: goalRef,
      meta: {
        tool:     "x.post",
        tweet_id: result.tweet_id,
      },
    })

    return result
  } catch (err) {
    // エラーを記録（retryable かどうかも記録する）
    await amp.record({
      kind:     "action-failure",
      content:  `x.post 失敗: ${err.message}`,
      goal_ref: goalRef,
      meta: {
        tool:       "x.post",
        error_code: err instanceof AkariError ? err.code : "unknown",
        retryable:  err instanceof AkariError ? err.retryable : false,
        error_meta: err instanceof AkariError ? err.meta : {},
      },
    })
    throw err  // 呼び出し元に伝播させる
  }
}
```

### エラーを「記録して飲み込む」パターン（非重要処理）

バックグラウンド処理や非クリティカルな操作は、
エラーを AMP に記録してから silent に処理する：

```typescript
async function tryAutoSave(text: string, goalRef: string) {
  try {
    await amp.record({ kind: "draft", content: text, goal_ref: goalRef })
  } catch (err) {
    // 自動保存失敗は AMP に記録するが、ユーザーには通知しない
    // （重要でない処理を失敗でフローを止めない）
    console.warn("[auto-save] AMP への書き込みに失敗:", err)
    // AMP 自体への書き込みが失敗した場合は再帰しない（無限ループ防止）
  }
}
```

### handoff でのエラー記録

handoff handler は失敗時も必ず AMP に記録する：

```typescript
export async function handleHandoff(payload: HandoffPayload) {
  const { goal_ref = "unknown" } = payload

  try {
    // handoff 受信を記録
    await amp.record({
      kind:     "handoff-received",
      content:  `handoff 受信: intent=${payload.intent}`,
      goal_ref: goal_ref,
      meta: { sender: payload._from, intent: payload.intent },
    })

    const result = await processHandoff(payload)

    // 処理成功を記録
    await amp.record({
      kind:     "handoff-processed",
      content:  `handoff 処理完了: intent=${payload.intent}`,
      goal_ref: goal_ref,
    })

    return result
  } catch (err) {
    // 処理失敗を記録
    await amp.record({
      kind:     "handoff-error",
      content:  `handoff 処理失敗: ${err.message}`,
      goal_ref: goal_ref,
      meta: {
        intent:     payload.intent,
        error_code: err instanceof AkariError ? err.code : "unknown",
      },
    }).catch(() => {})  // AMP 記録失敗は無視（再帰防止）

    return { error: err.message, panel: "main" }
  }
}
```

---

## Part 4: デバッグヒント（development mode のロギング）

### `akari dev` のロギング

`akari dev` で起動した場合、SDK は自動で verbose ロギングモードになる：

```bash
akari dev --debug   # さらに詳細なログ
```

```
[akari:sdk] pool.put called (mime=image/png, size=204800)
[akari:sdk] amp.record called (kind=draft, goal_ref=writer-session)
[akari:sdk] app.handoff → com.akari.x-sender (intent=post-draft)
[akari:mcp] tool called: x.post (input={text: "...240文字...", goal_ref: "..."})
[akari:mcp] tool response: x.post → success (tweet_id=17...9)
[akari:permission] gate: external-network.post → granted (hitl=true, user=approved)
```

### App 内でのデバッグロギング

開発時のみ詳細ログを出す：

```typescript
import { logger } from "@akari/sdk"

// 環境に応じたログレベルの切り替え
const log = logger.create("com.akari.x-sender")  // App ID をプレフィックスに

log.debug("MCP tool 呼び出し前の state:", { text: text.slice(0, 50) })
log.info("投稿成功:", { tweet_id: result.tweet_id })
log.warn("レート制限に近づいています:", { remaining: headers["x-rate-limit-remaining"] })
log.error("API 認証失敗:", { status: apiError.status })

// 本番では debug / info が suppressed になる
// development mode では全レベルが stdout に出力される
```

### MCP サーバーでのデバッグ

```typescript
// mcp-server/index.ts
const isDev = process.env.AKARI_ENV === "development"

server.tool(
  "x.post",
  "X に投稿する",
  { text: z.string(), goal_ref: z.string().optional() },
  async ({ text, goal_ref }) => {
    if (isDev) {
      console.log("[debug] x.post input:", { text: text.slice(0, 50), goal_ref })
    }

    try {
      const result = await xApiClient.post({ text })

      if (isDev) {
        console.log("[debug] x.post response:", result)
      }

      return { content: [{ type: "text", text: JSON.stringify(result) }] }
    } catch (err) {
      // 開発時は full stack trace を出す
      if (isDev) {
        console.error("[debug] x.post error:", err)
      }
      throw err
    }
  }
)
```

### `akari app certify` のエラー解読

```bash
akari app certify
```

よくある失敗パターンと対処：

```
✗ [Guidelines] App contains direct database access
  → src/store.ts:42 — "new Database(...)"
  → Fix: データは Pool / AMP を使う。自前 DB 禁止（HUB-024 §6.7 Guideline 2）

✗ [Contract] amp.record() called without goal_ref
  → mcp-server/index.ts:87
  → Fix: amp.record({ ..., goal_ref: "..." }) を追加

✗ [Schema] Panel field "text" bind "state.body" not declared in state
  → panels/main.schema.json:12
  → Fix: state に "body": { "type": "string" } を追加

✗ [Permission] tool "x.delete_tweet" not declared in [mcp].tools
  → akari.toml に tools = [..., "x.delete_tweet"] を追加

✗ [HITL] tool "x.post" has hitl=false but is in external-network
  → Panel Schema action "post" に hitl: true を設定
```

### AMP でエラー履歴を確認する

```typescript
// 開発時のデバッグ用: AMP から直近のエラーを取得
const recentErrors = await amp.query({
  kind:     "action-failure",
  goal_ref: "writer-session",
  limit:    20,
  sort:     "desc",
})

console.table(recentErrors.map((r) => ({
  time:       r.created_at,
  tool:       r.meta?.tool,
  error_code: r.meta?.error_code,
  message:    r.content.slice(0, 80),
})))
```

---

## エラー処理のアンチパターン

### 1. エラーを全て `console.error` で握りつぶす

```typescript
// NG — ユーザーも AMP も知らないまま失敗する
try {
  await mcpClient.call("x.post", { text })
} catch (err) {
  console.error(err)  // ← これだけは NG
}

// OK — ユーザーへの通知 + AMP 記録の両方をする
try {
  await mcpClient.call("x.post", { text })
} catch (err) {
  await amp.record({ kind: "action-failure", content: err.message, goal_ref })
  shell.toast({ message: "投稿に失敗しました", level: "error" })
}
```

### 2. `ValidationError` を silent retry する

```typescript
// NG — 入力が変わらなければ何度リトライしても無駄
if (err instanceof ValidationError) {
  await retry(() => mcpClient.call("x.post", { text }), { attempts: 3 })
}

// OK — ValidationError は即座にユーザーに返す
if (err instanceof ValidationError) {
  shell.toast({ message: `入力エラー: ${err.message}`, level: "error" })
}
```

### 3. `HitlCancelled` をエラーとして記録する

```typescript
// NG — キャンセルはエラーではない
try {
  await permission.gate({ action: "external-network.post", hitl: true })
} catch (err) {
  if (err instanceof HitlCancelled) {
    await amp.record({ kind: "action-failure", content: "ユーザーがキャンセル" })
  }
}

// OK — キャンセルは通常のフローの一部として記録
try {
  await permission.gate({ action: "external-network.post", hitl: true })
  await doPost()
} catch (err) {
  if (err instanceof HitlCancelled) {
    // silent — ユーザーの意図的な操作なので何もしない
    // または必要なら "user-cancelled" kind で記録
    log.info("ユーザーが投稿をキャンセル")
  } else {
    throw err  // その他のエラーは伝播させる
  }
}
```

### 4. ネットワークエラーを即座に「ユーザーへの notification」にする

```typescript
// NG — 一時的なエラーにすぐ toast を出すとうるさい
try {
  await mcpClient.call("x.post", { text })
} catch (err) {
  if (err instanceof NetworkError) {
    shell.toast({ message: "ネットワークエラー" })  // Core がリトライ中なのに表示する
  }
}

// OK — retryable なエラーは Core に任せ、deadletter になったときだけ通知
// deadletter ハンドラーで通知（Part 2 参照）
app.onDeadletter(async (job) => {
  shell.toast({ message: `「${job.tool}」の実行に最終的に失敗しました`, level: "error" })
})
```

---

## エラー処理チェックリスト

| チェック項目 | 確認方法 |
|---|---|
| `AkariError` のサブクラスを正しく判定しているか | `err instanceof NetworkError` 等で分岐 |
| `HitlCancelled` を「エラー」として処理していないか | catch 内で `instanceof HitlCancelled` を先にチェック |
| retryable なエラーを自前でリトライしていないか | Core の deadletter 機構に委譲 |
| 全 `action-failure` に `goal_ref` が付いているか | AMP record の `goal_ref` 必須 |
| development mode でのみ verbose log を出しているか | `process.env.AKARI_ENV === "development"` で分岐 |
| `ValidationError` をユーザーに即座に返しているか | silent retry しない |
| `AuthError` で再認証フローに誘導しているか | `shell.openSettings("auth")` または dialog |
| handoff handler がエラーを throw せず `{ error: ... }` で返すか | try/catch で包んでいる |

---

## 関連ドキュメント

- [HUB-024 §6.6 Permission API](https://github.com/Akari-OS/.github/blob/main/VISION.md) — HITL gate の仕様
- [HUB-005 §6.6 エラー処理](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Declarative App のエラー分担
- [ADR-010 (Hub)] — retry / deadletter アーキテクチャの意思決定記録
- [Cookbook > State Management](./state-management.md) — エラー状態の state 管理
- [Cookbook > Cross-over Handoff](./cross-over-handoff.md) — handoff handler のエラー設計
