---
title: Automated Lint — Lint ルール全一覧
updated: 2026-04-19
related: [HUB-024, HUB-025, ADR-011, ADR-012, ADR-013]
---

# Automated Lint — Lint ルール全一覧 / Complete Lint Rule Reference

> `akari module certify` の第 1 層。Module が AKARI の規格・Guidelines に準拠しているかを
> **静的に**検査する。Lint がパスしなければ Contract Test に進めない。

---

## 目次 / Table of Contents

1. [Lint 実行の仕組み](#1-lint-実行の仕組み)
2. [ルールグループ一覧](#2-ルールグループ一覧)
3. [グループ A: Manifest 基本検証](#3-グループ-a-manifest-基本検証)
4. [グループ B: Agent 命名規約（ADR-011）](#4-グループ-b-agent-命名規約adr-011)
5. [グループ C: Panel Schema 検証（HUB-025）](#5-グループ-c-panel-schema-検証hub-025)
6. [グループ D: Category enum（ADR-013）](#6-グループ-d-category-enumadr-013)
7. [グループ E: Permission scope 記法](#7-グループ-e-permission-scope-記法)
8. [グループ F: Guidelines 逸脱検知](#8-グループ-f-guidelines-逸脱検知)
9. [エラーコード一覧表](#9-エラーコード一覧表)
10. [対処法チートシート](#10-対処法チートシート)

---

## 1. Lint 実行の仕組み / How Lint Works

### 1.1 実行フロー

```
akari module certify --only lint
        │
        ├── Step 1: akari.toml の TOML パース
        │     └── パース失敗 → LINT-000 (fatal)
        ├── Step 2: 必須フィールドの存在確認
        ├── Step 3: 各フィールドの形式・値域チェック
        ├── Step 4: Panel Schema ファイルの JSON パース + バリデーション
        ├── Step 5: ソースコードの静的スキャン（Guidelines 逸脱）
        └── Step 6: レポート出力
```

### 1.2 重大度レベル

| レベル | 意味 | Certify への影響 |
|---|---|---|
| `fatal` | Lint 処理自体が続行不可 | 即座に FAIL |
| `error` | ルール違反。修正必須 | FAIL |
| `warning` | 推奨事項。修正が望ましい | PASS（警告付き） |
| `info` | 情報提供。修正不要 | PASS |

### 1.3 設定ファイル（`.akari-lint.toml`）

Module ルートに `.akari-lint.toml` を置くことで、特定ルールを `warning` に降格または無効化できる。

```toml
# .akari-lint.toml
[rules]
LINT-051 = "warning"   # 直接通信検知を warning に降格
LINT-050 = "off"       # DB 使用検知を完全に無効化（禁止）

[ignore]
paths = ["src/vendor/**"]   # vendor ディレクトリはスキャン除外
```

> **注意**: `error` → `off` への降格は Certification として認められない。
> `warning` への降格のみ許容される（Marketplace 掲載時はレビュアーが確認）。

---

## 2. ルールグループ一覧 / Rule Groups

| グループ | プレフィックス | ルール数 | 対象 |
|---|---|---|---|
| A: Manifest 基本検証 | `LINT-00x` / `LINT-01x` | 12 | `akari.toml` 必須フィールド・形式 |
| B: Agent 命名規約 | `LINT-01x` | 4 | `[agents]` セクション（Full のみ） |
| C: Panel Schema 検証 | `LINT-02x` | 10 | `panel.schema.json` + widget enum |
| D: Category enum | `LINT-03x` | 3 | `category` フィールド（ADR-013） |
| E: Permission scope | `LINT-04x` | 6 | `[permissions]` セクション |
| F: Guidelines 逸脱 | `LINT-05x` | 8 | ソースコードスキャン |
| **合計** | | **43** | |

---

## 3. グループ A: Manifest 基本検証 / Manifest Validation

`akari.toml` の必須フィールドと形式を検査する。

### LINT-000: TOML パースエラー (fatal)

```
LINT-000  akari.toml: TOML parse error at line 5, col 3
          Unexpected '=' without key
```

**原因**: `akari.toml` が不正な TOML 構文。  
**対処**: [TOML 仕様](https://toml.io) に従い構文を修正する。

---

### LINT-001: module id — 逆ドメイン形式

**チェック内容**: `[module] id` が `<org>.<...>.<name>` の逆ドメイン形式であること。

```toml
# NG
id = "my-module"           # ドメイン区切りなし
id = "MyModule"            # 大文字含む
id = "com.example.My App"  # スペース含む

# OK
id = "com.example.my-module"
id = "io.github.user.tool"
```

**ルール詳細**:
- 最低 3 セグメント（`<tld>.<org>.<name>`）
- 各セグメントは `[a-z0-9][a-z0-9-]*` のみ（小文字英数字とハイフン）
- ドット区切り

**重大度**: `error`  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-002: module tier — 有効な Tier 値

**チェック内容**: `[module] tier` が `"full"` または `"mcp-declarative"` であること。

```toml
# NG
tier = "Full"              # 大文字
tier = "declarative"       # 不正な値

# OK
tier = "full"
tier = "mcp-declarative"
```

**補足**: `tier` フィールドを省略した場合、既定は `"full"` として扱われ `warning` が出る。

**重大度**: `error`（値不正）/ `warning`（省略）  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-003: module sdk — semver range

**チェック内容**: `[module] sdk` が有効な semver range 文字列であること。

```toml
# NG
sdk = "0.1.0"              # range でなく固定バージョン
sdk = "latest"             # 不定
sdk = ">=0.1"              # minor なし（patch 省略不可）

# OK
sdk = ">=0.1.0 <1.0.0"
sdk = "~0.1.0"
sdk = "^0.1.0"
```

**重大度**: `error`  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-004: module version — semver 形式

**チェック内容**: `[module] version` が `X.Y.Z` の semver 形式であること。

```toml
# NG
version = "v0.1.0"   # "v" プレフィックス不可
version = "0.1"      # patch なし

# OK
version = "0.1.0"
version = "1.2.3-beta.1"
```

**重大度**: `error`  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-005: module name — 存在確認

**チェック内容**: `[module] name` フィールドが存在し、空でないこと。

**重大度**: `error`  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-006: module author — 存在確認

**チェック内容**: `[module] author` フィールドが存在し、空でないこと。

**重大度**: `warning`（省略時）  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-007: mcp.server — MCP-Declarative 必須フィールド

**チェック内容**: `tier = "mcp-declarative"` のとき、`[mcp] server` フィールドが存在すること。

```toml
# tier = "mcp-declarative" のとき必須
[mcp]
server = "mcp-servers/x-sender"   # ローカルパスまたは URL
tools = ["x.post", "x.schedule"]
```

**重大度**: `error`  
**Tier 適用**: MCP-Declarative のみ

---

### LINT-008: mcp.tools — 空配列禁止

**チェック内容**: `[mcp] tools` が空配列 `[]` でないこと。

**重大度**: `error`  
**Tier 適用**: MCP-Declarative のみ

---

### LINT-009: panels — 少なくとも 1 つの Panel 宣言

**チェック内容**: `[panels]` セクションに 1 つ以上のエントリがあること。

```toml
# NG
[panels]

# OK（Full Tier）
[panels]
main = { title = "Writer", mount = "panels/writer.tsx" }

# OK（MCP-Declarative Tier）
[panels]
main = { title = "X Sender", schema = "panels/x-sender.schema.json" }
```

**重大度**: `warning`（panels セクション自体がない場合）  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-010: panels.schema — ファイル存在確認

**チェック内容**: MCP-Declarative の `schema = "..."` で指定したファイルが実際に存在すること。

**重大度**: `error`  
**Tier 適用**: MCP-Declarative のみ

---

### LINT-011: panels.mount — ファイル存在確認（Full）

**チェック内容**: Full Tier の `mount = "..."` で指定したファイルが実際に存在すること。

**重大度**: `error`  
**Tier 適用**: Full のみ

---

### LINT-012: skills.exposed — 型定義必須

**チェック内容**: `[skills.exposed]` に宣言された各 skill に対応する TypeScript 型定義ファイルが存在すること。

```toml
[skills.exposed]
"writer.generate_draft" = "skills/generate_draft.ts"
```

`skills/generate_draft.ts` が存在しなければ `error`。

**重大度**: `error`  
**Tier 適用**: Full のみ

---

## 4. グループ B: Agent 命名規約（ADR-011） / Agent Naming Convention

[ADR-011 (Hub)] が定める命名規約を検査する。
Full Tier のみ適用。

### LINT-013: [agents] キーに module-short-id プレフィックス必須

**チェック内容**: `[agents]` セクションの各キー（エージェント ID）が `<module-short-id>_` で始まること。

`module-short-id` の導出ルール（ADR-011 §1）:
1. `[module] id` の最後のセグメントを取る（例: `com.akari.writer` → `writer`）
2. kebab-case → snake_case 変換（例: `pdf-reader` → `pdf_reader`）

```toml
# [module] id = "com.akari.writer" の場合

# NG
[agents]
editor = "agents/editor.md"           # module-short-id prefix なし
writer_Editor = "agents/editor.md"    # キャメルケース混在

# OK
[agents]
writer_editor = "agents/editor.md"    # writer_ prefix ✓
writer_proofreader = "agents/proofreader.md"
```

**重大度**: `error`  
**Tier 適用**: Full のみ

---

### LINT-014: Core 7 reference defaults との衝突禁止

**チェック内容**: `[agents]` のキーが Core の 7 デフォルトエージェント ID と一致しないこと。

禁止 ID リスト:
```
partner / studio / operator / researcher / guardian / memory / analyst
```

```toml
# NG
[agents]
partner = "agents/partner.md"    # Core reserved

# OK
[agents]
writer_partner = "agents/partner.md"   # prefix 付き = OK
```

**重大度**: `error`  
**Tier 適用**: Full のみ

---

### LINT-015: agents spec ファイル名 — kebab-case

**チェック内容**: `agents/` 配下のファイル名が kebab-case であること（snake_case 不可）。

```
# NG
agents/writer_editor.md      # スネークケース

# OK
agents/editor.md             # 短い役割名
agents/pdf-extractor.md      # kebab-case
```

**補足**: エージェント ID（`writer_editor`）とファイル名（`editor.md`）は異なることに注意（ADR-011 §3）。

**重大度**: `warning`  
**Tier 適用**: Full のみ

---

### LINT-016: [agents] キーと defineAgent id の一致

**チェック内容**: `akari.toml [agents]` のキーと、対応する spec ファイル内（またはソースコード内）の `defineAgent({ id: "..." })` の値が一致すること。

```typescript
// agents に writer_editor = "agents/editor.md" と書いた場合
defineAgent({
  id: "writer_editor",   // ✓ 一致
  ...
})
```

**重大度**: `warning`（自動検出が難しいケースでは info に降格）  
**Tier 適用**: Full のみ

---

## 5. グループ C: Panel Schema 検証（HUB-025） / Panel Schema Validation

[AKARI-HUB-025](https://github.com/Akari-OS/.github/blob/main/VISION.md) に準拠した Panel Schema の検査。
MCP-Declarative Tier では必須。Full Tier でも `SchemaPanel` 利用時は適用。

### LINT-020: $schema — akari://panel-schema/v0 宣言

**チェック内容**: `panel.schema.json` の冒頭に `"$schema": "akari://panel-schema/v0"` が宣言されていること。

```json
{
  "$schema": "akari://panel-schema/v0",  // ✓ 必須
  "layout": "form",
  ...
}
```

**重大度**: `error`  
**Tier 適用**: MCP-Declarative 必須 / Full 任意（利用時は必須）

---

### LINT-021: widget type — HUB-025 §6.2 の標準セット

**チェック内容**: `fields[].type` の値が HUB-025 §6.2 Widget Catalog に含まれる有効な type であること。

**有効な Widget type 一覧**（v0 標準セット）:

```
テキスト入力:
  text / textarea / password / email / url

数値:
  number / slider / stepper

選択:
  select / multi-select / radio / checkbox / toggle

日時:
  date / time / datetime / datetime-optional / duration

AKARI 固有:
  pool-picker / amp-query / module-picker / agent-picker

Documents（Office 系）:
  rich-text-editor / doc-outline-tree / sheet-row-picker /
  cell-range-picker / slide-template-picker / slide-preview

ファイル:
  file-upload / image-preview / video-preview

表示:
  markdown / badge / stat / progress / image / divider

構造:
  tabs / accordion / split / group / repeater

データ:
  table / list / card-grid

Action:
  button / link / menu
```

```json
// NG
{ "id": "body", "type": "multiline-text" }  // 未定義 type

// OK
{ "id": "body", "type": "textarea" }
```

**重大度**: `error`  
**Tier 適用**: MCP-Declarative 必須 / Full（SchemaPanel 利用時）

---

### LINT-022: enabled_when / visible_when — JSONLogic 式検証（ADR-012）

**チェック内容**: `enabled_when` / `visible_when` に指定された式が、JSONLogic または
シュガー記法として有効であること（ADR-012）。

```json
// シュガー記法（有効）
"enabled_when": "$when != null"
"enabled_when": "$count > 0"

// JSONLogic 記法（有効）
"enabled_when": { "!=": [{ "var": "when" }, null] }

// NG: 参照しているフィールド ID が fields[] に存在しない
"enabled_when": "$undefined_field != null"

// NG: 不正な JSONLogic 演算子
"enabled_when": { "notexist": [{ "var": "x" }, null] }
```

**シュガー記法のパース規則**:
- `$<field_id>` → `{ "var": "<field_id>" }`
- `!=` / `==` / `>` / `<` / `>=` / `<=` → 対応する JSONLogic 演算子
- `&&` / `||` / `!` → `and` / `or` / `!`
- `null` / `true` / `false` / 数値リテラル → そのまま

**重大度**: `error`（不正な式）/ `warning`（参照先フィールド未定義）  
**Tier 適用**: MCP-Declarative 必須 / Full（SchemaPanel 利用時）

---

### LINT-023: bind 記法の形式チェック

**チェック内容**: `fields[].bind` の値が HUB-025 §6.4 の Binding 規約に従っていること。

```
有効なパターン:
  mcp.<tool>.<param>          例: mcp.x.post.text
  pool.<query_id>             例: pool.recent-drafts
  amp.<record_kind>.<field>   例: amp.style-preference.tone
  state.<key>                 例: state.current-tab
  const.<value>               例: const.default-language
```

```json
// NG
"bind": "x.post.text"          // mcp. prefix なし
"bind": "my.custom.binding"    // 未定義パターン

// OK
"bind": "mcp.x.post.text"
"bind": "pool.recent-drafts"
```

**重大度**: `error`  
**Tier 適用**: MCP-Declarative 必須 / Full（SchemaPanel 利用時）

---

### LINT-024: layout — 有効な値

**チェック内容**: `layout` フィールドが `form` / `tabs` / `split` / `dashboard` / `list` のいずれかであること。

**重大度**: `error`  
**Tier 適用**: MCP-Declarative 必須 / Full（SchemaPanel 利用時）

---

### LINT-025: actions[].kind — 有効な値

**チェック内容**: `actions[].kind` が `primary` / `secondary` / `destructive` / `ghost` のいずれかであること。

**重大度**: `warning`（省略時はデフォルト `secondary`）/ `error`（不正な値）  
**Tier 適用**: MCP-Declarative / Full（SchemaPanel 利用時）

---

### LINT-026: actions — mcp または handoff のいずれか必須

**チェック内容**: `actions[]` の各エントリに `mcp` または `handoff` のどちらか一方が存在すること（両方は不可）。

```json
// NG: どちらもない
{ "id": "submit", "label": "送信", "kind": "primary" }

// NG: 両方ある
{ "id": "submit", "mcp": {...}, "handoff": {...} }

// OK: mcp のみ
{ "id": "submit", "mcp": { "tool": "x.post", "args": {...} } }

// OK: handoff のみ
{ "id": "to-video", "handoff": { "to": "com.akari.video", "intent": "..." } }
```

**重大度**: `error`  
**Tier 適用**: MCP-Declarative / Full（SchemaPanel 利用時）

---

### LINT-027: hitl.preview — 有効な値

**チェック内容**: `actions[].hitl.preview` が `text-summary` / `schedule-summary` / `diff` / `custom-markdown` のいずれかであること。

**重大度**: `error`  
**Tier 適用**: MCP-Declarative / Full（SchemaPanel 利用時）

---

### LINT-028: i18n キー — {{t:key}} 記法の整合性

**チェック内容**: Schema 内の `{{t:key}}` 記法で参照したキーが、`locales/ja.json` に存在すること（警告のみ）。

```json
// panel.schema.json
{ "label": "{{t:post.body}}" }

// locales/ja.json — post.body が存在しないと warning
{ "post.media": "添付" }
```

**重大度**: `warning`  
**Tier 適用**: MCP-Declarative / Full（SchemaPanel 利用時）

---

### LINT-029: Schema サイズ — 推奨上限

**チェック内容**: `panel.schema.json` のファイルサイズが 64 KB を超えた場合に警告。

**補足**: Panel Schema が大きすぎる場合、Shell レンダラのパフォーマンスに影響する可能性がある。
`tabs` / `accordion` 等の構造 widget を利用してパネルを分割することを検討。

**重大度**: `warning`  
**Tier 適用**: MCP-Declarative / Full（SchemaPanel 利用時）

---

## 6. グループ D: Category enum（ADR-013） / Category Enum Validation

[ADR-013 (Hub)] が定めるカテゴリ enum を検査する。

### LINT-030: category — Core enum または x-<slug> 形式

**チェック内容**: `[module] category` の値が Core 11 カテゴリのいずれか、または `x-<slug>` 形式であること。

**Core 11 カテゴリ（固定 enum）**:
```
publishing / documents / design / asset-gen / research /
translation / analytics / notification / storage / commerce / community
```

**拡張カテゴリのルール**（ADR-013 §Decision）:
- `x-` プレフィックス必須
- 以降は lowercase kebab-case: `x-[a-z][a-z0-9-]+`
- 例: `x-education` / `x-health` / `x-legal`

```toml
# NG
category = "Publishing"           # 大文字
category = "education"            # Core 外かつ x- なし
category = "x_education"          # アンダースコア（ハイフン必須）
category = "x-"                   # x- のみ（slug なし）

# OK (Core)
category = "publishing"
category = "research"

# OK (拡張)
category = "x-education"
category = "x-health"
```

**重大度**: `error`  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-031: category 省略時の警告

**チェック内容**: `[module] category` が省略されている場合に `warning` を出す。

**補足**: カテゴリ未設定の Module は Marketplace で「未分類」に格納され、発見されにくくなる。

**重大度**: `warning`  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-032: x-<slug> カテゴリ使用時の情報通知

**チェック内容**: `x-<slug>` カテゴリを使用した場合、Core への昇格プロセスを案内する `info` を出す。

```
INFO: category "x-education" はカスタムカテゴリです。
      Marketplace では「その他（カスタム）」に分類されます。
      利用 Module が増えたら HUB-005 改訂で Core カテゴリへの昇格を申請できます。
```

**重大度**: `info`  
**Tier 適用**: Full / MCP-Declarative 共通

---

## 7. グループ E: Permission scope 記法 / Permission Scope Validation

`akari.toml` `[permissions]` セクションの記法を検査する。

### LINT-040: external-network — 明示的な宣言必須

**チェック内容**: `[permissions] external-network` が明示的に宣言されていること。

```toml
# NG（省略）
[permissions]
pool = ["read", "write"]
# external-network の記載なし

# OK（オフライン宣言）
[permissions]
external-network = false

# OK（外部アクセスあり）
[permissions]
external-network = ["api.x.com", "upload.twitter.com"]
```

**補足**: オフライン動作が必須要件（HUB-024 AC-8）。`false` で宣言すると Contract Test の Offline Isolation Test が有効になる。

**重大度**: `warning`  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-041: pool permission — 有効な scope 値

**チェック内容**: `[permissions] pool` が `"read"` / `"write"` / `["read", "write"]` のいずれかであること。

```toml
# NG
pool = ["read", "delete"]   # "delete" は未定義 scope
pool = "read"               # 文字列ではなく配列で書く（推奨）

# OK
pool = ["read"]
pool = ["read", "write"]
```

**重大度**: `error`  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-042: amp permission — 有効な scope 値

**チェック内容**: `[permissions] amp` が `"read"` / `"write"` のいずれかまたは配列であること。

**重大度**: `error`  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-043: filesystem permission — 有効なパターン

**チェック内容**: `[permissions] filesystem` の各エントリが `<scope>:<dir>` 形式であること。

```toml
# NG
filesystem = ["user-docs"]      # scope: なし
filesystem = ["write:*"]        # ワイルドカードは NG

# OK
filesystem = ["read:user-docs"]
filesystem = ["read:user-docs", "write:user-cache"]
```

有効な scope: `read` / `write`  
有効な dir: `user-docs` / `user-cache` / `user-media`（定義済みディレクトリのみ）

**重大度**: `error`  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-044: oauth — 登録済みプロバイダーの確認

**チェック内容**: `[permissions] oauth` の各エントリが AKARI 認証済みプロバイダー一覧に存在すること（`warning` のみ）。

```toml
# Warning（未登録プロバイダー）
oauth = ["unknown-service.com"]

# OK（登録済み）
oauth = ["x.com", "github.com", "notion.so"]
```

**補足**: 未登録プロバイダーは自己配布では動作するが、Marketplace 掲載には Manual Review でプロバイダーの正当性確認が必要。

**重大度**: `warning`  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-045: 過剰な Permission 宣言の検知

**チェック内容**: 宣言されている Permission のうち、ソースコードや MCP ツール定義で実際に使われていないものを検知する。

```
WARNING: LINT-045  permission "amp" が宣言されているが、
                   ソースコード内で amp.record() / amp.query() の呼び出しが見つかりません。
                   最小権限原則に従い、不要な Permission を削除することを推奨します。
```

**重大度**: `warning`  
**Tier 適用**: Full / MCP-Declarative 共通

---

## 8. グループ F: Guidelines 逸脱検知 / Guidelines Violation Detection

HUB-024 §6.7 Guidelines に違反するパターンをソースコードから静的にスキャンする。

### LINT-050: 自前 DB の使用禁止

**チェック内容**: Module ソースコード内に以下のようなパターンが検出された場合。

```
検出パターン（例）:
  import { createDatabase } from "..."    // IndexedDB / SQLite ライブラリ
  new PouchDB(...)
  open("leveldb:...")
  knex(...)
  drizzle(...)
  prisma.$connect()
```

**Guidelines 根拠**: HUB-024 §6.7 ルール 2「自前 DB 禁止。全データは Pool / AMP 経由」

```
ERROR: LINT-050  src/db.ts:3
       'import { drizzle } from "drizzle-orm"' — Module は自前 DB を持てません。
       データは Pool（素材）/ AMP（記憶・判断ログ）経由で読み書きしてください。
       参照: @akari/sdk の pool.put() / pool.get() / amp.record()
```

**重大度**: `error`  
**Tier 適用**: Full / MCP-Declarative 共通

---

### LINT-051: 直接 Module 間通信の禁止

**チェック内容**: `module.handoff()` を使わず、他 Module の内部 API や endpoint を直接呼び出しているパターン。

```typescript
// NG: 他 Module を直接呼び出し
import { writerService } from "com.akari.writer/internal"
writerService.getDraft(id)

// NG: 直接 HTTP で他 Module を叩く
await fetch("http://localhost:3002/writer-api/drafts")

// OK: Inter-App API 経由
await module.handoff({ to: "com.akari.video", intent: "...", payload: {...} })
```

**Guidelines 根拠**: HUB-024 §6.7 ルール 4「エージェント間通信: 記憶層経由（直接通信禁止）」

**重大度**: `error`  
**Tier 適用**: Full のみ（MCP-Declarative はコードを持たないため対象外）

---

### LINT-052: 独自ウィンドウ生成の禁止

**チェック内容**: `window.open()` や OS ネイティブウィンドウ API の直接呼び出しを検知。

```typescript
// NG
window.open("https://example.com", "_blank")
const win = new BrowserWindow({...})  // Tauri/Electron API

// OK: Shell の panel 規格に従う
shell.mountPanel({ id: "my-panel", ... })
```

**Guidelines 根拠**: HUB-024 §6.7 ルール 3「独自ウィンドウ禁止」

**重大度**: `error`  
**Tier 適用**: Full のみ

---

### LINT-053: Agent をコード内で動的生成する禁止

**チェック内容**: `defineAgent()` の呼び出しで `persona` / `tools` 等のパラメータを変数・動的値で渡しているパターン。

```typescript
// NG: persona が動的（変数）
defineAgent({ id: "writer_editor", persona: userProvidedPersona, tools: [...] })

// OK: リテラルで固定
defineAgent({ id: "writer_editor", persona: "文章の編集者", tools: [...] })
```

**Guidelines 根拠**: HUB-024 §6.7 ルール 8「エージェント spec: ファイル（md）で定義。コード内で動的生成しない」

**重大度**: `warning`  
**Tier 適用**: Full のみ

---

### LINT-054: AMP record に goal_ref なし

**チェック内容**: `amp.record()` の呼び出しで `goal_ref` フィールドが省略されているパターン。

```typescript
// NG
await amp.record({ kind: "decision", content: "..." })   // goal_ref なし

// OK
await amp.record({ kind: "decision", content: "...", goal_ref: "AKARI-HUB-024" })
```

**Guidelines 根拠**: HUB-024 §6.6 Memory API「AMP の全 record に goal_ref を付ける」

**重大度**: `warning`  
**Tier 適用**: Full / MCP-Declarative 共通（SDK 直接呼び出し時）

---

### LINT-055: 外部通信を manifest なしに実行

**チェック内容**: `fetch()` / `axios.get()` 等の外部通信を行うコードが存在するが、`[permissions] external-network` に該当ドメインが宣言されていないパターン。

```typescript
// NG: manifest に api.notion.com の記載なし
await fetch("https://api.notion.com/v1/pages")

// OK: manifest に宣言済み
// [permissions]
// external-network = ["api.notion.com"]
await fetch("https://api.notion.com/v1/pages")
```

**重大度**: `error`  
**Tier 適用**: Full のみ（MCP-Declarative は MCP サーバー側で完結）

---

### LINT-056: Skill の Input/Output に型定義なし

**チェック内容**: `skill.register()` の呼び出しで `input` / `output` の JSON Schema 型定義が省略されているパターン。

```typescript
// NG
skill.register({ id: "writer.generate_draft", handler: async (input) => {...} })

// OK
skill.register({
  id: "writer.generate_draft",
  input: DraftInputSchema,    // JSON Schema 必須
  output: DraftOutputSchema,  // JSON Schema 必須
  handler: async (input) => {...},
})
```

**Guidelines 根拠**: HUB-024 §6.6 Skill API「Input / Output は JSON Schema で型付け必須」

**重大度**: `error`  
**Tier 適用**: Full のみ

---

### LINT-057: オフライン必須なのに external-network = true の使用

**チェック内容**: `external-network = false` を宣言しているのに、ソース内で外部通信 API を使っているパターン。

**重大度**: `error`  
**Tier 適用**: Full / MCP-Declarative 共通

---

## 9. エラーコード一覧表 / Error Code Reference

| コード | グループ | 重大度 | Full | MCP-D | 概要 |
|---|---|---|:-:|:-:|---|
| LINT-000 | A | fatal | ✅ | ✅ | TOML パースエラー |
| LINT-001 | A | error | ✅ | ✅ | module id 逆ドメイン形式違反 |
| LINT-002 | A | error/warn | ✅ | ✅ | tier 不正 / 省略 |
| LINT-003 | A | error | ✅ | ✅ | sdk semver range 不正 |
| LINT-004 | A | error | ✅ | ✅ | version semver 不正 |
| LINT-005 | A | error | ✅ | ✅ | name 未設定 |
| LINT-006 | A | warning | ✅ | ✅ | author 未設定 |
| LINT-007 | A | error | — | ✅ | mcp.server 未設定 |
| LINT-008 | A | error | — | ✅ | mcp.tools 空配列 |
| LINT-009 | A | warning | ✅ | ✅ | panels セクションなし |
| LINT-010 | A | error | — | ✅ | schema ファイル不在 |
| LINT-011 | A | error | ✅ | — | mount ファイル不在 |
| LINT-012 | A | error | ✅ | — | skill 型定義ファイル不在 |
| LINT-013 | B | error | ✅ | — | agents キー prefix なし |
| LINT-014 | B | error | ✅ | — | Core 7 defaults と衝突 |
| LINT-015 | B | warning | ✅ | — | agents ファイル名が kebab-case でない |
| LINT-016 | B | warning | ✅ | — | agents キーと defineAgent id 不一致 |
| LINT-020 | C | error | opt | ✅ | $schema 宣言なし |
| LINT-021 | C | error | opt | ✅ | 未知の widget type |
| LINT-022 | C | error/warn | opt | ✅ | JSONLogic 式不正 |
| LINT-023 | C | error | opt | ✅ | bind 記法不正 |
| LINT-024 | C | error | opt | ✅ | layout 値不正 |
| LINT-025 | C | error/warn | opt | ✅ | actions.kind 値不正 |
| LINT-026 | C | error | opt | ✅ | mcp/handoff どちらもない |
| LINT-027 | C | error | opt | ✅ | hitl.preview 値不正 |
| LINT-028 | C | warning | opt | ✅ | i18n キー不在 |
| LINT-029 | C | warning | opt | ✅ | Schema サイズ超過 |
| LINT-030 | D | error | ✅ | ✅ | category 値不正 |
| LINT-031 | D | warning | ✅ | ✅ | category 省略 |
| LINT-032 | D | info | ✅ | ✅ | x- カテゴリ使用の案内 |
| LINT-040 | E | warning | ✅ | ✅ | external-network 未宣言 |
| LINT-041 | E | error | ✅ | ✅ | pool permission 値不正 |
| LINT-042 | E | error | ✅ | ✅ | amp permission 値不正 |
| LINT-043 | E | error | ✅ | ✅ | filesystem permission 不正 |
| LINT-044 | E | warning | ✅ | ✅ | oauth 未登録プロバイダー |
| LINT-045 | E | warning | ✅ | ✅ | 過剰 Permission 宣言 |
| LINT-050 | F | error | ✅ | ✅ | 自前 DB 使用 |
| LINT-051 | F | error | ✅ | — | 直接 Module 間通信 |
| LINT-052 | F | error | ✅ | — | 独自ウィンドウ生成 |
| LINT-053 | F | warning | ✅ | — | Agent 動的生成 |
| LINT-054 | F | warning | ✅ | ✅ | AMP record の goal_ref なし |
| LINT-055 | F | error | ✅ | — | manifest 外ドメインへの通信 |
| LINT-056 | F | error | ✅ | — | Skill 型定義なし |
| LINT-057 | F | error | ✅ | ✅ | オフライン宣言 + 外部通信矛盾 |

**合計**: 43 ルール（fatal 1 / error 系 28 / warning 系 12 / info 2）

> `opt` = Full Tier でも SchemaPanel 利用時は適用  
> `MCP-D` = MCP-Declarative の略

---

## 10. 対処法チートシート / Quick Fix Guide

### akari.toml の典型的な修正

**LINT-001: module id を逆ドメイン形式に修正**

```toml
# 修正前
[module]
id = "my-awesome-module"

# 修正後
[module]
id = "com.yourorg.my-awesome-module"
```

**LINT-003: sdk range を正しい semver range に修正**

```toml
# 修正前
sdk = "0.1.0"

# 修正後
sdk = ">=0.1.0 <1.0.0"
```

**LINT-013: agents キーに module-short-id プレフィックスを追加**

```toml
# module id = "com.example.my-tool" → module-short-id = "my_tool"

# 修正前
[agents]
editor = "agents/editor.md"

# 修正後
[agents]
my_tool_editor = "agents/editor.md"
```

**LINT-030: category を正しい値に修正**

```toml
# 修正前
category = "Education"      # 大文字
category = "education"      # Core 外 + x- なし

# 修正後（Core カテゴリが合うなら）
category = "research"

# 修正後（独自カテゴリの場合）
category = "x-education"
```

### panel.schema.json の典型的な修正

**LINT-020: $schema 宣言を追加**

```json
{
  "$schema": "akari://panel-schema/v0",
  "layout": "form",
  ...
}
```

**LINT-021: widget type を正式名称に修正**

```json
// 修正前
{ "id": "body", "type": "multiline" }

// 修正後
{ "id": "body", "type": "textarea" }
```

**LINT-022: enabled_when のシュガー記法エラー修正**

```json
// 修正前（"schedule" フィールドが存在しないのに参照）
"enabled_when": "$schedule != null"

// 修正後（正しいフィールド ID を参照）
"enabled_when": "$when != null"
```

### ソースコードの典型的な修正

**LINT-050: 自前 DB → Pool/AMP に移行**

```typescript
// 修正前
const db = drizzle(connection)
await db.insert(drafts).values({ id, content })

// 修正後
import { pool } from "@akari/sdk"
const id = await pool.put({ bytes: Buffer.from(content), mime: "text/plain", tags: ["draft"] })
```

**LINT-051: 直接通信 → Inter-App handoff に移行**

```typescript
// 修正前
const response = await fetch("http://localhost:3002/writer/drafts")

// 修正後
import { module } from "@akari/sdk"
await module.handoff({
  to: "com.akari.writer",
  intent: "get-draft",
  payload: { draft_ref: ampRecordId },
})
```

---

## 関連リソース / Related Resources

- [Certification README](./README.md) — 全体像と CLI
- [Contract Test](./contract-test.md) — 層 2 の詳細
- [Manual Review](./manual-review.md) — 層 3 のチェックリスト
- [ADR-011 (Hub)] — Agent 命名規約
- [ADR-012 (Hub)] — JSONLogic 採用
- [ADR-013 (Hub)] — Category enum
- [HUB-024 §6.8](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Certification 仕様（正典）
- [HUB-025 §6.2](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Widget Catalog（正典）
