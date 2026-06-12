---
title: npm Publish 手順書
updated: 2026-06-12
---

# npm Publish 手順書 / npm Publish Guide

`@akari-os/sdk` / `@akari-os/shell-ui` / `@akari-os/app-cli` の 3 パッケージを npm に公開するための手順。

> **注意**: 実際の publish はオーナーが手動で実施する（CI 自動化は別途検討）。

---

## 公開順序 / Publish Order

依存グラフに従い、以下の順で公開する。

```
1. @akari-os/sdk        (packages/sdk-types/)
2. @akari-os/shell-ui   (packages/shell-ui/)    ← @akari-os/sdk に依存
3. @akari-os/app-cli    (packages/app-cli/)     ← 独立（npm 公開版 @akari-os/* を参照）
```

`@akari-os/shell-ui` は `@akari-os/sdk` に依存するため、`sdk` が npm に存在しない状態で publish すると
外部ユーザーが install 時に `workspace:*` 解決エラーに遭遇する（HUB-108 K-3 P0-1）。

---

## 前提条件 / Prerequisites

```bash
# npm へログイン済みであること（Akari-OS org の publish 権限が必要）
npm whoami

# pnpm が使えること
pnpm --version
```

---

## 手順 / Steps

### 1. @akari-os/sdk を publish

```bash
cd packages/sdk-types
pnpm publish --access public
```

`prepublishOnly` で `pnpm run build` が自動実行される。

### 2. @akari-os/shell-ui を publish

sdk-types が npm に反映されてから（通常数秒〜数分）実行する。

```bash
cd packages/shell-ui
pnpm publish --access public
```

`prepublishOnly` で `pnpm run build`（tsc）が自動実行される。

**補足 — exports と dist の関係**: `shell-ui` の `package.json` の `exports` は現在 `src/` を直接指している（src-first 構成）。
`files` フィールドに `dist` と `src` の両方を含めているため、publish 時は tsc ビルド済みの `dist/` と型定義に使えるオリジナルの `src/` がどちらも同梱される。
外部消費者は `dist/` 経由でバンドル・型を解決できる。

### 3. @akari-os/app-cli を publish

```bash
cd packages/app-cli
pnpm publish --access public
```

`prepublishOnly` で `pnpm run build`（tsup）が自動実行される。

**重要**: `files` フィールドに `src/templates` が含まれていることを確認すること。`dist/cli.js` が実行時に
`../src/templates` を参照するため、テンプレートが欠落すると `akari create` が失敗する。

---

## publish 後の確認 / Post-publish Verification

```bash
# 外部環境（monorepo 外の一時ディレクトリ）で動作確認
mkdir /tmp/akari-verify && cd /tmp/akari-verify
npm install @akari-os/app-cli
npx akari-app-cli create test-app --tier full --author "Test" --category research
ls test-app/  # テンプレートが展開されていること
```

これが成功すると、外部 scaffold が正常に動作することが確認できる（クリーンルーム検証: HUB-108 K-3 P0-1）。

---

## バージョン管理 / Versioning

- `packages/*/package.json` の `version` を一括更新してから publish する。
- リリースタグ: `sdk-types@X.Y.Z` / `shell-ui@X.Y.Z` / `app-cli@X.Y.Z`
- `CHANGELOG.md`（リポ root）を更新する。
