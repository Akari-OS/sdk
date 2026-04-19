---
doc-id: AKARI-HUB-024-cookbook
version: 0.1.0
status: draft
created: 2026-04-19
updated: 2026-04-19
related-specs: [AKARI-HUB-024]
ai-context: claude-code
---

# SDK Cookbook — 実用レシピ集

> 関連 spec: [AKARI-HUB-024 Module SDK](https://github.com/Akari-OS/.github/blob/main/VISION.md)

---

## 1. Cookbook とは

SDK Cookbook は、AKARI Module を実際に開発する上でよく直面する**実装課題に対する実用的なレシピ**を集めたガイド集です。

仕様書（spec）が「何ができるか・なぜそうなっているか」を語るのに対し、Cookbook は **「どう書くか」** に特化しています。コピー＆ペーストできるコードスニペット、チェックリスト、判断フローチャートを用いて、Module 開発者が最短でパターンを実装できることを目指します。

### 対象読者

| 読者 | 活用方法 |
|---|---|
| **Module 開発者（初学者）** | getting-started に続く「次の一手」として読む |
| **Module 開発者（経験者）** | 特定パターンのリファレンスとして参照する |
| **AKARI 公式開発者** | 公式 Module をレシピ準拠で書く際の基準として使う |
| **レビュアー / 審査者** | Certification チェック時の参照ポイントとして使う |

### Cookbook が扱う範囲

- AKARI Module SDK（`@akari/sdk`）を使った実装パターン
- Full Module / MCP-Declarative Module 両 Tier に共通するパターン
- Tier 固有のパターンは各レシピ内で明示する

### Cookbook が扱わない範囲

- SDK の網羅的な API リファレンス → [`../api-reference/`](../api-reference/) を参照
- Module Manifest（`akari.toml`）のスキーマ全仕様 → [`../concepts/`](../concepts/) を参照
- Certification の合否判定基準の詳細 → [`../certification/`](../certification/) を参照

---

## 2. カテゴリ分け

レシピは **外部連携パターン** と **Module 内部パターン** の 2 カテゴリに分かれます。

### 外部連携パターン

外部サービス・外部 API と安全かつ適切に連携するためのパターン群です。
Permission API・HITL ゲート・オフライン設計の観点が中心になります。

| レシピ | ファイル | 難易度 |
|---|---|---|
| OAuth 連携パターン | [`oauth-patterns.md`](./oauth-patterns.md) | ★★☆ |
| Human-in-the-Loop パターン | [`hitl-patterns.md`](./hitl-patterns.md) | ★★☆ |
| オフラインファースト設計 | [`offline-first.md`](./offline-first.md) | ★★★ |

### Module 内部パターン

Module 内部の設計・状態管理・エラー処理、および Module 間連携のパターン群です。
Memory API・Inter-App API・Skill API が中心になります。

| レシピ | ファイル | 難易度 |
|---|---|---|
| Module 間ハンドオフ | [`cross-over-handoff.md`](./cross-over-handoff.md) | ★★★ |
| 状態管理パターン | [`state-management.md`](./state-management.md) | ★★☆ |
| エラーハンドリングパターン | [`error-handling.md`](./error-handling.md) | ★☆☆ |

---

## 3. 各レシピの紹介

### oauth-patterns.md — OAuth 連携パターン

外部サービス（X / LINE / Google 等）への OAuth 認証フローを、Permission API と HITL ゲートを組み合わせて安全に実装するパターンを解説します。`[permissions] oauth = ["x.com"]` の manifest 宣言から、トークンを Pool に永続化するまでの一連の実装手順と、MCP-Declarative Tier での宣言的 OAuth の書き方を示します。

> 関連 API: Permission API（§6.6-6）、Memory API（§6.6-2）
> 主対象 Tier: Full / MCP-Declarative 両方

---

### hitl-patterns.md — Human-in-the-Loop パターン

投稿・送信・決済など「人間の最終確認が必要なアクション」に HITL ゲートを挟む実装パターンを解説します。`permission.gate({ hitl: true })` の適切な配置場所、ユーザーへの承認プロンプト表示、承認・拒否時の分岐処理、および AMP 監査ログへの自動記録の仕組みを示します。

> 関連 API: Permission API（§6.6-6）、Memory API（§6.6-2）
> 主対象 Tier: Full / MCP-Declarative 両方

---

### offline-first.md — オフラインファースト設計

`external-network = false` を守りながら Module を設計するパターンを解説します。Hot tier（ローカル Pool）のみで動作するデータフロー、オンライン復帰時の同期戦略、external-network を使う場合の宣言方法と Certification ゲートへの影響をカバーします。MCP-Declarative Module で remote MCP サーバーを使う場合の特殊な扱い（Q-10 への実装上の回答）も示します。

> 関連 API: Memory API（§6.6-2）、Permission API（§6.6-6）
> 主対象 Tier: Full / MCP-Declarative 両方

---

### cross-over-handoff.md — Module 間ハンドオフ

Writer → Video、Writer → SNS Sender のような「Module をまたいだ素材・文脈の受け渡し」を実装するパターンを解説します。Inter-App API の `module.handoff()` で Pool/AMP の ID のみを渡す原則、受け取り側での Memory Layer fetch、ハンドオフの記録を AMP に残す方法を示します。循環依存の回避策と、Skill API を使った軽量な連携との使い分け基準もカバーします。

> 関連 API: Inter-App API（§6.6-5）、Memory API（§6.6-2）、Skill API（§6.6-7）
> 主対象 Tier: Full

---

### state-management.md — 状態管理パターン

「Module 本体に state を持たない」というガイドライン（§6.7-9）を実際に守るための実装パターンを解説します。コンポーネント内 state を最小化して Pool / AMP に書き出すフロー、セッション間で状態を復元するパターン、複数エージェントが同じ状態を参照する際の競合回避、および AMP の `goal_ref` 必須付与のベストプラクティスを示します。

> 関連 API: Memory API（§6.6-2）、Agent API（§6.6-1）
> 主対象 Tier: Full

---

### error-handling.md — エラーハンドリングパターン

SDK の各 API 呼び出しで発生しうるエラー（権限不足 / HITL 拒否 / ネットワーク断 / Memory Layer アクセス失敗 / SDK バージョン不整合）を適切に処理するパターンを解説します。エラーを AMP に記録する方法、ユーザーへのフィードバック設計、Certification の Contract Test がチェックするエラー境界の書き方を示します。

> 関連 API: Permission API（§6.6-6）、Memory API（§6.6-2）、全 API
> 主対象 Tier: Full / MCP-Declarative 両方

---

## 4. どのレシピから読むか（タスク別）

やりたいことからレシピを探す早見表です。

### 外部サービスと連携したい

```
SNS / 外部 API に投稿・送信したい
├── 認証（OAuth）が必要 → oauth-patterns.md
├── 人間の確認を挟みたい → hitl-patterns.md
└── ネットワーク断時でも動かしたい → offline-first.md
```

### Module 間でデータをやり取りしたい

```
別の Module に素材・文脈を渡したい
├── 大きいデータ（画像 / 動画 / 長文） → cross-over-handoff.md
└── 関数呼び出しレベルの軽い連携 → cross-over-handoff.md § Skill との使い分け
```

### 状態をセッション間で保持したい

```
ユーザーの途中作業・設定を次回起動時も復元したい
→ state-management.md
```

### エラー処理を整備したい

```
Certification の Contract Test を通したい
→ error-handling.md
```

### Tier ごとの優先レシピ

| やること | Full Module | MCP-Declarative Module |
|---|---|---|
| 最初に読む | state-management.md | offline-first.md |
| 外部連携 | oauth-patterns.md → hitl-patterns.md | oauth-patterns.md（宣言的 OAuth 節） |
| 他 Module 連携 | cross-over-handoff.md | hitl-patterns.md（ツール呼び出し確認節） |
| Certification 準備 | error-handling.md | error-handling.md（MCP ツール節） |

---

## 5. コントリビュート方針（将来）

> 本セクションは Cookbook が公開・成熟した後に具体化する想定です。現時点では方針の草案を示します。

### レシピ追加の基準

- **実装で繰り返し直面するパターン**であること（一度きりの特殊ケースは対象外）
- **どの Tier に対応するかを明示**できること
- **動作確認済みのコードスニペットを含む**こと
- **関連 API セクション（§6.6）への参照**を含むこと

### レシピの構成テンプレート

新しいレシピを追加するときは、以下のセクション構成を推奨します：

```markdown
# レシピ名

## このレシピが解決する問題
## 前提条件（Tier / 必要な manifest 宣言）
## 実装ステップ
## コードスニペット
## テスト方法
## よくある間違い（Anti-patterns）
## 関連レシピ
```

### PR ルール（将来の正式化時）

- レシピ本体の追加と同時に、本 README の §2 テーブルおよび §3 の紹介文を更新する
- タスク別早見表（§4）に追加が必要かを確認する
- Cookbook の変更には `[docs][cookbook]` プレフィックスをコミットメッセージに付ける

---

## 6. 関連ドキュメント

### API リファレンス

| ドキュメント | パス | 内容 |
|---|---|---|
| SDK API Overview | [`../api-reference/`](../api-reference/) | 7 API 群の網羅的リファレンス |
| Agent API | [`../api-reference/agent-api.md`](../api-reference/agent-api.md) | エージェント定義・呼び出し |
| Memory API | [`../api-reference/memory-api.md`](../api-reference/memory-api.md) | Pool / AMP アクセス |
| Context API | [`../api-reference/context-api.md`](../api-reference/context-api.md) | ACE 文脈構築 |
| UI API | [`../api-reference/ui-api.md`](../api-reference/ui-api.md) | Shell panel mount |
| Inter-App API | [`../api-reference/inter-app-api.md`](../api-reference/inter-app-api.md) | Module 間 handoff |
| Permission API | [`../api-reference/permission-api.md`](../api-reference/permission-api.md) | 権限ゲート / HITL |
| Skill API | [`../api-reference/skill-api.md`](../api-reference/skill-api.md) | Skill 公開・呼び出し |

### Examples（サンプル実装）

| ドキュメント | パス | 内容 |
|---|---|---|
| X Sender（MCP-Declarative） | [`../../examples/x-sender/`](../../examples/x-sender/) | SNS 投稿 Module のリファレンス実装 |
| Writer（Full） | [`../../examples/writer/`](../../examples/writer/) | フル機能 Module のリファレンス実装 |

### Concepts（概念理解）

| ドキュメント | パス | 内容 |
|---|---|---|
| Module Tier の選び方 | [`../tiers/`](../tiers/) | Full vs MCP-Declarative の判断基準 |
| Module Manifest 仕様 | [`../concepts/manifest.md`](../concepts/manifest.md) | `akari.toml` の全フィールド |
| Panel Schema v0 | [`../concepts/panel-schema.md`](../concepts/panel-schema.md) | 宣言的 UI の widget 一覧 |

### 上位 spec

| spec | パス | 内容 |
|---|---|---|
| AKARI-HUB-024 Module SDK | [Module SDK spec (Hub)](https://github.com/Akari-OS/.github/blob/main/VISION.md) | SDK 全体仕様・7 API・Guidelines・Certification |
| AKARI-HUB-025 Panel Schema | [Panel Schema spec (Hub)](https://github.com/Akari-OS/.github/blob/main/VISION.md) | Panel Schema v0 規格 |
| Shell Module Model (internal spec) | Shell + Module 全体モデル |

---

*最終更新: 2026-04-19*
