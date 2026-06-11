# AKARI-HUB-108 K-3 クリーンルーム検証レポート（Full Tier）

作成日: 2026-06-12  
対象リポ: `/Users/ryoma/_edit/30_products/akari-os/akari-sdk`  
対象ブランチ: `feat/cli-video-tools`  
検証作業場: `/tmp/akari-cleanroom-20260612`

## 概要

AKARI-HUB-108 タスク K-3 として、外部開発者が monorepo の外で公開物とドキュメントだけを頼りに Full Tier アプリを開発できるかを検証した。

結論: 現状は Full Tier アプリを monorepo 外で build まで進められない。scaffold は可能だが、生成された `package.json` が `workspace:*` 依存を含むため、`npm install` / `pnpm install` の双方で依存解決に失敗する。`akari app certify` は PASS を返すが、Contract Test は STUB で実行されていない。

## 手順ログ

### Step 1: 作業場作成

```bash
mkdir -p /tmp/akari-cleanroom-20260612
```

結果: 成功。

### 事前確認: ブランチと作業ツリー

```bash
git -C /Users/ryoma/_edit/30_products/akari-os/akari-sdk branch --show-current
git -C /Users/ryoma/_edit/30_products/akari-os/akari-sdk status --short
```

結果:

- ブランチ: `feat/cli-video-tools`
- 既存 WIP あり。今回の検証では既存変更には触れていない。

### Step 2: 公開状況の確認

```bash
npm view @akari-os/app-cli version --fetch-timeout=5000 --fetch-retries=0
npm view @akari-os/sdk version --fetch-timeout=5000 --fetch-retries=0
```

結果:

```text
npm error code ENOTFOUND
npm error network request to https://registry.npmjs.org/... failed, reason: getaddrinfo ENOTFOUND registry.npmjs.org
```

この実行環境では npm registry の名前解決ができず、公開済みかどうかは確認不能だった。なお npm はデフォルトで `/Users/ryoma/.npm/_logs` にログを書こうとしたため、以後は `NPM_CONFIG_CACHE=/tmp/akari-cleanroom-20260612/npm-cache` を指定した。

> **追記（2026-06-12、ホスト環境で確認済み）**: `npm view @akari-os/app-cli` / `npm view @akari-os/sdk` はいずれも **404 Not Found = npm 未公開**。package.json は `private: false` + `publishConfig.access: public` で公開準備済みだが publish されていない。外部開発者は CLI の入手自体ができず、**P0-1（workspace:* 依存）以前の入口で停止する**。npm publish（または GitHub Packages / tarball 配布）の判断が SDK 配布の最初のブロッカー。

ローカル代替:

```bash
node /Users/ryoma/_edit/30_products/akari-os/akari-sdk/packages/app-cli/dist/cli.js --version
```

結果:

```text
0.1.0
```

`packages/app-cli/dist/cli.js` は存在したため、build は不要だった。

### Step 3: ドキュメント確認

指示書として読んだドキュメント:

- `/Users/ryoma/_edit/30_products/akari-os/akari-sdk/docs/getting-started.md`
- `/Users/ryoma/_edit/30_products/akari-os/akari-sdk/docs/tiers/full-tier.md`
- `/Users/ryoma/_edit/30_products/akari-os/akari-sdk/docs/certification/README.md`
- `/Users/ryoma/_edit/30_products/akari-os/akari-sdk/docs/certification/automated-lint.md`
- `/Users/ryoma/_edit/30_products/akari-os/akari-sdk/docs/certification/contract-test.md`
- `/Users/ryoma/_edit/30_products/akari-os/akari-sdk/docs/certification/manual-review.md`

観察:

- `getting-started.md` は MCP-Declarative 中心で、前提条件の CLI 名が `npx akari-app-cli --version`、scaffold が `npx akari-app-cli create ...` になっている。
- `full-tier.md` は `akari-app-cli create my-app --tier full` を示すが、依存解決手順、外部配布時の `workspace:*` 回避策、非対話 scaffold の必須オプションを説明していない。
- Certification docs は `akari app certify --verbose` を例示しているが、実 CLI は `--verbose` を受け付けなかった。

### Step 4: scaffold と依存解決

最初にドキュメント相当のコマンドを試行:

```bash
node /Users/ryoma/_edit/30_products/akari-os/akari-sdk/packages/app-cli/dist/cli.js create cleanroom-note --tier full
```

結果:

```text
? Author name: (ryoma)
ExitPromptError: User force closed the prompt with 0 null
```

`--tier full` だけでは非対話実行できない。`create --help` と CLI 実装確認で `--author` と `--category` があることを確認し、ドキュメント欠落として記録したうえで続行した。

```bash
node /Users/ryoma/_edit/30_products/akari-os/akari-sdk/packages/app-cli/dist/cli.js create cleanroom-note --tier full --author Cleanroom --category research
```

結果:

```text
Creating full app "Cleanroom Note" → ./cleanroom-note/
App scaffolded successfully!
App ID      : com.user.cleanroom-note
Tier        : full
Directory   : ./cleanroom-note/
Next steps:
  cd cleanroom-note
  npm install
  akari dev
When ready: akari app certify (Phase 2b)
```

生成された `package.json` の依存:

```json
"dependencies": {
  "@akari-os/sdk": "workspace:*",
  "@akari-os/shell-ui": "workspace:*",
  "@tauri-apps/api": "^2",
  "lucide-react": "^1.8.0",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "react-resizable-panels": "^4.9.0",
  "zustand": "^5.0.12"
}
```

`npm install`:

```bash
NPM_CONFIG_CACHE=/tmp/akari-cleanroom-20260612/npm-cache npm install --fetch-timeout=5000 --fetch-retries=0
```

結果:

```text
npm error code EUNSUPPORTEDPROTOCOL
npm error Unsupported URL Type "workspace:": workspace:*
```

`pnpm install`:

```bash
PNPM_HOME=/tmp/akari-cleanroom-20260612/pnpm-home pnpm install --store-dir /tmp/akari-cleanroom-20260612/pnpm-store
```

結果:

```text
ERR_PNPM_WORKSPACE_PKG_NOT_FOUND
In : "@akari-os/sdk@workspace:*" is in the dependencies but no package named "@akari-os/sdk" is present in the workspace
Packages found in the workspace:
```

build:

```bash
PNPM_HOME=/tmp/akari-cleanroom-20260612/pnpm-home pnpm build --store-dir /tmp/akari-cleanroom-20260612/pnpm-store
```

結果:

```text
> cleanroom-note@0.1.0 build
> vite build --store-dir /tmp/akari-cleanroom-20260612/pnpm-store
sh: vite: command not found
ELIFECYCLE Command failed.
WARN Local package.json exists, but node_modules missing, did you mean to install?
```

依存解決に失敗しているため、build は実行不能。

### Step 5: certify 実行

```bash
node /Users/ryoma/_edit/30_products/akari-os/akari-sdk/packages/app-cli/dist/cli.js app certify
```

結果: exit 0 / PASS。

重要な出力:

```text
✓ PASS  Manifest (akari.toml)
  App: com.user.cleanroom-note (Cleanroom Note), tier=full

Full Tier — Panel Schema check skipped (React panels not validated by certify)
– SKIP  Panel Schema validation (Full Tier uses React components)

○ STUB  Agent API
○ STUB  Memory API
○ STUB  Permission API
○ STUB  UI API
○ STUB  Inter-App API
○ STUB  Offline Contract

✓ Certification PASSED
  Note: Contract tests are currently stubs (not yet executed).
```

`[compat]`:

- 生成 manifest には `[compat] shell_api = "^0.1"` が存在する。
- certify 出力では `[compat]` の明示チェック項目は確認できなかった。

追加確認:

```bash
node /Users/ryoma/_edit/30_products/akari-os/akari-sdk/packages/app-cli/dist/cli.js app certify --verbose
```

結果:

```text
error: unknown option '--verbose'
```

ドキュメントと CLI 実装が不一致。

### Step 6: externals 照合

通常の build 成果物:

```bash
find /tmp/akari-cleanroom-20260612/cleanroom-note/dist -maxdepth 2 -type f
```

結果: `dist/index.js` は存在しない。依存解決失敗により build 成果物ベースの import specifier 抽出は実行不能。

dry 照合として、生成ソースと Vite の lib entry から Shell mount 時に残る想定の外部 specifier を抽出し、Shell import map と shim を照合した。

Shell import map:

- `react` → `/akari-externals/react.js`
- `react/jsx-runtime` → `/akari-externals/react-jsx-runtime.js`
- `@akari-os/shell-ui` → `/akari-externals/akari-shell-ui.js`

dry 照合結果:

| specifier | import map | shim |
|---|---|---|
| `@akari-os/shell-ui` | あり | あり |
| `react` | あり | あり |
| `react/jsx-runtime` | あり | あり |

補足:

- `src/main.tsx` には dev 単体起動用の `react-dom/client` import があるが、Vite lib build の entry は `src/index.tsx` であり、Shell mount 用 `dist/index.js` には通常含まれない想定。
- 実 build ができていないため、成果物に基づく最終判定は「未実施」。ただし生成ソース由来の Shell mount 用 external は dry では全解決。

## 詰まり所一覧

### P0: Full Tier テンプレートが monorepo 外で依存解決できない

現象:

- `@akari-os/sdk: workspace:*`
- `@akari-os/shell-ui: workspace:*`
- `npm install` は `EUNSUPPORTEDPROTOCOL`
- `pnpm install` は `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`

影響:

外部開発者は scaffold 後に install / build へ進めない。Full Tier アプリ開発が完全に停止する。

修正分類:

- テンプレ修正
- npm publish
- docs 修正

修正提案:

- 外部配布向け Full Tier テンプレートでは `@akari-os/sdk` を公開 semver range にする。
- `@akari-os/shell-ui` を外部開発者が使う前提なら npm publish する。公開しないなら Full Tier テンプレートから依存を外すか、app-local な最小レイアウトにする。
- monorepo 内部用テンプレートと外部公開用テンプレートを分ける。
- docs に「workspace:* が出た場合の対処」ではなく、そもそも外部 scaffold で `workspace:*` が出ない状態を保証する。

### P0: build 成果物 `dist/index.js` を生成できず、Shell mount 前提に到達できない

現象:

- 依存解決失敗により `vite` が存在しない。
- `pnpm build` は `vite: command not found` で失敗。
- `dist/index.js` が存在しない。

影響:

Shell mount 可能な成果物を作れない。externals 事故以前に Full Tier アプリを配布・起動できない。

修正分類:

- テンプレ修正
- npm publish

修正提案:

- P0-1 と同じく依存解決を外部で成立させる。
- scaffold 後の `npm install && npm run build` を CI で monorepo 外 `/tmp` に対して検証する。

### P1: `akari create cleanroom-note --tier full` が非対話で完了しない

現象:

- `--tier full` 指定後に `Author name` の対話プロンプトが出る。
- ドキュメントには `--author` / `--category` の説明がない。

影響:

CI やクリーンルーム検証で詰まる。ソースまたは `--help` を読めば回避可能だが、ドキュメントだけでは不足。

修正分類:

- docs 修正
- CLI UX 改善

修正提案:

- Full Tier docs に非対話例を追加する:
  `akari-app-cli create cleanroom-note --tier full --author "Your Name" --category research`
- あるいは `--tier` と同様に author/category もデフォルトで非対話完了させる。

### P1: Certification docs と実 CLI が不一致

現象:

- docs は `akari app certify --verbose` を案内している。
- 実 CLI は `error: unknown option '--verbose'`。

影響:

失敗原因の詳細確認手段として案内されているコマンドが使えない。ソース確認が必要になる。

修正分類:

- docs 修正
- CLI 修正

修正提案:

- `--verbose` を CLI に実装するか、docs から削除する。
- JSON 出力や詳細ログの実装状況も docs と同期する。

### P1: `akari app certify` が PASS するが Contract Test は STUB

現象:

- Certification は PASS する。
- Agent / Memory / Permission / UI / Inter-App / Offline Contract はすべて STUB。
- `[compat]` の明示検証出力も確認できない。

影響:

外部開発者は PASS を信頼してよいか判断できない。AKARI-HUB-108 の互換性検証としては不足。

修正分類:

- CLI 修正
- docs 修正

修正提案:

- STUB を含む場合は `PASS_WITH_STUBS` のような明確な結果にする。
- `--strict` では STUB を fail 扱いにする。
- `[compat] shell_api` の検証結果を明示出力する。

### P2: Getting Started と Full Tier docs の CLI 名・導線が揺れている

現象:

- `getting-started.md`: `npx akari-app-cli`
- Full Tier docs: `akari-app-cli create`
- Certification docs: `akari app certify`
- scaffold 成功後: `npm install`, `akari dev`

影響:

外部開発者がどの package / binary を入れるべきか迷う。

修正分類:

- docs 修正

修正提案:

- 公開 package 名、binary 名、推奨実行方法を 1 つの表にまとめる。
- `@akari-os/app-cli` と `akari-app-cli` / `akari` binary の対応を明記する。

### P2: 生成 manifest の category コメントが enum とずれている

現象:

生成 `akari.toml`:

```toml
category = "research"        # 例: studio / productivity / sns
```

docs の category enum には `studio`, `productivity`, `sns` は見当たらず、`research` など 11 カテゴリが示されている。

影響:

コメントに従うと lint 不一致になる可能性がある。

修正分類:

- テンプレ修正
- docs 修正

修正提案:

- テンプレコメントを docs の enum に合わせる。
- CLI `--category` の help も同じ enum にする。

## certify 結果

- 実行コマンド: `node .../packages/app-cli/dist/cli.js app certify`
- 結果: PASS（exit 0）
- ただし Contract Test は STUB で、実 Contract Test は未実行。
- `[compat] shell_api = "^0.1"` は manifest に存在するが、certify 出力に `[compat]` の明示検証はなかった。

## externals 照合結果

- build 成果物 `dist/index.js`: 生成不可。
- 成果物ベースの import specifier 抽出: 未実施。
- dry 照合: Shell mount 用に想定される `react`, `react/jsx-runtime`, `@akari-os/shell-ui` は import map と shim の両方で解決。
- 未解決 specifier: dry 照合上はなし。
- P0 相当の mount 時クラッシュ判定: 成果物がないため mount 到達不可。2026-06-04 externals 事故の再発有無は成果物ベースでは判定不能。
