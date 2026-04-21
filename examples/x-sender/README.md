# X Sender — AKARI MCP-Declarative App 参考実装

> **App ID**: `com.akari.example.x-sender`
> **Tier**: MCP-Declarative
> **Category**: Publishing

AKARI App SDK の **MCP-Declarative Tier** を使って、X (旧 Twitter) への投稿フォームを実装した参考実装です。
App 開発者が clone してすぐ動かせる最小構成です。

---

## What you'll learn

1. **MCP-Declarative Tier の最小構成** — `akari.toml` + MCP サーバー + `panel.schema.json` だけで AKARI App が成立することを体験できる
2. **Panel Schema の `bind` パターン** — フォームフィールドと MCP ツール引数を宣言的に結びつける方法
3. **HITL（Human-in-the-loop）の組み込み方** — 外部公開アクションに `hitl.require: true` を付ける設計と、`enabled_when` による排他ボタン制御
4. **OAuth 2.0 PKCE フローの構造** — MCP サーバー側で認証ライフサイクルを管理する設計（`oauth.ts` の PKCE ヘルパー群）
5. **Publishing カテゴリの雛形** — LINE / Threads / Bluesky など類似 App を作るときにそのまま流用できる構造

---

## Prerequisites

- **Node.js 18+**
- **X Developer App** (OAuth 2.0 enabled, Read + Write permissions)
  - Developer Portal: https://developer.twitter.com/en/portal/dashboard
- **AKARI Shell installed** (`pnpm akari dev` が動く環境)

---

## Quick start

```bash
# 1. このリポジトリをクローン
git clone https://github.com/Akari-OS/sdk.git
cd examples/x-sender

# 2. 環境変数を設定
cp .env.example .env
# .env を開いて X_CLIENT_ID / X_CLIENT_SECRET / OAUTH_REDIRECT_URI を記入

# 3. 依存をインストール
pnpm install

# 4. AKARI 開発サーバーで起動
pnpm dev
# → Shell に x-sender App が mount されます
```

> **dry_run モードで試す場合**: `.env` の設定なしに MCP ツールの動作を確認したい場合は、
> `x.post` の引数に `dry_run: true` を渡してください。X API は叩かずログのみ出力されます。

---

## Structure

```
examples/x-sender/
├── README.md               このファイル
├── package.json            npm package (private, @akari-os-examples/x-sender)
├── tsconfig.json           extends ../../tsconfig.base.json
├── akari.toml              App Manifest (MCP-Declarative Tier)
├── panel.schema.json       Panel Schema v0 — 投稿フォーム宣言
├── locales/
│   ├── ja.json             日本語 i18n
│   └── en.json             英語 i18n
├── mcp-server/
│   ├── index.ts            MCP server エントリ (StdioServerTransport)
│   ├── tools.ts            x.post / x.schedule / x.draft_save / x.get_me
│   ├── oauth.ts            OAuth 2.0 PKCE フロー (Keychain 保存は TODO)
│   └── types.ts            X API レスポンス型
├── .env.example            必要な環境変数の一覧
└── .gitignore              dist/, node_modules/, .env
```

---

## MCP tools (Phase 0)

| ツール名 | 役割 | HITL | dry_run |
|---|---|:---:|:---:|
| `x.post` | 単発テキスト投稿（即時） | 必須 | 対応 |
| `x.schedule` | 予約投稿（datetime 指定） | 必須 | - |
| `x.draft_save` | 下書きを Pool に保存 | 不要 | - |
| `x.get_me` | 認証確認（アカウント情報取得） | 不要 | - |

> **HITL について**: `x.post` / `x.schedule` は外部公開アクションのため、Shell が自動でユーザー承認ダイアログを表示します。
> MCP ツール側での追加実装は不要です（`panel.schema.json` の `hitl.require: true` 宣言だけで動きます）。

---

## Patterns to borrow

このサンプルは **LINE / Threads / Bluesky など他の Publishing App** を作る際の雛形として設計されています。

### 変えるべき点

| 項目 | このサンプル | 別 SNS（例: LINE） |
|---|---|---|
| `id` | `com.akari.example.x-sender` | `com.your-org.line-sender` |
| `[mcp].tools` | `x.post`, `x.schedule`, ... | `line.send_message`, ... |
| `[permissions].oauth` | `["x.com"]` | `["access.line.me"]` |
| `[permissions].external-network` | `["api.x.com", "api.twitter.com"]` | `["api.line.me"]` |
| Panel Schema フィールド | `textarea` + `pool-picker` + `datetime-optional` | `select`（宛先） + `textarea` |

### 変えなくていい点

- `tier = "mcp-declarative"` — 同じ Tier
- HITL パターン (`hitl.require: true` + `preview: "custom-markdown"`)
- OAuth 2.0 PKCE フローの全体構造 (`oauth.ts`)
- AMP 記録の `kind: "publish-action"` + `goal_ref` パターン
- オフライン設計の考え方（書く = オフライン OK、送る = ネットワーク必須）

---

## Certification

```bash
# Automated Lint + Contract Test (AKARI App SDK §6.8)
pnpm akari app certify
```

certify は以下を自動検証します:

- `akari.toml` の `[mcp].tools` と `panel.schema.json` の `actions[].mcp.tool` の一致
- `panel.schema.json` の `bind` と MCP ツールの `inputSchema.required` の整合性
- `[permissions]` の宣言が実際の使用範囲に収まっているか

---

## Related docs

- [読み方ガイド (`../../docs/examples/x-sender.md`)](../../docs/examples/x-sender.md) — このサンプルの設計意図と学習ポイント
- [MCP-Declarative Tier ガイド (`../../docs/tiers/mcp-declarative-tier.md`)](../../docs/tiers/mcp-declarative-tier.md)
- [Panel Schema リファレンス](../../docs/api-reference/ui-api.md)

---

## License

MIT — see [../../LICENSE](../../LICENSE)
