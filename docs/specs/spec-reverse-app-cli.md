---
spec-id: AKARI-SDK-003
version: 0.1.0
status: implemented
created: 2026-04-22
updated: 2026-04-22
related-specs:
  - AKARI-HUB-024
  - ADR-015
  - AKARI-SDK-001
  - AKARI-SDK-002
ai-context: claude-code
---

# AKARI-SDK-003: app-cli — App Toolchain

## 概要

`akari-app-cli`（パッケージ実体: `packages/app-cli/`）は、AKARI App の開発・認定・公開を支えるコマンドラインツール。AKARI-HUB-024 §6.9 が定義する Toolchain を実装する。

エントリポイントは `src/cli.ts`（Commander.js ベース）。コマンドは `create` / `dev` / `app` の 3 系統に分類される。

---

## パッケージ構成

```
packages/app-cli/
  src/
    cli.ts                    — エントリポイント（Commander.js）
    commands/
      create.ts               — `akari create <name>`
      dev.ts                  — `akari dev` [stub]
      certify.ts              — `akari app certify`
      validators/
        manifest.ts           — akari.toml 検証
        panel-schema.ts       — panel.schema.json 検証
        naming.ts             — 命名規則 lint（ADR-011）
        category.ts           — カテゴリ enum lint（ADR-013）
        expression.ts         — JSONLogic 式 lint（ADR-012）
        contract-test.ts      — Contract Test スタブランナー
    templates/
      full/                   — Full Tier テンプレート（Handlebars）
      mcp-declarative/        — MCP-Declarative Tier テンプレート（Handlebars）
  docs/
    certify.md                — `akari app certify` の詳細ドキュメント
```

---

## コマンド一覧

### `akari create <name>` — App スキャフォールド

Full または MCP-Declarative Tier の App ディレクトリを Handlebars テンプレートから生成する。

**オプション:**

| オプション | 説明 | デフォルト |
|---|---|---|
| `--tier <full\|mcp-declarative>` | App Tier（省略時はインタラクティブ選択） | — |
| `--author <author>` | 著者名（省略時は `$USER` または `"anonymous"`） | — |
| `--category <category>` | App カテゴリ（`productivity`, `sns`, `research` 等） | `"productivity"` |

**入力バリデーション:**
- `<name>` は kebab-case（`/^[a-z][a-z0-9-]*$/`）必須。違反時は即時終了（exit 1）。
- 同名のディレクトリが既に存在する場合も終了（exit 1）。

**テンプレート変数:**

| 変数 | 例 | 導出ルール |
|---|---|---|
| `appId` | `com.user.my-app` | `com.user.<name>` 固定 |
| `appName` | `My App` | kebab → Title Case |
| `appSlug` | `my-app` | `<name>` そのまま |
| `appShortId` | `my_app` | app ID の最後セグメントを snake_case に変換（ADR-011） |
| `category` | `productivity` | `--category` または対話入力 |
| `tier` | `full` | `--tier` または対話選択 |
| `sdkRange` | `>=0.1.0 <1.0` | 固定値 |

**生成物（Full Tier）:**
- `akari.toml` — App Manifest
- `package.json`
- `src/index.ts` — エージェント実装スケルトン
- `src/panel.tsx` — React Panel スケルトン
- `README.md`
- `.gitignore`

**生成物（MCP-Declarative Tier）:**
- `akari.toml`
- `panel.schema.json` — Panel Schema v0 スケルトン
- `mcp-server/index.ts` — MCP サーバー実装スケルトン
- `mcp-server/tools.ts` — MCP ツール定義スケルトン
- `package.json`
- `README.md`
- `.gitignore`

**Next steps 表示:**
```
cd <name>
npm install
akari dev
```

---

### `akari dev` — ローカル開発サーバー [stub]

MCP サーバーを起動し、Panel Schema プレビュアーをローカルで動かす。

**オプション:**

| オプション | 説明 | デフォルト |
|---|---|---|
| `-d, --dir <path>` | App ルートディレクトリ | `"."` |
| `-p, --port <number>` | Panel プレビュアーのポート | `3737` |

**現在の状態:** STUB（Phase 2b 実装待ち）

> **accepted 化ブロッカー（AKARI-HUB-024）**
> - **AC-1**: `akari dev` スタブ解消 — `process.exit(0)` のみの現実装を、MCP サーバー起動 + Panel プレビュアー起動の実装に置換するまで accepted に移行できない。
> - **AC-2**: Rust 型定義未実装 — HUB-024 が要求する Rust 側の型定義が未着手のため、SDK との型整合性が検証できない状態。

Phase 2b で予定される実装:
1. `akari.toml` 読み込み → tier / MCP server path / panel schema paths を取得
2. MCP サーバープロセスを spawn（`node <mcp-server-path>`）
3. Panel Schema プレビュアー（Fastify + React + `<SchemaPanel>`）を起動
4. `chokidar` で `akari.toml` / `panel.schema.json` を監視 → ホットリロード
5. SIGINT / SIGTERM でグレースフルシャットダウン

Phase 3 で予定される実装:
- ローカル Shell インスタンスへのホットマウント（Shell development overlay 経由）

---

### `akari app certify` — 認定パイプライン

App ディレクトリに対して Automated Lint + Contract Test を実行し、認定レポートを出力する。マーケット掲載に必要な品質ゲートの機械検証部分を担う。

**オプション:**

| オプション | 説明 | デフォルト |
|---|---|---|
| `-d, --dir <path>` | App ルートディレクトリ | `"."` |

**Exit code:**
- `0` — 全チェック通過（CI セーフ）
- `1` — 1 件以上のエラー

**実行ステップ:**

| Step | 内容 | 対象 Tier |
|---|---|---|
| 1 | `akari.toml` パース + スキーマ検証（`validators/manifest.ts`） | Both |
| 2/3 | `panel.schema.json` 検証（`validators/panel-schema.ts` / HUB-025） | MCP-Declarative のみ |
| 4 | 命名規則 lint（App ID / Agent ID / `validators/naming.ts` / ADR-011） | Both |
| 5 | カテゴリ enum lint（`validators/category.ts` / ADR-013） | Both |
| 6 | JSONLogic 式 lint（`panel.schema.json` 内の `visible_when` / `enabled_when` / `validators/expression.ts` / ADR-012） | MCP-Declarative のみ |
| 7 | Contract Test スタブランナー（`validators/contract-test.ts` / HUB-024 §6.8） | Both |

**レポート出力例:**
```
✓ PASS  Manifest (akari.toml)
✓ PASS  Panel Schema [main] (HUB-025)
✓ PASS  JSONLogic Expressions [main] (ADR-012)
✓ PASS  Naming Convention (ADR-011)
✓ PASS  Category Enum (ADR-013)
○ STUB  Contract Test: Agent API
○ STUB  Contract Test: Memory API
...
✓ Certification PASSED
```

**Validator 詳細:**

`manifest.ts` — `akari.toml` の TOML パースと必須フィールド検証。`ManifestValidationResult` を返す（`valid`, `errors[]`, `warnings[]`, `manifest?`）。

`panel-schema.ts` — `panel.schema.json` の JSON パースと Panel Schema v0 スキーマ適合性検証。

`naming.ts` — App ID の reverse-domain 形式と、Agent ID の `<app-short-id>_<role>` snake_case 形式（ADR-011）を lint。

`category.ts` — `app.category` フィールドが ADR-013 で定義された enum 値（`productivity`, `sns`, `research` 等）に含まれるかを検証。

`expression.ts` — `panel.schema.json` 内の全 `visible_when` / `enabled_when` フィールドを走査し、JSONLogic 式として parse 可能かを検証（ADR-012）。

`contract-test.ts` — 7 API の Contract Test スタブランナー。現時点では各テストスイートを `STUB` ステータスで出力（Phase 2b で実際のテスト実行に置換予定）。

---

### `akari app publish` [未実装]

AKARI Marketplace への App 公開。`akari app certify` のパス後に実行できる想定。現状は exit 1 でエラー終了。

### `akari app add <appId>` [未実装]

AKARI Marketplace または npm から App をインストール。現状は exit 1 でエラー終了。

---

## 認定フローの全体像

```
akari create <name>         # テンプレートから App を生成
  ↓
akari dev                   # ローカルで動作確認（stub）
  ↓
akari app certify           # 自動 lint + contract test
  ↓
(Manual Review)             # Marketplace 掲載時のみ必要
  ↓
akari app publish           # Marketplace 公開（未実装）
```

---

## 設計上の制約と注意点

- `akari create` で生成される `appId` は `com.user.<name>` 形式の仮値。実際のリリース前に逆ドメイン形式（例: `com.myorg.myapp`）に変更する必要がある。
- `akari dev` は現状スタブのため、`process.exit(0)` で即終了する。ローカルサーバーは立ち上がらない。
- Contract Test（Step 7）は現状すべて `STUB` ステータスで返却される。CI での exit 0 判定には影響しない（STUB は失敗扱いではない）。
- Full Tier App は Panel Schema 検証（Step 2/3）と JSONLogic 式 lint（Step 6）がスキップされる。

---

## 参照

- 実装: `packages/app-cli/src/`
- certify 詳細: [`packages/app-cli/docs/certify.md`](../../packages/app-cli/docs/certify.md)
- 関連 spec: AKARI-HUB-024 §6.8 (Certification), §6.9 (Toolchain), ADR-015
- テンプレート: `packages/app-cli/src/templates/`
