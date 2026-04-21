---
title: Permission API リファレンス
spec: AKARI-HUB-024
updated: 2026-04-19
related: [HUB-024, HUB-025, ADR-010]
---

# Permission API リファレンス

> **正典**: [AKARI-HUB-024 §6.6](https://github.com/Akari-OS/.github/blob/main/VISION.md) — 本ドキュメントはその解説であり、spec が常に優先される。

---

## 1. 概要

Permission API は、App が**機密操作を実行する前にユーザー承認を取る**契約を定義する。
AKARI のセキュリティモデルは **最小権限原則（Principle of Least Privilege）** に基づく。

### 最小権限原則

- App は `akari.toml` で宣言した scope 以外の操作を要求できない
- 未宣言の scope は実行時に自動的に拒否される（デフォルト deny）
- AKARI Core がすべての承認要求を仲介する（App が直接ユーザーに問い合わせない）

### 承認の粒度

Permission は **scope 単位**で管理される。scope は `カテゴリ:アクション` 形式で表現する。

| 粒度 | 例 | 説明 |
|---|---|---|
| カテゴリ全体 | `pool:write` | Pool への書き込み全般 |
| ツール単位 | `mcp:x.post` | 特定 MCP ツールの実行 |
| ドメイン単位 | `network:api.x.com` | 特定ドメインへのネットワーク通信 |
| App 間 | `inter-app:com.akari.video` | 特定 App への handoff |

### HITL Gate との関係

投稿・削除・送金など**高リスク操作**は、Permission Gate に加えて **HITL（Human-in-the-Loop）Gate** を必須とする。
Permission Gate は「この操作を行う権限があるか」を検査し、
HITL Gate は「今この操作を実行してよいか」をユーザーが目視確認する。

両者の責務は明確に分離されている:

```
Permission Gate → 静的: manifest に宣言された権限か？
HITL Gate       → 動的: ユーザーが今この操作を承認するか？
```

---

## 2. `akari.toml` での permissions 宣言

App は `akari.toml` の `[permissions]` セクションで**必要な scope をすべて事前宣言**する。
宣言されていない scope は実行時に要求できない。

### `[permissions]` セクション

```toml
[permissions]
# Pool（ユーザーの素材・コンテンツ記憶層）
pool = ["read", "write"]

# AMP（エージェント記憶・判断ログ）
amp = ["read", "write"]

# 外部ネットワーク（許可するドメインを列挙）
external-network = ["api.x.com", "upload.x.com"]

# OAuth 認可（認可サーバーのドメイン）
oauth = ["x.com"]

# MCP ツール（使用するツール名を列挙）
mcp = ["x.post", "x.schedule", "x.draft"]

# App 間 handoff（handoff 先の App ID を列挙）
inter-app = ["com.akari.video"]

# ファイルシステム（限定アクセス）
filesystem = ["read:user-docs"]
```

### scope 記法

| フィールド | 値の型 | 意味 |
|---|---|---|
| `pool` | `["read"]` / `["write"]` / `["read","write"]` | Pool へのアクセス権限 |
| `amp` | `["read"]` / `["write"]` / `["read","write"]` | AMP へのアクセス権限 |
| `external-network` | ドメイン文字列の配列 / `false` | 許可するドメイン一覧。`false` でオフライン強制 |
| `oauth` | 認可サーバードメインの配列 | OAuth トークンを管理するドメイン |
| `mcp` | MCP ツール名の配列 | 呼び出しを許可する MCP ツール |
| `inter-app` | App ID（逆ドメイン記法）の配列 | handoff 先として許可する App |
| `filesystem` | `["read:<path-key>"]` 形式の配列 | ファイルシステムへの限定アクセス |

> **注意**: `external-network = false` はオフライン対応を宣言する。
> MCP-Declarative Tier の remote MCP サーバーを使う場合は `external-network` にそのドメインを必ず記載する。

### Full Tier の宣言例（Writer App）

```toml
[app]
id = "com.akari.writer"
name = "Writer"
tier = "full"
sdk = ">=0.1.0 <1.0"

[permissions]
pool = ["read", "write"]
amp = ["read", "write"]
external-network = false
```

### MCP-Declarative Tier の宣言例（X Sender）

```toml
[app]
id = "com.x.sender"
name = "X Sender"
tier = "mcp-declarative"
sdk = ">=0.1.0 <1.0"

[mcp]
server = "mcp-servers/x-sender"
tools = ["x.post", "x.schedule", "x.draft"]

[permissions]
external-network = ["api.x.com", "upload.x.com"]
oauth = ["x.com"]
mcp = ["x.post", "x.schedule", "x.draft"]
```

---

## 3. Runtime API

すべての Permission API は `@akari/sdk` の `permission` オブジェクトからアクセスする。

```typescript
import { permission } from "@akari/sdk"
```

---

### `permission.gate(options)`

機密操作の**実行前に呼び出す**必須のゲート関数。
manifest に宣言された scope かどうかを検査し、HITL フラグが `true` の場合は
Core が承認ダイアログを表示してユーザーの確認を待つ。

```typescript
async function gate(options: PermissionGateOptions): Promise<void>
```

#### パラメータ

```typescript
interface PermissionGateOptions {
  /** チェックする scope（"カテゴリ:アクション" 形式） */
  scope: PermissionScope

  /** ユーザーへの説明文。承認ダイアログに表示される */
  reason: string

  /**
   * Human-in-the-Loop ゲートを要求するか
   * true = ユーザーの明示的な承認が必要（高リスク操作）
   * false = manifest 宣言済みかつ承認ポリシーが自動許可なら通過（低リスク操作）
   */
  hitl: boolean

  /**
   * HITL プレビューの種類（hitl: true のときのみ有効）
   * Panel Schema の action.hitl.preview と対応する
   */
  preview?: "text-summary" | "schedule-summary" | "diff" | "custom-markdown"

  /** カスタムプレビュー用のテンプレート（preview: "custom-markdown" のとき必須） */
  previewTemplate?: string
}
```

#### 戻り値 / 例外

- 承認された場合: `Promise<void>` が resolve される
- 拒否・タイムアウト・未宣言 scope の場合: `PermissionDeniedError` が throw される

```typescript
class PermissionDeniedError extends Error {
  readonly scope: PermissionScope
  readonly reason: "not-declared" | "user-denied" | "policy-denied" | "timeout"
}
```

#### 使用例（低リスク操作）

```typescript
import { permission, pool } from "@akari/sdk"

async function saveDraft(content: string): Promise<string> {
  // pool:write は低リスク。manifest 宣言済みなら自動通過
  await permission.gate({
    scope: "pool:write",
    reason: "下書きを保存",
    hitl: false,
  })

  const id = await pool.put({
    bytes: Buffer.from(content),
    mime: "text/plain",
    tags: ["draft"],
  })
  return id
}
```

#### 使用例（高リスク操作 + HITL）

```typescript
import { permission } from "@akari/sdk"

async function postToX(text: string): Promise<void> {
  // x.post は高リスク。HITL でユーザーが目視確認してから実行
  await permission.gate({
    scope: "mcp:x.post",
    reason: "X（Twitter）に投稿",
    hitl: true,
    preview: "text-summary",
  })

  // ここに到達した時点でユーザーが承認済み
  await mcpClient.call("x.post", { text })
}
```

---

### `permission.request(scope)`

**未承認の scope への昇格を要求する**。
`gate()` との違いは「現在の承認状態に関わらず、ユーザーに scope 追加の承認を求める」点。
主に初回セットアップや OAuth 認可フローの起点で使用する。

```typescript
async function request(scope: PermissionScope): Promise<PermissionStatus>
```

#### パラメータ

```typescript
type PermissionScope =
  | `pool:${"read" | "write"}`
  | `amp:${"read" | "write"}`
  | `mcp:${string}`
  | `inter-app:${string}`
  | `network:${string}`
  | `oauth:${string}`
  | `filesystem:${"read" | "write"}:${string}`
```

#### 戻り値

```typescript
interface PermissionStatus {
  scope: PermissionScope
  granted: boolean
  policy: "always" | "session" | "ask"
  grantedAt?: Date
  expiresAt?: Date  // policy: "session" の場合のみ
}
```

#### 使用例

```typescript
import { permission } from "@akari/sdk"

// OAuth 連携の初回認可フロー
async function connectXAccount(): Promise<void> {
  const status = await permission.request("oauth:x.com")
  if (!status.granted) {
    throw new Error("X アカウントの連携が必要です")
  }
  // OAuth フローを続行（Shell が OAuth ダイアログを表示）
}
```

---

### `permission.check(scope)`

**現在の承認状態を同期的に確認する**。ダイアログは表示しない。
UI の enabled/disabled 制御や、フォールバック処理の分岐に使用する。

```typescript
function check(scope: PermissionScope): PermissionStatus
```

#### 使用例

```typescript
import { permission } from "@akari/sdk"

function PostButton() {
  const status = permission.check("mcp:x.post")

  return (
    <button
      disabled={!status.granted}
      title={!status.granted ? "X アカウントを連携してください" : undefined}
      onClick={handlePost}
    >
      投稿
    </button>
  )
}
```

---

### `permission.revoke(scope)`

**ユーザーが承認済みの scope を取り消す**。
App からの revoke 要求は「ユーザーが自ら許可を取り消す」UI 操作に対応する
（App が一方的に自分の権限を削除するためではない）。

```typescript
async function revoke(scope: PermissionScope): Promise<void>
```

#### 使用例

```typescript
import { permission } from "@akari/sdk"

// 設定画面の「X 連携を解除」ボタン
async function disconnectXAccount(): Promise<void> {
  await permission.revoke("oauth:x.com")
  // 連携解除後、OAuthトークンも MCP サーバー側で無効化される
}
```

---

## 4. Permission scope 一覧

### 標準 scope

| scope | 説明 | HITL 推奨 |
|---|---|---|
| `pool:read` | Pool からの素材読み取り | No |
| `pool:write` | Pool への素材書き込み | No |
| `amp:read` | AMP からの記憶・ログ読み取り | No |
| `amp:write` | AMP への記憶・ログ書き込み | No |

### MCP scope

| scope | 説明 | HITL 推奨 |
|---|---|---|
| `mcp:<tool>` | 指定した MCP ツールの実行（例: `mcp:x.post`） | ツール依存（後述） |

MCP ツールのリスクレベル目安:

| リスク | 例 | HITL |
|---|---|---|
| 低（読み取り専用） | `mcp:x.timeline`, `mcp:notion.search` | No |
| 中（副作用あり・可逆） | `mcp:x.draft`, `mcp:notion.update` | Optional |
| 高（外部送信・不可逆） | `mcp:x.post`, `mcp:notion.delete`, `mcp:email.send` | **Yes** |

### Inter-App scope

| scope | 説明 | HITL 推奨 |
|---|---|---|
| `inter-app:<app-id>` | 指定 App への handoff 送信（例: `inter-app:com.akari.video`） | No（受信側が判断） |

### Network scope

| scope | 説明 | HITL 推奨 |
|---|---|---|
| `network:<domain>` | 指定ドメインへの HTTP 通信（例: `network:api.x.com`） | No（gate で制御） |

ワイルドカードは使用不可。ドメインは完全一致。サブドメインは個別に宣言する。

### OAuth scope

| scope | 説明 | HITL 推奨 |
|---|---|---|
| `oauth:<domain>` | 指定サービスの OAuth 認可フロー（例: `oauth:x.com`） | Yes（初回のみ） |

### Filesystem scope

| scope | 説明 | HITL 推奨 |
|---|---|---|
| `filesystem:read:<key>` | 指定パスキーへの読み取り（例: `filesystem:read:user-docs`） | No |
| `filesystem:write:<key>` | 指定パスキーへの書き込み | Yes |

`<key>` は Core が管理するシンボリックなパスキー（実パスを App に公開しない）。

---

## 5. HITL Gate 連携

高リスク操作（投稿・削除・送金など）は、Permission API の `hitl: true` と
Panel Schema の `action.hitl` を**組み合わせて**二重防御する。

### Panel Schema 側の HITL 宣言

```json
{
  "actions": [
    {
      "id": "post",
      "label": "投稿",
      "mcp": { "tool": "x.post", "args": { "text": "$text" } },
      "hitl": {
        "require": true,
        "preview": "text-summary"
      }
    }
  ]
}
```

Panel Schema の `hitl.require: true` は Shell のレンダラが処理し、
Runtime API の `permission.gate({ hitl: true })` は App のビジネスロジックが処理する。

**MCP-Declarative Tier** では、Shell が `hitl.require: true` を検出すると、
MCP ツール呼び出しの前に自動的に承認ダイアログを挿入する。
App 側で `permission.gate()` を明示的に呼ぶ必要はない（Shell が代行）。

**Full Tier** では、App のコード側で `permission.gate({ hitl: true })` を明示的に呼ぶ。

### HITL プレビューの種類

| preview 値 | 表示内容 |
|---|---|
| `"text-summary"` | `type: textarea / text` のフィールド内容を要約表示 |
| `"schedule-summary"` | `type: datetime / datetime-optional` の日時・繰り返し条件を表示 |
| `"diff"` | 変更前後の差分表示（destructive action 向け） |
| `"custom-markdown"` | `previewTemplate` で指定した Markdown テンプレートを描画 |

### カスタムプレビュー例

```typescript
await permission.gate({
  scope: "mcp:notion.page.delete",
  reason: "Notion ページを削除",
  hitl: true,
  preview: "custom-markdown",
  previewTemplate: `
## 削除するページ
**タイトル**: {{title}}
**最終更新**: {{updatedAt}}

> この操作は元に戻せません。
  `,
})
```

---

## 6. OAuth トークン管理

OAuth トークンは **MCP サーバー側**で管理し、Permission API がその状態を参照する。
App 本体（Panel / Agent コード）はトークンの実体に直接アクセスしない。

### トークンのライフサイクル

```
1. permission.request("oauth:x.com") を呼び出す
     ↓
2. Shell が OAuth 認可ダイアログを表示（ブラウザ起動）
     ↓
3. 認可コードを取得、MCP サーバーがアクセストークンを受け取り保存
     ↓
4. permission.check("oauth:x.com") が granted: true を返す
     ↓
5. MCP ツール呼び出し（x.post 等）時、MCP サーバーが保持トークンを自動付与
```

### MCP サーバー側の実装責務

```typescript
// MCP サーバー側（App 開発者が実装）
// トークンは Core が提供するキーチェーン API に保存する
import { keychain } from "@akari/mcp-sdk"

async function handlePost(args: PostArgs) {
  const token = await keychain.get("oauth:x.com")  // Core 管理のキーチェーンから取得
  // token を使って X API を呼び出す
}
```

### `permission.revoke("oauth:<domain>")` の挙動

1. Core が MCP サーバーに revoke 通知を送る
2. MCP サーバーがキーチェーンからトークンを削除
3. 外部サービス側のトークン revoke は MCP サーバーが実施（可能な場合）
4. `permission.check("oauth:x.com")` が `granted: false` を返すようになる

---

## 7. ユーザー承認 UI

承認ダイアログは Shell が管理し、App は UI を自前で用意しない。
Shell が提供する標準ダイアログには以下の要素が含まれる。

### 承認ダイアログの構成

```
┌─────────────────────────────────────────────────────────┐
│ [App アイコン] X Sender が許可を求めています            │
│                                                         │
│ 操作: X（Twitter）に投稿                                │
│ 権限: mcp:x.post                                        │
│                                                         │
│ ─── プレビュー ─────────────────────────────────────  │
│ 本文: 「新しいドキュメント生成ツールをリリースしました │
│         ...（全文）                                     │
│ ─────────────────────────────────────────────────────  │
│                                                         │
│ 許可ポリシー:                                           │
│   ○ 常に許可                                           │
│   ● このセッションのみ                                 │
│   ○ 都度確認                                           │
│                                                         │
│              [キャンセル]  [許可する]                   │
└─────────────────────────────────────────────────────────┘
```

### ダイアログのフィールド

| フィールド | 内容 | 出所 |
|---|---|---|
| App 名 + アイコン | どの App が要求しているか | `akari.toml` の `[app]` |
| 操作の説明 | `reason` パラメータの文字列 | `permission.gate()` の呼び出し元 |
| scope | 要求している scope の識別子 | `permission.gate()` の `scope` |
| プレビュー | `preview` の種類に応じた内容 | Panel Schema / `previewTemplate` |
| ポリシー選択 | 承認ポリシーの選択ラジオボタン | ユーザーが選択 |

---

## 8. 自動承認ポリシー

承認ダイアログでユーザーが選択した**ポリシー**は、Core が保存して次回以降に適用する。

### ポリシー一覧

| ポリシー | 動作 | 用途 |
|---|---|---|
| `"always"` | 同じ App + scope の組み合わせは今後常に自動承認 | 日常的に使う操作（下書き保存など） |
| `"session"` | 現在の Shell セッション中のみ自動承認。次回起動時にリセット | 一時的な作業中の許可 |
| `"ask"` | 毎回承認ダイアログを表示 | 慎重に管理したい操作（送金・削除など） |

### デフォルトポリシー

- `hitl: false` の操作: `"session"` がデフォルト推奨（ダイアログなしで通過）
- `hitl: true` の操作: `"ask"` がデフォルト（毎回確認）。ユーザーが `"always"` に変更可能

### ポリシーの取得・確認

```typescript
import { permission } from "@akari/sdk"

const status = permission.check("mcp:x.post")
console.log(status.policy)  // "always" | "session" | "ask"
console.log(status.granted) // boolean
```

### ポリシーのリセット

ユーザーは AKARI Shell の設定画面（`設定 > App > <App名> > 権限`）から
個別ポリシーをリセットできる。
App コード側からポリシーを直接書き換えることはできない。

---

## 9. 監査

**すべての permission.gate() 通過・拒否は AMP に自動記録される**。
App が明示的に記録する必要はない（Core が代行する）。

### AMP に記録される情報

```typescript
interface PermissionAuditRecord {
  kind: "permission-grant" | "permission-deny"
  app_id: string             // "com.x.sender"
  scope: PermissionScope     // "mcp:x.post"
  reason: string             // permission.gate() の reason パラメータ
  result: "granted" | "denied"
  policy: "always" | "session" | "ask"
  hitl_confirmed: boolean    // ユーザーが HITL ダイアログで確認したか
  timestamp: Date
  session_id: string
}
```

### 監査ログの照会

```typescript
import { amp } from "@akari/sdk"

// 自 App の permission ログを取得
const auditLog = await amp.query({
  kind: "permission-grant",
  filter: { app_id: "com.x.sender" },
})
```

> **注意**: App が照会できるのは**自 App のログのみ**。
> 他 App のログへのアクセスは `amp:read` があっても制限される。

---

## 10. 型定義

```typescript
// @akari/sdk の型定義（抜粋）

/** Permission scope の完全な型 */
type PermissionScope =
  | `pool:${"read" | "write"}`
  | `amp:${"read" | "write"}`
  | `mcp:${string}`
  | `inter-app:${string}`
  | `network:${string}`
  | `oauth:${string}`
  | `filesystem:${"read" | "write"}:${string}`

/** permission.gate() のオプション */
interface PermissionGateOptions {
  scope: PermissionScope
  reason: string
  hitl: boolean
  preview?: "text-summary" | "schedule-summary" | "diff" | "custom-markdown"
  previewTemplate?: string
}

/** permission.check() / request() の戻り値 */
interface PermissionStatus {
  scope: PermissionScope
  granted: boolean
  policy: "always" | "session" | "ask"
  grantedAt?: Date
  expiresAt?: Date
}

/** permission.gate() が throw する例外 */
class PermissionDeniedError extends Error {
  readonly scope: PermissionScope
  readonly reason: "not-declared" | "user-denied" | "policy-denied" | "timeout"
}

/** permission オブジェクト（@akari/sdk からエクスポート） */
interface PermissionAPI {
  gate(options: PermissionGateOptions): Promise<void>
  request(scope: PermissionScope): Promise<PermissionStatus>
  check(scope: PermissionScope): PermissionStatus
  revoke(scope: PermissionScope): Promise<void>
}
```

---

## 11. 使用例

### X Sender — OAuth scope + 投稿の HITL

X（Twitter）への投稿を行う MCP-Declarative App の実装例。

#### `akari.toml`

```toml
[app]
id = "com.x.sender"
name = "X Sender"
tier = "mcp-declarative"
sdk = ">=0.1.0 <1.0"

[mcp]
server = "mcp-servers/x-sender"
tools = ["x.post", "x.schedule", "x.draft"]

[permissions]
external-network = ["api.x.com", "upload.x.com"]
oauth = ["x.com"]
mcp = ["x.post", "x.schedule", "x.draft"]
```

#### `panels/x-sender.schema.json`（HITL 設定抜粋）

```json
{
  "$schema": "akari://panel-schema/v0",
  "layout": "form",
  "fields": [
    { "id": "text", "type": "textarea", "maxLength": 280, "bind": "mcp.x.post.text", "required": true },
    { "id": "media", "type": "pool-picker", "accept": ["image", "video"], "max": 4 }
  ],
  "actions": [
    {
      "id": "post",
      "label": "投稿",
      "kind": "primary",
      "mcp": { "tool": "x.post", "args": { "text": "$text", "media": "$media" } },
      "hitl": { "require": true, "preview": "text-summary" }
    }
  ]
}
```

MCP-Declarative Tier では、Shell が `hitl.require: true` を検出して
`permission.gate({ scope: "mcp:x.post", hitl: true })` を自動的に代行する。

#### 初回連携フロー（Full Tier で同等の処理を書く場合）

```typescript
import { permission } from "@akari/sdk"

export async function onMount() {
  // 初回マウント時に OAuth 連携状態を確認
  const oauthStatus = permission.check("oauth:x.com")
  if (!oauthStatus.granted) {
    // 未連携なら request() で認可フロー開始
    await permission.request("oauth:x.com")
  }
}
```

---

### Notion — write 確認 + 削除の diff プレビュー

Notion への書き込みと削除を行う App の実装例。

#### `akari.toml`

```toml
[app]
id = "com.notion.connector"
name = "Notion"
tier = "mcp-declarative"
sdk = ">=0.1.0 <1.0"

[mcp]
server = "mcp-servers/notion"
tools = ["notion.search", "notion.page.create", "notion.page.update", "notion.page.delete"]

[permissions]
external-network = ["api.notion.com"]
oauth = ["notion.com"]
mcp = ["notion.search", "notion.page.create", "notion.page.update", "notion.page.delete"]
```

#### ページ更新（Full Tier 実装例）

```typescript
import { permission } from "@akari/sdk"

async function updatePage(pageId: string, newContent: string): Promise<void> {
  // 更新は中リスク。HITL は任意だがプレビューで差分を見せる
  await permission.gate({
    scope: "mcp:notion.page.update",
    reason: `Notion ページ（${pageId}）を更新`,
    hitl: true,
    preview: "diff",
  })

  await mcpClient.call("notion.page.update", { pageId, content: newContent })
}
```

#### ページ削除（高リスク + カスタムプレビュー）

```typescript
import { permission } from "@akari/sdk"

async function deletePage(pageId: string, title: string): Promise<void> {
  // 削除は不可逆。必ず HITL + カスタムメッセージで警告
  await permission.gate({
    scope: "mcp:notion.page.delete",
    reason: `Notion ページを完全削除`,
    hitl: true,
    preview: "custom-markdown",
    previewTemplate: `
## 削除するページ

**タイトル**: ${title}
**ページ ID**: ${pageId}

> ⚠️ この操作は元に戻せません。Notion のゴミ箱にも残りません。
    `,
  })

  await mcpClient.call("notion.page.delete", { pageId })
}
```

---

## 12. 関連ドキュメント

| ドキュメント | 関連箇所 |
|---|---|
| **UI API** (`ui-api.md`) | 承認ダイアログを Shell が描画する仕組み。`shell.mountPanel()` との連携 |
| **Memory API** (`memory-api.md`) | AMP への監査ログ記録（§9）。`amp.record()` / `amp.query()` |
| **ADR-010** [ADR-010 (Hub)] | Core の retry / deadletter との関係。`PermissionDeniedError` を retry すべきでないケース |
| **Panel Schema v0** ([HUB-025](https://github.com/Akari-OS/.github/blob/main/VISION.md)) | `action.hitl` の宣言方法、HITL preview 種別の詳細 |
| **App SDK spec** ([HUB-024](https://github.com/Akari-OS/.github/blob/main/VISION.md)) | Permission API の仕様の正典（§6.6）、`[permissions]` 宣言の原典（§6.5） |

---

> **最終更新**: 2026-04-19 / **spec**: AKARI-HUB-024 v0.1.0 (draft)
