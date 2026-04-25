---
title: Troubleshooting & FAQ
section: sdk
related-specs: [AKARI-HUB-024, AKARI-HUB-025, AKARI-HUB-026]
created: 2026-04-19
updated: 2026-04-19
---

<!-- markdownlint-disable MD029 -->
<!-- 解決手順は順序付きリスト + コードブロック挟みの構造を多用するため、ordered list prefix の連続性を要求する MD029 を本ファイルでは無効化（GFM はリストを正しく描画する） -->

# Troubleshooting & FAQ

AKARI App SDK を使った開発でつまずいたとき、まずここを見る。
問題ごとに「症状 → 原因 → 解決」の形式でまとめた実用ガイド。

---

## 1. Quick Diagnostic Flowchart

```
問題が起きた
│
├── インストール / セットアップが完了しない
│   └── → §2 Install / Setup 系
│
├── akari app certify が落ちる
│   ├── Lint エラーが出る       → §3.1 Lint エラー各種
│   ├── JSONLogic のエラー      → §3.2 JSONLogic syntax エラー
│   ├── Panel Schema が通らない → §3.3 Panel Schema バリデーション失敗
│   └── category 違反と言われる → §3.4 category 違反 (ADR-013)
│
├── 実行中にエラーが出る
│   ├── MCP サーバーが起動しない          → §4.1 MCP 接続失敗
│   ├── OAuth / token のエラー            → §4.2 OAuth トークン期限切れ
│   ├── Pool にアクセスできない            → §4.3 Pool アクセス権限
│   └── handoff が target 側で拒否される  → §4.4 App 間 handoff 拒否
│
├── UI が表示されない / おかしい
│   ├── Panel 自体がマウントされない             → §5.1 Panel がマウントされない
│   ├── widget が unknown type と言われる        → §5.2 SchemaPanel widget が unknown type
│   └── ラベルが key 文字列のままになっている    → §5.3 i18n key not resolved
│
└── 動作は合っているが遅い / 重い
    ├── App の起動が遅い             → §6.1 App 起動遅い
    ├── Panel のレンダリングが重い   → §6.2 Panel レンダリング重い
    └── メモリが増え続ける           → §6.3 メモリリーク
```

---

## 2. Install / Setup 系

### 2.1 Node.js バージョンミスマッチ

**症状**

```
error @akari/sdk: The engine "node" is incompatible with this module.
Expected version ">=20.0.0". Got "18.x.x"
```

または `akari-app-cli create` 実行時にシンタックスエラーが出る。

**原因**

`@akari/sdk` は Node.js 20 以上を要求する。システムにインストールされている Node.js が古い。

**解決**

```bash
# バージョン確認
node -v

# nvm を使っている場合
nvm install 20
nvm use 20
nvm alias default 20

# volta を使っている場合
volta install node@20

# バージョン固定（プロジェクトルートに置く）
echo "20" > .nvmrc
# または
echo '{ "node": ">=20" }' > .node-version
```

`package.json` にも engines フィールドを明示しておくと、CI でも同様のチェックが走る。

```json
{
  "engines": {
    "node": ">=20.0.0"
  }
}
```

---

### 2.2 Permission エラー（macOS / Windows）

**症状（macOS）**

```
Error: EACCES: permission denied, mkdir '/usr/local/lib/node_modules/@akari'
```

**原因**

グローバルインストールを `sudo` なしで試みている。npm のグローバルディレクトリが root 所有になっている。

**解決（macOS）**

グローバルディレクトリをユーザー所有に変更するか、nvm / volta を使って root を不要にする。

```bash
# nvm 推奨（sudo 不要）
nvm install 20
npm install -g akari-app-cli   # nvm 管理下では sudo 不要

# 既存 npm の場合：グローバルディレクトリを変更
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.zshrc
source ~/.zshrc
npm install -g akari-app-cli
```

**症状（Windows）**

```
Error: EPERM: operation not permitted
```

**解決（Windows）**

PowerShell を「管理者として実行」するか、Node.js を nvm-windows または volta で管理する。
実行ポリシーエラーが出る場合は以下を実行：

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

---

### 2.3 CLI が見つからない

**症状**

```
command not found: akari
```

または `akari-app-cli` がインストール済みなのに `akari` コマンドが動かない。

**原因 1** — グローバルインストールが PATH に含まれていない  
**原因 2** — ローカルインストールしかしていない  
**原因 3** — nvm / volta の切り替え後に再インストールが必要

**解決**

```bash
# グローバルインストール確認
npm list -g akari-app-cli

# PATH 確認
echo $PATH | tr ':' '\n' | grep npm

# ローカル実行（npx）
npx akari-app-cli create my-app

# または package.json の scripts 経由
# "scripts": { "create": "akari-app-cli create" }

# nvm 切り替え後に再インストールが必要な場合
nvm use 20
npm install -g akari-app-cli
```

---

## 3. `akari app certify` が落ちる

### 3.1 Lint エラー各種

**症状 — 自前 DB 検出**

```
[LINT ERROR] AKR-G002: App must not create its own database.
  Found: new Database('./local.db') at src/storage.ts:12
  Fix: Use pool.put / pool.get instead.
```

**原因**

Guidelines §6.7-2「自前 DB 禁止、全データは Pool / AMP 経由」に違反している。

**解決**

```typescript
// NG: SQLite / IndexedDB / localStorage を直接使う
const db = new Database('./local.db')
db.exec('CREATE TABLE ...')

// OK: Pool を使う
import { pool } from '@akari/sdk'
const id = await pool.put({ bytes, mime: 'application/json', tags: ['my-data'] })
const item = await pool.get(id)
```

---

**症状 — 独自ウィンドウ検出**

```
[LINT ERROR] AKR-G003: App must not create windows outside Shell panel.
  Found: new BrowserWindow() at src/main.ts:8
```

**原因**

Guidelines §6.7-3「独自ウィンドウ禁止」違反。Shell の panel 規格に従う必要がある。

**解決**

```typescript
// NG: BrowserWindow / electron.dialog など
const win = new BrowserWindow({ width: 800, height: 600 })

// OK: Shell の UI API を使う
import { shell } from '@akari/sdk'
shell.mountPanel({
  id: 'my-app.main',
  title: 'My App',
  component: MyPanel,
})
```

---

**症状 — 直接通信検出**

```
[LINT ERROR] AKR-G004: Direct inter-app communication is forbidden.
  Found: fetch('akari://app/com.akari.writer/api/...') at src/handoff.ts:34
```

**原因**

Guidelines §6.7-4「エージェント間通信は記憶層経由」違反。App を直接叩いている。

**解決**

```typescript
// NG: 他 App のエンドポイントを直接叩く
const res = await fetch('akari://app/com.akari.writer/api/draft')

// OK: Inter-App API で ID のみ渡す
import { app } from '@akari/sdk'
await app.handoff({
  to: 'com.akari.writer',
  intent: 'import-draft',
  payload: {
    draft_ref: ampRecordId,   // AMP の ID
    assets: [poolItemId],     // Pool の ID
  },
})
```

---

**症状 — エージェントのコード内動的生成**

```
[LINT ERROR] AKR-G008: Agent spec must be defined in files, not generated in code.
  Found: defineAgent({ persona: buildPersona() }) at src/agents/dynamic.ts:5
  Fix: Move agent definition to agents/*.md
```

**原因**

Guidelines §6.7-8「エージェント spec はファイル（md）で定義、コード内で動的生成しない」違反。

**解決**

```typescript
// NG: ランタイムでエージェントを動的生成
const agent = defineAgent({
  id: 'dynamic_' + userId,
  persona: buildPersona(userId),
})

// OK: agents/*.md ファイルで静的定義
// agents/editor.md に spec を書き、呼び出し時に context を渡す
const result = await invoke({
  agent: 'editor',
  prompt: 'この下書きを整えて',
  context: { userId, preferences: userPrefs },
})
```

---

**症状 — AMP record に goal_ref なし**

```
[LINT ERROR] AKR-G002b: AMP record must have goal_ref.
  Found: amp.record({ kind: 'decision', content: '...' }) at src/memory.ts:22
  Fix: Add goal_ref to every amp.record() call.
```

**解決**

```typescript
// NG: goal_ref がない
await amp.record({ kind: 'decision', content: 'タイトルを変更' })

// OK: goal_ref を付ける
await amp.record({
  kind: 'decision',
  content: 'タイトルを変更',
  goal_ref: 'AKARI-HUB-024',   // 何のゴールへの記録か
})
```

---

**症状 — manifest に宣言されていない権限を要求**

```
[LINT ERROR] AKR-P001: Permission 'filesystem.write' not declared in manifest.
  Declared: pool, amp
  Requested at: src/export.ts:18
```

**解決**

`akari.toml` に権限を追加する。

```toml
[permissions]
pool       = ["read", "write"]
amp        = ["read", "write"]
filesystem = ["write:user-docs"]   # ← 追加
```

権限は必要最小限に留める（Guidelines §6.7-5）。

---

### 3.2 JSONLogic syntax エラー

**症状**

```
[LINT ERROR] AKR-S025: Invalid expression in 'enabled_when'.
  Value: "$when != null && $text.length > 0"
  Detail: JavaScript expression syntax is not allowed. Use JSONLogic.
```

**原因**

`panel.schema.json` の `enabled_when` / `visible_when` に JavaScript 式を書いている。
Panel Schema v0 の式言語は **JSONLogic** を使う（HUB-025 Q-1 採用予定）。

**解決**

```json
// NG: JS 式
{ "enabled_when": "$when != null && $text.length > 0" }

// OK: JSONLogic 形式
{
  "enabled_when": {
    "and": [
      { "!=": [{ "var": "when" }, null] },
      { ">": [{ "strlen": { "var": "text" } }, 0] }
    ]
  }
}
```

よく使うパターン：

```json
// null チェック
{ "!=": [{ "var": "field_id" }, null] }

// 文字数チェック（280 文字以下）
{ "<=": [{ "strlen": { "var": "text" } }, 280] }

// 選択値チェック
{ "in": [{ "var": "status" }, ["draft", "review"]] }

// AND / OR
{ "and": [ ... ] }
{ "or":  [ ... ] }
```

---

### 3.3 Panel Schema バリデーション失敗

**症状**

```
[CERTIFY ERROR] Panel Schema validation failed: panels/main.schema.json
  - /fields/0: must have required property 'id'
  - /actions/1/mcp: must have required property 'tool'
  - /fields/2/type: must be equal to one of the allowed values
```

**原因**

`panel.schema.json` が HUB-025 の meta-schema に沿っていない。よくある間違いは次の 3 点：

1. `id` フィールドの省略
2. `mcp` オブジェクト内の `tool` キー省略
3. Widget type に存在しない名前を書いた

**解決**

```json
// NG: id が省略されている
{
  "fields": [
    { "type": "textarea", "label": "本文" }
  ]
}

// OK
{
  "fields": [
    { "id": "body", "type": "textarea", "label": "本文" }
  ]
}
```

```json
// NG: mcp.tool が省略されている
{
  "actions": [
    { "id": "post", "mcp": { "args": { "text": "$body" } } }
  ]
}

// OK
{
  "actions": [
    {
      "id": "post",
      "mcp": { "tool": "x.post", "args": { "text": "$body" } }
    }
  ]
}
```

使用できる Widget type の一覧は [Widget Catalog](./api-reference/widget-catalog.md) を参照。
`pool-picker` など AKARI 固有 widget の type 文字列はハイフン区切りなので注意する（`poolPicker` は無効）。

**MCP ツールとの contract 不整合**

```
[CERTIFY ERROR] Panel Schema / MCP contract mismatch
  Field 'media' binds to 'mcp.x.post.media_ids' but MCP tool 'x.post' has no param 'media_ids'.
  MCP tool params: text, media_urls
```

`bind` の MCP 引数名が MCP サーバーの tool 定義と一致していない。`akari.toml` の `tools` 宣言と Panel Schema の `bind` / `mcp.args` を突き合わせて正しい引数名を確認する。

---

### 3.4 category 違反（ADR-013）

**症状**

```
[LINT ERROR] AKR-C001: App category 'publishing' does not match declared tools.
  Declared category: publishing
  Tools with 'documents' category signature detected: notion.create_page, notion.query_database
  Fix: Set category = "documents" in akari.toml, or replace tools.
```

**原因**

`akari.toml` の `category` フィールドと、実際に宣言した MCP ツール群の性質が ADR-013 のカテゴリ分類規則に合っていない。

**解決**

ADR-013 のカテゴリ定義に従って `category` を修正する。

```toml
# NG: SNS 投稿ツールなのに documents カテゴリ
[app]
category = "documents"

[mcp]
tools = ["x.post", "x.schedule"]

# OK
[app]
category = "publishing"

[mcp]
tools = ["x.post", "x.schedule"]
```

主なカテゴリ：

| category | 典型的な用途 |
|---|---|
| `publishing` | SNS 投稿・予約・下書き（X / LINE / Bluesky など） |
| `documents` | ドキュメント作成・管理（Notion / Google Docs など） |
| `research` | 情報収集・検索（Perplexity / Exa など） |
| `storage` | ファイル・メディア管理（Dropbox / Google Drive など） |
| `analytics` | データ集計・可視化 |
| `notification` | アラート・通知送信 |

---

## 4. 実行時エラー

### 4.1 MCP 接続失敗（server が起動しない）

**症状**

```
[RUNTIME ERROR] MCP server 'mcp-servers/x-sender' failed to start.
  Exit code: 1
  stderr: Error: Cannot find module '@akari/pool-mcp'
```

または Shell に App を追加しても Panel が空白のまま。

**原因 A** — MCP サーバーの依存パッケージが未インストール

```bash
# モジュールディレクトリで依存をインストール
cd mcp-servers/x-sender
npm install

# または monorepo 構成なら
npm install --workspaces
```

**原因 B** — `akari.toml` の `server` パスが間違っている

```toml
# NG: パスが存在しない
[mcp]
server = "mcp-servers/sender"   # ← 実際は x-sender

# OK: 実際のパスに合わせる
[mcp]
server = "mcp-servers/x-sender"
```

**原因 C** — Node.js バージョンが古い（§2.1 参照）

**デバッグ方法**

```bash
# MCP サーバーを単独で起動してログを確認
node mcp-servers/x-sender/index.js

# akari dev の詳細ログ
AKARI_LOG_LEVEL=debug akari dev
```

---

### 4.2 OAuth トークン期限切れ

**症状**

```
[RUNTIME ERROR] OAuth token expired or revoked for 'notion.com'.
  App: com.akari.notion
  Action: notion.create_page
  Detail: 401 Unauthorized
```

Panel に「再認証が必要です」バナーが出る、または API 呼び出し時に 401 エラーが出る。

**原因**

Keychain に保存した OAuth access token が失効した。Notion OAuth は refresh token を発行しないため、失効後は再認証が必要。

**解決**

1. Shell の App 設定 → 「Notion の認証を更新」ボタンをクリック
2. ブラウザで再度 Notion 認証ページを開き、workspace を選択
3. token が Keychain に保存され直されたことを確認

**再現防止**

`settings` panel に「認証の有効期限」を表示する機能を App に実装しておくと、ユーザーが事前に気づける。

```json
// notion-settings.schema.json に追加
{
  "id": "token_status",
  "type": "stat",
  "label": "{{t:settings.token_status}}",
  "bind": "state.tokenExpiresAt"
}
```

---

### 4.3 Pool アクセス権限

**症状**

```
[RUNTIME ERROR] Permission denied: pool.write
  App 'com.x.sender' does not have 'pool.write' permission.
  Declared permissions: pool = ["read"]
```

**原因**

`akari.toml` の `[permissions]` で `pool` の読み取りしか宣言していないのに、書き込みを試みた。

**解決**

1. まず書き込みが本当に必要かを確認する（Guidelines §6.7-5: 必要最小限の権限）
2. 必要であれば `akari.toml` を更新する

```toml
[permissions]
pool = ["read", "write"]   # "write" を追加
```

3. Certification を再実行して Lint を通す
4. マーケット掲載済みの場合は permission 変更に Manual Review が必要

---

### 4.4 App 間 handoff が target 側で拒否される

**症状**

Shell に「○○ App が handoff を受け取れませんでした」トーストが出る。

または：

```
[RUNTIME ERROR] Handoff rejected by 'com.akari.video'.
  Reason: intent 'create-video-from-draft' is not declared in target app's manifest.
```

**原因 A** — 受け取り側が `intent` を宣言していない

handoff の `intent` は受け取る側の App が manifest で受け入れを宣言しておく必要がある。

```toml
# 受け取り側 (com.akari.video) の akari.toml
[handoff.accept]
intents = ["create-video-from-draft", "import-media"]
```

**原因 B** — payload に Pool / AMP の ID ではなくデータそのものを含めている

```typescript
// NG: bytes を直接 payload に含める（HUB-024 §6.5 違反）
await app.handoff({
  to: 'com.akari.video',
  payload: { videoBytes: new Uint8Array([...]) }
})

// OK: Pool に先に入れ、ID だけ渡す
const assetId = await pool.put({ bytes: videoBytes, mime: 'video/mp4' })
await app.handoff({
  to: 'com.akari.video',
  payload: { assets: [assetId] }
})
```

**原因 C** — 受け取り側 App がインストールされていない

```bash
# App がインストールされているか確認
akari app list | grep com.akari.video

# インストール
akari app add com.akari.video
```

---

## 5. UI が表示されない

### 5.1 Panel がマウントされない

**症状**

Shell のサイドバーに App のアイコンが出るが、Panel をクリックしても何も表示されない。
または `akari dev` のコンソールに：

```
[WARN] Panel 'writer.main' mounted but component threw during render.
```

**確認手順**

1. ブラウザ DevTools（Shell は Electron / WebView 内）を開く
2. Console タブでエラーを確認
3. `AKARI_LOG_LEVEL=debug akari dev` で詳細ログを出す

**よくある原因と解決**

| 原因 | 解決 |
|---|---|
| `shell.mountPanel` の `id` に重複がある | App ID を含んだユニーク名にする（例: `my-app.main`） |
| Panel コンポーネントが default export されていない | `export default MyPanel` を確認 |
| Panel の React バージョンが Core と不整合 | `@akari/sdk` が peer dependency に指定する React バージョンを使う |
| `akari.toml` の `[panels]` の `mount` パスが間違っている | 実際のファイルパスと一致するか確認 |
| MCP-Declarative なのに `mount` を指定している | MCP-Declarative は `schema` キーを使う（`mount` は Full Tier 用） |

```toml
# Full Tier
[panels]
main = { title = "Writer", mount = "panels/writer.tsx" }

# MCP-Declarative Tier
[panels]
main = { title = "X", schema = "panels/x-sender.schema.json" }
```

---

### 5.2 SchemaPanel widget が unknown type

**症状**

Panel の一部が「Unknown widget type: pool-picker」のような灰色ブロックで表示される。

**原因 A** — Shell の SDK バージョンが古く、該当 widget がまだ実装されていない

`pool-picker` / `amp-query` / `app-picker` / `agent-picker` 等の AKARI 固有 widget は
Phase 1（HUB-025 §7）で実装される。現在（v0 初期）は Phase 0 の最小セットのみ利用可能。

**利用可能な widget（Phase 0）**

```
text, textarea, password, email, url
number, slider, stepper
select, multi-select, radio, checkbox, toggle
date, time, datetime, datetime-optional, duration
file-upload, image-preview, video-preview
markdown, badge, stat, progress, image, divider
button, link, menu
tabs, accordion, split, group
```

**原因 B** — typo（ハイフンの有無）

```json
// NG: camelCase
{ "type": "poolPicker" }
{ "type": "richTextEditor" }

// OK: ハイフン区切り
{ "type": "pool-picker" }
{ "type": "rich-text-editor" }
```

**回避策（未実装 widget）**

使いたい widget がまだ実装されていない場合は、Full Tier に移行して React で実装するか、代替 widget で表現する。

```json
// pool-picker が未実装の場合の暫定代替
{
  "id": "media_url",
  "type": "url",
  "label": "{{t:media.url}}",
  "placeholder": "Pool URL を貼り付けてください"
}
```

---

### 5.3 i18n key not resolved

**症状**

Panel のラベルが「投稿する」の代わりに `action.post` と表示される。

**原因**

`{{t:action.post}}` の key が `locales/ja.json` に定義されていない、または locale ファイルのパスが間違っている。

**解決**

1. `locales/ja.json` が App ルートに存在するか確認

```bash
ls my-app/locales/
# ja.json  en.json
```

2. key が定義されているか確認

```json
// locales/ja.json
{
  "action.post": "投稿する",
  "action.schedule": "予約する",
  "post.body": "本文",
  "post.media": "添付ファイル",
  "post.schedule": "予約日時"
}
```

3. `akari.toml` の `[app]` に `defaultLocale` が設定されているか確認

```toml
[app]
id            = "com.x.sender"
defaultLocale = "ja"
```

**フォールバック動作**（HUB-025 §6.7）

| 状況 | 表示 |
|---|---|
| ja.json に key がある | 日本語文字列 |
| ja.json に key がなく en.json にある | 英語文字列（フォールバック） |
| どちらにも key がない | `action.post` のように key 文字列がそのまま表示 |

key 文字列がそのまま表示された場合は locale ファイルに追加する。

---

## 6. Performance 系

### 6.1 App 起動遅い

**症状**

Shell に App を追加したあと、Panel が表示されるまで 3 秒以上かかる。

**原因と対策**

**原因 A** — MCP サーバーの起動が遅い

```bash
# MCP サーバーの起動時間を計測
time node mcp-servers/x-sender/index.js --check-only
```

- `node_modules` のサイズを最小化する（production dependencies のみ）
- MCP サーバーのエントリポイントをシンプルに保つ
- 重い処理（DB 接続・外部 API 認証）は lazy-init にする

**原因 B** — SDK バージョンが古い（パフォーマンス改善が含まれている可能性）

```bash
npm update @akari/sdk
```

**原因 C** — Panel コンポーネントのトップレベルで重い同期処理を実行している

```typescript
// NG: マウント時に重い処理を同期実行
function MyPanel() {
  const data = JSON.parse(fs.readFileSync('huge-file.json', 'utf-8'))  // ←
  return <div>{data}</div>
}

// OK: 非同期 + useEffect
function MyPanel() {
  const [data, setData] = useState(null)
  useEffect(() => {
    loadDataAsync().then(setData)
  }, [])
  return data ? <div>{data}</div> : <Spinner />
}
```

---

### 6.2 Panel レンダリング重い

**症状**

Panel のスクロール・入力・クリックに対してレスポンスが遅い（フレームドロップ）。

**原因と対策**

**原因 A** — Pool から大量のアイテムを一括取得してリストに直接レンダリングしている

```typescript
// NG: 一括取得 → 全件レンダリング
const all = await pool.search({ query: 'all-items', limit: 1000 })
return <>{all.map(item => <ItemCard key={item.id} item={item} />)}</>

// OK: ページネーション + 仮想スクロール
import { VirtualList } from '@akari/sdk/react'
const page = await pool.search({ query: 'all-items', limit: 20, offset })
return <VirtualList items={page} renderItem={(item) => <ItemCard item={item} />} />
```

**原因 B** — MCP ツールを Panel の render フェーズで呼び出している

MCP 呼び出しは必ず `useEffect` や action handler の中で行う。render 中に非同期処理を走らせると Waterfall が発生する。

**原因 C** — Schema Panel に `table` や `card-grid` で大量データを直接渡している

```json
// panel.schema.json に limit 指定を追加
{
  "id": "results",
  "type": "table",
  "bind": "state.queryResults",
  "maxRows": 50
}
```

---

### 6.3 メモリリーク

**症状**

App を長時間使っていると Shell 全体がだんだん重くなる。DevTools の Memory タブでヒープが増え続けている。

**よくある原因**

**原因 A** — MCP サーバーからのイベントリスナーを解除していない

```typescript
// NG: cleanup なし
useEffect(() => {
  shell.onSelection(handleSelection)
}, [])

// OK: cleanup あり
useEffect(() => {
  const unsub = shell.onSelection(handleSelection)
  return () => unsub()
}, [])
```

**原因 B** — Pool / AMP の大きなレスポンスをコンポーネントの state に保持し続けている

- レスポンスは必要な間だけ state に置き、不要になったら null にする
- `pool.get` の結果（Blob / ArrayBuffer）は `URL.revokeObjectURL` を忘れない

**原因 C** — MCP-Declarative の `state.*` binding に無制限にデータを積んでいる

Panel ローカル state は揮発的に扱い、永続化が必要なデータは Pool / AMP に書き出す。
巨大なオブジェクトを `state.data` に入れ続けると Panel のメモリが増え続ける。

---

## 7. FAQ

### Q: Full Tier と MCP-Declarative Tier のどちらを選ぶべきか？

**A:**

まず MCP-Declarative から始めることを強く推奨する。

| 観点 | Full Tier | MCP-Declarative Tier |
|---|---|---|
| 参入コスト | 高（React + TypeScript 必須） | 低（JSON + MCP サーバーのみ） |
| UI 自由度 | 高（任意の React コンポーネント） | 中（Shell の標準 widget セット） |
| 審査 | 重（Manual Review 必須） | 軽（Automated + Contract Test のみ） |
| マイグレーション | Full → Declarative は原則不可 | Declarative → Full は可能 |

典型的な判断フロー：

1. MCP-Declarative で始め、`panel.schema.json` で UI を宣言する
2. 「この widget では表現できない」というユースケースが具体的に出てきたら Full Tier に移行する
3. SNS 投稿・通知・外部サービス連携などフォーム中心の UI は大半が MCP-Declarative で完結する

`tier = "mcp-declarative"` を `tier = "full"` に変更し、Panel を React で書き直すことでいつでも昇格できる。

---

### Q: 自分の App 固有エージェントと 7 つの reference agent（Persistent Identity）の違いは何か？

**A:**

AKARI Core には 7 人の Persistent Identity エージェントが常駐している（Orchestrator / Analyst / Creator 等）。これらは Core が管理するプラットフォーム資産であり、App 開発者は定義も変更もできない。

一方、App 固有エージェント（`agents/*.md`）は：

- **その App の用途に特化**したオン・デマンド（揮発）エージェント
- App が削除されれば消える
- `akari.toml` の `[agents]` で宣言し、`agents/` 配下の `.md` ファイルで spec を定義

関係は以下のように整理できる：

```
Core の 7 Persistent Agent
  ├── App A の固有エージェント（App A のインストール中のみ存在）
  ├── App B の固有エージェント
  └── ...
```

App 固有エージェントから Core の 7 Agent に処理を委譲したい場合は、Memory API（Pool / AMP）を介してデータを渡す。直接呼び出す手段は提供されていない。

---

### Q: ローカルでテストする方法は？

**A:**

```bash
# 1. 開発サーバーで Shell に mount
akari dev

# 2. Certification（本番前チェック）を実行
akari app certify

# 3. Contract Test のみを走らせる
akari app certify --only contract

# 4. Lint のみ
akari app certify --only lint

# 5. MCP サーバーを単独で起動してツールをテスト
node mcp-servers/x-sender/index.js
# 別ターミナルで MCP Inspector などを使って tool を直接呼ぶ

# 6. Panel Schema の検証
akari schema validate panels/x-sender.schema.json
```

**オフライン動作のテスト**

```bash
# ネットワークを遮断した状態でテスト（external-network=false の挙動確認）
AKARI_OFFLINE=true akari dev
```

**HITL ゲートのテスト**

`hitl: { require: true }` が設定された action を実行すると、Shell が承認ダイアログを出す。
ローカル開発中は承認・拒否の両方を手動でテストする。Contract Test でも「キャンセル時に MCP が呼ばれないこと」を自動検証する（§3.3）。

---

### Q: Marketplace に公開するには？

**A:**

```bash
# ステップ 1: Certification をすべて通す
akari app certify

# ステップ 2: npm パッケージとして公開（自己配布）
npm publish

# ステップ 3: 公式 Marketplace への申請（Manual Review が発生）
akari app publish
```

Tier による違い：

| Tier | 自己配布 | 公式 Marketplace |
|---|---|---|
| Full | Automated Lint + Contract Test のみ通ればOK | Manual Review が追加で必要 |
| MCP-Declarative | Automated Lint + Contract Test のみ通ればOK | Permission / OAuth スコープの審査のみ |

`akari app publish` を実行すると Marketplace チームへの Review リクエストが送られる。
Review の主な観点：

- 宣言した権限の用途が実際の UI / ツールと整合しているか
- HITL が必要な破壊的操作で `hitl: true` が設定されているか
- オフライン動作の graceful degradation が実装されているか

詳細は [Marketplace 公開ガイド](./tiers/marketplace-publishing.md) を参照。

---

### Q: 内部 AKARI spec ID（AKARI-HUB-024 など）を App のコードやドキュメントに使っていいか？

**A:**

**自分のプロジェクト内の参照**には自由に使ってよい。

`akari.toml` や `agents/*.md` 内でのコメント・参照として `[spec: AKARI-HUB-024]` のように使うことは問題ない。

ただし：

- **外向きドキュメント（ユーザー向けの README 等）** には spec ID を表示しない。内部管理用であり、エンドユーザーには関係がない
- **AMP record の `goal_ref`** には spec ID を使える（むしろ使うことを推奨）

```typescript
// OK: AMP の goal_ref に spec ID
await amp.record({
  kind: 'export-action',
  content: 'Notion にページを作成しました',
  goal_ref: 'AKARI-HUB-026',  // ← 自分のアプリが実装している spec を指す
})
```

---

### Q: TypeScript / Node.js 以外の言語・ランタイムで App を書けるか？

**A:**

**可能**だが、Tier によって制約が異なる。

**MCP-Declarative Tier**

MCP サーバーは任意の言語で書ける（Python / Rust / Go / Ruby 等）。
`akari.toml` で MCP サーバーの起動コマンドを指定するだけでよい。

```toml
[mcp]
server = "python mcp_servers/my_server.py"   # Python MCP サーバー
tools  = ["my_tool"]
```

Panel Schema は JSON なので言語依存がない。

**Full Tier**

Panel（UI）は現在 **TypeScript + React** のみサポート。
ビジネスロジック（`src/`）は TypeScript / JavaScript が基本だが、Rust App については `akari-sdk-rs`（Rust crate）が HUB-024 §6.10 Tasks Phase 3 で実装予定。

要約：

- **MCP サーバー部分**: 任意の言語 OK
- **Panel（UI）部分**: TypeScript + React のみ（現時点）
- **Rust Panel**: 将来対応予定（`akari-sdk-rs`）

---

### Q: App の商用利用は可能か？

**A:**

AKARI SDK 自体のライセンスは商用利用を許可している（詳細は [LICENSE](../../../../LICENSE) を参照）。

App 開発者が作った App を商用利用・販売する場合は：

1. **自己配布**の場合は開発者が独自のライセンスを設定できる
2. **公式 Marketplace 経由**の場合は別途定める Marketplace 利用規約と収益分配ポリシーが適用される（規約は Marketplace spec で定義、現時点では draft）
3. App が外部サービス（Notion / X 等）の API を利用する場合は、その API の利用規約も遵守が必要

商用利用に関する最新の条件は [AKARI OS 利用規約](https://akari-os.dev/terms)（準備中）を確認すること。

---

## 8. 連絡先 — issue / discussion

問題が解決しない場合や、このガイドに載っていないエラーに遭遇した場合は以下に報告する。

### バグ報告・機能要望

- **GitHub Issues**: [akari-os/akari-os/issues](https://github.com/akari-os/akari-os/issues)
  - バグ報告: `bug` ラベルを付けて `akari app certify` の出力全文を貼る
  - 機能要望: `enhancement` ラベル

### 質問・ディスカッション

- **GitHub Discussions**: [akari-os/akari-os/discussions](https://github.com/akari-os/akari-os/discussions)
  - カテゴリ `Q&A` を選ぶ
  - App ID（`com.xxx.yyy`）と SDK バージョン（`@akari/sdk x.y.z`）を明記する

### SDK バージョンの確認方法

```bash
npm list @akari/sdk
# または
cat node_modules/@akari/sdk/package.json | grep '"version"'
```

### Issue テンプレート（バグ報告）

```
**環境**
- OS: macOS 15.x / Windows 11
- Node.js: v20.x.x
- @akari/sdk: x.y.z
- akari-app-cli: x.y.z

**App Tier**
Full / MCP-Declarative

**症状**
（何をしようとしたか、何が起きたか）

**再現手順**
1. ...
2. ...

**`akari app certify` の出力（Lint / Contract の全文）**
```paste here```

**期待する動作**
```
