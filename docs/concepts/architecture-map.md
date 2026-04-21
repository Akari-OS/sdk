---
title: Architecture Map — SDK の仕組みを開発者視点で俯瞰する
updated: 2026-04-19
related: [HUB-024, HUB-025, HUB-001]
---

# Architecture Map — SDK の仕組みを開発者視点で俯瞰する / SDK Architecture from a Developer's Perspective

> App を書くとき「自分のコードがどこで実行され、何と話しているか」を理解するガイド。
> VISION.md の 5 層アーキテクチャを**開発者の視点**で再解釈する。

---

## 全体像 / Big Picture

```
┌─────────────────────────────────────────────────────────────────────┐
│  App 層                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │
│  │  Writer    │  │  Video     │  │ X Sender   │  │  あなたの    │  │
│  │  (Full)    │  │  (Full)    │  │ (MCP-Decl) │  │  App         │  │
│  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘  └──────┬───────┘  │
│         └───────────────┴───────────────┴───────────────┘           │
│                     ↕ AKARI App SDK（@akari/sdk）                    │
├─────────────────────────────────────────────────────────────────────┤
│  AKARI Core                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Shell        │  │ Agent Runtime│  │ Memory Layer              │  │
│  │ (Tauri+React)│  │ (7 default   │  │ Pool (素材倉庫)           │  │
│  │              │  │  agents + α) │  │ AMP  (記憶・判断ログ)     │  │
│  │ ・Panel      │  │              │  │ Work (進行中の作品)       │  │
│  │   Registry   │  │ ・ephemeral  │  │ Session (引き継ぎ)        │  │
│  │ ・Schema     │  │   execution  │  └──────────────────────────┘  │
│  │   Renderer   │  └──────────────┘                                │
│  └──────────────┘                                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ Protocol Suite                                                │  │
│  │ MCP（ツール呼び出し）/ M2C（メディア→文脈）                    │  │
│  │ AMP（エージェント記憶）/ ACE（コンテキスト lint）              │  │
│  └──────────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────┤
│  ホスト OS（Mac / Windows / Linux）                                  │
└─────────────────────────────────────────────────────────────────────┘
```

App 開発者が直接触るのは主に「App 層」と「AKARI App SDK（@akari/sdk）」の境界。
Core の内部実装を直接触ることはない（SDK 経由で全て行う）。

---

## App → Shell: パネルの mount フロー / Panel Mount Flow

App が Shell に Panel を表示するまでの流れ。

### Full Tier の場合（React Panel）

```
[App 起動時]

App (panels/writer.tsx)
  ↓ import { shell } from "@akari/sdk"
  ↓ shell.mountPanel({
        id: "writer.main",
        title: "Writer",
        component: WriterPanel,   // React component
     })
Shell (Panel Registry)
  ↓ Panel を登録
  ↓ サイドバーにアイコンを表示

[ユーザーが Panel を開く]

Shell (Panel Registry)
  ↓ WriterPanel の React component を render
  ↓ @akari/sdk のコンテキストを注入（pool / amp / permission 等）

[ユーザーが Panel を閉じる]

Shell (Panel Registry)
  ↓ component を unmount
```

### MCP-Declarative Tier の場合（Schema Panel）

```
[App インストール時]

akari.toml の [panels] セクション
  ↓ Shell が panels/main.schema.json を読み込む
  ↓ Schema レジストリに登録（app-id → schema のマッピング）

[ユーザーが Panel を開く]

Shell (Schema Renderer)
  ↓ panels/main.schema.json を解析
  ↓ Widget Catalog から対応コンポーネントを組み立て
  ↓ bind 規約に従い MCP サーバーとの配線を設定
  ↓ UI を描画

[ユーザーがボタンを押す（例: "投稿"）]

Shell (Schema Renderer)
  ↓ action.hitl.require == true → HITL 承認ダイアログを表示
  ↓ ユーザーが承認
  ↓ action.mcp.tool = "x.post" → MCP サーバーを呼び出し

MCP サーバー (mcp-server/index.ts)
  ↓ x.post ツールを実行（X API 呼び出し等）
  ↓ AMP に記録
  ↓ 結果を Shell に返す

Shell (Schema Renderer)
  ↓ on_success.toast を表示
```

---

## App → Agent Runtime: エージェントの呼び出しフロー / Agent Invocation Flow

App がカスタムエージェントを呼び出すとき（Full Tier のみ）。

```
App (src/index.ts)
  ↓ import { defineAgent, invoke } from "@akari/sdk"
  ↓ defineAgent({
        id: "writer_editor",
        persona: "文章の編集者",
        tools: ["pool.read", "amp.query"],
        model: "claude-sonnet-4-6",
     })

[ユーザーが「この文章を整えて」と指示]

App
  ↓ const result = await invoke({
        agent: "writer_editor",
        prompt: "この下書きを整えて",
        context: aceContext,   // ACE で組み立てたコンテキスト
     })

Agent Runtime
  ↓ "writer_editor" の定義（agents/editor.md）を読み込む
  ↓ エージェントを**揮発的に**起動（新しいプロセス / スレッド）
  ↓ Pool / AMP の MCP サーバーにアクセスして素材を集める
  ↓ LLM（claude-sonnet-4-6）を呼び出す
  ↓ 結果を App に返す
  ↓ エージェント終了（揮発）

App
  ↓ result.text を Panel に表示
```

**CAA 原則の適用**:

- エージェントは `defineAgent()` で**仕様を永続ファイル**に定める
- 実行は `invoke()` のたびに**揮発的**に起動・終了
- 状態は App にもエージェントにも持たせず、**Memory Layer（Pool / AMP）のみ**

---

## App → Memory Layer: 記憶の読み書き / Memory Read/Write

全ての状態は Memory Layer に書く。App 本体・MCP サーバー・エージェントのどれも自分の中に状態を持たない。

```
[Pool へ書き込む（素材保存）]

App / MCP サーバー
  ↓ import { pool } from "@akari/sdk"
  ↓ const id = await pool.put({
        bytes,
        mime: "text/markdown",
        tags: ["draft", "x-sender"],
     })
  ↓ id = "blake3:abc123..."   ← Content-Addressed (blake3)

Pool (Hot Tier / SSD)
  ↓ bytes を保存
  ↓ Content Hash で重複排除
  ↓ tiered storage（Hot → Warm → Cold）は Core が管理

[Pool から読み込む]

App
  ↓ const item = await pool.get("blake3:abc123...")
  ↓ const items = await pool.search({ query: "先週の下書き" })

[AMP へ記録する（操作ログ）]

MCP サーバー
  ↓ import { amp } from "@akari/sdk"
  ↓ await amp.record({
        kind: "publish-action",
        content: "X に投稿: https://x.com/...",
        goal_ref: "session-123",   // ゴール紐付け必須
     })

[AMP を検索する]

App
  ↓ const history = await amp.query({ goal_ref: "session-123" })
```

---

## App 間の通信: handoff フロー / Inter-App Communication

App 同士は**直接通信しない**。全て記憶層（Pool / AMP）経由。

```
[Writer App が X Sender に下書きを渡す]

Writer App
  ↓ 下書きを AMP に記録
  ↓ 添付素材を Pool に保存
  ↓ import { app } from "@akari/sdk"
  ↓ await app.handoff({
        to: "com.akari.x-sender",
        intent: "post-draft",
        payload: {
          draft_ref: ampRecordId,      // AMP への参照（bytes ではない）
          assets: [poolItemId1],       // Pool への参照（bytes ではない）
        },
     })

Shell
  ↓ X Sender Panel を前面に出す（または通知を表示）
  ↓ handoff intent を X Sender App に伝える

X Sender Panel
  ↓ draft_ref から AMP.get(ampRecordId) で本文を取得
  ↓ poolItemId1 から Pool.get(poolItemId1) で添付を取得
  ↓ フォームに本文と添付を展開
  ↓ AMP に handoff 受信を記録（goal_ref 引き継ぎ）
```

**なぜ ID だけ渡すのか**:

- bytes を直送すると「誰が何を渡したか」の記録が残らない
- ID 渡しにより AMP が全 handoff の**監査ログ**になる
- 受け取り側が fetch するため、送り手が「押しつける」ことができない

---

## Protocol Suite との関係 / Relationship with Protocol Suite

AKARI の 4 プロトコルは、SDK を通じて App から透過的に使われる。

| プロトコル | SDK での使い方 | 役割 |
|---|---|---|
| **MCP** | `mcp-server/` の実装 / Schema の `action.mcp` | ツール呼び出し標準 |
| **M2C** | `pool.put()` の自動処理（Core が担う） | 素材 → 意味の抽出 |
| **AMP** | `amp.record()` / `amp.query()` | エージェント記憶 |
| **ACE** | `ace.build()` / `ace.lint()` | コンテキスト組み立て・Lint |

App 開発者が直接 MCP/M2C/AMP/ACE のプロトコル仕様を読む必要はない。
SDK がラッパーを提供している。ただし動作を深く理解したい場合は各プロトコルの spec を参照：

- MCP: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- M2C: `Akari-OS/m2c` リポジトリ
- AMP: `Akari-OS/amp` リポジトリ
- ACE: `Akari-OS/ace` リポジトリ

---

## Panel Schema のアーキテクチャ / Panel Schema Architecture

MCP-Declarative Tier の核心。JSON → UI 変換の仕組み。

```
App
  └── panels/main.schema.json
        ↓ [Shell が読み込む]
Shell (Schema Renderer)
  ├── layout 解析 ("form" | "tabs" | "split" | ...)
  ├── fields 解析
  │     ├── Widget Catalog から対応コンポーネントを取得
  │     │   例: "type": "pool-picker" → PoolPickerWidget
  │     └── bind 規約で MCP / Pool / AMP と配線
  │         例: "bind": "mcp.x.post.text" → x.post の text 引数にバインド
  ├── actions 解析
  │     ├── enabled_when 評価（条件式）
  │     ├── hitl.require == true → 承認ダイアログコンポーネントを挿入
  │     └── mcp.tool → MCP サーバーへの呼び出し設定
  └── [描画]
```

**Binding 規約の詳細**（HUB-025 §6.4）:

| 書式 | 意味 | 例 |
|---|---|---|
| `mcp.<tool>.<param>` | MCP ツール引数へのバインド | `mcp.x.post.text` |
| `pool.<query_id>` | Pool 検索結果を初期値に | `pool.recent-drafts` |
| `amp.<kind>.<field>` | AMP レコードを初期値 / 保存先に | `amp.style-preference.tone` |
| `state.<key>` | Panel ローカル state（揮発） | `state.isLoading` |
| `const.<value>` | 固定値 | `const.true` |

フィールド間参照は `$<field_id>`：

```json
"enabled_when": "$text != null && $text.length > 0"
```

---

## 開発者から見た 5 層 / The 5 Layers from a Developer's Perspective

VISION.md の 5 層を開発者視点で解釈する：

| 層（内向き） | App SDK から見た役割 | あなたが触る部分 |
|---|---|---|
| **Shell** | Panel を mount する場 | `shell.mountPanel()` / Schema の `panels` セクション |
| **Agent Runtime** | カスタムエージェントの実行環境 | `defineAgent()` / `invoke()` / `agents/*.md` |
| **Memory Layer** | データの唯一の保管場所 | `pool.*` / `amp.*` |
| **Semantic Layer** | 素材から意味を抽出（M2C） | `pool.put()` 後に自動実行（直接触らない） |
| **Protocol Suite** | 標準化されたツール呼び出し | MCP サーバー実装 / `@akari/sdk` ラッパー |

App 開発者が「直接触る」のは Shell / Agent Runtime / Memory Layer の 3 層。
Semantic Layer（M2C）と Protocol Suite は SDK が透過的に処理する。

---

## 関連ドキュメント / Related Docs

- [Getting Started](../getting-started.md) — 動くサンプルで概念を確認
- [App Lifecycle](./app-lifecycle.md) — install から uninstall まで
- [Tier Comparison](./tier-comparison.md) — Full vs MCP-Declarative
- [HUB-024 §6](https://github.com/Akari-OS/.github/blob/main/VISION.md) — App SDK 完全仕様
- [HUB-025](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Panel Schema v0 仕様
- [VISION.md](../../../../VISION.md) — AKARI OS 全体ビジョン（5 層アーキテクチャ）
