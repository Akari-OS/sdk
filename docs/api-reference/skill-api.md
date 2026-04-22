---
title: Skill API リファレンス
spec: AKARI-HUB-024 §5.7
version: 0.1.0
status: draft
created: 2026-04-19
updated: 2026-04-22
related:
  - HUB-024  # App SDK — Skill API の契約元
---

# Skill API リファレンス

> **一言**: Skill は App が他 App に公開する「型付き能力の単位」。
> CAA（Costume-Agent Architecture）が Skill をコスチュームの装備品として使うのと並び、
> App 間の関数呼び出しプロトコルとしても機能する。

---

## 目次

1. [概要](#1-概要)
2. [Skill Manifest 形式](#2-skill-manifest-形式)
3. [`skill.register(skill)`](#3-skillregisterskill)
4. [`skill.invoke(id, input)`](#4-skillinvokeid-input)
5. [Skill vs Workflow vs Template — 違いと使い分け](#5-skill-vs-workflow-vs-template)
6. [着ぐるみ Skill vs App Skill](#6-着ぐるみ-skill-vs-app-skill)
7. [Feedback Learning Loop 連携](#7-feedback-learning-loop-連携)
8. [パラメータ / 型検証](#8-パラメータ--型検証)
9. [Skill の永続化](#9-skill-の永続化)
10. [型定義](#10-型定義)
11. [使用例](#11-使用例)
12. [関連 API](#12-関連-api)

---

## 1. 概要

### Skill とは

**Skill** は App が外部に公開する「再利用可能な能力の単位」。
`@akari/sdk` の `skill` オブジェクトを通じて登録・呼び出しを行う。

CAA（Costume-Agent Architecture）の文脈では、Skill は**コスチューム（着ぐるみ）が装備できるプロンプト片**として生まれた概念（Skill / Workflow / Template framework (internal spec)）。
App SDK（HUB-024）においては、それを拡張し**型付き関数**として App 間の契約に昇格させた形が「App Skill」。

```
CAA 着ぐるみ Skill         App Skill
（コスチュームの装備品）     （App 間の型付き関数）
   skills/*.md                skills/*.ts
      ↓                           ↓
  系譜・思想を継承           実装の器として継承
```

どちらも「再利用可能な能力の単位」という哲学は同じ。違いは呼び出し元と型の有無。

### なぜ Skill が必要か

| なくした場合の問題 | Skill があると |
|---|---|
| App が互いに直接 API を叩く → 密結合、破壊的変更が連鎖 | 型 + バージョン契約で疎結合 |
| 同じ能力を各 App が重複実装 | 1 箇所に置いて全 App が再利用 |
| 能力の組み合わせ（Workflow）が書けない | `type: skill` Step で Workflow に組み込める |
| フィードバックが能力に還元されない | Feedback Learning Loop (internal spec) が feedback を Skill に逆流させ自動進化 |

### 位置づけ（AKARI 5 層モデル）

| レイヤー | Skill の要素 |
|---|---|
| Memory Layer（記憶層・永続） | Skill Manifest ファイル（`skills/*.ts`、`skills/*.md`）|
| Agent Runtime（思考層・揮発） | 着ぐるみ Skill（`skills/*.md`）の system prompt 注入 |
| App SDK（道具層） | `skill.register()` / `skill.invoke()` の実行 |
| Protocol Suite（MCP） | Workflow の `type: skill` Step 経由での呼び出し |

---

## 2. Skill Manifest 形式

App が公開する Skill は `skills/` ディレクトリ配下の TypeScript ファイルとして実装し、
`akari.toml` の `[skills.exposed]` に登録する。

### ディレクトリ構造

```
my-app/
├── akari.toml
└── skills/
    ├── generate-draft.ts       ← 公開 Skill
    ├── platform-adapt.ts       ← 公開 Skill
    └── internal-helper.ts      ← 非公開（akari.toml に書かなければ外部から呼べない）
```

### `akari.toml` での宣言

```toml
[skills.exposed]
# キー = Skill の完全修飾 ID（app-id.skill-name の形式）
"writer.generate_draft"   = "skills/generate-draft.ts"
"writer.style_rewrite"    = "skills/style-rewrite.ts"

[skills.imported]
# 本 App が利用する他 App の Skill（バージョン範囲を宣言）
"pool.search"             = ">=0.1"
"m2c.extract_features"   = ">=0.1"
```

### Skill ファイルの形式（`skills/generate-draft.ts`）

各 Skill ファイルは `SkillDef` 型に合致するオブジェクトを `default export` する。

```typescript
import { z } from "zod"
import type { SkillDef } from "@akari/sdk"

// --- 入力スキーマ ---
const InputSchema = z.object({
  topic: z.string().describe("記事のテーマ"),
  tone: z.string().optional().describe("文体・口調 (例: カジュアル / ビジネス)"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
})

// --- 出力スキーマ ---
const OutputSchema = z.object({
  title: z.string(),
  body:  z.string(),
  word_count: z.number(),
})

// --- Skill 定義 ---
const skill: SkillDef<typeof InputSchema, typeof OutputSchema> = {
  id:          "writer.generate_draft",
  version:     "0.1.0",
  description: "指定テーマと口調で記事の初稿を生成する",
  input:       InputSchema,
  output:      OutputSchema,
  idempotent:  true,   // 同じ入力なら同じ出力を推奨（冪等宣言）

  async handler(input) {
    // ここに実装ロジックを書く
    // Pool / AMP へのアクセスは Memory API 経由
    const draft = await generateWithAI(input)
    return {
      title:      draft.title,
      body:       draft.body,
      word_count: draft.body.length,
    }
  },
}

export default skill
```

### 着ぐるみ Skill ファイルの形式（`skills/*.md`）

着ぐるみ Skill はコスチュームに注入されるシステムプロンプト断片。
使い分けは [§6](#6-着ぐるみ-skill-vs-app-skill) を参照。

```markdown
---
skill-id: revision/tone-adjustment
name: 口調調整
category: revision   # meta | input | revision | workflow | app-specific
tools: [pool_search, pool_read]
applicable-costumes: [partner, writer]
---
指定された口調スタイルを維持しながら、本来の意味を損なわずにテキストを書き換えます。
```

---

## 3. `skill.register(skill)`

App の起動時（`onMount`）に Skill を Core に登録する。登録後は他 App から呼び出し可能になる。

```typescript
import { skill } from "@akari/sdk"
import generateDraft from "./skills/generate-draft.js"
import styleRewrite  from "./skills/style-rewrite.js"

export function onMount() {
  skill.register([generateDraft, styleRewrite])  // まとめて登録推奨
}
```

**制約**: `id` が `akari.toml` の `[skills.exposed]` に未宣言の場合は Core が拒否する。
App アンマウント時に登録は自動解除される。

### エラーコード（register）

| コード | 原因 |
|---|---|
| `SKILL_UNDECLARED` | `akari.toml` に未宣言の Skill ID |
| `SKILL_ALREADY_REGISTERED` | 同じ ID が既に登録済み |
| `SKILL_SCHEMA_INVALID` | スキーマが JSON Schema 規格を満たさない |

---

## 4. `skill.invoke(id, input)`

他 App が登録した Skill を呼び出す関数。`skill.call()` はエイリアス。

### シグネチャ

```typescript
function invoke<T = unknown>(
  id:       string,
  input:    unknown,
  options?: SkillInvokeOptions,  // { timeout_ms?, goal_ref?, trace_id? }
): Promise<T>
```

### 使い方

```typescript
import { skill } from "@akari/sdk"
import type { GenerateDraftOutput } from "@writer/types"

// 型安全な呼び出し（推奨）
const draft = await skill.invoke<GenerateDraftOutput>(
  "writer.generate_draft",
  { topic: "AKARI OS の思想", length: "medium" },
  { goal_ref: "AKARI-HUB-024", timeout_ms: 60_000 },
)

// エイリアスも同じ動作
const adapted = await skill.call("publishing.platform_adapt", {
  content: draft.body, platform: "x",
})
```

### 制約

- `[skills.imported]` に未宣言の Skill は呼べない（`SKILL_UNDECLARED_IMPORT`）
- バージョン範囲外なら `SKILL_VERSION_MISMATCH`
- Skill は別 App プロセスで実行される（同期的 state 共有不可）
- 結果は AMP に自動記録しない（`amp.record()` を明示的に呼ぶこと）

### エラーコード（invoke）

| コード | 原因 |
|---|---|
| `SKILL_NOT_FOUND` | 指定 ID の Skill が登録されていない |
| `SKILL_UNDECLARED_IMPORT` | `[skills.imported]` 未宣言の Skill を呼び出そうとした |
| `SKILL_VERSION_MISMATCH` | 宣言した semver 範囲と登録済みバージョンが不一致 |
| `SKILL_INPUT_VALIDATION` | 入力が Skill のスキーマを満たさない |
| `SKILL_OUTPUT_VALIDATION` | Skill が返した値が出力スキーマを満たさない |
| `SKILL_TIMEOUT` | `timeout_ms` を超過した |

---

## 5. Skill vs Workflow vs Template

Skill / Workflow / Template framework (internal spec) が定義する「3 段階粒度」の整理。

| | Skill | Workflow | Template |
|---|---|---|---|
| **粒度** | 1 つの能力 | 複数 Skill / 着ぐるみの手順 | Workflow + 初期素材 + Skill セット |
| **形式** | `.ts`（App Skill）/ `.md`（着ぐるみ Skill） | YAML | YAML + ファイル群 |
| **呼び出し元** | 他 App / Workflow Step | ユーザー / 着ぐるみ / 別 Workflow | ユーザー（テンプレ起動） |
| **冪等性** | 推奨（同入力→同出力） | 非冪等（副作用あり） | 非冪等（workspace 生成） |
| **永続先** | Memory Layer（Skill 定義ファイル） | Memory Layer（YAML） | Memory Layer（YAML + works/） |

### いつ Skill を使うか

- 単一の能力を**型付き・再利用可能な形で公開**したい
- 他 App から呼び出されることを想定している
- Workflow の `type: skill` Step として組み込む予定がある

### いつ Workflow を使うか

- 複数の Skill / 着ぐるみ / MCP App を**順序・並列・HITL 付きで組み合わせる**
- 承認ポイント（HITL）が途中に入る
- `type: skill` Step で Skill を呼び出す（Skill と Workflow は合成関係）

### いつ Template を使うか

- Workflow を**初期素材・設定つきでパッケージ化**してユーザーに提供する
- 「ブログ投稿テンプレ」のように、Workspace の起動ポイントになる

```yaml
# Workflow 内で Skill を呼び出す例（type: skill Step）
steps:
  - id: rewrite
    type: skill
    skill: writer.style_rewrite     # HUB-024 Skill API 経由
    inputs:
      text: ${steps.draft.outputs.body}
      style: "casual"

  - id: adapt
    type: skill
    skill: publishing.platform_adapt
    inputs:
      content: ${steps.rewrite.outputs.text}
      platform: "x"
```

---

## 6. 着ぐるみ Skill vs App Skill

HUB-018 が定義する「着ぐるみ Skill」と HUB-024 が定義する「App Skill」は、同じ「Skill」という名前でも**レイヤーが異なる**。

### 比較表

| 観点 | 着ぐるみ Skill（Skill / Workflow / Template framework） | App Skill（HUB-024） |
|---|---|---|
| **ファイル形式** | `skills/*.md`（Markdown frontmatter） | `skills/*.ts`（TypeScript） |
| **役割** | 着ぐるみ（CAA 思考層）に注入される system prompt の断片 | App 間の型付き関数呼び出し |
| **呼び出し元** | Workflow Runner（着ぐるみを装備する際） | 他 App の `skill.invoke()` / Workflow の `type: skill` Step |
| **入出力** | 型なし（プロンプト注入） | Zod / JSON Schema で型定義 |
| **使い分け** | AI の思考パターンを変えたい時 | 具体的なデータ変換・ツール処理を公開したい時 |
| **CAA 系譜** | 直系（コスチューム = 装備品の思想） | 派生（型付き関数として具象化） |

### 着ぐるみ Skill（CAA 思考層）

コスチュームのシステムプロンプトに差し込まれる「装備品」。AI の思考パターンを変える。
呼び出し元は Workflow Runner（`type: costume` Step）であり、型付き戻り値はない。
（形式は §2 を参照）

### App Skill（Tool 寄り）

具体的な「データの入出力を持つ関数」。他 App が `skill.invoke()` で呼び出す。
（形式は §2、登録は §3、呼び出しは §4 を参照）

### 両者の連携

着ぐるみが着ぐるみ Skill を装備した上で、App Skill を呼び出すこともある：

```
Workflow
  └─ type: costume (着ぐるみ起動)
        └─ 着ぐるみに revision/tone-adjustment を装備
              └─ 着ぐるみが skill.invoke("writer.style_rewrite", ...) を実行
```

---

## 7. Feedback Learning Loop 連携

Feedback Learning Loop (internal spec) は Skill と深く統合されている。
ユーザーのフィードバックが積み上がると、Skill 定義自体が自動進化する。

### フィードバック収集フロー

Shell の 👍/👎 ボタンからの評価は Core が `feedback.jsonl` に自動記録する（HUB-024 Memory API 経由）。
Skill 実装側が明示的に記録する場合は `amp.record({ kind: "feedback", ..., goal_ref })` を使う。
自前で記録すると二重記録になるため、Core の自動記録をオプトアウトするか、どちらか一方に統一する。

### 背景エージェント（メモリスト）による集約

フィードバック集約メモリストが、セッション終了時（Stop Hook）または毎日深夜 3 時（Cron）に起動し：

1. 全 workspace の `feedback.jsonl` を読む
2. Skill 別の承認率・却下パターンを集約
3. `pool/categories/my-skill-usage.md` に書き出す（`!from-memory` で参照可能に）
4. 改訂が必要な Skill を検出したら PR 形式（Git ブランチ + diff）でユーザーに提示

### Skill の自動進化（Phase 3）

メモリストが改訂案を作成し、HUB-025 の `diff` HITL preview でユーザーに提示する：

```
skills/revision/tone-adjustment.md  (v0.1)
  ↓ 50 回使用、40 回承認、10 回却下
  ↓ メモリストが pattern 分析
  ↓ 「ビジネス調は90%却下」→ 回避ルールを追加
  ↓ git branch: skill-evolution/tone-adjustment-v0.2
  ↓ diff preview → ユーザー承認
skills/revision/tone-adjustment.md  (v0.2)
```

App Skill（`.ts`）の場合も同様に、`handler` の実装変更を PR 形式で提案する。
**必ず人間が承認してから main にマージ**する（自動マージは行わない）。

### `!from-memory` との統合

Skill の実行コンテキストに学習済みの好みを注入できる：

```yaml
# Workflow YAML での例
defaults:
  style:  !from-memory my-writing-style.md
  tone:   !from-memory my-tone-preferences.md
  avoid:  !from-memory my-rejection-patterns.md
```

Runner が起動時に `my-*.md` を読んで展開し、Skill の `handler` に渡す。
これにより「使えば使うほど自分に最適化される Skill」が実現する。

---

## 8. パラメータ / 型検証

### Zod スキーマ（推奨）

Zod を使うと TypeScript 型との整合性が自動保証される：

```typescript
import { z } from "zod"

const InputSchema = z.object({
  content: z.string().min(1).max(10_000),
  platform: z.enum(["x", "note", "bluesky"]),
  max_length: z.number().int().positive().optional(),
})

const OutputSchema = z.object({
  adapted_text: z.string(),
  char_count: z.number(),
  truncated: z.boolean(),
})

// 型推論が効く
type Input  = z.infer<typeof InputSchema>   // { content: string; platform: ... }
type Output = z.infer<typeof OutputSchema>  // { adapted_text: string; ... }
```

### Ajv（JSON Schema 直書き）

Zod が使えない環境（Rust SDK 連携など）では `input` / `output` に JSON Schema 7 オブジェクトを直接渡す。
SDK 内部で Ajv を使って検証する（`additionalProperties: false` を忘れずに）。

### SDK の自動バリデーション

`skill.register()` / `skill.invoke()` はスキーマバリデーションを自動実行する。
不正入力時は `err.code === "SKILL_INPUT_VALIDATION"`、詳細は `err.details`（ZodError または Ajv ErrorObject[]）。

### ベストプラクティス

- **`additionalProperties: false`** を必ず設定する（未知フィールドの混入を防ぐ）
- **`description` フィールド**を各プロパティに書く（AI がコンテキストを理解できる）
- **`idempotent: true`** を宣言できるなら宣言する（Workflow のリトライが安全になる）
- **オプション引数はデフォルト値**を明示する（呼び出し側の負担を下げる）

---

## 9. Skill の永続化

Skill 定義（`skills/*.ts` / `skills/*.md`）は Memory Layer の一部として Git で管理される。
`v0.1` → `v0.2` の進化履歴は Git log で追跡でき、Feedback Learning Loop (internal spec) の Skill 自動進化もこのブランチを使う。

### AMP `kind: skill-memory` による実行ログ

Skill の実行履歴を AMP に永続化する場合は `kind: "skill-memory"` を使う。
`kind: "skill-memory"` のレコードはフィードバック集約メモリストが読み込み、学習データとして活用する。

```typescript
await ctx.amp.record({
  kind:    "skill-memory",
  content: JSON.stringify({
    skill_id:   "writer.generate_draft",
    input_hash: hashOf(input),    // 生の input は記録しない（プライバシー）
    output_ref: await ctx.pool.put({ bytes: result.body }),
    latency_ms: ctx.elapsed_ms,
  }),
  goal_ref: ctx.goal_ref ?? "writer.skill-executions",
})
```

---

## 10. 型定義

```typescript
// @akari/sdk が export する型定義

import type { ZodSchema }  from "zod"
import type { JSONSchema7 } from "json-schema"

/** Skill 定義オブジェクト（register に渡す） */
export interface SkillDef<
  TInput  extends ZodSchema = ZodSchema,
  TOutput extends ZodSchema = ZodSchema,
> {
  /** 完全修飾 Skill ID（例: "writer.generate_draft"）*/
  id: string

  /** セマンティックバージョン（例: "0.1.0"）*/
  version: string

  /** 人間可読な説明（AI がコンテキスト理解に使う） */
  description: string

  /** 入力スキーマ（Zod または JSON Schema 7） */
  input: TInput | JSONSchema7

  /** 出力スキーマ（Zod または JSON Schema 7） */
  output: TOutput | JSONSchema7

  /** 冪等性宣言（同入力→同出力）。Workflow リトライ安全性に影響 */
  idempotent?: boolean

  handler: (
    input: TInput extends ZodSchema ? z.infer<TInput> : unknown,
    ctx: SkillContext,
  ) => Promise<TOutput extends ZodSchema ? z.infer<TOutput> : unknown>
}

export interface SkillContext {
  goal_ref?:  string      // AMP ゴール参照
  elapsed_ms: number      // 呼び出し開始からの経過 ms
  pool: PoolClient        // AMP / Pool への直接アクセス（handler 内限定）
  amp:  AmpClient
}

/** invoke のオプション */
export interface SkillInvokeOptions {
  timeout_ms?: number
  goal_ref?:   string
  trace_id?:   string
}

/** skill オブジェクト（`@akari/sdk` から import） */
export interface SkillAPI {
  register(skill: SkillDef | SkillDef[]): void
  invoke<T = unknown>(id: string, input: unknown, options?: SkillInvokeOptions): Promise<T>
  call<T = unknown>(id: string, input: unknown, options?: SkillInvokeOptions): Promise<T>
}

/** AMP の skill-memory レコード形式 */
export interface SkillMemoryRecord {
  kind:       "skill-memory"
  skill_id:   string
  input_hash: string     // 生の input はハッシュで記録
  output_ref: string     // Pool の content ID
  latency_ms: number
  goal_ref:   string
  timestamp:  string     // ISO 8601
}
```

---

## 11. 使用例

### 例 1: Writer App の "style-consistent-rewrite" Skill

Writer App が公開する、スタイル一貫性を維持しながら書き直す Skill。

```typescript
// skills/style-consistent-rewrite.ts
import { z } from "zod"
import type { SkillDef } from "@akari/sdk"

const InputSchema = z.object({
  text:               z.string().min(1).describe("書き直すテキスト"),
  style_ref:          z.string().optional().describe("Pool ID（省略時は my-writing-style.md）"),
  preserve_structure: z.boolean().default(true),
})
const OutputSchema = z.object({
  rewritten:     z.string(),
  changes:       z.array(z.string()).describe("変更点サマリ"),
  style_applied: z.string(),
})

const skill: SkillDef<typeof InputSchema, typeof OutputSchema> = {
  id:          "writer.style_consistent_rewrite",
  version:     "0.1.0",
  description: "既存テキストを指定スタイルと一貫させながら書き直す",
  input:       InputSchema,
  output:      OutputSchema,
  idempotent:  false,  // スタイル参照が変わると出力が変わる

  async handler(input, ctx) {
    // 1. スタイル参照を取得（Pool または my-writing-style.md）
    const styleSource = input.style_ref
      ? await ctx.pool.get(input.style_ref)
      : await ctx.pool.search({ query: "my-writing-style", limit: 1 })

    // 2. Agent API 経由で書き直し
    const result = await invokeWriterAgent({ text: input.text, style: styleSource })

    // 3. 実行ログを AMP に記録（Feedback Learning Loop のメモリストが学習データとして使用）
    await ctx.amp.record({
      kind:    "skill-memory",
      content: JSON.stringify({ skill_id: "writer.style_consistent_rewrite",
                                input_hash: hashOf(input.text), latency_ms: ctx.elapsed_ms }),
      goal_ref: ctx.goal_ref ?? "writer.skill-executions",
    })
    return result
  },
}
export default skill
```

呼び出し側（例: Publishing App）：

```typescript
import { skill } from "@akari/sdk"

const rewritten = await skill.invoke<{ rewritten: string; changes: string[] }>(
  "writer.style_consistent_rewrite",
  { text: draftText, preserve_structure: true },
  { goal_ref: currentWorkspaceId },
)
// rewritten.changes → ["冒頭を体言止めに変更", "絵文字を3個に削減"]
```

---

### 例 2: Publishing App の "platform-adapt" Skill

Publishing App が公開する、コンテンツを各 SNS プラットフォームの文字数制限に合わせて変換する Skill。

```typescript
// skills/platform-adapt.ts
const InputSchema = z.object({
  content:  z.string().describe("変換元のテキスト"),
  platform: z.enum(["x", "note", "bluesky", "threads", "instagram"]),
  include_hashtags: z.boolean().default(true),
})
const OutputSchema = z.object({
  adapted_text: z.string(),
  char_count:   z.number(),
  truncated:    z.boolean(),
  hashtags:     z.array(z.string()),
})

const skill: SkillDef<typeof InputSchema, typeof OutputSchema> = {
  id:         "publishing.platform_adapt",
  version:    "0.2.0",
  description:"コンテンツを各 SNS の制約に合わせて変換する",
  input:      InputSchema,
  output:     OutputSchema,
  idempotent: true,
  async handler(input) { /* 実装省略 */ },
}
export default skill
```

Workflow から呼び出す例（YAML）：

```yaml
# templates/workflows/writer/blog-to-sns.yaml
steps:
  - id: rewrite
    type: skill
    skill: writer.style_consistent_rewrite
    inputs:
      text: ${steps.draft.outputs.body}

  - id: adapt_x
    type: skill
    skill: publishing.platform_adapt
    inputs:
      content:  ${steps.rewrite.outputs.rewritten}
      platform: "x"
      include_hashtags: true
    parallel: true

  - id: adapt_note
    type: skill
    skill: publishing.platform_adapt
    inputs:
      content:  ${steps.rewrite.outputs.rewritten}
      platform: "note"
    parallel: true

  - id: post_x
    type: mcp-app
    app: com.akari.x-sender
    approval: required    # HITL 必須
    after: [adapt_x]
    inputs:
      text: ${steps.adapt_x.outputs.adapted_text}
```

---

## 12. 関連 API

### Agent API（Skill 実行のコンテキスト）

Skill の `handler` 内でエージェントを呼び出す場合は Agent API を使う。
`invoke({ agent: "writer_editor", prompt: "...", context: {...} })` の形式。
詳細は [Agent API リファレンス](./agent-api.md)を参照。

### Memory API（学習履歴・素材参照）

Skill の実行ログは `amp.record({ kind: "skill-memory", ..., goal_ref })` で AMP に記録する。
素材は `pool.get(id)` / `pool.put({ bytes, mime })` で Pool を通じてアクセスする。
詳細は [Memory API リファレンス](./memory-api.md)を参照。

### Permission API（HITL が必要な Skill）

外部送信など HITL が必要な Skill は Permission API でゲートを設ける：
`permission.gate({ action: "external-network.post", reason: "...", hitl: true })` を
handler の先頭に置く。詳細は [Permission API リファレンス](./permission-api.md)を参照。

---

> **関連 spec**:
> - [AKARI-HUB-024](https://github.com/Akari-OS/.github/blob/main/VISION.md) — App SDK（Skill API §5.7 の正典）
> - Skill / Workflow / Template framework (internal spec) — 着ぐるみ Skill のフレームワーク
> - Feedback Learning Loop (internal spec) — Feedback を Skill に還元する自動進化ループ
