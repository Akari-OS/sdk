---
title: API Reference — 入口
spec-id: AKARI-HUB-024
section: sdk/api-reference
version: 0.1.0
status: draft
created: 2026-04-19
updated: 2026-04-22
---

# API Reference

AKARI App SDK が提供する **7 つの API 群**の入口ページ。
各 API の詳細仕様は個別ページにリンクしている。

---

## 1. 概要

AKARI OS は **Core（基盤）** と **App（アプリ）** の 2 層で構成される。
App 開発者は Core の機能を直接触らず、**App SDK（`@akari-os/sdk`）** を通じてのみアクセスする。
この SDK が内部で 7 つの API 群に分かれており、それぞれが「記憶」「エージェント」「UI」「権限」「連携」「文脈」「スキル」という独立した責務を担う。

```
┌─────────────────────────────────────────────────────────────────────┐
│  App（あなたのアプリ）                                               │
│                                                                     │
│   import { pool, amp, ace, shell, app,                              │
│            permission, skill } from "@akari-os/sdk"                 │
│                                                                     │
│   ↓ Agent API  ↓ Memory API  ↓ Context API  ↓ UI API               │
│   ↓ Inter-App API  ↓ Permission API  ↓ Skill API                    │
├─────────────────────────────────────────────────────────────────────┤
│  AKARI Core                                                         │
│   Shell / Agent Runtime / Memory Layer / Semantic Layer             │
│   Protocol Suite（MCP / M2C / AMP / ACE）                           │
└─────────────────────────────────────────────────────────────────────┘
```

**App から Core へのアクセスは必ずこの SDK 経由**。Core の内部実装に直接依存するコードは書かない（Guidelines §6.7 準拠）。

---

## 2. API 全体マップ

各 API の責務と相互依存を示す。

### 責務一覧

| API | 主な責務 | 依存先 | 典型的な利用者 |
|---|---|---|---|
| **Agent API** | App 固有エージェントの定義・呼び出し | Memory API（状態の保存）、Context API（文脈の組み立て） | どの App でも使う |
| **Memory API** | Pool（素材）と AMP（記憶・判断ログ）へのアクセス | Core Memory Layer | どの App でも使う |
| **Context API** | ACE を使ったコンテキストの組み立て・Lint | Memory API（ソースの取得） | Agent を呼び出す前 |
| **UI API** | Shell へのパネル mount、イベント受信 | Shell（Core） | Full Tier App |
| **Inter-App API** | App 間の handoff（データ受け渡し） | Memory API（ID 渡し） | App をまたぐ連携 |
| **Permission API** | 権限ゲート・HITL（人間承認）の発火 | Core 権限管理、AMP（監査ログ） | 外部通信・HITL が要る操作 |
| **Skill API** | 関数の公開と他 App からの呼び出し | Core Skill Registry | App 間の機能共有 |

### 相互依存の方向

```
Permission API
     ↑
     │（全 API が必要に応じてゲートを通す）
     │
Agent API ──→ Context API ──→ Memory API（Pool / AMP）
     │                              ↑
     └──────────────────────────────┘（状態の読み書き）

UI API ──→ Shell（Core）

Inter-App API ──→ Memory API（ID のみ渡す）

Skill API ──→ Core Skill Registry ──→ 他 App
```

依存の基本原則：**Memory API はすべての API の土台**。エージェントも UI も Permission も、状態を持ちたいなら Memory API（Pool / AMP）に書く。

---

## 3. 7 API 一覧

### Agent API

[詳細 → agent-api.md](./agent-api.md)

App 固有のエージェントを定義し、ephemeral（揮発）に呼び出す API。`defineAgent` で仕様をファイルに固定し、`invoke` / `spawn` で実行する。エージェント自身は状態を持たず、状態は必ず Memory API に書く。

---

### Memory API

[詳細 → memory-api.md](./memory-api.md)

**Pool**（素材の Content-Addressed ストア）と **AMP**（記憶・判断ログ）への読み書き API。App は自前の DB を持たず、すべてのデータをここに置く。AMP の全 record には `goal_ref`（ゴール参照）が必須。

---

### Context API

[詳細 → context-api.md](./context-api.md)

ACE（Agent Context Engine）を使い、エージェントに渡すコンテキストを組み立てる API。Pool と AMP から素材を引っ張り、`goal_ref` 付きの構造化文脈を生成する。`ace.lint` で禁止パターン（機密情報混入・goal 未紐付け等）を検出できる。

---

### UI API

[詳細 → ui-api.md](./ui-api.md)

Shell にパネルを mount し、Shell からのイベント（選択変化・フォーカス等）を受信する API。App は独自ウィンドウを作らず、Shell の panel 規格（spec-shell-panel-framework）に従う。Full Tier では任意の React コンポーネントを渡せる。

---

### Inter-App API

[詳細 → inter-app-api.md](./inter-app-api.md)

App 間でデータを受け渡す（handoff）API。直接 payload を送らず、Pool / AMP の **ID だけ**を渡す。受け側は ID から Memory Layer で素材を fetch する。これにより「誰が何を渡したか」が AMP に自動記録される。

---

### Permission API

[詳細 → permission-api.md](./permission-api.md)

`akari.toml` の `[permissions]` 宣言に基づいて実行時の権限をゲートする API。HITL（Human-in-the-loop）フラグを `true` にすると Core が承認 UI を出す。すべての gate 通過は AMP に監査ログとして記録される。

---

### Skill API

[詳細 → skill-api.md](./skill-api.md)

関数を他の App に公開（`skill.register`）し、他 App の関数を呼び出す（`skill.call`）API。Input / Output は JSON Schema で型付け必須。公開 skill は Certification で review 対象になる。

---

## 4. 共通の呼び出しパターン

### import

```typescript
// 必要な API のみ import する（tree-shaking 有効）
import { pool, amp, ace, shell, app, permission, skill } from "@akari-os/sdk"
```

TypeScript の型定義は `@akari-os/sdk` に同梱されている。別途 `@types/*` は不要。

### エラーハンドリング

すべての API は **Promise を返す**。エラーは例外としてスローされ、`AkariError` 型を持つ。

```typescript
import { pool, AkariError, AkariErrorCode } from "@akari-os/sdk"

try {
  const item = await pool.get(id)
} catch (err) {
  if (err instanceof AkariError) {
    switch (err.code) {
      case AkariErrorCode.NotFound:
        // pool に存在しない
        break
      case AkariErrorCode.PermissionDenied:
        // manifest に権限宣言がない
        break
      case AkariErrorCode.Offline:
        // external-network=false でネット要求
        break
    }
  }
}
```

### Permission の宣言

実行時の `permission.gate` を呼ぶ前に、`akari.toml` の `[permissions]` で宣言が必要。
宣言のない権限を要求すると `PermissionDenied` エラーになる。

```toml
# akari.toml
[permissions]
pool = ["read", "write"]
amp  = ["read", "write"]
external-network = ["api.example.com"]   # HITL 必須
```

### goal_ref の付与

Memory API / Context API を呼ぶ際は、必ず `goal_ref` を付ける。
ゴールに紐付かない記憶は追跡不能になり、Lint で検出される。

```typescript
// AMP に記録するときは goal_ref 必須
await amp.record({
  kind: "decision",
  content: "ユーザーが見出しを変更",
  goal_ref: "AKARI-HUB-024",   // spec-id または任意のゴール識別子
})
```

---

## 5. どの API を選ぶか（タスク別ガイド）

実装したいことから API を選ぶためのクイックリファレンス。

| やりたいこと | 使う API | ポイント |
|---|---|---|
| **下書きを保存したい** | [Memory API](./memory-api.md)（`pool.put`） | bytes + mime + tags で保存。ID が返る |
| **判断・操作を記録したい** | [Memory API](./memory-api.md)（`amp.record`） | `goal_ref` 必須。監査ログにもなる |
| **専門エージェントを呼びたい** | [Agent API](./agent-api.md)（`invoke` / `spawn`） | 事前に `defineAgent` でファイル定義が必要 |
| **エージェントに渡す文脈を作りたい** | [Context API](./context-api.md)（`ace.build`） | Pool + AMP をソースに指定 |
| **UI パネルを Shell に出したい** | [UI API](./ui-api.md)（`shell.mountPanel`） | Full Tier: React component を渡す |
| **他の App にデータを渡したい** | [Inter-App API](./inter-app-api.md)（`app.handoff`） | bytes ではなく Pool / AMP の ID を渡す |
| **外部 API を叩く前に承認を取りたい** | [Permission API](./permission-api.md)（`permission.gate`） | `hitl: true` で承認 UI が出る |
| **自分の機能を他 App に公開したい** | [Skill API](./skill-api.md)（`skill.register`） | JSON Schema で Input / Output を型付け |
| **他 App の機能を呼び出したい** | [Skill API](./skill-api.md)（`skill.call`） | `akari.toml` の `[skills.imported]` に宣言 |
| **コンテキストが仕様に合っているか確認したい** | [Context API](./context-api.md)（`ace.lint`） | `[]` が返れば pass |

---

## 6. 型定義の取り込み

`@akari-os/sdk` には TypeScript の型定義がすべて含まれる。`tsconfig.json` に特別な設定は不要。

```bash
npm install @akari-os/sdk
```

```typescript
// 型定義の例
import type {
  PoolItem,         // pool.put / pool.get の戻り値
  AmpRecord,        // amp.record の引数
  AceContext,       // ace.build の戻り値
  AgentDef,         // defineAgent の引数
  HandoffPayload,   // app.handoff の引数
  PermissionGate,   // permission.gate の引数
  SkillDef,         // skill.register の引数
  AkariError,       // エラー基底クラス
  AkariErrorCode,   // エラーコード enum
} from "@akari-os/sdk"
```

Rust App を開発する場合は `akari-sdk-rs` crate を使う（API の構造は同一）。

```toml
# Cargo.toml
[dependencies]
akari-sdk = "0.1"
```

---

## 7. 相互作用図

典型的なフロー：**App が UI を出し、ユーザー承認を取り、エージェントを動かし、結果を保存し、他 App へ渡す**。

```
App の処理フロー（例: Writer が下書きを仕上げて X Sender に渡す）

1. App 起動
   └─ UI API: shell.mountPanel({ component: WriterPanel })
              └─ Shell が Writer パネルを描画

2. ユーザーが「エージェントに整えてもらう」をクリック
   └─ Permission API: permission.gate({ action: "pool.read", hitl: false })
              └─ OK（manifest 宣言あり）

3. コンテキスト組み立て
   └─ Context API: ace.build({
        intent: "下書きを整える",
        goal_ref: "writer-session-001",
        sources: [{ kind: "pool", query: "current-draft" }]
      })

4. エージェント呼び出し
   └─ Agent API: invoke({
        agent: "writer_editor",
        prompt: "この下書きを整えて",
        context: aceContext
      })
              └─ エージェントが処理（内部で Memory API を読み書き）

5. 結果を Pool に保存
   └─ Memory API: pool.put({ bytes: editedBytes, mime: "text/markdown", tags: ["draft", "edited"] })
              └─ poolItemId が返る

6. 判断ログを AMP に記録
   └─ Memory API: amp.record({
        kind: "decision",
        content: "エディタが見出しを最適化",
        goal_ref: "writer-session-001"
      })

7. X Sender へ handoff
   └─ Permission API: permission.gate({ action: "inter-app.handoff", hitl: false })
   └─ Inter-App API: app.handoff({
        to: "com.x.sender",
        intent: "post-from-draft",
        payload: { draft_ref: ampRecordId, assets: [poolItemId] }
      })
              └─ X Sender が Pool / AMP から素材を fetch して投稿処理

8. X Sender が投稿を実行
   └─ Permission API: permission.gate({ action: "external-network.post", hitl: true })
              └─ Core が承認ダイアログを表示 → ユーザーが「投稿」を押す
   └─ MCP ツール経由で X API を呼び出し
   └─ Memory API: amp.record({ kind: "action", content: "X に投稿", goal_ref: "..." })
```

この図が示す原則：
- **UI → Permission → Agent → Memory → Inter-App → Permission（HITL）** の順序が典型的な安全フロー
- bytes ではなく ID だけが App 間を流れる（Inter-App の原則）
- すべての判断が AMP に記録される（監査可能性）

---

## 8. 関連ドキュメント

### Tier ガイド

App の実装方式（Full / MCP-Declarative）については Tier ガイドを参照。

- [Tier 概要](../tiers/README.md)
- [Full Tier ガイド](../tiers/full.md)
- [MCP-Declarative Tier ガイド](../tiers/mcp-declarative.md)

### Getting Started

初めて App を作る場合はこちらから。

- [SDK Getting Started](../getting-started.md)

### コンセプト

設計思想・アーキテクチャの背景。

- [コンセプト概要](../concepts/README.md)

### 仕様（spec）

実装の根拠となる仕様書。

- [AKARI-HUB-024 App SDK (正典は Hub)] — 本 API 群の原仕様
- Shell + App モデル (internal spec)
- Memory Layer 構造 (internal spec)
- [Panel Schema（HUB-025）](https://github.com/Akari-OS/.github/blob/main/VISION.md)

---

> **次のステップ**: 何をしたいかが決まったら §5 のタスク別ガイドから目的の API を選び、各 API の詳細ページへ進む。
