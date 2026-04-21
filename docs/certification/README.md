---
title: Certification Guide — 3 層品質ゲートの概要
updated: 2026-04-19
related: [HUB-024, HUB-025, ADR-011, ADR-012, ADR-013]
---

# Certification Guide — 3 層品質ゲートの概要 / Overview of the 3-Layer Quality Gate

> App をマーケットに掲載するための品質審査システム。
> Apple の App Store Review に相当する、AKARI 版の品質ゲート。
> `akari app certify` の 1 コマンドで 3 層すべてを実行できる。

---

## このガイドの構成 / Structure of This Guide

```
certification/
├── README.md            ← このファイル。全体像と CLI の使い方
├── automated-lint.md    ← Lint ルール全一覧
├── contract-test.md     ← Contract Test スイート仕様
└── manual-review.md     ← Manual Review チェックリスト
```

---

## 1. Certification とは / What Is Certification

AKARI App の Certification は **3 層構造** になっている。

| 層 | 名称 | 実行主体 | Full | MCP-Declarative |
|---|---|---|:-:|:-:|
| 1 | **Automated Lint** | `akari app certify` が自動実行 | ✅ 必須 | ✅ 必須 |
| 2 | **Contract Test** | `akari app certify` が自動実行 | ✅ 必須 | ✅ 必須 |
| 3 | **Manual Review** | AKARI レビュアーが人手で実施 | ✅ 必須（マーケット掲載時） | ⭕ 軽め（Permission / OAuth のみ） |

**自己配布（npm publish / git URL 直接インストール）の場合は、層 1 + 層 2 のみで配布可能。**
マーケット掲載（`akari app publish`）は層 3 の Manual Review が追加される。

---

## 2. 判定フロー / Decision Flow

```
akari app certify
        │
        ▼
┌───────────────────────────────────────┐
│  層 1: Automated Lint                 │
│  • akari.toml 必須フィールド検査      │
│  • Panel Schema v0 バリデーション     │
│  • 命名規約チェック（ADR-011）        │
│  • Category enum チェック（ADR-013）  │
│  • Permission scope 記法チェック      │
│  • Guidelines 逸脱検知               │
└───────────────────┬───────────────────┘
                    │ PASS
                    ▼
┌───────────────────────────────────────┐
│  層 2: Contract Test                  │
│  • 7 API の契約テスト（trait-based）  │
│  • MCP ツール input/output schema     │
│  • オフライン動作確認                 │
│  • Panel Schema ↔ MCP 整合性         │
└───────────────────┬───────────────────┘
                    │ PASS
                    ▼
         ┌──────────────────┐
         │ 自己配布なら      │
         │   PASS           │
         └────────┬─────────┘
                  │ マーケット掲載を目指す場合
                  ▼
┌───────────────────────────────────────┐
│  層 3: Manual Review（人手）          │
│  • UX / アクセシビリティ              │
│  • セキュリティ監査                   │
│  • パフォーマンス評価                 │
│  • i18n 品質チェック                  │
│  • ドキュメント充実度                 │
│  Full: 全チェック必須                 │
│  MCP-Declarative: Permission / OAuth  │
│  スコープの妥当性確認のみ             │
└───────────────────┬───────────────────┘
                    │ PASS
                    ▼
              マーケット掲載
```

---

## 3. Tier 別要件比較表 / Tier Requirements Summary

### 3.1 Automated Lint 要件

| チェック項目 | Full | MCP-Declarative | エラーコード |
|---|:-:|:-:|---|
| `[app] id` 逆ドメイン形式 | ✅ | ✅ | `LINT-001` |
| `[app] tier` 宣言 | ✅ | ✅ | `LINT-002` |
| `[app] sdk` 互換範囲 | ✅ | ✅ | `LINT-003` |
| `[app] version` semver | ✅ | ✅ | `LINT-004` |
| `[agents]` キーのプレフィックス（ADR-011） | ✅ | 対象外 | `LINT-011` |
| `panel.schema.json` `$schema` 宣言 | 任意 | ✅ | `LINT-020` |
| Widget type enum（HUB-025 §6.2） | 任意 | ✅ | `LINT-021` |
| JSONLogic 式の構文（ADR-012） | 任意 | ✅ | `LINT-022` |
| `category` フィールド（ADR-013） | ✅ | ✅ | `LINT-030` |
| `external-network` 明示宣言 | ✅ | ✅ | `LINT-040` |
| 自前 DB 使用の検知 | ✅ | ✅ | `LINT-050` |
| 直接 App 間通信の検知 | ✅ | 対象外 | `LINT-051` |

### 3.2 Contract Test 要件

| テストスイート | Full | MCP-Declarative |
|---|:-:|:-:|
| Agent API Contract | ✅ | 対象外 |
| Memory API Contract | ✅ | ✅（pool/amp アクセス時） |
| Context API Contract | ✅ | 対象外 |
| UI API Contract | ✅ | Schema Panel のみ |
| Inter-App API Contract | ✅ | ✅（handoff 宣言時） |
| Permission API Contract | ✅ | ✅ |
| Skill API Contract | ✅（skills 宣言時） | 対象外 |
| MCP Tool Schema Contract | 対象外 | ✅ |
| Offline Isolation Test | ✅ | ✅ |

### 3.3 Manual Review 要件

| レビュー項目 | Full | MCP-Declarative |
|---|:-:|:-:|
| React コードのセキュリティ審査 | ✅ 必須 | ⭕ スキップ |
| UX / アクセシビリティ | ✅ 必須 | ⭕ スキップ（Schema レンダラが担保） |
| OAuth スコープの妥当性 | ✅ 必須 | ✅ 必須 |
| Permission 最小権限原則 | ✅ 必須 | ✅ 必須 |
| パフォーマンス（起動・メモリ） | ✅ 必須 | ⭕ スキップ |
| i18n 品質 | ✅ 必須 | ⭕ 任意 |
| ドキュメント充実度 | ✅ 必須 | ⭕ 最低限 |

---

## 4. CLI 使い方 / How to Use `akari app certify`

### 4.1 基本コマンド

```bash
# カレントディレクトリの App を全層チェック
akari app certify

# 特定ディレクトリを指定
akari app certify --path ./my-app

# 層を指定して実行（デバッグ用）
akari app certify --only lint
akari app certify --only contract
akari app certify --only lint,contract

# JSON レポート出力（CI 連携用）
akari app certify --output json > certify-report.json

# 失敗しても終了コード 0 で返す（CI でのベストエフォート確認）
akari app certify --no-fail-on-error

# verbose 出力（各ルールの詳細ログ）
akari app certify --verbose
```

### 4.2 出力例（通過時）

```
akari app certify
───────────────────────────────────────
 App:    com.example.my-app
 Tier:   mcp-declarative
 SDK:    @akari/sdk >=0.1.0 <1.0
───────────────────────────────────────

 [1/3] Automated Lint
  ✓  LINT-001  app id (com.example.my-app) — reverse-domain ✓
  ✓  LINT-002  tier = mcp-declarative
  ✓  LINT-003  sdk range >=0.1.0 <1.0
  ✓  LINT-020  panels/main.schema.json — $schema declared
  ✓  LINT-021  widget types: textarea, pool-picker, datetime-optional — all known
  ✓  LINT-022  enabled_when expression — JSONLogic ✓
  ✓  LINT-030  category = publishing (Core enum ✓)
  ✓  LINT-040  external-network declared
  Passed: 8/8 rules

 [2/3] Contract Test
  ✓  memory.pool.put — contract ✓
  ✓  permission.gate — contract ✓
  ✓  mcp-tool.x.post — input/output schema ✓
  ✓  offline-isolation — PASS
  Passed: 4/4 suites

 [3/3] Manual Review
  ℹ  Skipped (self-distribution mode)
  ℹ  Run `akari app publish` to initiate Manual Review for marketplace listing

───────────────────────────────────────
 Result: PASS ✅
 Automated: 8 passed, 0 failed
 Contract:  4 passed, 0 failed
───────────────────────────────────────
```

### 4.3 出力例（Lint 失敗時）

```
 [1/3] Automated Lint
  ✗  LINT-001  app id "my-app" — must be reverse-domain (e.g. com.org.name)
  ✓  LINT-002  tier = mcp-declarative
  ✗  LINT-022  enabled_when: "$when != null" — sugar syntax ok, but JSONLogic
               conversion failed: field "when" not found in fields[]
  ...

 Result: FAIL ❌
 See: https://akari.dev/docs/sdk/certification/automated-lint
```

### 4.4 CI 統合の最小設定

```yaml
# .github/workflows/certify.yml
name: Certify App
on: [push, pull_request]
jobs:
  certify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install -g @akari/app-cli
      - run: akari app certify --output json | tee certify-report.json
      - uses: actions/upload-artifact@v4
        with:
          name: certify-report
          path: certify-report.json
```

---

## 5. 各層の詳細ページ / Detailed Pages per Layer

| 層 | ページ | 内容 |
|---|---|---|
| Automated Lint | [automated-lint.md](./automated-lint.md) | Lint ルール全一覧、エラーコード表、対処法 |
| Contract Test | [contract-test.md](./contract-test.md) | 7 API の契約テストスイート、fixture 書き方、CI 統合 |
| Manual Review | [manual-review.md](./manual-review.md) | チェックリスト全項目、Tier 別要件差分 |

---

## 6. よくある Q&A / FAQ

**Q: 自己配布（npm publish）なら Manual Review を完全にスキップできますか？**

はい。自己配布の場合、ユーザーは自己の責任でインストールします。`akari app certify` が層 1 + 層 2 をパスすれば `PASS` 判定になります。ただし、Shell は「マーケット未検証」のバッジを App に付与します。

**Q: MCP-Declarative App は Manual Review が「軽め」とありますが、何がスキップされますか？**

React 等の任意コードが存在しないため、コードのセキュリティ審査・アクセシビリティ審査がスキップされます。代わりに、宣言された `[permissions]` と OAuth スコープが最小権限原則に合致しているかのみ確認します（5〜10 分程度）。

**Q: Lint と Contract Test の違いは何ですか？**

Lint は**静的解析**（ファイルの形式・命名・宣言の整合性）です。Contract Test は**動作検証**（実際に API を呼び出し、プロトコルの契約が守られているか）です。

**Q: `akari app certify` が社内 CI からタイムアウトします。**

Contract Test はモックランナーを使うため通常は高速（数十秒）です。`--only lint` でまず Lint のみ確認し、Contract Test は別ジョブに分割することをお勧めします。詳細は [contract-test.md](./contract-test.md) の CI 統合を参照。

**Q: `tier = "mcp-declarative"` で始めて後から Full にできますか？**

できます。`akari.toml` の `tier` を `"full"` に変更し、Panel を `panel.schema.json` から React component に置き換えてください。ただし逆方向（Full → MCP-Declarative）は原則不可です。

---

## 7. 関連リソース / Related Resources

- **仕様書（正典）**:
  - [AKARI-HUB-024 App SDK spec (AKARI-HUB-024, Hub)](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Certification §6.8 / テスト戦略 §8
  - [AKARI-HUB-025 Panel Schema spec (AKARI-HUB-025, Hub)](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Panel Schema v0
- **ADR**:
  - [ADR-011 (Hub)] — Agent 命名規約
  - [ADR-012 (Hub)] — JSONLogic 式言語採用
  - [ADR-013 (Hub)] — Category enum ハイブリッド方式
- **他のガイドページ**:
  - [SDK Getting Started](../getting-started.md)
  - [Tier Comparison](../concepts/tier-comparison.md)
  - [API Reference](../api-reference/)
