---
title: Contract Test — 7 API 契約テストスイート
updated: 2026-04-19
related: [HUB-024 §8, HUB-025]
---

<!-- markdownlint-disable MD051 -->
<!-- TODO: 目次の anchor が日英バイリンガル見出し（"## N. JP / EN"）の slug 末尾と一致しない。
     anchor を `#n-jp--en` 形式に揃えるリファクタは別 PR で対応予定。
     (差分監査 2026-04-25 sdk-fix-wave で MD051 を file-level 一時 disable) -->

# Contract Test — 7 API 契約テストスイート / Contract Test Suite

> Certification 第 2 層。App が AKARI Core の **7 API の契約**を正しく実装しているかを
> **動的に**検証する。Lint（静的解析）が「形式」を見るのに対し、Contract Test は「動作」を見る。
> `akari app certify` がモックランナーを起動し、すべてのスイートを自動実行する。

---

## 目次 / Table of Contents

1. [Contract Test の仕組み](#1-contract-test-の仕組み)
2. [テストスイート一覧](#2-テストスイート一覧)
3. [Suite 1: Agent API Contract](#3-suite-1-agent-api-contract)
4. [Suite 2: Memory API Contract](#4-suite-2-memory-api-contract)
5. [Suite 3: Context API Contract](#5-suite-3-context-api-contract)
6. [Suite 4: UI API Contract](#6-suite-4-ui-api-contract)
7. [Suite 5: Inter-App API Contract](#7-suite-5-inter-app-api-contract)
8. [Suite 6: Permission API Contract](#8-suite-6-permission-api-contract)
9. [Suite 7: Skill API Contract](#9-suite-7-skill-api-contract)
10. [Suite 8: MCP Tool Schema Contract](#10-suite-8-mcp-tool-schema-contract)
11. [Suite 9: Offline Isolation Test](#11-suite-9-offline-isolation-test)
12. [モックランナーの使い方](#12-モックランナーの使い方)
13. [Fixture の書き方](#13-fixture-の書き方)
14. [CI 統合（GitHub Actions 例）](#14-ci-統合github-actions-例)

---

## 1. Contract Test の仕組み / How Contract Tests Work

### 1.1 設計思想

Contract Test は **trait-based testing** を採用する。
「App が SDK の契約（trait / interface）を満たしているか」を確認するのが目的であり、
App の内部ロジック（ビジネスロジック）をテストするものではない。

```
┌─────────────────────────────────────────────────────┐
│ Contract Test の役割                                 │
│                                                     │
│  App ←→ Core SDK の境界（contract）をテストする   │
│                                                     │
│  App 内部のロジック（Unit Test）はテストしない     │
│  → それは App 開発者自身の責任                    │
└─────────────────────────────────────────────────────┘
```

### 1.2 モックランナーのアーキテクチャ

`akari app certify` が起動するモックランナーは、AKARI Core の各 API を **インメモリモック**で提供する。App はこのモックに対して実際に SDK を呼び出す。

```
┌──────────────────────────────────────────┐
│  akari app certify                       │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │  Mock Runner                        │ │
│  │   ├── Mock Pool API                 │ │
│  │   ├── Mock AMP API                  │ │
│  │   ├── Mock ACE API                  │ │
│  │   ├── Mock Shell API                │ │
│  │   ├── Mock Permission Gate          │ │
│  │   ├── Mock Skill Registry           │ │
│  │   └── Mock MCP Client              │ │
│  └──────────────┬──────────────────────┘ │
│                 │ SDK calls              │
│  ┌──────────────▼──────────────────────┐ │
│  │  App Under Test                  │ │
│  │  (実際の App コード)              │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 1.3 Tier ごとの適用スイート

| スイート | Full | MCP-Declarative | 適用条件 |
|---|:-:|:-:|---|
| Suite 1: Agent API | ✅ | — | `[agents]` が宣言されている |
| Suite 2: Memory API | ✅ | ✅ | `pool` / `amp` permission が宣言されている |
| Suite 3: Context API | ✅ | — | `ace` 呼び出しがある |
| Suite 4: UI API | ✅ | ✅ | `[panels]` が宣言されている |
| Suite 5: Inter-App API | ✅ | ✅ | `handoff` 呼び出し / 宣言がある |
| Suite 6: Permission API | ✅ | ✅ | `[permissions]` が宣言されている |
| Suite 7: Skill API | ✅ | — | `[skills.exposed]` が宣言されている |
| Suite 8: MCP Tool Schema | — | ✅ | `[mcp] tools` が宣言されている |
| Suite 9: Offline Isolation | ✅ | ✅ | 常に実行 |

---

## 2. テストスイート一覧 / Test Suite Overview

| Suite | テスト数 | Full | MCP-D | 概要 |
|---|---|:-:|:-:|---|
| 1: Agent API Contract | 5 | ✅ | — | defineAgent / invoke / spawn の基本契約 |
| 2: Memory API Contract | 8 | ✅ | ✅ | pool / amp の CRUD + goal_ref 必須 |
| 3: Context API Contract | 4 | ✅ | — | ace.build / ace.lint の契約 |
| 4: UI API Contract | 5 | ✅ | ✅ | mountPanel + Schema Panel の契約 |
| 5: Inter-App API Contract | 4 | ✅ | ✅ | handoff の payload 形式 |
| 6: Permission API Contract | 6 | ✅ | ✅ | gate 通過 / 未宣言拒否 / HITL |
| 7: Skill API Contract | 5 | ✅ | — | register / call の型整合性 |
| 8: MCP Tool Schema Contract | 6 | — | ✅ | MCP tool input/output と Panel bind の整合 |
| 9: Offline Isolation Test | 3 | ✅ | ✅ | 外部通信ブロック時の動作確認 |
| **合計** | **46** | | | |

---

## 3. Suite 1: Agent API Contract

**適用**: Full Tier（`[agents]` 宣言あり）

### CT-1.1: defineAgent — 必須フィールドの存在

`defineAgent()` の呼び出しが以下の必須フィールドを含むこと。

```typescript
// 検証対象
defineAgent({
  id: string,               // 必須: "<app-short-id>_<role>" 形式（ADR-011）
  persona: string,          // 必須: 非空文字列
  tools: string[],          // 必須: 空でない配列
  model: string,            // 必須: 有効な model identifier
})
```

**合格条件**: 上記すべてのフィールドが存在し、型が正しい。  
**不合格例**: `id` が空文字列、`tools` が空配列。

---

### CT-1.2: defineAgent — id フォーマット（ADR-011）

`defineAgent({ id })` が `<app-short-id>_<role>` の snake_case 形式であること。

**合格条件**: `id` が `^<app-short-id>_[a-z][a-z0-9_]*$` にマッチする。  
**不合格例**: `id = "editor"`（prefix なし）、`id = "writer-editor"`（ハイフン）。

---

### CT-1.3: invoke — レスポンス形式

`invoke()` がモックエージェントに対してコールされたとき、レスポンスが以下の形式を持つこと。

```typescript
const result = await invoke({ agent: "writer_editor", prompt: "..." })
// 期待: { output: string, metadata: { agent_id: string, model: string } }
```

**合格条件**: `result.output` が string 型、`result.metadata.agent_id` がリクエストと一致。

---

### CT-1.4: spawn — 並列実行と独立性

`Promise.all([spawn(...), spawn(...)])` で並列呼び出しが完了し、各レスポンスが独立していること。

**合格条件**: 2 件の spawn が両方 resolve し、`result[0]` と `result[1]` が独立したオブジェクト。

---

### CT-1.5: エージェント状態の記憶層書き込み

エージェントが `invoke` または `spawn` 内で状態を持ち越す場合、`amp.record()` を経由すること。
モックランナーが AMP への書き込みを監視し、Agent 呼び出し後に書き込みがあるかを確認する。

**合格条件**: エージェントが状態を持つ場合、`amp.record()` が少なくとも 1 回呼ばれる。  
**補足**: エージェントが状態を持たないステートレスエージェントなら pass。

---

## 4. Suite 2: Memory API Contract

**適用**: Full / MCP-Declarative（`pool` または `amp` permission 宣言あり）

### CT-2.1: pool.put — Content-Addressed 保存

```typescript
const id = await pool.put({ bytes: Buffer.from("test"), mime: "text/plain", tags: ["draft"] })
// 期待: id が非空の blake3 ハッシュ文字列
```

**合格条件**: 返却された `id` が非空の string。同じ内容を 2 回 put すると同じ `id` が返る（冪等性）。

---

### CT-2.2: pool.get — 保存データの取得

```typescript
const item = await pool.get(id)
// 期待: { bytes: Buffer, mime: string, tags: string[] }
```

**合格条件**: put した `bytes` / `mime` / `tags` が get で一致して返る。  
**不合格例**: 存在しない `id` を get したときに例外でなく `null` が返る（例外を期待）。

---

### CT-2.3: pool.search — クエリで検索

```typescript
const items = await pool.search({ query: "last week's drafts" })
// 期待: Array<PoolItem>（空配列も合格）
```

**合格条件**: 配列が返る。モックは空配列を返すが、型が正しければ合格。

---

### CT-2.4: amp.record — goal_ref 必須

```typescript
// NG: goal_ref なし → CT 失敗
await amp.record({ kind: "decision", content: "..." })

// OK: goal_ref あり
await amp.record({ kind: "decision", content: "...", goal_ref: "MODULE-001" })
```

**合格条件**: `goal_ref` フィールドが存在し非空文字列。  
**不合格例**: `goal_ref` が省略されている場合、モックが `AMP_GOAL_REF_REQUIRED` エラーを返す → App がそれを無視して処理を続けていたら FAIL。

---

### CT-2.5: amp.record — 監査ログの形式

```typescript
const record = await amp.record({ kind: "decision", content: "...", goal_ref: "G-001" })
// 期待: { id: string, timestamp: string, kind: string, content: string, goal_ref: string }
```

**合格条件**: 返却レコードが上記フィールドをすべて持つ。

---

### CT-2.6: amp.query — goal_ref でフィルタ

```typescript
const history = await amp.query({ goal_ref: "G-001" })
// 期待: Array<AmpRecord>
```

**合格条件**: 配列が返る。`goal_ref` フィルタが機能していること（モックは仕込んだデータを返す）。

---

### CT-2.7: Pool のデータは AMP 経由で App 間共有

**シナリオ**: App A が `pool.put()` し、App B が `pool.get(id)` できること。
モックランナーが共有ストアを提供するため、ID を渡せば別 App からも参照できる。

**合格条件**: App が put した ID を別の「仮想 App B コンテキスト」から get できる。

---

### CT-2.8: pool permission 外の操作拒否

```typescript
// [permissions] pool = ["read"] のみ宣言の場合
await pool.put(...)  // → "PERMISSION_DENIED: pool.write not declared" エラーを期待
```

**合格条件**: 宣言していない権限で操作しようとした際に `PERMISSION_DENIED` エラーが throw される。

---

## 5. Suite 3: Context API Contract

**適用**: Full Tier（`ace` 呼び出しがある）

### CT-3.1: ace.build — goal_ref 必須

```typescript
const ctx = await ace.build({
  intent: "...",
  goal_ref: "G-001",   // 必須
  sources: [...],
})
```

**合格条件**: `goal_ref` あり → 正常なコンテキストオブジェクトが返る。  
**不合格例**: `goal_ref` なし → `ACE_GOAL_REF_REQUIRED` エラーが throw される。

---

### CT-3.2: ace.build — sources の形式

```typescript
sources: [
  { kind: "pool", query: "recent-videos" },      // Pool 検索
  { kind: "amp", filter: { kind: "preference" } }, // AMP フィルタ
]
```

**合格条件**: `kind` が `"pool"` または `"amp"` のいずれか。他の kind（例: `"http"`）は `ACE_INVALID_SOURCE` エラー。

---

### CT-3.3: ace.lint — 正常コンテキストは空配列

```typescript
const issues = await ace.lint(context)
// 正常なコンテキスト → issues = []
```

**合格条件**: Lint が空配列を返す。

---

### CT-3.4: ace.lint — 機密情報混入の検知

モックランナーに「機密情報パターン」が含まれたコンテキストを流し込み、Lint が検知すること。

```typescript
const badContext = await ace.build({
  intent: "test",
  goal_ref: "G-001",
  sources: [],
  extra: { password: "secret123" },   // 機密情報パターン
})
const issues = await ace.lint(badContext)
// 期待: issues.length > 0
```

**合格条件**: 機密パターンを含むコンテキストで `issues` が非空配列。

---

## 6. Suite 4: UI API Contract

**適用**: Full / MCP-Declarative（`[panels]` 宣言あり）

### CT-4.1: mountPanel — 必須フィールド

```typescript
shell.mountPanel({
  id: string,           // 必須: "<app-id>.<panel-name>"
  title: string,        // 必須
  component: Component, // Full: 必須 / MCP-Declarative: 不要
})
```

**合格条件**: 上記フィールドが存在する。`id` が `"<app-id>."` プレフィックスを含む。

---

### CT-4.2: mountPanel — id のプレフィックス

`mountPanel.id` が `<app-id>.` で始まること。

```typescript
// NG
shell.mountPanel({ id: "main", ... })

// OK (app id = "com.akari.writer")
shell.mountPanel({ id: "com.akari.writer.main", ... })
```

---

### CT-4.3: MCP-Declarative — panel.schema.json の Shell への渡し方

MCP-Declarative の場合、`panel.schema.json` の内容が Shell に正しく渡されること。

**合格条件**: モックシェルが受け取った schema オブジェクトの `$schema` が `"akari://panel-schema/v0"` であること。

---

### CT-4.4: shell.onSelection — コールバック登録

```typescript
shell.onSelection((sel) => { /* ... */ })
```

**合格条件**: `onSelection` にコールバックを登録できる。モックがイベントを emit したとき、コールバックが呼ばれる。

---

### CT-4.5: shell.onFocus — フォーカスイベント

```typescript
shell.onFocus(() => { /* ... */ })
```

**合格条件**: `onFocus` コールバックがモックの focus emit に応答する。

---

## 7. Suite 5: Inter-App API Contract

**適用**: Full / MCP-Declarative（`handoff` 呼び出し / Panel Schema の handoff action あり）

### CT-5.1: handoff — payload に bytes 直渡し禁止

`app.handoff()` の `payload` フィールドに Pool / AMP の **ID のみ** を渡し、bytes を直接含めないこと。

```typescript
// NG
await app.handoff({
  to: "com.akari.video",
  intent: "create-video",
  payload: { bytes: buffer },       // bytes 直渡しは禁止
})

// OK
await app.handoff({
  to: "com.akari.video",
  intent: "create-video",
  payload: { draft_ref: ampId, assets: [poolId1, poolId2] },
})
```

**合格条件**: `payload` が bytes/Buffer 型のフィールドを含まない。

---

### CT-5.2: handoff — to フィールドの形式

`to` フィールドが逆ドメイン形式の App ID であること。

**合格条件**: `to` が `LINT-001` と同じ逆ドメイン形式チェックを通過する。

---

### CT-5.3: handoff — intent フィールドの存在

`intent` フィールドが非空文字列であること。

**合格条件**: `intent.length > 0`。

---

### CT-5.4: handoff — AMP への自動記録

`app.handoff()` 呼び出し後、モックの AMP に監査ログが自動記録されること。

**合格条件**: モックの AMP ストアに `kind: "inter-app-handoff"` のレコードが記録される。

---

## 8. Suite 6: Permission API Contract

**適用**: Full / MCP-Declarative（`[permissions]` 宣言あり）

### CT-6.1: manifest 宣言済み permission の通過

`akari.toml [permissions]` に宣言した権限は `permission.gate()` を通過すること。

```typescript
// manifest に pool = ["read", "write"] を宣言済みの場合
await permission.gate({ action: "pool.write", reason: "下書きを保存" })
// 期待: 通過（例外なし）
```

**合格条件**: 宣言済み action で例外が throw されない。

---

### CT-6.2: 未宣言 permission の拒否

manifest に宣言していない権限は `PERMISSION_DENIED` で拒否されること。

```typescript
// manifest に external-network = false
await permission.gate({ action: "external-network.post", reason: "..." })
// 期待: PERMISSION_DENIED 例外
```

**合格条件**: `PERMISSION_DENIED` 例外が throw される。

---

### CT-6.3: HITL ゲートの動作

`hitl: true` を指定した `permission.gate()` が、モックの HITL 承認プロンプトを経由すること。

```typescript
// モックは事前に「承認」を設定
mockPermission.setHitlResponse("approve")

await permission.gate({
  action: "external-network.post",
  reason: "X に投稿",
  hitl: true,
})
// 期待: 通過（モックが承認を返す）
```

**合格条件**: HITL 承認 → 通過、HITL 拒否 → `HITL_REJECTED` 例外。

---

### CT-6.4: HITL 拒否時の動作

```typescript
mockPermission.setHitlResponse("reject")
// 期待: HITL_REJECTED 例外
```

**合格条件**: App が `HITL_REJECTED` 例外を適切にハンドリングする（クラッシュしない）。

---

### CT-6.5: 全 permission.gate が AMP に監査ログ記録

`permission.gate()` の呼び出しごとに AMP に監査ログが記録されること。

**合格条件**: `permission.gate()` を N 回呼んだ後、AMP に N 件の `kind: "permission-gate"` レコードが記録される。

---

### CT-6.6: pool permission の scope チェック

`pool = ["read"]` のみ宣言した場合、`pool.write` は拒否されること（LINT-045 の動的版）。

**合格条件**: `pool.write` → `PERMISSION_DENIED`。`pool.read` → 通過。

---

## 9. Suite 7: Skill API Contract

**適用**: Full Tier（`[skills.exposed]` 宣言あり）

### CT-7.1: skill.register — Input/Output Schema の存在

`skill.register()` に `input` / `output` の JSON Schema が指定されていること。

```typescript
skill.register({
  id: "writer.generate_draft",
  input: { type: "object", properties: { topic: { type: "string" } } },
  output: { type: "object", properties: { draft: { type: "string" } } },
  handler: async (input) => { ... },
})
```

**合格条件**: `input` と `output` が非 null の JSON Schema オブジェクト。

---

### CT-7.2: skill.register — id のプレフィックス

`skill.register.id` が `<app-short-id>.` で始まること（ADR-011 準拠）。

```typescript
// NG
skill.register({ id: "generate_draft", ... })

// OK
skill.register({ id: "writer.generate_draft", ... })
```

**合格条件**: `id.startsWith(appShortId + ".")`

---

### CT-7.3: skill.call — Input の JSON Schema バリデーション

`skill.call()` が不正な input を渡したとき、Input Schema バリデーションエラーが返ること。

```typescript
// input schema: { topic: string }（required）
const result = await skill.call("writer.generate_draft", {})  // topic なし
// 期待: SKILL_INPUT_INVALID エラー
```

**合格条件**: バリデーションエラーが throw または返却される。

---

### CT-7.4: skill.call — 正常な呼び出しの Output 形式

```typescript
const result = await skill.call("writer.generate_draft", { topic: "AI" })
// 期待: output schema に準拠したオブジェクト
```

**合格条件**: `result` が output JSON Schema に対して valid であること。

---

### CT-7.5: skill の冪等性（推奨）

同じ input で 2 回 call したとき、同じ output が返ること（推奨テスト）。

**合格条件**: `result1` と `result2` が深い等価（DeepEqual）を満たす。  
**補足**: 外部サービスへのアクセスを含む Skill は冪等でない場合があるため `warning` 扱い。

---

## 10. Suite 8: MCP Tool Schema Contract

**適用**: MCP-Declarative Tier（`[mcp] tools` 宣言あり）

### CT-8.1: MCP ツール — input schema の存在

宣言された各 MCP ツールが `inputSchema` を持つこと。

```json
// MCP ツールの describe() 結果
{
  "name": "x.post",
  "inputSchema": {
    "type": "object",
    "properties": {
      "text": { "type": "string", "maxLength": 280 },
      "media": { "type": "array" }
    },
    "required": ["text"]
  }
}
```

**合格条件**: `inputSchema` が非 null の JSON Schema オブジェクト。

---

### CT-8.2: MCP ツール — Panel Schema の bind と整合性

`panel.schema.json` の `fields[].bind = "mcp.<tool>.<param>"` が MCP ツールの `inputSchema` と一致すること。

```
例: bind = "mcp.x.post.text"
  → ツール "x.post" の inputSchema.properties.text が存在することを確認
```

**合格条件**: bind で参照するすべての `<param>` が MCP ツールの inputSchema に存在する。

---

### CT-8.3: MCP ツール — action の args と bind の整合性

```json
{
  "id": "post",
  "mcp": { "tool": "x.post", "args": { "text": "$text", "media": "$media" } }
}
```

`args` のキー（`text`, `media`）がすべて対応する MCP ツールの inputSchema プロパティに存在すること。

**合格条件**: `args` のキーが inputSchema.properties に存在する。

---

### CT-8.4: MCP ツール呼び出し — モックでのレスポンス形式

モック MCP クライアント経由でツールを呼び出したとき、レスポンスが `{ content: [...] }` 形式を持つこと（MCP Protocol 準拠）。

**合格条件**: レスポンスに `content` 配列が存在する。

---

### CT-8.5: required フィールドの Panel での required 整合

MCP ツールの inputSchema で `required` に指定されたフィールドが、Panel Schema の対応フィールドで `"required": true` になっていること。

**合格条件**: inputSchema.required ⊆ panel schema のフィールド required 集合。

---

### CT-8.6: MCP tools 宣言と実際のツール数の一致

`akari.toml [mcp] tools` に宣言したツールが、MCP サーバーの `list_tools()` で実際に返ってくること。

```toml
# akari.toml
tools = ["x.post", "x.schedule", "x.draft"]
```

```
# MCP サーバーが返すツール: x.post, x.schedule, x.draft
# → 一致 ✓
```

**合格条件**: 宣言された tools と実際のツールセットが一致（順序不問）。

---

## 11. Suite 9: Offline Isolation Test

**適用**: Full / MCP-Declarative（常に実行）

### CT-9.1: external-network = false 宣言時の完全オフライン動作

`[permissions] external-network = false` が宣言されている場合、ネットワークを完全にブロックした状態で App の基本機能（Panel 描画 / Agent 呼び出し / Memory アクセス）が動作すること。

**テスト手順**:

1. モックランナーがネットワーク呼び出しを全ブロック
2. App を起動
3. Panel が mount される
4. Pool / AMP アクセスが正常動作

**合格条件**: ネットワークブロック状態でもクラッシュせず、Pool / AMP アクセスが成功する。

---

### CT-9.2: 外部通信ブロック時のフォールバック動作

`external-network` が宣言されているが、ネットワークが利用できない場合（タイムアウト）に App がクラッシュせずフォールバック動作すること。

**合格条件**: 外部通信失敗時に `EXTERNAL_NETWORK_ERROR` をハンドリングし、エラーメッセージまたは degraded 状態で動作する。

---

### CT-9.3: Hot tier（インメモリ）のみで動作

Pool の Cold tier（外部ストレージ）へのアクセスができない状態でも、Hot tier（インメモリ）のデータにアクセスできること。

**合格条件**: モックランナーが Hot tier のみ提供する状態で、`pool.get()` / `pool.put()` が成功する。

---

## 12. モックランナーの使い方 / Mock Runner Usage

### 12.1 CLI から直接実行

```bash
# Contract Test のみ実行
akari app certify --only contract

# 特定のスイートのみ実行
akari app certify --only contract --suite memory,permission

# verbose 出力（各テストケースの詳細）
akari app certify --only contract --verbose

# タイムアウト設定（デフォルト 60 秒）
akari app certify --only contract --timeout 120
```

### 12.2 コードから直接使う（開発中のデバッグ）

```typescript
// tests/contract/debug.ts
import { createMockRunner } from "@akari/sdk/testing"

const runner = createMockRunner({
  manifest: "./akari.toml",
  fixtures: "./tests/contract/fixtures",
})

// 個別スイートを手動実行
const result = await runner.run("memory")
console.log(result)

// 全スイート実行
const results = await runner.runAll()
```

### 12.3 モックの事前設定

```typescript
import { createMockRunner } from "@akari/sdk/testing"

const runner = createMockRunner({ manifest: "./akari.toml" })

// Pool にデータを事前投入
runner.pool.seed([
  { id: "abc123", bytes: Buffer.from("draft content"), mime: "text/plain", tags: ["draft"] }
])

// AMP に事前データを投入
runner.amp.seed([
  { id: "rec001", kind: "style-preference", content: "...", goal_ref: "G-001" }
])

// HITL の応答を設定
runner.permission.setHitlResponse("approve")  // または "reject"

// 外部通信のモック応答を設定
runner.network.mock("https://api.x.com/2/tweets", {
  status: 200,
  body: { data: { id: "tweet123" } }
})
```

---

## 13. Fixture の書き方 / Writing Fixtures

Fixture は `tests/contract/fixtures/` 配下に置く。

### 13.1 ディレクトリ構造

```
tests/
└── contract/
    ├── fixtures/
    │   ├── pool.json         ← Pool の初期データ
    │   ├── amp.json          ← AMP の初期データ
    │   ├── mcp-responses/    ← MCP ツールのモックレスポンス
    │   │   ├── x.post.json
    │   │   └── x.schedule.json
    │   └── network/          ← 外部 HTTP モックレスポンス
    │       └── api.x.com.json
    └── custom/               ← App 固有のカスタムテスト
        └── my-custom.test.ts
```

### 13.2 pool.json の形式

```json
[
  {
    "id": "pool-item-001",
    "bytes_base64": "ZHJhZnQgY29udGVudA==",
    "mime": "text/plain",
    "tags": ["draft", "test"],
    "created_at": "2026-04-19T00:00:00Z"
  }
]
```

### 13.3 amp.json の形式

```json
[
  {
    "id": "amp-record-001",
    "kind": "decision",
    "content": "テスト用の記憶レコード",
    "goal_ref": "TEST-001",
    "timestamp": "2026-04-19T00:00:00Z"
  }
]
```

### 13.4 MCP ツールのモックレスポンス（mcp-responses/x.post.json）

```json
{
  "content": [
    {
      "type": "text",
      "text": "{ \"data\": { \"id\": \"tweet123\", \"text\": \"Hello\" } }"
    }
  ]
}
```

### 13.5 カスタム Contract Test の書き方

App 固有のテストケースを追加したい場合は `tests/contract/custom/` 配下に置く。

```typescript
// tests/contract/custom/my-custom.test.ts
import { describe, it, expect } from "vitest"
import { createMockRunner } from "@akari/sdk/testing"

describe("My App — Custom Contract", () => {
  let runner: MockRunner

  beforeEach(() => {
    runner = createMockRunner({ manifest: "./akari.toml" })
    runner.pool.seed([{ id: "test-001", bytes: Buffer.from("test"), mime: "text/plain", tags: [] }])
  })

  it("CT-CUSTOM-1: pool に存在するデータを Panel が正しく表示できる", async () => {
    const panel = await runner.renderPanel("main")
    const poolPickerField = panel.getField("media")

    // Pool にデータが事前投入されている状態でピッカーが初期化される
    expect(poolPickerField.availableItems).toHaveLength(1)
    expect(poolPickerField.availableItems[0].id).toBe("test-001")
  })
})
```

---

## 14. CI 統合（GitHub Actions 例） / CI Integration

### 14.1 基本的な CI ワークフロー

```yaml
# .github/workflows/certify.yml
name: App Certification

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  lint:
    name: Automated Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "npm"
      - run: npm ci
      - run: npm install -g @akari/app-cli
      - name: Run Lint
        run: akari app certify --only lint --output json | tee lint-report.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: lint-report
          path: lint-report.json

  contract-test:
    name: Contract Test
    runs-on: ubuntu-latest
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: "npm"
      - run: npm ci
      - run: npm install -g @akari/app-cli
      - name: Run Contract Test
        run: akari app certify --only contract --output json | tee contract-report.json
        timeout-minutes: 5
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: contract-report
          path: contract-report.json

  certify-summary:
    name: Certification Summary
    runs-on: ubuntu-latest
    needs: [lint, contract-test]
    if: always()
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: reports
      - name: Post Summary Comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs')
            const lint = JSON.parse(fs.readFileSync('reports/lint-report/lint-report.json', 'utf8'))
            const contract = JSON.parse(fs.readFileSync('reports/contract-report/contract-report.json', 'utf8'))

            const body = `## App Certification Report
            | Layer | Result | Passed | Failed |
            |---|---|---|---|
            | Automated Lint | ${lint.result} | ${lint.passed} | ${lint.failed} |
            | Contract Test  | ${contract.result} | ${contract.passed} | ${contract.failed} |
            `

            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body,
            })
```

### 14.2 MCP-Declarative Tier 向け最小 CI

```yaml
# .github/workflows/certify-mcp.yml
name: MCP-Declarative Certification

on: [push, pull_request]

jobs:
  certify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm install -g @akari/app-cli

      # Lint + Contract を 1 コマンドで
      - run: akari app certify --output json > certify-result.json

      # 結果を GitHub Summary に出力
      - name: Report to Summary
        if: always()
        run: |
          node -e "
            const r = require('./certify-result.json');
            const emoji = r.result === 'PASS' ? '✅' : '❌';
            console.log('## Certification: ' + r.result + ' ' + emoji);
            console.log('Lint: ' + r.lint.passed + '/' + r.lint.total + ' passed');
            console.log('Contract: ' + r.contract.passed + '/' + r.contract.total + ' passed');
          " >> \$GITHUB_STEP_SUMMARY
```

### 14.3 certify コマンドの終了コード

| 状況 | 終了コード |
|---|---|
| 全スイート PASS | `0` |
| Lint または Contract Test に FAIL あり | `1` |
| fatal エラー（TOML パース失敗等） | `2` |
| `--no-fail-on-error` 指定時 | 常に `0` |

---

## 関連リソース / Related Resources

- [Certification README](./README.md) — 全体像と CLI
- [Automated Lint](./automated-lint.md) — 層 1 のルール一覧
- [Manual Review](./manual-review.md) — 層 3 のチェックリスト
- [HUB-024 §8](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Testing Strategy（正典）
- [HUB-025 §6.6](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Panel Schema Validation
- [API Reference](../api-reference/) — 7 API の型定義
