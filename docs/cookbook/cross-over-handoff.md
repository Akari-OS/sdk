---
title: Cookbook — Cross-over Handoff（Module 間連携）
updated: 2026-04-19
related: [HUB-005, HUB-024, HUB-026]
---

# Cookbook — Cross-over Handoff（Module 間連携）

> **このレシピで学ぶこと**:
> - `module.handoff()` の仕組みと payload 設計の原則
> - Writer / Research / Video → Publishing / Documents の典型的な cross-over パターン
> - Notion → Pool への素材取り込み
> - 記憶層（Pool / AMP）経由の ID 渡しルール（直接通信禁止の理由）
> - receiving Module 側の handoff handler 設計

---

## はじめに — なぜ「直接通信禁止」なのか

AKARI の Module 間通信は **Inter-App API**（`module.handoff()`）を通じて行う。
このとき重要な制約がある。

> **ルール**: payload に bytes / 文字列本文を直接埋め込まない。**Pool / AMP の ID のみを渡す。**

この制約には 3 つの理由がある：

1. **トレーサビリティ**: 「誰が何を渡したか」を AMP に自動記録できる（ID があれば遡れる）
2. **パフォーマンス**: 大きなバイナリ（動画・画像）を handoff payload として流すと IPC が詰まる
3. **一元管理**: データの実体は常に記憶層にある。Module が死んでもデータは残る

```typescript
// NG — bytes を直接渡している
await module.handoff({
  to: "com.akari.x-sender",
  intent: "post-draft",
  payload: {
    text: "...（1000文字の本文）...",
    image: new Uint8Array([...]),  // ← 絶対ダメ
  },
})

// OK — Pool / AMP の ID だけを渡す
await module.handoff({
  to: "com.akari.x-sender",
  intent: "post-draft",
  payload: {
    draft_ref: "amp:record:01J1A2B3C4D5",  // AMP 内の下書き記録 ID
    assets:    ["pool:sha3:abc123..."],      // Pool 内の画像アイテム ID
  },
})
```

---

## Cross-over パターン一覧

| 送信元 | 受信先 | intent | 典型ユースケース |
|---|---|---|---|
| Writer | Publishing（X / LINE / IG など） | `post-draft` | 書いた下書きをそのまま SNS 投稿 |
| Writer | Documents（Notion / Google Docs） | `export-to-notion` / `export-to-gdocs` | 下書きを知識管理ツールに保存 |
| Research | Documents（Sheets / Airtable） | `save-to-db` | 収集結果をスプレッドシートに流し込み |
| Video | Documents（PPT / Slides） | `generate-slides` | 動画の章構成から登壇資料を自動生成 |
| Notion（任意 Document） | Pool | `import-to-pool` | Notion database を AI 処理の素材として取り込む |

---

## レシピ 1: Writer → Publishing（X Sender）

最も頻度が高い cross-over。Writer で書いた下書きを X に投稿する。

### 送信側（Writer Module）

```typescript
// panels/writer.tsx または skills/export.ts
import { module, amp, pool } from "@akari/sdk"

export async function handoffToXSender(
  draftAmpId: string,
  mediaPoolIds: string[],
  goalRef: string,
) {
  // 1. handoff 前に AMP に記録（送信した事実を残す）
  await amp.record({
    kind:     "handoff-initiated",
    content:  `Writer → X Sender handoff を開始`,
    goal_ref: goalRef,
    meta: {
      target_module: "com.akari.x-sender",
      draft_ref:     draftAmpId,
      asset_count:   mediaPoolIds.length,
    },
  })

  // 2. handoff 実行（ID のみ渡す）
  await module.handoff({
    to:      "com.akari.x-sender",
    intent:  "post-draft",
    payload: {
      draft_ref: draftAmpId,        // AMP 内の下書き本文参照
      assets:    mediaPoolIds,       // Pool 内の添付メディア ID 配列
      goal_ref:  goalRef,            // ゴール紐付け（受信側でも使う）
    },
  })
}
```

### 受信側（X Sender Module）

MCP-Declarative Module での handoff 受信は、`akari.toml` の `[handoff]` セクションで
受け入れる intent を宣言し、`handler` 関数で処理する。

```toml
# akari.toml（X Sender）
[handoff]
accepts = [
  { intent = "post-draft", from = "*" },  # 全 Module から受け入れ
]
```

```typescript
// mcp-server/handoff-handler.ts
import { amp, pool } from "@akari/sdk"
import type { HandoffPayload } from "@akari/sdk/inter-app"

export async function handlePostDraft(payload: HandoffPayload) {
  const { draft_ref, assets, goal_ref } = payload

  // 1. AMP から下書き本文を取得
  const draftRecord = await amp.get(draft_ref)
  const text: string = draftRecord.content

  // 2. Pool から添付メディアを取得
  const mediaItems = await Promise.all(
    (assets ?? []).map((id) => pool.get(id))
  )

  // 3. Panel の初期値として展開（Schema の state.* binding を利用）
  //    Shell が自動で Panel を前面に出し、フォームに値をセットする
  return {
    panel:        "main",
    initial_state: {
      text:   text.slice(0, 280),   // X の文字数制限に合わせてトリム
      media:  mediaItems.map((item) => item.id),
      origin: draft_ref,            // どの下書きから来たかを保持
    },
  }
}
```

**ポイント**: receiving Module は `initial_state` を返すことで、
Panel Schema の `state.*` binding に値を注入できる。
ユーザーは Panel が開いた瞬間に内容が展開された状態を見る。

---

## レシピ 2: Writer → Documents（Notion / Google Docs export）

下書きを外部に「公開」するのではなく「知識管理」として保存するパターン。
HUB-026（Notion 参考実装）の §6.1 を実装例として参照。

### 送信側（Writer Module）

```typescript
import { module, amp } from "@akari/sdk"

export async function exportToNotion(
  draftAmpId: string,
  targetDatabaseId: string | null,
  poolAssetIds: string[],
  goalRef: string,
) {
  await module.handoff({
    to:      "com.akari.notion",
    intent:  "export-to-notion",
    payload: {
      draft_ref:  draftAmpId,
      assets:     poolAssetIds,
      target_db:  targetDatabaseId ?? undefined,  // 省略時は Notion 側でユーザーが選ぶ
      goal_ref:   goalRef,
    },
  })
}
```

### 受信側（Notion Module）

```typescript
// mcp-server/handoff-handler.ts（Notion Module）
import { amp, pool } from "@akari/sdk"
import type { HandoffPayload } from "@akari/sdk/inter-app"

export async function handleExportToNotion(payload: HandoffPayload) {
  const { draft_ref, assets, target_db, goal_ref } = payload

  // 1. AMP から下書きを取得
  const draftRecord = await amp.get(draft_ref)

  // 2. Pool から添付素材を取得（Notion に embed するため）
  const assetItems = await Promise.all(
    (assets ?? []).map((id) => pool.get(id))
  )

  // 3. HITL 前のプレビューデータを組み立て
  //    Panel Schema の `hitl: true` アクションが実行されるまで API は呼ばれない
  return {
    panel: "main",
    initial_state: {
      page_title:  draftRecord.meta?.title ?? "無題",
      page_body:   draftRecord.content,
      target_db:   target_db,
      embed_assets: assetItems.map((a) => ({ id: a.id, mime: a.mime })),
      goal_ref:    goal_ref,
    },
  }
  // → ユーザーが Panel で内容を確認し「ページを作成」ボタンを押すと
  //   HITL gate を通り notion.create_page が実行される
}
```

**Google Docs への export も同じ構造**（`intent: "export-to-gdocs"`、
`to: "com.akari.gsuite"`）。intent 名とターゲット Module を変えるだけ。

---

## レシピ 3: Research → Documents（Sheets 流し込み）

Research Module（Perplexity / Exa 等）が収集した情報を
Google Sheets / Airtable のレコードとして書き込む。

### 送信側（Research Module）

```typescript
import { module, amp } from "@akari/sdk"

/**
 * AMP に積まれたリサーチ結果を Sheets に流し込む
 * @param resultAmpIds - AMP に記録された research-result レコードの ID 配列
 * @param targetSheetId - 書き込み先 Sheets の ID（または Airtable base ID）
 * @param fieldMap - AMP フィールド → シート列のマッピング
 */
export async function exportResearchToSheets(
  resultAmpIds: string[],
  targetSheetId: string,
  fieldMap: Record<string, string>,
  goalRef: string,
) {
  await module.handoff({
    to:      "com.akari.gsuite",          // Google Sheets
    intent:  "save-to-db",
    payload: {
      records:    resultAmpIds,            // AMP record ID の配列
      target_db:  targetSheetId,
      field_map:  fieldMap,               // { title: "A列", url: "B列", summary: "C列" }
      goal_ref:   goalRef,
    },
  })
}
```

### 受信側（Google Sheets Module）

```typescript
import { amp } from "@akari/sdk"
import type { HandoffPayload } from "@akari/sdk/inter-app"

export async function handleSaveToDb(payload: HandoffPayload) {
  const { records, target_db, field_map, goal_ref } = payload

  // 1. AMP から各レコードを取得
  const ampRecords = await Promise.all(
    (records as string[]).map((id) => amp.get(id))
  )

  // 2. field_map に従ってシート行に変換
  const rows = ampRecords.map((rec) => {
    const row: Record<string, string> = {}
    for (const [ampField, colName] of Object.entries(field_map as Record<string, string>)) {
      row[colName] = rec.meta?.[ampField] ?? rec.content
    }
    return row
  })

  // 3. HITL preview 用に件数サマリを返す
  return {
    panel: "database",
    initial_state: {
      pending_rows:  rows,
      target_db:     target_db,
      row_count:     rows.length,
      goal_ref:      goal_ref,
    },
    // → Panel で「N 件のエントリを追加」プレビューが出る
    //   承認 → sheets.append_rows / notion.create_page が実行される
  }
}
```

---

## レシピ 4: Video → Documents（登壇資料自動生成）

Video Module が持つ章構成（タイムライン）と静止画キャプチャを
PowerPoint / Google Slides にテンプレ挿入する。

### 送信側（Video Module）

```typescript
import { module, amp, pool } from "@akari/sdk"

export async function generateSlidesFromVideo(
  timelineAmpId: string,     // AMP に記録されたタイムライン（章構成）の ID
  thumbnailPoolIds: string[], // Pool に保存されたサムネイル・静止画の ID
  templateName: string,       // スライドテンプレート名（"lecture" / "minimal" 等）
  goalRef: string,
) {
  await module.handoff({
    to:      "com.akari.gsuite",    // Google Slides または com.akari.m365（PPT）
    intent:  "generate-slides",
    payload: {
      timeline_ref:    timelineAmpId,
      thumbnails:      thumbnailPoolIds,
      slide_template:  templateName,
      goal_ref:        goalRef,
    },
  })
}
```

### 受信側（Google Slides / PPT Module）

```typescript
import { amp, pool } from "@akari/sdk"
import type { HandoffPayload } from "@akari/sdk/inter-app"

export async function handleGenerateSlides(payload: HandoffPayload) {
  const { timeline_ref, thumbnails, slide_template, goal_ref } = payload

  // 1. タイムライン（章構成）を AMP から取得
  const timeline = await amp.get(timeline_ref as string)
  const chapters: Array<{ title: string; timestamp: number; description: string }> =
    timeline.meta?.chapters ?? []

  // 2. サムネイルを Pool から取得
  const thumbItems = await Promise.all(
    (thumbnails as string[]).map((id) => pool.get(id))
  )

  // 3. スライド生成プレビューを Panel に返す
  return {
    panel: "main",
    initial_state: {
      slide_count:    chapters.length,
      chapters:       chapters,
      thumbnail_urls: thumbItems.map((t) => t.url),
      template:       slide_template,
      goal_ref:       goal_ref,
    },
  }
  // → "スライドを生成" ボタン（HITL: true）でユーザーが承認後に API 実行
}
```

---

## レシピ 5: Notion → Pool（素材取り込み）

既存の Notion database を AKARI の AI 処理の素材として Pool に取り込む。
HUB-026 §6.3 のユースケースをコードで示す。

```typescript
// Notion Module の MCP サーバー内
import { pool, amp } from "@akari/sdk"

/**
 * Notion database のエントリを Pool に一括取り込む
 * ユーザーが Panel で database を選択し、「Pool に取り込む」ボタンを押したときに呼ばれる
 */
export async function importDatabaseToPool(
  databaseId: string,
  fieldMapping: Record<string, string>,  // Notion フィールド → Pool タグのマッピング
  goalRef: string,
): Promise<{ imported_count: number; pool_ids: string[] }> {
  // 1. Notion database からエントリを取得（MCP tool 経由）
  //    実際の API 呼び出しは @notionhq/mcp が担当
  const entries = await notionMcp.queryDatabase({ database_id: databaseId })

  const poolIds: string[] = []

  for (const entry of entries) {
    // 2. 各エントリを Pool に保存
    const content = buildMarkdownFromNotion(entry, fieldMapping)
    const id = await pool.put({
      bytes:    new TextEncoder().encode(content),
      mime:     "text/notion-page",
      tags:     ["notion", "imported", `notion-db:${databaseId}`],
      meta: {
        notion_page_id: entry.id,
        title:          entry.properties?.title?.title?.[0]?.plain_text ?? "",
        source_db:      databaseId,
      },
    })
    poolIds.push(id)
  }

  // 3. 取り込み完了を AMP に記録
  await amp.record({
    kind:     "pool-import",
    content:  `Notion database ${databaseId} から ${poolIds.length} 件を Pool に取り込み`,
    goal_ref: goalRef,
    meta: {
      source:      "notion",
      database_id: databaseId,
      pool_ids:    poolIds,
    },
  })

  return { imported_count: poolIds.length, pool_ids: poolIds }
}

/** Notion page entry を Markdown テキストに変換するユーティリティ */
function buildMarkdownFromNotion(
  entry: NotionPageEntry,
  fieldMapping: Record<string, string>,
): string {
  const lines: string[] = []
  for (const [notionField, label] of Object.entries(fieldMapping)) {
    const value = entry.properties?.[notionField]
    if (value) {
      lines.push(`## ${label}`)
      lines.push(extractNotionText(value))
    }
  }
  return lines.join("\n\n")
}
```

---

## Handoff Payload 設計パターン

### 基本構造

すべての handoff payload は以下の形式に従う：

```typescript
interface HandoffPayload {
  // 記憶層への参照（必須 or 任意）
  draft_ref?:    string    // AMP record ID
  timeline_ref?: string    // AMP record ID
  records?:      string[]  // AMP record ID 配列
  assets?:       string[]  // Pool item ID 配列
  thumbnails?:   string[]  // Pool item ID 配列

  // ルーティング情報（任意）
  target_db?:    string    // 書き込み先 database ID（Notion / Sheets）
  field_map?:    Record<string, string>  // フィールドマッピング

  // トレーサビリティ（必須）
  goal_ref:      string    // AMP goal_ref（必ず付ける）
}
```

### 設計チェックリスト

- [ ] payload に bytes や長い文字列を直接埋め込んでいないか
- [ ] `goal_ref` を含めているか
- [ ] AMP ID は `amp.record()` で作成したものを参照しているか
- [ ] Pool ID は `pool.put()` で取得したものを参照しているか
- [ ] handoff 前に AMP に `kind: "handoff-initiated"` を記録しているか

---

## 記憶層経由の ID 渡し — 詳細フロー

```
送信 Module                AMP / Pool               受信 Module
───────────────────────────────────────────────────────────────
                           ← pool.put(bytes)
                               → pool_id: "pool:sha3:abc..."

amp.record({               ← amp.record(draft)
  kind: "draft",               → amp_id: "amp:rec:01J..."
  content: "...",
})

module.handoff({
  to: "com.target",
  intent: "...",
  payload: {
    draft_ref: "amp:rec:01J...",   ← ID だけを渡す
    assets:    ["pool:sha3:abc..."]
  }
})
                                            amp.get("amp:rec:01J...")  →
                                            pool.get("pool:sha3:abc...") →
                                            ← 実体データを取得して処理
```

---

## 受信 Module の Handler 設計原則

1. **初期状態の返却**: handler は Panel の `initial_state` を返す。
   Shell がそれを Panel Schema の `state.*` binding に注入する。

2. **HITL の委譲**: handler は「何を実行するか」を決めない。
   実行はユーザーが Panel で承認してから（HITL gate）。

3. **AMP への記録**: 受信した事実と実行完了の両方を AMP に記録する。

4. **エラー時の graceful degradation**: handoff で渡された ID が存在しない場合、
   handler は例外を投げずに `{ error: "参照が見つかりません", panel: "main" }` を返す。

```typescript
export async function handleHandoff(
  intent: string,
  payload: HandoffPayload,
): Promise<HandoffHandlerResult> {
  try {
    switch (intent) {
      case "export-to-notion":
        return await handleExportToNotion(payload)
      case "save-to-notion-db":
        return await handleSaveToDb(payload)
      default:
        return { error: `unknown intent: ${intent}` }
    }
  } catch (err) {
    // handoff handler のエラーは AMP に記録して graceful に返す
    await amp.record({
      kind:     "handoff-error",
      content:  `handoff handler エラー: ${String(err)}`,
      goal_ref: payload.goal_ref ?? "unknown",
    })
    return { error: String(err) }
  }
}
```

---

## よくある間違い

### 1. handoff で bytes を渡してしまう

```typescript
// NG
await module.handoff({ payload: { image: base64Image } })

// OK — まず Pool に保存し、ID を渡す
const id = await pool.put({ bytes: imageBytes, mime: "image/png" })
await module.handoff({ payload: { assets: [id] } })
```

### 2. goal_ref を省略する

```typescript
// NG — goal_ref がないと AMP でトレースできない
await module.handoff({ to: "...", intent: "...", payload: { draft_ref: id } })

// OK
await module.handoff({ to: "...", intent: "...", payload: { draft_ref: id, goal_ref: currentGoalRef } })
```

### 3. Module を直接 import する

```typescript
// NG — Module 間の直接依存（Lint で検出される）
import { generateDraft } from "com.akari.writer/skills/generate"

// OK — Inter-App API 経由の handoff か Skill API 経由の呼び出し
await module.handoff({ to: "com.akari.writer", intent: "..." })
// または
const result = await skill.call("writer.generate_draft", { topic: "..." })
```

---

## 関連ドキュメント

- [HUB-024 §6.5 Inter-App API](https://github.com/Akari-OS/.github/blob/main/VISION.md) — `module.handoff()` の仕様
- [HUB-005 v0.2 §6.8 Module 間連携](https://github.com/Akari-OS/.github/blob/main/VISION.md) — cross-over ユースケース一覧
- [HUB-026 §6 Cross-over Use Cases](../examples/notion/) — Notion での具体実装
- [Cookbook > State Management](./state-management.md) — Panel の state と initial_state binding
- [Cookbook > Error Handling](./error-handling.md) — handoff エラーの処理
