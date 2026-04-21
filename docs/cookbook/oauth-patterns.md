# Cookbook — OAuth / 外部認証パターン

> **対象**: AKARI App SDK（HUB-024）で外部サービスと連携する App 開発者
> **前提**: `akari.toml` / Permission API / Keychain の基礎知識
> **関連 spec**: AKARI-HUB-024 §6.6(6) Permission API, AKARI-HUB-007 X Sender, AKARI-HUB-026 Notion

---

## このガイドで扱うこと

AKARI App が外部サービスと連携するための認証パターンを 3 種類解説する。

| パターン | 代表例 | 向いている用途 |
|---|---|---|
| **OAuth 2.0 PKCE** | X (Twitter), Notion | ユーザーのデータを読み書きする SNS / SaaS |
| **OAuth 2.0 Authorization Code** | Google Workspace | エンタープライズ向け、サーバー側シークレットを持てる環境 |
| **Personal API Key** | Notion Integration Token, OpenAI | 個人または内部連携、ユーザーが手動で発行するキー |

また、認証を正しく機能させるために不可欠な以下のテーマも扱う。

- Permission API との統合（宣言 → 実行時ゲート）
- Token refresh の自動化
- 認証エラーからの復旧フロー

---

## レシピ 1 — OAuth 2.0 PKCE（X / Notion など）

### いつ使うか

- MCP サーバー側（ローカルプロセス）だけで完結し、クライアントシークレットを持たない
- X API v2, Notion OAuth 2.0, Atlassian などが推奨する方式
- クライアントシークレットがない分、フロー上のシークレット漏洩リスクが低い

### akari.toml の宣言

```toml
[app]
id   = "com.example.my-service"
tier = "mcp-declarative"
sdk  = ">=0.1.0 <1.0"

[permissions]
external-network = ["api.example.com"]
oauth            = ["example.com"]          # OAuth プロバイダのドメイン
keychain         = ["com.example.my-service"]  # Keychain サービス名

[oauth.example]
provider      = "example.com"
grant_type    = "authorization_code"
pkce          = true                        # PKCE 必須
scope         = ["read", "write"]
auth_url      = "https://example.com/oauth/authorize"
token_url     = "https://example.com/oauth/token"
redirect_uri  = "akari://oauth/callback"
token_storage = "keychain:com.example.my-service"
```

### MCP サーバー側の実装（TypeScript）

```typescript
import { permission, keychain } from "@akari/sdk"
import crypto from "node:crypto"

// ---- PKCE ヘルパー ----
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url")
}

function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url")
}

// ---- 認証開始 ----
export async function startOAuthPKCE(config: {
  clientId: string
  authUrl: string
  tokenUrl: string
  scope: string[]
  redirectUri: string
}) {
  // 1. Permission API でユーザーに承認を求める
  await permission.gate({
    action: "oauth.authorize",
    reason: `${config.clientId} への接続を許可します`,
    hitl: true,
  })

  // 2. PKCE パラメータ生成
  const codeVerifier = generateCodeVerifier()
  const codeChallenge = generateCodeChallenge(codeVerifier)

  // state は CSRF 防止用ランダム値
  const state = crypto.randomBytes(16).toString("hex")

  // Keychain に一時保存（コールバック受信時に照合）
  await keychain.set({
    service: "com.example.my-service",
    account: "pkce_verifier",
    value: codeVerifier,
  })
  await keychain.set({
    service: "com.example.my-service",
    account: "oauth_state",
    value: state,
  })

  // 3. 認証 URL を構築してブラウザを開く
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope.join(" "),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  })

  const authUrl = `${config.authUrl}?${params.toString()}`

  // Shell が systemOpen でブラウザを起動
  await shell.openExternal(authUrl)
}

// ---- コールバック受信 → トークン取得 ----
export async function handleOAuthCallback(
  callbackParams: { code: string; state: string },
  config: { clientId: string; tokenUrl: string; redirectUri: string }
): Promise<void> {
  // state 検証（CSRF チェック）
  const savedState = await keychain.get({
    service: "com.example.my-service",
    account: "oauth_state",
  })
  if (callbackParams.state !== savedState) {
    throw new Error("OAuth state mismatch — possible CSRF attack")
  }

  const codeVerifier = await keychain.get({
    service: "com.example.my-service",
    account: "pkce_verifier",
  })

  // トークンエンドポイントに code + verifier を送信
  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: callbackParams.code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      code_verifier: codeVerifier,
    }),
  })

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  }

  const tokens = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  // Keychain に保存（平文 never, Keychain 必須）
  await saveTokens(tokens)

  // 一時保存した PKCE データを削除
  await keychain.delete({ service: "com.example.my-service", account: "pkce_verifier" })
  await keychain.delete({ service: "com.example.my-service", account: "oauth_state" })
}

// ---- トークン保存 ----
async function saveTokens(tokens: {
  access_token: string
  refresh_token?: string
  expires_in?: number
}): Promise<void> {
  const service = "com.example.my-service"

  await keychain.set({ service, account: "access_token",  value: tokens.access_token })

  if (tokens.refresh_token) {
    await keychain.set({ service, account: "refresh_token", value: tokens.refresh_token })
  }

  if (tokens.expires_in) {
    const expiry = Date.now() + tokens.expires_in * 1000
    await keychain.set({ service, account: "token_expiry", value: String(expiry) })
  }
}
```

### X (Twitter) PKCE の具体例

X API v2 は OAuth 2.0 PKCE を推奨する。X Sender（HUB-007）の実装パターンを示す。

```typescript
// x-mcp/src/auth.ts
const X_AUTH_CONFIG = {
  clientId:    process.env.X_CLIENT_ID!,
  authUrl:     "https://twitter.com/i/oauth2/authorize",
  tokenUrl:    "https://api.twitter.com/2/oauth2/token",
  scope:       ["tweet.read", "tweet.write", "users.read", "offline.access"],
  redirectUri: "akari://oauth/callback",
}

// App 初回起動時に認証状態を確認
export async function ensureAuthenticated(): Promise<string> {
  const token = await keychain.get({
    service: "com.akari.x-sender",
    account: "access_token",
  })

  if (!token) {
    // 未認証 → PKCE フロー開始
    await startOAuthPKCE(X_AUTH_CONFIG)
    // Shell のコールバックハンドラが handleOAuthCallback を呼ぶ
    throw new Error("AUTH_REQUIRED") // Shell が認証プロンプトを表示
  }

  // Token 期限チェック
  return await getValidAccessToken("com.akari.x-sender")
}
```

---

## レシピ 2 — OAuth 2.0 Authorization Code（Google Workspace）

### いつ使うか

- バックエンド（Cloud Function / サーバー）を持てる場合
- Google, GitHub, Slack などが採用
- `client_secret` をサーバー側に隠せる（PKCE の追加保護が不要）

### akari.toml の宣言

```toml
[oauth.google]
provider      = "google.com"
grant_type    = "authorization_code"
pkce          = false              # サーバーシークレットで代替（省略可、推奨は true でも可）
scope         = ["https://www.googleapis.com/auth/drive.readonly",
                 "https://www.googleapis.com/auth/docs"]
auth_url      = "https://accounts.google.com/o/oauth2/v2/auth"
token_url     = "https://oauth2.googleapis.com/token"
token_storage = "keychain:com.example.google-workspace"

# クライアントシークレットは環境変数で管理（Manifest に書かない）
# [oauth.google.credentials] は App の環境変数で別途注入
```

### 実装（TypeScript）

```typescript
import { permission, keychain } from "@akari/sdk"

const GOOGLE_OAUTH_CONFIG = {
  clientId:     process.env.GOOGLE_CLIENT_ID!,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET!,    // MCP サーバーの env vars で管理
  authUrl:      "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl:     "https://oauth2.googleapis.com/token",
  scope:        [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/docs",
  ],
  redirectUri: "akari://oauth/callback",
}

export async function startGoogleOAuth(): Promise<void> {
  await permission.gate({
    action: "oauth.authorize",
    reason: "Google Workspace へのアクセスを許可します",
    hitl: true,
  })

  const state = crypto.randomBytes(16).toString("hex")
  await keychain.set({
    service: "com.example.google-workspace",
    account: "oauth_state",
    value: state,
  })

  const params = new URLSearchParams({
    response_type: "code",
    client_id:     GOOGLE_OAUTH_CONFIG.clientId,
    redirect_uri:  GOOGLE_OAUTH_CONFIG.redirectUri,
    scope:         GOOGLE_OAUTH_CONFIG.scope.join(" "),
    state,
    access_type:   "offline",     // refresh_token を受け取るために必要
    prompt:        "consent",     // 毎回 refresh_token を発行
  })

  await shell.openExternal(`${GOOGLE_OAUTH_CONFIG.authUrl}?${params.toString()}`)
}

export async function handleGoogleCallback(code: string, state: string): Promise<void> {
  const savedState = await keychain.get({
    service: "com.example.google-workspace",
    account: "oauth_state",
  })
  if (state !== savedState) throw new Error("State mismatch")

  const res = await fetch(GOOGLE_OAUTH_CONFIG.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id:     GOOGLE_OAUTH_CONFIG.clientId,
      client_secret: GOOGLE_OAUTH_CONFIG.clientSecret,
      redirect_uri:  GOOGLE_OAUTH_CONFIG.redirectUri,
      grant_type:    "authorization_code",
    }),
  })

  const tokens = await res.json()
  await saveGoogleTokens(tokens)
}

async function saveGoogleTokens(tokens: {
  access_token: string
  refresh_token?: string
  expires_in: number
  id_token?: string
}): Promise<void> {
  const svc = "com.example.google-workspace"
  await keychain.set({ service: svc, account: "access_token",  value: tokens.access_token })
  if (tokens.refresh_token) {
    await keychain.set({ service: svc, account: "refresh_token", value: tokens.refresh_token })
  }
  const expiry = Date.now() + tokens.expires_in * 1000
  await keychain.set({ service: svc, account: "token_expiry",  value: String(expiry) })
}
```

---

## レシピ 3 — Personal API Key（Notion Integration Token など）

### いつ使うか

- ユーザーが管理画面でトークンを手動発行するサービス（Notion Internal Integration, OpenAI, etc.）
- チーム内部連携やサーバー間通信で OAuth フローが不要な場合
- Enterprise 環境で IT 管理者が一元管理するケース

### Panel Schema による設定 UI

```json
{
  "$schema": "akari://panel-schema/v0",
  "title": "Notion Settings",
  "layout": "form",
  "fields": [
    {
      "id":          "integration_token",
      "type":        "password",
      "label":       "{{t:settings.token_label}}",
      "placeholder": "secret_xxxxxxxxxxxxxxxxxxxx",
      "helperText":  "{{t:settings.token_helper}}",
      "bind":        "state.integration_token"
    }
  ],
  "actions": [
    {
      "id":    "save_token",
      "label": "{{t:settings.save}}",
      "kind":  "primary",
      "mcp": {
        "tool": "notion.save_integration_token",
        "args": { "token": "$integration_token" }
      },
      "hitl": {
        "require": true,
        "preview": "text-summary"
      },
      "enabled_when": "$integration_token != null && $integration_token.length > 10"
    }
  ]
}
```

### MCP サーバー側の実装

```typescript
// notion-mcp/src/auth.ts

// Integration Token を Keychain に保存する MCP ツール
export const saveIntegrationToken = {
  name: "notion.save_integration_token",
  description: "Notion Integration Token を Keychain に安全に保存する",
  inputSchema: {
    type: "object",
    required: ["token"],
    properties: {
      token: {
        type: "string",
        pattern: "^secret_[A-Za-z0-9]{43}$",
        description: "Notion Internal Integration Token",
      },
    },
  },
  handler: async ({ token }: { token: string }) => {
    await permission.gate({
      action: "keychain.write",
      reason: "Notion Integration Token を安全に保存します",
      hitl: false,
    })

    await keychain.set({
      service: "com.akari.notion",
      account: "integration_token",
      value: token,
    })

    // AMP に設定変更を記録
    await amp.record({
      kind: "auth-configured",
      content: "Notion Integration Token を設定しました",
      goal_ref: "com.akari.notion",
      metadata: { method: "integration_token" },
    })

    return { success: true, message: "Token saved" }
  },
}

// OAuth アクセストークンと Integration Token の両方に対応
export async function getNotionAuthHeader(): Promise<string> {
  // OAuth を優先、なければ Integration Token
  const oauthToken = await keychain.get({
    service: "com.akari.notion",
    account: "access_token",
  })

  if (oauthToken) {
    return `Bearer ${await getValidAccessToken("com.akari.notion")}`
  }

  const integrationToken = await keychain.get({
    service: "com.akari.notion",
    account: "integration_token",
  })

  if (integrationToken) {
    return `Bearer ${integrationToken}`
  }

  throw new Error("AUTH_REQUIRED") // Shell に再認証を促す
}
```

---

## レシピ 4 — Permission API との統合

AKARI の全ての外部 API 呼び出しは Permission API の `gate` を通すこと（HUB-024 §6.6(6) 参照）。

### 宣言と実行時ゲートの対応

```toml
# akari.toml — 権限の事前宣言
[permissions]
external-network = ["api.example.com"]
oauth            = ["example.com"]
keychain         = ["com.example.my-service"]
```

```typescript
// 実行時ゲート — manifest で宣言した action しか gate できない
import { permission } from "@akari/sdk"

// 内部操作（Pool 書き込み）— HITL 不要
await permission.gate({
  action: "pool.write",
  reason: "下書きを保存",
  hitl: false,
})

// 外部公開操作（外部サービスへの書き込み）— HITL 必須
await permission.gate({
  action: "external-network.post",
  reason: "X に投稿します",
  hitl: true,
})

// OAuth フロー開始 — ブラウザを開く操作
await permission.gate({
  action: "oauth.authorize",
  reason: "X への接続を許可します",
  hitl: true,
})
```

### 全 gate 通過の AMP 自動記録

Permission gate を通過した操作は Core が AMP に監査ログとして自動記録する。
MCP サーバー側で重複して記録する必要はないが、ドメイン固有の情報（投稿 URL など）は明示的に記録すること。

```typescript
// 投稿成功後の明示的 AMP 記録（監査ログ以上の情報を付加）
await amp.record({
  kind: "publish-action",
  content: `X に投稿しました: ${tweetUrl}`,
  goal_ref: handoffGoalRef ?? `${appId}:${Date.now()}`,
  metadata: {
    target:       "x",
    tweet_id:     tweetId,
    tweet_url:    tweetUrl,
    published_at: new Date().toISOString(),
  },
})
```

---

## レシピ 5 — Token Refresh の自動化

### リフレッシュフロー

```typescript
// auth/token-refresh.ts

interface TokenStore {
  service: string
  accessTokenAccount:  string
  refreshTokenAccount: string
  tokenExpiryAccount:  string
}

export async function getValidAccessToken(service: string): Promise<string> {
  const store: TokenStore = {
    service,
    accessTokenAccount:  "access_token",
    refreshTokenAccount: "refresh_token",
    tokenExpiryAccount:  "token_expiry",
  }

  const expiryStr = await keychain.get({
    service: store.service,
    account: store.tokenExpiryAccount,
  })

  const expiry   = expiryStr ? Number(expiryStr) : 0
  const isExpired = Date.now() >= expiry - 60_000  // 1 分前に先行更新

  if (!isExpired) {
    const token = await keychain.get({
      service: store.service,
      account: store.accessTokenAccount,
    })
    if (token) return token
  }

  // リフレッシュを試みる
  return await refreshAccessToken(store)
}

async function refreshAccessToken(store: TokenStore): Promise<string> {
  const refreshToken = await keychain.get({
    service: store.service,
    account: store.refreshTokenAccount,
  })

  if (!refreshToken) {
    // リフレッシュトークンがない → 再認証が必要
    throw new OAuthRefreshError("REFRESH_TOKEN_MISSING")
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type:    "refresh_token",
        refresh_token: refreshToken,
        client_id:     CLIENT_ID,
        // Authorization Code フローで client_secret がある場合はここに追加
      }),
    })

    if (res.status === 400 || res.status === 401) {
      // リフレッシュトークン失効
      await clearTokens(store)
      throw new OAuthRefreshError("REFRESH_TOKEN_EXPIRED")
    }

    if (!res.ok) throw new Error(`Refresh failed: ${res.status}`)

    const tokens = await res.json() as {
      access_token: string
      refresh_token?: string
      expires_in: number
    }

    await keychain.set({
      service: store.service,
      account: store.accessTokenAccount,
      value: tokens.access_token,
    })

    // プロバイダによっては新しい refresh token を発行する（ローテーション）
    if (tokens.refresh_token) {
      await keychain.set({
        service: store.service,
        account: store.refreshTokenAccount,
        value: tokens.refresh_token,
      })
    }

    const newExpiry = Date.now() + tokens.expires_in * 1000
    await keychain.set({
      service: store.service,
      account: store.tokenExpiryAccount,
      value: String(newExpiry),
    })

    return tokens.access_token
  } catch (err) {
    if (err instanceof OAuthRefreshError) throw err
    throw new OAuthRefreshError("REFRESH_NETWORK_ERROR", { cause: err })
  }
}

async function clearTokens(store: TokenStore): Promise<void> {
  await keychain.delete({ service: store.service, account: store.accessTokenAccount })
  await keychain.delete({ service: store.service, account: store.refreshTokenAccount })
  await keychain.delete({ service: store.service, account: store.tokenExpiryAccount })
}

export class OAuthRefreshError extends Error {
  constructor(
    public readonly code: "REFRESH_TOKEN_MISSING" | "REFRESH_TOKEN_EXPIRED" | "REFRESH_NETWORK_ERROR",
    options?: ErrorOptions
  ) {
    super(`OAuthRefreshError: ${code}`, options)
    this.name = "OAuthRefreshError"
  }
}
```

---

## レシピ 6 — エラー復旧フロー

### エラーの種類と対処

```typescript
// auth/error-recovery.ts
import { shell, amp } from "@akari/sdk"
import { OAuthRefreshError } from "./token-refresh"

export async function withAuth<T>(
  fn: () => Promise<T>,
  context: { appId: string; goalRef?: string }
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    return await handleAuthError(err, fn, context)
  }
}

async function handleAuthError<T>(
  err: unknown,
  fn: () => Promise<T>,
  context: { appId: string; goalRef?: string }
): Promise<T> {
  // ---- 1. トークン期限切れ → 自動リフレッシュ ----
  if (isExpiredTokenError(err)) {
    try {
      await refreshAccessToken({ service: context.appId } as TokenStore)
      return await fn()  // リトライ
    } catch (refreshErr) {
      // リフレッシュ失敗は下へ
      err = refreshErr
    }
  }

  // ---- 2. リフレッシュトークン失効 → 再認証プロンプト ----
  if (err instanceof OAuthRefreshError &&
      (err.code === "REFRESH_TOKEN_EXPIRED" || err.code === "REFRESH_TOKEN_MISSING")) {
    await amp.record({
      kind: "auth-error",
      content: `${context.appId}: 再認証が必要です`,
      goal_ref: context.goalRef ?? context.appId,
      metadata: { error_code: err.code },
    })

    // Shell に通知（ユーザーに再認証プロンプトを表示）
    await shell.notify({
      title: "再認証が必要です",
      body: `${context.appId} への接続が切れました。クリックして再認証してください。`,
      action: { type: "open-settings", appId: context.appId },
    })

    throw err  // 上位で処理
  }

  // ---- 3. ネットワークエラー → キャッシュフォールバック ----
  if (isNetworkError(err)) {
    await shell.toast({
      message: "オフライン中です。キャッシュを表示しています。",
      kind: "warning",
      duration: 4000,
    })
    throw new OfflineFallbackError("NETWORK_UNAVAILABLE", { cause: err })
  }

  // ---- 4. Rate limit → バックオフ ----
  if (isRateLimitError(err)) {
    const retryAfter = extractRetryAfter(err) ?? 60
    await shell.toast({
      message: `API レート制限中です。${retryAfter} 秒後に再試行します。`,
      kind: "info",
    })
    await delay(retryAfter * 1000)
    return await fn()  // リトライ
  }

  throw err
}

// ---- ユーティリティ ----
function isExpiredTokenError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return (
    msg.includes("401") ||
    msg.includes("invalid_token") ||
    msg.includes("token expired") ||
    msg.includes("unauthorized")
  )
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return (
    err.name === "TypeError" ||
    err.message.includes("fetch") ||
    err.message.includes("ECONNREFUSED") ||
    err.message.includes("ENOTFOUND")
  )
}

function isRateLimitError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.message.includes("429") || err.message.includes("rate limit")
}

function extractRetryAfter(err: unknown): number | null {
  // HTTP response headers から Retry-After を取得（エラーオブジェクトに持たせる実装に依存）
  if (typeof (err as { retryAfter?: number }).retryAfter === "number") {
    return (err as { retryAfter: number }).retryAfter
  }
  return null
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export class OfflineFallbackError extends Error {
  constructor(
    public readonly code: string,
    options?: ErrorOptions
  ) {
    super(`OfflineFallbackError: ${code}`, options)
    this.name = "OfflineFallbackError"
  }
}
```

### 使用例

```typescript
// x-mcp/src/tools/post.ts
import { withAuth } from "../auth/error-recovery"
import { getValidAccessToken } from "../auth/token-refresh"

export async function postToX(params: {
  text: string
  media?: string[]
  goalRef?: string
}): Promise<{ tweetId: string; tweetUrl: string }> {
  return await withAuth(
    async () => {
      const token = await getValidAccessToken("com.akari.x-sender")

      const res = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: params.text }),
      })

      if (!res.ok) {
        const errorBody = await res.json()
        const error = Object.assign(new Error(`X API error: ${res.status}`), {
          status: res.status,
          retryAfter: Number(res.headers.get("Retry-After")) || undefined,
          body: errorBody,
        })
        throw error
      }

      const data = await res.json() as { data: { id: string } }
      const tweetId = data.data.id
      return {
        tweetId,
        tweetUrl: `https://x.com/i/web/status/${tweetId}`,
      }
    },
    { appId: "com.akari.x-sender", goalRef: params.goalRef }
  )
}
```

---

## セキュリティチェックリスト

以下をすべて満たすこと。満たさない App は `akari app certify` の Lint で reject される。

- `keychain` permission を `akari.toml` で宣言している
- アクセストークン・リフレッシュトークン・クライアントシークレットを平文でファイルに書いていない
- `oauth` permission に認証プロバイダのドメインを宣言している
- 全ての外部 API 呼び出しを `permission.gate` でゲートしている
- 外部公開操作（SNS 投稿、メール送信など）は `hitl: true` を指定している
- AMP への認証イベント記録（`kind: "auth-configured"` / `"auth-error"` 等）に `goal_ref` を付けている
- `state` パラメータで CSRF チェックを行っている（OAuth 2.0）

---

## 関連ドキュメント

- [HITL パターン](./hitl-patterns.md) — OAuth 認証後の承認フローを HITL でどう実装するか
- [オフラインファースト](./offline-first.md) — 認証エラー時のオフラインフォールバック戦略
- AKARI-HUB-024 §6.6(6) Permission API
- AKARI-HUB-007 X Sender Phase 0 — PKCE の実例
- AKARI-HUB-026 Notion Reference — OAuth + Integration Token 両対応の実例
