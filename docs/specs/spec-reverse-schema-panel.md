---
spec-id: AKARI-SDK-002
version: 0.1.0
status: implemented
created: 2026-04-22
updated: 2026-04-22
related-specs:
  - AKARI-HUB-008
  - AKARI-HUB-025
  - AKARI-SDK-001
  - AKARI-SDK-003
ai-context: claude-code
---

# AKARI-SDK-002: schema-panel — Panel Schema v0 React Renderer

## 概要

`@akari-os/schema-panel`（パッケージ実体: `packages/schema-panel/`）は、Panel Schema v0（`panel.schema.json`）を React コンポーネントとして描画するレンダラーライブラリ。Shell が MCP-Declarative Tier App の panel をマウントする際に使用する。Full Tier App も `<SchemaPanel>` をインポートして、カスタム React panel 内に Schema 駆動のサブパネルを埋め込むことができる。

---

## パッケージ構成

```
packages/schema-panel/
  src/
    SchemaPanel.tsx         — メインコンポーネント
    WidgetRegistry.ts       — ウィジェット登録マップ
    index.ts                — 公開 API エントリポイント
    types/
      schema.ts             — Panel Schema v0 内部型（schema-panel 固有の拡張型を含む）
      context.ts            — RenderContext + クライアントインターフェース + スタブ
    engine/
      BindingResolver.ts    — Binding 式解決エンジン
      ExpressionEvaluator.ts— JSONLogic ラッパー（visible_when / enabled_when）
      ActionDispatcher.ts   — Action 実行エンジン（MCP 呼び出し / handoff / navigate）
      I18nResolver.ts       — i18n 解決エンジン（{{t:key}} 記法）
    state/
      usePanelState.ts      — Panel ローカル状態管理（Zustand）
    hitl/
      PreviewDialog.tsx     — HITL プレビューダイアログルーター
      TextSummaryPreview.tsx
      ScheduleSummaryPreview.tsx
      DiffPreview.tsx
      CustomMarkdownPreview.tsx
    widgets/                — ウィジェット実装群（Phase 3b 実装中）
      Action/
      Display/
      Documents/
      Structural/
      *.tsx
```

---

## `<SchemaPanel>` コンポーネント

### Props

```tsx
interface SchemaPanelProps {
  schema: PanelSchema;          // panel.schema.json の内容
  context: RenderContext;       // Shell 側から注入する実行時クライアント群
  widgetRegistry?: WidgetRegistry; // カスタムウィジェット登録マップ（省略時は defaultWidgetRegistry）
  className?: string;           // 外部から追加の CSS クラス
}
```

### 使用例

```tsx
import { SchemaPanel } from "@akari-os/schema-panel";

function App() {
  const context = createStubRenderContext("ja");
  return <SchemaPanel schema={notionSchema} context={context} />;
}
```

カスタムウィジェットを追加する場合（Phase 3b 以降）:

```tsx
import { SchemaPanel, defaultWidgetRegistry } from "@akari-os/schema-panel";
const registry = { ...defaultWidgetRegistry, "pool-picker": MyPoolPicker };
<SchemaPanel schema={schema} context={context} widgetRegistry={registry} />
```

---

## RenderContext — Shell から注入するクライアント群

`RenderContext` は Shell から `<SchemaPanel>` に注入されるクライアントの集合体。各クライアントは対応する MCP ツール・App API を抽象化したインターフェース。

| クライアント | 責務 |
|---|---|
| `McpClient` | `call(tool, args)` — MCP ツール呼び出し |
| `PoolClient` | `search(query)` / `get(id)` — Pool アクセス |
| `AmpClient` | `query(input)` / `record(input)` — AMP アクセス |
| `AppClient` | `handoff({ to, intent, payload })` — App 間遷移 |
| `NavigationClient` | `navigate(target)` — Panel 内タブ遷移 |
| `ToastClient` | `success(msg)` / `error(msg)` — トースト通知 |

開発・テスト用に `createStubRenderContext()` が全クライアントのスタブを返す。各クライアントのスタブも個別に export されている（`createStubMcpClient` 等）。

---

## レンダリングパイプライン

`<SchemaPanel>` のレンダリングは以下のステップで行われる:

1. **スキーマ初期化**: `useEffect` で `usePanelState` の Zustand store を schema の default 値で初期化
2. **フィールド評価**: 各 `SchemaField` について `ExpressionEvaluator` で `visible_when` / `enabled_when` を評価
3. **ウィジェット描画**: `WidgetRegistry` から対応する React コンポーネントを取得して render。未登録の type は `UnknownWidgetFallback` を表示
4. **アクション描画**: `SchemaAction` ごとにボタンを生成。HITL 付きアクションは `ActionDispatcher` 経由で `PreviewDialog` を呼び出す
5. **レイアウト適用**: `schema.layout` に基づいて `form` / `tabs` 等のレイアウトコンテナを選択

---

## レイアウト

| `layout` 値 | 実装状態 | 説明 |
|---|:-:|---|
| `"form"` | 実装済み | 縦並びフィールドリスト（デフォルト） |
| `"tabs"` | 実装済み | タブバー + `tab` フィールドで所属タブを指定 |
| `"split"` | TODO (Phase 3b) | 左右 2 ペイン（現状は form フォールバック） |
| `"dashboard"` | TODO (Phase 3b) | グリッドカードレイアウト |
| `"list"` | TODO (Phase 3b) | マスター詳細リスト |

---

## Engine 群

### BindingResolver

`Binding` 式（`mcp.x.post.text`, `pool.<query_id>`, `amp.<kind>.<field>`, `state.<key>`, `const.<value>`）を解釈し、初期値の読み出しと書き込み先のルーティングを行う。

- `parseBinding(expr)` — Binding 式をパースして `ParsedBinding` 型に変換
- `resolveActionArgs(args, fieldValues)` — action の `args` 内の `$<field-id>` 参照を解決

### ExpressionEvaluator

`visible_when` / `enabled_when` の評価を担う JSONLogic ラッパー。

- `isVisible(expr, fieldValues)` — フィールドの表示判定
- `isEnabled(expr, fieldValues)` — フィールドの有効判定

### ActionDispatcher

`SchemaAction` の実行エンジン。対応 Action type:

| type | 動作 |
|---|---|
| `mcp.invoke` | HITL ゲート判定 → MCP ツール呼び出し |
| `handoff` | `AppClient.handoff()` 経由で App 間遷移 |
| `navigate` | `NavigationClient.navigate()` でタブ遷移 |
| `submit` | `mcp.invoke` の簡略形 |

HITL フロー（`hitl.require = true`の場合）:

1. `showHitlPreview` コールバックで `PreviewDialog` を開く
2. ユーザーが承認 → MCP ツール呼び出し実行
3. ユーザーが却下 → キャンセル（ログのみ）

### I18nResolver

フィールドラベル・アクションラベルなどの `{{t:key}}` 記法を解決する。`schema.locales` から locale ディクショナリを参照し、フォールバックロケール（通常 `"en"`）を使う。

---

## HITL Preview — PreviewDialog

`hitl.preview` 値に応じてプレビュー種別を切り替えるルーターコンポーネント。

| `hitl.preview` | コンポーネント | 表示内容 |
|---|---|---|
| `"text-summary"` | `TextSummaryPreview` | テキストフィールドの内容を要約 |
| `"schedule-summary"` | `ScheduleSummaryPreview` | 日時 / 繰り返し設定の概要 |
| `"diff"` | `DiffPreview` | 変更前後の diff |
| `"custom-markdown"` | `CustomMarkdownPreview` | `preview_template` の Markdown を描画（`{{field_id}}` 置換あり） |

---

## 状態管理 — usePanelState

Panel ローカル状態は Zustand store で管理される。`createPanelStore()` で Panel ごとに独立した store を生成し、`useRef` でコンポーネントのライフサイクルに束縛する。

公開フック:

| 関数 | 説明 |
|---|---|
| `createPanelStore()` | Panel ごとの Zustand store を生成 |
| `createStateAccessor(store)` | BindingResolver が使う状態アクセサを生成 |
| `usePanelFieldValues(store)` | 全フィールド値マップを subscribe するフック |
| `usePanelFieldValue(store, id)` | 特定フィールドの値を subscribe するフック |
| `usePanelSetFieldValue(store)` | フィールド値セッター |
| `extractStateBindings(schema)` | `state.*` バインディングを schema から抽出 |

---

## ウィジェット登録マップ

`defaultWidgetRegistry` は `WidgetType → React.FC<WidgetProps>` のマッピング。Phase 3b 実装中のウィジェットは `PlaceholderWidget` で置換される。

未実装ウィジェットは `UnknownWidgetFallback`（黄色破線ボーダー）で表示される。カスタムウィジェットは `widgetRegistry` prop で上書き可能。

---

## 設計上の制約

- Panel Schema v0 は MCP-Declarative Tier App の専用 UI フォーマットだが、Full Tier App からも `<SchemaPanel>` を import して使用できる。
- Action の `mcp` と `handoff` は同一アクション内で排他。両方を指定した場合の動作は未定義。
- `navigate` アクション type は spec 確定待ち（TODO コメント有）。
- `split` / `dashboard` / `list` レイアウトは Phase 3b で実装予定。現状は `form` にフォールバックする。
- `on_success.bind_result` への書き込みは ActionDispatcher ではなく SchemaPanel コンポーネント側で処理する（BindingResolver.write() 経由）。現状はコンソールログのみ。

---

## 参照

- 実装: `packages/schema-panel/src/`
- 関連 spec: AKARI-HUB-025 (Panel Schema v0), AKARI-HUB-008 (Shell API), AKARI-SDK-001
- Panel Schema v0 型定義: [`packages/sdk-types/src/panel-schema.ts`](../../packages/sdk-types/src/panel-schema.ts)
