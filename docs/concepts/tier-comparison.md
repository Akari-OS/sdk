---
title: Tier Comparison — Full vs MCP-Declarative
updated: 2026-04-19
related: [HUB-024, HUB-025, HUB-005]
---

# Tier Comparison — Full vs MCP-Declarative / Choosing Your Tier

> Module には 2 つの Tier がある。どちらを選ぶかは「参入コストと UI 表現力のトレードオフ」。
> iOS でいう **Full App ⇔ App Clips** の関係（別種ではなく、重さの違い）。

---

## 1 分でわかる比較表 / Quick Comparison

| | **Full Tier** | **MCP-Declarative Tier** |
|---|---|---|
| **開発者が書くもの** | `akari.toml` + React Panel + Agent + Skill 実装 | `akari.toml` + MCP サーバー + `panel.schema.json` |
| **UI の自由度** | 高（任意の React component） | 中（Shell 汎用 Widget で描画） |
| **参入コスト** | 高 | **低** |
| **Certification** | Automated Lint + Contract Test + **Manual Review** | Automated Lint + Contract Test のみ |
| **マーケット掲載** | Manual Review 必須 | **schema + MCP 宣言の審査のみ** |
| **典型ユースケース** | Writer / Video / Pool Picker（リッチ編集 UX） | X Sender / Notion / DeepL（外部サービス連携） |

---

## 詳細比較 / Detailed Comparison

### 書くもの / What You Write

**Full Tier**:

```
my-module/
├── akari.toml              ← Manifest
├── panels/
│   └── writer.tsx          ← 任意の React component（⚠️ 自由）
├── agents/
│   └── editor.md           ← Module 固有エージェント定義
├── skills/
│   └── generate_draft.ts   ← 他 Module に公開する関数
└── src/                    ← ビジネスロジック
```

**MCP-Declarative Tier**:

```
my-module/
├── akari.toml              ← Manifest（tier = "mcp-declarative"）
├── mcp-server/
│   └── index.ts            ← MCP サーバーのみ（React なし）
├── panels/
│   └── main.schema.json    ← JSON で UI を宣言（コードなし）
└── locales/
    ├── ja.json
    └── en.json
```

---

### UI の作り方 / How UI is Built

**Full Tier** — React component を直接書く：

```tsx
// panels/writer.tsx（任意のコンポーネント）
import { shell } from "@akari/sdk"

export function WriterPanel() {
  const [content, setContent] = useState("")

  return (
    <div className="p-4">
      <RichTextEditor value={content} onChange={setContent} />
      <MyCustomToolbar />
      {/* 完全に自由なレイアウト */}
    </div>
  )
}
```

**MCP-Declarative Tier** — JSON で宣言：

```json
// panels/main.schema.json
{
  "$schema": "akari://panel-schema/v0",
  "layout": "form",
  "fields": [
    { "id": "text", "type": "textarea", "maxLength": 280,
      "bind": "mcp.x.post.text", "required": true },
    { "id": "media", "type": "pool-picker", "accept": ["image", "video"] }
  ],
  "actions": [
    { "id": "post", "label": "投稿", "kind": "primary",
      "mcp": { "tool": "x.post", "args": { "text": "$text" } },
      "hitl": { "require": true, "preview": "text-summary" } }
  ]
}
```

Shell が `panel.schema.json` を受け取り、汎用 Schema レンダラで自動描画する。

---

### Certification の違い / Certification Differences

| 層 | Full | MCP-Declarative |
|---|:-:|:-:|
| **Automated Lint** | ✅ 必須 | ✅ 必須 |
| **Contract Test** | ✅ 必須 | ✅ 必須 |
| **Manual Review（マーケット掲載時）** | ✅ 必須（React コードの審査） | ⭕ 軽め（schema + MCP 宣言の確認のみ） |

MCP-Declarative が軽い理由：UI が JSON Schema で宣言されており、Shell のレンダラが描画するため、
悪意ある UI コードを埋め込む余地がない。審査は Permission / OAuth スコープの妥当性確認に絞られる。

---

## 選び方フローチャート / Decision Flowchart

```
AKARI に載せたいものは何か？
│
├── 外部サービス（SNS / ドキュメント / 翻訳 / 検索 等）
│     ↓
│   その API は MCP 化できるか？
│     ├── YES → [MCP-Declarative Tier を選ぶ] ← ほぼこちら
│     └── NO  → Full Tier（ただし MCP 化を先に検討）
│
├── リッチな編集 UI が必要（ドラッグ操作・カスタムエディタ等）
│     ↓
│   投稿フォーム / 設定画面 で十分か？
│     ├── YES → [MCP-Declarative Tier で始める]
│     └── NO  → [Full Tier]
│
└── AKARI 公式のような高度なアプリを作りたい（Video / Writer 相当）
      ↓
      [Full Tier]
```

**迷ったら MCP-Declarative から始める**ことを強く推奨する。
後から Full に昇格できるが（`tier = "full"` に変更し Panel を React 化）、
逆（Full → MCP-Declarative）は行わない（理由: Full の UI 自由度を手放す合理性が薄い）。

---

## 典型ユースケース / Typical Use Cases

### MCP-Declarative Tier が向いているもの

**Publishing カテゴリ**（テキスト + 添付 + 予約 の UI で十分）:
- X (Twitter) / Threads / Bluesky / Mastodon / Note / LINE

**Documents カテゴリ**（フォーム + テーブル表示 + ブロック操作）:
- Notion / Google Workspace / Microsoft 365 / Airtable / Coda

**Asset Generation**（プロンプト入力 → 生成 → Pool 保存）:
- DALL-E / ElevenLabs / Runway / Stable Diffusion

**Research / Translation / Analytics**（入力 → 実行 → 結果表示）:
- Perplexity / DeepL / Google Analytics / Mixpanel

既存の API や MCP サーバーが**ある場合はゼロコスト**に近い。
実際、多くの外部サービスが公式 MCP を提供し始めており、
`[mcp] server = "npm:<official-mcp>"` の 1 行で完結するケースが増えている。

### Full Tier が必要なもの

- **カスタムエディタ**: リッチテキスト編集、画像上のアノテーション、タイムライン編集
- **複雑なデータ可視化**: D3.js 等のカスタムチャート
- **カスタムショートカット**: アプリ固有のキーボードショートカット
- **モーション・トランジション**: Panel 固有のアニメーション
- **外部 React ライブラリ**: 専用の React component を直接使いたい場合

---

## MCP-Declarative の標準 Widget / Available Widgets

MCP-Declarative で利用できる `panel.schema.json` の Widget 一覧（HUB-025 §6.2）：

| カテゴリ | Widget | 用途 |
|---|---|---|
| テキスト入力 | `text` / `textarea` / `password` / `email` / `url` | 1 行・複数行・機密・検証付き |
| 数値 | `number` / `slider` / `stepper` | 数値入力 |
| 選択 | `select` / `multi-select` / `radio` / `checkbox` / `toggle` | 列挙値の選択 |
| 日時 | `date` / `time` / `datetime` / `datetime-optional` / `duration` | 日付・時刻・期間 |
| **AKARI 固有** | **`pool-picker`** / `amp-query` / `module-picker` / `agent-picker` | Pool 素材選択 / AMP 検索 |
| Documents 系 | `rich-text-editor` / `doc-outline-tree` / `sheet-row-picker` / `cell-range-picker` | Office 系 UI |
| ファイル | `file-upload` / `image-preview` / `video-preview` | 添付・プレビュー |
| 表示 | `markdown` / `badge` / `stat` / `progress` | 静的コンテンツ |
| 構造 | `tabs` / `accordion` / `split` / `repeater` | レイアウト |
| データ | `table` / `list` / `card-grid` | コレクション表示 |

この Widget セットで UI が表現できない場合のみ Full Tier を検討する。

---

## マイグレーション: MCP-Declarative → Full / Upgrading Tiers

MCP-Declarative で始めた Module を Full に昇格させる手順：

```toml
# akari.toml の変更
[module]
tier = "full"   # "mcp-declarative" → "full" に変更
```

```tsx
// panels/ に React component を追加
// panels/main.tsx
import { SchemaPanel } from "@akari/sdk/react"  // ← 既存 schema を部品として使える
import { MyCustomComponent } from "./MyCustomComponent"

export function MainPanel() {
  return (
    <div>
      <MyCustomComponent />               {/* ← 新しい自由な部分 */}
      <SchemaPanel schema={formSchema} /> {/* ← 既存 schema を再利用 */}
    </div>
  )
}
```

Full Tier でも `<SchemaPanel>` を使って既存の schema を部品として再利用できる。
React 化は差分だけ行えばよい。

---

## 参考実装 / Reference Implementations

| Module | Tier | ガイド |
|---|---|---|
| X Sender（Publishing） | MCP-Declarative | [HUB-007](../examples/x-sender/) |
| Notion（Documents） | MCP-Declarative | [HUB-026](../examples/notion/) |
| Writer（AKARI 公式） | Full | (internal spec) |

---

## 関連ドキュメント / Related Docs

- [Getting Started](../getting-started.md) — MCP-Declarative でミニ Module を動かす
- [Module Lifecycle](./module-lifecycle.md) — install から uninstall まで
- [Architecture Map](./architecture-map.md) — SDK と Core の通信フロー
- [HUB-024 §6.2](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Tier の正式仕様
- [HUB-025 §6.2](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Widget Catalog 完全版
