# X Sender — 読み方ガイド（HUB-007）

> **対象 spec**: `spec-x-sender-phase0.md (AKARI-HUB-007, Hub)`（AKARI-HUB-007 v0.2.0）
> **Tier**: MCP-Declarative
> **カテゴリ**: Publishing
> **公式 MCP**: △（X 公式 MCP / 自前 `x-mcp` どちらも選択可）
> **位置づけ**: HUB-005 v0.2 Publishing カテゴリの**最初のリファレンス実装**。
> MCP-Declarative Tier で AKARI Module が成立することを実証する。

---

## 1. Module 概要

X Sender は **X (旧 Twitter) への投稿** を担当する Publishing Module。

```
com.akari.x-sender
  ├── akari.toml               ← tier = "mcp-declarative"
  ├── mcp-servers/x/           ← x-mcp: MCP サーバー実装
  └── panels/x-sender.schema.json  ← Panel Schema v0 投稿フォーム
```

**最大の特徴**: Module 開発者が書くものは `x-mcp` サーバーと `panel.schema.json` の **2 ファイルのみ**。
React コード・独自 DB・カスタムエージェントは持たない。
「Shell を開いて投稿フォームに文字を書き、投稿ボタンを押したら HITL プレビューが出て、承認したら X に実際に投稿される」—
これだけ動けば Phase 0 の成功条件を満たす。

### なぜこれが参考実装として最適か

- **MCP-Declarative Tier の最小構成**: tools 4 個・Panel 1 枚。読み切れる分量
- **HITL / OAuth / Inter-App handoff / AMP 記録** の 4 パターンがすべて揃っている
- Publishing カテゴリの後続（LINE Sender / Threads Sender）を作る際の雛形として使える
- spec 本体が v0.2.0 で全面書き直しされており、「旧設計からどう変わったか」の変遷も学べる

---

## 2. `akari.toml` の読みどころ

spec §4.3 の Manifest から重要部分を引用する。

```toml
[module]
id      = "com.akari.x-sender"
name    = "X Sender"
version = "0.2.0"
tier    = "mcp-declarative"      # ← ここが重要
sdk     = ">=0.1.0 <1.0"
category = "publishing"          # ← カテゴリ宣言

[mcp]
server = "mcp-servers/x"         # ローカルプロセス（自前実装の場合）
tools  = ["x.post", "x.schedule", "x.draft_save", "x.get_me"]

[panels]
main = { title = "X", schema = "panels/x-sender.schema.json" }

[permissions]
external-network = ["api.x.com", "api.twitter.com"]
oauth            = ["x.com"]
keychain         = ["com.akari.x-sender"]
pool             = ["read", "write"]
amp              = ["write"]
```

### 読みどころ 1 — `tier = "mcp-declarative"`

この 1 行で Shell は「このModule は MCP サーバーと Panel Schema だけで動く」と判断し、
汎用 Schema レンダラ・HITL エンジン・Permission API の管理を引き受ける。
Module 開発者はビジネスロジックと UI 宣言だけに集中できる。

### 読みどころ 2 — `category = "publishing"`

HUB-005 v0.2 で定義された Publishing カテゴリに属することを宣言。
Shell はこのカテゴリ情報を使って Module 一覧の表示やフィルタリングを行う。
`publishing` / `documents` / `social` などのカテゴリは HUB-005 §7.1 に一覧がある。

### 読みどころ 3 — `[permissions]` ブロック

`permissions` は Module が要求できるリソースの宣言的な許可リスト。

| 宣言 | 意味 |
|---|---|
| `external-network = ["api.x.com"]` | この 2 ドメイン以外への外部通信はブロック |
| `oauth = ["x.com"]` | OAuth フローを x.com に対して実行する権限 |
| `keychain = ["com.akari.x-sender"]` | この service name のキーチェーンのみ読み書き可 |
| `pool = ["read", "write"]` | Pool への読み書き（下書き保存 + メディア取得） |
| `amp = ["write"]` | AMP への書き込み（投稿記録） |

`permissions` に宣言されていない操作は Shell が拒否する。
`akari module certify` の静的 Lint でも検証される。

### 読みどころ 4 — `[mcp]` の `server` と `tools`

`server = "mcp-servers/x"` は相対パスでローカルプロセス起動を指定。
`server = "npm:@notionhq/mcp"` のように npm パッケージ参照にすれば公式 MCP を使える（Notion の例）。
`tools` は使用する MCP ツール名の宣言。これと Panel Schema の `bind` が一致していないと certify が落ちる。

---

## 3. MCP ツールの読みどころ

spec §4.1〜4.2 から Phase 0 スコープの 4 ツールを解説する。

### Phase 0 の 4 ツール

| ツール名 | 役割 | HITL 必須 | 補足 |
|---|---|:-:|---|
| `x.post` | 単発テキスト投稿（即時） | ✅ | `dry_run` フラグ付き |
| `x.schedule` | 予約投稿（datetime 指定） | ✅ | `publish_at` は ISO 8601 UTC |
| `x.draft_save` | 下書きを Pool に保存 | — | Pool への内部書き込みなので HITL 不要 |
| `x.get_me` | 認証確認（アカウント情報取得） | — | 疎通確認専用 |

### `x.post` の input schema を読む

```json
{
  "name": "x.post",
  "inputSchema": {
    "type": "object",
    "required": ["text"],
    "properties": {
      "text":    { "type": "string", "maxLength": 280 },
      "media":   { "type": "array",  "items": { "type": "string" }, "maxItems": 4 },
      "dry_run": { "type": "boolean", "default": false }
    }
  }
}
```

**注目点**:
- `required: ["text"]` — `text` だけ必須、`media` と `dry_run` は任意
- `media` は Pool item id の配列（最大 4 件）。バイト列ではなく ID を渡す設計
- `dry_run: true` にすると API を叩かずログのみ出力（テスト用）

`akari module certify` は Panel Schema の `bind` 宣言と、この `required` / `properties` の整合性を自動検証する。
つまり Panel Schema に `"bind": "mcp.x.post.text"` と書いてある `text` フィールドが、
MCP tool の `inputSchema.required` に含まれているかどうかをチェックする。

### `x.schedule` の追加フィールド

```json
{
  "name": "x.schedule",
  "inputSchema": {
    "required": ["text", "publish_at"],
    "properties": {
      "publish_at": { "type": "string", "format": "date-time" }
    }
  }
}
```

`x.post` との差分は `publish_at` が追加で `required` になった点のみ。
`publish_at` の型は `string` で `format: "date-time"`（ISO 8601 UTC）。
Panel Schema の `datetime-optional` widget が自動でこの形式で値を渡す。

### `x.draft_save` — なぜ HITL が不要か

`x.draft_save` は X API を一切呼ばず、Pool に書き込むだけ。
HITL の目的は「外部への意図しない公開を防ぐ」ことであり、
内部の記憶層（Pool）への書き込みには適用しない。
HUB-005 §6.5 の HITL 原則が根拠。

---

## 4. Panel Schema の読みどころ

spec §5 の `panels/x-sender.schema.json` を読む。

### 全体構造

```json
{
  "$schema": "akari://panel-schema/v0",
  "title": "{{t:panel.title}}",
  "layout": "form",
  "fields": [...],   // 3 フィールド
  "actions": [...]   // 3 アクション
}
```

`layout: "form"` は単一フォームのシンプルなレイアウト。
Notion の `layout: "tabs"` と対比すると、X Sender のシンプルさが際立つ。

### フィールド 3 つを読む

```json
[
  { "id": "text",  "type": "textarea",         "bind": "mcp.x.post.text",           "maxLength": 280 },
  { "id": "media", "type": "pool-picker",       "bind": "mcp.x.post.media",          "accept": ["image", "video"], "max": 4 },
  { "id": "when",  "type": "datetime-optional", "bind": "mcp.x.schedule.publish_at"  }
]
```

**読みどころ**:

1. **`bind` の書き方**: `mcp.x.post.text` は「`x.post` ツールの `text` 引数にこのフィールドの値を渡す」という宣言。
   `mcp.x.schedule.publish_at` は `x.schedule` ツールに渡す別引数。
   同じ Panel の中で複数 MCP ツールの引数を宣言できる。

2. **`pool-picker` widget**: `accept: ["image", "video"]` で Pool から画像・動画アイテムだけを選択できる。
   ユーザーはファイルパスを入力するのではなく、Pool ブラウザで素材を選ぶ。
   選んだアイテムの Pool item id が `mcp.x.post.media` に渡される。

3. **`datetime-optional` widget**: 空欄のままにすると `null` が渡る。
   後述する `enabled_when` がこの `null` チェックで投稿/予約投稿ボタンの出し分けをしている。

### アクション 3 つを読む

#### `post` アクション（即時投稿）

```json
{
  "id":    "post",
  "label": "{{t:action.post}}",
  "kind":  "primary",
  "mcp":   { "tool": "x.post", "args": { "text": "$text", "media": "$media" } },
  "hitl":  { "require": true, "preview": "custom-markdown",
             "preview_template": "**投稿内容**\n\n{{$text}}\n\n{{#if $media}}添付: {{$media.length}} 件{{/if}}" },
  "enabled_when": "$text != null && $text.length > 0 && $when == null",
  "on_success": { "toast": "{{t:toast.posted}}", "clear_fields": ["text", "media", "when"] }
}
```

**読みどころ**:

- **`kind: "primary"`** — 主操作ボタン（青色 / 目立つスタイル）
- **`hitl.preview: "custom-markdown"`** — `preview_template` の Handlebars テンプレートで承認ダイアログの内容を構築
  - `{{$text}}` でフォームの `text` フィールド値が展開される
  - `{{#if $media}}` で条件分岐も書ける
- **`enabled_when`** の条件: `$when == null` が True（予約日時が未指定）のときだけ有効化。
  予約日時が入力されると "投稿" ボタンが disabled になり、"予約投稿" ボタンが active になる。
  フィールドの入力状態でボタンが排他的に切り替わる良い例。
- **`on_success.clear_fields`** — 成功後にフォームをリセットする。UX として重要。

#### `schedule` アクション（予約投稿）

```json
{
  "id":    "schedule",
  "kind":  "secondary",
  "mcp":   { "tool": "x.schedule", "args": { "text": "$text", "publish_at": "$when", "media": "$media" } },
  "hitl":  { "require": true, "preview": "schedule-summary" },
  "enabled_when": "$text != null && $text.length > 0 && $when != null"
}
```

`kind: "secondary"` でサブボタン扱い。
`hitl.preview: "schedule-summary"` は予約投稿専用のプレビュー種別で、日時と本文の確認フォームを表示する。
`enabled_when` が `$when != null`（`post` アクションの逆条件）— これで 2 ボタンが排他になる。

#### `draft` アクション（下書き保存）

```json
{
  "id":    "draft",
  "kind":  "ghost",
  "mcp":   { "tool": "x.draft_save", "args": { "text": "$text", "media": "$media" } }
}
```

`kind: "ghost"` — 透明ボタン。「今すぐ投稿はしないが消したくない」ときのエスケープ。
`hitl` なし — HITL 不要の根拠は前述の通り（Pool への内部書き込みのみ）。

---

## 5. OAuth 2.0 PKCE フローの読みどころ

spec §7（認証）を読む。

### 旧設計との比較（v0.1.0 → v0.2.0）

| 項目 | 旧設計（廃止） | 新設計（本 spec） |
|---|---|---|
| 認証管理 | `x-sender.ts` が Keychain を直接読み書き | MCP サーバー側で認証管理（AKARI Permission API 経由） |
| 認証方式 | OAuth 1.0a（Consumer Key / Secret） | OAuth 2.0 PKCE |
| credential 入力 | `scripts/set-x-credentials.ts` CLI | OAuth フロー（ブラウザ経由） |

**なぜ MCP サーバーに認証管理を移したか**:
旧設計では `x-sender.ts` という TypeScript クラスが Keychain を直接読み書きしていた。
この方式は「Module コードが credential に直接アクセスできる」ため、
悪意のある Module が他の Module のトークンを盗めるリスクがあった。
新設計では AKARI Permission API が仲介することで、
`com.akari.x-sender` の Keychain には `com.akari.x-sender` の MCP サーバーしかアクセスできない。

### フロー全体

```
ユーザーが初回起動
     ↓
Shell: Permission API → "X への投稿権限を求めています" [許可する]
     ↓
x-mcp サーバー: OAuth 2.0 PKCE フロー起動 → ブラウザで X 認証ページ
     ↓
コールバック受信 → access token + refresh token
     ↓
Keychain に保存（service: com.akari.x-sender）
     ↓
以降: x-mcp が自動でトークンを使いまわし、期限切れは自動更新
```

### Keychain レイアウト

| フィールド | service name | account |
|---|---|---|
| Access Token | `com.akari.x-sender` | `access_token` |
| Refresh Token | `com.akari.x-sender` | `refresh_token` |
| Token Expiry | `com.akari.x-sender` | `token_expiry` |

`service = "com.akari.x-sender"` は `akari.toml` の `keychain = ["com.akari.x-sender"]` 宣言と一致している。
宣言された service name 以外の Keychain へのアクセスは Permission API が拒否する。

### トークン失効時の挙動

1. **access token 期限切れ**: x-mcp が refresh token で自動更新（ユーザー操作不要）
2. **refresh token 失効**: x-mcp → AKARI Core → Shell に再認証プロンプト通知
3. **revoke 時**: Keychain の全エントリを x-mcp が削除

---

## 6. Writer → X Sender handoff の読みどころ

spec §9（Inter-App handoff）を読む。

### handoff の仕組み

```
Writer Module
  ↓ module.handoff({
      to:      "com.akari.x-sender",
      intent:  "post-draft",
      payload: {
        draft_ref: <ampRecordId>,       // AMP にある下書き本文の参照
        assets:    [<poolItemId>, ...]  // Pool にある添付素材の参照
      }
    })
X Sender Panel
  → text フィールドに draft_ref の本文を展開
  → media フィールドに assets の Pool アイテムを展開
  → ユーザーが確認・編集 → 投稿
```

**設計の核心**: `payload` は **Pool / AMP の ID のみ渡す**。本文バイトは渡さない。
Writer が下書きを AMP に保存済みであれば、X Sender は `draft_ref` を使って AMP から本文を取得する。

この設計の利点:
- Module 間の結合が「ID の受け渡し」に限定される（インターフェースが薄い）
- AMP / Pool が Single Source of Truth として機能する
- handoff の payload をログに記録しても credential や本文が漏れない

### handoff を受け取ったときの Panel の挙動

1. `draft_ref` の AMP record から本文を読み取り、`text` フィールドに展開
2. `assets` の Pool item id リストを `media` フィールドに展開
3. ユーザーは内容を確認・編集してから投稿できる（自動投稿にはならない）

handoff は「起点を与える」ものであり、最終投稿はユーザーの HITL 承認を経る。

---

## 7. AMP 記録（`publish-action`）の読みどころ

spec §10 を読む。

### 投稿成功時の AMP レコード

```json
{
  "kind":      "publish-action",
  "content":   "X に投稿しました: https://x.com/i/web/status/{tweet_id}",
  "goal_ref":  "<handoff で受け取った goal_ref、または新規生成>",
  "metadata": {
    "target":       "x",
    "tweet_id":     "{id}",
    "tweet_url":    "https://x.com/i/web/status/{id}",
    "published_at": "{ISO 8601 UTC}",
    "scheduled_at": "{ISO 8601 UTC | null}"
  }
}
```

**読みどころ**:

- **`kind: "publish-action"`** — AMP のレコード種別。Agent が「過去に何を投稿したか」をこの kind で検索できる
- **`goal_ref`** — Writer からの handoff で渡された場合はその goal_ref を引き継ぐ。
  単独投稿の場合は新規生成。これにより「Writer で書いた → X に投稿した」の一連のフローが
  同じ goal_ref で束ねられる。Research → Writer → X Sender というフローのトレーサビリティが生まれる。
- **`scheduled_at`** — `x.post` の場合は `null`、`x.schedule` の場合は予約日時が入る

AMP への記録は `x-mcp` サーバーが投稿成功後に自動で行う。
`akari.toml` の `amp = ["write"]` 宣言がこれを許可している。

---

## 8. オフライン挙動の読みどころ

spec §8 を読む。

### オフライン時の動作表

| 操作 | オフライン挙動 |
|---|---|
| 本文入力・編集 | 完全動作（Panel Schema フォームはローカル） |
| `x.draft_save` | 完全動作（Pool への書き込みはローカル） |
| `x.post` / `x.schedule` | ネットワーク必須 → "オフライン中です。下書き保存しますか？" |
| `x.get_me` | ネットワーク必須 → エラーを無視しキャッシュ表示 |

**設計の意図**: 「書く」行為はオフラインで完結させ、「送る」行為だけネットワークを要求する。
これは UX としても正しく（途中まで書いたものが消えない）、
セキュリティとしても正しい（offline 状態では誤投稿が起きない）。

### 下書きの Pool 保存

`x.draft_save` で保存した下書きは Pool に `tags: ["draft", "x-sender"]` で保存される。
次回 Shell 起動時に Pool から復元してフォームに再展開する仕組みは
`pool.<query_id>` binding で実現する。

---

## 9. Acceptance Criteria から読む「動作保証の考え方」

spec §11 の AC リストは単なるチェックリストではなく、**Module の品質保証仕様**でもある。

注目すべき AC をいくつか抜粋する:

```
AC-1: akari module certify が Pass する
AC-3: 投稿フォームで本文入力 → 投稿押下 → HITL プレビュー → 承認 → X に実際に投稿される
AC-7: dry_run: true で API を叩かず成功レスポンスが返る
AC-8: オフライン時に投稿を押すと "オフライン中です" トーストと下書き保存の提案が出る
AC-9: 投稿成功後、AMP に kind: "publish-action" が goal_ref 付きで記録される
AC-11: 全 MCP tool の input schema が panel.schema.json の bind と整合する（certify 自動検証）
```

**AC-1 と AC-11** は `akari module certify` による自動検証で担保される静的チェック。
**AC-3 / AC-7 / AC-8** は実際のブラウザ・ネットワーク環境での動作確認。
**AC-9** は AMP の記録内容を確認する統合テスト。

この構造は「静的検証でゲートを張り、E2E で動作確認する」という HUB-024 §6.8 Certification パイプラインと対応している。

---

## 10. 真似するポイント — 他 Publishing Module を作るとき

X Sender は **LINE Sender / Threads Sender / Bluesky Sender** を作る際の雛形として設計されている。

### 変えるべき点

| 項目 | X Sender | 別 SNS（例: LINE） |
|---|---|---|
| `id` | `com.akari.x-sender` | `com.akari.line-sender` |
| `category` | `publishing` | `publishing`（同じ） |
| `[mcp].server` | `mcp-servers/x` | `mcp-servers/line` |
| `[mcp].tools` | `x.post`, `x.schedule`, ... | `line.send_message`, ... |
| `[permissions].external-network` | `["api.x.com", "api.twitter.com"]` | `["api.line.me"]` |
| `[permissions].oauth` | `["x.com"]` | `["access.line.me"]` |
| `[permissions].keychain` | `["com.akari.x-sender"]` | `["com.akari.line-sender"]` |
| MCP tool の input schema | `text` / `media` / `dry_run` | `to` / `messages` / `dry_run` |
| Panel Schema のフィールド | `textarea` + `pool-picker` + `datetime-optional` | `select`（宛先選択） + `textarea` |

### 変えなくていい点（そのまま流用できる）

- `tier = "mcp-declarative"` — 同じ Tier
- HITL パターン（`hitl.require: true` + `preview: "custom-markdown"`）— 外部公開なので同じ
- OAuth 2.0 PKCE フローの全体構造（認証が必要なのは同じ）
- Writer → handoff の受け取りパターン（`intent: "post-draft"` + `draft_ref` + `assets`）
- AMP 記録の `kind: "publish-action"` + `goal_ref` パターン
- オフライン挙動の設計思想（書く = オフライン OK、送る = ネットワーク必須）

### チェックリスト

新しい Publishing Module を作るときに確認する項目:

- [ ] `akari.toml` の `tier` / `category` / `permissions` を適切に宣言したか
- [ ] MCP tool に `dry_run` フラグを追加したか（E2E テストで重要）
- [ ] 外部公開アクションに `hitl.require: true` を付けたか（certify で自動チェックされる）
- [ ] `panel.schema.json` の `bind` と MCP tool の `inputSchema` が整合するか（certify AC-11）
- [ ] Keychain の service name が `[permissions].keychain` と一致しているか
- [ ] 投稿成功後に AMP に `kind: "publish-action"` を書き込む実装を入れたか
- [ ] Writer からの handoff（`intent: "post-draft"`）を受け取れるか

---

## 11. spec 本体へのリンク

| リソース | パス |
|---|---|
| HUB-007 spec 本体 | `spec-x-sender-phase0.md (AKARI-HUB-007, Hub)` |
| Panel Schema（spec 内に inline） | spec §5 参照 |
| 親 spec (HUB-005) | `spec-akari-declarative-capability-modules.md (AKARI-HUB-005, Hub)` |
| Module SDK (HUB-024) | `Module SDK spec (AKARI-HUB-024, Hub)` |
| Panel Schema 規格 (HUB-025) | `Panel Schema spec (AKARI-HUB-025, Hub)` |
| Notion Module ガイド | [notion.md](./notion.md)（Documents カテゴリの参考実装） |
| Gallery 入口 | [README.md](./README.md) |

---

## まとめ — X Sender のここが学べる

| 学べること | 対応セクション |
|---|---|
| MCP-Declarative Tier の最小構成 | §2 akari.toml |
| `bind` で Panel フィールドと MCP tool を繋ぐ方法 | §4 Panel Schema |
| `enabled_when` でボタンを排他的に制御する方法 | §4 Panel Schema アクション |
| HITL の `custom-markdown` プレビューの書き方 | §4 Panel Schema アクション / §6 HITL |
| OAuth 2.0 PKCE フローを MCP サーバーに委ねる設計 | §5 OAuth 2.0 PKCE |
| Inter-App handoff（ID のみ渡す原則） | §6 Writer handoff |
| AMP への `publish-action` 記録と `goal_ref` 引き継ぎ | §7 AMP 記録 |
| オフライン時のグレースフルデグラデーション | §8 オフライン挙動 |
