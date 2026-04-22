---
title: UI API リファレンス
spec-ref: AKARI-HUB-024, AKARI-HUB-025
version: 0.1.0
status: draft
created: 2026-04-19
updated: 2026-04-22
related:
  - HUB-024 (App SDK spec (AKARI-HUB-024, Hub)) — §5.4 UI API
  - HUB-025 (Panel Schema spec (AKARI-HUB-025, Hub)) — Panel Schema v0
---

# UI API リファレンス

> **目的**: App（アプリ）が AKARI Shell の UI surface — Panel、Dialog、Toast、Notification、HITL Preview — を制御するための統一 API リファレンス。
> Full Tier（React Panel）と MCP-Declarative Tier（Panel Schema v0）の両方から呼び出せる。

---

## 1. 概要 — Shell UI surface の統一 API

AKARI では **App が独自ウィンドウを作ることを禁止**している。すべての UI は Shell が管理する surface（パネル・ダイアログ・トースト等）を通じて表示する。これにより：

- レイアウト・配色・配置は Shell が一元管理し、エコシステム全体のトーンが統一される
- App 開発者は UI のレイアウトを考える必要がなく、コンテンツとロジックに集中できる
- ユーザーはどの App を使っても同じ操作感を得られる

```
App コード
    │
    ▼
@akari/sdk → shell.mountPanel() / shell.dialog.show() / shell.toast.*()
    │
    ▼
Shell（WorkspaceHost / Panel Framework）
    │
    ▼
画面に表示
```

### インポート

```typescript
import { shell } from "@akari/sdk"
```

### UI surface の一覧

| surface | 役割 | 主要 API |
|---|---|---|
| **Panel** | WorkspaceHost の各スロットに表示する主要 UI | `shell.mountPanel()` / `shell.mountSchemaPanel()` |
| **Dialog / Modal** | 確認・設定・エラー等のモーダル表示 | `shell.dialog.show()` |
| **Toast** | 短時間の状態通知 | `shell.toast.success()` / `.error()` / `.info()` |
| **Notification** | 持続する通知センター向け通知 | `shell.notification.push()` |
| **HITL Preview** | 不可逆操作の人間承認フロー | `shell.preview.show()` |

---

## 2. Panel

Panel は Shell の `WorkspaceHost` が持つ 4 スロット（toolPalette / editor / inspector / chat）に mount される、App のメイン UI。

### 2.1 `shell.mountPanel()` — Full Tier React Panel のマウント

Full Tier App が任意の React コンポーネントを Shell のパネルレジストリに登録する。

```typescript
shell.mountPanel(options: PanelMountOptions): void
```

#### PanelMountOptions

```typescript
interface PanelMountOptions {
  /** パネルの一意 ID。逆ドメイン記法 + スロット名を推奨。例: "com.x.sender.main" */
  id: string

  /** WorkspaceHost のどのスロットに配置するか */
  defaultPosition: "toolPalette" | "editor" | "inspector" | "chat"

  /** パネルのタイトル（タブ・ツールチップに表示） */
  title: string

  /** アイコン名（Shell のアイコンセットから指定） */
  icon?: string

  /** マウントする React コンポーネント（Full Tier 専用） */
  component: React.ComponentType

  /** 最小幅 (px)。省略時は Shell デフォルト */
  minWidth?: number

  /** デフォルト幅 (px)。省略時は Shell デフォルト */
  defaultWidth?: number

  /** 折りたたみ可能か */
  collapsible?: boolean
}
```

#### 使用例

```typescript
import { shell } from "@akari/sdk"
import { WriterInspector } from "./components/WriterInspector"

// App 初期化時に呼ぶ
shell.mountPanel({
  id: "com.akari.writer.inspector",
  defaultPosition: "inspector",
  title: "Inspector",
  icon: "inspector",
  component: WriterInspector,
  minWidth: 240,
  defaultWidth: 280,
  collapsible: true,
})
```

> **制約**: `component` は純粋な React コンポーネントでなければならない。グローバル DOM 操作、`document.body` への直接アクセスは Certification Lint で検知される。

---

### 2.2 `shell.mountSchemaPanel()` — MCP-Declarative Panel のマウント

MCP-Declarative Tier App が `panel.schema.json`（HUB-025 形式）を Shell に渡し、汎用 Schema レンダラで描画させる。

```typescript
shell.mountSchemaPanel(options: SchemaPanelMountOptions): void
```

#### SchemaPanelMountOptions

```typescript
interface SchemaPanelMountOptions {
  /** パネルの一意 ID */
  id: string

  /** WorkspaceHost のどのスロットに配置するか */
  defaultPosition: "toolPalette" | "editor" | "inspector" | "chat"

  /** パネルのタイトル */
  title: string

  /** Panel Schema v0 オブジェクト（HUB-025 形式）または JSON ファイルパス */
  schema: PanelSchema | string

  /** 折りたたみ可能か */
  collapsible?: boolean
}
```

#### PanelSchema（HUB-025 形式・抜粋）

```typescript
interface PanelSchema {
  /** スキーマバージョン宣言（必須） */
  $schema: "akari://panel-schema/v0"

  /** パネルのタイトル */
  title?: string

  /** レイアウト種別 */
  layout: "form" | "tabs" | "split" | "dashboard" | "list"

  /** フォームフィールド定義 */
  fields: SchemaField[]

  /** アクションボタン定義 */
  actions: SchemaAction[]
}
```

> Widget Catalog（テキスト / 選択 / 日時 / AKARI 固有 / Documents / ファイル / 表示 / 構造 / データ / Action）の詳細は [HUB-025 §6.2](https://github.com/Akari-OS/.github/blob/main/VISION.md) を参照。本リファレンスでは重複を避ける。

#### 使用例

```typescript
import { shell } from "@akari/sdk"
import xSenderSchema from "./panels/x-sender.schema.json"

shell.mountSchemaPanel({
  id: "com.x.sender.main",
  defaultPosition: "editor",
  title: "X Sender",
  schema: xSenderSchema,
})
```

#### `<SchemaPanel>` コンポーネント（Full Tier 内での部分利用）

Full Tier App が React 内で Schema Panel の Widget セットを部分利用したい場合は `<SchemaPanel>` コンポーネントを使う。

```typescript
import { SchemaPanel } from "@akari/sdk/react"

function WriterInspector() {
  return (
    <div>
      {/* カスタム React UI */}
      <MyToneSelector />
      {/* Schema Panel の Widget セットを部分利用 */}
      <SchemaPanel
        schema={schedulerSchema}
        onSubmit={(values) => handleSchedule(values)}
      />
    </div>
  )
}
```

---

### 2.3 Panel 間ナビゲーション

Shell のパネル状態はユーザーが自由にカスタマイズできるため、App 間・パネル間の直接遷移は Shell のナビゲーション API 経由で行う。

#### 別パネルをフォーカス

```typescript
shell.panel.focus(panelId: string): void
```

```typescript
// Inspector パネルをアクティブにする
shell.panel.focus("com.akari.writer.inspector")
```

#### パネルの表示・非表示

```typescript
shell.panel.show(panelId: string): void
shell.panel.hide(panelId: string): void
shell.panel.toggle(panelId: string): void
```

#### パネルイベントの受信

```typescript
// このパネルがアクティブになったとき
shell.onFocus(() => {
  console.log("パネルがフォーカスされた")
})

// このパネルが非表示になったとき
shell.onBlur(() => {
  console.log("パネルがフォーカスを失った")
})

// ユーザーがテキストを選択したとき（Writer 等で有用）
shell.onSelection((selection: TextSelection) => {
  console.log("選択テキスト:", selection.text)
})
```

#### TextSelection 型

```typescript
interface TextSelection {
  /** 選択されたテキスト */
  text: string
  /** 選択範囲の開始位置 */
  start: number
  /** 選択範囲の終了位置 */
  end: number
  /** 選択が行われたパネル ID */
  sourcePanelId: string
}
```

---

## 3. Dialog / Modal

`shell.dialog.show()` は App がモーダルダイアログを表示するための API。Shell がダイアログの表示・非表示・アニメーションを管理する。

```typescript
shell.dialog.show(options: DialogOptions): Promise<DialogResult>
```

#### DialogOptions

```typescript
interface DialogOptions {
  /** ダイアログのタイトル */
  title: string

  /** 本文（文字列 または React コンポーネント） */
  content: string | React.ReactNode

  /** アクションボタンの定義 */
  actions: DialogAction[]

  /**
   * ダイアログのサイズ
   * @default "medium"
   */
  size?: "small" | "medium" | "large" | "fullscreen"

  /**
   * 背景クリックで閉じるか
   * @default true
   */
  dismissable?: boolean
}

interface DialogAction {
  /** ボタンのラベル */
  label: string

  /**
   * ボタンの視覚的な意味
   * @default "secondary"
   */
  kind?: "primary" | "secondary" | "destructive" | "ghost"

  /** このボタンが押されたときに resolve される値 */
  value: string

  /**
   * キーボードショートカット（Enter / Escape）
   */
  shortcut?: "enter" | "escape"
}

interface DialogResult {
  /** 押されたボタンの value。背景クリックで閉じた場合は null */
  action: string | null
}
```

#### 使用例 — 確認ダイアログ

```typescript
const result = await shell.dialog.show({
  title: "下書きを削除しますか？",
  content: "この操作は取り消せません。",
  size: "small",
  actions: [
    { label: "キャンセル", kind: "ghost",       value: "cancel", shortcut: "escape" },
    { label: "削除",       kind: "destructive", value: "delete" },
  ],
})

if (result.action === "delete") {
  await deleteDraft(draftId)
}
```

#### 使用例 — スタイル選択ダイアログ（Writer）

```typescript
const result = await shell.dialog.show({
  title: "文章のスタイルを選択",
  content: (
    <StyleSelector
      options={["カジュアル", "フォーマル", "煽り", "情報", "感情", "ユーモア"]}
      onSelect={(style) => setSelectedStyle(style)}
    />
  ),
  size: "medium",
  actions: [
    { label: "キャンセル", kind: "ghost",   value: "cancel", shortcut: "escape" },
    { label: "適用",       kind: "primary", value: "apply",  shortcut: "enter"  },
  ],
})

if (result.action === "apply") {
  applyStyle(selectedStyle)
}
```

---

## 4. Toast / Notification

### 4.1 Toast — 短時間の状態通知

Toast は画面の端に短時間（デフォルト 3 秒）表示される通知。操作の成否を即座にユーザーに伝えるために使う。

```typescript
shell.toast.success(message: string, options?: ToastOptions): void
shell.toast.error(message: string, options?: ToastOptions): void
shell.toast.info(message: string, options?: ToastOptions): void
shell.toast.warning(message: string, options?: ToastOptions): void
```

#### ToastOptions

```typescript
interface ToastOptions {
  /**
   * 表示時間（ミリ秒）
   * @default 3000
   */
  duration?: number

  /**
   * アクションリンク（"元に戻す" 等）
   */
  action?: {
    label: string
    onClick: () => void
  }

  /**
   * 追加詳細テキスト（折りたたみ可能）
   */
  detail?: string
}
```

#### 使用例

```typescript
// 投稿成功
shell.toast.success("X に投稿しました！")

// エラー（詳細付き）
shell.toast.error("投稿に失敗しました", {
  duration: 5000,
  detail: error.message,
})

// 元に戻すアクション付き
shell.toast.info("下書きを削除しました", {
  action: {
    label: "元に戻す",
    onClick: () => restoreDraft(draftId),
  },
})
```

---

### 4.2 Notification — 持続する通知センター向け通知

Toast と異なり、ユーザーが見逃しても通知センターに残る持続的な通知。外部サービスの非同期処理完了・エラー等に使う。

```typescript
shell.notification.push(options: NotificationOptions): string  // 通知 ID を返す
shell.notification.dismiss(id: string): void
shell.notification.dismissAll(): void
```

#### NotificationOptions

```typescript
interface NotificationOptions {
  /** 通知タイトル */
  title: string

  /** 通知本文 */
  body: string

  /** 通知の種類 */
  kind: "success" | "error" | "info" | "warning"

  /** アクションボタン */
  actions?: Array<{
    label: string
    onClick: () => void
  }>

  /**
   * 自動消去するか
   * @default false（通知センターに残る）
   */
  autoDismiss?: boolean
}
```

#### 使用例

```typescript
// バックグラウンド処理完了の通知
const notificationId = shell.notification.push({
  title: "動画のアップロード完了",
  body: "YouTube に動画がアップロードされました。",
  kind: "success",
  actions: [
    { label: "確認する", onClick: () => openUrl(videoUrl) },
  ],
})

// エラー通知（手動で閉じる必要がある）
shell.notification.push({
  title: "同期エラー",
  body: "Notion との同期に失敗しました。接続を確認してください。",
  kind: "error",
})
```

---

## 5. HITL Preview — 人間承認フロー

HITL（Human-in-the-Loop）Preview は、不可逆な外部操作（投稿・送信・削除・課金等）の前にユーザーに内容を確認させるための承認フロー。

`shell.preview.show()` は Shell が管理する標準の承認ダイアログを表示し、ユーザーが「承認」または「却下」を選ぶまで Promise がペンディングになる。

```typescript
shell.preview.show(options: HITLPreviewOptions): Promise<HITLPreviewResult>
```

#### HITLPreviewOptions

```typescript
interface HITLPreviewOptions {
  /**
   * プレビューの種別（HUB-025 §6.5 に対応）
   * - "text-summary"       : テキスト系フィールドの要約を表示
   * - "schedule-summary"   : 日時・繰り返し条件を表示
   * - "diff"               : before / after 差分（破壊的操作用）
   * - "custom-markdown"    : 任意の Markdown で表示
   */
  type: "text-summary" | "schedule-summary" | "diff" | "custom-markdown"

  /** ダイアログのタイトル */
  title: string

  /**
   * type="text-summary" のとき: 表示するテキスト
   * type="schedule-summary" のとき: { datetime, recurrence? }
   * type="diff" のとき: { before, after }
   * type="custom-markdown" のとき: Markdown 文字列
   */
  template: HITLTemplate

  /** 承認ボタンのラベル */
  approveLabel?: string

  /** 却下ボタンのラベル */
  rejectLabel?: string

  /** 承認時に呼ばれるコールバック（Promise を resolve する前に実行） */
  onApprove?: () => Promise<void> | void

  /** 却下時に呼ばれるコールバック */
  onReject?: () => void
}

type HITLTemplate =
  | { kind: "text-summary";     text: string; charCount?: number; platform?: string }
  | { kind: "schedule-summary"; datetime: Date; recurrence?: string; timezone?: string }
  | { kind: "diff";             before: string; after: string; label?: string }
  | { kind: "custom-markdown";  markdown: string }

interface HITLPreviewResult {
  /** ユーザーの選択 */
  decision: "approved" | "rejected"
}
```

#### 使用例 — X 投稿の確認（X Sender App）

```typescript
import { shell, permission } from "@akari/sdk"

async function postToX(text: string, media?: PoolItem[]) {
  // 1. Permission gate（manifest 宣言確認）
  await permission.gate({
    action: "external-network.post",
    reason: "X に投稿",
    hitl: true,
  })

  // 2. HITL Preview でユーザーに確認
  const { decision } = await shell.preview.show({
    type: "text-summary",
    title: "X に投稿しますか？",
    template: {
      kind: "text-summary",
      text,
      charCount: text.length,
      platform: "X",
    },
    approveLabel: "投稿する",
    rejectLabel: "キャンセル",
    onApprove: async () => {
      // 3. MCP ツール経由で実際に投稿
      await mcpClient.call("x.post", { text, media_ids: media?.map(m => m.id) })
      shell.toast.success("X に投稿しました！")
    },
  })

  if (decision === "rejected") {
    shell.toast.info("投稿をキャンセルしました")
  }
}
```

#### 使用例 — スケジュール予約の確認

```typescript
const { decision } = await shell.preview.show({
  type: "schedule-summary",
  title: "予約投稿を設定しますか？",
  template: {
    kind: "schedule-summary",
    datetime: scheduledAt,
    timezone: "Asia/Tokyo",
  },
  approveLabel: "予約する",
  rejectLabel: "戻る",
})
```

#### 使用例 — 差分確認（破壊的操作）

```typescript
const { decision } = await shell.preview.show({
  type: "diff",
  title: "下書きを上書きしますか？",
  template: {
    kind: "diff",
    before: currentDraft,
    after: newDraft,
    label: "変更内容",
  },
  approveLabel: "上書きする",
  rejectLabel: "キャンセル",
})
```

> **Panel Schema v0 との連携**: `panel.schema.json` の action に `"hitl": { "require": true, "preview": "text-summary" }` を設定すると、Shell が自動的に `shell.preview.show()` を呼ぶ。MCP-Declarative Tier では手動呼び出し不要。詳細は [HUB-025 §6.5](https://github.com/Akari-OS/.github/blob/main/VISION.md) を参照。

---

## 6. Theme — ダーク / ライトモード

```typescript
shell.theme.get(): ThemeInfo
shell.theme.onChange(callback: (theme: ThemeInfo) => void): Unsubscribe
```

#### ThemeInfo

```typescript
interface ThemeInfo {
  /** 現在のカラーモード */
  mode: "dark" | "light"

  /** AKARI のプライマリカラー（CSS カスタムプロパティ名で参照推奨） */
  primaryColor: string

  /** Surface カラー（背景） */
  surfaceColor: string

  /** テキストカラー */
  textColor: string
}

type Unsubscribe = () => void
```

#### 使用例

```typescript
import { shell } from "@akari/sdk"

// 現在のテーマを取得
const theme = shell.theme.get()
console.log(theme.mode) // "dark" | "light"

// テーマ変更を購読（コンポーネント内）
useEffect(() => {
  const unsubscribe = shell.theme.onChange((theme) => {
    setIsDark(theme.mode === "dark")
  })
  return unsubscribe
}, [])
```

> **制約**: App 側から `shell.theme.set()` でテーマを変更することはできない。テーマはユーザーの設定として Shell が一元管理する。CSS カスタムプロパティ（`var(--akari-surface)` 等）を使うことで、Shell Theme の変更に自動追従できる。

---

## 7. i18n — 多言語対応

Shell が現在のロケールを管理し、App は `{{t:key}}` 記法でテキストを外部化する。

```typescript
shell.i18n.resolve(key: string): string
shell.i18n.locale: string               // 読み取り専用
shell.i18n.onLocaleChange(callback: (locale: string) => void): Unsubscribe
```

#### 使用例

```typescript
import { shell } from "@akari/sdk"

// キーを解決してローカライズ済み文字列を取得
const label = shell.i18n.resolve("{{t:post.body}}")
// → "本文"（ja）/ "Post body"（en）

// 現在のロケール
console.log(shell.i18n.locale) // "ja" | "en" | etc.

// ロケール変更を購読
const unsubscribe = shell.i18n.onLocaleChange((locale) => {
  console.log("ロケール変更:", locale)
})
```

#### App の locales ファイル構成

```
my-app/
└── locales/
    ├── ja.json    ← 日本語（必須・デフォルト）
    └── en.json    ← 英語（任意）
```

```json
// locales/ja.json
{
  "post.body": "本文",
  "post.media": "添付ファイル",
  "action.post": "投稿",
  "action.schedule": "予約投稿",
  "action.cancel": "キャンセル"
}
```

```json
// locales/en.json
{
  "post.body": "Post body",
  "post.media": "Attachments",
  "action.post": "Post",
  "action.schedule": "Schedule",
  "action.cancel": "Cancel"
}
```

**フォールバック規則**:
1. 現在のロケールでキーが見つかれば、その値を返す
2. 見つからない場合は英語（`en.json`）にフォールバック
3. 英語でも見つからない場合は **キー文字列をそのまま表示**（開発時に未定義を気づけるよう）

---

## 8. Workspace — 現在のコンテキスト取得

Shell が管理する現在の作業状態（アクティブな Work / パネル / App）を取得する。

```typescript
shell.workspace.current: WorkspaceContext
shell.workspace.onChange(callback: (context: WorkspaceContext) => void): Unsubscribe
```

#### WorkspaceContext

```typescript
interface WorkspaceContext {
  /** 現在開いている Work の情報 */
  work: {
    id: string
    title: string
    appType: "writer" | "video" | "chat" | string
    status: "draft" | "published" | "archived"
  } | null

  /** 現在アクティブなパネルの ID */
  activePanelId: string | null

  /** 現在アクティブな App の ID */
  activeAppId: string

  /** エディタ上部でアクティブなプラットフォームタブ（Writer 等で使用） */
  activePlatform: string | null
}
```

#### 使用例

```typescript
import { shell } from "@akari/sdk"

// 現在の Work 情報を取得
const { work } = shell.workspace.current
if (work) {
  console.log(`現在の Work: ${work.title} (${work.appType})`)
}

// Work 切り替えを購読
const unsubscribe = shell.workspace.onChange(({ work, activePlatform }) => {
  // Writer でプラットフォームタブが切り替わったとき
  if (activePlatform) {
    updatePreviewForPlatform(activePlatform)
  }
})
```

---

## 9. 型定義

### 主要型の一覧

```typescript
// @akari/sdk に含まれる UI 関連の型定義

// Panel
export interface PanelMountOptions { /* §2.1 参照 */ }
export interface SchemaPanelMountOptions { /* §2.2 参照 */ }
export interface PanelSchema { /* HUB-025 参照 */ }
export interface TextSelection { /* §2.3 参照 */ }

// Dialog
export interface DialogOptions { /* §3 参照 */ }
export interface DialogAction { /* §3 参照 */ }
export interface DialogResult { /* §3 参照 */ }

// Toast
export interface ToastOptions { /* §4.1 参照 */ }

// Notification
export interface NotificationOptions { /* §4.2 参照 */ }

// HITL Preview
export interface HITLPreviewOptions { /* §5 参照 */ }
export type HITLTemplate = /* §5 参照 */
  | { kind: "text-summary";     text: string; charCount?: number; platform?: string }
  | { kind: "schedule-summary"; datetime: Date; recurrence?: string; timezone?: string }
  | { kind: "diff";             before: string; after: string; label?: string }
  | { kind: "custom-markdown";  markdown: string }
export interface HITLPreviewResult { decision: "approved" | "rejected" }

// Theme
export interface ThemeInfo { mode: "dark" | "light"; primaryColor: string; surfaceColor: string; textColor: string }

// Workspace
export interface WorkspaceContext { /* §8 参照 */ }

// 共通
export type Unsubscribe = () => void
```

### `shell` オブジェクトのインターフェース

```typescript
export interface Shell {
  // Panel
  mountPanel(options: PanelMountOptions): void
  mountSchemaPanel(options: SchemaPanelMountOptions): void
  panel: {
    focus(id: string): void
    show(id: string): void
    hide(id: string): void
    toggle(id: string): void
  }

  // Panel Events
  onFocus(callback: () => void): Unsubscribe
  onBlur(callback: () => void): Unsubscribe
  onSelection(callback: (selection: TextSelection) => void): Unsubscribe

  // Dialog
  dialog: {
    show(options: DialogOptions): Promise<DialogResult>
  }

  // Toast
  toast: {
    success(message: string, options?: ToastOptions): void
    error(message: string, options?: ToastOptions): void
    info(message: string, options?: ToastOptions): void
    warning(message: string, options?: ToastOptions): void
  }

  // Notification
  notification: {
    push(options: NotificationOptions): string
    dismiss(id: string): void
    dismissAll(): void
  }

  // HITL Preview
  preview: {
    show(options: HITLPreviewOptions): Promise<HITLPreviewResult>
  }

  // Theme
  theme: {
    get(): ThemeInfo
    onChange(callback: (theme: ThemeInfo) => void): Unsubscribe
  }

  // i18n
  i18n: {
    resolve(key: string): string
    locale: string
    onLocaleChange(callback: (locale: string) => void): Unsubscribe
  }

  // Workspace
  workspace: {
    current: WorkspaceContext
    onChange(callback: (context: WorkspaceContext) => void): Unsubscribe
  }
}
```

---

## 10. 使用例

### 10.1 X Sender App — 投稿確認 HITL フロー

MCP-Declarative Tier App として X への投稿フローを実装した例。

```typescript
// panels/x-sender-panel.ts（MCP-Declarative App では通常 JSON で完結するが、
// Full Tier で同等のフローを書く場合の例）
import { shell, permission } from "@akari/sdk"

interface PostOptions {
  text: string
  mediaIds?: string[]
  scheduledAt?: Date
}

export async function executePost(options: PostOptions) {
  const { text, mediaIds, scheduledAt } = options

  // Step 1: Permission gate（外部ネットワーク投稿の承認）
  await permission.gate({
    action: "external-network.post",
    reason: "X に投稿します",
    hitl: true,
  })

  // Step 2: HITL Preview — 投稿内容の確認
  let previewType: HITLPreviewOptions["type"]
  let template: HITLTemplate

  if (scheduledAt) {
    previewType = "schedule-summary"
    template = {
      kind: "schedule-summary",
      datetime: scheduledAt,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  } else {
    previewType = "text-summary"
    template = {
      kind: "text-summary",
      text,
      charCount: text.length,
      platform: "X",
    }
  }

  const { decision } = await shell.preview.show({
    type: previewType,
    title: scheduledAt ? "X に予約投稿しますか？" : "X に投稿しますか？",
    template,
    approveLabel: scheduledAt ? "予約する" : "投稿する",
    rejectLabel: "キャンセル",
    onApprove: async () => {
      try {
        if (scheduledAt) {
          await mcpClient.call("x.schedule", { text, media_ids: mediaIds, when: scheduledAt })
          shell.toast.success(`${scheduledAt.toLocaleString()} に予約しました`)
        } else {
          const result = await mcpClient.call("x.post", { text, media_ids: mediaIds })
          shell.toast.success("X に投稿しました！", {
            action: {
              label: "確認する",
              onClick: () => shell.panel.focus("com.x.sender.main"),
            },
          })
        }
      } catch (error) {
        shell.toast.error("投稿に失敗しました", {
          duration: 6000,
          detail: (error as Error).message,
        })
      }
    },
  })

  if (decision === "rejected") {
    shell.toast.info("投稿をキャンセルしました")
  }
}
```

---

### 10.2 Writer App — スタイル選択ダイアログ

Full Tier App として、Writer がスタイル選択のカスタムダイアログを表示する例。

```typescript
// components/StyleSelectorDialog.tsx
import React, { useState } from "react"
import { shell } from "@akari/sdk"

type TonePreset =
  | "casual"
  | "formal"
  | "provocative"
  | "informative"
  | "emotional"
  | "humorous"

const TONE_LABELS: Record<TonePreset, string> = {
  casual:      "カジュアル",
  formal:      "フォーマル",
  provocative: "煽り・インパクト",
  informative: "情報提供",
  emotional:   "感情・共感",
  humorous:    "ユーモア",
}

// ダイアログを表示してユーザーが選んだスタイルを返す
export async function showStyleSelectorDialog(): Promise<TonePreset | null> {
  let selected: TonePreset = "casual"

  const StyleSelectorContent = () => {
    const [active, setActive] = useState<TonePreset>("casual")

    // 選択が変わるたびにクロージャの変数に反映
    const handleSelect = (tone: TonePreset) => {
      setActive(tone)
      selected = tone
    }

    return (
      <div className="flex flex-wrap gap-2 p-2">
        {(Object.keys(TONE_LABELS) as TonePreset[]).map((tone) => (
          <button
            key={tone}
            onClick={() => handleSelect(tone)}
            className={`px-3 py-1 rounded-full text-sm border ${
              active === tone
                ? "bg-white text-black border-white"
                : "text-neutral-300 border-neutral-600"
            }`}
          >
            {TONE_LABELS[tone]}
          </button>
        ))}
      </div>
    )
  }

  const result = await shell.dialog.show({
    title: "文章のスタイルを選択",
    content: <StyleSelectorContent />,
    size: "medium",
    actions: [
      { label: "キャンセル", kind: "ghost",   value: "cancel", shortcut: "escape" },
      { label: "適用",       kind: "primary", value: "apply",  shortcut: "enter"  },
    ],
  })

  if (result.action === "apply") {
    shell.toast.success(`スタイルを「${TONE_LABELS[selected]}」に設定しました`)
    return selected
  }

  return null
}
```

```typescript
// 呼び出し側（WriterInspector.tsx）
import { showStyleSelectorDialog } from "./StyleSelectorDialog"

async function handleStyleButtonClick() {
  const tone = await showStyleSelectorDialog()
  if (tone) {
    applyToneToEditor(tone)
  }
}
```

---

## 11. 関連

### Permission API との連携

UI で承認フローが必要な操作は必ず `permission.gate()` を UI API の前に呼ぶ。
`hitl: true` を指定した場合、Shell が HITL 承認 UI を自動で表示する（`shell.preview.show()` と組み合わせることで二重確認フローを構成できる）。

詳細は **Permission API リファレンス**（[api-reference/permission-api.md](./permission-api.md)）を参照。

### SchemaPanel レンダラ（リファレンス実装）

MCP-Declarative App が使う汎用 Schema レンダラの実装仕様および Widget Catalog は [HUB-025](https://github.com/Akari-OS/.github/blob/main/VISION.md) を参照。`shell.mountSchemaPanel()` はこのレンダラを内部で使う。

Full Tier App が `<SchemaPanel>` を部分利用する方法は §2.2 を参照。

### 関連 spec

| spec | 内容 |
|---|---|
| [AKARI-HUB-024](https://github.com/Akari-OS/.github/blob/main/VISION.md) | App SDK — UI API の仕様元（§6.6 (4)） |
| [AKARI-HUB-025](https://github.com/Akari-OS/.github/blob/main/VISION.md) | Panel Schema v0 — Widget Catalog / Binding / HITL |
| Shell Panel Framework (internal spec) | Shell Panel Framework — PanelRegistry / LayoutEngine |
| Shell Workspace UI (internal spec) | Shell Workspace UI — WorkspaceHost / 4 スロット |
