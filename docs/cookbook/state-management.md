---
title: Cookbook — State Management（状態管理）
updated: 2026-04-19
related: [HUB-024, HUB-025, ADR-007]
---

# Cookbook — State Management（状態管理）

> **このレシピで学ぶこと**:
> - Full Tier での Zustand 推奨パターン（ADR-007）
> - MCP-Declarative Tier での Panel Schema `state.*` binding
> - 永続化の線引き（local state / AMP / Pool）
> - Derived state（`useMemo` 相当）のパターン
> - App 再起動時の state 復元フロー

---

## AKARI の state 設計哲学

AKARI では **「App 本体に state を持たない」** が大原則（HUB-024 §6.7 Guideline 9）。

> App が終了・再起動・クラッシュしても、ユーザーの作業は失われない。
> なぜなら state の実体は**記憶層（Pool / AMP）**にあるから。

とはいえ「UI の表示状態」「フォームの入力中値」「ページネーションのカーソル」など、
永続化が不要な一時的 state は App 側に持って構わない。

この 2 種類を**明確に分離**することが state 管理の核心。

| state の種類 | 保存先 | 対象 | 再起動時 |
|---|---|---|---|
| **Ephemeral（揮発）** | App メモリ内 | フォーム入力中・UI の開閉状態・ページカーソル | リセットされる（それでよい） |
| **Persistent（永続）** | AMP（構造化記憶） | ユーザー設定・下書き・決定ログ | AMP から復元される |
| **Asset（素材）** | Pool（素材ストア） | 画像・動画・テキストの実体 | Pool から復元される |

---

## Part 1: Full Tier — Zustand 推奨（ADR-007）

Full Tier App は React Panel を持つため、状態管理ライブラリを選択できる。
ADR-007 は **Zustand** を推奨する（軽量・ボイラープレートが少ない・TypeScript 親和性が高い）。

### 基本の store 定義

```typescript
// src/store/app-store.ts
import { create } from "zustand"
import { devtools } from "zustand/middleware"
import { amp, pool } from "@akari/sdk"

// Ephemeral（揮発）state の型
interface EphemeralState {
  // フォームの入力中値（保存不要）
  draftText:    string
  selectedTags: string[]
  isLoading:    boolean
  currentPage:  number

  // Ephemeral state のセッター
  setDraftText:    (text: string) => void
  setSelectedTags: (tags: string[]) => void
  setLoading:      (loading: boolean) => void
  nextPage:        () => void
}

// Persistent（永続）state の型（AMP から復元する）
interface PersistentState {
  // AMP record ID — 実体は AMP に、ここには ID だけ持つ
  savedDraftAmpId:      string | null
  lastExportedPageId:   string | null
  userPreferenceAmpId:  string | null

  // AMP 操作
  saveDraft:      (text: string, goalRef: string) => Promise<string>
  loadDraft:      (ampId: string) => Promise<string>
  clearDraft:     () => void
}

type AppStore = EphemeralState & PersistentState

export const useAppStore = create<AppStore>()(
  devtools(
    (set, get) => ({
      // --- Ephemeral state ---
      draftText:    "",
      selectedTags: [],
      isLoading:    false,
      currentPage:  0,

      setDraftText:    (text)    => set({ draftText: text }),
      setSelectedTags: (tags)    => set({ selectedTags: tags }),
      setLoading:      (loading) => set({ isLoading: loading }),
      nextPage:        ()        => set((s) => ({ currentPage: s.currentPage + 1 })),

      // --- Persistent state ---
      savedDraftAmpId:     null,
      lastExportedPageId:  null,
      userPreferenceAmpId: null,

      saveDraft: async (text, goalRef) => {
        const ampId = await amp.record({
          kind:     "draft",
          content:  text,
          goal_ref: goalRef,
        })
        set({ savedDraftAmpId: ampId })
        return ampId
      },

      loadDraft: async (ampId) => {
        const record = await amp.get(ampId)
        set({ draftText: record.content, savedDraftAmpId: ampId })
        return record.content
      },

      clearDraft: () => set({ draftText: "", savedDraftAmpId: null }),
    }),
    { name: "AppStore" }  // Redux DevTools の表示名
  )
)
```

### React Panel での使い方

```typescript
// panels/writer-panel.tsx
import { useAppStore } from "../src/store/app-store"
import { useCallback } from "react"

export function WriterPanel() {
  const {
    draftText, setDraftText,
    isLoading, setLoading,
    saveDraft, savedDraftAmpId,
  } = useAppStore()

  const handleSave = useCallback(async () => {
    setLoading(true)
    try {
      await saveDraft(draftText, "writer-session-2026")
    } finally {
      setLoading(false)
    }
  }, [draftText, saveDraft, setLoading])

  return (
    <div>
      <textarea
        value={draftText}
        onChange={(e) => setDraftText(e.target.value)}
        placeholder="ここに書く..."
      />
      <button onClick={handleSave} disabled={isLoading}>
        {isLoading ? "保存中..." : "保存"}
      </button>
      {savedDraftAmpId && (
        <p>保存済み: {savedDraftAmpId}</p>
      )}
    </div>
  )
}
```

### Zustand の slice パターン（大きな App 向け）

App が複数の関心事を持つ場合は slice に分割する：

```typescript
// src/store/slices/pool-slice.ts
import type { StateCreator } from "zustand"
import { pool } from "@akari/sdk"

export interface PoolSlice {
  poolItems:     Array<{ id: string; mime: string; tags: string[] }>
  poolLoading:   boolean
  fetchPoolItems: (query: string) => Promise<void>
  addToPool:     (bytes: Uint8Array, mime: string, tags: string[]) => Promise<string>
}

export const createPoolSlice: StateCreator<PoolSlice> = (set) => ({
  poolItems:   [],
  poolLoading: false,

  fetchPoolItems: async (query) => {
    set({ poolLoading: true })
    try {
      const items = await pool.search({ query })
      set({ poolItems: items })
    } finally {
      set({ poolLoading: false })
    }
  },

  addToPool: async (bytes, mime, tags) => {
    const id = await pool.put({ bytes, mime, tags })
    set((s) => ({ poolItems: [...s.poolItems, { id, mime, tags }] }))
    return id
  },
})

// src/store/app-store.ts（slice を合成）
import { create } from "zustand"
import { createPoolSlice, type PoolSlice } from "./slices/pool-slice"
import { createDraftSlice, type DraftSlice } from "./slices/draft-slice"

type AppStore = PoolSlice & DraftSlice

export const useAppStore = create<AppStore>()((...args) => ({
  ...createPoolSlice(...args),
  ...createDraftSlice(...args),
}))
```

---

## Part 2: MCP-Declarative Tier — Panel Schema `state.*` binding

MCP-Declarative Tier では React コードを書かない。
代わりに Panel Schema JSON の `state.*` binding で状態管理を宣言する。

### state の宣言

```json
{
  "$schema": "akari://panel-schema/v0",
  "title": "Notion",
  "layout": "form",

  "state": {
    "text":        { "type": "string",  "default": "" },
    "target_db":   { "type": "string",  "default": null },
    "is_loading":  { "type": "boolean", "default": false },
    "result_page_id": { "type": "string", "default": null }
  },

  "fields": [
    {
      "id":          "text",
      "type":        "textarea",
      "label":       "ページ本文",
      "bind":        "state.text",
      "maxLength":   50000
    },
    {
      "id":          "target_db",
      "type":        "select",
      "label":       "保存先 database",
      "bind":        "state.target_db",
      "options_from": "mcp.notion.list_databases"
    }
  ],

  "actions": [
    {
      "id":          "create",
      "label":       "ページを作成",
      "kind":        "primary",
      "hitl":        true,
      "mcp": {
        "tool": "notion.create_page",
        "args": {
          "text":     "$state.text",
          "database": "$state.target_db"
        }
      },
      "loading_bind":  "state.is_loading",
      "on_success":    { "state": { "result_page_id": "$response.page_id" }, "toast": "ページを作成しました" },
      "on_error":      { "toast": "エラー: {{error}}" },
      "enabled_when":  "$state.text.length > 0"
    }
  ]
}
```

### handoff からの `initial_state` 注入

受信 App の handler が返す `initial_state` は、`state.*` binding に注入される：

```typescript
// mcp-server/handoff-handler.ts
export async function handleExportToNotion(payload: HandoffPayload) {
  const draftRecord = await amp.get(payload.draft_ref as string)

  // この initial_state が Panel Schema の state.* に注入される
  return {
    panel: "main",
    initial_state: {
      text:      draftRecord.content,  // → state.text にセット
      target_db: payload.target_db,   // → state.target_db にセット
    },
  }
}
```

### `state.*` の制約

MCP-Declarative の state は**揮発**（Panel を閉じるとリセット）。
永続化したい値は必ず AMP に書く：

```json
{
  "actions": [
    {
      "id":    "save-draft",
      "label": "下書き保存",
      "mcp": {
        "tool": "app.save_draft",
        "args": { "text": "$state.text", "goal_ref": "$context.goal_ref" }
      },
      "on_success": {
        "state": { "saved_amp_id": "$response.amp_id" },
        "toast": "下書きを保存しました"
      }
    }
  ]
}
```

`app.save_draft` の MCP tool 実装内で `amp.record()` を呼ぶことで永続化する。

---

## Part 3: 永続化の線引き（local state / AMP / Pool）

### 判断フローチャート

```
この state は何か？
│
├── UI の表示制御（モーダル開閉・ローディング・選択中タブ）
│   → Ephemeral（App メモリ / state.*）
│   → 再起動でリセットされて構わない
│
├── ユーザーの設定・好み・判断記録
│   → AMP（kind: "preference" / "decision" / "note"）
│   → goal_ref 必須
│
├── 下書き・作業中のテキスト
│   → AMP（kind: "draft"）
│   → ユーザーが明示的に「保存」するか、自動バックアップ
│
├── バイナリの実体（画像・動画・音声・PDF）
│   → Pool（Content-Addressed）
│   → AMP には Pool ID の参照を持つ
│
└── 他 App に渡すデータ
    → まず Pool / AMP に保存してから ID を handoff で渡す
```

### AMP に保存すべき state の例

```typescript
// ユーザー設定の保存
await amp.record({
  kind:     "preference",
  content:  "デフォルト投稿時刻を 21:00 に設定",
  goal_ref: "x-sender-config",
  meta: {
    setting_key:   "default_post_time",
    setting_value: "21:00",
  },
})

// 下書きの自動バックアップ（定期実行）
const autoSaveInterval = setInterval(async () => {
  if (store.draftText.length > 0 && store.hasUnsavedChanges) {
    await store.saveDraft(store.draftText, "writer-autosave")
    store.markSaved()
  }
}, 30_000)  // 30 秒ごと
```

---

## Part 4: Derived state（`useMemo` 相当）

### Full Tier — Zustand selector

Zustand では `useStore` の selector で derived state を表現する。
重い計算は `useMemo` で最適化する：

```typescript
// 文字数カウント（derived from draftText）
const charCount = useAppStore((s) => s.draftText.length)

// 文字数制限チェック（derived + computed）
const isOverLimit = useAppStore((s) => s.draftText.length > 280)

// 複数 state から derived な値を計算する場合
import { useCallback, useMemo } from "react"

function usePostValidation() {
  const { draftText, selectedTags, mediaIds } = useAppStore()

  return useMemo(() => {
    const errors: string[] = []
    if (draftText.length === 0)  errors.push("本文が空です")
    if (draftText.length > 280)  errors.push("280 文字を超えています")
    if (mediaIds.length > 4)     errors.push("メディアは 4 枚以下")
    return { errors, isValid: errors.length === 0 }
  }, [draftText, selectedTags, mediaIds])
}
```

### Pool / AMP からの非同期 derived state

```typescript
// カスタムフック: AMP から最新の下書きを取得
function useLatestDraft(goalRef: string) {
  const [draft, setDraft] = useState<{ id: string; text: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    amp.query({ goal_ref: goalRef, kind: "draft", limit: 1, sort: "desc" })
      .then((records) => {
        if (records.length > 0) {
          setDraft({ id: records[0].id, text: records[0].content })
        }
      })
      .finally(() => setLoading(false))
  }, [goalRef])

  return { draft, loading }
}
```

### MCP-Declarative Tier — `computed` フィールド

Panel Schema では `computed` を使って derived state を宣言する（HUB-025 §6.3）：

```json
{
  "state": {
    "text":        { "type": "string", "default": "" },
    "char_count":  { "type": "number", "computed": "state.text.length" },
    "is_over":     { "type": "boolean", "computed": "state.text.length > 280" }
  },
  "fields": [
    {
      "id":    "text",
      "type":  "textarea",
      "bind":  "state.text",
      "helper_text": "{{state.char_count}} / 280 文字",
      "error": "{{state.is_over ? '文字数超過' : ''}}"
    }
  ]
}
```

---

## Part 5: App 再起動時の state 復元

App は起動時（Shell が MCP サーバーを起動したとき）に
AMP から最新の state を復元する設計にする。

### 復元の実装パターン

```typescript
// mcp-server/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { amp } from "@akari/sdk"

const server = new McpServer({ name: "com.akari.x-sender", version: "0.1.0" })

// 初期化ツール: Panel が開かれたときに Shell から呼ばれる
server.tool(
  "app.initialize",
  "App の初期状態を返す（起動時 / Panel 開封時に Shell が呼ぶ）",
  { goal_ref: z.string().optional() },
  async ({ goal_ref }) => {
    const initialState: Record<string, unknown> = {
      text:       "",
      target_db:  null,
      is_loading: false,
    }

    // AMP から最新の下書きを復元
    if (goal_ref) {
      const drafts = await amp.query({
        goal_ref,
        kind:  "draft",
        limit: 1,
        sort:  "desc",
      })
      if (drafts.length > 0) {
        initialState.text           = drafts[0].content
        initialState.saved_amp_id   = drafts[0].id
        initialState.restored_at    = new Date().toISOString()
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify(initialState) }],
    }
  }
)
```

### Panel Schema での `initialize` 呼び出し

```json
{
  "$schema": "akari://panel-schema/v0",
  "on_mount": {
    "mcp": {
      "tool": "app.initialize",
      "args": { "goal_ref": "$context.goal_ref" }
    },
    "apply_to_state": true
  }
}
```

`on_mount` は Panel が表示されるたびに呼ばれる。
`apply_to_state: true` により、返り値を `state.*` に自動展開する。

### Full Tier での復元（Zustand）

```typescript
// panels/writer-panel.tsx
import { useEffect } from "react"
import { useAppStore } from "../src/store/app-store"
import { amp } from "@akari/sdk"

export function WriterPanel() {
  const { loadDraft, setDraftText } = useAppStore()

  // Panel マウント時に最新下書きを復元
  useEffect(() => {
    const restoreState = async () => {
      const drafts = await amp.query({
        kind:     "draft",
        goal_ref: "writer-session",
        limit:    1,
        sort:     "desc",
      })
      if (drafts.length > 0) {
        await loadDraft(drafts[0].id)
      }
    }
    restoreState()
  }, [])  // 初回マウント時のみ実行

  // ... rest of component
}
```

### 復元時の注意点

1. **競合状態を避ける**: 復元中に別の handoff が届いた場合は後から来た値を優先する
2. **タイムスタンプで判断**: AMP record の `created_at` を比較して最新を使う
3. **復元失敗は graceful に**: AMP が空でも App は動作する（空の初期状態で起動）

```typescript
async function restoreWithFallback(goalRef: string): Promise<string> {
  try {
    const drafts = await amp.query({ goal_ref: goalRef, kind: "draft", limit: 1, sort: "desc" })
    return drafts[0]?.content ?? ""
  } catch {
    // 復元失敗時は空文字で開始（クラッシュさせない）
    return ""
  }
}
```

---

## state 設計チェックリスト

| チェック項目 | OK | NG |
|---|---|---|
| bytes / 大きな文字列を App state に持っていない | Pool/AMP に保存し ID のみ保持 | `state.image = new Uint8Array(...)` |
| Zustand store に`goal_ref`なしで AMP 操作を呼んでいない | `amp.record({ goal_ref: ... })` | `amp.record({ content: ... })` のみ |
| Ephemeral と Persistent を型で明確に分離している | 型定義で分けている | すべて同じ store に平積み |
| Panel を閉じてから開き直したとき、重要な作業が失われない | AMP から復元される | 復元ロジックなし |
| Derived state を `useEffect` で都度再計算していない | `useMemo` / `computed` を使用 | `useEffect` で setState している |

---

## 関連ドキュメント

- [HUB-024 §6.6 Memory API](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Pool / AMP の API 仕様
- [HUB-025 §6.3 state binding](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Panel Schema の state 宣言規格
- [ADR-007 (Hub)] — Zustand 採用の意思決定記録
- [Cookbook > Cross-over Handoff](./cross-over-handoff.md) — handoff での initial_state 注入
- [Cookbook > Error Handling](./error-handling.md) — state 操作中のエラー処理
