# Notion — 読み方ガイド（HUB-026）

> **対象 spec**: `spec-app-notion-reference.md (AKARI-HUB-026, Hub)`（AKARI-HUB-026 v0.1.0）
> **Panel Schema**: `notion-app-panel.schema.json (Hub)`
> **Tier**: MCP-Declarative
> **カテゴリ**: Documents
> **公式 MCP**: ✅ `@notionhq/mcp`（Notion 社公式）
> **位置づけ**: HUB-005 v0.2 Documents カテゴリ Tasks T-2e の**リファレンス実装**。
> 公式 MCP を活用した省コスト実装のパターンと、Documents カテゴリ固有の設計を示す。

---

## 1. App 概要

Notion App は **Notion workspace の操作全般**を担当する Documents App。

```
com.akari.notion
  ├── akari.toml                                    ← tier = "mcp-declarative", category = "documents"
  ├── (MCP サーバーは @notionhq/mcp を npm 参照)    ← 自前実装なし
  ├── panels/notion-main.schema.json                ← 検索・ページ作成フォーム
  ├── panels/notion-database.schema.json            ← DB クエリ・一覧表示
  └── panels/notion-settings.schema.json            ← OAuth 設定
```

**最大の特徴**: MCP サーバーを自前で書かず、`server = "npm:@notionhq/mcp"` と宣言するだけで
Notion 社公式の MCP サーバーを利用する。
AKARI 側の実装は Manifest 宣言と Panel Schema の JSON だけに絞られる。

HUB-007（X Sender）が「自前 MCP サーバーを書く場合」のパターンなのに対して、
HUB-026（Notion）は「公式 MCP を活用する場合」のパターンを示す。
ADR-002 MCP-First Adapter Strategy の「公式 MCP を優先する」判断がここに現れている。

### X Sender との比較

| 項目 | X Sender (HUB-007) | Notion (HUB-026) |
|---|---|---|
| カテゴリ | Publishing | Documents |
| MCP サーバー | 自前実装 (`mcp-servers/x/`) | 公式 (`npm:@notionhq/mcp`) |
| ツール数 | 4 個（Phase 0） | 10 個 |
| Panel 枚数 | 1 枚（シンプルなフォーム） | 4 タブ（複雑な UI） |
| HITL パターン | 1 種類（custom-markdown） | 4 種類（text-summary / diff / custom-markdown） |
| Cross-over | Writer → X Sender（1 方向） | Writer / Research / Pool（3 方向） |
| オフライン挙動 | 下書きを Pool に保存 | キャッシュ + 書き込みキュー |

---

## 2. `akari.toml` の読みどころ

spec §4 から引用する。

```toml
[app]
id       = "com.akari.notion"
name     = "Notion"
version  = "0.1.0"
tier     = "mcp-declarative"
category = "documents"         # ← X Sender の "publishing" から変わる点
sdk      = ">=0.1.0 <1.0"

[mcp]
# 公式 Notion MCP サーバーを npm パッケージとして参照（ADR-002 公式優先）
server = "npm:@notionhq/mcp"  # ← これだけで公式 MCP が使える
tools  = [
  "notion.search",
  "notion.query_database",
  "notion.create_page",
  "notion.update_page_properties",
  "notion.append_block_children",
  "notion.retrieve_page",
  "notion.retrieve_database",
  "notion.list_users",
  "notion.retrieve_block_children",
  "notion.delete_block",
]

[panels]
main     = { title = "Notion",          schema = "panels/notion-main.schema.json" }
database = { title = "Database View",   schema = "panels/notion-database.schema.json" }
settings = { title = "Notion Settings", schema = "panels/notion-settings.schema.json" }

[permissions]
external-network = ["api.notion.com"]
oauth            = ["notion.com"]
keychain         = ["com.akari.notion"]
pool             = ["read", "write"]
amp              = ["read", "write"]   # ← amp が "read" も要求（handoff 受信で AMP を読む）

[oauth.notion]
provider      = "notion.com"
grant_type    = "authorization_code"
pkce          = true
scope         = ["read_content", "update_content", "insert_content"]
token_storage = "keychain:com.akari.notion"
```

### 読みどころ 1 — `server = "npm:@notionhq/mcp"`

`npm:` プレフィックスで npm パッケージをそのまま MCP サーバーとして参照できる。
インストール・起動は AKARI Core が自動で処理する。
自前実装が不要な分、保守コストが大幅に下がる。

デメリット: 公式 MCP のアップデートで tool の引数が変わった場合、
Panel Schema の `bind` との整合が崩れる可能性がある。
`akari app certify` のContract Test がこれを定期的に検出する（CI で回す）。

### 読みどころ 2 — `tools` に 10 個宣言

X Sender の 4 ツールと比べて大幅に増える。
`tools` 宣言に含まれていない tool は、Panel Schema から `bind` を使っても呼び出せない。
セキュリティの境界として機能する。

### 読みどころ 3 — `amp = ["read", "write"]`

X Sender の `amp = ["write"]`（書き込み専用）と違い、Notion App は `read` も要求する。
Research → Notion handoff で `records: [<amp_record_id>, ...]` を受け取り、
その AMP record の内容を読み取って Notion database に書き込むため。
handoff の受け取り側は AMP を読む権限が必要になる。

### 読みどころ 4 — `[oauth.notion]` ブロック

X Sender の `[permissions].oauth = ["x.com"]` という簡素な宣言と比べて、
Notion は専用の `[oauth.notion]` ブロックで詳細な OAuth 設定を記述している。
`scope` に `read_content`, `update_content`, `insert_content` を宣言することで、
Notion の OAuth 認証ページでユーザーが許可する権限の範囲が明示される。

---

## 3. MCP ツール 10 個の読みどころ

spec §5 のツール一覧を読む。

### ツール一覧と HITL 設定

| # | Tool 名 | 役割 | HITL 必須 | 操作種別 |
|---|---|---|:-:|---|
| 1 | `notion.search` | workspace をテキスト検索 | — | 読み取り |
| 2 | `notion.query_database` | フィルタ・ソートでエントリ取得 | — | 読み取り |
| 3 | `notion.create_page` | 新規ページ・database エントリ作成 | ✅ | 書き込み（新規） |
| 4 | `notion.update_page_properties` | プロパティ更新（タイトル・ステータス等） | ✅ | 書き込み（変更） |
| 5 | `notion.append_block_children` | 既存ページの末尾にブロック追記 | ✅ | 書き込み（追加） |
| 6 | `notion.retrieve_page` | ページのメタデータ・プロパティ取得 | — | 読み取り |
| 7 | `notion.retrieve_database` | database のスキーマ取得 | — | 読み取り |
| 8 | `notion.list_users` | workspace のメンバー一覧取得 | — | 読み取り |
| 9 | `notion.retrieve_block_children` | ブロックの子要素取得 | — | 読み取り |
| 10 | `notion.delete_block` | ブロック削除（アーカイブ） | ✅ | 書き込み（削除） |

**HITL 必須の基準**: HUB-005 §6.5 に従い「共有 doc の上書き / 削除 / 外部公開設定変更」はすべて HITL gate 必須。
ツール 3/4/5 はコンテンツの変更、ツール 10 は削除なのでそれぞれ `hitl.require: true`。
読み取り系（1/2/6/7/8/9）は HITL 不要。

### 読み取り系ツールを Panel で使うパターン

読み取り系ツールはアクションではなく **フィールドの `options_source`** として使われる。

```json
{
  "id":             "db_id",
  "type":           "select",
  "options_source": "mcp.notion.list_databases"
}
```

`options_source: "mcp.notion.list_databases"` と書くと、
セレクトボックスの選択肢が Notion workspace の database 一覧で自動的に埋まる。
ユーザーが database ID を手で入力する必要はない。

これは Panel Schema の強力な機能の一つ。
MCP tool の返り値を別フィールドの選択肢として使える。

---

## 4. Panel Schema 4 タブの読みどころ

Panel Schema のファイルは `notion-app-panel.schema.json (Hub)`。
`layout: "tabs"` で 4 タブ構成になっている点が X Sender の `layout: "form"` と大きく異なる。

```json
{
  "$schema": "akari://panel-schema/v0",
  "title":  "{{t:app.title}}",
  "layout": "tabs",
  "tabs": [
    { "id": "db-query",    "label": "{{t:tab.db_query}}" },
    { "id": "page-editor", "label": "{{t:tab.page_editor}}" },
    { "id": "pool-export", "label": "{{t:tab.pool_export}}" },
    { "id": "pool-import", "label": "{{t:tab.pool_import}}" }
  ],
  "fields":  [...],  // 各フィールドに "tab": "<tab-id>" で所属タブを指定
  "actions": [...]   // 各アクションに "tab": "<tab-id>" で所属タブを指定
}
```

### タブ 1 — `db-query`（Database Query Panel）

**役割**: Notion database に対してフィルタ・ソートを掛けてクエリし、結果を表に表示する。

重要なフィールドと設計:

```json
{
  "id":             "db_id",
  "type":           "select",
  "options_source": "mcp.notion.list_databases"
}
```

`db_id` を選択すると、その database のプロパティを取得して後続のフィルタ・ソートの選択肢に使う。
`options_source_args: { "database_id": "$db_id" }` という依存フィールドパターンがある。

```json
{
  "id":                  "db_filter_property",
  "options_source":      "mcp.notion.get_database_properties",
  "options_source_args": { "database_id": "$db_id" },
  "visible_when":        "$db_id != null"
}
```

`visible_when: "$db_id != null"` — `db_id` が選択されるまでこのフィールドは非表示。
段階的な UI の展開（ウィザード的な操作感）を `visible_when` で実現している。

フィルタ演算子の種別:

```json
"options": [
  { "value": "equals",       "label": "{{t:op.equals}}" },
  { "value": "contains",     "label": "{{t:op.contains}}" },
  { "value": "starts_with",  "label": "{{t:op.starts_with}}" },
  { "value": "is_empty",     "label": "{{t:op.is_empty}}" },
  { "value": "is_not_empty", "label": "{{t:op.is_not_empty}}" },
  { "value": "greater_than", "label": "{{t:op.greater_than}}" },
  { "value": "less_than",    "label": "{{t:op.less_than}}" }
]
```

`is_empty` / `is_not_empty` を選んだ場合は値入力フィールドが不要なので、
`visible_when: "$db_filter_operator != 'is_empty' && $db_filter_operator != 'is_not_empty'"` で非表示にする。

クエリ実行アクション:

```json
{
  "id": "run_query",
  "mcp": {
    "tool": "notion.query_database",
    "args": {
      "database_id": "$db_id",
      "filter": {
        "property": "$db_filter_property",
        "operator": "$db_filter_operator",
        "value":    "$db_filter_value"
      },
      "sorts": [
        { "property": "$db_sort_property", "direction": "$db_sort_direction" }
      ],
      "page_size": "$db_page_size"
    }
  },
  "on_success": { "bind_result": "state.db_results" }
}
```

`on_success.bind_result: "state.db_results"` — クエリ結果をフィールドの `state.db_results` に格納し、
`table` widget の `bind: "state.db_results"` が自動でテーブル描画を更新する。

### タブ 2 — `page-editor`（Page Editor Panel）

**役割**: 既存ページへのブロック追記、または新規ページ作成の 2 モードを切り替えられる編集フォーム。

モード切り替えの仕組み:

```json
{
  "id":      "page_source_mode",
  "type":    "radio",
  "default": "existing",
  "options": [
    { "value": "existing", "label": "{{t:page.source_existing}}" },
    { "value": "new",      "label": "{{t:page.source_new}}" }
  ]
}
```

`page_source_mode` が `"existing"` か `"new"` かで、後続のフィールドとアクションが切り替わる。
各フィールドの `visible_when` がこれに対応している:

```json
{ "visible_when": "$page_source_mode == 'existing'" }  // 既存ページ選択系
{ "visible_when": "$page_source_mode == 'new'" }       // 新規作成系
```

アクションも同様:

```json
{ "id": "save_page_blocks", "visible_when": "$page_source_mode == 'existing'" }
{ "id": "create_new_page",  "visible_when": "$page_source_mode == 'new'" }
```

**`doc-outline-tree` widget**:

```json
{
  "id":          "page_outline",
  "type":        "doc-outline-tree",
  "source":      "mcp.notion.get_page_blocks",
  "source_args": { "page_id": "$page_picker" },
  "visible_when": "$page_source_mode == 'existing' && $page_picker != null"
}
```

`doc-outline-tree` は Documents カテゴリ固有の widget。
Notion ページのブロック構造をツリー表示し、見出しをドラッグ＆ドロップで並び替えられる。
`source` に MCP tool を指定することで、選択したページのブロックが自動ロードされる。

**`rich-text-editor` widget**:

```json
{
  "id":      "page_body",
  "type":    "rich-text-editor",
  "bind":    "mcp.notion.append_block_children.children",
  "toolbar": ["bold", "italic", "heading", "bullet-list", "numbered-list", "code", "link"]
}
```

`rich-text-editor` は SNS フォームの `textarea` と違い、Notion のブロック構造に対応したリッチエディタ。
ツールバーの機能が `toolbar` 配列で宣言的に指定できる。

**Writer への逆方向 handoff**:

```json
{
  "id":   "handoff_to_writer",
  "type": "handoff",
  "handoff": {
    "to":     "com.akari.writer",
    "intent": "edit-from-notion-page",
    "payload": {
      "notion_page_ref": "$page_picker",
      "draft_content":   "$page_body"
    }
  }
}
```

Notion から Writer への逆方向 handoff も実装されている。
「Notion でページを選択 → Writer で本格的な編集 → 保存して Notion に戻す」という往復フローが可能。

### タブ 3 — `pool-export`（Pool → Notion Panel）

**役割**: Pool に保存された素材（テキスト・画像・ドキュメント等）を Notion ページとして書き出す。

```json
{
  "id":     "export_pool_items",
  "type":   "pool-picker",
  "accept": ["text", "markdown", "image", "document"],
  "max":    20
}
```

X Sender の `pool-picker` が `accept: ["image", "video"]`（メディア選択）だったのに対して、
こちらは `accept: ["text", "markdown", "image", "document"]`（汎用コンテンツ選択）。
`max: 20` で複数素材をまとめて書き出せる（X Sender の `max: 4` より大幅に増える）。

タイトル生成オプション:

```json
{
  "id":   "export_title_field",
  "type": "select",
  "options": [
    { "value": "pool_name", "label": "{{t:export.title_from_name}}" },
    { "value": "pool_tag",  "label": "{{t:export.title_from_tag}}" },
    { "value": "custom",    "label": "{{t:export.title_custom}}" }
  ],
  "default": "pool_name"
}
```

Pool 素材名・Pool タグ・カスタムタイトルの 3 通りからページタイトルの元を選べる。
`export_title_field == 'custom'` のときだけカスタムタイトル入力フィールドが表示される（`visible_when` で制御）。

エクスポートプレビュー:

```json
{
  "id":           "export_preview",
  "type":         "markdown",
  "bind":         "state.export_preview_md",
  "visible_when": "$export_pool_items != null && $export_target_db != null"
}
```

「プレビュー」ボタンを押すと MCP tool が Notion ページのプレビューを生成し、
`state.export_preview_md` に格納。
`markdown` widget がそのまま表示する。
これにより、Notion に書き出す前に内容を確認できる。

### タブ 4 — `pool-import`（Notion → Pool Panel）

**役割**: Notion database のエントリを Pool 素材として取り込む（逆方向の同期）。

```json
{
  "id":     "import_source_db",
  "type":   "select",
  "bind":   "mcp.notion.query_database.database_id",
  "options_source": "mcp.notion.list_databases"
}
```

インポート元の database をセレクトボックスで選択。
フィルタはステータス（`Not started` / `In progress` / `Done`）で絞り込める。

本文インポートのトグル:

```json
{
  "id":      "import_include_body",
  "type":    "toggle",
  "default": false,
  "helperText": "{{t:import.include_body_helper}}"
}
```

`default: false` — デフォルトはタイトルとメタデータのみ取り込み。
本文テキストまで取り込む場合は toggle を ON にする。
本文取り込みは API 呼び出し数が増えるため（各ページのブロックを取得）、オプション扱いにしている。

---

## 5. HITL ポリシーの読みどころ（Documents カテゴリ固有）

spec §7 を読む。X Sender との HITL 設計の違いが最も明確に現れるセクション。

### Preview 種別の使い分け

| アクション | preview 種別 | 表示内容 |
|---|---|---|
| `notion.create_page`（新規作成） | `text-summary` | 作成するページタイトル・database + 本文 N 行の要約 |
| `notion.append_block_children`（追記） | `diff` | 既存ページの末尾に追加される差分ブロックを表示 |
| `notion.update_page_properties`（プロパティ更新） | `diff` | 変更前 / 変更後のプロパティ値を並列表示 |
| `notion.delete_block`（削除） | `custom-markdown` | 削除対象のブロック内容を markdown 形式で全文表示 |
| Research → Notion 一括追加 | `text-summary` | 「N 件のエントリを database X に追加します」 |

**なぜ `diff` が必要か**:
SNS 投稿（X Sender）は「新規作成のみ」なので `custom-markdown` でプレビューするだけでよい。
Notion の場合は「既存ページへの追記」があり、**何が変わるか（差分）** を確認させる必要がある。
削除操作では「何が消えるか」を full text で見せる必要があるため `custom-markdown` を使う。

### Panel Schema での HITL 設定例

`save_page_blocks` アクション（既存ページへの追記）:

```json
{
  "id":   "save_page_blocks",
  "hitl": {
    "require":          true,
    "preview":          "diff",
    "preview_template": "{{t:hitl.save_page_template}}"
  }
}
```

`create_new_page` アクション（新規ページ作成）:

```json
{
  "id":   "create_new_page",
  "hitl": {
    "require":          true,
    "preview":          "custom-markdown",
    "preview_template": "### {{t:hitl.create_page_heading}}\n\n**{{t:hitl.title}}**: {{page_title}}\n**{{t:hitl.parent_db}}**: {{page_parent_db}}\n**{{t:hitl.status}}**: {{page_status}}"
  }
}
```

`run_import` アクション（Notion → Pool 取り込み）:

```json
{
  "id":   "run_import",
  "hitl": {
    "require":          true,
    "preview":          "custom-markdown",
    "preview_template": "### {{t:hitl.import_heading}}\n\n{{t:hitl.import_source}}: **{{import_source_db}}**\n\n{{t:hitl.import_tags}}: {{import_pool_tags}}\n\n{{t:hitl.import_include_body}}: {{import_include_body}}"
  }
}
```

### 大量書き換え時の制限

spec §7.2 より:

- `notion.append_block_children` の 1 回のアクションで追加できるブロック数は最大 100（Notion API 制限）
- 100 ブロックを超える場合は HITL preview で分割追加の確認を求める
- Research からの一括追加が 20 件を超える場合は 5 件ずつのバッチ承認を提案

これらの制限は「大量書き換えによる意図しないデータ汚染を防ぐ」ための安全設計。

---

## 6. Cross-over 3 パターンの読みどころ

spec §6 を読む。Notion App の最大の付加価値は他 App との連携（Cross-over）。

### 6.1 Writer → Notion（下書き → Notion ページ化）

```
Writer App
  ↓ app.handoff({
      to:      "com.akari.notion",
      intent:  "export-to-notion",
      payload: {
        draft_ref:  <amp_record_id>,       // AMP にある下書き本文の参照
        assets:     [<pool_item_id>, ...], // Pool にある添付素材の参照
        target_db:  <notion_database_id>,  // 保存先 database（省略可）
      }
    })
Notion Panel
  → "ページを作成" フォームに draft_ref の本文を展開
  → assets の Pool アイテムをブロックとして展開（画像・動画は embed）
  → HITL プレビュー（custom-markdown）で作成内容を確認
  → 承認 → notion.create_page を実行
  → AMP に kind: "export-action" を goal_ref 付きで記録
```

X Sender の `Writer → X Sender（intent: "post-draft"）` と同じ handoff パターン。
Publishing カテゴリが「外向き公開」なのに対して、Documents カテゴリは「内向き知識管理」への書き込み。

### 6.2 Research → Notion（収集結果 → database 流し込み）

```
Research App
  ↓ app.handoff({
      to:      "com.akari.notion",
      intent:  "save-to-notion-db",
      payload: {
        records:    [<amp_record_id>, ...],  // AMP にある収集結果の参照
        target_db:  <notion_database_id>,    // 書き込み先 database
        field_map:  { title: "title", url: "URL", summary: "Summary" }
      }
    })
Notion App（自動処理）
  → AMP record を fetch → notion.query_database で重複確認
  → 未登録のみ notion.create_page（database エントリとして）
  → HITL プレビュー（text-summary で一括追加件数を表示）
  → 承認 → 一括追加実行
```

**`field_map`** が重要: Research が収集した結果の各フィールド（`title`, `url`, `summary` 等）を
Notion database のプロパティ名にマッピングする。
同じ Research 結果でも、書き込み先の database 設計に応じて柔軟にマッピングできる。

**重複チェック**: `notion.query_database` で既登録かどうかを確認してから追加する。
同じ URL が既に database に入っていれば skips する。
これにより Research を何度実行しても database が汚染されない。

### 6.3 Notion → Pool（database を Pool 素材として取り込み）

```
ユーザーが Notion Database View Panel で対象 database を選択
  ↓ notion.retrieve_database でスキーマ取得 → フィールドマッピング UI 表示
  ↓ ユーザーが取り込み対象フィールドを選択・確認
  ↓ notion.query_database でエントリを取得
  ↓ 各エントリを Pool.put（mime: "text/notion-page", tags: ["notion", "imported"]）
  ↓ AMP に kind: "pool-import" を goal_ref 付きで記録
```

この動線は**逆方向の同期**。Notion に蓄積した個人の知識資産を AKARI の AI チームが活用できるようにする。
取り込み後は Pool Browser でアクセス可能になり、Writer の素材・Research の文脈として使える。

`mime: "text/notion-page"` — Pool は mime type によって素材の種類を識別する。
`tags: ["notion", "imported"]` — Pool の検索やフィルタリングで「Notion からの取り込み」を特定できる。

---

## 7. 認証フローの読みどころ

spec §8 を読む。基本構造は X Sender と同じだが、Notion 固有の違いがある。

### X Sender との違い

| 項目 | X Sender | Notion |
|---|---|---|
| token 有効期限 | short-lived（refresh token あり） | long-lived（Notion OAuth は refresh token なし） |
| 認証時の UI | X の OAuth ページ（シンプル） | Notion の OAuth ページ（workspace 選択を含む） |
| 代替手段 | なし | Internal Integration Token（API Key 方式） |
| Workspace ID | 不要 | Keychain に `workspace_id` も保存する |

```
ユーザーが初回起動
     ↓
Shell: Permission API → "Notion へのアクセス権限を求めています" [許可する]
     ↓
@notionhq/mcp: OAuth 2.0 PKCE フロー起動
  → ブラウザで Notion 認証ページ（workspace 選択を含む）
     ↓
コールバック受信 → access token（Notion OAuth は refresh token なし / 長期有効）
     ↓
Keychain に保存（service: com.akari.notion, account: access_token）
                                            account: workspace_id
     ↓
以降: @notionhq/mcp が Keychain から token を読み取り API 呼び出し
```

### Integration Token（代替手段）

Notion には Personal API Key（Internal Integration Token）による認証方式もある。
enterprise 環境では OAuth より Internal Integration の方が現実的なことも多い。
`settings` panel から Integration Token を直接入力できる代替フローも提供する。

```
Keychain レイアウト:
  service: "com.akari.notion"
  account: "access_token"          ← OAuth 方式
  account: "workspace_id"          ← workspace 識別
  account: "integration_token"     ← Integration Token 方式（代替）
```

同じ Keychain の service name 配下に複数の account を持てる。
`akari.toml` の `keychain = ["com.akari.notion"]` はこの service name を許可している。

---

## 8. オフライン挙動の読みどころ

spec §9 を読む。X Sender の「下書きを Pool に保存」より複雑な「キャッシュ + 書き込みキュー」方式。

### 9.1 Pool 素材キャッシュ

```
notion.query_database / notion.retrieve_page の結果
  → Pool に tags: ["notion-cache"] でキャッシュ保存
  → キャッシュ有効期限: 24 時間（設定変更可）

オフライン時
  → 最新キャッシュを読み取り専用で表示
  → 「キャッシュ表示中」バッジを付与
```

DB クエリやページ取得は読み取り操作なのでキャッシュで代替できる。
ユーザーは「古いデータかもしれないが」オフラインでも閲覧・確認ができる。

### 9.2 書き込みキュー

```
オフライン時に notion.create_page / notion.append_block_children を実行しようとした場合:
  1. "オフライン中です。書き込みを Pool に下書き保存しますか？" トーストを表示
  2. 承認した場合: 書き込み内容を Pool に tags: ["notion-pending-write"] で保存
  3. オンライン復帰後: AKARI Core のジョブキュー経由で自動実行（HITL 再確認付き）
```

「pending-write」という tag name が設計の意図を表している。
ペンディング中の書き込みは Pool Browser でも確認でき、不要なら手動でキャンセルできる。

オンライン復帰後の自動実行時に **HITL 再確認が入る** 点が重要。
オフライン中に意図が変わっていた場合に取り消しできる。

### 9.3 同期競合解決方針

```
オフライン中に Notion 側で同一ページが更新された場合:
  - 読み取り系: 「更新がありました」バッジを表示
  - 書き込み系: HITL で「上書き / キャンセル / 差分確認」を選択させる
  - update_page_properties: Last Write Wins（最終更新者が勝つ）、AMP に競合記録
```

「自動マージを行わない」は Documents カテゴリの保守的な選択。
Notion のコンテンツは重要なドキュメントであることが多く、
自動マージによる意図しない上書きを防ぐ設計思想。

---

## 9. AMP 記録パターンの読みどころ

Notion App の各操作は AMP に記録される。`kind` フィールドで操作種別を表す。

| 操作 | kind | 記録のタイミング |
|---|---|---|
| Writer → Notion ページ作成 | `export-action` | `notion.create_page` 成功後 |
| Research → Notion database 追加 | `research-export` | 一括追加完了後 |
| Notion → Pool 取り込み | `pool-import` | `Pool.put` 完了後 |

すべての記録に `goal_ref` が付く。
handoff で受け取った `goal_ref` があればそれを引き継ぎ、
なければ新規生成する（X Sender と同じパターン）。

**`kind: "export-action"` の意義**:
Writer が `kind: "draft-created"` → X Sender が `kind: "publish-action"` と記録するのと同様に、
Notion App は `kind: "export-action"` を記録することで、
「この下書きがどの Notion ページになったか」のトレースが AMP から辿れる。

---

## 10. 真似するポイント — 他 Documents App を作るとき

Notion App は **Google Docs / Microsoft 365 / Coda** を作る際の雛形として設計されている。

### 変えるべき点

| 項目 | Notion | 別 Documents（例: Google Docs） |
|---|---|---|
| `id` | `com.akari.notion` | `com.akari.google-docs` |
| `[mcp].server` | `npm:@notionhq/mcp` | `npm:@google-ai-studio/mcp` （存在する場合） or 自前 |
| `[mcp].tools` | `notion.search`, `notion.create_page`, ... | `gdocs.create_document`, `gdocs.append_text`, ... |
| `[permissions].external-network` | `["api.notion.com"]` | `["docs.googleapis.com"]` |
| `[permissions].oauth` | `["notion.com"]` | `["accounts.google.com"]` |
| Panel Schema の widget | `doc-outline-tree`, `rich-text-editor` | Google Docs のブロックモデルに対応した widget |
| HITL の `preview` 種別 | `diff` / `text-summary` / `custom-markdown` | 同じ 3 種類で対応可能（変えなくてよい） |

### 変えなくていい点（そのまま流用できる）

- `tier = "mcp-declarative"`, `category = "documents"` — 同じ
- タブレイアウト（`layout: "tabs"`）の設計思想 — 複数操作モードが必要
- `visible_when` による段階的 UI 展開パターン — 同じ
- HITL ポリシーの基準（新規作成 / 追記 / 削除で preview 種別を変える）— Documents カテゴリ共通
- Cross-over のフロー（Writer → Docs / Research → Docs / Docs → Pool）— 動線は共通
- オフライン挙動の設計（キャッシュ + 書き込みキュー）— 外部 SaaS 依存なら共通
- AMP 記録パターン（`kind: "export-action"` / `goal_ref`）— 共通

### チェックリスト

新しい Documents App を作るときに確認する項目:

- [ ] 公式 MCP が存在するか確認した（ADR-002 公式優先の判断）
- [ ] `[permissions].amp` に `read` も含めたか（handoff で AMP を読む場合）
- [ ] Panel は `layout: "tabs"` で複数操作モードを分離したか
- [ ] 各書き込みアクションに `hitl.require: true` を付けたか（certify で自動チェック）
- [ ] HITL の `preview` 種別を操作ごとに適切に選んだか（diff / text-summary / custom-markdown）
- [ ] 大量書き換えの件数制限を設けたか（Notion の場合は 100 ブロック / 20 件）
- [ ] オフライン時のキャッシュ（読み取り系）と書き込みキュー（書き込み系）を設計したか
- [ ] 同期競合の解決方針を決めたか（Last Write Wins or 手動選択）
- [ ] 3 方向の Cross-over（Writer / Research / Pool）を実装したか

---

## 11. spec・schema へのリンク

| リソース | パス |
|---|---|
| HUB-026 spec 本体 | `spec-app-notion-reference.md (AKARI-HUB-026, Hub)` |
| Panel Schema JSON | `notion-app-panel.schema.json (Hub)` |
| 親 spec (HUB-005) | `spec-akari-declarative-capability-modules.md (AKARI-HUB-005, Hub)` |
| App SDK (HUB-024) | `App SDK spec (AKARI-HUB-024, Hub)` |
| Panel Schema 規格 (HUB-025) | `Panel Schema spec (AKARI-HUB-025, Hub)` |
| X Sender ガイド | [x-sender.md](./x-sender.md)（Publishing カテゴリの参考実装） |
| Gallery 入口 | [README.md](./README.md) |

---

## まとめ — Notion ガイドのここが学べる

| 学べること | 対応セクション |
|---|---|
| 公式 MCP を `npm:` で参照する方法 | §2 akari.toml |
| `options_source` でセレクトボックスを MCP tool で動的に埋める方法 | §3 / §4 Panel Schema |
| `visible_when` で段階的 UI 展開（ウィザード的操作）を作る方法 | §4 Panel Schema タブ 1 |
| `radio` モード切り替えで 1 つの Panel に複数操作を持たせる方法 | §4 Panel Schema タブ 2 |
| `doc-outline-tree` と `rich-text-editor` widget の使い方 | §4 Panel Schema タブ 2 |
| HITL の `diff` preview（変更前後の差分表示）の使い方 | §5 HITL ポリシー |
| Documents カテゴリの大量書き換え安全設計 | §5 HITL ポリシー |
| Cross-over 3 方向（Writer / Research / Pool）の handoff パターン | §6 Cross-over |
| OAuth + Integration Token の代替手段設計 | §7 認証フロー |
| Pool キャッシュ + 書き込みキューによるオフライン挙動 | §8 オフライン挙動 |
| AMP の `kind` 別記録と `goal_ref` 引き継ぎ | §9 AMP 記録 |
