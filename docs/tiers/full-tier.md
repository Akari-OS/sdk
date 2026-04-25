---
guide-id: AKARI-GUIDE-SDK-TIERS-FULL
version: 0.1.0
status: draft
created: 2026-04-19
updated: 2026-04-19
related-specs: [AKARI-HUB-024, AKARI-HUB-003]
related-adr: [ADR-007, ADR-011]
ai-context: claude-code
---

# Full Tier 詳細ガイド / Full Tier Developer Guide

Full Tier App の開発に必要なすべてを 1 ドキュメントに集約したリファレンス。
本ガイドは **AKARI App SDK（HUB-024）** の Tier 固有の解説に集中する。
7 API の型定義・Contract Test・Certification など SDK 共通の話は **API Reference** を参照。

---

## 目次

1. [概要 / Overview](#1-概要--overview)
2. [ユースケース / When to Choose Full Tier](#2-ユースケース--when-to-choose-full-tier)
3. [プロジェクト構造 / Project Structure](#3-プロジェクト構造--project-structure)
4. [`akari.toml` Full Tier 版](#4-akaritoml-full-tier-版)
5. [React Panel 実装 / React Panel Implementation](#5-react-panel-実装--react-panel-implementation)
6. [独自 Agent 連れ込み / Bringing Your Own Agents](#6-独自-agent-連れ込み--bringing-your-own-agents)
7. [Permission API の使い方 / Permission API](#7-permission-api-の使い方--permission-api)
8. [ネイティブ機能呼び出し / Native Capabilities via Tauri](#8-ネイティブ機能呼び出し--native-capabilities-via-tauri)
9. [SchemaPanel の部分利用 / Embedding SchemaPanel](#9-schemapanel-の部分利用--embedding-schemapanel)
10. [ベストプラクティス / Best Practices](#10-ベストプラクティス--best-practices)
11. [Writer を参考実装として読む / Reading Writer as Reference](#11-writer-を参考実装として読む--reading-writer-as-reference)
12. [よくある落とし穴 / Common Pitfalls](#12-よくある落とし穴--common-pitfalls)
13. [次に読む / What to Read Next](#13-次に読む--what-to-read-next)

---

## 1. 概要 / Overview

**Full Tier は AKARI App SDK の「重量級」Tier**。任意の React コンポーネントで Panel を実装でき、App 固有の Agent を同梱し、Skill を他 App に公開できる。UI 自由度と引き換えに、Certification の審査（特にマーケット掲載時の Manual Review）が MCP-Declarative Tier より重くなる。

```
Tier 比較 (HUB-024 §6.2 要約)

                          UI 自由度    参入コスト    審査の重さ
Full Tier                 最大         高           重
MCP-Declarative Tier      中           低           軽
```

**Full ⇔ MCP-Declarative は同じ SDK・同じ Manifest 形式を使う。** Tier は `akari.toml` の `tier` フィールド 1 行で切り替える。
MCP-Declarative で始めて、UI 要求が育ったら Full に昇格するパスが用意されている（逆は不可）。

### Full Tier が提供するもの

- **任意の React コンポーネント** を Panel として Shell に mount できる
- **App 固有 Agent** (`agents/*.md`) を Agent Runtime に登録し、on-demand で呼び出せる
- **Skill** を他 App に公開できる
- **Tauri command** 経由で Rust ネイティブ処理（GPU / FFmpeg / Keychain 等）を呼び出せる（オプション）
- **Shell の汎用 SchemaPanel** を React Panel 内に埋め込める（MCP-Declarative との協調）

### Full Tier を選ぶ基準

- 標準 Widget では表現できないカスタム UI が必要（リッチテキストエディタ、動画タイムライン等）
- レイテンシが厳しい処理（60 fps のリアルタイムプレビュー等）
- GPU / FFmpeg / ファイルシステム等のネイティブ機能を直接触る必要がある
- App 固有の専門 Agent（文章編集者 / カラーグレーディング AI 等）を持ちたい
- Skill を他 App に公開して連携エコシステムを作りたい

---

## 2. ユースケース / When to Choose Full Tier

### 2.1 リッチ UI が必要なケース

MCP-Declarative の汎用 SchemaPanel は `textarea` / `pool-picker` / `datetime` / `button` 等の標準 Widget を描画する。これでカバーできないケースが Full Tier の出番：

| アプリ類型 | 必要な UI |
|---|---|
| テキストエディタ（Writer） | CodeMirror / Lexical ベースのエディタ、文字数カウンタ、アウトライン |
| 動画編集（Video） | タイムライン、フレームサムネイル、波形表示 |
| デザインツール | Canvas、SVG 操作、カラーピッカー |
| データビジュアライゼーション | D3 / Recharts グラフ、インタラクティブな図表 |

### 2.2 低レイテンシが必要なケース

60 fps のプレビュー更新、キーストロークごとのリアルタイム処理など、Shell の IPC を経由する時間すら惜しい処理は Rust → Tauri command でローカル処理し、React に結果だけ返す構成が有効。

### 2.3 ネイティブ機能が必要なケース

- **GPU 処理**: Metal / CUDA を Rust 側で呼び、エンコード済みフレームを WebView に渡す
- **FFmpeg**: Rust の `ffmpeg-next` crate で動画を処理し、Pool に PUT
- **Keychain**: `keyring-rs` で OAuth トークンをセキュアに保管（ADR-007 §Keychain アクセス）
- **ファイルシステム**: `tauri-plugin-dialog` でファイルピッカーを開き、Pool に取り込む

### 2.4 独自 Agent を持ちたいケース

Core の 7 Agent（Partner / Studio / Operator / Researcher / Guardian / Memory / Analyst）はデフォルトとして存在するが、特定ドメインに特化した Agent（例: 文章編集者、カラーグレーディング AI）は App-supplied agent として `agents/` 配下で定義できる。

---

## 3. プロジェクト構造 / Project Structure

`akari-app-cli` で Full Tier の雛形を生成するコマンド：

```bash
akari-app-cli create my-app --tier full
```

生成される構造：

```
my-app/
├── akari.toml                  ← App Manifest（Tier 宣言含む）
│
├── agents/                     ← App 固有 Agent 定義
│   └── editor.md               ← system prompt + tools（Markdown 形式）
│
├── panels/                     ← Shell に mount する React Panel
│   ├── main.tsx                ← メイン Panel（akari.toml で参照）
│   └── settings.tsx            ← 設定 Panel（任意）
│
├── skills/                     ← 他 App に公開する関数
│   └── generate_draft.ts
│
├── src/                        ← ビジネスロジック・ユーティリティ
│   ├── store/
│   │   └── editor.ts           ← Zustand store
│   ├── hooks/
│   │   └── usePoolSync.ts
│   └── lib/
│       └── format.ts
│
├── src-tauri/                  ← Tauri Rust バックエンド（ネイティブ機能が必要な場合のみ）
│   ├── src/
│   │   ├── main.rs
│   │   └── commands/
│   │       └── native_process.rs
│   └── Cargo.toml
│
├── tests/
│   └── contract/               ← App Contract Test（Certification 必須）
│       └── api.test.ts
│
├── package.json
├── tsconfig.json
└── vite.config.ts
```

> `src-tauri/` はネイティブ処理が不要なら省略できる。FFmpeg / GPU 等を使わない Full Tier App（Writer 等）は `src-tauri/` を持たない場合が多い。

---

## 4. `akari.toml` Full Tier 版

Full Tier の完全な Manifest 例を以下に示す。各フィールドの意味を行内コメントで説明する。

```toml
# ─── App 基本情報 ────────────────────────────────────────────────────────
[app]
id      = "com.example.my-editor"   # 逆ドメイン形式（必須）
name    = "My Editor"               # 表示名
version = "0.1.0"                   # semver
author  = "Your Name"
tier    = "full"                    # Full Tier 宣言（既定値も "full" だが明示推奨）
sdk     = ">=0.1.0 <1.0"            # 互換 Core SDK 範囲。範囲外は起動拒否

# ─── 権限宣言（デフォルト deny、最小限を宣言） ───────────────────────────────
[permissions]
pool              = ["read", "write"]   # Pool への読み書き
amp               = ["read", "write"]   # AMP への読み書き
external-network  = false               # ネットワーク不使用ならオフライン対応証明に必須
# external-network = ["api.example.com"]  # 使う場合はドメインリスト
filesystem        = ["read:user-docs"]  # ユーザードキュメントの読み取りのみ
# filesystem      = ["read:*", "write:user-docs"]  # 書き込みが必要な場合

# ─── Panel 宣言（Shell が mount する React コンポーネント） ──────────────────
[panels]
main     = { title = "My Editor", mount = "panels/main.tsx" }
# settings = { title = "Settings",  mount = "panels/settings.tsx" }  # オプション

# ─── App 固有 Agent（ADR-011 命名規約に従う） ──────────────────────────────
[agents]
# キー = エージェント ID。必ず "<app-short-id>_<role>" の snake_case にすること
# （app-short-id = akari.toml [app] id の末尾セグメントを snake_case 化したもの）
my_editor_writer   = "agents/writer.md"
my_editor_reviewer = "agents/reviewer.md"

# ─── 公開 Skill（他 App が呼び出せる関数） ──────────────────────────────
[skills.exposed]
"my-editor.generate_draft" = "skills/generate_draft.ts"
"my-editor.extract_outline" = "skills/extract_outline.ts"

# ─── 利用する他 App の Skill ────────────────────────────────────────────
[skills.imported]
"pool.search"       = ">=0.1"
"m2c.extract_features" = ">=0.1"

# ─── Bundled リソース（インストール時に自動登録） ──────────────────────────
[bundled]
pool-schemas   = ["schemas/document.json", "schemas/draft.json"]
memory-schemas = ["schemas/writing-style.json"]
```

### 4.1 フィールド詳解

| フィールド | 必須 | 説明 |
|---|---|---|
| `[app].id` | 必須 | 逆ドメイン形式。マーケットでの一意識別子 |
| `[app].tier` | 推奨明示 | `"full"` を宣言。省略時も Full だが明示が可読性に貢献 |
| `[app].sdk` | 必須 | 互換 SDK 範囲。起動時チェックされ範囲外は実行拒否 |
| `[permissions]` | 必須 | 宣言した権限のみ実行時に取得可能。Lint で未宣言アクセスを検出 |
| `[panels]` | 必須（Full） | `mount` に React コンポーネントのパス指定 |
| `[agents]` | 任意 | App 固有 Agent。ADR-011 の命名規約（`<short-id>_<role>`）必須 |
| `[skills.exposed]` | 任意 | 外部公開 Skill。Certification の Manual Review 対象 |
| `[skills.imported]` | 任意 | 使用する外部 Skill の宣言。semver 範囲を指定 |
| `[bundled]` | 任意 | Pool / Memory スキーマ等の自動登録リソース |

---

## 5. React Panel 実装 / React Panel Implementation

### 5.1 `shell.mountPanel()` の使い方

Panel を Shell に mount する最小例：

```typescript
// panels/main.tsx
import { shell } from "@akari/sdk"
import { MyEditorPanel } from "./MyEditorPanel"

// App の entry point で一度だけ呼ぶ
shell.mountPanel({
  id: "my-editor.main",       // グローバル一意。<app-id>.<panel-name> が慣習
  title: "My Editor",
  icon: "pen",                 // Shell がサイドバーに表示するアイコン
  component: MyEditorPanel,   // React FC または lazy import
})
```

lazy import でコード分割する場合：

```typescript
import { lazy } from "react"
import { shell } from "@akari/sdk"

shell.mountPanel({
  id: "my-editor.main",
  title: "My Editor",
  icon: "pen",
  component: lazy(() => import("./MyEditorPanel")),
})
```

### 5.2 Panel コンポーネントの Props

Shell は Panel コンポーネントに以下の Props を注入する：

```typescript
// @akari/sdk で型定義されている
export interface PanelProps {
  /** このパネルが現在フォーカスを持っているか */
  isFocused: boolean
  /** Shell が管理するパネル幅（px）。レイアウト調整に使う */
  panelWidth: number
  /** Shell が管理するパネル高さ（px）*/
  panelHeight: number
  /** パネルに渡された App-level context */
  appContext: Record<string, unknown>
}

// 使用例
export function MyEditorPanel({ isFocused, panelWidth }: PanelProps) {
  return (
    <div className="flex h-full flex-col">
      {/* ... */}
    </div>
  )
}
```

### 5.3 Shell イベントの購読 / Lifecycle

Shell からの通知は `shell.*` イベントハンドラで受け取る。**コンポーネント内ではなく、module entry point（パネル外）で購読することを強く推奨する**（メモリリーク防止のため。詳細は §12 を参照）。

```typescript
// panels/main.tsx — module entry point で購読
import { shell } from "@akari/sdk"
import { useEditorStore } from "../src/store/editor"

// App ロード時に 1 回だけ実行
shell.onSelection((sel) => {
  // Shell 上でユーザーがテキストを選択した際のコールバック
  useEditorStore.getState().setSelection(sel)
})

shell.onFocus(() => {
  // このパネルがアクティブになった時
  useEditorStore.getState().onPanelFocused()
})

shell.onBlur(() => {
  // このパネルがバックグラウンドになった時
  useEditorStore.getState().onPanelBlurred()
})

shell.onBeforeUnmount(() => {
  // パネルが unmount される直前（クリーンアップに使う）
  useEditorStore.getState().flushPendingChanges()
})
```

### 5.4 Zustand Store との組み合わせ

Panel の状態は Zustand で管理する（ADR-007）。Pool との同期パターン例：

```typescript
// src/store/editor.ts
import { create } from "zustand"
import { pool, amp } from "@akari/sdk"

interface EditorState {
  content: string
  isDirty: boolean
  lastSavedId: string | null
  setContent: (content: string) => void
  save: (goalRef: string) => Promise<void>
}

export const useEditorStore = create<EditorState>((set, get) => ({
  content: "",
  isDirty: false,
  lastSavedId: null,

  setContent: (content) => set({ content, isDirty: true }),

  save: async (goalRef: string) => {
    const { content } = get()
    // Pool に保存（Memory API）
    const id = await pool.put({
      bytes: new TextEncoder().encode(content),
      mime: "text/markdown",
      tags: ["draft"],
    })
    // AMP に判断ログを記録（goal_ref は必須）
    await amp.record({
      kind: "decision",
      content: "ドキュメントを保存",
      goal_ref: goalRef,
    })
    set({ isDirty: false, lastSavedId: id })
  },
}))
```

### 5.5 TanStack Router でのルーティング

複数 Panel（メイン / 設定 / 詳細）を持つ場合、TanStack Router を使う：

```typescript
// src/routes/index.ts
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { MainPanel } from "../panels/MainPanel"
import { SettingsPanel } from "../panels/SettingsPanel"

const rootRoute = createRootRoute()

const mainRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my-editor",
  component: MainPanel,
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/my-editor/settings",
  component: SettingsPanel,
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([mainRoute, settingsRoute]),
})
```

---

## 6. 独自 Agent 連れ込み / Bringing Your Own Agents

### 6.1 `agents/*.md` の形式

App 固有 Agent は `agents/` 配下に Markdown ファイルで定義する。
形式は Claude Code の agent 定義と同じ「system prompt + tools 宣言」。
**仕様は永続ファイル、実行は揮発（関数呼び出し）** がコア原則。

```markdown
<!-- agents/writer.md -->
---
id: my_editor_writer
model: claude-sonnet-4-6
tools:
  - pool.read
  - pool.search
  - amp.query
---

# Writer Agent

あなたはソロクリエイターの文章編集者です。
ユーザーの文体（AMP の writing_style）に合わせ、自然な日本語で提案してください。

## 制約
- 提案は最大 3 案まで
- ユーザーの選択範囲だけを編集し、それ以外に変更を加えない
- 「です・ます」調と「だ・である」調をユーザーの既存文体から判断して統一する
```

### 6.2 ADR-011 命名規約

App-supplied agent の ID は必ず **`<app-short-id>_<agent-role>`** の snake_case にする（ADR-011）。

```
app id (akari.toml): com.example.my-editor
                            ↓ 末尾セグメントを snake_case 化
app-short-id:        my_editor

エージェント ID:      my_editor_writer     ← OK
                     my_editor_reviewer   ← OK
                     writer               ← NG（prefix なし）
                     editor               ← NG（prefix なし）
```

`akari.toml` の `[agents]` セクションでは、キーがエージェント ID、値がファイルパス：

```toml
[agents]
# キーが snake_case のエージェント ID、値がファイルパス
my_editor_writer   = "agents/writer.md"
my_editor_reviewer = "agents/reviewer.md"
```

Certification の Automated Lint は `<app-short-id>_` prefix を強制チェックする。

### 6.3 Agent API での呼び出し

```typescript
import { defineAgent, invoke, spawn } from "@akari/sdk"

// App ロード時にエージェントを定義（一度だけ）
defineAgent({
  id: "my_editor_writer",
  specFile: "agents/writer.md",         // agents/*.md へのパス
  model: "claude-sonnet-4-6",
  tools: ["pool.read", "amp.query"],
})

// 単発呼び出し（ephemeral）
export async function suggestRephrase(selection: string, goalRef: string) {
  const aceCtx = await ace.build({
    intent: "文章の言い回しを改善する",
    goal_ref: goalRef,
    sources: [
      { kind: "amp", filter: { kind: "style-preference" } },
    ],
  })

  const result = await invoke({
    agent: "my_editor_writer",
    prompt: `次の文章の言い回しを 3 案提案してください:\n\n${selection}`,
    context: aceCtx,
  })

  return result
}

// 並列スポーン（複数案を同時生成）
export async function generateParallelDrafts(topic: string, goalRef: string) {
  const [draftA, draftB, draftC] = await Promise.all([
    spawn({ agent: "my_editor_writer", prompt: `${topic} — フォーマル調で` }),
    spawn({ agent: "my_editor_writer", prompt: `${topic} — カジュアル調で` }),
    spawn({ agent: "my_editor_writer", prompt: `${topic} — 短文・箇条書きで` }),
  ])
  return [draftA, draftB, draftC]
}
```

### 6.4 Agent Runtime との接続

App-supplied agent は Agent Runtime（LaunchAgent として常駐する daemon）に登録される。
Shell は Unix domain socket 経由で daemon と通信し（ADR-007 §11）、App の `agents/` 定義は daemon がロードする。

```
App の agents/writer.md
         │
         ▼（App インストール時に自動登録）
Agent Runtime（LaunchAgent daemon）
         │
         ▼（Unix socket / MCP JSON-RPC）
Shell（Tauri WebView）
```

App をアンインストールすると `my_editor_writer` は自動で登録解除される。

---

## 7. Permission API の使い方 / Permission API

### 7.1 manifest 宣言と実行時ゲート

権限はまず `akari.toml` の `[permissions]` で宣言し、実行時に `permission.gate()` でゲートする。
**宣言なしの権限を gate() で要求するとエラー**になり、Lint でも検出される。

```typescript
import { permission } from "@akari/sdk"

// Pool への書き込み（HITL 不要）
await permission.gate({
  action: "pool.write",
  reason: "下書きを自動保存",
  hitl: false,
})

// 外部ネットワーク投稿（HITL 必須）
// hitl: true のとき、Shell が承認ダイアログを表示して止まる
await permission.gate({
  action: "external-network.post",
  reason: "X (Twitter) に投稿します",
  hitl: true,
})
```

### 7.2 ユーザー承認フロー（HITL）

`hitl: true` を指定すると、Shell が承認ダイアログを表示してユーザーの確認を待つ。
ユーザーが「許可」を押すまで `permission.gate()` は resolve しない（拒否すると reject）。

```typescript
export async function publishToX(draftId: string) {
  try {
    // ユーザーがダイアログで「許可」を押すまで待つ
    await permission.gate({
      action: "external-network.post",
      reason: "X (Twitter) に投稿します。\n内容: 下書き #" + draftId,
      hitl: true,
    })

    // 承認後に実行
    await app.handoff({
      to: "com.akari.x-sender",
      intent: "publish-draft",
      payload: { draft_ref: draftId, assets: [] },
    })
  } catch (err) {
    if (err instanceof PermissionDeniedError) {
      // ユーザーが拒否した場合
      showToast("投稿をキャンセルしました")
    } else {
      throw err
    }
  }
}
```

### 7.3 監査ログ

全 `permission.gate()` の通過・拒否は Core が自動的に AMP に監査ログとして記録する。
App 側で明示的に記録する必要はないが、goal_ref を含む記録を自分でも残すと可読性が上がる：

```typescript
await amp.record({
  kind: "permission-granted",
  content: "X への投稿を許可",
  goal_ref: sessionGoalRef,   // goal_ref は必須
})
```

---

## 8. ネイティブ機能呼び出し / Native Capabilities via Tauri

> **注**: ネイティブ機能（`src-tauri/`）は Full Tier のオプション。FFmpeg / GPU 等が不要なら本章はスキップ可。

### 8.1 Tauri command のパターン

JavaScript から Rust の処理を呼ぶ基本パターン（ADR-007 §Keychain アクセスの形式に倣う）：

```rust
// src-tauri/src/commands/native_process.rs
use tauri::command;

/// FFmpeg でトランスコード（例）
#[command]
pub async fn transcode_video(
    input_path: String,
    output_format: String,
) -> Result<String, String> {
    // ffmpeg-next crate を使った処理
    // ...
    Ok(output_path)
}

/// Keychain にシークレット保存
#[command]
pub async fn store_secret(
    service: String,
    account: String,
    password: String,
) -> Result<(), String> {
    let entry = keyring::Entry::new(&service, &account)
        .map_err(|e| e.to_string())?;
    entry.set_password(&password)
        .map_err(|e| e.to_string())
}
```

```typescript
// panels/main.tsx — Tauri command を呼ぶ側
import { invoke as tauriInvoke } from "@tauri-apps/api/core"

async function transcodeVideo(inputPath: string): Promise<string> {
  const outputPath = await tauriInvoke<string>("transcode_video", {
    inputPath,
    outputFormat: "h264",
  })
  return outputPath
}
```

### 8.2 結果の Pool への格納

ネイティブ処理の結果は必ず Pool に格納する（App が自前 DB を持つことは禁止）：

```typescript
import { pool } from "@akari/sdk"
import { invoke as tauriInvoke } from "@tauri-apps/api/core"

async function processAndStore(inputPath: string, goalRef: string) {
  // Rust 側でネイティブ処理
  const outputPath = await tauriInvoke<string>("transcode_video", {
    inputPath,
    outputFormat: "h264",
  })

  // 結果を読み込んで Pool に格納
  const bytes = await readFileAsBytes(outputPath) // Tauri filesystem API
  const poolId = await pool.put({
    bytes,
    mime: "video/mp4",
    tags: ["transcoded"],
  })

  await amp.record({
    kind: "decision",
    content: `トランスコード完了: ${inputPath} → Pool:${poolId}`,
    goal_ref: goalRef,
  })

  return poolId
}
```

### 8.3 Tauri プラグイン一覧（参考）

ADR-007 §9 で確定したプラグイン群。App 側 `src-tauri/Cargo.toml` に必要なものを追加する：

| プラグイン | 用途 |
|---|---|
| `tauri-plugin-dialog` | ファイル選択・確認ダイアログ |
| `tauri-plugin-clipboard-manager` | クリップボード操作 |
| `tauri-plugin-notification` | macOS 通知センター |
| `tauri-plugin-log` | ログ（rotation 付き）|
| `keyring` crate | Keychain シークレット保管 |

---

## 9. SchemaPanel の部分利用 / Embedding SchemaPanel

Full Tier の React Panel 内に、Shell の汎用 SchemaPanel を埋め込むことができる。
これにより「リッチな UI の中に標準フォーム部品だけ Schema で宣言する」ハイブリッド構成が可能になる。

### 9.1 ユースケース

- 設定画面：カスタム UI の中に標準フォーム（`<SchemaPanel>`）をそのまま流用
- プレビュー + フォームの組み合わせ：左にカスタムプレビュー、右に Schema フォーム
- MCP-Declarative からの段階的な昇格：既存 schema.json を捨てずにそのまま使いつつ、周囲に React 実装を追加

### 9.2 埋め込み方法

```tsx
// panels/main.tsx
import { SchemaPanel } from "@akari/sdk/components"

// panel.schema.json を import（または動的取得）
import settingsSchema from "../panels/settings.schema.json"

export function MyEditorPanel() {
  return (
    <div className="flex h-full">
      {/* 左: カスタム React 実装 */}
      <section className="flex-1">
        <CustomEditor />
      </section>

      {/* 右: 標準 SchemaPanel を埋め込む */}
      <aside className="w-72 border-l">
        <SchemaPanel
          schema={settingsSchema}
          onAction={async (actionId, values) => {
            if (actionId === "save") {
              await saveSettings(values)
            }
          }}
        />
      </aside>
    </div>
  )
}
```

### 9.3 SchemaPanel の Props

```typescript
// @akari/sdk で型定義されている（HUB-025 Panel Schema v0 準拠）
interface SchemaPanelProps {
  /** panel.schema.json の内容 */
  schema: PanelSchema
  /** action ボタンが押されたときのコールバック */
  onAction: (actionId: string, values: Record<string, unknown>) => Promise<void>
  /** フォームの初期値（オプション）*/
  initialValues?: Record<string, unknown>
  /** SchemaPanel に適用するクラス名（オプション）*/
  className?: string
}
```

---

## 10. ベストプラクティス / Best Practices

### 10.1 状態管理

**App 本体に state を持たない。全て Memory Layer（Pool / AMP）に書く。** これは HUB-024 §6.7 の Guideline #9 に明記されている。

```typescript
// NG: App 内に揮発するメモリ上の state を保持する
const documents: Map<string, string> = new Map() // ← 禁止

// OK: Pool に書く（Content-Addressed、永続化される）
const id = await pool.put({ bytes, mime: "text/markdown", tags: ["draft"] })
```

Zustand store はあくまで「UI の一時状態（選択カーソル位置、フォーカス状態など）」を保持する用途に限定し、ビジネスデータは常に Pool / AMP に向ける。

### 10.2 エラーハンドリング

SDK の各 API は失敗時に型付きエラーをスローする。`try/catch` + ユーザーへのフィードバックを必ず実装する：

```typescript
import { PoolError, AMPError, PermissionDeniedError } from "@akari/sdk/errors"

async function safeSave(content: string, goalRef: string) {
  try {
    const id = await pool.put({
      bytes: new TextEncoder().encode(content),
      mime: "text/markdown",
      tags: ["draft"],
    })
    showToast("保存しました", "success")
    return id
  } catch (err) {
    if (err instanceof PoolError) {
      showToast(`保存に失敗しました: ${err.message}`, "error")
    } else if (err instanceof PermissionDeniedError) {
      showToast("Pool への書き込み権限がありません", "error")
    } else {
      // 未知のエラーは上位に再スロー
      throw err
    }
  }
}
```

### 10.3 アクセシビリティ

shadcn/ui コンポーネントは Radix UI ベースで WAI-ARIA に準拠している。
カスタムコンポーネントを作る際は以下を守る：

```tsx
// フォーカス管理
<div
  role="textbox"
  aria-label="エディタ本文"
  aria-multiline="true"
  tabIndex={0}
  onKeyDown={handleKeyDown}
>

// スクリーンリーダー向けライブリージョン
<div
  aria-live="polite"
  aria-atomic="true"
  className="sr-only"
>
  {statusMessage} {/* 保存完了・エラー等をアナウンス */}
</div>
```

Certification の Automated Lint は `alt` 属性の欠落などの基本的な問題を検出する。

### 10.4 i18n（国際化）

HUB-024 §6.7 Guideline #10 より: **デフォルト日本語、英語は任意。文字列は外部化**。

```typescript
// src/lib/i18n.ts — 文字列の外部化
export const strings = {
  ja: {
    save: "保存",
    saveSuccess: "保存しました",
    publishConfirm: "X (Twitter) に投稿しますか？",
  },
  en: {
    save: "Save",
    saveSuccess: "Saved",
    publishConfirm: "Post to X (Twitter)?",
  },
} as const

// Phase 2+ で react-i18next を導入する場合に備えて
// 今から文字列をコンポーネントに直書きしない習慣をつける
```

将来の `react-i18next` 導入に備え、文字列リテラルをコンポーネントに直書きしない。

### 10.5 AMP の goal_ref は必ず付ける

HUB-024 §6.6 Memory API の原則: **AMP の全 record に `goal_ref` を付ける**。
`goal_ref` なしの record は Lint で警告が出る。

```typescript
// NG: goal_ref なし
await amp.record({ kind: "decision", content: "保存" })

// OK: goal_ref あり
await amp.record({
  kind: "decision",
  content: "下書きを保存",
  goal_ref: "writer-session-001",  // セッション ID / タスク ID 等
})
```

---

## 11. Writer を参考実装として読む / Reading Writer as Reference

**Writer（`spec-akari-writer.md`）は Full Tier の公式リファレンス実装**（HUB-024 §T-4）。
SDK の 7 API 群をすべて使う唯一の公式 App として設計されている。

### 11.1 Writer が示す API の使い方

| SDK API | Writer での対応箇所 |
|---|---|
| Agent API | `writer_editor` Agent（`agents/editor.md`）、文章提案・スタイル適用に on-demand 呼び出し |
| Memory API | `pool.put/get/search` で下書き・投稿履歴を保存、`amp.record` で文体好みを記録 |
| Context API | `ace.build` でエディタ選択範囲 + Pool 過去記事 + AMP 文体好みを統合 |
| UI API | `shell.mountPanel({ id: "writer.main", component: WriterPanel })` |
| Inter-App API | `app.handoff({ to: "com.akari.x-sender", ... })` で Publishing App に AMP/Pool ID のみを渡す |
| Permission API | `permission.gate({ action: "external-network.post", hitl: true })` で投稿前に HITL 承認 |
| Skill API | `skill.register({ id: "writer.generate_draft", ... })` で他 App への Skill 公開 |

### 11.2 Writer の manifest を読む際の注意点

Writer の `akari.toml` （`[app]` セクション）は `[bundled]` セクションに注目：

```toml
[bundled]
pool-schemas   = ["schemas/post-history.json", "schemas/draft.json"]
memory-schemas = ["schemas/writing-style.json"]
```

`[bundled]` に宣言したリソースは App インストール時に自動登録される。
ユーザーが「App を追加」ボタンを押した瞬間に、Pool スキーマ / Memory スキーマ / Agent が全部そろった状態になる（Writer spec §6.1「インストール時に起きること」参照）。

### 11.3 Writer のフォルダ構成から学ぶ

Writer Phase 0（Tiny Writer）の最小構成は以下の通り。Full Tier の雛形として参考にしやすい：

```
writer/
├── akari.toml
├── agents/
│   └── editor.md          ← writer_editor Agent の定義
├── panels/
│   └── writer.tsx         ← WriterPanel（React FC）
├── skills/
│   └── generate_draft.ts  ← writer.generate_draft Skill
├── schemas/
│   ├── draft.json
│   ├── post-history.json
│   └── writing-style.json
└── tests/contract/
    └── api.test.ts
```

---

## 12. よくある落とし穴 / Common Pitfalls

### 12.1 Lifecycle / メモリリーク

**Panel コンポーネント内で `shell.*` イベントハンドラを登録するとメモリリークする。**
React コンポーネントは re-render のたびに新しい関数を作るため、コンポーネント内で `shell.onSelection()` 等を呼ぶと購読が積み上がる。

```typescript
// NG: コンポーネント内で購読（メモリリーク）
export function MyPanel() {
  shell.onSelection((sel) => { /* ... */ })   // ← 毎 render で追加される
  return <div>...</div>
}

// OK: module entry point（コンポーネントの外）で 1 回だけ購読
// panels/main.tsx
shell.onSelection((sel) => {
  useEditorStore.getState().setSelection(sel)
})

export function MyPanel() {
  return <div>...</div>
}
```

### 12.2 自前 DB の禁止

App がローカルに SQLite を持つことは**ガイドライン違反**（HUB-024 §6.7 #2）。
Certification の Lint が `tauri-plugin-sql` を App 固有の方法で使っていないかをチェックする。

```typescript
// NG: App 内で直接 SQLite を使う
import Database from "@tauri-apps/plugin-sql"
const db = await Database.load("sqlite:my-app.db")  // ← 禁止

// OK: Pool / AMP 経由
import { pool, amp } from "@akari/sdk"
const id = await pool.put({ bytes, mime: "application/json", tags: ["config"] })
```

### 12.3 Agent のスレッドセーフティ

`spawn()` で並列スポーンする場合、結果が返ってくる順序は保証されない。
UI の更新で競合状態（race condition）を起こさないように注意：

```typescript
// NG: 順序が保証されないのに index で代入
const results = await Promise.all([
  spawn({ agent: "my_editor_writer", prompt: "案A" }),
  spawn({ agent: "my_editor_writer", prompt: "案B" }),
])
// results[0] が案A、results[1] が案B という保証はない

// OK: 案の識別子を payload に含め、返り値で判別する
// または Promise.allSettled() でエラーも捕捉する
const [resultA, resultB] = await Promise.allSettled([
  spawn({ agent: "my_editor_writer", prompt: "案A", meta: { label: "A" } }),
  spawn({ agent: "my_editor_writer", prompt: "案B", meta: { label: "B" } }),
])
```

### 12.4 Tauri IPC の過剰呼び出し

Tauri command は JavaScript ↔ Rust の境界越えコールであり、ms 単位のオーバーヘッドがある。
キーストロークごとに Tauri command を呼ぶと入力遅延が目立つ：

```typescript
// NG: 文字入力のたびに Tauri command を呼ぶ
onChange={(e) => {
  tauriInvoke("analyze_text", { text: e.target.value })  // ← 毎キーストローク
}}

// OK: デバウンスして呼び出し頻度を制限
import { useDebouncedCallback } from "use-debounce"

const analyzeDebounced = useDebouncedCallback(async (text: string) => {
  await tauriInvoke("analyze_text", { text })
}, 500)  // 500ms デバウンス
```

### 12.5 Inter-App API で bytes を直送しない

`app.handoff()` には **Pool / AMP の ID のみ**を渡す。bytes を直接 payload に入れてはいけない（HUB-024 §6.6 Inter-App API 原則）。

```typescript
// NG: bytes を直送
await app.handoff({
  to: "com.akari.x-sender",
  payload: {
    content: "この文章をそのまま...",   // ← 禁止（bytes 直送）
  },
})

// OK: Pool ID を渡す
const id = await pool.put({ bytes: textBytes, mime: "text/plain", tags: ["draft"] })
await app.handoff({
  to: "com.akari.x-sender",
  intent: "publish-draft",
  payload: {
    draft_ref: ampRecordId,    // AMP への参照
    assets: [id],              // Pool への参照
  },
})
```

### 12.6 Agent ID の命名違反

`agents/*.md` の ID を裸の名前で定義すると Certification Lint に弾かれる（ADR-011）。

```toml
# NG: prefix なし（Lint エラー）
[agents]
editor = "agents/editor.md"

# OK: <app-short-id>_<role>
[agents]
my_editor_writer = "agents/editor.md"
```

---

## 13. 次に読む / What to Read Next

| ドキュメント | 内容 |
|---|---|
| **API Reference** | 7 API 群（Agent / Memory / Context / UI / Inter-App / Permission / Skill）の型定義・メソッド全量 |
| **Cookbook** | よくあるパターンのレシピ集（自動保存 / HITL フロー / Agent 並列実行 等） |
| **Certification Guide** | Automated Lint / Contract Test / Manual Review の具体的な実行方法 |
| **MCP-Declarative Tier Guide** | 本ガイドと対比して読む軽量 Tier のガイド。Full ⇔ MCP-Declarative 移行の詳細 |
| **Migration Guide** | MCP-Declarative から Full Tier へ昇格する手順 |
| **App SDK spec (AKARI-HUB-024, Hub)** | HUB-024 — App SDK の仕様正典（7 API / Tier 制度 / Certification） |
| **spec-akari-writer.md** | Writer — Full Tier の公式リファレンス実装 |
| **ADR-007** | Shell Tech Stack — Tauri + React + Zustand + TanStack Router の選定理由 |
| **ADR-011** | App Agent Naming Convention — `<app-short-id>_<role>` の根拠 |

---

*本ガイドの最新版は `docs/guides/sdk/tiers/full-tier.md`（`akari-os` リポ）。*
*仕様の正典は App SDK spec (AKARI-HUB-024, Hub)。*
