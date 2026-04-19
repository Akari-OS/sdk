---
title: AKARI Module SDK — 開発者ガイド集
updated: 2026-04-19
---

# AKARI Module SDK — 開発者ガイド集 / Developer Guide Hub

> AKARI OS 上で動く Module（アプリ）を作るための、すべての入口。
> iOS にとっての UIKit + Human Interface Guidelines に相当する、開発者向けの契約書。

---

## はじめに / Introduction

AKARI Module SDK は、AKARI Core（Shell / Agent Runtime / Memory Layer / Protocol Suite）と
Module（アプリ）の間の**契約**を定義する。

この契約に乗ることで、あなたが作った Module は：

- AKARI Shell に panel として mount される
- Pool・AMP を通じてユーザーの記憶層にアクセスできる
- Writer・Video など公式 Module と同じ Inter-App handoff で行き来できる
- `akari module certify` で品質を機械検証し、マーケットに掲載できる

**公式 Module（Writer / Video / SNS Sender）と完全に同じ SDK**を使う。特権はない。

---

## 対象読者 / Who This Is For

| 読者 | 使い方 |
|---|---|
| **これから Module を作りたい** サードパーティ開発者 | Getting Started → Tier 選択 → API Reference の順で読む |
| **既存サービスを AKARI に載せたい** 企業・個人 | Tier Comparison → MCP-Declarative チュートリアル → Certification |
| **AKARI Core の仕組みを理解したい** エンジニア | Architecture Map → Concepts 全章 → spec へのリンク |
| **API の詳細だけ調べたい** 熟練開発者 | 直接 API Reference へ飛ぶ |

---

## 読む順序 / Recommended Reading Order

### 初心者向け（初めて Module を作る）

```
1. Getting Started          ← 5 分でミニ Module を動かす
2. Concepts: Tier Comparison ← Full か MCP-Declarative か選ぶ
3. Concepts: Module Lifecycle ← install から publish までを理解する
4. Concepts: Architecture Map ← SDK の仕組みを俯瞰する
5. API Reference             ← 必要な API を逐次参照
6. Certification Guide       ← リリース前の品質チェック
```

### 熟練者向け（既存サービスを移植する）

```
1. Concepts: Tier Comparison ← まず Tier を決める
2. API Reference > Memory API / Permission API ← 最重要の 2 API
3. Cookbook > "既存 API を MCP-Declarative で載せる" ← 典型パターン
4. Certification Guide       ← 審査フロー確認
```

### API reference 目的

```
直接 → [6. API Reference](./api-reference/) へ
```

---

## 目次 / Table of Contents

### 1. Getting Started

**[→ getting-started.md](./getting-started.md)**

5 分で最初の MCP-Declarative Module を動かすチュートリアル。
`akari-module-cli` で雛形を生成し、`akari dev` でローカル動作確認、`akari module certify` で Lint まで。

---

### 2. Tiers（Full / MCP-Declarative）

**[→ concepts/tier-comparison.md](./concepts/tier-comparison.md)**

Module には 2 つの Tier がある。

| Tier | 一言 | 典型例 |
|---|---|---|
| **Full** | 自由度最大。React Panel + Agent + Skill を自前実装 | Writer / Video / Pool Picker |
| **MCP-Declarative** | 手軽に始まる。MCP サーバー + `panel.schema.json` だけで完結 | X Sender / Notion / DeepL |

迷ったら **MCP-Declarative から始める**ことを推奨。
必要に応じて Full に昇格できる（逆方向は不可）。

詳細な比較表・選び方フローチャート・ユースケースは上記リンクで。

---

### 3. API Reference（7 API 群）

**[→ api-reference/](./api-reference/)**

AKARI Module SDK が提供する 7 つの API 群。すべて `@akari/sdk` からインポートする。

| API | 役割 | 主要関数 |
|---|---|---|
| **Agent API** | Module 固有エージェントの定義・呼び出し | `defineAgent()` / `invoke()` / `spawn()` |
| **Memory API** | Pool（素材）/ AMP（記憶）アクセス | `pool.put()` / `pool.search()` / `amp.record()` |
| **Context API** | ACE でコンテキストを組み立てる | `ace.build()` / `ace.lint()` |
| **UI API** | Shell への panel mount | `shell.mountPanel()` / `shell.onSelection()` |
| **Inter-App API** | Module 間の handoff | `module.handoff()` |
| **Permission API** | 権限ゲート / HITL | `permission.gate()` |
| **Skill API** | 他 Module への関数公開 | `skill.register()` / `skill.call()` |

各 API の詳細（型定義・サンプルコード・制約）は API Reference 章を参照。

---

### 4. Certification Guide

**[→ certification/](./certification/)**

Module をマーケットに載せるための 3 層品質ゲート。

| 層 | Full | MCP-Declarative |
|---|:-:|:-:|
| Automated Lint（ACE Lint / manifest 検証 / Guidelines 逸脱） | ✅ | ✅ |
| Contract Test（7 API 契約テスト / MCP tool schema 整合性） | ✅ | ✅ |
| Manual Review（権限妥当性 / UX 品質 / セキュリティ） | ✅ 必須 | ⭕ 軽め |

自己配布（npm / git）なら Lint + Contract Test だけで可能。
マーケット掲載のみ Manual Review が追加される。

---

### 5. Migration Guide

**[→ migration.md](./migration.md)**

- MCP-Declarative → Full への昇格手順
- SDK バージョンアップ時の破壊的変更対応
- 旧 L3 sub-agent 設計（HUB-005 v0.1 以前）からの移行

---

### 6. Cookbook

**[→ cookbook/](./cookbook/)**

典型的なユースケースをレシピ形式で解説。

- 既存 REST API を MCP-Declarative で AKARI に載せる
- Writer → 自作 Module への handoff を受け取る
- Pool から素材を検索して表示する
- HITL ゲート付きの外部送信ボタンを作る
- i18n（多言語対応）を設定する

---

### 7. Troubleshooting

**[→ troubleshooting/](./troubleshooting/)**

よくある問題と解決策。

- `akari module certify` が失敗する
- Panel が描画されない
- Permission gate が通らない
- MCP サーバーが起動しない

---

### 8. Examples（参考実装）

**[→ examples/](./examples/)**

動くコードで学ぶリファレンス集。

| 実装 | Tier | 参照先 |
|---|---|---|
| X Sender（Publishing カテゴリ） | MCP-Declarative | [examples/x-sender](./examples/x-sender.md) |
| Notion（Documents カテゴリ） | MCP-Declarative | [examples/notion](./examples/notion.md) |
| Writer（Full Tier リファレンス） | Full | [packages/writer](../packages/writer/) |

---

## このリポジトリの構成 / Monorepo Structure

本ガイド群（`docs/`）は、以下の兄弟ディレクトリと連携する。

| ディレクトリ | 内容 |
|---|---|
| [`../packages/`](../packages/) | SDK パッケージ実装（`@akari/sdk` など） |
| [`../examples/`](../examples/) | 参考実装（X Sender / Notion / Writer） |

---

## Canonical Specs への参照

本ガイド群は AKARI Module SDK の仕様書を**解説する**ドキュメントであり、仕様書の内容を直接書き換えない。
詳細仕様（AKARI-HUB-024 / HUB-025 / HUB-005）は [Akari-OS Vision](https://github.com/Akari-OS/.github/blob/main/VISION.md) を参照。

| spec | 内容 |
|---|---|
| AKARI-HUB-024 | Module SDK — Module Contract / 7 API / Certification / Toolchain |
| AKARI-HUB-025 | Panel Schema v0 — MCP-Declarative の宣言的 UI 規格 |
| AKARI-HUB-005 v0.2 | Declarative Capability Modules — 11 カテゴリのリファレンスカタログ |

---

## 貢献方法 / Contributing（将来）

SDK ガイドへの貢献は大歓迎。以下を想定している（整備後に詳細公開）：

- **誤字・リンク切れ修正**: PR 直接
- **サンプルコード追加**: Cookbook への追加 PR
- **翻訳（英語↔日本語）**: 各ファイルの英語見出しに対応する本文の翻訳
- **新しい Examples**: `examples/` への参考実装追加 PR

コントリビューションガイドラインは [Akari-OS/.github](https://github.com/Akari-OS/.github) を参照。

---

> **AKARI は「ツール」ではない。個人クリエイター専用の、エッジで動く AI OS。**
> あなたが作る Module は、そのエコシステムの一部になる。
