# `akari app certify` — 認定パイプライン詳細

> Spec: AKARI-HUB-024 §6.8 Certification / §6.9 Toolchain
> Implementation: `src/commands/certify.ts`

---

## 概要

`akari app certify` は App を AKARI Marketplace や自己配布に向けて品質保証するための
自動化 Lint + Contract Test パイプラインです。

Certification 3 層のうち Automated Lint と Contract Test をカバーします。
Manual Review（Marketplace 掲載時）はこのコマンドの範囲外です。

| 層 | カバー | コマンド |
|---|---|---|
| Automated Lint | ✅ | `akari app certify` |
| Contract Test  | ✅ (スタブ) | `akari app certify` |
| Manual Review  | — | Marketplace 申請フロー |

---

## 使い方

```bash
# カレントディレクトリのアプリを検証
akari app certify

# ディレクトリを指定
akari app certify --dir ./my-app
```

**Exit code**:

- `0` — 全チェック PASS（CI で `akari app certify || exit 1` として使える）
- `1` — エラーあり

---

## 実行フロー（7 ステップ）

```
Step 1  akari.toml 読込 + Manifest バリデーション
Step 2  パネル種別確認（Full vs MCP-Declarative）
Step 3  Panel Schema バリデーション（MCP-Declarative のみ）
Step 4  命名規約 Lint（app id + agent ids）
Step 5  カテゴリ Lint
Step 6  JSONLogic 式 Lint（panel.schema.json 内）
Step 7  Contract Test スタブ実行
```

---

## 各 Validator の役割

### `validators/manifest.ts` — Manifest バリデータ

`akari.toml` を `@iarna/toml` でパースし、以下を検証します：

| フィールド | ルール |
|---|---|
| `[app] id` | 文字列、必須 |
| `[app] name` | 文字列、必須 |
| `[app] tier` | `"full"` または `"mcp-declarative"`、必須 |
| `[app] category` | 推奨（未設定は warning） |
| `[permissions]` | セクション必須 |
| Tier = mcp-declarative | `[mcp]` セクション + `server` フィールド必須 |
| Tier = mcp-declarative の panels | `schema` パス必須、`mount`（React）は使用不可 |

### `validators/panel-schema.ts` — Panel Schema v0 バリデータ

`panel.schema.json` を JSON Schema (HUB-025) に対して検証します：

| チェック | ルール |
|---|---|
| `$schema` | `"akari://panel-schema/v0"` 完全一致必須 |
| `layout` | `form \| tabs \| split \| dashboard \| list` |
| `fields[]` | 各 field に `id`（小文字英数字+ハイフン）+ `type` 必須 |
| `fields[].type` | HUB-025 §6.2 Widget Catalog の 38 種から選択 |
| `fields[].id` | アプリ内で一意 |
| `actions[]` | 各 action に `id` + `label` 必須 |
| `actions[].kind` | `primary \| secondary \| destructive \| ghost` |
| `mcp` / `handoff` | 同一 action に両方の指定は不可（排他） |

Ajv がインストール済みの場合は追加のディープ検証も行います。

### `validators/naming.ts` — 命名規約 Lint (ADR-011)

ADR-011 の App agent 命名規約を強制します：

| チェック | ルール |
|---|---|
| `[app] id` | 逆ドメイン形式 `^[a-z][a-z0-9]*(\.[a-z][a-z0-9_-]+)+$` |
| `[agents]` キー | `<app-short-id>_<role>` の snake_case |
| `<app-short-id>` | app id の最終セグメント、kebab → snake 変換 |
| Core 7 衝突 | `partner / studio / operator / researcher / guardian / memory / analyst` と同名は禁止 |

**例:**

```toml
[app]
id = "com.example.x-sender"   # short-id = "x_sender"

[agents]
x_sender_scheduler = "agents/scheduler.md"  # OK: prefix付き
editor = "agents/editor.md"                  # NG: prefix なし
analyst = "agents/analyst.md"                # NG: Core 7 衝突
```

### `validators/category.ts` — カテゴリ Lint (ADR-013)

`[app] category` フィールドを検証します：

**Core 11 固定 enum:**

```
publishing, documents, design, asset-generation, research,
translation, analytics, notification, storage, commerce, community
```

**拡張カテゴリ:**  `x-<kebab-slug>` パターン（例: `x-education`, `x-health`）

上記いずれにも該当しない値は **INVALID_CATEGORY** エラーになります（ADR-013）。

### `validators/expression.ts` — JSONLogic 式 Lint (ADR-012)

`panel.schema.json` 内の `enabled_when` / `visible_when` を検証します：

- **JSONLogic オブジェクト構文**: `{ "!=": [{ "var": "when" }, null] }` — 構造を再帰検証
- **シュガー文字列**: `"$when != null"` — JSONLogic に変換して検証

v0 で許可する演算子:

```
var, ==, !=, >, >=, <, <=, and, or, not, !, if, in, missing, missing_some
```

任意コード実行・eval は構造上不可能（JSONLogic は Turing-complete でない）。

### `validators/contract-test.ts` — Contract Test ランナー (スタブ)

HUB-024 §6.8 で定義する 7 API の trait-based テストを将来実装するための雛形。

現時点では全スイートが **STUB** ステータスで返ります：

| スイート | 将来実装する検証内容 |
|---|---|
| Agent API | agents/*.md spec ファイル存在確認、defineAgent() 形式検証 |
| Memory API | 自前 DB 使用検知、goal_ref 必須チェック |
| Permission API | gate() 呼び出しと manifest 宣言の整合性 |
| UI API | mountPanel() id と manifest panels の整合性 |
| Inter-App API | handoff() が ID のみ渡すことの確認 |
| Offline Contract | external-network=false 時のネット遮断テスト |
| MCP Tool Contract | tool input schema と panel bind の整合性 |

---

## エラーコード一覧

| コード | Validator | 説明 |
|---|---|---|
| `MANIFEST_NOT_FOUND` | manifest | akari.toml が見つからない |
| `TOML_PARSE_ERROR` | manifest | TOML パースエラー |
| `MISSING_APP_SECTION` | manifest | `[app]` セクションがない |
| `MISSING_PERMISSIONS_SECTION` | manifest | `[permissions]` セクションがない |
| `MISSING_FIELD` | manifest | 必須フィールドが欠けている |
| `INVALID_TIER` | manifest | tier が `full` / `mcp-declarative` 以外 |
| `MCP_DECLARATIVE_MISSING_MCP` | manifest | mcp-declarative なのに `[mcp]` がない |
| `MCP_DECLARATIVE_MISSING_SERVER` | manifest | `[mcp] server` がない |
| `MCP_DECLARATIVE_REACT_PANEL` | manifest | mcp-declarative パネルが `mount` を使っている |
| `MISSING_DOLLAR_SCHEMA` | panel-schema | `$schema` フィールドがない |
| `INVALID_SCHEMA_URI` | panel-schema | `$schema` が `akari://panel-schema/v0` でない |
| `MISSING_LAYOUT` | panel-schema | `layout` がない |
| `INVALID_LAYOUT` | panel-schema | 不正な layout 値 |
| `FIELD_MISSING_ID` | panel-schema | field に `id` がない |
| `FIELD_MISSING_TYPE` | panel-schema | field に `type` がない |
| `UNKNOWN_WIDGET_TYPE` | panel-schema | Widget Catalog にない type |
| `DUPLICATE_FIELD_ID` | panel-schema | field id が重複 |
| `DUPLICATE_ACTION_ID` | panel-schema | action id が重複 |
| `MCP_HANDOFF_EXCLUSIVE` | panel-schema | mcp と handoff が同時指定 |
| `APP_ID_NOT_REVERSE_DNS` | naming | app id が逆ドメイン形式でない |
| `AGENT_ID_MISSING_PREFIX` | naming | agent id に app-short-id prefix がない |
| `AGENT_ID_NOT_SNAKE_CASE` | naming | agent id が snake_case でない |
| `AGENT_ID_CORE_COLLISION` | naming | agent id が Core 7 と衝突 |
| `INVALID_CATEGORY` | category | Core 11 にも x-prefix にも該当しない category |
| `JSONLOGIC_MULTIPLE_KEYS` | expression | JSONLogic オブジェクトのキーが複数 |
| `JSONLOGIC_DISALLOWED_OPERATOR` | expression | v0 で許可されていない演算子 |
| `EXPRESSION_INVALID_TYPE` | expression | 式が文字列でも JSON オブジェクトでもない |

---

## 将来拡張

### Manual Review 連携（Phase 3+）

`akari app certify --submit` で Marketplace に Review 申請を送信。
certify が PASS していない場合はリジェクト。

### Contract Test 実装（Phase 2b）

`validators/contract-test.ts` の各スイートを Core モックと組み合わせて実際のテストに差し替え。
`akari app certify --contract-tests` オプションで明示実行。

### MCP Schema 整合性チェック（Phase 2b / HUB-025 T-10）

MCP サーバーを起動して `tools/list` を呼び出し、`panel.schema.json` の `bind` フィールドと
ツール input schema が整合しているかをリアルタイム検証。

### VSCode 統合（Phase 3 / HUB-025 T-11）

`akari app certify` のルールを VSCode Extension の inline lint として提供。
保存のたびにリアルタイムでエラーを表示。

---

## 必要な追加依存パッケージ

Phase 2a の `package.json` に以下を追加してください：

```json
{
  "dependencies": {
    "@iarna/toml": "^2.2.5",
    "ajv": "^8.17.1",
    "json-logic-js": "^2.0.2"
  }
}
```

- `@iarna/toml` — `validators/manifest.ts` で TOML パースに使用
- `ajv` — `validators/panel-schema.ts` でディープ JSON Schema 検証に使用
- `json-logic-js` — `validators/expression.ts` で JSONLogic 式の runtime 評価に使用

これらは optional（未インストールでも certify は動作、機能が縮退して warning を出す）。
