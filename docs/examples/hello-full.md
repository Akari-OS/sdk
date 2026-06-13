---
title: hello-full — Full Tier リファレンス実装ガイド
created: 2026-06-13
updated: 2026-06-13
---

# hello-full — Full Tier 最小リファレンス実装

> **実装パス**: `examples/hello-full/`
> **パッケージ名**: `@akari-os/example-hello-full`
> **Tier**: Full
> **App ID**: `com.example.hello-full`
> **目的**: Full Tier App の runtime install フロー（`~/.akari/apps/` からのロード）を最小構成で検証するリファレンス実装。

---

## 1. 概要

`hello-full` は Full Tier の最小動作確認用サンプルApp。
SDK の開発ループ（`vite build --watch` → Shell reload → Panel 表示確認）を最短で体験できる構成になっている。

- **Panel**: React コンポーネント（`src/index.tsx`）を Shell に mount
- **Agent / Skill**: なし（最小構成のため）
- **外部依存**: なし（Permission 要求ゼロ）

---

## 2. ファイル構成

```
examples/hello-full/
├── akari.toml         — App manifest（tier = "full"）
├── package.json       — ビルド設定（vite）
├── vite.config.ts     — Vite + React プラグイン設定
├── tsconfig.json      — TypeScript 設定
└── src/               — Panel ソース（要作成）
    └── index.tsx      — Panel コンポーネント（エントリポイント）
```

---

## 3. akari.toml の読みどころ

```toml
[app]
id    = "com.example.hello-full"
tier  = "full"
icon  = "Sparkles"

[permissions]
# 最小検証なので何も要求しない

[panels.main]
title = "Hello Full"
mount = "dist/index.js"    # ← Full Tier は React bundle を mount する
```

**MCP-Declarative との違い**: `[panels.main]` で `schema` ではなく `mount` を使う。
`mount` に Vite ビルド後の `dist/index.js` を指定し、Shell が直接 import する。

---

## 4. ビルドと実行

```bash
# monorepo ルートから
cd examples/hello-full
pnpm install
pnpm build        # vite build — dist/index.js を生成

# または開発中はウォッチモード
pnpm dev          # vite build --watch
```

Shell に App を追加すると `dist/index.js` が Panel としてロードされる。

---

## 5. Full Tier への昇格パターン（真似するポイント）

hello-full を起点に本格 Full Tier App を作る際の典型的な拡張手順：

1. **Panel コンポーネントを実装** — `src/` 配下に React コンポーネントを追加
2. **Agent を追加** — `agents/*.md` に Agent spec を定義し、`akari.toml` の `[agents]` に登録
3. **Memory API を使う** — `pool.put` / `amp.record` でデータを永続化
4. **Permission を宣言** — 外部ネットワーク・Pool・AMP アクセスを `[permissions]` に追記
5. **Skill を公開** — 他 App から呼び出せる関数を `skill.register()` で登録

詳細は [Full Tier ガイド](../tiers/full-tier.md) を参照。

---

## 6. 関連ドキュメント

| ドキュメント | 内容 |
|---|---|
| [Full Tier ガイド](../tiers/full-tier.md) | Full Tier の完全リファレンス |
| [API Reference](../api-reference/) | 7 API 群の詳細 |
| [Tier Comparison](../concepts/tier-comparison.md) | Full vs MCP-Declarative の選び方 |
