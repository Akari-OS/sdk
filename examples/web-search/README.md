# Web Search — AKARI MCP-Declarative App 参考実装

> **App ID**: `com.akari.example.web-search`
> **Tier**: MCP-Declarative
> **Category**: Research
> **Spec**: [`AKARI-SDK-004`](../../docs/specs/spec-example-web-search.md)
> **Related guide**: [`../../docs/examples/web-search.md`](../../docs/examples/web-search.md)

AKARI App SDK の **MCP-Declarative Tier** で Research カテゴリ App を実装した参考例。
「検索 → AI 要約 → Pool に保存 → Writer に引用」までを最小コードで示す。

---

## What you'll learn

1. **Research カテゴリの雛形** — arxiv / scholar / internal-search など他の検索系 App を作るときそのまま流用できる構造
2. **Provider 抽象化のやり方** — `SearchProvider` インターフェース + 3 実装（Tavily active / Brave / Exa skeleton）で複数 provider 差し替え構造を仕込む
3. **AI 要約を provider の answer 機能に乗せる** — 独自 LLM 呼び出しなしで AI 要約を返す（Tavily `include_answer`）。provider 固有機能を活かす例
4. **Research upstream パターン** — Research → Pool（素材蓄積）と Research → Writer（引用 handoff）の 2 方向 cross-over
5. **OAuth 無し・API key 認証** — Publishing / Documents と違い OAuth フローが不要な App の最小構成

---

## Prerequisites

- **Node.js 18+**
- **Tavily API key**（[tavily.com](https://tavily.com/) で無料枠取得可）
- **AKARI Shell installed**（`pnpm akari dev` が動く環境）

---

## Quick start

```bash
# 1. 依存インストール
cd examples/web-search
pnpm install

# 2. 環境変数
cp .env.example .env
# .env の TAVILY_API_KEY を編集

# 3. AKARI 開発サーバーで起動
pnpm dev
# → Shell に Research App が mount されます

# 4. certify（任意）
pnpm akari app certify
```

---

## Structure

```
examples/web-search/
├── README.md               このファイル
├── package.json            @akari-os-examples/web-search (private)
├── tsconfig.json           extends ../../tsconfig.base.json
├── akari.toml              App Manifest (MCP-Declarative, category = "research")
├── panel.schema.json       Panel Schema v0 — 3 タブ（Search / Read / Pool Export）
├── locales/
│   ├── ja.json
│   └── en.json
├── mcp-server/
│   ├── index.ts            McpServer startup (stdio)
│   ├── tools.ts            research.search / deep_read / save_to_pool
│   ├── types.ts            Provider-agnostic 共通型
│   └── providers/
│       ├── index.ts        SearchProvider interface + factory
│       ├── tavily.ts       Phase 0 実装（@tavily/core）
│       ├── brave.ts        Phase 1 skeleton（throw）
│       └── exa.ts          Phase 1 skeleton（throw）
└── .env.example            TAVILY_API_KEY / PROVIDER
```

---

## MCP tools (Phase 0)

| ツール | 役割 | HITL |
|---|---|:---:|
| `research.search` | クエリ → 結果 + AI answer（provider 合成） | — |
| `research.deep_read` | 単一 URL の本文を markdown で取得 | — |
| `research.save_to_pool` | 選択結果 / AI 要約を Pool に保存 | 必須 |

> **HITL について**: `save_to_pool` と `quote-from-research` handoff は `text-summary` プレビューを Shell が表示してから tool を呼ぶ。MCP 側は承認済み前提で動く。

---

## Provider 切替

Phase 0 は Tavily のみ実装。構造は差し替え可能：

```bash
# デフォルト
PROVIDER=tavily

# Phase 1（現状は即エラー）
PROVIDER=brave    # → throw "BraveProvider is a Phase 1 stub..."
PROVIDER=exa      # → throw "ExaProvider is a Phase 1 stub..."
```

Brave / Exa を有効化するには：

1. API key 取得（Brave: brave.com/search/api, Exa: exa.ai）
2. `mcp-server/providers/{brave,exa}.ts` の `throw` を実装に置換
3. `akari.toml` `[permissions].external-network` のコメント化を解除
4. `.env` に `BRAVE_API_KEY` / `EXA_API_KEY` を追加

各 provider の `answer` 対応：

| Provider | AI answer | 備考 |
|---|:---:|---|
| Tavily | ✅ | `include_answer=true` で即取得 |
| Brave | ❌ | answer フィールドは空。必要なら Phase 1 の `research.summarize` で合成 |
| Exa | ✅ | `summary` を `answer` にマッピング |

---

## Panel Schema（3 タブ）

| Tab ID | Label | 用途 |
|---|---|---|
| `search` | Search | クエリ入力・結果表示・AI 要約表示 |
| `read` | Read | 選択結果の本文（deep_read）表示 + Writer 引用 handoff |
| `pool-export` | Pool Export | 複数選択で一括 Pool 保存（タグ編集・メモ） |

キーパターン：

- **`result_bind`** — MCP 呼び出しの結果を `state.search_result` に格納し、後続フィールドから参照
- **`selectable: "multi"` + `selection_bind`** — 結果テーブルの複数選択を state に束ねる
- **`navigate_tab`** — `deep_read` 成功時に Read タブへ遷移
- **`visible_when`** — AI 要約パネルは `answer` がある時だけ表示、本文は `focused_result` がある時だけ表示

---

## Patterns to borrow

このサンプルは **arxiv / scholar / internal-search / enterprise-search** など他の Research 系 App の雛形として設計されている。

### 変えなくていい点

- `tier = "mcp-declarative"`、`category = "research"`
- 3 タブ layout（Search / Read / Pool Export）
- Provider 抽象化の骨格（`SearchProvider` interface + factory）
- Pool 保存スキーマ（`text/research-result` / `text/research-answer`）
- AMP 記録（`kind: "research-action"`）
- HITL パターン（`save_to_pool` + handoff に `text-summary`）
- Research → Writer の intent 名（`quote-from-research`）

### 変えるべき点

| 項目 | このサンプル | 別 Research（例: arxiv） |
|---|---|---|
| `id` | `com.akari.example.web-search` | `com.your-org.arxiv` |
| `[mcp].tools` | `research.search` / `research.deep_read` / `research.save_to_pool` | `arxiv.search` / `arxiv.fetch_pdf` / `research.save_to_pool` |
| `[permissions].external-network` | `api.tavily.com` 他 | `export.arxiv.org` / `arxiv.org` |
| Provider 実装 | Tavily | arxiv API クライアント（provider 抽象に乗せるか直接呼ぶかは自由） |

---

## Cross-over 2 パターン

### Research → Pool（必須・Phase 0）

`research.save_to_pool` で直接保存。handoff ではなく内部アクション。

- `mime: "text/research-result"` — 個別ヒット
- `mime: "text/research-answer"` — AI 要約
- `mime: "application/research-cache"` — 1 時間キャッシュ（内部）

### Research → Writer（Phase 0 送信側のみ）

```
app.handoff({
  to:      "com.akari.example.writer",
  intent:  "quote-from-research",
  payload: {
    query,
    items:   [{ title, url, snippet, body? }],
    answer?: "<AI answer markdown>"
  }
})
```

Phase 0 時点で Writer example は未実装。intent は予約のみで、Writer example 作成時に受信側を実装する。

### Research → Notion（Phase 1）

notion example の既存 `save-to-notion-db` intent に乗るだけ。Phase 0 ではボタン非表示。

---

## TODO — production 移行に必要な置換

| ID | ファイル | 内容 |
|---|---|---|
| T-a | `mcp-server/tools.ts` | `poolPut` / `poolGetCache` / `poolPutCache` / `ampRecord` stub を `@akari-os/sdk` の実 API に差し替え |
| T-b | `mcp-server/providers/tavily.ts` | API key 取得を env から AKARI Keychain API に移行 |
| T-c | `mcp-server/providers/{brave,exa}.ts` | Phase 1 実装（REST 呼び出し + answer マッピング） |
| T-d | `mcp-server/tools.ts` | `research.summarize` 追加（Phase 1、AKARI Agents 依存） |
| T-e | `panel.schema.json` | `save-to-notion-db` handoff ボタン追加（Phase 1） |

---

## Related docs

- [Spec (`AKARI-SDK-004`)](../../docs/specs/spec-example-web-search.md) — 本 example の詳細仕様
- [読み方ガイド](../../docs/examples/web-search.md)
- [MCP-Declarative Tier ガイド](../../docs/tiers/mcp-declarative-tier.md)
- [HITL patterns](../../docs/cookbook/hitl-patterns.md)
- [Cross-over handoff](../../docs/cookbook/cross-over-handoff.md)
- Tavily docs: https://docs.tavily.com/

---

## License

MIT — see [../../LICENSE](../../LICENSE)
