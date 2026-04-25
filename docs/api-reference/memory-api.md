---
title: Memory API リファレンス
spec-ref: AKARI-HUB-024 §5.2 (§6.6-2)
updated: 2026-04-22
related: [HUB-024]
---

# Memory API リファレンス / Memory API Reference

> **Pool（素材倉庫）と AMP（Agent Memory Protocol）への統一インターフェース。**
> App は自前の DB を持たない。全データはこの API 経由で読み書きする。

---

## 1. Memory API 概要 / Overview

Memory API は `@akari/sdk` の `memory` 名前空間が提供する、2 種類の永続層への統一アクセス口。

```
App
  └─ memory.pool.*  ─→  Pool（素材倉庫）  ─→  Hot / Warm / Cold tier
  └─ memory.amp.*   ─→  AMP（記憶・判断ログ）
```

| サブ API | 対象 | 用途 |
|---|---|---|
| `memory.pool.*` | Pool / Knowledge Store | バイナリ素材・テキスト・メタデータの永続保存。Content-Addressed (blake3) で管理 |
| `memory.amp.*` | AMP / Agent Memory Protocol | エージェントの意思決定・行動結果・目標に紐づいた記憶の記録と検索 |

**設計の核**:

- App は **自前 DB を持たない**（Guidelines §2、HUB-024 §6.7-2）
- すべての状態は必ず Pool か AMP に書く
- AMP の全 record に `goal_ref` を付ける（記憶はゴールに紐づけないと意味がない）
- Pool は Content-Addressed — `blake3` ハッシュが不変 ID。backend が変わっても ID は同じ（Tiered Storage (internal spec)）

**インポート**:

```typescript
import { memory } from "@akari/sdk"
// または分割インポート
import { pool, amp } from "@akari/sdk"
```

---

## 2. Pool 操作 / Pool Operations

Pool は **再利用可能な素材倉庫**（Memory Layer (internal spec) §6.1）。バイナリ・テキスト・メタデータを格納する。
Tiered Storage (internal spec) で定義された Hot/Warm/Cold の Tiered Storage 上に実装されており、App からは透過的に見える。

### 2.1 `memory.pool.put(item)` — 素材を保存する

```typescript
const id = await memory.pool.put(item: PoolPutInput): Promise<ContentHash>
```

**引数**:

```typescript
interface PoolPutInput {
  /** 素材本体 */
  bytes: Uint8Array | string
  /** MIME タイプ */
  mime: string
  /** タグ（検索・整理用） */
  tags?: string[]
  /** 任意のメタデータ */
  meta?: Record<string, unknown>
  /** ピン留め（tier 降格対象外にする） */
  pinned?: boolean
}
```

**戻り値**: `ContentHash`（blake3 ハッシュ、16 進数文字列）

**動作**:

- Core が blake3 でハッシュを計算し、`ContentHash` を返す
- 同一内容を二重 put しても同じ ID が返る（冪等）
- tier ポリシーに従い Hot/Warm/Cold のどこかに格納される（App は意識しない）

**例**:

```typescript
// テキスト下書きを保存
const draftId = await memory.pool.put({
  bytes: "# 下書きタイトル\n\nコンテンツ...",
  mime: "text/markdown",
  tags: ["draft", "article"],
})

// 画像ファイルを保存
const imageId = await memory.pool.put({
  bytes: imageBuffer,
  mime: "image/png",
  tags: ["screenshot", "reference"],
  pinned: true, // Hot tier に固定
})
```

---

### 2.2 `memory.pool.get(id)` — 素材を取得する

```typescript
const item = await memory.pool.get(id: ContentHash): Promise<PoolItem>
```

**戻り値**:

```typescript
interface PoolItem {
  id: ContentHash
  bytes: Uint8Array
  mime: string
  tags: string[]
  meta: Record<string, unknown>
  tier: "hot" | "warm" | "cold"
  sizeBytes: number
  createdAt: string   // ISO 8601
  lastAccessed: string
  pinned: boolean
}
```

**動作**:

- Hot tier にあれば即座に返る
- Cold tier にある場合は自動 rehydration が走る（後述 §5 参照）
- 見つからない場合は `PoolItemNotFound` エラー

**例**:

```typescript
const item = await memory.pool.get(draftId)
const text = new TextDecoder().decode(item.bytes)
```

---

### 2.3 `memory.pool.search(query)` — 素材を検索する

```typescript
const results = await memory.pool.search(query: PoolSearchQuery): Promise<PoolSearchResult[]>
```

**引数**:

```typescript
interface PoolSearchQuery {
  /** セマンティック検索クエリ（自然言語） */
  q?: string
  /** MIME タイプでフィルタ */
  mime?: string[]
  /** タグでフィルタ（AND 条件） */
  tags?: string[]
  /** tier でフィルタ */
  tiers?: ("hot" | "warm" | "cold")[]
  /** 最大件数（デフォルト 20） */
  limit?: number
  /** 時間範囲フィルタ */
  after?: string   // ISO 8601
  before?: string
}
```

**戻り値**:

```typescript
interface PoolSearchResult {
  id: ContentHash
  mime: string
  tags: string[]
  meta: Record<string, unknown>
  tier: "hot" | "warm" | "cold"
  sizeBytes: number
  /** セマンティック類似度スコア (0.0–1.0) */
  score: number
  createdAt: string
}
```

**注意**: `bytes` は含まれない（ID を取得後 `get()` で素材を引く設計）

**例**:

```typescript
// 先週の Markdown 下書きを検索
const drafts = await memory.pool.search({
  q: "記事の下書き",
  mime: ["text/markdown"],
  tags: ["draft"],
  limit: 10,
  after: "2026-04-12T00:00:00Z",
})

for (const result of drafts) {
  console.log(result.id, result.score)
}
```

---

### 2.4 `memory.pool.delete(id)` — 素材を削除する

```typescript
await memory.pool.delete(id: ContentHash): Promise<void>
```

**動作**:

- Hot / Warm / Cold 全 tier から削除
- `pinned: true` のアイテムは削除前に Core が確認プロンプトを出す
- 削除は永続的（AMP に自動で削除ログが残る）

**例**:

```typescript
await memory.pool.delete(draftId)
```

---

### 2.5 Content-Addressed ID (blake3) の規約

Pool のすべての素材は **blake3 ハッシュ**を ID として持つ（Tiered Storage (internal spec) §6.2）。

- **不変性**: 同一 bytes なら常に同じ ID → backend が変わっても ID は不変
- **衝突耐性**: blake3（256-bit）の実質的な衝突確率はゼロ
- **重複除去**: 同一内容を 2 回 put しても ID は 1 つ（冪等）

```typescript
// ContentHash は 64 文字の 16 進数文字列
type ContentHash = string
// 例: "d04b98f48e8f8bcc15c6ae5ac050801cd6dcfd428fb5f9e65c4e16e7807340fa"
```

---

### 2.6 Tiered Storage (Hot/Warm/Cold) の透過性

Pool は内部で 3 層の Tiered Storage を持つが、**App から見ると透過的**。

| Tier | 物理的な場所 | 特徴 |
|---|---|---|
| **Hot** | ローカル SSD | 直近ワーク + M2C 特徴量 + プロキシ常駐。アクセスは μs 単位 |
| **Warm** | 外部 SSD / NAS | 数ヶ月以内の再利用候補。秒単位アクセス |
| **Cold** | クラウド（Google Drive / akari-cloud / S3 等） | アーカイブ原本。rehydration が必要（§5 参照） |

```typescript
// tier の確認（情報として参照するのみ。App が tier を直接変更しない）
const item = await memory.pool.get(id)
console.log(item.tier) // "hot" | "warm" | "cold"
```

---

## 3. AMP 操作 / AMP Operations

AMP（Agent Memory Protocol）は、エージェントの**意思決定・行動結果・ゴール進捗**を記録する記憶層。
HUB-024 §6.6-2 および AMP spec v0.1 に基づく。

### 3.1 `memory.amp.record(input)` — 記憶を記録する

```typescript
const record = await memory.amp.record(input: AmpRecordInput): Promise<AmpRecord>
```

**引数**:

```typescript
interface AmpRecordInput {
  /**
   * 記憶の種類（§3.4 参照）
   * AMP spec の type に対応: episodic / semantic / procedural / working
   */
  kind: AmpKind

  /** 記憶の内容（自然言語） */
  content: string

  /**
   * ゴール参照（必須）
   * App ID または ADR-011 で定義された ref 形式（§4 参照）
   */
  goal_ref: string

  /**
   * 信頼スコア (0.0–1.0)
   * AMP spec §5.1 の初期 confidence に相当
   * 省略時は kind に応じたデフォルト値が使われる
   */
  confidence?: number

  /** Pool アイテムへの参照（バイナリ素材と紐づける場合） */
  pool_refs?: ContentHash[]

  /** タグ */
  tags?: string[]

  /** 追加メタデータ */
  meta?: Record<string, unknown>
}
```

**戻り値**:

```typescript
interface AmpRecord {
  /** UUID v7（時刻順ソート可能） */
  id: string
  kind: AmpKind
  content: string
  goal_ref: string
  confidence: number
  /** Provenance（AMP spec §4.2 準拠） */
  provenance: {
    agent: { id: string; name: string; platform: string }
    source: { kind: string; confidence: number }
    sessionId?: string
  }
  pool_refs: ContentHash[]
  tags: string[]
  createdAt: string   // ISO 8601
  updatedAt: string
  status: "active" | "consolidated" | "archived"
}
```

**例**:

```typescript
// Writer: 下書きを保存した際の行動を記録
await memory.amp.record({
  kind: "publish-action",
  content: "下書き「AI と創作の未来」を Pool に保存した",
  goal_ref: "com.akari.writer",
  confidence: 0.95,
  pool_refs: [draftId],
  tags: ["draft-saved"],
})

// Research: 収集した知見を記録
await memory.amp.record({
  kind: "research-result",
  content: "2026年のAI OS市場でAKARIは差別化できる3つのポイントが確認された",
  goal_ref: "research-session-2026-04-19",
  confidence: 0.8,
})
```

---

### 3.2 `memory.amp.query(query)` — 記憶を検索する

```typescript
const results = await memory.amp.query(query: AmpQueryInput): Promise<AmpQueryResult>
```

**引数**:

```typescript
interface AmpQueryInput {
  /** 種類でフィルタ */
  kind?: AmpKind | AmpKind[]

  /** ゴール参照でフィルタ */
  goal_ref?: string

  /** セマンティック検索クエリ */
  q?: string

  /** タグでフィルタ */
  tags?: string[]

  /** 信頼スコアの下限（デフォルト 0.3） */
  minConfidence?: number

  /** 時間範囲フィルタ */
  after?: string    // ISO 8601
  before?: string

  /** 最大件数（デフォルト 10） */
  limit?: number
}
```

**戻り値**:

```typescript
interface AmpQueryResult {
  /** 関連度スコア付きの記憶一覧 */
  records: ScoredAmpRecord[]
  /** 総件数（limit 以上の場合がある） */
  totalCount: number
  /** 実行時間 (ms) */
  durationMs: number
}

interface ScoredAmpRecord {
  record: AmpRecord
  /** クエリとの関連度 (0.0–1.0) */
  relevance: number
}
```

**例**:

```typescript
// Writer App の直近の行動を取得
const history = await memory.amp.query({
  goal_ref: "com.akari.writer",
  kind: ["publish-action", "plan"],
  limit: 20,
})

// 投稿結果の記録を検索
const publishResults = await memory.amp.query({
  kind: "publish-action",
  q: "X投稿 成功",
  minConfidence: 0.7,
})
```

---

### 3.3 Provenance / Confidence スコアリング

AMP の各 record は AMP spec v0.1 §5 に従い、**信頼スコアと出所情報**を持つ。

**初期 confidence の基準**（AMP spec §5.1）:

| 情報源 | 基準値 | 理由 |
|---|---|---|
| `user_statement` | 0.9 | ユーザーが直接述べた |
| `observation` | 0.8 | エージェントが直接観測 |
| `tool_result` | 0.7 | ツールの返却値（エラーの可能性あり） |
| `inference` | 0.5 | エージェントの推論（不確実） |

App が `memory.amp.record()` で記録する際は、`confidence` を省略すると `kind` に応じたデフォルト値が使われる。
高確信度の情報（ユーザーの明示的な操作結果など）は `confidence: 0.9` を明示推奨。

**Decay**（時間経過による信頼低下）は Core が自動管理する。種類別のデフォルト半減期:

| AmpKind（AMP type） | 半減期 |
|---|---|
| `working` | セッション終了時に即時 decay |
| `goal` / `plan` (episodic) | ~30 日 |
| `publish-action` (semantic) | ~90 日 |
| `research-result` (semantic) | ~90 日 |

---

### 3.4 kind 一覧 / AmpKind Reference

`kind` は記憶の性質を示すカテゴリ。AMP spec の `type`（episodic / semantic / procedural / working）に対応する。

| kind | AMP type | 用途 | 典型 App |
|---|---|---|---|
| `goal` | episodic | ゴール・意図の記録 | 全 App |
| `plan` | episodic | 実行計画のステップ記録 | Writer / Video |
| `publish-action` | semantic | 外部への投稿・公開アクション | X Sender / SNS 系 |
| `research-result` | semantic | 収集・調査結果の知見 | Research / Analyst |
| `decision` | episodic | 意思決定の記録 | 全 App |
| `style-preference` | semantic | ユーザーのスタイル・好みの学習 | Writer / Video |
| `error` | episodic | エラー・失敗の記録 | 全 App |
| `working` | working | セッション内の一時的な作業状態 | 全 App |

**カスタム kind**: `App ID + ドット + 名前` の形式で独自 kind を定義できる。

```typescript
// カスタム kind の例
kind: "com.myorg.myapp.custom-event"
```

---

## 4. goal_ref 規約 / goal_ref Convention

AMP の全 record に `goal_ref` を付けることは**必須**（HUB-024 §6.6-2 / ADR-011 準拠）。
記憶はゴールに紐づけて初めて検索・追跡の意味を持つ。

### 4.1 App ID を ref として使う

**最も一般的な用途**: App の動作ログを記録する場合、`goal_ref` に App ID を使う。

```typescript
// App Manifest (akari.toml) の [app].id を使う
goal_ref: "com.akari.writer"
goal_ref: "com.x.sender"
goal_ref: "com.myorg.myapp"
```

### 4.2 セッション・タスク単位の ref

特定のセッションやタスクに紐づける場合:

```typescript
// セッション ID 形式（ワークスペース命名規則）
goal_ref: "2026-04-19-article-writing"

// spec ID 形式（ADR-011）
goal_ref: "AKARI-HUB-024"
```

### 4.3 Inter-App handoff での goal_ref 継承

App 間 handoff（HUB-024 §6.6-5）では、AMP record の `goal_ref` を引き継ぐ。

```typescript
// Writer が Video に handoff するとき、goal_ref を渡す
await app.handoff({
  to: "com.akari.video",
  intent: "create-video-from-draft",
  payload: {
    draft_ref: ampRecordId,
    goal_ref: "com.akari.writer", // Video 側が同じ goal_ref で記録継続
  },
})
```

---

## 5. キャッシュ / オフライン / Cache & Offline

### 5.1 Cold 素材参照時の Rehydration

Cold tier にある素材を `pool.get()` すると自動 rehydration が走る（Tiered Storage (internal spec) §6.5）。

```
1. M2C メタ + サムネ（Hot 常駐）を即座に返す → ラグゼロで表示可
2. 低解像度プロキシで編集を開始できる
3. Core が裏で原本を Cold → Hot に非同期 fetch
4. 原本が必要なタイミング（最終レンダリング等）まで到着を待つ
```

App が `pool.get()` を呼ぶと、Cold 素材の場合は `tier: "cold"` かつ bytes が空の intermediate response が返ることがある。
完全な bytes が必要な場合は `waitForFull` オプションを使う:

```typescript
// 即座に返す（Cold の場合は bytes が空の可能性あり）
const item = await memory.pool.get(id)

// 完全な bytes を待つ（rehydration 完了までブロック）
const item = await memory.pool.get(id, { waitForFull: true })
```

### 5.2 オフライン書き込みキュー

ネットワーク不通時（External SSD 未接続 / Cloud 接続不可など）でも、**Hot tier への書き込みは常に成功する**。

- `pool.put()`: Hot tier に書き込み成功。後でネットワーク復旧時に Warm/Cold に自動昇格
- `amp.record()`: ローカル SQLite に書き込み成功。Cloud sync は復旧後に実行

```typescript
// オフライン時の挙動確認
const provider = await memory.pool.providerInfo()
console.log(provider.offlineOk)  // true（Hot tier は常に使用可）
```

AMP 操作もオフライン書き込みキューに入り、復旧後に自動 flush される。
オフライン時に `amp.record()` を呼んでも例外はスローされない。

---

## 6. プロバイダー選択 / Provider Selection

Memory API はプロバイダーを抽象化しており、ユーザーの設定に応じて backend が切り替わる（Tiered Storage (internal spec) §6.3）。

### Pool プロバイダー

| プロバイダー | 特徴 | 典型ユースケース |
|---|---|---|
| `local` | ローカル SSD のみ。デフォルト Hot | プライバシー重視、オフライン専用 |
| `akari-cloud` | Supabase Storage。Hot はローカル、Cold はクラウド | マルチデバイス sync |
| `google-drive` | Google Drive を Cold backend に使用 | 既存 Drive ユーザー |
| `lark-drive` | Lark Drive を Cold backend に使用 | 組織で Lark 運用中 |
| `s3` | AWS S3 / R2 / MinIO。Cold backend | 法人・NDA 素材 |

### AMP プロバイダー

| プロバイダー | 特徴 |
|---|---|
| `local` | SQLite + ベクトル検索。デフォルト。オフライン完全対応 |
| `akari-cloud` | クラウド同期。デバイス跨ぎで記憶共有 |

App はプロバイダーを直接指定しない。ユーザーが OS 設定で構成し、App には透過的に注入される。

```typescript
// プロバイダー情報の確認（情報取得のみ）
const poolInfo = await memory.pool.providerInfo()
// => { name: "local", locality: "local", offlineOk: true, ... }

const ampInfo = await memory.amp.providerInfo()
// => { name: "local", protocolVersion: "2026-04-01", strategies: [...] }
```

---

## 7. エラーハンドリング / Error Handling

Memory API のエラーは `MemoryError` クラスで統一される。AMP spec §14 の JSON-RPC エラーコードと対応。

```typescript
import { MemoryError, MemoryErrorCode } from "@akari/sdk"

try {
  const item = await memory.pool.get(id)
} catch (e) {
  if (e instanceof MemoryError) {
    switch (e.code) {
      case MemoryErrorCode.NotFound:
        // -34001: 素材が存在しない
        console.warn("素材が見つかりません:", id)
        break
      case MemoryErrorCode.TierUnavailable:
        // Cold backend がオフラインで rehydration できない
        console.warn("Cold tier 接続不可。プロキシ版を表示します")
        break
      case MemoryErrorCode.PermissionDenied:
        // -34002: 他 App の private 記憶にアクセス不可
        console.error("アクセス権限がありません")
        break
      case MemoryErrorCode.GoalRefRequired:
        // AMP 記録に goal_ref が未指定
        console.error("goal_ref は必須です")
        break
    }
  }
}
```

**エラーコード一覧**:

| コード | 定数 | 意味 |
|---|---|---|
| `-34001` | `NotFound` | Pool item または AMP record が存在しない |
| `-34002` | `PermissionDenied` | アクセス権限なし（他 App の private 記憶等） |
| `-34003` | `ConfidenceTooLow` | minConfidence 未満の記憶を直接取得しようとした |
| `-34004` | `StrategyUnavailable` | 要求した検索戦略が利用不可 |
| `-34005` | `Duplicate` | 同一内容の二重書き込みを検出 |
| `MEM-001` | `TierUnavailable` | Cold backend オフライン / 接続エラー |
| `MEM-002` | `GoalRefRequired` | `amp.record()` に `goal_ref` がない |
| `MEM-003` | `RehydrationTimeout` | Cold → Hot の rehydration がタイムアウト |

---

## 8. 型定義 / Type Definitions

```typescript
// Content-Addressed ID (blake3 ハッシュ)
type ContentHash = string

// AMP の記憶種別
type AmpKind =
  | "goal"
  | "plan"
  | "publish-action"
  | "research-result"
  | "decision"
  | "style-preference"
  | "error"
  | "working"
  | string  // カスタム kind: "com.org.app.event-name"

// Pool 操作
interface PoolPutInput {
  bytes: Uint8Array | string
  mime: string
  tags?: string[]
  meta?: Record<string, unknown>
  pinned?: boolean
}

interface PoolItem {
  id: ContentHash
  bytes: Uint8Array
  mime: string
  tags: string[]
  meta: Record<string, unknown>
  tier: "hot" | "warm" | "cold"
  sizeBytes: number
  createdAt: string
  lastAccessed: string
  pinned: boolean
}

interface PoolSearchQuery {
  q?: string
  mime?: string[]
  tags?: string[]
  tiers?: ("hot" | "warm" | "cold")[]
  limit?: number
  after?: string
  before?: string
}

interface PoolSearchResult {
  id: ContentHash
  mime: string
  tags: string[]
  meta: Record<string, unknown>
  tier: "hot" | "warm" | "cold"
  sizeBytes: number
  score: number
  createdAt: string
}

// AMP 操作
interface AmpRecordInput {
  kind: AmpKind
  content: string
  goal_ref: string
  confidence?: number
  pool_refs?: ContentHash[]
  tags?: string[]
  meta?: Record<string, unknown>
}

interface AmpRecord {
  id: string
  kind: AmpKind
  content: string
  goal_ref: string
  confidence: number
  provenance: {
    agent: { id: string; name: string; platform: string }
    source: { kind: string; confidence: number }
    sessionId?: string
    chain?: Array<{
      timestamp: string
      operation: string
      agent: { id: string; name: string }
      description?: string
    }>
  }
  pool_refs: ContentHash[]
  tags: string[]
  createdAt: string
  updatedAt: string
  status: "active" | "consolidated" | "archived"
}

interface AmpQueryInput {
  kind?: AmpKind | AmpKind[]
  goal_ref?: string
  q?: string
  tags?: string[]
  minConfidence?: number
  after?: string
  before?: string
  limit?: number
}

interface AmpQueryResult {
  records: Array<{
    record: AmpRecord
    relevance: number
  }>
  totalCount: number
  durationMs: number
}

// エラー
declare class MemoryError extends Error {
  code: MemoryErrorCode
  data?: Record<string, unknown>
}

declare enum MemoryErrorCode {
  NotFound = -34001,
  PermissionDenied = -34002,
  ConfidenceTooLow = -34003,
  StrategyUnavailable = -34004,
  Duplicate = -34005,
  TierUnavailable = "MEM-001",
  GoalRefRequired = "MEM-002",
  RehydrationTimeout = "MEM-003",
}
```

---

## 9. 使用例 / Examples

### 例 1: Writer — 下書きの保存と行動ログ記録

```typescript
import { memory, permission } from "@akari/sdk"

async function saveDraft(title: string, content: string) {
  // 権限確認（manifest に pool.write が必要）
  await permission.gate({
    action: "pool.write",
    reason: "下書きを記憶層に保存",
    hitl: false,
  })

  // Pool に下書きを保存
  const draftId = await memory.pool.put({
    bytes: `# ${title}\n\n${content}`,
    mime: "text/markdown",
    tags: ["draft", "article"],
  })

  // AMP に行動を記録
  await memory.amp.record({
    kind: "plan",
    content: `下書き「${title}」を作成・保存した`,
    goal_ref: "com.akari.writer",
    confidence: 0.95,
    pool_refs: [draftId],
    tags: ["draft-saved"],
  })

  return draftId
}
```

---

### 例 2: Publisher — 投稿結果の記録

```typescript
import { memory, permission } from "@akari/sdk"

async function recordPublishResult(
  platform: string,
  postUrl: string,
  poolRef: ContentHash,
  success: boolean,
) {
  // HITL: 外部投稿は人間確認を必要とする
  await permission.gate({
    action: "external-network.post",
    reason: `${platform} に投稿`,
    hitl: true,
  })

  // 投稿結果を AMP に記録
  const record = await memory.amp.record({
    kind: "publish-action",
    content: success
      ? `${platform} への投稿に成功: ${postUrl}`
      : `${platform} への投稿が失敗した`,
    goal_ref: "com.x.sender",
    confidence: success ? 0.95 : 0.9,
    pool_refs: [poolRef],
    tags: [platform, success ? "success" : "failure"],
    meta: { postUrl, platform, success },
  })

  return record.id
}
```

---

### 例 3: Research — 収集結果の保存と知見記録

```typescript
import { memory } from "@akari/sdk"

async function storeResearchFindings(
  sessionId: string,
  findings: string[],
  sourceUrls: string[],
) {
  const poolRefs: ContentHash[] = []

  // 各ソースを Pool に保存
  for (const url of sourceUrls) {
    const response = await fetch(url)
    const html = await response.text()
    const id = await memory.pool.put({
      bytes: html,
      mime: "text/html",
      tags: ["research-source", "raw"],
      meta: { sourceUrl: url },
    })
    poolRefs.push(id)
  }

  // 知見の要約を AMP に記録
  const summary = findings.join("\n- ")
  await memory.amp.record({
    kind: "research-result",
    content: `リサーチセッション ${sessionId} の知見:\n- ${summary}`,
    goal_ref: sessionId,
    confidence: 0.75,  // リサーチ結果は推論を含むため中程度
    pool_refs: poolRefs,
    tags: ["research", "findings"],
  })

  // 後続の Context API での利用に備えて検索可能に
  const related = await memory.amp.query({
    kind: "research-result",
    goal_ref: sessionId,
    q: findings[0],
    limit: 5,
  })

  return { poolRefs, relatedCount: related.totalCount }
}
```

---

### 例 4: App 間引き継ぎ — Writer から Video へ

```typescript
import { memory, app } from "@akari/sdk"

// Writer App: 下書きと関連素材を Video に渡す
async function handoffToVideo(draftId: ContentHash, assetIds: ContentHash[]) {
  // AMP に handoff の意図を記録
  const intentRecord = await memory.amp.record({
    kind: "plan",
    content: "下書き記事をもとに動画コンテンツを作成する",
    goal_ref: "com.akari.writer",
    confidence: 0.9,
    pool_refs: [draftId, ...assetIds],
  })

  // Pool / AMP の ID のみを渡す（bytes は渡さない）
  await app.handoff({
    to: "com.akari.video",
    intent: "create-video-from-draft",
    payload: {
      draft_ref: draftId,
      assets: assetIds,
      amp_context: intentRecord.id,  // Video が context を引き継げる
      goal_ref: "com.akari.writer",  // goal_ref を継承
    },
  })
}
```

---

## 10. ベストプラクティス / Best Practices

### 何を Pool に置き、何を AMP に置くか

| データの種類 | 置き場所 | 理由 |
|---|---|---|
| テキスト原稿・下書き | Pool | バイナリ素材として原本保全。Content-Addressed で重複排除 |
| 画像・動画・音声 | Pool | M2C が特徴量を抽出するため原本が必要 |
| 外部 URL・ウェブページ | Pool | raw HTML / PDF を保存して後でコンテキスト化 |
| 意思決定ログ | AMP (`decision`) | ゴールに紐づけた判断の追跡。decay / reinforce で鮮度管理 |
| 投稿・公開のアクション | AMP (`publish-action`) | 監査ログ。AMP spec のライフサイクルで確認・強化 |
| ユーザーの好み・スタイル | AMP (`style-preference`) | エージェントが次回セッションで参照する長期記憶 |
| セッション内の一時状態 | AMP (`working`) | セッション終了時に自動 decay。永続化が要らない場合に使う |
| 実行計画のステップ | AMP (`plan`) | 途中中断・再開を可能にする。goal_ref で追跡 |

### 重要な原則

1. **`goal_ref` は省略しない** — AMP の記憶はゴールに紐づかないと検索・追跡の意味を失う
2. **Pool に bytes、AMP に意味** — 素材は Pool、その素材が「なぜ・いつ・どう使われたか」は AMP
3. **Inter-App は ID のみ渡す** — `app.handoff()` に bytes を直接渡さない（Pool の ID を渡す）
4. **小さく記録して reinforce する** — 大きな 1 件より、小さな複数件 + reinforce のほうが AMP の decay に強い
5. **Cold tier を意識しない** — Tier 管理は Core の責任。App は `pool.get()` を呼ぶだけ
6. **オフライン時も書く** — `pool.put()` / `amp.record()` はオフラインでも成功する。後で同期される

---

## 11. 関連ドキュメント / See Also

| ドキュメント | 内容 |
|---|---|
| [Context API](./context-api.md) | `ace.build()` で Pool / AMP の収集結果をコンテキストに変換する |
| [Permission API](./permission-api.md) | `pool.write` / `amp.write` の権限ゲートと HITL 設定 |
| [Inter-App API](./inter-app-api.md) | `app.handoff()` で Pool / AMP の ID を App 間で受け渡す |
| **仕様書** | |
| [HUB-024 §6.6-2](https://github.com/Akari-OS/.github/blob/main/VISION.md) | Memory API の App SDK 上の位置づけと原則 |
| Memory Layer (internal spec) | Pool / Work / Session の 3 サブレイヤー構造 |
| Tiered Storage (internal spec) | Hot/Warm/Cold Tiered Storage と Backend Adapter |
| Pool MVP (internal spec) | Pool MVP — MCP ツール（`pool_search` / `pool_cat` 等）の実装基盤 |
| [AMP spec v0.1](https://github.com/Akari-OS/amp/blob/main/spec/v0.1/protocol.md) | AMP プロトコルの原典。MemoryRecord スキーマ・lifecycle・provenance の詳細 |
