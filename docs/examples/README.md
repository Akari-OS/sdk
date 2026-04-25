# AKARI App SDK — Example Gallery

> **このドキュメントについて**: AKARI App SDK の参考実装（Example）を一覧化したギャラリー入口。
> 各実装の spec 本体は `akari-os` リポジトリの `` (Hub) に置かれている。
> このギャラリーは spec を読み解くための **導線（ガイド）** を提供する。

---

## 実装例一覧

| 実装名 | spec-id | Tier | カテゴリ | 公式 MCP | 難易度 | ガイド |
|---|---|---|---|:-:|---|---|
| **X Sender** | AKARI-HUB-007 | MCP-Declarative | Publishing | △ (X 公式 MCP / 自前選択) | ★★☆ 中級 | [x-sender.md](./x-sender.md) |
| **Notion** | AKARI-HUB-026 | MCP-Declarative | Documents | ✅ `@notionhq/mcp` | ★★☆ 中級 | [notion.md](./notion.md) |
| **Web Search** | AKARI-SDK-004 | MCP-Declarative | Research | △ (`@tavily/core` / 差し替え可能) | ★★☆ 中級 | [web-search.md](./web-search.md) |

**凡例**:

- **Tier**: `MCP-Declarative` = MCP サーバー + Panel Schema のみで構成。React コード不要
- **公式 MCP**: ✅ = 公式 MCP サーバーを使用、△ = 自前または公式どちらも可、❌ = 自前実装
- **難易度**: ★☆☆ 初級 / ★★☆ 中級 / ★★★ 上級

---

## 読む順序の推奨

### はじめて AKARI App SDK に触れる方

1. **まず [x-sender.md](./x-sender.md) を読む**
   - 最小構成（`akari.toml` + Panel Schema 1 枚 + MCP tools 4 個）でセットアップ全体が掴める
   - Publishing カテゴリの典型パターン（HITL プレビュー・OAuth PKCE・AMP 記録）が揃っている
   - spec 本体（HUB-007）が他の spec より短く、読み切れる

2. **次に [web-search.md](./web-search.md) を読む**
   - Research カテゴリの最小構成。Provider 抽象化とステーブルパターンが学べる
   - Tavily の `include_answer` で独自 LLM なしに AI 要約を実装するパターン
   - API key 認証のみ（OAuth 不要）の参考実装

3. **最後に [notion.md](./notion.md) を読む**
   - Panel 4 枚・Tools 10 個とスケールが上がり、Documents カテゴリ固有の HITL ポリシーも学べる
   - 公式 MCP (`@notionhq/mcp`) の活用パターン、Cross-over（Writer / Research / Pool との連携）を確認する
   - オフライン挙動（キャッシュ + 書き込みキュー）は他の Documents App でも再利用できる設計

### 特定の目的で読む場合

| やりたいこと | 読む先 |
|---|---|
| MCP-Declarative Tier の最小構成を理解したい | x-sender.md §2 akari.toml / §3 Panel Schema |
| OAuth 無し・API key 認証の実装パターンを見たい | web-search.md §2 akari.toml（keychain 設定） |
| OAuth 2.0 PKCE フローの実装パターンを見たい | x-sender.md §5 OAuth 2.0 PKCE フロー |
| Provider 抽象化（差し替え可能な実装）を学びたい | web-search.md §3 Provider 抽象化のキモ |
| HITL プレビュー（承認ダイアログ）の種別を知りたい | x-sender.md §4 HITL / web-search.md / notion.md §7 HITL ポリシー |
| Inter-App handoff（App 間連携）を学びたい | x-sender.md §6 Writer handoff / web-search.md §7 Research → Writer / notion.md §8 Cross-over |
| AMP への記録パターンを見たい | x-sender.md §7 AMP 記録 / web-search.md §8 research-action 記録 |
| 公式 MCP を活用した省コスト実装を見たい | notion.md §3 MCP ツール一覧 |
| オフライン挙動の設計パターンを見たい | notion.md §9 オフライン挙動 |
| Panel Schema の複雑な構造（タブ / 動的フィールド）を学びたい | web-search.md §5 Panel 3 タブ / notion.md §5 Panel Schema 詳解 |
| 自分で Publishing App を作りたい（LINE / Threads など） | x-sender.md §10 真似するポイント |
| 自分で Research App を作りたい（arxiv / scholar など） | web-search.md §10 真似するポイント |
| 自分で Documents App を作りたい（Google Docs など） | notion.md §10 真似するポイント |

---

## 参考実装が示す設計パターン

AKARI の 2 本の参考実装は、App 開発者が知るべき **共通の設計パターン** を提示している。

### パターン 1 — `akari.toml` でゼロ抽象化

```toml
tier     = "mcp-declarative"
category = "publishing"          # または "documents"
```

MCP-Declarative Tier では `tier = "mcp-declarative"` を宣言するだけで、
Shell がパネルレンダラ・HITL エンジン・Permission API の管理をすべて引き受ける。
App 開発者は **ビジネスロジック（MCP tools）と UI 宣言（Panel Schema）** だけに集中できる。

### パターン 2 — Panel Schema の `bind` が MCP tool の引数を直結

```json
{
  "id":   "text",
  "type": "textarea",
  "bind": "mcp.x.post.text"
}
```

フィールドの `bind` に `mcp.<tool>.<arg_path>` を書くだけで、
ユーザーの入力値が MCP tool の引数として自動で渡される。
配線コードを書く必要はない。

### パターン 3 — HITL は外部アクションの前に必ず挟む

```json
"hitl": {
  "require": true,
  "preview": "custom-markdown"
}
```

外部への書き込み（SNS 投稿 / ドキュメント作成）は `hitl.require: true` を宣言し、
ユーザーが最終確認できるよう設計する。`akari app certify` がこれを静的検知する。

### パターン 4 — Inter-App handoff で ID のみを渡す

```javascript
app.handoff({
  to:      "com.akari.notion",
  intent:  "export-to-notion",
  payload: { draft_ref: <amp_record_id> }  // 本文バイトは渡さない
})
```

App 間の連携では、実データではなく **AMP / Pool の参照 ID** だけを渡す。
本文テキストや添付ファイルは記憶層（AMP / Pool）に置いたまま、受け取り側がそこから取得する。

### パターン 5 — 認証は Permission API 経由、credential を直接持たない

MCP サーバーが AKARI Permission API 経由で認証を要求し、
Keychain に保管するのが標準パターン。
App コードが credential の文字列を直接保持することは禁止。

---

## spec 一覧との対応

各ガイドが参照する spec の場所:

| ガイド | spec ファイルパス | panel schema ファイルパス |
|---|---|---|
| x-sender.md | `spec-x-sender-phase0.md (AKARI-HUB-007, Hub)` | `panels/x-sender.schema.json`（spec 内に inline） |
| web-search.md | `spec-example-web-search.md (AKARI-SDK-004, SDK)` | `examples/web-search/panel.schema.json` |
| notion.md | `spec-app-notion-reference.md (AKARI-HUB-026, Hub)` | `notion-app-panel.schema.json (Hub)` |

spec 本体の spec-id / status / related-specs の frontmatter は以下の通り:

```yaml
# HUB-007
spec-id: AKARI-HUB-007
version: 0.2.0
status: draft
related-specs: [AKARI-HUB-005, AKARI-HUB-024, AKARI-HUB-025]

# SDK-004
spec-id: AKARI-SDK-004
version: 0.1.0
status: accepted
related-specs: [AKARI-SDK-001, AKARI-SDK-002, AKARI-SDK-003, AKARI-HUB-007]

# HUB-026
spec-id: AKARI-HUB-026
version: 0.1.0
status: draft
related-specs: [AKARI-HUB-005, AKARI-HUB-024, AKARI-HUB-025, AKARI-HUB-007]
```

---

## コントリビュート方法（将来）

> このセクションは将来の OSS 公開時に充実させる予定。現時点は内部向けの構造のみ。

### 新しい Example を追加するには

1. `` (Hub) に `spec-{app-name}.md` を作成し、`akari app certify` で Pass させる
2. このギャラリーに `{app-name}.md` の読み方ガイドを追加する
3. 上記の実装例一覧テーブルに行を追加する
4. 難易度の目安:
   - **★☆☆ 初級**: tools 3 個以下、Panel 1 枚、HITL なし
   - **★★☆ 中級**: tools 4〜8 個、Panel 1〜2 枚、HITL あり、OAuth あり
   - **★★★ 上級**: tools 9 個以上、Panel 3 枚以上、Cross-over 複数、カスタムウィジェット使用

### ガイドの書き方テンプレート

各ガイドは以下の構造で書く（x-sender.md / notion.md を参照）:

1. App 概要（Tier / カテゴリ / 公式 MCP / Phase）
2. `akari.toml` の読みどころ
3. MCP tools 一覧と HITL 設定の解説
4. Panel Schema の読みどころ
5. 認証フロー
6. Inter-App handoff / Cross-over
7. オフライン挙動（あれば）
8. 真似するポイント（横展開の雛形として）
9. spec / schema へのリンク

---

## 関連ドキュメント

| ドキュメント | 場所 | 説明 |
|---|---|---|
| App SDK spec | `App SDK spec (AKARI-HUB-024, Hub)` (HUB-024) | Tier 定義・Certification・7 API 群 |
| Panel Schema spec | `Panel Schema spec (AKARI-HUB-025, Hub)` (HUB-025) | UI 宣言規格・widget 一覧 |
| Declarative Apps spec | `spec-akari-declarative-capability-apps.md (AKARI-HUB-005, Hub)` (HUB-005) | カテゴリ定義・Publishing / Documents の全 App 一覧 |
| ADR-002 | `ADR-002 (Hub)` | 公式 MCP 優先の判断基準 |
