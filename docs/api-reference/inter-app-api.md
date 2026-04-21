---
title: Inter-App API リファレンス
spec-ref: AKARI-HUB-024 §6.6(5)
updated: 2026-04-19
related: [HUB-024, HUB-005, memory-api.md, permission-api.md]
---

# Inter-App API リファレンス

> **App 間で "id を渡す"**。直接オブジェクトは渡さない。
> Writer → Publishing、Research → Documents、Video → Documents — どの組み合わせも、
> この 1 本の API と記憶層（Pool / AMP）だけで繋がる。

---

## 1. 概要

Inter-App API は、AKARI App 間の **handoff（受け渡し）** を実現する API。
`@akari/sdk` の `app` オブジェクトを通じて利用する。

### "id を渡す" 原則

**App 同士は直接通信しない。Pool / AMP の ID のみを渡す。**

```
          ❌ 禁止
  Writer ──────────────────→ X Sender
          bytes を直接渡す

          ✅ 正しい
  Writer → Pool.put(bytes) → Pool ID ─→ X Sender
              AMP.record()   → AMP ID ─→ X Sender
                                │
                           handoff で
                           ID だけ渡す
```

この原則には 3 つの理由がある：

1. **トレーサビリティ**: 全 handoff は AMP に自動記録される。誰が何をいつ渡したか、後から辿れる
2. **バウンダリ保護**: bytes を直接受け渡すと App 間に隠れた結合が生まれる。ID 渡しにより結合を断ち切る
3. **一貫した記憶層**: データの実体は常に Pool / AMP にある。App 本体は state を持たない

---

## 2. `app.handoff(targetId, payload)`

送り側 App が呼ぶメインの関数。

### シグネチャ

```typescript
import { app } from "@akari/sdk"

await app.handoff(targetId: string, payload: HandoffPayload): Promise<HandoffResult>
```

### 引数

| 引数 | 型 | 説明 |
|---|---|---|
| `targetId` | `string` | 受け取り先 App の ID（例: `"com.akari.x-sender"`）または category セレクタ（§6 参照） |
| `payload` | `HandoffPayload` | handoff のコンテキスト。`kind` / `ref` / `hints` の形式（§3 参照） |

### 戻り値（`HandoffResult`）

```typescript
interface HandoffResult {
  status: "accepted" | "rejected" | "pending" | "not-installed"
  handoffId: string       // AMP に記録された handoff の ID
  reason?: string         // rejected の場合の理由
}
```

### 最小例

```typescript
import { app } from "@akari/sdk"

// Writer → X Sender へ下書きを渡す
const result = await app.handoff("com.akari.x-sender", {
  kind: "publish-draft",
  ref: {
    draft: ampRecordId,        // AMP の下書き record ID
    assets: [poolItemId],      // Pool の添付 ID
  },
  hints: {
    intent: "post-to-x",
  },
})

if (result.status === "accepted") {
  console.log("handoff 成功:", result.handoffId)
}
```

---

## 3. Payload 規約

`HandoffPayload` は `{ kind, ref, hints }` の 3 フィールドで構成する。

```typescript
interface HandoffPayload {
  kind: string          // handoff の目的を表す識別子（"publish-draft" 等）
  ref: HandoffRefs      // Pool / AMP の ID を格納するオブジェクト
  hints?: HandoffHints  // 受け側へのヒント（オプション）
}

interface HandoffRefs {
  // Pool の ID
  poolIds?: string[]          // 汎用 Pool アイテム
  assets?: string[]           // 添付ファイル・画像・動画
  draft?: string              // 下書き Pool/AMP アイテム ID

  // AMP の ID
  ampRecordId?: string        // 特定の AMP record
  goalRef?: string            // ゴール ID（全 AMP record に付く goal_ref）

  // 拡張フィールド（App 独自の ID を追加可能）
  [key: string]: string | string[] | undefined
}

interface HandoffHints {
  intent?: string             // 受け側が解釈するアクション名
  targetOutlet?: string       // 出力先（"x" / "notion" / "google-docs" 等）
  format?: string             // コンテンツ形式（"markdown" / "plain-text" 等）
  [key: string]: unknown      // App 固有のヒント
}
```

### 制約

- `ref` に含めるのは **Pool / AMP の ID のみ**。bytes・オブジェクトの直接埋め込みは禁止
- `kind` は snake_case または kebab-case で命名する
- `hints` は受け側 App が無視しても動作するよう、あくまで「ヒント」として設計すること

### kind 一覧（公式 App が使う標準 kind）

| kind | 送り元の典型例 | 受け側の典型例 |
|---|---|---|
| `publish-draft` | Writer | Publishing カテゴリ App |
| `export-to-doc` | Writer / Research | Documents カテゴリ App |
| `insert-to-slide` | Video / Writer | Documents（PPT / Slides） |
| `append-to-sheet` | Research / Analytics | Documents（Sheets / Excel） |
| `asset-ready` | Asset Generation | Pool Browser / Writer |
| `translation-ready` | Translation | Writer |

---

## 4. 受け側の処理

受け取り側 App は `app.onHandoff(handler)` でハンドラを登録する。

### シグネチャ

```typescript
import { app } from "@akari/sdk"

app.onHandoff(handler: HandoffHandler): void

type HandoffHandler = (
  handoff: IncomingHandoff
) => Promise<HandoffResponse>

interface IncomingHandoff {
  handoffId: string           // AMP に記録された handoff の ID
  from: string                // 送り元 App ID
  payload: HandoffPayload     // 送り元が渡した payload
  timestamp: string           // ISO 8601
}

interface HandoffResponse {
  accept: boolean             // true = 受理、false = 却下
  reason?: string             // 却下理由（ユーザーへの表示に使われる）
}
```

### 実装例（Publishing App 側）

```typescript
import { app, amp, pool } from "@akari/sdk"

app.onHandoff(async (handoff) => {
  // kind チェック：自分が処理できる handoff のみ受け入れる
  if (handoff.payload.kind !== "publish-draft") {
    return { accept: false, reason: "未対応の kind: " + handoff.payload.kind }
  }

  const { ref } = handoff.payload

  // AMP から下書きを fetch
  if (ref.draft) {
    const draftRecord = await amp.get(ref.draft)
    if (!draftRecord) {
      return { accept: false, reason: "下書き record が見つかりません" }
    }

    // Panel に表示するためにローカル state にセット
    // （この state も AMP に書くことを推奨）
    await amp.record({
      kind: "handoff-received",
      content: `${handoff.from} から handoff を受け取り`,
      goal_ref: draftRecord.goal_ref,
    })
  }

  // Pool から添付ファイルを fetch
  const assetIds = ref.assets ?? []
  const assets = await Promise.all(assetIds.map((id) => pool.get(id)))

  // 受理してパネルを開く（UI 側の処理に委ねる）
  return { accept: true }
})
```

### 受理 / 却下の規則

| 状況 | 推奨レスポンス |
|---|---|
| 正常に処理できる | `{ accept: true }` |
| kind が未対応 | `{ accept: false, reason: "未対応の kind: ..." }` |
| ref の ID が見つからない | `{ accept: false, reason: "リソースが見つかりません" }` |
| 権限が不足 | `{ accept: false, reason: "権限がありません: ..." }` |
| ユーザーがキャンセル | `{ accept: false, reason: "ユーザーがキャンセルしました" }` |

---

## 5. cross-over 典型例

### Writer → Publishing（SNS 投稿）

最もよく使われるパターン。Writer が書いた下書きを X / Threads / Bluesky 等に渡す。

```typescript
// Writer 側（送り元）
import { pool, amp, app, permission } from "@akari/sdk"

async function handoffToPublishing(content: string, targetApp: string) {
  // 1. 下書きを Pool に保存
  const draftPoolId = await pool.put({
    bytes: Buffer.from(content),
    mime: "text/markdown",
    tags: ["draft", "writer"],
  })

  // 2. AMP に記録
  const ampRecordId = await amp.record({
    kind: "draft-ready",
    content: "下書き完成、Publishing に渡す",
    goal_ref: "writer-session-001",
  })

  // 3. HITL 承認取得（外部送信なので必須）
  await permission.gate({
    action: "external-network.post",
    reason: "X に投稿します",
    hitl: true,
  })

  // 4. handoff（ID のみ渡す）
  const result = await app.handoff(targetApp, {
    kind: "publish-draft",
    ref: {
      draft: draftPoolId,
      ampRecordId,
    },
    hints: {
      intent: "post-to-x",
      format: "plain-text",
    },
  })

  return result
}

// 呼び出し
await handoffToPublishing(editorContent, "com.akari.x-sender")

```

### Research → Documents（調査結果を Sheets に流し込み）

Research App が収集した情報を Google Sheets や Excel に出力する。

```typescript
// Research App 側（送り元）
import { amp, app } from "@akari/sdk"

async function exportToSheets(searchResults: SearchResult[]) {
  // 調査結果を AMP に記録
  const recordIds = await Promise.all(
    searchResults.map((r) =>
      amp.record({
        kind: "research-result",
        content: JSON.stringify(r),
        goal_ref: "research-session-042",
      })
    )
  )

  // Documents（Sheets）に handoff
  await app.handoff("com.akari.gsuite", {
    kind: "append-to-sheet",
    ref: {
      ampRecordId: recordIds[0],          // 先頭 record を代表 ref に
      poolIds: recordIds,                  // 全 record の ID
    },
    hints: {
      targetOutlet: "google-sheets",
      intent: "research-summary",
    },
  })
}
```

### Video → Documents（章構成を PPT/Slides に変換）

動画の章立てや静止画を登壇資料に変換する（HUB-005 §7.1b 典型クロスオーバー）。

```typescript
// Video App 側（送り元）
import { pool, amp, app } from "@akari/sdk"

async function exportToPresentationSlides(
  chapterOutline: Chapter[],
  thumbnailIds: string[]   // Pool に保存済みの静止画 ID
) {
  // 章構成を AMP に記録
  const outlineRecordId = await amp.record({
    kind: "video-outline",
    content: JSON.stringify(chapterOutline),
    goal_ref: "video-project-007",
  })

  // Documents（PPT / Slides）に handoff
  await app.handoff("com.akari.m365", {
    kind: "insert-to-slide",
    ref: {
      ampRecordId: outlineRecordId,
      assets: thumbnailIds,             // Pool の静止画 ID 群
    },
    hints: {
      targetOutlet: "powerpoint",
      intent: "presentation-auto-generate",
      format: "slide-per-chapter",
    },
  })
}
```

---

## 6. Target App の解決

`targetId` には 2 種類の指定方法がある。

### 直接指定（App ID）

```typescript
// 特定の App を指定
await app.handoff("com.akari.x-sender", payload)
await app.handoff("com.akari.notion", payload)
await app.handoff("com.third-party.my-app", payload)
```

### Category セレクタ

インストールされた App の category をもとに Core が解決する。

```typescript
// "publishing" カテゴリの App を選ばせる
await app.handoff("category:publishing", payload)

// "documents" カテゴリの中で targetOutlet に最も近い App
await app.handoff("category:documents", {
  kind: "export-to-doc",
  ref: { draft: draftId },
  hints: { targetOutlet: "google-docs" },
})
```

**Category セレクタの解決ルール**:

1. `hints.targetOutlet` に一致する App がある → その App を選択
2. 候補が複数ある → Shell がユーザーに選択プロンプトを表示
3. 候補が 0（未インストール） → `HandoffResult.status = "not-installed"` を返す

### App が未インストールの場合のフォールバック

```typescript
const result = await app.handoff("com.akari.notion", payload)

if (result.status === "not-installed") {
  // フォールバック: clipboard に出力する等
  await fallbackToClipboard(payload)

  // または: ユーザーにインストールを提案
  shell.notify({
    message: "Notion App がインストールされていません",
    action: { label: "インストール", appId: "com.akari.notion" },
  })
}
```

---

## 7. 実行時の可視性

**すべての handoff は AMP に自動記録される。**

App が `app.handoff()` を呼ぶと、Core は以下を AMP に書き込む：

```typescript
// Core が自動で記録する（App 側の実装不要）
{
  kind: "handoff",
  from: "com.akari.writer",
  to: "com.akari.x-sender",
  handoffId: "hnd_01JQXYZ...",
  payloadKind: "publish-draft",
  refs: {
    draft: "pool_01JABC...",
    assets: ["pool_01JDEF..."],
  },
  status: "accepted",
  timestamp: "2026-04-19T12:34:56Z",
  goal_ref: "writer-session-001",   // payload の ref.goalRef から引き継ぎ
}
```

この記録により：

- **ユーザー**: Memory Viewer / Analyst で「Writer からいつ何を X に渡したか」を確認できる
- **開発者**: handoff の失敗・遅延を AMP クエリで診断できる
- **監査**: 外部送信前に誰が承認したかの証跡が残る

---

## 8. 認証 / 権限 — Permission API との連携

handoff は **Permission API と組み合わせて使う**。外部サービスへの送信（`external-network.post`）は HITL ゲートが必須。

### manifest での宣言

```toml
# akari.toml
[permissions]
external-network = ["api.x.com"]
amp = ["read", "write"]
pool = ["read", "write"]
```

宣言した権限しか `permission.gate()` で要求できない。未宣言の権限を要求した場合、Core は即座に拒否する。

### HITL Gate の挿入

```typescript
import { permission, app } from "@akari/sdk"

// NG: HITL なしで外部送信 — Certification で reject される
await app.handoff("com.akari.x-sender", payload)

// OK: HITL ゲートを先に通す
await permission.gate({
  action: "external-network.post",
  reason: "X に投稿: " + previewText,
  hitl: true,           // ユーザーに承認プロンプトを表示
})
await app.handoff("com.akari.x-sender", payload)
```

### HITL が必要な handoff の判断基準

| 条件 | HITL 要否 |
|---|---|
| 受け側が外部ネットワークに送信する | **必須** |
| 受け側がファイルを削除・上書きする | **必須** |
| 受け側が課金アクションを実行する | **必須** |
| Pool / AMP 間の内部 handoff のみ | 不要 |
| ユーザーが明示的に「渡す」ボタンを押した | 不要（ユーザー操作が承認を兼ねる） |

> 詳細は [Permission API リファレンス](./permission-api.md) を参照。

---

## 9. エラーハンドリング

### target 未インストール

```typescript
const result = await app.handoff("com.akari.notion", payload)

switch (result.status) {
  case "accepted":
    // 正常
    break

  case "not-installed":
    // App がインストールされていない
    console.warn("対象 App が未インストール:", result.reason)
    // フォールバック処理...
    break

  case "rejected":
    // App が受け取りを拒否（型不一致・権限不足等）
    console.error("handoff が却下されました:", result.reason)
    break

  case "pending":
    // 非同期処理中（MCP ジョブキューに積まれた場合）
    // result.handoffId で後から AMP をクエリして結果を確認できる
    break
}
```

### 型不一致（kind 不一致）

受け側が `onHandoff` ハンドラで `accept: false` を返すと `status: "rejected"` になる。
送り側は `kind` のスペルと受け側が対応する `kind` 一覧を確認すること。

```typescript
// kind が間違っている例
await app.handoff("com.akari.x-sender", {
  kind: "export-to-doc",    // X Sender は "publish-draft" を期待
  ref: { draft: draftId },
})
// → result.status = "rejected", reason = "未対応の kind: export-to-doc"
```

### 承認却下（HITL でユーザーが「キャンセル」）

```typescript
try {
  await permission.gate({
    action: "external-network.post",
    reason: "X に投稿",
    hitl: true,
  })
  await app.handoff("com.akari.x-sender", payload)
} catch (err) {
  if (err instanceof PermissionDeniedError) {
    // ユーザーが承認を拒否した
    // UI に「投稿をキャンセルしました」を表示するだけで OK
    console.log("ユーザーが投稿をキャンセルしました")
  } else {
    throw err
  }
}
```

### タイムアウト

`app.handoff()` はデフォルト 30 秒でタイムアウトする。
長時間処理（動画エクスポート等）は受け側が `status: "pending"` を即座に返し、
ジョブ完了後に AMP に記録する非同期パターンを使う。

```typescript
// 非同期パターン（受け側の実装例）
app.onHandoff(async (handoff) => {
  // 即座に pending を返す
  queueLongRunningJob(handoff)
  return { accept: true }   // pending ではなく accepted を返し、後で AMP に記録
})
```

---

## 10. 型定義

```typescript
// @akari/sdk の型定義（抜粋）

/** handoff を送る */
declare function handoff(
  targetId: string,
  payload: HandoffPayload
): Promise<HandoffResult>

/** handoff を受け取るハンドラを登録 */
declare function onHandoff(handler: HandoffHandler): void

interface HandoffPayload {
  kind: string
  ref: HandoffRefs
  hints?: HandoffHints
}

interface HandoffRefs {
  poolIds?: string[]
  assets?: string[]
  draft?: string
  ampRecordId?: string
  goalRef?: string
  [key: string]: string | string[] | undefined
}

interface HandoffHints {
  intent?: string
  targetOutlet?: string
  format?: string
  [key: string]: unknown
}

interface HandoffResult {
  status: "accepted" | "rejected" | "pending" | "not-installed"
  handoffId: string
  reason?: string
}

interface IncomingHandoff {
  handoffId: string
  from: string
  payload: HandoffPayload
  timestamp: string
}

interface HandoffResponse {
  accept: boolean
  reason?: string
}

type HandoffHandler = (handoff: IncomingHandoff) => Promise<HandoffResponse>

/** app オブジェクト（@akari/sdk からインポート） */
export declare const app: {
  handoff: typeof handoff
  onHandoff: typeof onHandoff
}
```

---

## 11. 使用例

### Writer → X Sender（SNS 投稿の完全フロー）

```typescript
// writer/src/publish.ts
import { pool, amp, ace, app, permission, shell } from "@akari/sdk"

export async function publishToX(
  content: string,
  sessionGoalRef: string
): Promise<void> {
  // Step 1: Pool に下書きを保存
  const draftId = await pool.put({
    bytes: Buffer.from(content, "utf8"),
    mime: "text/markdown",
    tags: ["draft", "x-post"],
  })

  // Step 2: AMP に判断記録
  const ampId = await amp.record({
    kind: "draft-finalized",
    content: `下書きを確定: ${content.slice(0, 50)}...`,
    goal_ref: sessionGoalRef,
  })

  // Step 3: コンテキスト構築（ACE）
  const context = await ace.build({
    intent: "X に投稿する",
    goal_ref: sessionGoalRef,
    sources: [
      { kind: "pool", query: draftId },
      { kind: "amp", filter: { kind: "writing_style" } },
    ],
  })

  // Step 4: Guardian チェック（オプション）
  const lintIssues = await ace.lint(context)
  if (lintIssues.length > 0) {
    shell.notify({ message: "Guardian: " + lintIssues[0].message, level: "warn" })
  }

  // Step 5: HITL ゲート（外部送信は必須）
  await permission.gate({
    action: "external-network.post",
    reason: `X に投稿: "${content.slice(0, 30)}..."`,
    hitl: true,
  })

  // Step 6: handoff（ID のみ渡す）
  const result = await app.handoff("com.akari.x-sender", {
    kind: "publish-draft",
    ref: {
      draft: draftId,
      ampRecordId: ampId,
      goalRef: sessionGoalRef,
    },
    hints: {
      intent: "post-to-x",
      format: "plain-text",
    },
  })

  // Step 7: 結果をユーザーにフィードバック
  if (result.status === "accepted") {
    shell.notify({ message: "X への投稿を受け付けました", level: "success" })
  } else if (result.status === "not-installed") {
    shell.notify({
      message: "X Sender がインストールされていません",
      action: { label: "インストール", appId: "com.akari.x-sender" },
    })
  }
}
```

### Writer → Notion export（ドキュメント化フロー）

```typescript
// writer/src/export-to-notion.ts
import { pool, amp, app, permission } from "@akari/sdk"

export async function exportToNotion(
  articleContent: string,
  title: string,
  sessionGoalRef: string
): Promise<void> {
  // Pool に記事を保存
  const articleId = await pool.put({
    bytes: Buffer.from(articleContent, "utf8"),
    mime: "text/markdown",
    tags: ["article", "export-candidate"],
    metadata: { title },
  })

  // AMP に記録
  const ampId = await amp.record({
    kind: "export-requested",
    content: `記事「${title}」を Notion にエクスポート`,
    goal_ref: sessionGoalRef,
  })

  // Notion は共有ドキュメント作成のため HITL 必須
  await permission.gate({
    action: "external-network.post",
    reason: `Notion に「${title}」を作成します`,
    hitl: true,
  })

  // category セレクタ + hints で documents カテゴリを解決
  const result = await app.handoff("category:documents", {
    kind: "export-to-doc",
    ref: {
      draft: articleId,
      ampRecordId: ampId,
      goalRef: sessionGoalRef,
    },
    hints: {
      targetOutlet: "notion",
      intent: "knowledge-base-entry",
      format: "markdown",
    },
  })

  if (result.status === "not-installed") {
    // Notion App なし → フォールバックで clipboard に
    await fallbackToClipboard(articleContent)
  }
}
```

---

## 12. 関連ドキュメント

| ドキュメント | 関係 |
|---|---|
| [Memory API](./memory-api.md) | `pool.put/get` / `amp.record/get` — handoff で渡す ID の生成元 |
| [Permission API](./permission-api.md) | `permission.gate()` — 外部送信前の HITL ゲート |
| [AKARI-HUB-024 §6.6(5)](https://github.com/Akari-OS/.github/blob/main/VISION.md) | Inter-App API の正典 spec |
| [AKARI-HUB-005 v0.2 §7.1b](https://github.com/Akari-OS/.github/blob/main/VISION.md) | Documents クロスオーバーのリファレンス（Writer/Research/Video → Documents） |
| Writer handoff フロー実装例 (internal spec) | Writer の handoff フロー実装例 |
| [VISION.md — App 間の行き来](../../../VISION.md) | handoff 原則の設計思想 |

---

> **記憶層を経由する。直接通信しない。**
> この 1 つの原則が、AKARI エコシステムのトレーサビリティとスケーラビリティを支えている。
