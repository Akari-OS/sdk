# Cookbook — HITL（Human-in-the-Loop）パターン

> **対象**: AKARI Module SDK（HUB-024）で HITL ゲートを実装する Module 開発者
> **前提**: Panel Schema v0（HUB-025）の基礎知識
> **関連 spec**: AKARI-HUB-025 §6.5 Action 規約, AKARI-HUB-007 X Sender, AKARI-HUB-026 Notion

---

## HITL とは

HITL（Human-in-the-Loop）は、AI や Module が外部に影響を与える操作（投稿・送信・削除・上書きなど）の前に **ユーザーに承認を求める** 仕組みです。

```
ユーザーがアクションボタンを押す
       ↓
Permission API が hitl.require: true を検出
       ↓
Core が HITL 承認ダイアログを表示（preview 種別に応じたプレビュー）
       ↓
ユーザーが [承認] → MCP ツールを呼び出す
           [キャンセル] → 何も実行しない（API コール 0 件）
```

AKARI が定義する HITL preview 種別は 4 つ：

| preview 種別 | 用途 | 典型的なアクション |
|---|---|---|
| `custom-markdown` | 任意フォーマットで最終確認 | SNS 投稿、メール送信 |
| `diff` | before/after 差分を表示 | ドキュメント追記・プロパティ更新 |
| `schedule-summary` | 予約日時・繰り返し条件を確認 | 予約投稿、スケジューリング |
| `text-summary` | テキスト系フィールドの要約を確認 | 複数レコードの一括作成 |

---

## レシピ 1 — `custom-markdown`：投稿・送信前の最終確認

### いつ使うか

- SNS への投稿（X, Bluesky, Threads, Note など）
- メール・DM 送信
- 外部サービスへの「公開」操作全般
- ユーザーが投稿直前に「本当にこの内容でいいか」を確認したいとき

### Panel Schema の宣言

```json
{
  "$schema": "akari://panel-schema/v0",
  "title": "X に投稿",
  "layout": "form",
  "fields": [
    {
      "id":        "text",
      "type":      "textarea",
      "label":     "本文",
      "maxLength": 280,
      "bind":      "mcp.x.post.text",
      "required":  true
    },
    {
      "id":     "media",
      "type":   "pool-picker",
      "label":  "添付（画像 / 動画）",
      "accept": ["image", "video"],
      "max":    4,
      "bind":   "mcp.x.post.media"
    }
  ],
  "actions": [
    {
      "id":    "post",
      "label": "投稿",
      "kind":  "primary",
      "mcp": {
        "tool": "x.post",
        "args": { "text": "$text", "media": "$media" }
      },
      "hitl": {
        "require": true,
        "preview": "custom-markdown",
        "preview_template": "**投稿内容**\n\n{{$text}}\n\n{{#if $media}}添付: {{$media.length}} 件{{/if}}\n\nアカウント: @{{$account_name}}"
      },
      "enabled_when": "$text != null && $text.length > 0",
      "on_success": {
        "toast": "X に投稿しました",
        "clear_fields": ["text", "media"]
      },
      "on_error": {
        "toast": "エラーが発生しました: {{error}}"
      }
    }
  ]
}
```

### 承認ダイアログの表示イメージ

```
┌──────────────────────────────────────────────────┐
│  投稿内容の確認                                     │
│                                                  │
│  投稿内容                                          │
│  ─────────────────────────────────────────────   │
│  今日のクリエイター向けワークフロー Tips をまとめました。│
│  AKARI OS で全部自動化できます。                     │
│                                                  │
│  添付: 2 件                                        │
│  アカウント: @yourhandle                            │
│                                                  │
│                    [キャンセル]  [投稿する]          │
└──────────────────────────────────────────────────┘
```

### MCP サーバー側での HITL 連携

```typescript
// x-mcp/src/tools/post.ts

export const xPostTool = {
  name: "x.post",
  description: "X に単発テキストを即時投稿する",
  inputSchema: {
    type: "object",
    required: ["text"],
    properties: {
      text:    { type: "string", maxLength: 280 },
      media:   { type: "array", items: { type: "string" }, maxItems: 4 },
      dry_run: { type: "boolean", default: false },
    },
  },
  handler: async (input: { text: string; media?: string[]; dry_run?: boolean }) => {
    // NOTE: HITL ゲートはこのハンドラが呼ばれる前に Core が済ませる
    // ここに到達した時点でユーザーは承認済み

    if (input.dry_run) {
      console.log("[DRY RUN] Would post:", input.text)
      return { success: true, tweet_id: "dry-run-id", dry_run: true }
    }

    const token = await getValidAccessToken("com.akari.x-sender")
    const res = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: input.text }),
    })

    if (!res.ok) throw new Error(`X API error: ${res.status}`)
    const data = await res.json()
    const tweetId = data.data.id

    // 投稿成功後に AMP 記録
    await amp.record({
      kind: "publish-action",
      content: `X に投稿しました: https://x.com/i/web/status/${tweetId}`,
      goal_ref: "com.akari.x-sender",
      metadata: {
        target: "x",
        tweet_id: tweetId,
        published_at: new Date().toISOString(),
      },
    })

    return { success: true, tweet_id: tweetId }
  },
}
```

### ポイント

- `preview_template` は Mustache 風テンプレートで `$field_id` を展開する
- `#if` / `#each` 等のヘルパーで条件分岐・繰り返しが使える
- ユーザーが [キャンセル] を選んだ場合、MCP ツールは**一切呼ばれない**（Shell が保証）
- `on_success.clear_fields` でフォームをリセットできる（投稿後の誤二重送信防止）

---

## レシピ 2 — `diff`：編集確認（既存ページへの追記・更新）

### いつ使うか

- Notion / Google Docs / Word への追記（既存コンテンツへの変更）
- プロパティ・メタデータの更新（タイトル変更、ステータス更新）
- 「既にあるものを変える」操作全般

`diff` プレビューは before/after の差分を横並びで表示し、ユーザーが変更の影響範囲を確認できる。

### Panel Schema の宣言

```json
{
  "$schema": "akari://panel-schema/v0",
  "title": "Notion に追記",
  "layout": "form",
  "fields": [
    {
      "id":    "page_id",
      "type":  "text",
      "label": "追記先ページ ID",
      "bind":  "mcp.notion.append_block_children.block_id"
    },
    {
      "id":    "content",
      "type":  "rich-text-editor",
      "label": "追記内容",
      "bind":  "mcp.notion.append_block_children.children"
    }
  ],
  "actions": [
    {
      "id":    "append",
      "label": "追記する",
      "kind":  "primary",
      "mcp": {
        "tool": "notion.append_block_children",
        "args": {
          "block_id": "$page_id",
          "children": "$content"
        }
      },
      "hitl": {
        "require":         true,
        "preview":         "diff",
        "diff_before_ref": "mcp.notion.retrieve_block_children",
        "diff_before_args": { "block_id": "$page_id" }
      },
      "enabled_when": "$page_id != null && $content != null"
    },
    {
      "id":    "update_title",
      "label": "タイトルを更新",
      "kind":  "secondary",
      "mcp": {
        "tool": "notion.update_page_properties",
        "args": {
          "page_id":    "$page_id",
          "properties": { "title": "$new_title" }
        }
      },
      "hitl": {
        "require":         true,
        "preview":         "diff",
        "diff_before_ref": "mcp.notion.retrieve_page",
        "diff_before_args": { "page_id": "$page_id" }
      }
    }
  ]
}
```

### diff プレビューの表示イメージ

```
┌──────────────────────────────────────────────────────────────┐
│  追記内容の確認                                                 │
│                                                              │
│  変更前（現在の末尾）         変更後（追記内容）                 │
│  ──────────────────────   ────────────────────              │
│  ## まとめ                   ## まとめ                         │
│  ・ポイント 1                 ・ポイント 1                      │
│  ・ポイント 2                 ・ポイント 2                      │
│                          + ### 追記: 2026-04-19              │
│                          + ・新しいポイント 3                  │
│                                                              │
│  追記先: My Research Notes（Notion）                           │
│                                                              │
│                         [キャンセル]  [追記する]               │
└──────────────────────────────────────────────────────────────┘
```

### MCP サーバー側での実装（diff データ提供）

```typescript
// notion-mcp/src/tools/append.ts

export const appendBlockChildrenTool = {
  name: "notion.append_block_children",
  description: "既存ページの末尾にブロックを追記する",
  inputSchema: {
    type: "object",
    required: ["block_id", "children"],
    properties: {
      block_id: { type: "string", description: "追記先ページまたはブロックの ID" },
      children: {
        type: "array",
        description: "追加する Notion ブロックの配列",
        maxItems: 100,  // Notion API 制限
      },
    },
  },
  handler: async (input: { block_id: string; children: unknown[] }) => {
    // Core が diff preview を Shell に表示し、ユーザーの承認を受けた後にここに到達

    const authHeader = await getNotionAuthHeader()

    const res = await fetch(
      `https://api.notion.com/v1/blocks/${input.block_id}/children`,
      {
        method: "PATCH",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify({ children: input.children }),
      }
    )

    if (!res.ok) {
      const err = await res.json()
      throw new Error(`Notion API error: ${res.status} - ${JSON.stringify(err)}`)
    }

    await amp.record({
      kind: "export-action",
      content: `Notion ページ ${input.block_id} にブロックを追記しました`,
      goal_ref: "com.akari.notion",
      metadata: {
        action:   "append_block_children",
        block_id: input.block_id,
        count:    input.children.length,
      },
    })

    return { success: true, appended_count: input.children.length }
  },
}
```

### ポイント

- `diff_before_ref` で「before 状態」を取得する MCP ツールを指定する
- Shell が `diff_before_ref` を先に呼び出して現在の状態を取得し、`children` との差分を計算する
- 大量追記（100 ブロック超）は Panel Schema の `max` バリデーションで防ぐ
- 削除操作（`notion.delete_block`）は diff より `custom-markdown` が適切（削除は before/after が成立しない）

---

## レシピ 3 — `schedule-summary`：予約投稿確認

### いつ使うか

- 予約投稿（SNS、メール、Push 通知）
- 繰り返しタスクのスケジュール設定
- 「いつ実行するか」を確認させたい操作全般

### Panel Schema の宣言

```json
{
  "$schema": "akari://panel-schema/v0",
  "title": "X に投稿",
  "layout": "form",
  "fields": [
    {
      "id":        "text",
      "type":      "textarea",
      "label":     "本文",
      "maxLength": 280,
      "bind":      "mcp.x.post.text",
      "required":  true
    },
    {
      "id":          "when",
      "type":        "datetime-optional",
      "label":       "予約日時",
      "placeholder": "空欄 = 即時投稿",
      "bind":        "mcp.x.schedule.publish_at"
    }
  ],
  "actions": [
    {
      "id":    "post",
      "label": "今すぐ投稿",
      "kind":  "primary",
      "mcp": {
        "tool": "x.post",
        "args": { "text": "$text" }
      },
      "hitl": {
        "require":          true,
        "preview":          "custom-markdown",
        "preview_template": "**投稿内容**\n\n{{$text}}"
      },
      "enabled_when": "$text != null && $text.length > 0 && $when == null"
    },
    {
      "id":    "schedule",
      "label": "予約投稿",
      "kind":  "secondary",
      "mcp": {
        "tool": "x.schedule",
        "args": {
          "text":       "$text",
          "publish_at": "$when"
        }
      },
      "hitl": {
        "require": true,
        "preview": "schedule-summary"
      },
      "enabled_when": "$text != null && $text.length > 0 && $when != null",
      "on_success": {
        "toast": "{{$when|date}} に予約投稿を登録しました",
        "clear_fields": ["text", "when"]
      }
    }
  ]
}
```

### `schedule-summary` プレビューの表示イメージ

```
┌──────────────────────────────────────────────────┐
│  予約投稿の確認                                     │
│                                                  │
│  投稿内容                                          │
│  ─────────────────────────────────────────────   │
│  今日のクリエイター向けワークフロー Tips を...         │
│  （以下省略）                                       │
│                                                  │
│  予約日時                                          │
│  2026-04-20（月）午前 9:00 JST                     │
│  → 約 15 時間後に投稿されます                         │
│                                                  │
│  アカウント: @yourhandle                            │
│                                                  │
│                    [キャンセル]  [予約する]          │
└──────────────────────────────────────────────────┘
```

### MCP サーバー側での実装

```typescript
// x-mcp/src/tools/schedule.ts

export const xScheduleTool = {
  name: "x.schedule",
  description: "X に単発テキストを予約投稿する",
  inputSchema: {
    type: "object",
    required: ["text", "publish_at"],
    properties: {
      text:       { type: "string", maxLength: 280 },
      publish_at: { type: "string", format: "date-time", description: "ISO 8601 UTC" },
      media:      { type: "array", items: { type: "string" }, maxItems: 4 },
    },
  },
  handler: async (input: { text: string; publish_at: string; media?: string[] }) => {
    const publishAt = new Date(input.publish_at)

    if (publishAt <= new Date()) {
      throw new Error("予約日時は現在時刻より後を指定してください")
    }

    // AKARI Core のジョブキューに登録（X API の scheduled tweet を使う場合は API 呼び出しに変更）
    const jobId = await jobQueue.schedule({
      runAt:   publishAt,
      handler: "x.post",
      args: {
        text:  input.text,
        media: input.media,
      },
    })

    await amp.record({
      kind: "schedule-created",
      content: `X への予約投稿を登録しました（${publishAt.toISOString()}）`,
      goal_ref: "com.akari.x-sender",
      metadata: {
        job_id:     jobId,
        publish_at: publishAt.toISOString(),
        text_preview: input.text.slice(0, 50),
      },
    })

    return { success: true, job_id: jobId, publish_at: publishAt.toISOString() }
  },
}
```

### ポイント

- `schedule-summary` は Shell が `$when` フィールドの値（ISO 8601）を自動でフォーマットして表示する
- 「〜時間後」という相対時間も Shell が自動計算する
- 繰り返し設定（毎週月曜など）には `duration` / `cron` フィールドを組み合わせる
- 予約キャンセルには別のアクションを用意し、`diff` や `text-summary` で確認を求めるのが UX の定石

---

## レシピ 4 — `text-summary`：複雑な AI 出力・一括操作の要約確認

### いつ使うか

- Research Module から Notion へ一括追加（複数レコードを一度に処理）
- AI が生成したコンテンツの内容確認（ページ作成前の最終チェック）
- 件数・サイズが大きい操作で「本当に N 件処理してよいか」を確認させたい場合

### Panel Schema の宣言

```json
{
  "$schema": "akari://panel-schema/v0",
  "title": "Notion に一括追加",
  "layout": "form",
  "fields": [
    {
      "id":    "database_id",
      "type":  "text",
      "label": "追加先 Database ID",
      "bind":  "mcp.notion.create_page.parent.database_id"
    },
    {
      "id":    "records",
      "type":  "amp-query",
      "label": "追加するリサーチ結果",
      "bind":  "amp.research-result.items",
      "filter": { "kind": "research-result", "synced": false }
    }
  ],
  "actions": [
    {
      "id":    "bulk_add",
      "label": "一括追加",
      "kind":  "primary",
      "mcp": {
        "tool": "notion.bulk_create_pages",
        "args": {
          "database_id": "$database_id",
          "records":     "$records"
        }
      },
      "hitl": {
        "require":          true,
        "preview":          "text-summary",
        "summary_template": "**{{$records.length}} 件**のリサーチ結果を Notion database に追加します。\n\n{{#each $records}}- {{this.title}}{{/each}}"
      },
      "enabled_when": "$database_id != null && $records != null && $records.length > 0"
    }
  ]
}
```

### `text-summary` プレビューの表示イメージ

```
┌──────────────────────────────────────────────────────────────┐
│  一括追加の確認                                                 │
│                                                              │
│  12 件 のリサーチ結果を Notion database に追加します。            │
│                                                              │
│  - AKARI OS のユーザー事例 vol.1                               │
│  - CreatorTech 2026 カンファレンスレポート                       │
│  - Lark Harness vs AKARI 比較メモ                             │
│  - ... 他 9 件                                                │
│                                                              │
│  追加先: My Research Database（Notion）                        │
│                                                              │
│                          [キャンセル]  [追加する]              │
└──────────────────────────────────────────────────────────────┘
```

### 大量処理時のバッチ承認（20 件超え）

件数が多い場合は、Shell がバッチ分割の UI を自動で提示する。  
MCP サーバー側でバッチ処理に対応しておくことが推奨。

```typescript
// notion-mcp/src/tools/bulk-create.ts

export const bulkCreatePagesTool = {
  name: "notion.bulk_create_pages",
  description: "Notion database に複数エントリを一括作成する",
  inputSchema: {
    type: "object",
    required: ["database_id", "records"],
    properties: {
      database_id: { type: "string" },
      records: {
        type:  "array",
        items: { type: "object" },
      },
      batch_size: {
        type:    "integer",
        default: 5,
        maximum: 20,
        description: "1 回の HITL 承認で処理する件数（デフォルト 5）",
      },
    },
  },
  handler: async (input: {
    database_id: string
    records: Record<string, unknown>[]
    batch_size?: number
  }) => {
    const batchSize = input.batch_size ?? 5
    const results: { page_id: string; title: string }[] = []
    const errors:  { index: number; error: string }[]  = []

    // バッチ単位で処理
    for (let i = 0; i < input.records.length; i += batchSize) {
      const batch = input.records.slice(i, i + batchSize)

      for (const record of batch) {
        try {
          const page = await createNotionPage(input.database_id, record)
          results.push(page)
        } catch (err) {
          errors.push({
            index: i + batch.indexOf(record),
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    // 全件処理後に AMP 記録
    await amp.record({
      kind: "research-export",
      content: `Notion database に ${results.length} 件追加しました`,
      goal_ref: "com.akari.notion",
      metadata: {
        database_id:  input.database_id,
        success_count: results.length,
        error_count:   errors.length,
        errors:        errors.length > 0 ? errors : undefined,
      },
    })

    return {
      success:       errors.length === 0,
      created_count: results.length,
      error_count:   errors.length,
      errors:        errors.length > 0 ? errors : undefined,
    }
  },
}

async function createNotionPage(
  databaseId: string,
  record: Record<string, unknown>
): Promise<{ page_id: string; title: string }> {
  const authHeader = await getNotionAuthHeader()

  const res = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization:  authHeader,
      "Content-Type": "application/json",
      "Notion-Version": "2022-06-28",
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: record,
    }),
  })

  if (!res.ok) throw new Error(`Create page failed: ${res.status}`)
  const page = await res.json()
  return {
    page_id: page.id,
    title:   extractTitle(page),
  }
}
```

---

## レシピ 5 — 「常に承認」モードとの両立

一部の上級ユーザーは、信頼できる操作については HITL 承認ダイアログを省略したい場合がある。
AKARI では「常に承認」モードを **設定 panel** で提供できる（Phase 0 では提供しなくてよい）。

### 設定 panel での宣言

```json
{
  "$schema": "akari://panel-schema/v0",
  "title": "X Sender 設定",
  "layout": "form",
  "fields": [
    {
      "id":    "auto_approve_post",
      "type":  "toggle",
      "label": "投稿を自動承認する（確認ダイアログをスキップ）",
      "bind":  "state.auto_approve_post",
      "helperText": "信頼できる接続先に限り有効にしてください"
    },
    {
      "id":    "auto_approve_schedule",
      "type":  "toggle",
      "label": "予約投稿を自動承認する",
      "bind":  "state.auto_approve_schedule"
    }
  ],
  "actions": [
    {
      "id":    "save_settings",
      "label": "設定を保存",
      "kind":  "primary",
      "mcp": {
        "tool": "x.save_settings",
        "args": {
          "auto_approve_post":     "$auto_approve_post",
          "auto_approve_schedule": "$auto_approve_schedule"
        }
      }
    }
  ]
}
```

### MCP サーバー側での「常に承認」判定

```typescript
// x-mcp/src/tools/post.ts

export const xPostToolWithAutoApprove = {
  name: "x.post",
  inputSchema: { /* ... */ },
  handler: async (input: { text: string; media?: string[]; _auto_approved?: boolean }) => {
    // Core からの呼び出しには _auto_approved フラグが付く
    // auto_approved === true の場合はユーザーが事前に設定で承認済み

    if (!input._auto_approved) {
      // HITL ゲートが必要（Panel Schema の hitl.require で宣言済み）
      // この分岐は実装上の参考。実際は Core が Panel Schema を見て判断する
    }

    // ... 通常の投稿処理
  },
}
```

### AMP 記録での「常に承認」追跡

```typescript
await amp.record({
  kind:     "publish-action",
  content:  `X に投稿しました: ${tweetUrl}`,
  goal_ref: "com.akari.x-sender",
  metadata: {
    target:          "x",
    tweet_id:        tweetId,
    auto_approved:   wasAutoApproved,   // 常に承認モードかどうかを記録
    published_at:    new Date().toISOString(),
  },
})
```

---

## レシピ 6 — 学習による提案（HITL から proposal へ）

繰り返し同じ操作を承認したパターンを AMP に記録し、次回以降に「前回と同じ設定で投稿しますか？」という提案を Panel に表示できる。

```typescript
// shared/proposal.ts

export async function loadPreviousPostSettings(
  moduleId: string
): Promise<{ text_template?: string; media?: string[]; last_posted_at?: string } | null> {
  const records = await amp.query({
    goal_ref: moduleId,
    filter: { kind: "publish-action" },
    order:  "desc",
    limit:  1,
  })

  if (records.length === 0) return null

  return {
    last_posted_at: records[0].metadata?.published_at,
    // 繰り返し投稿の場合はテンプレートを提案
  }
}
```

```json
// 提案表示の Panel Schema 例
{
  "id": "proposal_banner",
  "type": "markdown",
  "label": "",
  "value": "{{#if $last_post}}前回の投稿（{{$last_post.at|date}}）と同じ設定で投稿しますか？{{/if}}",
  "visible_when": "$last_post != null"
}
```

---

## HITL 設計チェックリスト

以下の項目を確認すること。`hitl.require: true` の設定漏れは `akari module certify` で検出される。

- 外部サービスへの書き込み・投稿操作すべてに `hitl.require: true` を付けている
- 削除操作には `preview: "custom-markdown"` を使い、削除対象を全文表示している
- 追記・更新操作には `preview: "diff"` を使い、変更前後を表示している
- 予約操作には `preview: "schedule-summary"` を使い、実行日時を明示している
- 一括処理操作には `preview: "text-summary"` を使い、件数・内容の概要を表示している
- `enabled_when` で必須フィールドが空の場合にボタンを無効化している
- `on_error` でエラートーストを適切に設定している
- HITL キャンセル時に MCP ツールが呼ばれないことをテストで確認している

---

## 関連ドキュメント

- [OAuth パターン](./oauth-patterns.md) — HITL と組み合わせる認証フローの実装
- [オフラインファースト](./offline-first.md) — オフライン時の HITL 代替フロー（下書き保存への誘導）
- AKARI-HUB-025 §6.5 Action 規約 — HITL preview 種別の仕様
- AKARI-HUB-007 X Sender — `custom-markdown` / `schedule-summary` の実例
- AKARI-HUB-026 Notion — `diff` / `text-summary` / `custom-markdown` の実例
