# Changelog

All notable changes to AKARI App SDK will be documented in this file.

## [Unreleased]

### Added
- `@akari-os/bridge-core` パッケージ新規追加 — Tauri WS / MCP ブリッジ（sidecar 認証 + callRenderer）（2026-06-09）
- bridge-core: MCP ブリッジにトークン認証 + Host 検証を追加（2026-05-22）
- bridge-core: APP_BRIDGE_PORTS に com.akari.shell / diagram / fx / synth / circuit を順次追加（2026-05-22 〜 2026-06-09）
- `@akari-os/headless-render` パッケージ新規追加 — canvas アプリ（design / video）のヘッドレスレンダラー（Phase A: API 骨組み）（2026-05-08）
- shell-ui: PublishPanel — 投稿 capability の共通インラインシート（2026-05-15）
- shell-ui: PreviewTile / LibraryBrowser / LibraryListingsView を追加（2026-05-10）
- app-cli: `akari video` コマンド群を追加（2026-04-28）
- npm publish 対応 + CLI 非対話化（`app-cli create` の非インタラクティブモード）（2026-04-28）
- 外部 scaffold 検証ハーネス追加（`scripts/verify-external-scaffold.mjs`）（2026-04-28）
- AKARI-SDK-004: `examples/web-search` 逆算仕様を追加（2026-04-28）

### Fixed
- scaffold テンプレと docs の SDK 名を `@akari-os/sdk` に統一（monorepo 外で `pnpm install` 不能だった問題）（2026-06-05）
- bridge-core: 無認証 WS 接続で sidecar プロセスが落ちる問題を修正（2026-05-22）
- bridge-core: MCP Server に tools capability を明示宣言（2026-05-22）
- sdk-types: schema 配布欠落を修正 — `files` の `../` パスは npm pack でスキップされる問題（2026-04-30）
- scaffold の依存戦略を文脈検出に変更 — monorepo 外では npm 公開版 range を出力（2026-04-28）

## [0.1.0] - 2026-04-22

### Added
- RULES §7 compliance block in `docs/README.md`
- First reverse specs: AKARI-SDK-001 (sdk-types), AKARI-SDK-002 (schema-panel), AKARI-SDK-003 (app-cli)

### Fixed
- Broken link to AMP protocol spec in `docs/api-reference/memory-api.md`

## 2026-04-21

### Changed (BREAKING)
- Terminology: "Module" → "App" (PR #1 merged)
