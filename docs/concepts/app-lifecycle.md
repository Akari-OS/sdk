---
title: App Lifecycle — インストールから廃止まで
updated: 2026-04-19
related: [HUB-024, HUB-005]
---

# App Lifecycle — インストールから廃止まで / From Install to Uninstall

> App は「インストール → 有効化 → 開発 → 公開 → 更新 → 無効化 → アンインストール」の
> ライフサイクルを持つ。各フェーズで Core（Shell / Agent Runtime / Memory Layer）との
> 関係がどう変わるかを理解することで、正しい App 設計ができる。

---

## ライフサイクル全体図 / Full Lifecycle Diagram

```
          ┌──────────────────────────────────────────────────────────┐
          │                                                          │
          ▼                                                          │
    [ install ]                                                      │
      ↓ akari.toml を解析                                           │
      ↓ 互換性チェック（sdk range 確認）                              │
      ↓ Permission 宣言を Shell に登録                               │
      ↓ Panel Schema を Shell Schema レジストリに登録                │
          │                                                          │
          ▼                                                          │
    [ enable ]                                                       │
      ↓ Shell サイドバーに Panel アイコンが現れる                     │
      ↓ MCP サーバーが初回起動（on-demand、常駐しない）               │
      ↓ 初回認証フロー（OAuth / API Key 設定）                        │
          │                                                          │
          ▼                                                          │
    [ active ]  ← 通常稼働状態                                       │
      ↓ ユーザーが Panel を開く → Shell が MCP サーバーを起動         │
      ↓ MCP tools 呼び出し → 結果を Panel に返す                     │
      ↓ Pool / AMP への読み書き（記憶層経由のみ）                     │
      ↓ 他 App からの handoff 受信                                │
      ↓ Panel を閉じる → MCP サーバーが終了（揮発）                  │
          │                                                          │
          ▼                                                          │
    [ update ]                                                       │
      ↓ 新バージョンの akari.toml・Panel Schema・MCP server を上書き  │
      ↓ 互換性チェック（sdk range、Permission 変化の通知）            │
      ↓ 記憶層（Pool / AMP）のデータは引き継がれる                   │
          │                                                          │
          ▼                                                          │
    [ disable ]                                                      │
      ↓ Panel アイコンが非表示                                       │
      ↓ 既存の Pool / AMP データは残る                               │
      ↓ MCP サーバーは起動しない                                     │
          │                                                          │
          ▼                                                          │
    [ uninstall ] ─────────────────────────────────────────────────┘
      ↓ Shell から Panel Schema を削除
      ↓ Permission 宣言を解除
      ↓ Keychain の認証情報を削除（akari.toml の keychain 宣言に従う）
      ↓ Pool / AMP データは残る（ユーザーの資産）
```

---

## 各フェーズの詳細 / Phase Details

### install — インストール

```bash
# 公式マーケットから
akari app add com.akari.x-sender

# npm パッケージとして（自己配布）
akari app add @myorg/my-app

# Git リポジトリから直接
akari app add https://github.com/myorg/my-app
```

**Shell が行うこと**:

1. `akari.toml` を解析し、`sdk = ">=0.1.0 <1.0"` を現在の Core SDK バージョンと照合
2. `[permissions]` 宣言をユーザーに提示し、承認を求める
3. `panels/*.schema.json` を Schema レジストリに登録
4. Skill API で公開される関数を Skill Registry に登録

**互換性チェックに失敗した場合**:

```
Error: App "com.example.my-app" requires sdk ">=2.0.0",
       but current Core SDK is "0.4.2".
       Update AKARI Core to install this app.
```

---

### enable — 有効化

インストール直後、またはユーザーが明示的に有効化したとき。

- Shell のサイドバーに Panel アイコンが表示される
- MCP サーバーは**まだ起動しない**（Panel を開いたときに初めて起動 = on-demand）
- 初回のみ: 認証フロー（OAuth / API Key 入力）が起動する

---

### active — 通常稼働 / The Active State

App の通常稼働状態。**CAA（Costume Agent Architecture）の揮発/永続原則**がここで機能する。

```
[ユーザーが Panel を開く]
     ↓
Shell が MCP サーバーを起動（プロセス生成）
     ↓
[ユーザーが操作・MCP tool を呼び出す]
     ↓
MCP サーバーが Pool / AMP に読み書き（記憶層）
     ↓
[ユーザーが Panel を閉じる]
     ↓
MCP サーバーが終了（プロセス消滅）
```

**重要な原則 — 揮発と永続の分離**:

| 層 | 揮発性 | 説明 |
|---|---|---|
| MCP サーバー（道具層） | **揮発** | Panel を閉じると終了。次回開いたとき新しく起動 |
| Panel の表示状態 | **揮発** | Panel を閉じるとリセット（Pool に下書き保存を推奨） |
| Pool・AMP（記憶層） | **永続** | App が終了しても残る。再起動後も参照可能 |

この分離があるため：

- App がクラッシュしても**ユーザーのデータ（記憶層）は消えない**
- 複数の App が同時に Pool / AMP にアクセスできる
- Agent Runtime（7 人のデフォルトエージェント）も同じ記憶層を参照する

---

### dev — 開発中 / During Development

```bash
akari dev
```

`akari dev` は `active` の特殊モード。

- `mcp-server/` のソースを変更 → Hot Reload で自動再起動
- `panels/*.schema.json` を変更 → Shell がリアルタイムで再描画
- ログが Shell の開発コンソールに流れる
- `dry_run` モードで外部 API を叩かずに動作確認できる

---

### publish — 公開 / Publishing

```bash
# 公式マーケット（Manual Review あり）
akari app publish

# npm 自己配布（Lint + Contract Test のみ）
npm publish @myorg/my-app
```

公式マーケット掲載は [Certification Guide](../certification/) を参照。

---

### update — 更新 / Updating

```bash
akari app update com.example.my-app
```

**更新時の注意事項**:

- `[permissions]` が増えた場合、ユーザーへの再承認プロンプトが出る
- `panel.schema.json` の変更は即時反映（既存フォームに影響する場合は注意）
- Pool / AMP のデータは引き継がれる（App がデータ構造を変えた場合は移行処理が必要）
- `sdk` range の下限を上げた場合、古い Core では起動できなくなる（ユーザーへの警告が出る）

---

### disable / uninstall — 無効化・削除

```bash
akari app disable com.example.my-app   # 無効化（データ保持）
akari app remove  com.example.my-app   # 完全削除
```

**削除時に消えるもの**:

- Panel Schema の Shell 登録
- Permission 宣言
- Keychain の認証情報（`keychain` 宣言があるもの）
- App の MCP サーバーバイナリ・ソース

**削除後も残るもの**:

- Pool に保存したデータ（ユーザーの素材はユーザーのもの）
- AMP の記録（監査ログ・操作履歴）

> **設計の意図**: App を削除しても、そのツールを使って作ったコンテンツ（Pool）や
> 操作履歴（AMP）は消えない。これにより、App を入れ替えても**過去の作業の連続性が保たれる**。

---

## CAA 原則との関係 / Relationship with CAA Principles

AKARI の Costume Agent Architecture（CAA）は「思考層は揮発、記憶層は永続」を原則とする。
App のライフサイクルはこの原則の**道具層（MCP サーバー）への適用**そのもの。

```
思考層（揮発）: エージェント
道具層（揮発）: MCP サーバー（Panel を閉じると消える）← App の主体
記憶層（永続）: Pool + AMP ← App が書いたデータは残る
```

App 開発者が守るべきこと：

1. **MCP サーバーに状態を持たせない** — 状態は Pool / AMP に書く
2. **Panel の入力中データは揮発** — ユーザーが閉じる前に保存するよう促す
3. **Pool / AMP の ID を大切にする** — App 間 handoff の根拠になる

---

## よくある誤解 / Common Misconceptions

**Q: MCP サーバーはバックグラウンドで常駐する？**

A: しない。Panel を開いたときだけ起動し、閉じたら終了する。
   常駐プロセスを必要とする処理（定期実行・通知など）は
   Core の Job System を使う（別仕様、Certification 必須）。

**Q: App 間は直接通信できる？**

A: できない。全てのやり取りは記憶層（Pool / AMP）経由。
   Inter-App API は Pool / AMP の ID を渡すだけで、bytes は直送しない。
   これにより誰が何を渡したかの履歴が AMP に自動記録される。

**Q: 削除したら Pool のデータが消える？**

A: 消えない。Pool はユーザーのデータ。App はそこに書き込む権限を持つが、
   削除時に全消しはできない（Permission API の設計上、削除は Pool 側の操作）。

---

## 関連ドキュメント / Related Docs

- [Tier Comparison](./tier-comparison.md) — Full vs MCP-Declarative の選び方
- [Architecture Map](./architecture-map.md) — SDK と Core の通信フロー全体
- [HUB-024 §6.2](https://github.com/Akari-OS/.github/blob/main/VISION.md) — App Tier 仕様
- [HUB-024 §6.9](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Toolchain（install / dev / certify / publish）
