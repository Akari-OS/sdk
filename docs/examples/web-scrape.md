---
title: web-scrape — MCP-Declarative + Playwright ブラウザ自動化ガイド
created: 2026-06-13
updated: 2026-06-13
related-specs: [AKARI-HUB-104]
---

# web-scrape — Web スクレイピング App リファレンス実装

> **実装パス**: `examples/web-scrape/`
> **パッケージ名**: `@akari-os-examples/web-scrape`
> **Tier**: MCP-Declarative
> **App ID**: `com.akari.example.web-scrape`
> **対象 spec**: AKARI-HUB-104（Web Research & Scraping Connector）
> **カテゴリ**: research

---

## 1. 概要

`web-scrape` は Playwright ブラウザ自動化を使った MCP-Declarative App のリファレンス実装。
[web-search](./web-search.md) が API ベースの検索インジェクター（AKARI-SDK-004）であるのに対し、
`web-scrape` はブラウザを直接制御する scraping コネクター（HUB-104）として位置づけられる。

**提供する MCP ツール**:

| ツール | 役割 |
|---|---|
| `scrape.search` | Google 等の検索結果ページをスクレイプ |
| `scrape.images` | 画像検索ページからメディアを収集 |
| `scrape.page` | 任意 URL のページ本文を取得 |
| `scrape.save_to_pool` | 収集結果を Pool に保存（usage_right 付き） |

---

## 2. akari.toml の読みどころ

```toml
[app]
tier     = "mcp-declarative"
category = "research"

[mcp]
server = "dist/mcp-server/index.js"    # tsup でビルド済みのサーバー
tools  = ["scrape.search", "scrape.images", "scrape.page", "scrape.save_to_pool"]

[permissions]
external-network = ["*"]    # ブラウザ自動化のため全ドメインへの外部アクセスが必要
process          = true     # Chromium バイナリの spawn に必要
pool             = ["read", "write"]
amp              = ["write"]
```

**重要**: `external-network = ["*"]` は最も広い権限要求。
`akari app certify` での Manual Review では用途の正当性が審査される。

---

## 3. web-search との違い（Channel Policy HUB-104 §5-1）

| 対象 | web-search | web-scrape |
|---|---|---|
| X (Twitter) | API 経由（web-search） | — |
| Google / Web 検索 | — | Playwright scraping |
| 画像収集 | — | Playwright scraping |
| Instagram | — | Phase 1b（未実装） |

---

## 4. ビルドと実行

```bash
cd examples/web-scrape
pnpm install

# Playwright の Chromium バイナリを初回インストール
npx playwright install chromium

# MCP サーバーをビルド
pnpm build    # tsup — dist/mcp-server/index.js を生成

# 開発時
pnpm dev      # akari dev
```

> **注意**: web-search と異なり、Playwright は単一 ESM バンドルに含められない（Chromium バイナリを spawn するため）。
> `node_modules` が必須で、`npx playwright install chromium` のブラウザ初期化ステップが追加で必要。

---

## 5. 環境変数（politeness 設定）

`akari.toml` の `[mcp.env]` で spec デフォルト値を設定済み。Shell の App 設定画面からユーザーが変更できる。

| 変数 | デフォルト | 説明 |
|---|---|---|
| `SCRAPE_INTERVAL_MODE` | `exponential` | リクエスト間隔の増加方式 |
| `SCRAPE_INTERVAL_BASE_MS` | `3000` | ベース間隔（ms） |
| `SCRAPE_RESPECT_ROBOTS_TXT` | `true` | robots.txt の遵守 |
| `SCRAPE_STEALTH_ENGINE` | `patchright` | ステルスエンジン |
| `SCRAPE_HEADLESS` | `true` | ヘッドレスモード |

---

## 6. Pool への保存パターン（scrape.save_to_pool）

収集したコンテンツは `scrape.save_to_pool` で Memory Layer（Pool）に保存する。

```typescript
// MCP ツール呼び出し例
await client.callTool("scrape.save_to_pool", {
  url: "https://example.com/article",
  usage_right: "reference",    // "reference" | "remix" | "commercial"
  tags: ["research", "scrape"]
})
// → Pool item ID が返る
```

`usage_right` フィールドは HUB-104 §6-1 の権利情報管理仕様に従う。
収集したコンテンツの用途（参照のみ / リミックス可 / 商用利用可）を記録する。

---

## 7. 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [web-search ガイド](./web-search.md) | API ベースの検索コネクター（AKARI-SDK-004） |
| [MCP-Declarative Tier ガイド](../tiers/mcp-declarative-tier.md) | Tier の詳細 |
| [Permission API](../api-reference/permission-api.md) | 権限宣言の詳細 |
| [Memory API](../api-reference/memory-api.md) | Pool への保存パターン |
