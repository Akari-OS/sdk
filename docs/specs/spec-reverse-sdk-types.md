---
spec-id: AKARI-SDK-001
version: 0.1.0
status: implemented
created: 2026-04-22
updated: 2026-04-22
related-specs:
  - AKARI-HUB-024
  - AKARI-HUB-002
ai-context: claude-code
---

# AKARI-SDK-001: sdk-types — 公開型定義

## 概要

`@akari-os/sdk`（パッケージ実体: `packages/sdk-types/`）は、AKARI App SDK の TypeScript 型定義を一元管理する。7 つの API 群 + Panel Schema v0 + App Manifest の型が `src/index.ts` から re-export される。実行コードを持たない型専用パッケージである。

---

## パッケージ構成

```
packages/sdk-types/
  src/
    index.ts        — 全型の公開エントリポイント
    agent.ts        — (1) Agent API
    memory.ts       — (2) Memory API
    context.ts      — (3) Context API
    ui.ts           — (4) UI API (Shell API)
    inter-app.ts    — (5) Inter-App API
    permission.ts   — (6) Permission API
    skill.ts        — (7) Skill API
    panel-schema.ts — Panel Schema v0 型
    manifest.ts     — akari.toml 型
    errors.ts       — 共通エラーコード
```

---

## 公開型一覧

### 共通エラー

| 型 | 説明 |
|---|---|
| `AkariError` | エラーの基底インターフェース |
| `AkariErrorCode` (enum) | 全エラーコードの列挙体 |

### (1) Agent API — `agent.ts`

App 固有エージェントの登録・呼び出し・スポーンを担う。

| 型 | 説明 |
|---|---|
| `AgentId` | エージェント ID（`<app-short-id>_<role>` / ADR-011） |
| `ReferenceDefaultId` | Core 組み込み 6 エージェント（`partner` / `analyst` / `researcher` / `guardian` / `memoriist` / `operator`） |
| `AgentSpec` | `agent.register()` に渡す仕様（`persona`, `specFile`, `tools?`, `model?`, `maxTokens?`） |
| `AgentInvokeOptions` | `agent.invoke()` オプション（`context?`, `conversationId?`, `stream?`, `signal?`, `timeoutMs?`, `onEvent?`） |
| `SpawnContext` | `agent.spawn()` コンテキスト（`prompt`, `aceContext?`, `outputTarget?`, `onEvent?`） |
| `AgentInvokeResult` | 呼び出し結果（`text`, `conversationId`, `finishReason`, `usage`, `delegations?`） |
| `SpawnHandle` | spawn ハンドル（`executionId`, `result: Promise`, `abort()`） |
| `DelegationRecord` | サブエージェント委譲ログ |
| `AgentEvent` | イベント discriminated union（`on_start` / `on_progress` / `on_delegation` / `on_complete` / `on_error` / `on_abort`） |
| `HandoffPayload` | `agent.handoff()` ペイロード（Pool/AMP ID 参照のみ。生バイト禁止） |
| `HandoffResult` | Handoff 結果（`handoffId`, `handoffNote`, `ampRecordId`） |
| `PersonaSwitchOptions` | Partner エージェントのペルソナ切り替えオプション |
| `AmpWriteTarget` | spawn した Agent の出力先 AMP 指定 |

エラークラス: `AgentError`, `AgentNotFoundError`, `AgentTimeoutError`, `AgentAbortError`, `AgentPermissionError`, `AgentInvalidSpecError`, `AgentRuntimeError`, `AgentNameConflictError`

### (2) Memory API — `memory.ts`

Pool（コンテンツアドレス型バイナリ/テキストストア）と AMP（目標連携記憶レコード）へのアクセス型。

| 型 | 説明 |
|---|---|
| `ContentHash` | Blake3 256-bit ハッシュ（64 文字 hex）|
| `PoolPutInput` | `pool.put()` 入力（`bytes`, `mime`, `tags?`, `meta?`, `pinned?`） |
| `PoolItem` | `pool.get()` 結果（`id`, `bytes`, `mime`, `tags`, `meta`, `tier`, `sizeBytes`, `createdAt`, `lastAccessed`, `pinned`） |
| `PoolTier` | `"hot"` / `"warm"` / `"cold"` |
| `PoolSearchQuery` | `pool.search()` クエリ（`q?`, `mime?`, `tags?`, `tiers?`, `limit?`, `after?`, `before?`） |
| `PoolSearchResult` | 検索結果 1 件（bytes を除く + `score: number`） |
| `AmpKind` | AMP レコード種別（`goal`, `plan`, `decision`, `error`, `working` 等、カスタム種別可） |
| `AmpRecordInput` | `amp.record()` 入力（`kind`, `content`, `goal_ref` **必須**, `confidence?`, `pool_refs?`, `tags?`） |
| `AmpRecord` | 保存済み AMP レコード（`id: UUID v7`, `provenance`, `status: "active"/"consolidated"/"archived"`) |
| `AmpQueryInput` | `amp.query()` クエリ |
| `AmpQueryResult` | クエリ結果（`records`, `totalCount`, `durationMs`） |
| `ScoredAmpRecord` | スコア付き AMP レコード（`relevance: [0.0, 1.0]`） |
| `PoolProviderInfo` / `AmpProviderInfo` | バックエンド情報 |

エラー: `MemoryError`, `MemoryErrorCode` (enum, AMP spec §14 準拠)

### (3) Context API — `context.ts`

ACE (Agent Context Engine) でコンテキストを組み立てる型。

| 型 | 説明 |
|---|---|
| `ContextItemKind` | コンテキスト項目の種別 |
| `ContextItemSource` | 項目のソース（Pool / AMP / 直接入力） |
| `ContextItem` / `PackedContextItem` | コンテキスト項目 |
| `AceContext` | `ace.build()` の出力。エージェント呼び出しに渡す |
| `SelectOptions` | Pool/AMP からのコンテキスト選択オプション |
| `LintSeverity` / `LintIssue` | `ace.lint()` 結果 |

### (4) UI API — `ui.ts`

Shell への panel mount と HITL ダイアログ。

| 型 | 説明 |
|---|---|
| `PanelSlot` | Panel を mount するシェルスロット |
| `PanelMountOptions` | Full Tier panel の mount オプション |
| `SchemaPanelMountOptions` | MCP-Declarative panel の mount オプション（schema 指定） |
| `TextSelection` | Shell のテキスト選択イベント |
| `DialogOptions` / `DialogAction` / `DialogResult` | HITL ダイアログ |
| `ToastOptions` / `NotificationOptions` | トースト通知 |
| `HITLTemplate` / `HITLPreviewOptions` / `HITLPreviewResult` | HITL プレビュー |
| `ThemeInfo` | Shell テーマ情報 |
| `WorkspaceContext` | Shell ワークスペースのコンテキスト |
| `ShellAPI` | Shell API の完全インターフェース |

### (5) Inter-App API — `inter-app.ts`

App 間の handoff（Pool/AMP ID 参照による遷移）。

| 型 | 説明 |
|---|---|
| `HandoffRefs` | Pool/AMP ID の参照セット |
| `HandoffHints` | 受け取り App へのヒント（UI ヒント等） |
| `IncomingHandoff` | 受信した handoff の表現 |
| `HandoffResponse` | handoff 受け取り後の応答 |
| `HandoffHandler` | handoff を受け取るハンドラ型 |
| `AppAPI` | App API の完全インターフェース |
| `AppHandoffPayload` / `AppHandoffResult` | `agent.ts` の同名型との衝突を避けるエイリアス |

### (6) Permission API — `permission.ts`

権限ゲートと HITL。

| 型 | 説明 |
|---|---|
| `PermissionScope` | 権限スコープ（`pool.read` / `pool.write` / `amp.read` / `amp.write` 等） |
| `PermissionGateOptions` | `permission.gate()` オプション |
| `PermissionStatus` | 権限の現在状態 |
| `PermissionAuditRecord` | 権限要求の監査ログ |
| `PermissionAPI` | Permission API の完全インターフェース |

エラー: `PermissionDeniedError`

### (7) Skill API — `skill.ts`

他 App への関数公開・呼び出し。

| 型 | 説明 |
|---|---|
| `SkillDef` | Skill の定義（`id`, `inputSchema: JSONSchema7`, `outputSchema: JSONSchema7`, `handler`） |
| `SkillContext` | Skill 実行コンテキスト（Pool/AMP クライアントを含む） |
| `SkillInvokeOptions` | `skill.call()` オプション |
| `SkillAPI` | Skill API の完全インターフェース |
| `SkillMemoryRecord` | Skill 実行の AMP 記録型 |

エラー: `SkillError`, `SkillNotFoundError`, `SkillUndeclaredImportError`, `SkillVersionMismatchError`, `SkillInputValidationError`, `SkillOutputValidationError`, `SkillTimeoutError`

### Panel Schema v0 — `panel-schema.ts`

MCP-Declarative Tier の宣言的 UI フォーマット。

| 型 | 説明 |
|---|---|
| `PanelSchema` | `panel.schema.json` のルート（`$schema`, `title?`, `layout`, `fields[]`, `actions[]`） |
| `PanelLayout` | `"form"` / `"tabs"` / `"split"` / `"dashboard"` / `"list"` |
| `WidgetType` | 40+ ウィジェット種別（text/select/pool-picker/rich-text-editor/table 等） |
| `Binding` | バインディング式文字列（`mcp.*`, `pool.*`, `amp.*`, `state.*`, `const.*`） |
| `SchemaField` | フィールド定義（`id`, `type`, `label?`, `bind?`, `required?`, `visible_when?`, `enabled_when?`） |
| `SchemaAction` | アクションボタン定義（`id`, `label`, `kind?`, `mcp?`, `handoff?`, `hitl?`, `on_success?`, `on_error?`） |
| `HITLConfig` | HITL ゲート設定（`require`, `preview?`, `preview_template?`） |
| `ActionFeedback` | アクション完了後フィードバック（`toast?`, `navigate?`） |
| `Widget` | Schema Renderer が生成するウィジェットインスタンス |

### App Manifest — `manifest.ts`

`akari.toml` の完全型。

| 型 | 説明 |
|---|---|
| `AppSection` | `[app]` セクション（`id`, `name`, `version`, `tier`, `sdk` 等） |
| `AppTier` | `"full"` / `"mcp-declarative"` |
| `PermissionsSection` | `[permissions]` セクション（`pool?`, `amp?`, `external-network?`, `oauth?`, `mcp?`, `inter-app?`, `filesystem?`） |
| `McpSection` | `[mcp]` セクション（MCP-Declarative 専用）|
| `PanelsSection` / `PanelDeclaration` | `[panels]` セクション |
| `AgentsSection` | `[agents]` セクション（Full Tier 専用）|
| `SkillsSection` | `[skills]` セクション（`exposed?`, `imported?`）|
| `Manifest` | 全セクションをまとめた完全型 |

---

## 設計上の制約

- 本パッケージは**型定義のみ**を含む。`import type` で使うことが前提。
- `HandoffPayload` という名称が `agent.ts`（Agent handoff）と `inter-app.ts`（App handoff）で二重定義されている。`index.ts` では Inter-App 側を `AppHandoffPayload` として re-export し、名称衝突を解消している。
- AMP レコードには `goal_ref` が**必須**。欠落すると `MemoryErrorCode.GoalRefRequired` が返る。
- エージェント ID は ADR-011 の命名規則（`<app-short-id>_<role>` / snake_case）に準拠しなければならない。Core 組み込みエージェント ID（`partner` 等 6 種）との衝突は `AgentNameConflictError` で検出される。

---

## 参照

- 実装: `packages/sdk-types/src/`
- 関連 spec: AKARI-HUB-024 (App Contract / 7 API), AKARI-HUB-002 (Memory Layer)
- AMP プロトコル原典: [amp/spec/v0.1/protocol.md](https://github.com/Akari-OS/amp/blob/main/spec/v0.1/protocol.md)
