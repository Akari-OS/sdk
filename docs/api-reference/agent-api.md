---
guide-id: AKARI-GUIDE-SDK-AGENT-API
version: 0.1.0
status: draft
created: 2026-04-19
updated: 2026-04-22
related-specs: [AKARI-HUB-024, AKARI-HUB-011, AKARI-HUB-006]
related-adrs: [ADR-011]
ai-context: claude-code
---

# Agent API リファレンス / Agent API Reference

> **対象読者**: App 開発者（Full Tier）
> **前提知識**: [`App SDK spec (AKARI-HUB-024, Hub)`](https://github.com/Akari-OS/.github/blob/main/VISION.md) §6.6(1)、[ADR-011 (Hub)]
> **関連ガイド**: Memory API / Permission API / Inter-App API

Agent API は、App が **Agent Runtime**（AKARI Core 内の実行環境）と対話するための契約です。
App はこの API を通じて、OS 標準の 7 体 reference defaults を呼び出したり、
自前のエージェントを登録・起動したりできます。

```
App 層
  └─ Agent API ←──────── このガイドの対象
        ↕
  Agent Runtime（AKARI Core 内）
        ↕
  CAA 思考層 / 記憶層 / 道具層
```

> **CAA 原則 — 仕様は固定、実行は揮発**
> エージェントは `agents/*.md` ファイルで仕様が定義されます。
> 呼ばれるたびに ephemeral に起動し、仕事を終えたら消えます。
> 状態は必ず Memory Layer（Pool / AMP）に書いてください。
> 状態をエージェント内部に保持してはいけません。

---

## 目次

1. [Agent API 概要](#1-agent-api-概要)
2. [Import & セットアップ](#2-import--セットアップ)
3. [Reference Defaults (7 体) の呼び出し](#3-reference-defaults-7-体-の呼び出し)
4. [独自 agent 登録（Full Tier）](#4-独自-agent-登録full-tier)
5. [`agent.invoke(id, prompt, options)`](#5-agentinvokeid-prompt-options)
6. [`agent.spawn(id, context)`](#6-agentspawnid-context)
7. [Agent Events](#7-agent-events)
8. [Handoff — App 間で agent を渡す](#8-handoff--app-間で-agent-を渡す)
9. [Timeout / Cancel](#9-timeout--cancel)
10. [Persona / Costume 切替](#10-persona--costume-切替)
11. [エラーハンドリング](#11-エラーハンドリング)
12. [型定義（TypeScript）](#12-型定義typescript)
13. [使用例](#13-使用例)
14. [関連 API](#14-関連-api)

---

## 1. Agent API 概要

### App と Agent Runtime の橋渡し

Agent Runtime は AKARI Core の一部として常駐し、エージェントのライフサイクル（spawn / run / destroy）を管理します。
App はこのランタイムに対して Agent API 経由で命令を送ります。

```
┌──────────────────────────────────────────────┐
│ App（あなたが書くコード）                       │
│   import { agent } from "@akari-os/sdk"       │
│   agent.invoke("partner", "下書きを整えて")   │
└───────────────────┬──────────────────────────┘
                    │ Agent API
┌───────────────────▼──────────────────────────┐
│ Agent Runtime（AKARI Core）                   │
│   ・reference defaults（7 体 / デフォルト）    │
│   ・App-supplied agents（登録した独自 agent）   │
│   ・CAA 着ぐるみ管理（spawn / destroy）        │
└──────────────────────────────────────────────┘
```

### 何ができるか

| 操作 | メソッド | 説明 |
|---|---|---|
| reference default を呼ぶ | `agent.reference.<role>.ask()` | Partner / Analyst 等を呼び出す |
| 独自 agent を登録する | `agent.register(id, spec)` | `agents/*.md` の仕様を Agent Runtime に登録 |
| agent を呼び出す | `agent.invoke(id, prompt, options)` | 1 回の応答を待つ（同期的に結果を受け取る） |
| agent を並列起動する | `agent.spawn(id, context)` | ephemeral な実行を並列で走らせる |
| persona を切り替える | `agent.switchPersona(appId)` | App 切替時にパートナーの人格を差し替える |
| ハンドオフする | `agent.handoff(id, payload)` | 別 App の agent に制御を渡す |

### Full Tier 限定

Agent API の `register` / `spawn` / `handoff` は **Full Tier App のみ**利用できます。
MCP-Declarative Tier では `agent.reference.*` と `agent.invoke` の読み取り系のみ使用できます。

---

## 2. Import & セットアップ

```typescript
import { agent } from "@akari-os/sdk"
```

セットアップは不要です。SDK を import すれば Agent Runtime との接続は自動で確立されます。

### App Manifest との関係

Agent API で操作できるのは、`akari.toml` の `[agents]` セクションで宣言したエージェントだけです。
宣言していないエージェントを `invoke` しようとすると `AgentNotFoundError` が発生します。

```toml
# akari.toml（Full Tier の例）
[agents]
writer_editor = "agents/editor.md"       # ADR-011: <app-short-id>_<role>
writer_reviewer = "agents/reviewer.md"
```

> **命名規約（ADR-011）**: エージェント ID は `<app-short-id>_<role>` の snake_case 形式。
> `app-short-id` は `akari.toml` の `[app] id` の末尾セグメントを snake_case 化したもの。
> 例: `com.akari.writer` → `writer`、`com.third.pdf-reader` → `pdf_reader`

---

## 3. Reference Defaults (7 体) の呼び出し

AKARI Core が標準で提供する 7 体（reference defaults）は、どの App からでも呼び出せます。
これらは OS が何もアプリを入れていない状態でのデフォルトセット（固定ではなく参考実装）です。

| 内向き英語名 | 外向き日本語名 | 主な役割 |
|---|---|---|
| `partner` | パートナー | ユーザー窓口・オーケストレーター |
| `analyst` | アナリスト | データ分析・パフォーマンス比較 |
| `researcher` | リサーチャー | Web 調査・トレンド分析 |
| `guardian` | ガーディアン | リスクチェック・ブランド保護 |
| `memoriist` | メモリスト | 記憶検索・ユーザー好み参照 |
| `operator` | オペレーター | SNS / メール / 決済の実行 |

> Studio（スタジオ担当）は独立エージェントではありません。
> パートナーがペルソナ切替（§10）で Writer / Director 等の専門性を直接発揮します。
> 詳細は `spec-agent-architecture-v2.md` §5 を参照してください。

### 3.1 パートナー（Partner）

```typescript
// 通常の会話
const reply = await agent.reference.partner.ask(
  "この下書きをカジュアルなトーンに整えて",
  { conversationId: "writer-session-abc" }
)

// ペルソナ付き（現在の App コンテキストを伝える）
const reply = await agent.reference.partner.ask(
  "この投稿のフックを3パターン出して",
  {
    conversationId: "writer-session-abc",
    appContext: "Writer モード — SNS コピーライティング",
  }
)
```

### 3.2 アナリスト（Analyst）

```typescript
const analysis = await agent.reference.analyst.ask(
  "先月の投稿30件のエンゲージメントパターンを分析して",
  {
    tools: ["pool_query", "analytics_fetch"],
    context: { timeRange: "2026-03" },
  }
)
```

### 3.3 リサーチャー（Researcher）

```typescript
const research = await agent.reference.researcher.ask(
  "動画コンテンツのトレンドを調べて要約して",
  { tools: ["web_search", "web_fetch"] }
)
```

### 3.4 ガーディアン（Guardian）

```typescript
// 投稿前のリスクチェック
const check = await agent.reference.guardian.ask(
  `この投稿テキストに炎上リスクがないか確認して: "${draftText}"`,
  { tools: ["content_check"] }
)

if (check.riskLevel === "high") {
  // Permission API と組み合わせて HITL ゲートを出す
  await permission.gate({
    action: "external-network.post",
    reason: `ガーディアンが高リスクと判定: ${check.reason}`,
    hitl: true,
  })
}
```

### 3.5 メモリスト（Memoriist）

```typescript
// ユーザーの好みや過去の傾向を検索
const memory = await agent.reference.memoriist.ask(
  "このユーザーが好むトーンと避ける表現を教えて",
  { tools: ["pool_search", "memory_read"] }
)
```

### 3.6 オペレーター（Operator）

```typescript
// SNS への投稿実行（Permission API の HITL ゲートと組み合わせること）
const result = await agent.reference.operator.ask(
  "この下書きを X に投稿して",
  {
    payload: { text: draftText, platform: "x" },
    requireHitl: true,  // 人間承認を強制
  }
)
```

> **注意**: オペレーターは外部への副作用（投稿・送信等）を実行します。
> `requireHitl: true` を指定するか、Permission API の HITL ゲートを事前に通してください。

---

## 4. 独自 agent 登録（Full Tier）

### 4.1 `agent.register(id, spec)`

App 固有のエージェントを Agent Runtime に登録します。
`akari.toml` の `[agents]` セクションに宣言してから呼び出してください。

**シグネチャ**

```typescript
function register(id: AgentId, spec: AgentSpec): void
```

**パラメータ**

| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | `AgentId` | ✅ | `<app-short-id>_<role>` の snake_case（ADR-011） |
| `spec.persona` | `string` | ✅ | エージェントの役割説明（system prompt の基礎） |
| `spec.specFile` | `string` | ✅ | `agents/` 配下の spec ファイルパス（`*.md`） |
| `spec.tools` | `string[]` | | 利用する MCP tool ID の配列 |
| `spec.model` | `ModelId` | | LLM モデル（省略時は Core のデフォルト） |
| `spec.maxTokens` | `number` | | 最大トークン数（省略時は Core のデフォルト） |

**使用例**

```typescript
import { agent } from "@akari-os/sdk"

// App 初期化時に登録する
agent.register("writer_editor", {
  persona: "あなたは熟練の文章編集者です。SNS コピーライティングに特化し、冒頭フックと読みやすさを最重視します。",
  specFile: "agents/editor.md",
  tools: ["pool.read", "amp.query"],
  model: "claude-sonnet-4-6",
})

agent.register("writer_reviewer", {
  persona: "あなたは厳格な品質レビュアーです。文体の一貫性とブランドガイドライン準拠を確認します。",
  specFile: "agents/reviewer.md",
  tools: ["pool.read"],
  model: "qwen/qwen-2.5-72b-instruct",  // 軽量モデルで十分なタスク
})
```

### 4.2 命名規約（ADR-011）

エージェント ID は必ず **`<app-short-id>_<role>`** の形式にしてください。

```
com.akari.writer  →  app-short-id = writer
  writer_editor           ✅
  writer_reviewer         ✅
  editor                  ❌ (prefix なし)
  partner                 ❌ (Core の reference default と衝突)
  writer-editor           ❌ (kebab-case 不可。snake_case のみ)
```

Manifest バリデータは `<app-short-id>_` prefix を自動チェックします。
prefix がなければ Certification Lint でエラーになります。

---

## 5. `agent.invoke(id, prompt, options)`

### 概要

エージェントを呼び出し、1 回の応答を待ちます。
エージェントは ephemeral に起動し、応答を返したら消えます。

### シグネチャ

```typescript
function invoke(
  id: AgentId | ReferenceDefaultId,
  prompt: string,
  options?: InvokeOptions
): Promise<InvokeResult>
```

### パラメータ

| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | `AgentId` | ✅ | エージェント ID（独自 or reference default） |
| `prompt` | `string` | ✅ | ユーザーからの指示文 |
| `options.context` | `AceContext` | | ACE で組み立てたコンテキスト（Context API） |
| `options.conversationId` | `string` | | 会話 ID（継続会話の場合に指定） |
| `options.tools` | `string[]` | | 追加で利用する MCP tool ID |
| `options.stream` | `boolean` | | `true` でストリーミング応答（デフォルト: `false`） |
| `options.signal` | `AbortSignal` | | キャンセル用シグナル（§9 参照） |
| `options.timeoutMs` | `number` | | タイムアウト (ms)（デフォルト: 120,000） |

### 戻り値 — `InvokeResult`

```typescript
interface InvokeResult {
  /** エージェントの応答テキスト */
  text: string
  /** 会話 ID（次のターンで使う） */
  conversationId: string
  /** 終了理由 */
  finishReason: "stop" | "max_tokens" | "abort" | "error"
  /** 使用トークン数 */
  usage: { inputTokens: number; outputTokens: number }
  /** 委譲情報（サブエージェントへの委譲があった場合） */
  delegations?: DelegationRecord[]
}
```

### ストリーミング応答

`options.stream: true` を指定すると `AsyncIterable<string>` を返します。

```typescript
// 非ストリーミング（デフォルト）
const result = await agent.invoke("writer_editor", "この下書きを整えて", {
  context: aceContext,
})
console.log(result.text)

// ストリーミング
const stream = await agent.invoke("writer_editor", "この下書きを整えて", {
  stream: true,
  context: aceContext,
})
for await (const chunk of stream) {
  process.stdout.write(chunk)
}
```

### コンテキストの渡し方

Context API（ACE）で組み立てたコンテキストを `options.context` に渡します。

```typescript
import { agent, ace } from "@akari-os/sdk"

// コンテキストを組み立てる
const context = await ace.build({
  intent: "下書きを読みやすいキャリア系投稿に整える",
  goal_ref: "AKARI-HUB-024",
  sources: [
    { kind: "pool", query: "recent-drafts" },
    { kind: "amp", filter: { kind: "style-preference" } },
  ],
})

// エージェントに渡す
const result = await agent.invoke("writer_editor", draftText, { context })
```

---

## 6. `agent.spawn(id, context)`

### 概要

エフェメラルなエージェントを非同期で起動します。
`invoke` との違いは「応答を待たずに起動し、結果は Promise で受け取る」点です。
CAA 準拠の fire-and-forget / 並列実行に使います。

### シグネチャ

```typescript
function spawn(
  id: AgentId | ReferenceDefaultId,
  context: SpawnContext
): Promise<SpawnHandle>
```

### パラメータ

| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | `AgentId` | ✅ | エージェント ID |
| `context.prompt` | `string` | ✅ | 指示文 |
| `context.aceContext` | `AceContext` | | ACE コンテキスト |
| `context.outputTarget` | `AmpWriteTarget` | | 結果の書き込み先 AMP 参照 |
| `context.onEvent` | `AgentEventHandler` | | イベントハンドラ（§7 参照） |
| `context.signal` | `AbortSignal` | | キャンセル用シグナル |

### 戻り値 — `SpawnHandle`

```typescript
interface SpawnHandle {
  /** spawn されたエージェントの実行 ID */
  executionId: string
  /** 完了を待つ Promise */
  result: Promise<InvokeResult>
  /** 強制終了 */
  abort: () => void
}
```

### 並列実行（Promise.all）

```typescript
// 複数案を並列で生成
const [variantA, variantB, variantC] = await Promise.all([
  agent.spawn("writer_editor", { prompt: "ビジネス向けトーンで整えて" }),
  agent.spawn("writer_editor", { prompt: "カジュアルなトーンで整えて" }),
  agent.spawn("writer_editor", { prompt: "ユーモアを交えて整えて" }),
])

const results = await Promise.all([
  variantA.result,
  variantB.result,
  variantC.result,
])
```

### バックグラウンド実行

```typescript
// 結果を AMP に書いて終了（Fire-and-forget パターン）
const handle = await agent.spawn("analyst", {
  prompt: "今週の投稿30件のパフォーマンスを分析して AMP に保存して",
  outputTarget: {
    kind: "amp",
    goal_ref: "AKARI-HUB-024",
    kind_label: "analysis-result",
  },
})

// 完了まで待たずに UI を返す
// ユーザーへの通知は Shell が通知パネルで行う
console.log(`分析を開始しました: ${handle.executionId}`)
```

---

## 7. Agent Events

エージェントの実行状態は `onEvent` ハンドラでリアルタイムに取得できます。

### イベント一覧

| イベント名 | 発火タイミング | payload |
|---|---|---|
| `on_start` | エージェントが起動した直後 | `{ executionId, agentId, startedAt }` |
| `on_progress` | 応答の chunk が届くたび（ストリーミング時） | `{ executionId, chunk, totalChars }` |
| `on_delegation` | サブエージェントに委譲した瞬間 | `{ executionId, delegateTo, reason }` |
| `on_complete` | 正常終了 | `{ executionId, result: InvokeResult }` |
| `on_error` | エラー終了 | `{ executionId, error: AgentError }` |
| `on_abort` | キャンセルされた | `{ executionId, abortedAt }` |

### 使用例

```typescript
const handle = await agent.spawn("writer_editor", {
  prompt: "この下書きを整えて",
  onEvent: (event) => {
    switch (event.type) {
      case "on_start":
        console.log(`[${event.agentId}] 起動しました`)
        break

      case "on_progress":
        // リアルタイムでテキストを表示
        updateEditorPreview(event.chunk)
        break

      case "on_delegation":
        // サブエージェント委譲の通知（Chat UI で折りたたみ表示）
        showDelegationBadge(event.delegateTo, event.reason)
        break

      case "on_complete":
        applyEditResult(event.result.text)
        break

      case "on_error":
        showErrorToast(event.error.message)
        break
    }
  },
})
```

### invoke でのイベント購読

`invoke` でもイベントを受け取れます。

```typescript
const result = await agent.invoke("writer_editor", prompt, {
  stream: true,
  onEvent: (event) => {
    if (event.type === "on_delegation") {
      showDelegationBadge(event.delegateTo, event.reason)
    }
  },
})
```

---

## 8. Handoff — App 間で agent を渡す

Handoff は、あるエージェントの実行コンテキストを別の App のエージェントに引き継ぐ操作です。
Inter-App API の `app.handoff()` と連携して使います。

> **重要**: Handoff で渡すのは **Pool / AMP の ID のみ**です。
> bytes / テキストを直接渡してはいけません（Inter-App API の原則）。

### `agent.handoff(agentId, payload)`

```typescript
function handoff(
  targetAgentId: AgentId,
  payload: HandoffPayload
): Promise<HandoffResult>
```

### パラメータ

| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `targetAgentId` | `AgentId` | ✅ | 引き継ぎ先エージェント ID |
| `payload.draftRef` | `AmpRecordId` | | 下書きの AMP 参照 ID |
| `payload.assets` | `PoolItemId[]` | | 素材の Pool 参照 ID 配列 |
| `payload.summary` | `string` | | 現在の作業の要約（LLM が自動生成） |
| `payload.userIntent` | `string` | | ユーザーの次の意図 |
| `payload.fromApp` | `string` | ✅ | 送信元 App ID |
| `payload.toApp` | `string` | ✅ | 送信先 App ID |

### 使用例 — Writer から Video へ

```typescript
import { agent, pool, amp, app } from "@akari-os/sdk"

// 1. 現在の下書きを AMP に記録
const draftRecord = await amp.record({
  kind: "draft",
  content: currentDraftText,
  goal_ref: "writer-to-video-handoff",
})

// 2. 素材を Pool に確認
const assets = await pool.search({ query: "current-work-assets" })
const assetIds = assets.map((a) => a.id)

// 3. Handoff ペイロードを組み立てて送る
await agent.handoff("video_director", {
  draftRef: draftRecord.id,
  assets: assetIds,
  summary: "SNS 用ショート動画の原稿作成が完了。動画化をお願いします。",
  userIntent: "下書きを元に 60 秒のショート動画を作りたい",
  fromApp: "com.akari.writer",
  toApp: "com.akari.video",
})

// 4. Inter-App API で App を切り替える
await app.handoff({
  to: "com.akari.video",
  intent: "create-video-from-draft",
  payload: {
    draft_ref: draftRecord.id,
    assets: assetIds,
  },
})
```

### Handoff Note の自動生成

`agent.handoff()` を呼ぶと、パートナー（Partner）が現在の会話から **Handoff Note** を自動生成します。
この Note は次の App の系プロンプトに自動注入され、「さっきの下書きを踏まえた動画ですね」と
即座に対応できるようになります。

```typescript
// Handoff Note の構造（自動生成されるが内容を確認できる）
interface HandoffNote {
  fromApp: string           // 送信元 App
  summary: string           // やり取りの要約（LLM が自動生成）
  payload: Record<string, unknown>  // 下書き・調査結果等の ID 参照
  userIntent: string        // ユーザーが次に何をしたいか
  createdAt: number         // Unix ms
}
```

---

## 9. Timeout / Cancel

### タイムアウト設定

デフォルトのタイムアウトは **120 秒**です。`options.timeoutMs` で上書きできます。

```typescript
// 30 秒でタイムアウト
const result = await agent.invoke("writer_editor", prompt, {
  timeoutMs: 30_000,
})
```

タイムアウトが発生すると `AgentTimeoutError` がスローされます。

### AbortSignal によるキャンセル

```typescript
const controller = new AbortController()

// 5 秒後に自動キャンセル
const timer = setTimeout(() => controller.abort(), 5_000)

try {
  const result = await agent.invoke("researcher", prompt, {
    signal: controller.signal,
  })
  clearTimeout(timer)
  return result
} catch (err) {
  if (err instanceof AgentAbortError) {
    console.log("ユーザーによってキャンセルされました")
  }
  throw err
}
```

### spawn のキャンセル

```typescript
const handle = await agent.spawn("analyst", { prompt: "..." })

// UI でキャンセルボタンが押されたら
onCancelButtonClick(() => {
  handle.abort()
})

// 結果を待つ
try {
  const result = await handle.result
} catch (err) {
  if (err instanceof AgentAbortError) {
    // キャンセル成功
  }
}
```

> **注意**: キャンセル時、エージェントが途中まで記憶層に書いたデータは残ります。
> 不完全なデータが問題になる場合は、完了後に AMP のクリーンアップを行ってください。

---

## 10. Persona / Costume 切替

### 概要

CAA（Costume Agent Architecture）では、エージェントは「着ぐるみ（コスチューム）を着た LLM」です。
`agent.switchPersona()` を使うと、パートナーの system prompt を切り替えて、
App に合わせた専門性を持たせられます。

これは App が Shell に mount される際に自動で呼ばれますが、手動で呼び出すこともできます。

### `agent.switchPersona(appId, options?)`

```typescript
function switchPersona(
  appId: string,
  options?: PersonaSwitchOptions
): Promise<void>
```

### パラメータ

| 名前 | 型 | 必須 | 説明 |
|---|---|---|---|
| `appId` | `string` | ✅ | 切り替え先 App の ID |
| `options.systemPromptSuffix` | `string` | | パートナーの system prompt に追加するテキスト |
| `options.agentName` | `string` | | Chat ヘッダーに表示するエージェント名（外向き日本語） |
| `options.agentNameInternal` | `string` | | Agent Runtime 内の英語識別名 |
| `options.mcpServer` | `string` | | 接続する MCP サーバー名 |
| `options.generateHandoffNote` | `boolean` | | ペルソナ切替時に Handoff Note を自動生成するか（デフォルト: `true`） |

### 使用例

```typescript
// App が Mount された時点でパートナーのペルソナを切り替える
await agent.switchPersona("com.akari.writer", {
  systemPromptSuffix: `あなたは今 Writer モードです。SNS 投稿のコピーライティングが専門。
    冒頭フック、文字数制限、プラットフォーム特性を熟知しています。`,
  agentName: "パートナー（Writer）",          // 外向き日本語
  agentNameInternal: "Partner (Writer)",      // 内向き英語
  mcpServer: "writer-tools",
})
```

### ペルソナと CAA の関係

```
着ぐるみ = system prompt + ツールセット
  │
  ├── パートナー素（デフォルト）: 何も App が入っていない状態
  ├── パートナー（Writer）:     Writer App が mount された状態
  ├── パートナー（Director）:   Video App が mount された状態
  └── ...

着ぐるみを脱いでも、記憶層（Pool / AMP）のデータは消えない。
```

### 切替時の Handoff Note

`generateHandoffNote: true`（デフォルト）の場合、ペルソナ切替前に現在の会話から
Handoff Note が自動生成され、次のペルソナの system prompt に注入されます。

---

## 11. エラーハンドリング

### エラークラス一覧

すべてのエラーは `AgentError` を基底クラスとして継承します。

```typescript
import { AgentError, AgentNotFoundError, AgentTimeoutError, AgentAbortError, AgentPermissionError, AgentInvalidSpecError } from "@akari-os/sdk"
```

| エラークラス | コード | 発生条件 |
|---|---|---|
| `AgentError` | `AGENT_ERROR` | 予期しないエラー（基底クラス） |
| `AgentNotFoundError` | `AGENT_NOT_FOUND` | 指定した `id` のエージェントが存在しない |
| `AgentTimeoutError` | `AGENT_TIMEOUT` | タイムアウト（デフォルト 120s）が発生した |
| `AgentAbortError` | `AGENT_ABORT` | `AbortSignal` によってキャンセルされた |
| `AgentPermissionError` | `AGENT_PERMISSION_DENIED` | Permission API のゲートが通っていない |
| `AgentInvalidSpecError` | `AGENT_INVALID_SPEC` | `specFile` や `id` の形式が不正（ADR-011 違反等） |
| `AgentRuntimeError` | `AGENT_RUNTIME_ERROR` | Agent Runtime 側のエラー（Core 内部問題） |
| `AgentNameConflictError` | `AGENT_NAME_CONFLICT` | `id` が Core の reference defaults と衝突している |

### エラーコード詳細

| コード | HTTP 相当 | 対処 |
|---|---|---|
| `AGENT_NOT_FOUND` | 404 | `akari.toml` の `[agents]` セクションに宣言があるか確認 |
| `AGENT_TIMEOUT` | 408 | `timeoutMs` を増やすか、タスクを小さく分割する |
| `AGENT_ABORT` | 499 | ユーザーによるキャンセル。正常ケース |
| `AGENT_PERMISSION_DENIED` | 403 | `akari.toml` の `[permissions]` で必要な権限を宣言する |
| `AGENT_INVALID_SPEC` | 400 | `id` が `<app-short-id>_<role>` 形式に準拠しているか確認 |
| `AGENT_RUNTIME_ERROR` | 500 | Core の問題。ログを確認して報告 |
| `AGENT_NAME_CONFLICT` | 409 | `partner` / `analyst` 等の予約語を `id` に使っていないか確認 |

### エラーハンドリング例

```typescript
import {
  AgentError,
  AgentNotFoundError,
  AgentTimeoutError,
  AgentPermissionError,
} from "@akari-os/sdk"

try {
  const result = await agent.invoke("writer_editor", prompt)
  return result
} catch (err) {
  if (err instanceof AgentNotFoundError) {
    // akari.toml に writer_editor が宣言されていない
    console.error("エージェントが見つかりません:", err.agentId)
    // 開発時: akari.toml の [agents] セクションを確認
  } else if (err instanceof AgentTimeoutError) {
    // タイムアウト
    console.warn(`タイムアウト (${err.timeoutMs}ms): タスクを小さく分割してください`)
  } else if (err instanceof AgentPermissionError) {
    // 権限不足
    console.error("権限が不足しています:", err.requiredPermission)
    // akari.toml の [permissions] を確認
  } else if (err instanceof AgentError) {
    // その他のエージェントエラー
    console.error(`AgentError [${err.code}]:`, err.message)
  } else {
    throw err  // 想定外は再スロー
  }
}
```

---

## 12. 型定義（TypeScript）

```typescript
// ======================================================================
// Agent ID
// ======================================================================

/** App-supplied agent の ID: <app-short-id>_<role> の snake_case */
type AgentId = string

/** Core の reference default エージェント ID */
type ReferenceDefaultId =
  | "partner"
  | "analyst"
  | "researcher"
  | "guardian"
  | "memoriist"
  | "operator"

// ======================================================================
// Agent 登録
// ======================================================================

interface AgentSpec {
  /** エージェントの役割説明（system prompt の基礎） */
  persona: string
  /** agents/ 配下の spec ファイルパス（*.md） */
  specFile: string
  /** 利用する MCP tool ID の配列 */
  tools?: string[]
  /** LLM モデル（省略時は Core デフォルト） */
  model?: ModelId
  /** 最大トークン数 */
  maxTokens?: number
}

// ======================================================================
// invoke / spawn オプション
// ======================================================================

interface InvokeOptions {
  /** ACE で組み立てたコンテキスト */
  context?: AceContext
  /** 継続会話の ID */
  conversationId?: string
  /** 追加する MCP tool ID */
  tools?: string[]
  /** true でストリーミング応答 */
  stream?: boolean
  /** キャンセル用シグナル */
  signal?: AbortSignal
  /** タイムアウト (ms) デフォルト: 120,000 */
  timeoutMs?: number
  /** イベントハンドラ */
  onEvent?: AgentEventHandler
}

interface SpawnContext {
  prompt: string
  aceContext?: AceContext
  /** 結果の書き込み先 AMP 参照 */
  outputTarget?: AmpWriteTarget
  onEvent?: AgentEventHandler
  signal?: AbortSignal
}

// ======================================================================
// 結果
// ======================================================================

interface InvokeResult {
  text: string
  conversationId: string
  finishReason: "stop" | "max_tokens" | "abort" | "error"
  usage: { inputTokens: number; outputTokens: number }
  delegations?: DelegationRecord[]
}

interface SpawnHandle {
  executionId: string
  result: Promise<InvokeResult>
  abort: () => void
}

interface DelegationRecord {
  delegateTo: AgentId | ReferenceDefaultId
  reason: string
  result: InvokeResult
  startedAt: number
  completedAt: number
}

// ======================================================================
// Events
// ======================================================================

type AgentEvent =
  | { type: "on_start"; executionId: string; agentId: AgentId; startedAt: number }
  | { type: "on_progress"; executionId: string; chunk: string; totalChars: number }
  | { type: "on_delegation"; executionId: string; delegateTo: AgentId; reason: string }
  | { type: "on_complete"; executionId: string; result: InvokeResult }
  | { type: "on_error"; executionId: string; error: AgentError }
  | { type: "on_abort"; executionId: string; abortedAt: number }

type AgentEventHandler = (event: AgentEvent) => void

// ======================================================================
// Handoff
// ======================================================================

interface HandoffPayload {
  draftRef?: AmpRecordId
  assets?: PoolItemId[]
  summary?: string
  userIntent?: string
  fromApp: string
  toApp: string
}

interface HandoffResult {
  handoffId: string
  handoffNote: HandoffNote
  ampRecordId: AmpRecordId
}

interface HandoffNote {
  fromApp: string
  summary: string
  payload: Record<string, unknown>
  userIntent: string
  createdAt: number
}

// ======================================================================
// Persona
// ======================================================================

interface PersonaSwitchOptions {
  systemPromptSuffix?: string
  agentName?: string
  agentNameInternal?: string
  mcpServer?: string
  generateHandoffNote?: boolean
}

// ======================================================================
// Errors
// ======================================================================

class AgentError extends Error {
  code: string
  agentId?: AgentId
}

class AgentNotFoundError extends AgentError {
  code: "AGENT_NOT_FOUND"
  agentId: AgentId
}

class AgentTimeoutError extends AgentError {
  code: "AGENT_TIMEOUT"
  timeoutMs: number
}

class AgentAbortError extends AgentError {
  code: "AGENT_ABORT"
}

class AgentPermissionError extends AgentError {
  code: "AGENT_PERMISSION_DENIED"
  requiredPermission: string
}

class AgentInvalidSpecError extends AgentError {
  code: "AGENT_INVALID_SPEC"
  reason: string
}

class AgentRuntimeError extends AgentError {
  code: "AGENT_RUNTIME_ERROR"
}

class AgentNameConflictError extends AgentError {
  code: "AGENT_NAME_CONFLICT"
  conflictWith: ReferenceDefaultId
}

// ======================================================================
// 型エイリアス（他 API との連携）
// ======================================================================

type AceContext = import("@akari-os/sdk").AceContext
type AmpRecordId = string
type PoolItemId = string
type ModelId = string

interface AmpWriteTarget {
  kind: "amp"
  goal_ref: string
  kind_label: string
}
```

---

## 13. 使用例

### 例 1: Writer で Partner を呼ぶ

Writer App がパートナーに下書き改善を依頼するシナリオです。

```typescript
// apps/writer/src/editor-panel.tsx
import { agent, ace, amp } from "@akari-os/sdk"

export async function improveWithPartner(draftText: string) {
  // 1. コンテキストを組み立てる
  const context = await ace.build({
    intent: "SNS 投稿用の下書きを読みやすく整える",
    goal_ref: "writer-improve-draft",
    sources: [
      { kind: "pool", query: "recent-drafts" },
      { kind: "amp", filter: { kind: "style-preference" } },
    ],
  })

  // 2. パートナーに依頼する
  const result = await agent.invoke("partner", draftText, {
    context,
    conversationId: currentConversationId,
    onEvent: (event) => {
      if (event.type === "on_delegation") {
        // サブエージェント委譲の通知を UI に表示
        showDelegationIndicator(event.delegateTo)
      }
    },
  })

  // 3. 結果を AMP に記録する（Memory API）
  await amp.record({
    kind: "draft-revision",
    content: result.text,
    goal_ref: "writer-improve-draft",
  })

  return result.text
}
```

### 例 2: Publisher で Operator を呼ぶ

Publisher App がオペレーターに SNS 投稿を依頼するシナリオです。
HITL（Human-in-the-loop）ゲートを通してから実行します。

```typescript
// apps/publisher/src/post-action.ts
import { agent, permission } from "@akari-os/sdk"

export async function publishToX(draftText: string) {
  // 1. Guardian でリスクチェック（事前審査）
  const guardianResult = await agent.invoke("guardian", draftText, {
    timeoutMs: 30_000,
  })

  if (guardianResult.text.includes("HIGH_RISK")) {
    throw new Error("ガーディアンが高リスクと判定しました。投稿を見直してください。")
  }

  // 2. HITL ゲートを通す（人間承認必須）
  await permission.gate({
    action: "external-network.post",
    reason: `X に投稿: "${draftText.slice(0, 30)}..."`,
    hitl: true,   // ユーザーに承認プロンプトを出す
  })

  // 3. 承認が得られたらオペレーターに投稿を依頼
  const result = await agent.invoke("operator", "この内容を X に投稿して", {
    context: { platform: "x", text: draftText },
  })

  return result
}
```

### 例 3: App 固有の writer_editor を使う

Writer App が自前の `writer_editor` エージェントを登録・呼び出すシナリオです。

```typescript
// apps/writer/src/index.ts — App 初期化
import { agent } from "@akari-os/sdk"

// App ロード時に登録
agent.register("writer_editor", {
  persona: `あなたは SNS コピーライティングに特化した編集者です。
    冒頭の1行フックを最重視し、スクロールを止める言葉を選びます。
    文字数制限（X: 280字、note: 制限なし等）を常に意識してください。`,
  specFile: "agents/editor.md",
  tools: ["pool.read", "amp.query"],
  model: "claude-sonnet-4-6",
})

agent.register("writer_reviewer", {
  persona: "あなたは品質レビュアーです。文体の一貫性とブランドガイドライン準拠を確認します。",
  specFile: "agents/reviewer.md",
  tools: ["pool.read"],
  model: "qwen/qwen-2.5-72b-instruct",
})
```

```typescript
// apps/writer/src/editor-panel.tsx — 実際の呼び出し
import { agent } from "@akari-os/sdk"

export async function editAndReview(draftText: string) {
  // 1. 編集者が下書きを整える
  const edited = await agent.invoke("writer_editor", draftText)

  // 2. レビュアーが並列でチェック（spawn で非同期）
  const reviewHandle = await agent.spawn("writer_reviewer", {
    prompt: `この編集済みテキストのブランドガイドライン準拠チェックをして: "${edited.text}"`,
  })

  // 3. 編集結果を返しながら、バックグラウンドでレビューを継続
  const reviewResult = await reviewHandle.result

  return {
    editedText: edited.text,
    reviewNotes: reviewResult.text,
  }
}
```

### 例 4: 並列調査 + 統合

複数のリサーチャーを並列起動して結果をまとめるシナリオです。

```typescript
import { agent, amp } from "@akari-os/sdk"

export async function conductResearch(topics: string[]) {
  // 各トピックを並列で調査（spawn で一気に起動）
  const handles = await Promise.all(
    topics.map((topic) =>
      agent.spawn("researcher", {
        prompt: `"${topic}" についての最新トレンドを調査して3点にまとめて`,
        outputTarget: {
          kind: "amp",
          goal_ref: "research-session-001",
          kind_label: "research-result",
        },
      })
    )
  )

  // 全リサーチャーの完了を待つ
  const results = await Promise.all(handles.map((h) => h.result))

  // パートナーが統合サマリを作る
  const summary = await agent.invoke(
    "partner",
    `以下の調査結果を統合して実行可能な洞察を3つ出して:\n${results.map((r) => r.text).join("\n---\n")}`
  )

  // AMP に記録
  await amp.record({
    kind: "research-summary",
    content: summary.text,
    goal_ref: "research-session-001",
  })

  return summary.text
}
```

---

## 14. 関連 API

### CAA — Costume Agent Architecture

Agent API はすべて CAA の設計原則に従います。
エージェントの lifecycle（spawn / run / destroy）、3 層分離（思考 / 道具 / 記憶）の詳細は
`spec-agent-architecture-v2.md`（Agent Architecture (internal spec)）と `VISION.md` の CAA セクションを参照してください。

### Memory API — 結果を AMP / Pool に保存

エージェントの実行結果は Memory API で記憶層に書いてください。

```typescript
import { amp } from "@akari-os/sdk"

const result = await agent.invoke("writer_editor", prompt)

// 結果を AMP に記録（goal_ref は必須）
await amp.record({
  kind: "ai-edit-result",
  content: result.text,
  goal_ref: "writer-improve-draft",
})
```

詳細は [Memory API リファレンス](./memory-api.md) を参照してください。

### Permission API — invoke 前の承認

外部への副作用を伴うエージェント呼び出し（特に `operator`）の前には
Permission API で HITL ゲートを通してください。

```typescript
import { permission } from "@akari-os/sdk"

// HITL ゲート（人間承認必須）
await permission.gate({
  action: "external-network.post",
  reason: "X に投稿する前の確認",
  hitl: true,
})

// 承認後にオペレーターを呼ぶ
const result = await agent.invoke("operator", "X に投稿して", { ... })
```

詳細は [Permission API リファレンス](./permission-api.md) を参照してください。

### Context API — コンテキストの組み立て

`invoke` の `options.context` には ACE で組み立てたコンテキストを渡してください。
`goal_ref` は必須です（traceability）。

```typescript
import { ace } from "@akari-os/sdk"

const context = await ace.build({
  intent: "下書きを整える",
  goal_ref: "writer-session-001",
  sources: [...],
})

const result = await agent.invoke("writer_editor", prompt, { context })
```

詳細は [Context API リファレンス](./context-api.md) を参照してください。

---

## 付録: 命名規約クイックリファレンス（ADR-011）

| パターン | 正誤 | 理由 |
|---|---|---|
| `writer_editor` | ✅ | `com.akari.writer` → app-short-id `writer` |
| `pdf_reader_extractor` | ✅ | `com.third.pdf-reader` → app-short-id `pdf_reader` |
| `editor` | ❌ | prefix なし |
| `partner` | ❌ | Core reference default と衝突 |
| `writer-editor` | ❌ | kebab-case 不可 |
| `WriterEditor` | ❌ | PascalCase 不可 |
| `WRITER_EDITOR` | ❌ | 大文字不可 |

> 詳細: [ADR-011 (Hub)]
