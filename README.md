# AKARI App SDK

**Build AKARI Apps.** MCP サーバー 1 本で、あなたのアプリを AKARI に繋げる。

> Connect your app to AKARI OS — the AI-native overlay OS for individual creators.
> Your App gets access to the shared memory layer, agent runtime, and Shell UI
> that every official AKARI app uses. No special privileges. Same SDK, same contract.

---

## 5 分で最初の App を動かす / Quick Start (5 min)

```bash
# 1. 雛形を生成する / Scaffold a new App
npx @akari-os/app-cli create my-app --tier mcp-declarative

# 2. ローカルで起動 / Start local dev server
cd my-app
pnpm install
pnpm dev

# 3. Lint + Contract Test を実行 / Run certification checks
pnpm certify
```

> **迷ったら MCP-Declarative から。** MCP サーバー 1 本 + `panel.schema.json` だけで Shell に
> パネルが出ます。準備ができたら Full Tier に昇格できます。

---

## 2 つの Tier / Two Tiers

| Tier | 一言 | 向いている用途 |
|---|---|---|
| **MCP-Declarative** | 手軽。MCP サーバー + 宣言的 UI だけで完結 | 既存 API の AKARI 統合、X/Notion 連携など |
| **Full** | 自由度最大。React Panel + Agent + Skill を自前実装 | Writer / Video 相当の本格 App |

迷ったら **MCP-Declarative** で始めてください。Full への昇格は後からできますが、逆方向はできません。

---

## 何が使えるか / What You Get

AKARI App SDK を通じて、あなたの App は以下にアクセスできます：

| API | できること |
|---|---|
| **Memory API** | Pool（素材倉庫）と AMP（エージェント記憶）を読み書きする |
| **Agent API** | App 固有のエージェントを定義・呼び出す |
| **UI API** | AKARI Shell にパネルを mount する |
| **Inter-App API** | Writer / Video など公式 App との handoff |
| **Permission API** | 権限ゲート / Human-in-the-Loop |
| **Context API** | ACE でコンテキストを組み立てる |
| **Skill API** | 他 App から呼び出せる関数を公開する |

---

## ドキュメント / Documentation

- [Getting Started](./docs/guides/getting-started.md) — 最初の App を動かす
- [Tier Comparison](./docs/guides/concepts/tier-comparison.md) — Full vs MCP-Declarative
- [API Reference](./docs/api-reference/) — 7 API 群のリファレンス
- [Certification Guide](./docs/certification/) — マーケット掲載のための品質ゲート
- [Cookbook](./docs/cookbook/) — 典型ユースケースのレシピ集
- [Examples](./examples/) — 動くコードのリファレンス実装

---

## パッケージ構成 / Packages

```
packages/
├── sdk-types/           @akari-os/sdk              — 7 API 群のコアライブラリ（型定義 + Phase 1 runtime）
├── app-cli/             @akari-os/app-cli          — 雛形生成・開発・配布ツール（create / certify）
├── schema-panel/        @akari-os/schema-panel     — MCP-Declarative の宣言的 UI レンダラー
├── markdown-core/       @akari-os/markdown-core    — Markdown → HTML / Markdown 変換（内部用）
├── pipeline-core/       @akari-os/pipeline-core    — Writer 投稿ワークフロー（内部用）
├── shell-ui/            @akari-os/shell-ui         — Shell UI コンポーネント群（内部用）
├── templates-core/      @akari-os/templates-core   — Writer テンプレート定義（内部用）
└── writer-style-core/   @akari-os/writer-style-core— スタイル管理（内部用）
```

**公開 API**: sdk-types, app-cli, schema-panel  
**内部パッケージ** (`private: true`): markdown-core, pipeline-core, shell-ui, templates-core, writer-style-core

---

## Examples

```
examples/
├── hello-full/  Full Tier リファレンス実装 — React Panel + Agent + Skill 完全構成
├── notion/      Notion 連携 — 既存 API を AKARI に載せる典型パターン（MCP-Declarative）
└── x-sender/    X (Twitter) への投稿 — MCP-Declarative の最小構成
```

---

## Contributing

貢献は大歓迎です。[CONTRIBUTING.md](./CONTRIBUTING.md) をご覧ください。

- バグ報告・機能要望: [Issues](https://github.com/Akari-OS/sdk/issues)
- コードの貢献: Pull Request を送ってください
- ドキュメントの改善: 誤字・リンク切れ修正は PR 直接どうぞ

---

## License

[MIT](./LICENSE) © 2026 Akari-OS contributors

---

## 関連リンク / Related Links

- [Akari-OS organization](https://github.com/Akari-OS)
- [AKARI VISION](https://github.com/Akari-OS/.github)
- [MCP (Model Context Protocol)](https://modelcontextprotocol.io)

---

> **AKARI は「ツール」ではない。個人クリエイター専用の、エッジで動く AI OS。**
> あなたが作る App は、そのエコシステムの一部になる。
