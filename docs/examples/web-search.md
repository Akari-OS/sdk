# Web Search — 読み方ガイド（SDK-004）

> **対象 spec**: [`spec-example-web-search.md (AKARI-SDK-004)`](../specs/spec-example-web-search.md) v0.1.0
> **Tier**: MCP-Declarative
> **カテゴリ**: Research
> **公式 MCP**: △（`@tavily/core` を REST 直接呼び。provider 抽象化で差し替え可能）
> **位置づけ**: HUB-005 v0.2 **Research カテゴリの最初のリファレンス実装**。
> upstream（素材供給）側の雛形で、Writer / Notion などへの handoff 起点となる。

---

## 1. App 概要

Web Search は **Web 検索 → AI 要約 → Pool / Writer への供給**を担当する Research App。

```
com.akari.example.web-search
  ├── akari.toml               ← tier = "mcp-declarative", category = "research"
  ├── mcp-server/
  │   ├── index.ts             ← MCP server エントリ
  │   ├── tools.ts             ← 3 tools
  │   └── providers/           ← ★ SearchProvider 抽象化（Tavily active / Brave & Exa stub）
  ├── panel.schema.json        ← 3 タブ（Search / Read / Pool Export）
  └── locales/{ja,en}.json
```

**最大の特徴は 3 つ**：

1. **AI 要約を provider の answer 機能に乗せる** — 独自 LLM を呼ばずに Tavily `include_answer` で済ませる
2. **Provider 抽象化**を雛形として示す — Phase 0 は Tavily 単独だが、interface + factory で差し替え可能な構造
3. **Research upstream** としての 2 方向 cross-over — Pool 保存（素材蓄積）と Writer への引用 handoff

### なぜこれが参考実装として最適か

- **Research カテゴリ最小構成**: tools 3 個・3 タブ。読み切れる分量で上記 3 テーマを全部見せる
- **OAuth 無し**: API key 認証のみ。Publishing / Documents と違う認証モデルの雛形
- **arxiv / scholar / internal-search** 等、他の Research App にそのまま流用できる

---

## 2. 読む順序

1. **`akari.toml`** — tier / category / permissions（OAuth 無しの最小構成を確認）
2. **`mcp-server/providers/index.ts`** — SearchProvider インターフェースと factory
3. **`mcp-server/providers/tavily.ts`** — 唯一の active provider。`include_answer` と `include_raw_content` の扱いがポイント
4. **`mcp-server/providers/{brave,exa}.ts`** — Phase 1 stub の書き方（明示的に throw する）
5. **`mcp-server/tools.ts`** — 3 tools の実装 + Pool/AMP stub
6. **`mcp-server/index.ts`** — MCP server エントリ、Zod schema 宣言
7. **`panel.schema.json`** — 3 タブ layout / state binding / navigate_tab / HITL
8. **`locales/ja.json`** — UI 文言

---

## 3. Provider 抽象化のキモ

```ts
export interface SearchProvider {
  readonly name: ProviderName;
  search(args: SearchArgs): Promise<SearchResponse>;
  deepRead(url: string): Promise<DeepReadResponse>;
}
```

**面積を意図的に小さく**保っている。`search` + `deepRead` の 2 メソッドだけで provider-agnostic にし、tools.ts は provider の存在を知らない（`getProvider(name)` を呼ぶだけ）。

### 各 provider の `answer` 対応表

| Provider | AI answer | 実装 |
|---|:---:|---|
| Tavily | ✅ | `include_answer=true` → `raw.answer` |
| Brave | ❌ | 空で返す。必要なら Phase 1 で `research.summarize` を被せて合成 |
| Exa | ✅ | `summary` フィールドを `answer` にマッピング |

**設計ポイント**: provider ごとに answer の有無が違うので、`SearchResponse.answer` を **optional** にして、Panel Schema 側で `visible_when: $search_result.answer != null` で安全に出し分けている。

---

## 4. Pool 保存スキーマ

3 種類を使い分け：

### 個別結果（`text/research-result`）

```json
{
  "mime": "text/research-result",
  "tags": ["research", "web-search", "<query-slug>", "tavily"],
  "source": { "provider": "tavily", "query", "url", "fetched_at" },
  "body": "# <title>\n\n<url>\n\n<snippet>"
}
```

### AI 要約（`text/research-answer`）

```json
{
  "mime": "text/research-answer",
  "tags": ["research", "web-search", "<query-slug>", "tavily", "ai-answer"],
  "source": { "provider": "tavily", "query", "answer_sources": [urls] },
  "body": "# Answer for: <query>\n\n<answer_md>\n\n## Sources\n- ..."
}
```

### 検索キャッシュ（`application/research-cache`、内部）

`{provider, query}` を 1 時間キャッシュ。ユーザーには見せない。Pool を使った **provider-neutral な TTL キャッシュ**の雛形として読む価値がある。

---

## 5. HITL 方針

| アクション | HITL | preview |
|---|:---:|---|
| `research.search` | 不要 | read-only |
| `research.deep_read` | 不要 | URL 取得のみ |
| `research.save_to_pool` | 必須 | `text-summary`: 「N 件を Pool に保存します」 |
| handoff `quote-from-research` | 必須 | `text-summary`: 「Writer にこの引用を送ります」 |

**原則**: 読み取り系は HITL 不要、**書き込みと外部送信（handoff 含む）は HITL 必須**。

---

## 6. Research upstream のクロスオーバー

```
           ┌──────────── Pool (素材蓄積)
           │
Research ──┼──────────── Writer (引用として取り込み)        ← Phase 0 送信側のみ
           │
           └──────────── Notion DB (Research→Notion intent) ← Phase 1
```

### Research → Writer（Phase 0 で intent 予約）

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

Writer example がまだ無いので、**送信側の実装と intent 仕様だけ確定**させて Phase 0 を締める。Writer example を作る時に受信側を埋める。

### Research → Notion（Phase 1）

notion example の既存 `save-to-notion-db` にそのまま乗る。`akari.toml` に handoff 権限を追加し、Panel Schema の action に `handoff` kind を追加するだけ。

---

## 7. Phase 分割の意図

| Phase | 中身 | 狙い |
|---|---|---|
| **0**（本 spec） | Tavily 単独 / provider 抽象化の骨格 / 3 tools / 2 タブ cross-over | 最小で「検索 + AI 要約 + 保存」が成立することの実証 |
| **1**（別 spec） | Brave / Exa 実装 / `research.summarize` / Research→Notion / Keychain 移行 / research-session | provider の自由度 + 独自 LLM 合成 + セッション管理で「本格的な Research App」へ |

Phase 0 の時点で **Phase 1 の拡張余地を構造に埋め込んでおく**のがポイント（provider factory、optional answer フィールド、goal_ref の予約など）。

---

## 8. 他 Research App を作るときに流用する部分

### そのまま使える

- 3 タブ layout（Search / Read / Pool Export）
- `SearchProvider` interface の 2 メソッド形
- Pool 保存 mime 3 種（`result` / `answer` / `cache`）
- AMP `research-action` kind
- HITL: save と handoff に `text-summary`
- Writer への intent 名 `quote-from-research`

### App ごとに書き換える

| 項目 | Web Search | 別 Research 例（arxiv） |
|---|---|---|
| `id` | `com.akari.example.web-search` | `com.your-org.arxiv` |
| `[mcp].tools` | `research.search` / `research.deep_read` / `research.save_to_pool` | `arxiv.search` / `arxiv.fetch_pdf` / `research.save_to_pool`（後者は共通名で揃える） |
| Provider 実装 | Tavily REST | arxiv API クライアント |
| `external-network` | `api.tavily.com` | `export.arxiv.org` |

---

## 9. 関連 docs

- **Spec**: [`AKARI-SDK-004`](../specs/spec-example-web-search.md)
- **実装**: [`examples/web-search/`](../../examples/web-search/)
- **MCP-Declarative Tier ガイド**: [`../tiers/mcp-declarative-tier.md`](../tiers/mcp-declarative-tier.md)
- **HITL パターン**: [`../cookbook/hitl-patterns.md`](../cookbook/hitl-patterns.md)
- **Cross-over handoff**: [`../cookbook/cross-over-handoff.md`](../cookbook/cross-over-handoff.md)
- **Tavily docs**: https://docs.tavily.com/
