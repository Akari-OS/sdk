---
guide-id: AKARI-GUIDE-SDK-TIERS-MCP-DECLARATIVE
version: 0.1.0
status: draft
created: 2026-04-19
updated: 2026-04-19
related-specs: [AKARI-HUB-024, AKARI-HUB-025, AKARI-HUB-005, AKARI-HUB-026, AKARI-HUB-007]
ai-context: claude-code
---

# MCP-Declarative Tier 開発者ガイド / Developer Guide

> **対象読者**: AKARI App を初めて作る開発者、既存 MCP サーバーを AKARI に載せたい開発者
> **前提スキル**: TypeScript 基礎、JSON Schema の読み書き、MCP プロトコルの概念理解
> **関連 spec**: [HUB-024](https://github.com/Akari-OS/.github/blob/main/VISION.md) / [HUB-025](https://github.com/Akari-OS/.github/blob/main/VISION.md) / [HUB-005](https://github.com/Akari-OS/.github/blob/main/VISION.md)

---

## 目次 / Table of Contents

1. [概要 — MCP-Declarative Tier とは](#1-概要--overview)
2. [なぜこの Tier が存在するか](#2-なぜこの-tier-が存在するか--why-this-tier-exists)
3. [前提知識](#3-前提知識--prerequisites)
4. [プロジェクト構造](#4-プロジェクト構造--project-structure)
5. [`akari.toml` — MCP-Declarative 版](#5-akaritoml--mcp-declarative-manifest)
6. [MCP サーバー実装](#6-mcp-サーバー実装--mcp-server-implementation)
7. [`panel.schema.json` の書き方](#7-panelschemajson-の書き方--writing-panel-schema)
8. [i18n — 多言語対応](#8-i18n--internationalization)
9. [認証 — OAuth 2.0 PKCE / API Key](#9-認証--authentication)
10. [オフライン挙動](#10-オフライン挙動--offline-behavior)
11. [実装パターン学習 — Notion / X Sender](#11-実装パターン学習--learning-from-examples)
12. [できないこと / 制約](#12-できないこと--constraints)
13. [昇格パス: MCP-Declarative → Full](#13-昇格パス-mcp-declarative--full)
14. [よくある落とし穴](#14-よくある落とし穴--common-pitfalls)
15. [次に読む](#15-次に読む--whats-next)

---

## 1. 概要 / Overview

**MCP-Declarative Tier** は AKARI App の 2 つの Tier（Full / MCP-Declarative）のうち、**参入コストを 1/10 に抑えた軽量 Tier** です。

開発者が書くのは以下の 2 ファイルだけです：

| ファイル | 役割 |
|---|---|
| **`mcp-servers/<name>/`** | MCP サーバー実装（既存 API のラッパー、または公式 MCP をそのまま参照） |
| **`panel.schema.json`** | UI 宣言（JSON のみ、React コード不要） |

Shell は `panel.schema.json` を受け取り、**汎用 Schema レンダラ**で UI を自動描画します。MCP ツールへの配線も JSON で宣言するだけ。

### iOS App Clips との比喩

Full App と MCP-Declarative App の関係は、iOS の **Full App と App Clips** の関係に相当します。

| | iOS | AKARI |
|---|---|---|
| 重量版 | Full App（任意の Swift UI） | Full App（任意の React Panel） |
| 軽量版 | App Clips（制限付き、即起動） | MCP-Declarative App（JSON 宣言のみ、即載せ） |
| 共通点 | 同じ SDK・同じ審査基準 | 同じ SDK・同じ Permission / Memory / Skill 契約 |
| 違い | UI 自由度とストア審査の重さ | UI 自由度と Manual Review の深度 |

App Clips が「ダウンロード不要でカフェのメニューを表示する」ように、MCP-Declarative App は「自社 API を AKARI に載せるための最短経路」です。

### 動作の全体像

```
ユーザーが Shell のパネルを開く
     ↓
Shell が panel.schema.json を読み込む
     ↓
汎用 Schema レンダラがフォーム・ボタンを描画
     ↓
ユーザーが入力 → アクションボタンを押す
     ↓
HITL ゲート（確認ダイアログ）※ 必要な場合
     ↓
MCP ツール呼び出し（MCP サーバープロセスへ）
     ↓
外部 API → 結果を AMP に記録
```

---

## 2. なぜこの Tier が存在するか / Why This Tier Exists

### 参入コスト 1/10

Full Tier で App を作るには React Panel + Agent 定義 + Skill 実装が必要です。しかし、SNS 投稿・翻訳・外部検索・Notion 書き込みなどの **「外部サービスへの橋渡し」** は、UIとして必要なのは大半が「テキスト入力 + ファイル添付 + ボタン」の組み合わせです。

この単純なUIパターンを Shell が標準 widget として提供することで、**開発者は API の MCP ラッパーだけに集中できます**。

### 既存 OSS MCP の活用

2026年時点で多くのサービスが公式 MCP サーバーを公開しています（Notion、Figma、各種 AI API など）。MCP-Declarative Tier では公式 MCP サーバーを `npm:<package>` で参照するだけで、**自前実装ゼロで AKARI に載せられる**ケースがあります。

```toml
[mcp]
server = "npm:@notionhq/mcp"   # Notion 公式 MCP をそのまま使う
tools  = ["notion.search", "notion.create_page", ...]
```

### エコシステムの雪だるま効果

参入コストが低いほど、AKARI に対応するサービスが増えます。

```
MCP-Declarative の参入コスト低 → サービス対応数増加
    → ユーザーにとっての AKARI の価値向上
    → プラットフォームとしての正当性強化
```

これが「1/10 のコストで 10 倍の速度でエコシステムを広げる」という設計の核心です。

---

## 3. 前提知識 / Prerequisites

### MCP プロトコル

MCP（Model Context Protocol）はツール定義と呼び出しの標準プロトコルです。AKARI の MCP-Declarative Tier は MCP サーバーをプロセスとして起動し、Shell が MCP クライアントとして各ツールを呼び出します。

MCP の基礎は [公式ドキュメント](https://modelcontextprotocol.io/) で確認してください。

### JSON Schema

`panel.schema.json` は JSON Schema（Draft 2020-12）の方言として定義されています。`type` / `required` / `minLength` / `maxLength` / `enum` などの標準キーワードはそのまま使えます。AKARI 拡張（`bind`, `hitl`, `enabled_when` など）は本ガイドで説明します。

### `@modelcontextprotocol/sdk`

MCP サーバーの実装には公式 SDK を使います：

```bash
npm install @modelcontextprotocol/sdk zod
```

zod は MCP ツールの入力スキーマ定義に使います（後述）。

---

## 4. プロジェクト構造 / Project Structure

`akari-app-cli` で雛形を生成します：

```bash
akari-app-cli create my-service --tier mcp-declarative
```

生成されるディレクトリ構造：

```
my-service/
├── akari.toml                    ← App Manifest（必須）
├── mcp-servers/
│   └── my-service/
│       ├── package.json
│       ├── index.ts              ← MCP サーバー実装
│       └── tsconfig.json
├── panels/
│   └── main.schema.json          ← Panel Schema v0 UI 宣言
├── locales/
│   ├── ja.json                   ← 日本語リソース
│   └── en.json                   ← 英語リソース
└── README.md
```

**Full Tier との違い**:

| ディレクトリ | Full | MCP-Declarative |
|---|---|---|
| `panels/*.tsx` | 任意 React コンポーネント | **なし**（JSON Schema のみ） |
| `agents/*.md` | エージェント定義（任意） | **なし** |
| `skills/*.ts` | 公開スキル（任意） | **なし** |
| `mcp-servers/` | 任意 | **必須** |

カテゴリ指定もできます（HUB-005 の 11 カテゴリに対応）：

```bash
akari-app-cli create x-sender --tier mcp-declarative --category publishing
akari-app-cli create notion    --tier mcp-declarative --category documents
akari-app-cli create deepl     --tier mcp-declarative --category translation
```

---

## 5. `akari.toml` — MCP-Declarative Manifest

### 最小の例（X Sender から）

```toml
[app]
id       = "com.akari.x-sender"
name     = "X Sender"
version  = "0.2.0"
tier     = "mcp-declarative"     # ← MCP-Declarative Tier 宣言（必須）
category = "publishing"          # ← HUB-005 カテゴリ enum
sdk      = ">=0.1.0 <1.0"        # ← 互換 Core SDK バージョン範囲

[mcp]
server = "mcp-servers/x"         # ← ローカルプロセス（npm run で起動）
tools  = ["x.post", "x.schedule", "x.draft_save", "x.get_me"]

[panels]
main = { title = "X", schema = "panels/x-sender.schema.json" }

[permissions]
external-network = ["api.x.com", "api.twitter.com"]
oauth            = ["x.com"]
keychain         = ["com.akari.x-sender"]
pool             = ["read", "write"]
amp              = ["write"]
```

### 公式 MCP を使う場合（Notion から）

```toml
[mcp]
# npm パッケージの公式 MCP を直接参照
server = "npm:@notionhq/mcp"
tools  = [
  "notion.search",
  "notion.query_database",
  "notion.create_page",
  "notion.update_page_properties",
  "notion.append_block_children",
  "notion.retrieve_page",
  "notion.retrieve_database",
  "notion.list_users",
  "notion.retrieve_block_children",
  "notion.delete_block",
]
```

公式 MCP がある場合は `server = "npm:<package>"` で参照するだけです（自前実装ゼロ）。

### OAuth 設定を `akari.toml` に宣言

```toml
[oauth.notion]
provider      = "notion.com"
grant_type    = "authorization_code"
pkce          = true
scope         = ["read_content", "update_content", "insert_content"]
token_storage = "keychain:com.akari.notion"
```

### 複数 Panel

```toml
[panels]
main     = { title = "Notion",          schema = "panels/notion-main.schema.json" }
database = { title = "Database View",   schema = "panels/notion-database.schema.json" }
settings = { title = "Notion Settings", schema = "panels/notion-settings.schema.json" }
```

---

## 6. MCP サーバー実装 / MCP Server Implementation

公式 `@modelcontextprotocol/sdk` を使います。

### 基本構造（`mcp-servers/x/index.ts`）

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const server = new McpServer({
  name: "x-sender",
  version: "0.2.0",
})

// ツール定義
server.tool(
  "x.post",
  "X に単発テキストを即時投稿する",
  {
    text:    z.string().max(280).describe("投稿本文"),
    media:   z.array(z.string()).max(4).optional().describe("Pool item id の配列"),
    dry_run: z.boolean().default(false).describe("true なら API を叩かずログのみ"),
  },
  async ({ text, media, dry_run }) => {
    if (dry_run) {
      return { content: [{ type: "text", text: `[dry-run] post: "${text}"` }] }
    }
    const result = await postToX({ text, media })
    return {
      content: [{ type: "text", text: `投稿しました: ${result.url}` }],
      _meta: { tweet_id: result.id, tweet_url: result.url },
    }
  }
)

server.tool(
  "x.schedule",
  "X に単発テキストを予約投稿する",
  {
    text:       z.string().max(280),
    publish_at: z.string().datetime().describe("ISO 8601 UTC"),
    media:      z.array(z.string()).max(4).optional(),
  },
  async ({ text, publish_at, media }) => {
    const result = await scheduleToX({ text, publish_at, media })
    return { content: [{ type: "text", text: `予約登録しました: ${publish_at}` }] }
  }
)

server.tool(
  "x.draft_save",
  "投稿前の下書きを Pool に保存する",
  {
    text:  z.string().max(280),
    media: z.array(z.string()).optional(),
  },
  async ({ text, media }) => {
    // Pool への保存は @akari/sdk 経由
    const { pool } = await import("@akari/sdk")
    const id = await pool.put({
      bytes: Buffer.from(text),
      mime: "text/plain",
      tags: ["draft", "x-sender"],
    })
    return { content: [{ type: "text", text: `下書きを保存しました: ${id}` }] }
  }
)

server.tool(
  "x.get_me",
  "現在認証されている X アカウント情報を返す",
  {},
  async () => {
    const user = await getXMe()
    return { content: [{ type: "text", text: `@${user.username}` }] }
  }
)

// トランスポート起動
const transport = new StdioServerTransport()
await server.connect(transport)
```

### AMP への記録（投稿成功後）

```typescript
import { amp } from "@akari/sdk"

// x.post の成功ハンドラ内
await amp.record({
  kind:    "publish-action",
  content: `X に投稿しました: ${result.url}`,
  goal_ref: context.goal_ref ?? crypto.randomUUID(), // goal_ref 必須
  metadata: {
    target:       "x",
    tweet_id:     result.id,
    tweet_url:    result.url,
    published_at: new Date().toISOString(),
  },
})
```

`goal_ref` はエージェントからの handoff で渡されるか、新規生成します。AMP の全レコードには `goal_ref` が必須です（HUB-024 §6.6(2) Memory API）。

### エラーハンドリング

MCP ツールのエラーは構造化して返します：

```typescript
server.tool("x.post", "...", { ... }, async ({ text }) => {
  try {
    const result = await postToX({ text })
    return { content: [{ type: "text", text: `OK: ${result.url}` }] }
  } catch (err) {
    // 一時的なエラー（レート制限など）
    if (err instanceof RateLimitError) {
      return {
        isError: true,
        content: [{
          type: "text",
          text: `レート制限: ${err.retryAfter}秒後にリトライしてください`,
        }],
        _meta: { error_type: "rate_limit", retry_after: err.retryAfter },
      }
    }
    // 永続的なエラー（認証切れなど）
    if (err instanceof AuthError) {
      return {
        isError: true,
        content: [{ type: "text", text: "認証が必要です。再認証してください。" }],
        _meta: { error_type: "auth_required" },
      }
    }
    throw err // 未知のエラーは throw で AKARI Core に委譲
  }
})
```

AKARI Core はエラー種別を解釈し、`rate_limit` は自動リトライ、`auth_required` は再認証プロンプト表示に振り分けます。

### `dry_run` モード

すべての書き込みツールに `dry_run: boolean` パラメータを実装することを推奨します。`akari app certify` の Contract Test はデフォルトで `dry_run: true` で実行されます。

---

## 7. `panel.schema.json` の書き方 / Writing Panel Schema

### 最小形（X Sender の投稿フォーム）

```json
{
  "$schema": "akari://panel-schema/v0",
  "title": "{{t:panel.title}}",
  "layout": "form",
  "fields": [
    {
      "id":          "text",
      "type":        "textarea",
      "label":       "{{t:field.text}}",
      "placeholder": "{{t:field.text.placeholder}}",
      "maxLength":   280,
      "bind":        "mcp.x.post.text",
      "required":    true,
      "helperText":  "{{t:field.text.helper}}"
    },
    {
      "id":     "media",
      "type":   "pool-picker",
      "label":  "{{t:field.media}}",
      "accept": ["image", "video"],
      "max":    4,
      "bind":   "mcp.x.post.media"
    },
    {
      "id":    "when",
      "type":  "datetime-optional",
      "label": "{{t:field.schedule}}",
      "bind":  "mcp.x.schedule.publish_at"
    }
  ],
  "actions": [
    {
      "id":    "post",
      "label": "{{t:action.post}}",
      "kind":  "primary",
      "mcp": {
        "tool": "x.post",
        "args": { "text": "$text", "media": "$media" }
      },
      "hitl": {
        "require": true,
        "preview": "custom-markdown",
        "preview_template": "**投稿内容**\n\n{{$text}}\n\n{{#if $media}}添付: {{$media.length}} 件{{/if}}"
      },
      "enabled_when": "$text != null && $text.length > 0 && $when == null",
      "on_success": { "toast": "{{t:toast.posted}}", "clear_fields": ["text", "media", "when"] },
      "on_error":   { "toast": "{{t:toast.error}}: {{error}}" }
    },
    {
      "id":    "schedule",
      "label": "{{t:action.schedule}}",
      "kind":  "secondary",
      "mcp": {
        "tool": "x.schedule",
        "args": { "text": "$text", "publish_at": "$when", "media": "$media" }
      },
      "hitl": { "require": true, "preview": "schedule-summary" },
      "enabled_when": "$text != null && $text.length > 0 && $when != null",
      "on_success": { "toast": "{{t:toast.scheduled}}", "clear_fields": ["text", "media", "when"] }
    },
    {
      "id":    "draft",
      "label": "{{t:action.draft}}",
      "kind":  "ghost",
      "mcp":   { "tool": "x.draft_save", "args": { "text": "$text", "media": "$media" } },
      "enabled_when": "$text != null && $text.length > 0",
      "on_success": { "toast": "{{t:toast.draft_saved}}" }
    }
  ]
}
```

### Widget Catalog（v0 標準セット）

HUB-025 §6.2 で定義されている標準 widget の一覧です：

| カテゴリ | Widget | 典型用途 |
|---|---|---|
| テキスト | `text` / `textarea` / `password` / `email` / `url` | 入力フォーム |
| 数値 | `number` / `slider` / `stepper` | 件数・数量 |
| 選択 | `select` / `multi-select` / `radio` / `checkbox` / `toggle` | 列挙値の選択 |
| 日時 | `date` / `time` / `datetime` / `datetime-optional` / `duration` | 予約・期限 |
| **AKARI 固有** | `pool-picker` / `amp-query` / `app-picker` / `agent-picker` | 記憶層参照 |
| Documents | `rich-text-editor` / `doc-outline-tree` / `sheet-row-picker` / `cell-range-picker` / `slide-template-picker` / `slide-preview` | Office 系操作 |
| ファイル | `file-upload` / `image-preview` / `video-preview` | 添付・プレビュー |
| 表示 | `markdown` / `badge` / `stat` / `progress` / `image` / `divider` | 静的表示 |
| 構造 | `tabs` / `accordion` / `split` / `group` / `repeater` | レイアウト |
| データ | `table` / `list` / `card-grid` | コレクション |
| Action | `button` / `link` / `menu` | アクショントリガ |

### Binding 規約

`bind` は field の値の出所・書き込み先を宣言します：

| パターン | 書式 | 意味 |
|---|---|---|
| MCP 引数 | `mcp.<tool>.<param>` | 指定 MCP ツールの引数にバインド |
| Pool | `pool.<query_id>` | Pool 検索結果を初期値に |
| AMP | `amp.<record_kind>.<field>` | AMP レコードから初期値 / 保存先 |
| 状態 | `state.<key>` | Panel ローカル state（揮発） |
| 定数 | `const.<value>` | 固定値 |

field 間の参照は `$<field_id>` 記法で行います（`enabled_when` / `visible_when` / `args` 内など）。

### Layout の種類

```json
"layout": "form"       // 縦並びフォーム（既定）
"layout": "tabs"       // タブ分割（fields[].tab で所属指定）
"layout": "split"      // 左右 2 ペイン
"layout": "dashboard"  // グリッド配置（card-grid 主体）
"layout": "list"       // master-detail 一覧
```

Notion App の Database View のような複数 tab 構成の例：

```json
{
  "$schema": "akari://panel-schema/v0",
  "title": "Notion",
  "layout": "tabs",
  "tabs": [
    { "id": "db-query",    "label": "{{t:tab.db_query}}" },
    { "id": "page-editor", "label": "{{t:tab.page_editor}}" },
    { "id": "pool-import", "label": "{{t:tab.pool_import}}" }
  ],
  "fields": [
    {
      "id": "db_id", "tab": "db-query",
      "type": "select",
      "label": "{{t:db.select_label}}",
      "bind": "mcp.notion.query_database.database_id",
      "options_source": "mcp.notion.list_databases"
    },
    {
      "id": "db_results", "tab": "db-query",
      "type": "table",
      "bind": "state.db_results",
      "visible_when": "$db_results != null",
      "read_only": true
    }
    // ...
  ]
}
```

### Action 規約

```json
{
  "id": "create_page",
  "label": "{{t:action.create_page}}",
  "kind": "primary",
  "mcp": {
    "tool": "notion.create_page",
    "args": {
      "parent":     { "database_id": "$page_parent_db" },
      "properties": { "title": "$page_title", "Status": "$page_status" },
      "children":   "$page_body"
    }
  },
  "hitl": {
    "require": true,
    "preview": "custom-markdown",
    "preview_template": "### 新規ページ作成の確認\n\n**タイトル**: {{page_title}}\n**DB**: {{page_parent_db}}"
  },
  "enabled_when": "$page_parent_db != null && $page_title != null",
  "visible_when": "$page_source_mode == 'new'",
  "on_success": { "toast": "ページを作成しました" },
  "on_error":   { "toast": "作成に失敗しました: {{error}}" }
}
```

**`kind` の種類**: `primary`（主要アクション）/ `secondary`（補助）/ `destructive`（削除系）/ `ghost`（目立たせない）

### HITL Preview の種類

| `preview` 値 | 表示内容 | 典型用途 |
|---|---|---|
| `text-summary` | text 系 field の要約 | SNS 投稿確認 |
| `schedule-summary` | 日時・繰り返し条件 | 予約投稿 |
| `diff` | before / after 差分 | 既存コンテンツ更新 |
| `custom-markdown` | `preview_template` で指定した markdown | 削除確認・複雑な操作 |

**HITL が必須なアクション**（HUB-005 §6.5）：

- Publishing 系: 投稿・予約・削除
- Documents 系: 共有ページの上書き・削除・外部公開
- Commerce 系: 決済・発送・返金
- Notification 系: 不特定多数への broadcast
- Storage 系: 削除・外部共有

### App 間 handoff の宣言

```json
{
  "id": "handoff_to_writer",
  "label": "{{t:action.handoff_writer}}",
  "kind": "secondary",
  "handoff": {
    "to":      "com.akari.writer",
    "intent":  "edit-from-notion-page",
    "payload": {
      "notion_page_ref": "$page_picker",
      "draft_content":   "$page_body"
    }
  },
  "visible_when": "$page_source_mode == 'existing' && $page_picker != null"
}
```

`mcp` と `handoff` は二者択一（同じアクションに両方を書けません）。

### `enabled_when` / `visible_when` の式言語

対応演算子: `==` / `!=` / `&&` / `||` / `!`（任意 JS 実行は禁止、HUB-025 §9 参照）

```json
"enabled_when": "$text != null && $text.length > 0 && $when == null"
"visible_when": "$page_source_mode == 'existing' && $page_picker != null"
```

---

## 8. i18n / Internationalization

### `{{t:key}}` 記法

label / placeholder / helperText / toast などすべての表示文字列は `{{t:key}}` で外部化します：

```json
{
  "label":       "{{t:field.text}}",
  "placeholder": "{{t:field.text.placeholder}}",
  "helperText":  "{{t:field.text.helper}}"
}
```

### ロケールファイル

`locales/ja.json`（必須）と `locales/en.json`（推奨）を同梱します：

```json
// locales/ja.json
{
  "panel.title":            "X に投稿",
  "field.text":             "本文",
  "field.text.placeholder": "いまどうしてる？",
  "field.text.helper":      "280 文字以内",
  "field.media":            "添付（画像 / 動画）",
  "field.schedule":         "予約日時",
  "field.schedule.placeholder": "空欄 = 即時投稿",
  "action.post":            "投稿",
  "action.schedule":        "予約投稿",
  "action.draft":           "下書き保存",
  "toast.posted":           "X に投稿しました",
  "toast.scheduled":        "予約投稿を登録しました",
  "toast.draft_saved":      "下書きを Pool に保存しました",
  "toast.error":            "エラーが発生しました"
}
```

```json
// locales/en.json
{
  "panel.title":            "Post to X",
  "field.text":             "Content",
  "field.text.placeholder": "What's happening?",
  "field.text.helper":      "Up to 280 characters",
  "field.media":            "Attach (image / video)",
  "field.schedule":         "Schedule",
  "field.schedule.placeholder": "Leave blank for instant post",
  "action.post":            "Post",
  "action.schedule":        "Schedule",
  "action.draft":           "Save Draft",
  "toast.posted":           "Posted to X",
  "toast.scheduled":        "Scheduled post registered",
  "toast.draft_saved":      "Draft saved to Pool",
  "toast.error":            "An error occurred"
}
```

Shell が現在のロケールで解決します。未定義キーは英語にフォールバック、英語もなければ key 文字列をそのまま表示します（開発時に気づけるようにするため）。

### `panel.schema.json` 内にインラインで埋め込む方法

`notion-app-panel.schema.json` のように、ロケールファイルを別ファイルにせず Schema 内の `locales` キーに埋め込む方法も使えます：

```json
{
  "$schema": "akari://panel-schema/v0",
  "locales": {
    "ja": { "field.text": "本文" },
    "en": { "field.text": "Content" }
  }
}
```

小規模な App では外部ファイルより管理しやすい場合があります。

---

## 9. 認証 / Authentication

### OAuth 2.0 PKCE（推奨）

SNS / Analytics / Storage など OAuth を使うサービスの認証フロー：

```
ユーザーが初回起動
     ↓
Shell: Permission API → "X への投稿権限を求めています" [許可する]
     ↓
MCP サーバー: OAuth 2.0 PKCE フロー起動 → ブラウザで認証ページ
     ↓
コールバック受信 → access token + refresh token
     ↓
Keychain に保存（service: com.akari.<app-id>）
     ↓
以降: MCP サーバーが自動でトークンを使いまわし
     token 失効 → 自動更新（refresh token で）
     refresh token 失効 → AKARI Core → Shell に再認証プロンプト
```

`akari.toml` での宣言（X Sender の例）：

```toml
[permissions]
oauth    = ["x.com"]
keychain = ["com.akari.x-sender"]

[oauth.x]
provider      = "x.com"
grant_type    = "authorization_code"
pkce          = true
scope         = ["tweet.read", "tweet.write", "users.read"]
token_storage = "keychain:com.akari.x-sender"
```

Keychain レイアウト：

| フィールド | service name | account |
|---|---|---|
| Access Token | `com.akari.x-sender` | `access_token` |
| Refresh Token | `com.akari.x-sender` | `refresh_token` |
| Token Expiry | `com.akari.x-sender` | `token_expiry` |

### API Key（Asset Generation / Translation 系）

```toml
[permissions]
keychain = ["com.akari.deepl"]
```

MCP サーバー内での読み取り：

```typescript
import { keychain } from "@akari/sdk"

const apiKey = await keychain.get({
  service: "com.akari.deepl",
  account: "api_key",
})
```

設定 Panel で API キーを入力・保存するフォーム例：

```json
{
  "id": "api_key_input",
  "type": "password",
  "label": "{{t:settings.api_key}}",
  "bind": "keychain.com.akari.deepl.api_key",
  "helperText": "{{t:settings.api_key_helper}}"
}
```

### Permission API との連携

実行時の権限確認は Permission API で行います。MCP-Declarative Tier では多くの場合、HITL ゲートが Permission API を暗黙的に呼び出しますが、明示的に呼び出すこともできます：

```typescript
import { permission } from "@akari/sdk"

// HITL 必須アクション（外部公開）
await permission.gate({
  action: "external-network.post",
  reason: "X に投稿",
  hitl: true,
})

// HITL 不要アクション（内部保存）
await permission.gate({
  action: "pool.write",
  reason: "下書きを保存",
  hitl: false,
})
```

全 gate 通過は AMP に監査ログとして自動記録されます。

---

## 10. オフライン挙動 / Offline Behavior

MCP-Declarative App は **「書き込み系だけネットワーク依存、読み書き先行は Pool キャッシュ」** の方針で設計します。

### 基本原則（X Sender の例）

| 操作 | オフライン挙動 |
|---|---|
| 本文入力・編集 | 完全動作（Panel Schema フォーム） |
| `x.draft_save` | 完全動作（Pool への書き込み） |
| `x.post` / `x.schedule` | ネットワーク必須 → エラートースト + 下書き保存の提案 |
| `x.get_me` | キャッシュ表示（エラーを無視） |

### Pool キャッシュ

読み取り系 MCP ツールの結果は Pool にキャッシュします：

```typescript
// MCP サーバー内での Pool キャッシュ
import { pool } from "@akari/sdk"

const cacheKey = `notion-db-cache:${databaseId}`
const cached = await pool.search({ tags: [cacheKey], sort: "latest" })

if (cached.length > 0 && isWithin24h(cached[0].createdAt)) {
  return cached[0].data  // キャッシュから返す
}

const fresh = await notionAPI.queryDatabase(databaseId)
await pool.put({
  bytes: Buffer.from(JSON.stringify(fresh)),
  mime: "application/json",
  tags: [cacheKey, "notion-cache"],
})
return fresh
```

Panel Schema 側でのオフライン表示：

```json
{
  "id": "offline_badge",
  "type": "badge",
  "label": "{{t:badge.offline_cache}}",
  "visible_when": "$is_offline == true"
}
```

### 書き込みキュー

Notion App のオフライン書き込みキュー例：

```
オフライン時に create_page を実行しようとすると：
  1. "オフライン中です。書き込みを Pool に下書き保存しますか？" トーストを表示
  2. ユーザーが承認 → Pool に tags: ["notion-pending-write"] で保存
  3. オンライン復帰後 → AKARI Core のジョブキュー経由で自動実行
  4. HITL 再確認（「オフライン中に作成したページです。送信しますか？」）
```

### 同期競合の解決方針

オフライン中に Notion 側で同一ページが更新された場合：

- **読み取り系**: 「更新がありました」バッジを表示
- **書き込み系**: 競合検出 → HITL で「上書き / キャンセル / 差分確認」を選択
- `update_page_properties` の競合は Last Write Wins とし、AMP に記録

---

## 11. 実装パターン学習 / Learning from Examples

### HUB-007 X Sender（Publishing カテゴリ）

最もシンプルな MCP-Declarative App の例です。ポイント：

1. **`panel.schema.json` が 3 field + 3 action だけで完結**
   - `textarea`（本文）+ `pool-picker`（添付）+ `datetime-optional`（予約）
   - `post`（即時）/ `schedule`（予約）/ `draft`（下書き）の 3 アクション

2. **HITL が `custom-markdown` preview で内容確認**

   ```json
   "hitl": {
     "require": true,
     "preview": "custom-markdown",
     "preview_template": "**投稿内容**\n\n{{$text}}\n\n{{#if $media}}添付: {{$media.length}} 件{{/if}}"
   }
   ```

3. **`enabled_when` でボタンを文脈的に切り替え**

   ```json
   "enabled_when": "$text != null && $text.length > 0 && $when == null"  // 「投稿」ボタン
   "enabled_when": "$text != null && $text.length > 0 && $when != null"  // 「予約投稿」ボタン
   ```

4. **Writer からの handoff を受け取る**

   ```
   Writer → app.handoff({ to: "com.akari.x-sender", intent: "post-draft",
                          payload: { draft_ref: <ampId>, assets: [<poolId>] } })
   X Sender Panel → text / media フィールドに自動展開
   ```

全文は [spec-x-sender-phase0.md](../examples/x-sender/) / 実 Schema は `panels/x-sender.schema.json`（HUB-007 §5）を参照。

### HUB-026 Notion（Documents カテゴリ）

より複雑な MCP-Declarative App の例です。ポイント：

1. **公式 MCP を `npm:@notionhq/mcp` で参照（自前実装ゼロ）**

   ```toml
   [mcp]
   server = "npm:@notionhq/mcp"
   tools  = ["notion.search", "notion.create_page", ...]
   ```

2. **`layout: "tabs"` で 4 画面構成**
   - DB Query / Page Editor / Pool → Notion（Export）/ Notion → Pool（Import）

3. **Documents カテゴリ固有の HITL ポリシー**

   | アクション | preview 種別 |
   |---|---|
   | 新規ページ作成 | `text-summary` |
   | 既存ページ追記 | `diff` |
   | プロパティ更新 | `diff` |
   | ブロック削除 | `custom-markdown`（全文表示） |

4. **クロスオーバー（Writer / Research との連携）**

   ```
   Writer → Notion App handoff（下書き → Notion ページ化）
   Research → Notion App handoff（AMP 収集結果 → database 行追加）
   Notion → Pool（database → Pool 素材として取り込み）
   ```

5. **`options_source` で動的な選択肢をバインド**

   ```json
   {
     "type":           "select",
     "bind":           "mcp.notion.query_database.database_id",
     "options_source": "mcp.notion.list_databases"
   }
   ```

実 Schema は [notion-app-panel.schema.json](../examples/notion/panel.schema.json) を参照。全文仕様は [spec-notion-reference.md](../examples/notion/) (HUB-026) を参照。

---

## 12. できないこと / Constraints

MCP-Declarative Tier には以下の制約があります。これらが必要な場合は Full Tier に昇格してください（次章参照）。

### UI 面での制約

| 制約 | 理由 | Full Tier での代替 |
|---|---|---|
| 任意の React コンポーネント | 汎用レンダラのみ | Full App の Panel（`.tsx`） |
| カスタムアニメーション | Shell Theme が管理 | Full App |
| Canvas / WebGL 描画 | Shell レンダラ対象外 | Full App |
| 独自フォント・カスタム配色 | Shell Theme 統一 | Full App |

### ロジック面での制約

| 制約 | 理由 | 代替手段 |
|---|---|---|
| 自前 DB（SQLite / IndexedDB 等） | **App は自前 DB を持たない**（HUB-024 Guidelines §6.7） | Pool / AMP 経由 |
| 他 App への直接呼び出し | 記憶層経由が必須 | Inter-App API（Pool / AMP ID 渡し） |
| リアルタイム描画（60fps 更新） | Schema レンダラの更新サイクルに依存 | Full App |
| App 内部 state の永続化 | App は state を持たない | Pool / AMP に書く |

### セキュリティ制約

- credentials（OAuth token / API key）は **必ず Keychain 経由**（平文保存禁止）
- `external-network` に宣言していない URL への通信は Core が遮断します
- HITL 必須アクションで `hitl.require: false` にすると `akari app certify` が reject します

---

## 13. 昇格パス: MCP-Declarative → Full

MCP-Declarative で始めて、UI 要件が育ったら Full に昇格できます。

### 昇格の判断基準

以下のいずれかに該当したら Full Tier への移行を検討してください：

- カスタム widget（v0 標準セットにない UI）が必要
- Canvas / リアルタイム描画（動画プレビュー等）が必要
- Panel のインタラクションが複雑で JSON では表現しきれない
- カスタムエージェント定義（`agents/` 配下）が必要
- 他 App に公開するスキル（`skills/` 配下）が必要

### 昇格手順（概要）

1. `akari.toml` の `tier` を `"full"` に変更
2. `panels/` に React Panel（`.tsx`）を追加
3. `<SchemaPanel schema={...} />` で既存の Panel Schema を React 内で再利用可能
4. `akari app certify` を再実行（Manual Review が追加される）

```tsx
// Full Tier になっても既存の Schema をそのまま流用できる
import { SchemaPanel } from "@akari/sdk/react"
import mainSchema from "./panels/main.schema.json"

export function NotionPanel() {
  return (
    <div>
      {/* 新しいカスタム React コンポーネント */}
      <MyCustomRichEditor />
      {/* 既存の Schema フォームはそのまま利用 */}
      <SchemaPanel schema={mainSchema} onSubmit={handleSubmit} />
    </div>
  )
}
```

詳細は [Full Tier Migration Guide](./full-tier.md)（今後公開予定）を参照。

---

## 14. よくある落とし穴 / Common Pitfalls

### pitfall 1: `goal_ref` を付けずに AMP に記録する

```typescript
// 悪い例
await amp.record({ kind: "publish-action", content: "投稿しました" })

// 良い例
await amp.record({
  kind:     "publish-action",
  content:  "投稿しました",
  goal_ref: context.goal_ref ?? crypto.randomUUID(),  // 必須
})
```

`goal_ref` なしの AMP レコードは `akari app certify` で警告が出ます。

### pitfall 2: Pool / AMP ID ではなく生データを handoff で渡す

```typescript
// 悪い例
await app.handoff({
  to: "com.akari.writer",
  payload: { text: "本文の全文..." },  // bytes を直送している
})

// 良い例
const poolId = await pool.put({ bytes: Buffer.from(text), mime: "text/plain" })
await app.handoff({
  to: "com.akari.writer",
  payload: { draft_ref: ampRecordId, assets: [poolId] },  // ID のみ
})
```

### pitfall 3: `hitl.require: true` が必要なアクションを省略する

SNS 投稿・外部書き込み・削除系アクションは必ず `hitl.require: true` が必要です。省略すると `akari app certify` で reject されます。

### pitfall 4: `external-network` を `akari.toml` に宣言せずネットワーク通信する

```toml
[permissions]
external-network = ["api.x.com"]  # 宣言必須
```

宣言なしで通信しようとすると Core が遮断します。ワイルドカード（`*.example.com`）は使えません（セキュリティ上）。

### pitfall 5: App 内に自前 DB を持つ

```typescript
// 悪い例
import Database from "better-sqlite3"
const db = new Database("my-app.db")  // 禁止！

// 良い例
import { pool, amp } from "@akari/sdk"
await pool.put({ bytes, mime, tags: ["my-data"] })
await amp.record({ kind: "my-record", content: "...", goal_ref: "..." })
```

自前 DB は `akari app certify` の Automated Lint で検出されます。

### pitfall 6: `options_source` が動的なのに `options` を静的に書く

```json
// 悪い例（DB の選択肢が固定になってしまう）
{ "type": "select", "options": [{ "value": "db1", "label": "DB 1" }] }

// 良い例（MCP ツールから動的に取得）
{ "type": "select", "options_source": "mcp.notion.list_databases" }
```

### pitfall 7: Panel Schema の `$schema` を省略する

```json
{
  "$schema": "akari://panel-schema/v0",  // 省略すると certify で警告
  "title": "...",
  ...
}
```

---

## 15. 次に読む / What's Next

### API リファレンス

- **[UI API / Shell API](../../api/ui-api.md)**（今後公開予定）: `shell.mountPanel` / `shell.onSelection` / `shell.onFocus`
- **[Permission API](../../api/permission-api.md)**（今後公開予定）: `permission.gate` / 監査ログ
- **[Memory API（Pool / AMP）](../../api/memory-api.md)**（今後公開予定）: `pool.put` / `pool.search` / `amp.record` / `amp.query`
- **[Inter-App API](../../api/inter-app-api.md)**（今後公開予定）: `app.handoff`

### 仕様書

- **[HUB-024 App SDK](https://github.com/Akari-OS/.github/blob/main/VISION.md)**: Tier 定義 / 7 API / Certification / Toolchain
- **[HUB-025 Panel Schema v0](https://github.com/Akari-OS/.github/blob/main/VISION.md)**: Widget Catalog / Binding / Action / Validation
- **[HUB-005 Declarative Capability Apps](https://github.com/Akari-OS/.github/blob/main/VISION.md)**: 11 カテゴリ / 共通パターン / Reference Implementation 一覧

### 参考実装

- **[HUB-007 X Sender（Publishing）](../examples/x-sender/)**: シンプルな投稿 App の全仕様
- **[HUB-026 Notion（Documents）](../examples/notion/)**: 公式 MCP 活用・複数 tab・クロスオーバーの全仕様
- **[Notion Panel Schema（実 JSON）](../examples/notion/panel.schema.json)**: 4-tab 構成の実際の Panel Schema

### Certification

- **[App Certification Guide](../certification.md)**（今後公開予定）: `akari app certify` の実行方法と各検証項目の詳細

### Full Tier

- **[Full Tier Guide](./full-tier.md)**（今後公開予定）: React Panel / カスタムエージェント / Skill 実装
- **[Migration Guide: MCP-Declarative → Full](../migration/mcp-declarative-to-full.md)**（今後公開予定）

---

*このガイドは AKARI App SDK spec（HUB-024 / HUB-025 / HUB-005 / HUB-026 / HUB-007）を元に作成しています。spec との差異がある場合は spec が正とします。*
