# AKARI Writer

公式の文章作成 App。140/280 字 SNS から長文記事まで対応予定。

> **MVP scaffold 状態 (2026-04-22)**: App Loading 機構の動作確認用。
> 実際の Writer UI は次スプリントで `akari-shell/src/modules/writer/` から移植。

## 構造

- `akari.toml` — App Manifest（SDK spec: `packages/sdk-types/src/manifest.ts`）
- `src/index.tsx` — Panel `main` のエントリポイント

## 関連

- [App Loading MVP 設計](../../../akari-os/docs/planning/app-loading-mvp-2026-04-22.md)
- [AKARI-HUB-003 AKARI Writer spec](../../../akari-os/docs/sdd/specs/spec-akari-writer.md)
- [AKARI-HUB-024 App SDK](../../../akari-os/docs/sdd/specs/spec-akari-app-sdk.md)
- [AKARI-SHELL-001 Writer Module (逆算)](../../../akari-shell/docs/specs/spec-reverse-writer-module.md)
