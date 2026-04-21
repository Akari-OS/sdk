---
title: Migration Guide — Tier 昇格 / SDK バージョンアップ
updated: 2026-04-19
related-specs: [AKARI-HUB-024, AKARI-HUB-025]
related-adr: [ADR-010]
---

# Migration Guide

> **正典 spec**: [AKARI-HUB-024](https://github.com/Akari-OS/.github/blob/main/VISION.md) §6.2（Tier 定義・マイグレーション方針）
> **Panel Schema 正典**: [AKARI-HUB-025](https://github.com/Akari-OS/.github/blob/main/VISION.md) §6.10（バージョニング）

---

## 1. 概要 — 2 種類のマイグレーション

AKARI App 開発者が直面するマイグレーションには大きく **2 種類** ある。

| 種別 | 方向 | 主なトリガー | 難易度 |
|---|---|---|---|
| **Tier 昇格** | MCP-Declarative → Full | UI 要件が増えた / ネイティブ機能が必要 | 中（段階的移行可） |
| **SDK バージョンアップ** | v0.x → v1.x | 破壊的変更の吸収 | 低〜中（移行ツール提供） |

**降格（Full → MCP-Declarative）** は原則対象外。 §3 を参照。

どちらのケースも、**Pool / AMP に蓄積されたデータはマイグレーション前後で無変更**。
記憶層は Tier 非依存のため、ユーザーデータは安全に引き継がれる。

---

## 2. MCP-Declarative → Full 昇格

### 2.1 なぜ昇格するか

MCP-Declarative Tier は「MCP サーバー + `panel.schema.json`」だけで AKARI に載れる軽量 Tier だ。
しかし以下のケースでは、Shell 汎用レンダラの表現力が限界に達する。

**昇格を検討すべきサイン**:

- `panel.schema.json` にない widget が必要になった（例: カスタムリッチエディタ、ドラッグ & ドロップ UI）
- 複雑なリアルタイムプレビュー（差分表示・アニメーション）を Panel 内に実装したい
- ネイティブ Rust 処理（動画デコード・音声処理など）を Panel に組み込む必要がある
- 複数の App 固有エージェントを Panel に密結合させる設計になった
- `enabled_when` / `visible_when` 式だけでは制御できない複雑な UI ロジックがある

**昇格しなくていいケース**:

- widget セットが Panel Schema v0 で 9 割カバーされている（投稿 / 翻訳 / 通知 / 設定など）
- Full Tier に昇格しつつ `<SchemaPanel>` で既存の schema を再利用する（§2.5 参照）

> **原則**: まず MCP-Declarative で始め、実際に限界を感じてから昇格する。
> 早すぎる昇格は Certification コストを無駄に増やす。

---

### 2.2 昇格の全体像

昇格は以下の 4 ステップで行う。一度にすべてを書き換える必要はない — §2.5 の段階的移行を推奨する。

```
Step 1: akari.toml の tier 変更
Step 2: panel.schema.json → React コンポーネント変換
Step 3: MCP サーバーの App 内化（任意）
Step 4: akari app certify で昇格後の品質ゲートを通過
```

---

### 2.3 Step by step

#### Step 1: `akari.toml` の書き換え

`tier = "mcp-declarative"` を `tier = "full"` に変更し、Panel の参照先を React コンポーネントに切り替える。

**変更前（MCP-Declarative）**:

```toml
[app]
id = "com.x.sender"
name = "X Sender"
tier = "mcp-declarative"
sdk = ">=0.1.0 <1.0"

[mcp]
server = "mcp-servers/x-sender"
tools = ["x.post", "x.schedule", "x.draft"]

[panels]
main = { title = "X", schema = "panels/x-sender.schema.json" }

[permissions]
external-network = ["api.x.com"]
oauth = ["x.com"]
```

**変更後（Full）**:

```toml
[app]
id = "com.x.sender"
name = "X Sender"
tier = "full"               # ← 変更
sdk = ">=0.1.0 <1.0"

[panels]
main = { title = "X", mount = "panels/XSenderPanel.tsx" }  # ← React コンポーネントを指す

[agents]
# 必要に応じて App 固有エージェントを追加
# editor = "agents/editor.md"

[permissions]
pool = ["read", "write"]
external-network = ["api.x.com"]
oauth = ["x.com"]
```

> `[mcp]` セクションは Full Tier では不要になることが多い。
> ただし MCP サーバーを外部 endpoint として残す場合は `[mcp]` ごと残しても問題ない。

---

#### Step 2: `panel.schema.json` → React コンポーネント変換

MCP-Declarative の `panel.schema.json` で書いていた各 field / action を、React + AKARI SDK で実装し直す。

**変換前（panel.schema.json 抜粋）**:

```json
{
  "$schema": "akari://panel-schema/v0",
  "layout": "form",
  "fields": [
    { "id": "text",  "type": "textarea", "maxLength": 280, "bind": "mcp.x.post.text" },
    { "id": "media", "type": "pool-picker", "accept": ["image", "video"] },
    { "id": "when",  "type": "datetime-optional" }
  ],
  "actions": [
    { "id": "post", "label": "投稿", "mcp": "x.post", "hitl": true }
  ]
}
```

**変換後（React コンポーネント、`panels/XSenderPanel.tsx`）**:

```tsx
import { pool, permission } from "@akari/sdk"
import { SchemaPanel } from "@akari/sdk/react"
import { useState } from "react"

// 段階的移行: 既存の schema をそのまま部分利用する（§2.5 参照）
import xSenderSchema from "../panels/x-sender.schema.json"

export default function XSenderPanel() {
  const [customState, setCustomState] = useState<string>("")

  const handlePost = async (formValues: Record<string, unknown>) => {
    // Full Tier では自前でロジックを実装する
    await permission.gate({
      action: "external-network.post",
      reason: "X に投稿",
      hitl: true,
    })
    // MCP ツール呼び出しは fetch / SDK 経由で行う
    await fetch("https://api.x.com/...", { /* ... */ })
  }

  return (
    <div>
      {/* カスタム React コンポーネントをここに追加 */}
      <MyCustomPreviewArea state={customState} />

      {/* 既存の schema を部分利用（段階的移行の場合） */}
      <SchemaPanel schema={xSenderSchema} onSubmit={handlePost} />
    </div>
  )
}
```

> `<SchemaPanel>` を使うと、既存の `panel.schema.json` をそのまま React 内で再利用できる。
> すべてを書き換えなくてもよい — 詳細は §2.5。

---

#### Step 3: MCP サーバーの App 内化（任意）

MCP-Declarative Tier では MCP サーバーが App の外側（サイドカー）に存在していた。
Full Tier に昇格した後も外部 MCP サーバーを使い続けることは問題ないが、
ビジネスロジックを Panel / Skill に取り込む場合は以下の方針で整理する。

| ロジックの種類 | 推奨移動先 | 理由 |
|---|---|---|
| API 呼び出し・認証管理 | React Panel または Skill | MCP 依存を減らし、型安全に |
| ステートレスな変換処理 | `skills/<name>.ts` | 他 App から再利用できる |
| 複雑なフロー制御 | `agents/<name>.md` | エージェントに委譲（仕様は永続） |
| 外部 API の薄いラッパー | そのまま MCP サーバーに残す | 変更コストに見合わない場合 |

**MCP サーバーを App 内で継続利用するトポロジー**:

```toml
# Full Tier でも [mcp] セクションを残してサイドカー運用は可能
[mcp]
server = "mcp-servers/x-sender"
tools = ["x.post", "x.schedule"]
```

```tsx
// React Panel から MCP ツールを呼び出す
import { mcp } from "@akari/sdk"

const result = await mcp.call("x.post", { text, media })
```

---

#### Step 4: `akari app certify` の再実行

昇格後は Full Tier の審査基準でパスする必要がある。

```bash
# Tier 昇格後に実施
akari app certify

# 差分を確認（変更点だけハイライト）
akari app certify --diff-from=mcp-declarative
```

Full Tier では **Manual Review** が追加される（マーケット掲載時のみ）。
自己配布（npm）の場合は Automated Lint + Contract Test のみで OK。

| 審査層 | Full（昇格後） | MCP-Declarative（昇格前） |
|---|:-:|:-:|
| Automated Lint | ✅ | ✅ |
| Contract Test | ✅ | ✅ |
| Manual Review（マーケット掲載時） | ✅ 必須 | ⭕ 軽め |

---

### 2.4 MCP サーバーの App 内化 — 詳細フロー

MCP サーバーを Skill または Agent に移行する際の典型的なコードの書き換えを示す。

**MCP ツールを Skill に変換する例**:

```typescript
// 変換前: MCP サーバー側の tool 実装（mcp-servers/x-sender/index.ts）
server.tool("x.post", async ({ text, media }) => {
  const result = await xApi.post({ text, mediaIds: media })
  return { success: true, tweetId: result.id }
})

// 変換後: Skill として登録（skills/post.ts）
import { skill, permission } from "@akari/sdk"

skill.register({
  id: "x-sender.post",
  input: z.object({
    text: z.string().max(280),
    media: z.array(z.string()).max(4).optional(),
  }),
  output: z.object({
    success: z.boolean(),
    tweetId: z.string(),
  }),
  handler: async ({ text, media }) => {
    await permission.gate({
      action: "external-network.post",
      reason: "X に投稿",
      hitl: true,
    })
    const result = await xApi.post({ text, mediaIds: media })
    // 記録を AMP に残す
    await amp.record({
      kind: "action",
      content: `X に投稿: ${text.slice(0, 30)}...`,
      goal_ref: "x-sender",
    })
    return { success: true, tweetId: result.id }
  },
})
```

> Skill は他 App から `skill.call("x-sender.post", {...})` で再利用できる。
> MCP サーバーに閉じていた機能が、エコシステムに開かれる。

---

### 2.5 `<SchemaPanel>` を Full Tier 内で部分利用する段階的移行

昇格後も、既存の `panel.schema.json` を**すべて書き直す必要はない**。
`@akari/sdk/react` が提供する `<SchemaPanel>` コンポーネントを使えば、
既存の schema を React の一部品として再利用できる。

```tsx
import { SchemaPanel } from "@akari/sdk/react"
import xSenderSchema from "../panels/x-sender.schema.json"
import type { PanelSchema } from "@akari/sdk/react"

function XSenderPanel() {
  // Full Tier で新たに追加したい UI
  const [richPreview, setRichPreview] = useState<string | null>(null)

  return (
    <div className="x-sender-panel">
      {/* ① 既存の schema をそのまま使いまわす部分 */}
      <SchemaPanel
        schema={xSenderSchema as PanelSchema}
        onSubmit={async (values) => {
          // フォームの submit を React 側でフック
          setRichPreview(values.text as string)
        }}
      />

      {/* ② Full Tier でしか実現できないカスタム UI を足す */}
      {richPreview && (
        <TweetPreviewCard text={richPreview} />
      )}
    </div>
  )
}
```

**段階的移行の推奨プラン**:

| フェーズ | やること | 目標 |
|---|---|---|
| フェーズ 1 | `tier = "full"` に変更し、`<SchemaPanel schema={...} />` で既存 schema を wrap | 昇格コストゼロ。動作確認のみ |
| フェーズ 2 | カスタム UI を React で追加。Schema はそのまま | 新機能を段階的に足す |
| フェーズ 3 | Schema の field を React コンポーネントに置き換え（必要な field だけ） | 完全 React 化 |

フェーズ 1 だけで昇格扱いになる。フェーズ 3 まで進む義務はない。

---

### 2.6 データ互換性

**Pool / AMP は Tier 非依存** — マイグレーション前後でユーザーデータは完全に保持される。

| レイヤー | Tier の変化による影響 |
|---|---|
| **Pool（素材）** | なし。blob は Content-Addressed（blake3）で同一 ID で参照可能 |
| **AMP（記憶・判断ログ）** | なし。`goal_ref` ベースのレコードはそのまま |
| **Permission 宣言** | `akari.toml` の `[permissions]` を追記・修正が必要な場合あり |
| **Panel Schema** | `panel.schema.json` は残しつつ `<SchemaPanel>` で再利用できる |
| **Skill 登録** | 新たに `[skills.exposed]` を追加すれば他 App に開放できる |

---

## 3. Full → MCP-Declarative 降格（非推奨）

### 3.1 なぜ非推奨か

HUB-024 §6.2 では次のように明記されている:

> 逆方向の降格は原則不可（Full の UI 自由度を手放す合理性が薄い）

Full Tier は MCP-Declarative の上位互換であり、`<SchemaPanel>` を使えば宣言的 UI を Full 内に取り込める。
「重さを減らしたい」という理由だけで降格する必要は通常ない。

### 3.2 どうしても必要な場合の対応

以下の条件をすべて満たす場合のみ、降格を検討できる。

**降格が成立する前提条件**:

1. **UI 機能の大幅削減に同意できる** — React Panel の全機能を `panel.schema.json` の widget セットで再現できるか確認する
2. **Agent の大幅削減に同意できる** — App 固有エージェントを持たない構成にする
3. **既存ユーザーへの影響アセスメント** — 廃止する UI 機能についてユーザーへの告知・代替手段を用意する

**降格手順の概要**（非公式、自己責任）:

```bash
# 1. 機能一覧の棚卸し
akari app inspect --list-capabilities

# 2. schema で代替できる機能を洗い出す
#    → Panel Schema v0 の widget catalog（HUB-025 §6.2）と照合

# 3. akari.toml の書き換え
#    tier = "mcp-declarative"
#    [mcp] セクションを追加
#    [panels] の mount を schema に変更

# 4. Certification（MCP-Declarative 基準で再実行）
akari app certify
```

> 降格後にマーケットに再掲載する場合、**ユーザーへの変更告知**が必須。
> Manual Review で「機能削減に正当な理由があるか」を審査される。

---

## 4. SDK バージョン マイグレーション

### 4.1 バージョニング方針

AKARI App SDK は Semantic Versioning に準拠する。

| バージョン | 位置づけ | 後方互換 |
|---|---|---|
| **v0.x（現在）** | Draft。破壊的変更を許容 | v0 内では努力目標、保証なし |
| **v1.0（将来）** | 安定化。Minor は後方互換保証 | minor patch は後方互換必須 |
| **v1.x → v2.x** | Major 変更のみ breaking | 最低 6 ヶ月の並行サポート期間 |

App の `akari.toml` での SDK 互換宣言:

```toml
[app]
sdk = ">=0.1.0 <1.0"    # v0 の間は範囲を狭めに書く（v0 は破壊的変更あり）
# sdk = ">=1.0.0 <2.0"  # v1 安定化後は minor は安全
```

互換範囲外の Core で App が実行されようとした場合、**Core が実行を拒否**する（AC-7）。

---

### 4.2 Panel Schema v0 → v1 移行（将来）

Panel Schema のバージョンは `$schema` フィールドで明示される。

```json
// v0（現在 — draft、破壊的変更許容）
{ "$schema": "akari://panel-schema/v0", ... }

// v1（将来 — 安定化）
{ "$schema": "akari://panel-schema/v1", ... }
```

**Shell は複数バージョンを並行サポートする**。v1 がリリースされても v0 の schema は引き続き動作する（Deprecation Policy §5 参照）。

**v0 → v1 で想定される変更（Draft）**:

| 項目 | v0 現状 | v1 方向性（予定） |
|---|---|---|
| 式言語 (`enabled_when`) | 独自 DSL（未定） | JSONLogic または CEL に統一 |
| カスタム Widget | 未サポート | Widget 拡張 API を解放（HUB-025 §4） |
| Multi-step form | 未サポート | `layout: "wizard"` を追加 |
| MCP resource バインド | 未定義 | `bind: "resource.<id>"` 形式を追加 |

> v0 → v1 の正式移行ガイドは、v1 リリース時に **HUB-025 T-13** として提供される。

**移行ツール（将来提供）**:

```bash
# panel.schema.json を v0 → v1 に自動変換
akari migrate schema --from=v0 --to=v1 panels/x-sender.schema.json

# 変換できなかった箇所は警告として出力
# WARN: enabled_when の式 '$x != null' は手動修正が必要です
```

---

### 4.3 SDK v0 → v1 API 変更の吸収（将来）

v1 安定化前に想定される主な API 変更と、その対処方針。

**例: `pool.put()` の引数変更（仮）**

```typescript
// v0（現在）
const id = await pool.put({ bytes, mime, tags: ["draft"] })

// v1（仮想 — breaking change が入った場合）
const id = await pool.put({
  content: bytes,
  contentType: mime,     // mime → contentType にリネーム
  metadata: { tags: ["draft"] },
})
```

v1 リリース時には `@akari/sdk` に **codemod ツール**を同梱する予定:

```bash
# TypeScript ソースを v0 API から v1 API に自動変換
npx @akari/sdk-codemod@1 --from=0 --to=1 ./src
```

---

### 4.4 破壊的変更の通知フロー

SDK の breaking change は以下のフローで開発者に届く。

```
1. spec 更新（AKARI-HUB-024 / HUB-025）
      ↓
2. CHANGELOG.md に "BREAKING:" セクション追記
      ↓
3. npm の deprecation notice（旧バージョン）
      ↓
4. akari dev 起動時に警告表示
      ↓ （6 ヶ月後）
5. 旧バージョンのサポート終了
```

**`akari dev` が出す警告の例**:

```
⚠ AKARI SDK: @akari/sdk v0.3 は 2027-01-01 にサポートを終了します。
  v1.0 への移行ガイド: https://akari.os/docs/guides/sdk/migration
  自動変換: npx @akari/sdk-codemod@1
```

---

## 5. Deprecation Policy

### 5.1 原則

AKARI App SDK の Deprecation は、開発者が安心してエコシステムに参入できるよう、
以下の原則に従う。

1. **最低 6 ヶ月の移行期間** — breaking change を含む新バージョンリリース後、旧バージョンを最低 6 ヶ月サポートする
2. **Migration Tool の提供** — 自動変換可能な変更には codemod を提供する
3. **段階的廃止** — `deprecated` 警告 → `error` 格下げ → 削除 の 3 段階を踏む
4. **spec 先行通知** — 実装より先に spec（HUB-024 / HUB-025）の `status: deprecated` 遷移で宣言する

### 5.2 廃止スケジュールの例

| マイルストーン | タイミング | 対応 |
|---|---|---|
| v1.0 ベータ公開 | T+0 | 移行ガイド公開、codemod ツール提供 |
| v0 に `deprecated` 警告 | T+1 ヶ月 | `akari dev` / `akari app certify` で警告 |
| v0 に `error` 格下げ | T+5 ヶ月 | 警告 → エラーに昇格（動作は継続） |
| v0 の公式サポート終了 | T+6 ヶ月 | Core の自動更新では v0 App が起動拒否される可能性 |

> 上記スケジュールは v1.0 リリース時に確定する。v0 期間中は緩やかな運用を想定している。

### 5.3 App 開発者の推奨アクション

```bash
# 現在の SDK バージョンと互換状況を確認
akari app inspect --sdk-compat

# 推奨される最小バージョンへの更新
npm install @akari/sdk@latest

# breaking change の影響範囲を事前チェック
akari app certify --check-compat
```

---

## 6. 実例: HUB-007 X Sender の reframe

### 6.1 背景

X Sender（[AKARI-HUB-007](../examples/x-sender/)）は、
もともと **Full Tier 前提の設計**（L3 sub-agent + Operator ジョブキュー）で書かれていた。
これが HUB-005 v0.2（2026-04-19）への reframe で **MCP-Declarative Tier に方向転換**した。

この事例は「降格」ではなく、**実装前に Tier の前提を修正した「再設計」**である。
参考として本 Guide に記録する。

### 6.2 旧設計（廃止）vs 新設計

| 項目 | 旧設計（v0.1.0）— 廃止 | 新設計（v0.2.0）— 採用 |
|---|---|---|
| アーキテクチャ | L3 sub-agent `x-sender.ts` + Operator ジョブキュー | MCP サーバー `x-mcp` + Panel Schema v0 |
| UI 定義 | Shell の Tiny Writer からのボタン呼び出し（独自配線） | `panel.schema.json` の宣言的フォーム |
| 認証管理 | `x-sender.ts` が Keychain を直接読み書き | MCP サーバー側で管理（Permission API 経由） |
| 実装量 | TypeScript クラス群 + 配線コード | MCP tools 定義 + JSON Schema のみ |
| 昇格可能性 | 不要（最初から Full 前提） | 必要になれば Full に昇格可能 |

### 6.3 得られた教訓

1. **「まず MCP-Declarative で始める」は投稿系 App に特に有効** — テキスト入力 + 添付 + HITL ボタンは Panel Schema v0 の標準 widget で十分カバーできる
2. **旧設計の「エージェントで全部やる」発想は早すぎる昇格を招く** — MCP サーバーがビジネスロジックを担い、Panel が UI を担う分離で十分だった
3. **データ（AMP / Pool）は設計変更の影響を受けない** — X Sender が蓄積した投稿履歴（AMP）は旧 v0.1.0 から v0.2.0 に設計変更しても引き継げる構造

---

## 7. よくある落とし穴

### 7.1 Tier 昇格時

**落とし穴 1: `[permissions]` の更新漏れ**

Full Tier では `pool = ["read", "write"]` など Memory API のアクセス権限を明示しなければならない。
MCP-Declarative では MCP tools 宣言で暗黙に許可されていた部分が、Full では手動宣言に変わる。

```bash
# 宣言漏れを Lint で検知
akari app certify --lint-only
# → ERROR: panels/XSenderPanel.tsx で pool.put() を呼んでいますが、
#          [permissions] に pool.write が宣言されていません
```

**落とし穴 2: `<SchemaPanel>` の `onSubmit` で HITL を二重実行**

`panel.schema.json` の action に `"hitl": { "require": true }` を宣言したまま、
React 側でも `permission.gate({ hitl: true })` を呼ぶと、HITL ダイアログが 2 回出る。

```tsx
// 悪い例: schema の hitl + React 側の gate が重複
<SchemaPanel schema={schemaWithHitl} onSubmit={async (values) => {
  await permission.gate({ action: "external-network.post", hitl: true }) // ← 二重
}} />

// 良い例: どちらか一方に統一する
// A) schema 側の hitl を使う（React 側の gate は hitl: false に）
// B) schema の hitl を無効化し、React 側だけで制御する
```

**落とし穴 3: MCP サーバーを廃止したのに `akari.toml` の `[mcp]` を残す**

`[mcp]` セクションが残っていると Core が MCP サーバーを起動しようとして失敗する。

```toml
# 悪い例: サーバーが存在しないのに宣言が残っている
[mcp]
server = "mcp-servers/x-sender"  # ← 削除するか、実際のパスを更新する
```

---

### 7.2 SDK バージョンアップ時

**落とし穴 4: `sdk = "*"` で互換宣言をサボる**

`sdk = "*"` はすべての Core バージョンで動くように見えるが、breaking change が入ったときに
実行時エラーになるまで気づけない。必ず具体的な範囲を宣言する。

```toml
# 悪い例
sdk = "*"

# 良い例
sdk = ">=0.1.0 <1.0"
```

**落とし穴 5: `pool.put()` の戻り値の型変化を見落とす**

v0 の間は型定義が変わることがある。`@akari/sdk` を更新したら必ず型チェックを実行する。

```bash
# 型チェックだけ実行（実行はしない）
npx tsc --noEmit
```

---

### 7.3 Panel Schema バージョン

**落とし穴 6: `$schema` フィールドを省略する**

`$schema` を省略すると Shell は最新バージョンとして解釈するが、
バージョンが変わった際に動作が変わるリスクがある。必ず明示する。

```json
// 悪い例
{ "layout": "form", "fields": [...] }

// 良い例
{ "$schema": "akari://panel-schema/v0", "layout": "form", "fields": [...] }
```

---

## 8. 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [Tier Comparison](./concepts/tier-comparison.md) | Full / MCP-Declarative の選び方フローチャート |
| [Certification Guide](./certification/) | 品質ゲートの詳細（Automated Lint / Contract Test / Manual Review） |
| [AKARI-HUB-024 §6.2](https://github.com/Akari-OS/.github/blob/main/VISION.md) | Tier 定義・マイグレーション方針の正典 |
| [AKARI-HUB-025 §6.10](https://github.com/Akari-OS/.github/blob/main/VISION.md) | Panel Schema バージョニングの正典 |
| [ADR-010 (Hub)] | Core のリトライ / deadletter 機構（旧 L3 sub-agent の継承先） |
| [HUB-007 X Sender](../examples/x-sender/) | MCP-Declarative Tier リファレンス実装（§6 の詳細元） |

---

> **最終更新**: 2026-04-19
> このガイドは [AKARI-HUB-024](https://github.com/Akari-OS/.github/blob/main/VISION.md) / [AKARI-HUB-025](https://github.com/Akari-OS/.github/blob/main/VISION.md) を**解説する**ドキュメントです。
> 仕様の正典は常に spec ファイルを参照してください。
