---
spec-id: AKARI-SDK-004
version: 0.1.0
status: accepted
created: 2026-04-24
updated: 2026-04-24
related-specs:
  - AKARI-SDK-001
  - AKARI-SDK-002
  - AKARI-SDK-003
  - AKARI-HUB-007
ai-context: claude-code
---

# AKARI-SDK-004: example/web-search — Research カテゴリ参考実装

## 概要

AKARI SDK `examples/` に、**Research カテゴリ**の最初のリファレンス実装として Web 検索特化 App を追加する。

- **App ID**: `com.akari.example.web-search`
- **Tier**: MCP-Declarative
- **Category**: Research
- **位置づけ**: `notion` / `x-sender` に続く 3 本目の example。Research **upstream**（素材供給側）の雛形として、Writer / Notion などへの handoff 起点となる。

最大の特徴は **AI 要約を provider の answer 機能で賄う**こと。独自 LLM 呼び出しなしで「検索 + AI 要約 + 保存」が成立することを示す。

---

## Goals / Non-goals

### Goals

- MCP-Declarative Tier で Research カテゴリ App が成立することの実証
- **Provider answer 機能に乗る AI 要約**の雛形（Tavily `include_answer`）
- **複数 provider 対応の構造**を示す（Phase 0 は Tavily 単独、コードは provider 抽象化）
- **Research → Pool**（素材蓄積）と **Research → Writer**（引用 handoff）の upstream パターン実証
- 他 Research 系 App（arxiv / scholar / internal-search など）が clone して使える雛形

### Non-goals

- 独自 LLM 呼び出しによる要約（Phase 1 以降、`research.summarize` で別途）
- RSS / フィード購読（別 example の領分）
- Research セッション管理（`research-session` AMP kind、Phase 1 以降）
- UI のリッチ化（3 ペイン複雑レイアウト等は Full Tier example の責務）

---

## アーキテクチャ

```
examples/web-search/
├── README.md
├── package.json
├── tsconfig.json
├── akari.toml                  tier = "mcp-declarative", category = "research"
├── panel.schema.json           3-tab layout (Search / Read / Pool Export)
├── locales/
│   ├── ja.json
│   └── en.json
├── mcp-server/
│   ├── index.ts                McpServer startup (stdio)
│   ├── tools.ts                research.search / research.deep_read / research.save_to_pool
│   ├── providers/
│   │   ├── index.ts            Provider インターフェース + factory
│   │   ├── tavily.ts           Phase 0 実装
│   │   ├── brave.ts            Phase 1 stub（インターフェース確認用の skeleton のみ）
│   │   └── exa.ts              Phase 1 stub
│   └── types.ts                Provider 共通型（Result, AnswerResult）
└── .env.example                TAVILY_API_KEY / PROVIDER=tavily
```

### Provider 抽象化（肝）

```ts
// providers/index.ts
export interface SearchProvider {
  name: "tavily" | "brave" | "exa";
  search(args: SearchArgs): Promise<SearchResult>;
  deepRead(url: string): Promise<DeepReadResult>;
}

export interface SearchResult {
  results: Array<{ title: string; url: string; snippet: string; score?: number }>;
  answer?: string;          // provider の AI 合成答え（あれば）
  answer_sources?: string[];
}

export function getProvider(name?: string): SearchProvider {
  switch (name ?? process.env.PROVIDER ?? "tavily") {
    case "tavily": return new TavilyProvider();
    case "brave":  return new BraveProvider();
    case "exa":    return new ExaProvider();
  }
}
```

**Phase 0**: Tavily のみ実装、`brave.ts` / `exa.ts` は `throw new Error("Phase 1")`。README に差し替え手順を記す。

---

## MCP tools

| # | ツール | 引数（要約） | 返り値 | HITL | Phase |
|---|---|---|---|:---:|:---:|
| 1 | `research.search` | `query`, `max_results?`, `include_answer?` | `{ results[], answer?, answer_sources? }` | — | 0 |
| 2 | `research.deep_read` | `url` | `{ title, content_markdown, fetched_at }` | — | 0 |
| 3 | `research.save_to_pool` | `items[]`, `tags?`, `note?` | `{ pool_ids[] }` | `text-summary` | 0 |
| 4 | `research.summarize` | `pool_ids[]`, `prompt?` | `{ summary_md }` | `text-summary` | 1 |

### `research.search`

- `include_answer: true` の場合、provider が `answer` フィールドに AI 合成を返す（Tavily の `include_answer=true`）
- `answer_sources` は answer 生成に使われた URL 配列
- Pool キャッシュ: 同一 query + provider の結果は 1 時間 Pool にキャッシュ（`mime: "application/research-cache"`, `tags: ["research-cache", <query-hash>]`）

### `research.deep_read`

- Tavily なら `search` の `include_raw_content=true` 経由で取得（別 API ではなく search 再利用）
- 結果は Pool には自動保存しない（`save_to_pool` で明示）

### `research.save_to_pool`

- `items` は `{ title, url, snippet, body?, kind: "result" | "answer" }` の配列
- Pool schema は下記「Pool 保存スキーマ」参照
- AMP 記録: `kind: "research-action"`, data: `{ provider, query, result_count, saved_to_pool: [ids] }`

---

## Panel Schema（3 タブ）

```
layout: "tabs"
tabs:
  - id: "search"       label: "Search"
  - id: "read"         label: "Read"         enabled_when: selected_result != null
  - id: "pool-export"  label: "Pool Export"  enabled_when: selected_results.length > 0
```

### Tab 1 — Search

| フィールド | widget | bind |
|---|---|---|
| `query` | `text-input` | `$query` |
| `provider` | `select` | `$provider`, options: `[tavily, brave, exa]`（Phase 0 は tavily 以外 disabled） |
| `max_results` | `number` (5-20, default 10) | `$max_results` |
| `include_answer` | `toggle` (default true) | `$include_answer` |
| — 結果表示 — | | |
| AI answer panel | `markdown-display` | `$search_result.answer`, visible_when: `$search_result.answer != null` |
| Results table | `data-table` columns=[title, url, snippet] | `$search_result.results` |
| `[Search]` button | action: `mcp`, tool: `research.search` | — |

### Tab 2 — Read

- 選択した結果の本文（`research.deep_read` 結果）を `markdown-display` で表示
- `[Quote to Writer]` ボタン: handoff intent `quote-from-research`
- `[Save to Pool]` ボタン: 単体 Pool 保存

### Tab 3 — Pool Export

- 結果リスト（複数選択可）
- `tags` 入力（default: `["research", "web-search", <query-slug>, <provider>]`）
- `note` textarea（任意メモ）
- `[Save N items to Pool]` ボタン: `research.save_to_pool` + HITL `text-summary`

---

## HITL 方針

| アクション | HITL | preview |
|---|:---:|---|
| `research.search` | 不要 | read-only |
| `research.deep_read` | 不要 | URL 取得のみ |
| `research.save_to_pool` | **必須** | `text-summary`: 「N 件を Pool に保存します」 |
| handoff → Writer (`quote-from-research`) | **必須** | `text-summary`: 「引用を Writer に送ります」 |

---

## Cross-over パターン

### Research → Pool（Phase 0・必須）

`research.save_to_pool` で直接保存。handoff ではなく内部アクション。

### Research → Writer（Phase 0・推し）

```
app.handoff({
  to:      "com.akari.example.writer",   // 将来の Writer example
  intent:  "quote-from-research",
  payload: {
    query,
    items:     [{ title, url, snippet, body? }],
    answer?:   "<AI answer markdown>",
    amp_ref:   "<research-action record id>"
  }
})
```

Phase 0 時点で Writer example は無いので、handoff 送信側の実装 + intent 仕様を spec に残すのみ。受信側は Writer example 作成時に対応する。

### Research → Notion（Phase 1）

notion example の既存 intent `save-to-notion-db` にそのまま乗る。Phase 0 はボタンを hidden。

---

## Pool 保存スキーマ

### 検索結果（個別）

```jsonc
{
  mime: "text/research-result",
  tags: ["research", "web-search", "<query-slug>", "<provider>"],
  source: { provider: "tavily", query, url, fetched_at },
  body: "# <title>\n\n<url>\n\n<snippet>\n\n---\n\n<body_markdown?>"
}
```

### AI answer

```jsonc
{
  mime: "text/research-answer",
  tags: ["research", "web-search", "<query-slug>", "<provider>", "ai-answer"],
  source: { provider: "tavily", query, answer_sources: [urls] },
  body: "# Answer for: <query>\n\n<answer_markdown>\n\n## Sources\n- <url1>\n- <url2>"
}
```

### 検索キャッシュ（内部）

```jsonc
{
  mime: "application/research-cache",
  tags: ["research-cache", "<query-hash>"],
  source: { provider, query, cached_at, ttl_sec: 3600 },
  body: "<SearchResult JSON>"
}
```

---

## AMP 記録

```jsonc
{
  kind: "research-action",
  goal_ref: "<session_id?>",              // Phase 1 research-session 用、Phase 0 は null
  data: {
    provider: "tavily",
    query: "<string>",
    result_count: <n>,
    saved_to_pool: ["<pool_id>", ...],    // save 時のみ
    handoff_to: "<app_id?>",              // handoff 時のみ
    answer_used: <boolean>                // AI answer を Pool / handoff に含めたか
  }
}
```

---

## Permissions（`akari.toml`）

```toml
[permissions]
external-network = [
  "api.tavily.com",        # Phase 0 固定
  "api.search.brave.com",  # Phase 1（コメントアウト可）
  "api.exa.ai"             # Phase 1
]
pool = ["read", "write"]
amp = ["write"]
oauth = []                 # Phase 0 は API key 方式のみ、OAuth 無し
```

Secrets: `TAVILY_API_KEY` を env から読む。プロダクションでは AKARI Keychain API（Phase 1 置換、notion と同じ TODO パターン）。

---

## Phase 分割

### Phase 0 — MVP（本 spec 対象）

- Tavily provider 単独実装
- tools: `search` / `deep_read` / `save_to_pool`
- 3 タブ Panel Schema
- Cross-over: Research → Pool（必須）、Research → Writer（送信側のみ）
- HITL: `save_to_pool` + handoff
- `akari app certify` 通過

### Phase 1 — 拡張（別 spec）

- Brave / Exa provider 実装
- `research.summarize` tool（AKARI Agents 依存）
- Research → Notion（notion example 側受信）
- Research セッション機能（`research-session` AMP kind）
- Keychain API 統合

---

## Tasks（Phase 0）

| ID | ファイル | 内容 |
|---|---|---|
| T-0 | — | `examples/web-search/` ディレクトリ雛形作成（`x-sender` を参考） |
| T-1 | `package.json`, `tsconfig.json` | workspace 設定、`@modelcontextprotocol/sdk`, `@tavily/mcp` or `tavily-core` 依存 |
| T-2 | `akari.toml` | tier / category / permissions / mcp server 設定 |
| T-3 | `mcp-server/providers/` | `SearchProvider` インターフェース + Tavily 実装 + Brave/Exa stub |
| T-4 | `mcp-server/tools.ts` | `research.search` / `research.deep_read` / `research.save_to_pool` の Zod schema + handler |
| T-5 | `panel.schema.json` | 3 タブ layout、AI answer panel、Pool 保存フォーム |
| T-6 | `locales/{ja,en}.json` | 全 `{{t:key}}` の翻訳 |
| T-7 | `mcp-server/index.ts` | Server 起動 + Pool キャッシュ glue |
| T-8 | `README.md` | Quick start / Provider 差し替え方法 / Patterns to borrow |
| T-9 | `docs/examples/web-search.md` | 読み方ガイド（`notion.md` / `x-sender.md` と同形式） |
| T-10 | `examples/README.md` | 本 example を追加 |
| T-11 | `docs/INDEX.md`, `docs/README.md` | Master Index 更新（RULES ルール 4 遵守） |
| T-12 | — | `pnpm akari app certify` 通過確認 |

---

## 受入基準

1. **ビルド**: `pnpm --filter @akari-os-examples/web-search build` が通る
2. **certify**: `pnpm akari app certify` が Lint / Contract Test を通過
3. **動作（Tavily）**: `TAVILY_API_KEY` 設定後、Shell 上で検索 → AI answer 表示 → 結果を Pool 保存、が通しで動く
4. **Provider 抽象化**: README の手順で `PROVIDER=brave` に切替えた時、「Phase 1」エラーが明示的に出る（silently 落ちない）
5. **HITL**: `save_to_pool` と `quote-from-research` handoff で text-summary プレビューが出る
6. **AMP**: Pool 保存時に `research-action` record が書かれる（`amp.list` で確認可）
7. **INDEX**: `docs/INDEX.md` / `docs/README.md` / `examples/README.md` に本 example が追加されている

---

## 関連

- Related specs: AKARI-SDK-001 (SDK 型定義) / AKARI-SDK-002 (schema-panel) / AKARI-SDK-003 (app CLI) / AKARI-HUB-007 (x-sender Phase 0)
- 既存 example: `examples/notion/` / `examples/x-sender/` / `examples/hello-full/`
- 公開版 MCP: Tavily (`@tavily/mcp` or `npm:tavily-mcp`) / Brave Search MCP / Exa MCP
- Panel Schema v0: `docs/api-reference/panel-schema.md`
- HITL patterns: `docs/cookbook/hitl-patterns.md`
- Cross-over: `docs/cookbook/cross-over-handoff.md`
