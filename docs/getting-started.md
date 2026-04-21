---
title: Getting Started — 最初の App を 5 分で作る
updated: 2026-04-19
related: [HUB-024, HUB-025, HUB-007]
---

# Getting Started — 最初の App を 5 分で作る / Build Your First App in 5 Minutes

> MCP-Declarative Tier で「Hello App」を作り、AKARI Shell で動かすまでのチュートリアル。
> React・Rust・独自 DB は一切不要。MCP サーバー + JSON だけで始める。

---

## 前提条件 / Prerequisites

| 要件 | 確認方法 |
|---|---|
| Node.js 18 以上 | `node --version` |
| AKARI Shell インストール済み | `akari --version` |
| `@akari/sdk` CLI インストール済み | `npx akari-app-cli --version` |
| OAuth アプリ作成（外部サービス連携時のみ） | 各サービスの開発者コンソール |

> **Note**: 本チュートリアルはネットワーク不要のデモ App を作る。
> 外部 API 連携は [Cookbook](./cookbook/) を参照。

---

## Step 1: 雛形生成 / Scaffold the App

```bash
npx akari-app-cli create my-first-app --tier mcp-declarative
cd my-first-app
```

生成されるディレクトリ構造：

```
my-first-app/
├── akari.toml                    ← App Manifest（必須）
├── mcp-server/
│   └── index.ts                  ← MCP サーバー実装
├── panels/
│   └── main.schema.json          ← Panel Schema v0（宣言的 UI）
├── locales/
│   ├── ja.json                   ← 日本語ラベル
│   └── en.json                   ← 英語ラベル
├── tests/
│   └── contract/                 ← App Contract Test
└── README.md
```

---

## Step 2: `akari.toml` を編集する / Edit the Manifest

生成された `akari.toml` を開き、`category` と `permissions` を設定する。

```toml
[app]
id       = "com.yourname.my-first-app"   # ← 逆ドメイン記法
name     = "My First App"
version  = "0.1.0"
tier     = "mcp-declarative"
category = "research"                     # ← 11 カテゴリから選ぶ
sdk      = ">=0.1.0 <1.0"

[mcp]
server = "mcp-server"                        # ← index.ts のディレクトリ
tools  = ["hello.greet"]                     # ← Step 4 で実装するツール

[panels]
main = { title = "Hello", schema = "panels/main.schema.json" }

[permissions]
pool = ["read", "write"]                     # Pool への読み書き
amp  = ["write"]                             # AMP への記録
# external-network = false                   # ← デモなのでオフラインで動く
```

**`category` の選択肢**（HUB-005 v0.2 §6.2）:

```
publishing | documents | design | asset-gen | research
translation | analytics | notification | storage | commerce | community
```

---

## Step 3: `panel.schema.json` に Widget を追加する / Add a Widget

`panels/main.schema.json` を開き、1 つの入力フィールドと 1 つのボタンを追加する：

```json
{
  "$schema": "akari://panel-schema/v0",
  "title": "{{t:panel.title}}",
  "layout": "form",
  "fields": [
    {
      "id":          "name",
      "type":        "text",
      "label":       "{{t:field.name}}",
      "placeholder": "{{t:field.name.placeholder}}",
      "required":    true,
      "bind":        "mcp.hello.greet.name"
    }
  ],
  "actions": [
    {
      "id":    "greet",
      "label": "{{t:action.greet}}",
      "kind":  "primary",
      "mcp": {
        "tool": "hello.greet",
        "args": { "name": "$name" }
      },
      "enabled_when": "$name != null && $name.length > 0",
      "on_success":   { "toast": "{{t:toast.greeted}}" },
      "on_error":     { "toast": "{{t:toast.error}}: {{error}}" }
    }
  ]
}
```

`locales/ja.json` にラベルを追加：

```json
{
  "panel.title":            "Hello App",
  "field.name":             "あなたの名前",
  "field.name.placeholder": "例: 田中 太郎",
  "action.greet":           "挨拶する",
  "toast.greeted":          "挨拶しました！",
  "toast.error":            "エラーが発生しました"
}
```

> **利用可能な Widget 一覧**（HUB-025 §6.2）は [Panel Schema 概念ガイド](./concepts/architecture-map.md#panel-schema) を参照。

---

## Step 4: MCP サーバーに Tool を実装する / Implement the MCP Tool

`mcp-server/index.ts` を開き、`hello.greet` ツールを追加する：

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { amp } from "@akari/sdk"

const server = new McpServer({
  name: "my-first-app",
  version: "0.1.0",
})

// hello.greet ツールの実装
server.tool(
  "hello.greet",
  "指定した名前に挨拶する",
  {
    name:     z.string().describe("挨拶する相手の名前"),
    goal_ref: z.string().optional().describe("AMP ゴール参照"),
  },
  async ({ name, goal_ref }) => {
    const message = `こんにちは、${name}さん！AKARI の世界へようこそ。`

    // AMP にアクションを記録（goal_ref は必須の推奨）
    await amp.record({
      kind:     "action",
      content:  `hello.greet を実行: ${name}`,
      goal_ref: goal_ref ?? "my-first-app-demo",
    })

    return {
      content: [{ type: "text", text: message }],
    }
  }
)

// 起動
const transport = new StdioServerTransport()
await server.connect(transport)
```

**原則（HUB-024 §6.6）**:

- MCP ツールは**冪等**を推奨（同じ入力 → 同じ出力）
- 状態は自分の中に持たない。必要なら Pool / AMP に書く
- 全アクションに `goal_ref` を付けることを推奨

---

## Step 5: `akari dev` でローカル動作確認 / Run Locally

```bash
akari dev
```

AKARI Shell が起動し、`my-first-app` が自動で mount される。

```
[akari dev] Watching: mcp-server/index.ts, panels/main.schema.json
[akari dev] App mounted: com.yourname.my-first-app
[akari dev] Panel: Hello (main) ← Shell の左サイドバーに表示
```

Shell の左サイドバーから "Hello App" を開き、名前を入力して "挨拶する" ボタンをクリック。
"挨拶しました！" のトーストが表示されれば成功。

> `mcp-server/index.ts` や `panels/main.schema.json` を保存すると **Hot Reload** される。
> Shell を再起動せずに変更が反映される。

---

## Step 6: `akari app certify` で Lint を実行する / Run Certification Lint

```bash
akari app certify
```

以下のチェックが実行される（HUB-024 §6.8 Automated Lint）：

```
✓ Manifest validation         (akari.toml フォーマット、必須フィールド)
✓ Tier declaration            (tier = "mcp-declarative")
✓ SDK compatibility           (sdk range 宣言)
✓ Permission scope            (最小権限原則の確認)
✓ Panel Schema validation     (panels/*.schema.json フォーマット)
✓ MCP tool naming             (ADR-009 準拠: <namespace>.<action>)
✓ MCP-Schema binding          (bind と MCP tool input の整合性)
✓ Guidelines compliance       (自前 DB 禁止 / 直接通信禁止 等)
✓ Contract Test               (7 API の基本契約テスト)

All checks passed. Ready to publish.
```

**失敗例と対処**:

```
✗ MCP tool "greet" does not follow naming convention
  → Fix: rename to "hello.greet" (format: <namespace>.<action>)

✗ Panel field "name" bind target "mcp.hello.greet.name" not found in tool schema
  → Fix: add "name" property to hello.greet inputSchema
```

---

## Next Steps

最初の App が動いた。次にどこへ進むか：

| 目標 | 行き先 |
|---|---|
| Full か MCP-Declarative か詳しく知りたい | [Tier Comparison](./concepts/tier-comparison.md) |
| App のライフサイクルを理解したい | [App Lifecycle](./concepts/app-lifecycle.md) |
| SDK の仕組み全体を俯瞰したい | [Architecture Map](./concepts/architecture-map.md) |
| Pool や AMP を使いたい | [API Reference > Memory API](./api-reference/) |
| 外部サービスを連携したい | [Cookbook > 既存 API を載せる](./cookbook/) |
| マーケットに出したい | [Certification Guide](./certification/) |

---

> **補足**: 本チュートリアルは「動くものを最短で見る」が目的のため、
> 認証・HITL・オフライン対応は省略している。
> 実際のサービス連携では [X Sender 参考実装](./examples/x-sender.md)
> または [Notion 参考実装](./examples/notion.md) を参照。
