---
title: Context API リファレンス
version: 0.1.0
status: draft
created: 2026-04-19
updated: 2026-04-22
related-specs: [AKARI-HUB-024]
ai-context: claude-code
---

# Context API リファレンス

App が Agent Runtime に渡す context（ACE 準拠）を組み立てるための API 仕様。

---

## 1. 概要 — ACE (Agent Context Engineering) との関係

AKARI OS では、すべての AI 推論は **ACE（Agent Context Engineering）** に準拠した context オブジェクトを受け取る。ACE は「AI に何をどう見せるか」の設計論であり、context の品質が応答品質を直接決める。

Context API（`@akari/sdk` の `context` 名前空間）は、App 開発者が ACE 準拠の context を安全に組み立てるための SDK レイヤーである。直接 prompt 文字列を組み立てる代わりに、型付きの `ContextItem` を積み上げ、SDK が token budget 管理・優先度ソート・Lint チェックを行う。

```
App コード
  │
  ▼ context.build(items) / context.select({ goal, budget })
Context API（本 spec）
  │
  ▼ ACE 準拠 context オブジェクト
Agent Runtime（invoke / spawn）
  │
  ▼ LLM（Claude）
```

### 1.1 設計の核

- **goal_ref 必須**: 全 context に `goal_ref`（ゴール ID）を付ける。記憶はゴールに紐づかないと意味がない
- **token budget を意識する**: budget を超えるアイテムは priority-based に切り落とされる
- **Lint で品質を守る**: `context.lint()` が機密情報混入・goal 紐付けなし等を検出する
- **記憶層から素材を取る**: `ContextItem` の source は Pool / AMP / Handoff（Context Handoff / Context Selection）

---

## 2. `context.build(items)`

`ContextItem` 配列を受け取り、ACE 準拠の context オブジェクトを生成する。

### シグネチャ

```typescript
import { context } from "@akari/sdk"

function build(items: ContextItem[]): Promise<AceContext>
```

### 引数

| パラメータ | 型 | 必須 | 説明 |
|---|---|:-:|---|
| `items` | `ContextItem[]` | ✅ | context を構成するアイテム配列。空配列は許可されない |

### 戻り値: `AceContext`

```typescript
interface AceContext {
  /** ACE バージョン */
  ace_version: string
  /** ゴール参照 ID（全アイテム共通） */
  goal_ref: string
  /** パッキング済みアイテム（budget に収まった分） */
  items: PackedContextItem[]
  /** 使用トークン数（推定） */
  token_count: number
  /** budget を超えて除外されたアイテム数 */
  truncated_count: number
  /** 生成タイムスタンプ */
  timestamp: string
}
```

### 動作

1. `items` を `score` 降順でソートする
2. 先頭から順に token_budget に収まる分だけ `PackedContextItem` に変換する
3. 収まらなかったアイテムは `truncated_count` に計上する
4. ACE バージョン・goal_ref・タイムスタンプを付与した `AceContext` を返す

### 使用例

```typescript
import { context, pool, amp } from "@akari/sdk"

// Pool から素材を取得
const draft = await pool.get(draftId)
const styleMemory = await amp.query({ kind: "style-preference", goal_ref: "AKARI-HUB-024" })

const aceCtx = await context.build([
  {
    id: "draft-001",
    kind: "pool-item",
    source: { type: "pool", id: draftId },
    score: 1.0,
    content: draft.text,
    goal_ref: "AKARI-HUB-024",
  },
  {
    id: "style-001",
    kind: "amp-memory",
    source: { type: "amp", filter: { kind: "style-preference" } },
    score: 0.8,
    content: styleMemory[0]?.content ?? "",
    goal_ref: "AKARI-HUB-024",
  },
])

// Agent Runtime に渡す
const result = await invoke({
  agent: "writer_editor",
  prompt: "この下書きを整えて",
  context: aceCtx,
})
```

---

## 3. `context.select({ goal, budget })`

**自動セレクション**（Context Selection 準拠）。goal とトークン予算を指定すると、記憶層（Pool / AMP）を横断して関連性スコアが高い `ContextItem` を自動収集し、`AceContext` を返す。

### シグネチャ

```typescript
function select(options: SelectOptions): Promise<AceContext>
```

### `SelectOptions`

```typescript
interface SelectOptions {
  /** ゴール参照 ID（必須） */
  goal_ref: string
  /** 自然言語で表現した目的 */
  goal: string
  /** token budget（上限、デフォルト 8000） */
  budget?: number
  /** 絞り込むソース（省略時は全ソース） */
  sources?: Array<"pool" | "amp" | "handoff" | "selection">
  /** アイテム種別フィルタ */
  kinds?: ContextItemKind[]
  /** 最大アイテム数（デフォルト 20） */
  max_items?: number
}
```

### 動作

1. `goal` のベクトル表現を計算し、Pool / AMP を意味的に検索する
2. 各アイテムに relevance score を付与する（Pool: semantic similarity、AMP: goal_ref 一致度）
3. Context Selection の `ContextType`（`text-selection` / `element-ref` 等）の Handoff バッファも取り込む
4. budget に収まるよう priority-based truncation を適用し `AceContext` を返す

### 使用例

```typescript
import { context } from "@akari/sdk"

// 目的を宣言するだけで記憶層から関連情報を自動収集
const aceCtx = await context.select({
  goal_ref: "AKARI-HUB-024",
  goal: "動画編集の提案を作る",
  budget: 6000,
  sources: ["pool", "amp"],
  kinds: ["pool-item", "amp-memory"],
})

const result = await invoke({
  agent: "video_planner",
  prompt: "最近の素材で構成案を作って",
  context: aceCtx,
})
```

---

## 4. `ContextItem` 型

`context.build()` に渡す 1 つの context ピースを表す。

### 型定義

```typescript
interface ContextItem {
  /** App スコープでユニークな ID */
  id: string
  /** アイテム種別（§4.1 参照） */
  kind: ContextItemKind
  /** 素材の出所 */
  source: ContextItemSource
  /**
   * 優先度スコア（0.0〜1.0）
   * budget を超えた場合、score が低いアイテムから除外される
   */
  score: number
  /** AI に渡すテキスト表現 */
  content: string
  /** ゴール参照 ID（必須） */
  goal_ref: string
  /** 人間向けのラベル（UI チップ表示用） */
  label?: string
  /** メタデータ（kind 固有の追加情報） */
  meta?: Record<string, unknown>
}
```

### 4.1 `ContextItemKind`

```typescript
type ContextItemKind =
  | "pool-item"        // Pool に格納された素材（テキスト / 画像 / 動画）
  | "amp-memory"       // AMP の記憶・判断ログ
  | "text-selection"   // UI のテキスト選択（Context Selection / Context Handoff）
  | "element-ref"      // UI の要素参照（Context Selection / Context Handoff）
  | "file-ref"         // ファイルへの参照
  | "image-region"     // 画像の矩形領域
  | "video-frame"      // 動画の 1 フレーム
  | "video-range"      // 動画の時間範囲
  | "m2c-feature"      // M2C で抽出したメディア意味特徴（§7 参照）
  | "system-note"      // App が追加するシステム的注記
```

### 4.2 `ContextItemSource`

```typescript
type ContextItemSource =
  | { type: "pool"; id: string }
  | { type: "amp"; filter: AmpQueryFilter }
  | { type: "handoff"; session_id: string }
  | { type: "selection"; app: string }
  | { type: "inline" }   // App が直接組み立てたインラインデータ
```

---

## 5. Budget / Truncation

token budget 内で最大限の情報密度を実現するための priority-based selection。

### 5.1 budget のデフォルト値

| 用途 | デフォルト budget（token） |
|---|---|
| `context.build()` | 8,000 |
| `context.select()` | 8,000 |
| `invoke()` への渡し方 | `context.token_count` を確認して調整推奨 |

### 5.2 truncation ロジック

```typescript
// SDK 内部の擬似コード
function packItems(items: ContextItem[], budget: number): PackResult {
  // 1. score 降順にソート
  const sorted = [...items].sort((a, b) => b.score - a.score)

  const packed: PackedContextItem[] = []
  let remaining = budget

  for (const item of sorted) {
    const tokens = estimateTokens(item.content)
    if (tokens <= remaining) {
      packed.push({ ...item, token_count: tokens })
      remaining -= tokens
    }
    // 収まらなければスキップ（truncated_count に加算）
  }

  return { packed, truncated: sorted.length - packed.length }
}
```

### 5.3 score の指針

| score 範囲 | 使いどころ |
|---|---|
| `1.0` | 絶対に省略不可（現在のユーザー指示・選択範囲等） |
| `0.8〜0.9` | 強く関連（当該 goal の最重要記憶・直近の素材） |
| `0.5〜0.7` | 参考情報（スタイル preference・過去の下書き） |
| `0.1〜0.4` | あれば良い程度（汎用背景情報・古い素材） |

### 5.4 budget を明示的に指定する

```typescript
const aceCtx = await context.build(items)

// token_count を確認してから invoke
console.log(`context: ${aceCtx.token_count} tokens, truncated: ${aceCtx.truncated_count} items`)

const result = await invoke({
  agent: "writer_editor",
  prompt: "整えて",
  context: aceCtx,
})
```

---

## 6. Handoff（Context Handoff）— App 間 context 引き継ぎ

Context Handoff (internal spec) が記憶層に書き込んだ Selection データを、Context API を通じて取り込む仕組み。

### 6.1 Handoff とは

UI でのユーザー操作（テキスト範囲選択・要素選択等）は `focus.md` の `## Current Selection` セクションに YAML 形式で書き込まれる。Context API はこのバッファを `kind: "text-selection"` / `kind: "element-ref"` として自動で `ContextItem` に変換する。

### 6.2 Handoff ContextItem の取り込み

```typescript
import { context } from "@akari/sdk"

// Handoff バッファ（focus.md の Current Selection）を含めた context 生成
const aceCtx = await context.select({
  goal_ref: "AKARI-HUB-024",
  goal: "選択範囲を関西弁に書き直す",
  sources: ["selection", "amp"],  // "selection" で Handoff バッファを参照
  budget: 4000,
})
```

### 6.3 手動で Handoff アイテムを追加する

```typescript
import { context, shell } from "@akari/sdk"

// Shell から現在の Selection を取得
const sel = await shell.getCurrentSelection()

if (sel?.selection_type === "text-range") {
  const aceCtx = await context.build([
    {
      id: "current-selection",
      kind: "text-selection",
      source: { type: "selection", app: sel.app },
      score: 1.0,   // 選択範囲は最優先
      content: sel.target.content_snippet,
      goal_ref: "AKARI-HUB-024",
      label: `選択範囲: L${sel.target.line_start}–${sel.target.line_end}`,
      meta: {
        file: sel.target.file,
        offset: sel.target.offset,
        length: sel.target.length,
      },
    },
  ])

  const result = await invoke({
    agent: "writer_editor",
    prompt: "この部分を関西弁にして",
    context: aceCtx,
  })
}
```

### 6.4 App 間 Handoff（Inter-App）

Inter-App handoff（HUB-024 §6.5）で Writer → Video へ渡された `draft_ref` を context に取り込む例：

```typescript
import { context, pool } from "@akari/sdk"

// Video App が Writer からの handoff を受け取る
app.onHandoff(async (payload) => {
  const draft = await pool.get(payload.draft_ref)

  const aceCtx = await context.build([
    {
      id: "writer-draft",
      kind: "pool-item",
      source: { type: "pool", id: payload.draft_ref },
      score: 1.0,
      content: draft.text,
      goal_ref: payload.goal_ref ?? "unknown",
      label: "Writer からの下書き",
    },
  ])

  await invoke({
    agent: "video_planner",
    prompt: "この下書きをもとに動画の構成を提案して",
    context: aceCtx,
  })
})
```

---

## 7. M2C 統合 — メディアの意味抽出結果を context に入れる

M2C（Media to Context）プロトコルでメディアから抽出した意味的特徴を `kind: "m2c-feature"` として context に追加できる。

### 7.1 M2C とは

M2C はメディア（画像・動画・音声等）から「何が写っているか」「どんな雰囲気か」等を構造化データとして抽出するプロトコル。Pool の素材に自動的に付与されることが多い。

### 7.2 M2C 特徴量を context に追加する

```typescript
import { context, pool } from "@akari/sdk"
import { m2c } from "@akari/m2c"

const videoItem = await pool.get(videoId)

// M2C で特徴量を抽出
const features = await m2c.extract({
  source: { type: "pool", id: videoId },
  extract: ["scene-description", "mood", "objects", "transcript"],
})

const aceCtx = await context.build([
  // 動画本体への参照
  {
    id: "video-ref",
    kind: "pool-item",
    source: { type: "pool", id: videoId },
    score: 0.9,
    content: `動画ファイル: ${videoItem.meta.filename} (${videoItem.meta.duration})`,
    goal_ref: "AKARI-HUB-024",
  },
  // M2C 意味特徴
  {
    id: "m2c-scene",
    kind: "m2c-feature",
    source: { type: "inline" },
    score: 0.85,
    content: features.scene_description,
    goal_ref: "AKARI-HUB-024",
    label: "シーン説明",
    meta: { extractor: "m2c", feature_type: "scene-description" },
  },
  {
    id: "m2c-transcript",
    kind: "m2c-feature",
    source: { type: "inline" },
    score: 0.8,
    content: features.transcript ?? "",
    goal_ref: "AKARI-HUB-024",
    label: "書き起こし",
    meta: { extractor: "m2c", feature_type: "transcript" },
  },
])
```

### 7.3 M2C アイテムのスコア指針

| 特徴量タイプ | 推奨スコア |
|---|---|
| `transcript`（書き起こし） | `0.9`（テキスト理解に直結） |
| `scene-description` | `0.8` |
| `mood` / `style` | `0.6`（補助情報） |
| `objects` / `tags` | `0.4`（構造的メタ情報） |

---

## 8. Pool / AMP との連携 — query → select → build のフロー

典型的な context 構築フローは **query → select → build** の 3 ステップ。

### 8.1 フロー全体図

```
Pool.search(query)          AMP.query(filter)
        │                          │
        ▼                          ▼
  pool items[]              amp records[]
        │                          │
        └──────────┬───────────────┘
                   ▼
          ContextItem[] に変換（score 付与）
                   │
                   ▼
          context.build(items)  ← budget チェック・Lint
                   │
                   ▼
           AceContext
                   │
                   ▼
            invoke(agent, prompt, context)
```

### 8.2 Pool → ContextItem 変換

```typescript
import { pool, context } from "@akari/sdk"

const results = await pool.search({ query: "先週の下書き", tags: ["draft"] })

const items: ContextItem[] = results.map((item, i) => ({
  id: `pool-${item.id}`,
  kind: "pool-item",
  source: { type: "pool", id: item.id },
  // 検索ランキング上位ほど高スコア
  score: Math.max(0.3, 1.0 - i * 0.15),
  content: item.text ?? `[バイナリ: ${item.mime}]`,
  goal_ref: "AKARI-HUB-024",
  label: item.tags.join(", "),
}))

const aceCtx = await context.build(items)
```

### 8.3 AMP → ContextItem 変換

```typescript
import { amp, context } from "@akari/sdk"

const memories = await amp.query({
  goal_ref: "AKARI-HUB-024",
  kind: "style-preference",
})

const items: ContextItem[] = memories.map((mem) => ({
  id: `amp-${mem.id}`,
  kind: "amp-memory",
  source: { type: "amp", filter: { kind: "style-preference" } },
  score: 0.75,
  content: mem.content,
  goal_ref: mem.goal_ref,
  label: `スタイル記憶: ${mem.created_at.slice(0, 10)}`,
}))
```

### 8.4 `context.select()` による自動統合

query → select → build を 1 ステップで行う最短形：

```typescript
// Pool + AMP を横断して自動収集・スコアリング・パッキング
const aceCtx = await context.select({
  goal_ref: "AKARI-HUB-024",
  goal: "先週の下書きをもとにブログ記事を仕上げる",
  budget: 8000,
  sources: ["pool", "amp", "selection"],
})
```

---

## 9. 型定義

```typescript
// ========================
// ContextItem（§4）
// ========================

type ContextItemKind =
  | "pool-item"
  | "amp-memory"
  | "text-selection"
  | "element-ref"
  | "file-ref"
  | "image-region"
  | "video-frame"
  | "video-range"
  | "m2c-feature"
  | "system-note"

type ContextItemSource =
  | { type: "pool"; id: string }
  | { type: "amp"; filter: AmpQueryFilter }
  | { type: "handoff"; session_id: string }
  | { type: "selection"; app: string }
  | { type: "inline" }

interface ContextItem {
  id: string
  kind: ContextItemKind
  source: ContextItemSource
  score: number          // 0.0〜1.0
  content: string
  goal_ref: string
  label?: string
  meta?: Record<string, unknown>
}

// ========================
// PackedContextItem（build 後）
// ========================

interface PackedContextItem extends ContextItem {
  token_count: number
}

// ========================
// AceContext（build / select の戻り値）
// ========================

interface AceContext {
  ace_version: string
  goal_ref: string
  items: PackedContextItem[]
  token_count: number
  truncated_count: number
  timestamp: string
}

// ========================
// SelectOptions（context.select）
// ========================

interface SelectOptions {
  goal_ref: string
  goal: string
  budget?: number          // デフォルト: 8000
  sources?: Array<"pool" | "amp" | "handoff" | "selection">
  kinds?: ContextItemKind[]
  max_items?: number       // デフォルト: 20
}

// ========================
// AmpQueryFilter
// ========================

interface AmpQueryFilter {
  goal_ref?: string
  kind?: string
  since?: string           // ISO 8601
  until?: string
}

// ========================
// LintIssue（context.lint）
// ========================

type LintSeverity = "error" | "warning"

interface LintIssue {
  item_id: string | null   // null = context 全体への指摘
  severity: LintSeverity
  code: string             // 例: "MISSING_GOAL_REF", "SENSITIVE_CONTENT"
  message: string
}
```

---

## 10. 使用例 — Writer で下書き + style memory を context にして Partner 呼び出し

Writer App が「下書きを磨く」エージェントを呼び出す完全なフロー。UI Selection（テキスト範囲選択）と AMP の style memory を組み合わせる。

```typescript
import { context, pool, amp, shell, invoke, permission } from "@akari/sdk"

const GOAL_REF = "writer-polish-draft-2026-04-19"

async function polishDraft(draftPoolId: string) {
  // 1. 権限ゲート（記録が AMP に残る）
  await permission.gate({
    action: "pool.read",
    reason: "下書きを読んで磨く",
    hitl: false,
  })

  // 2. 素材を取得
  const draft = await pool.get(draftPoolId)

  // 3. Style memory を AMP から取得
  const styleMemories = await amp.query({
    goal_ref: GOAL_REF,
    kind: "style-preference",
  })

  // 4. UI の現在の選択範囲（あれば）を取得
  const selection = await shell.getCurrentSelection()

  // 5. ContextItem を組み立てる
  const items: ContextItem[] = [
    // 下書き本文（最優先）
    {
      id: "draft-body",
      kind: "pool-item",
      source: { type: "pool", id: draftPoolId },
      score: 1.0,
      content: draft.text,
      goal_ref: GOAL_REF,
      label: "現在の下書き",
    },
    // スタイル記憶（高優先）
    ...styleMemories.slice(0, 3).map((mem, i) => ({
      id: `style-${i}`,
      kind: "amp-memory" as const,
      source: { type: "amp" as const, filter: { kind: "style-preference" } },
      score: 0.8 - i * 0.05,
      content: mem.content,
      goal_ref: GOAL_REF,
      label: `スタイル記憶 ${i + 1}`,
    })),
  ]

  // 6. UI でテキスト範囲が選択されていれば最優先で追加
  if (selection?.selection_type === "text-range") {
    items.push({
      id: "selection",
      kind: "text-selection",
      source: { type: "selection", app: selection.app },
      score: 1.0,
      content: selection.target.content_snippet,
      goal_ref: GOAL_REF,
      label: `選択範囲: L${selection.target.line_start}–${selection.target.line_end}`,
      meta: {
        file: selection.target.file,
        offset: selection.target.offset,
        length: selection.target.length,
      },
    })
  }

  // 7. Lint（品質チェック）
  const issues = await context.lint(items)
  const errors = issues.filter((i) => i.severity === "error")
  if (errors.length > 0) {
    throw new Error(`Context Lint failed: ${errors.map((e) => e.code).join(", ")}`)
  }

  // 8. context をビルド（budget 8000 tokens）
  const aceCtx = await context.build(items)

  console.log(
    `context built: ${aceCtx.token_count} tokens, ${aceCtx.truncated_count} items truncated`
  )

  // 9. Agent Runtime に渡して呼び出し
  const result = await invoke({
    agent: "writer_editor",
    prompt: selection
      ? "選択範囲を中心に、スタイル記憶を参考に文章を磨いて"
      : "スタイル記憶を参考に下書き全体を磨いて",
    context: aceCtx,
  })

  // 10. 判断ログを AMP に記録
  await amp.record({
    kind: "decision",
    content: `下書きを磨いた: ${result.summary ?? "完了"}`,
    goal_ref: GOAL_REF,
  })

  return result
}
```

---

## 11. 関連 API

### Agent API（build した context を invoke に渡す）

```typescript
import { invoke, spawn } from "@akari/sdk"

// 単一呼び出し
const result = await invoke({
  agent: "writer_editor",
  prompt: "整えて",
  context: aceCtx,    // ← context.build() / context.select() の戻り値
})

// 並列スポーン（複数案を同時に生成）
const [planA, planB] = await Promise.all([
  spawn({ agent: "writer_editor", prompt: "簡潔に", context: aceCtx }),
  spawn({ agent: "writer_editor", prompt: "詳細に", context: aceCtx }),
])
```

詳細: `agent-api.md`

### Memory API（素材取得）

```typescript
import { pool, amp } from "@akari/sdk"

// context の素材として使う Pool アイテムを検索
const items = await pool.search({ query: "先週の下書き" })

// context に組み込む AMP 記憶を取得
const memories = await amp.query({ goal_ref: "AKARI-HUB-024", kind: "style-preference" })
```

詳細: `memory-api.md`

### `context.lint(items)` — 品質チェック

```typescript
import { context } from "@akari/sdk"

const issues = await context.lint(items)
// issues: LintIssue[]

// エラーコード例
// "MISSING_GOAL_REF"   — goal_ref が空のアイテムがある
// "SENSITIVE_CONTENT"  — 機密情報のパターンを検出
// "EMPTY_CONTENT"      — content が空のアイテムがある
// "DUPLICATE_ID"       — id が重複している
// "INVALID_SCORE"      — score が 0〜1 の範囲外
```

---

## 関連 spec

- **HUB-024** [`App SDK spec (AKARI-HUB-024, Hub)`](https://github.com/Akari-OS/.github/blob/main/VISION.md) — App SDK 全体（Context API は §5.3 / §6.6）
- **Context Handoff (internal spec)** — UI Selection → 記憶層への書き込み規約
- **Context Selection (internal spec)** — Context Selection の UI 側フレームワーク
