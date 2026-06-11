---
title: App Directory Layout — ~/.akari/ のレイアウト正典
updated: 2026-06-12
related: [AKARI-HUB-108]
---

# App Directory Layout — `~/.akari/` のレイアウト正典

AKARI のローカル app 関連データは `~/.akari/` 配下に置く。AKARI-HUB-108 3-3 に基づき、アプリ実体とユーザーデータは分離する。

## `apps/<app-id>/`

アプリ実体の置き場。`akari.toml`、ビルド済み `dist/`、MCP server など、アプリを起動するためのファイルを配置する。

アンインストール時はこのディレクトリを削除する。ユーザー設定や作業データはここに置かない。

## `app-data/<app-id>/`

ユーザーデータの置き場。`settings.json` や、アプリ独自の DB、キャッシュ、インデックスなど、再インストール後も復元したいデータはこの配下に置く。

アンインストール時のデフォルト動作では保持される。ユーザーが purge を明示した場合のみ削除する。

## `opted-out-builtins/`

同梱アプリの自動再インストールを抑止する sentinel の置き場。一度アンインストールした同梱アプリを、次回起動時に勝手に戻さないために使う。

Library から同梱アプリを明示的に再インストールした場合、該当 sentinel は解除される。

## 開発者向け原則

- アプリ実体は `~/.akari/apps/<app-id>/` に置く。
- 設定ファイルは `~/.akari/app-data/<app-id>/settings.json` に置く。
- 独自データ、DB、キャッシュも `~/.akari/app-data/<app-id>/` 配下に置く。
- アンインストールで消してよいものと、ユーザーのデータとして保持するものを分ける。
