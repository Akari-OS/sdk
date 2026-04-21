---
title: Manual Review — チェックリスト全項目
updated: 2026-04-19
related: [HUB-024 §6.8]
---

# Manual Review — チェックリスト全項目 / Manual Review Checklist

> Certification 第 3 層。AKARI レビュアーが**人手で**実施する品質審査。
> マーケット掲載（`akari app publish`）時のみ必要。自己配布（npm / git）は不要。
>
> **Full App** は全チェック項目が対象。
> **MCP-Declarative App** は Permission / OAuth スコープの妥当性のみ（大幅に軽量）。

---

## 目次 / Table of Contents

1. [Manual Review の概要](#1-manual-review-の概要)
2. [チェックリスト: UX / アクセシビリティ](#2-チェックリスト-ux--アクセシビリティ)
3. [チェックリスト: セキュリティ](#3-チェックリスト-セキュリティ)
4. [チェックリスト: パフォーマンス](#4-チェックリスト-パフォーマンス)
5. [チェックリスト: i18n 品質](#5-チェックリスト-i18n-品質)
6. [チェックリスト: ドキュメント充実度](#6-チェックリスト-ドキュメント充実度)
7. [Tier 別要件差分](#7-tier-別要件差分)
8. [審査フローと提出方法](#8-審査フローと提出方法)
9. [審査結果と異議申し立て](#9-審査結果と異議申し立て)

---

## 1. Manual Review の概要 / Overview

### 1.1 審査の目的

Automated Lint と Contract Test は「仕様への準拠」を機械的に確認する。
Manual Review は以下の**人手でしか判断できない品質**を評価する:

- 実際に使ったときの **UX の適切さ**（ツールが当初の意図通りに動くか）
- **セキュリティリスクの文脈判断**（技術的に問題なくても、運用上問題になるか）
- **i18n の自然さ**（翻訳が機械的でなく自然か）
- **ドキュメントが十分か**（ユーザーが自力で使いこなせるか）

### 1.2 審査の流れ

```
開発者: akari app publish を実行
            │
            ▼
        Automated Lint ✅ + Contract Test ✅ の確認
            │ 自動確認
            ▼
        Manual Review キューに追加
            │
            ▼
        レビュアーがチェックリストを実施
            │
        ┌───┴────────────────┐
        ▼                    ▼
     APPROVED             REJECTED
        │                    │
        ▼                    ▼
  マーケット掲載      修正依頼メール（項目別フィードバック）
                           │
                           ▼
                       修正後に再申請可能
```

### 1.3 審査期間の目安

| Tier | 通常 | 繁忙期 |
|---|---|---|
| MCP-Declarative | 1〜2 営業日 | 最大 5 営業日 |
| Full | 3〜5 営業日 | 最大 10 営業日 |

---

## 2. チェックリスト: UX / アクセシビリティ / UX & Accessibility

**適用**: Full App 必須 / MCP-Declarative スキップ（Schema レンダラが担保）

### 2.1 Panel の基本 UX

| # | チェック項目 | 重大度 | 確認方法 |
|---|---|---|---|
| UX-01 | Panel が表示されるまで 3 秒以内（Cold Start） | required | 実測 |
| UX-02 | ローディング中にスケルトン UI またはプログレス表示がある | required | 目視 |
| UX-03 | エラー発生時にユーザーが理解できるエラーメッセージが表示される | required | 目視 |
| UX-04 | エラーメッセージに「どう修正するか」のヒントが含まれる | recommended | 目視 |
| UX-05 | 破壊的操作（削除・上書き・外部送信）前に確認ダイアログが出る | required | 目視 |
| UX-06 | 操作が完了したとき、成功フィードバック（Toast / Badge 等）がある | recommended | 目視 |

**補足 UX-01**: `akari app certify` の Contract Test で計測された起動時間が参考値として提示される。

---

### 2.2 Shell との統合

| # | チェック項目 | 重大度 | 確認方法 |
|---|---|---|---|
| UX-07 | Panel が Shell の配色テーマ（Light / Dark）に追従する | required | 目視 |
| UX-08 | Panel がリサイズされたとき、レイアウトが崩れない（最小幅 280px） | required | 目視 |
| UX-09 | Panel の外側（Shell Chrome）に独自スタイルが漏れていない | required | DevTools |
| UX-10 | キーボードショートカットが Shell の既存ショートカットを上書きしていない | required | キー操作確認 |
| UX-11 | Shell の `onSelection` イベントを適切にハンドリングしている（選択範囲変化に反応） | recommended | 目視 |

---

### 2.3 アクセシビリティ

| # | チェック項目 | 重大度 | 確認方法 |
|---|---|---|---|
| ACC-01 | すべての操作可能要素に適切な `aria-label` または `aria-labelledby` が設定されている | required | axe / DevTools |
| ACC-02 | キーボードのみで全操作が完了できる（マウスなしで tab / enter / space で操作可能） | required | キー操作確認 |
| ACC-03 | フォーカスリング（:focus-visible）が見えている | required | 目視 |
| ACC-04 | 色だけで情報を伝えていない（アイコンや文字と組み合わせている） | required | 目視 |
| ACC-05 | テキストのコントラスト比が WCAG AA 以上（4.5:1 以上） | required | axe / Contrast Checker |
| ACC-06 | スクリーンリーダーで主要な操作が可能（VoiceOver / NVDA） | recommended | スクリーンリーダー確認 |
| ACC-07 | 動くコンテンツ（アニメーション）は prefers-reduced-motion を尊重している | recommended | CSS 確認 |

---

### 2.4 コンテンツの適切さ

| # | チェック項目 | 重大度 | 確認方法 |
|---|---|---|---|
| UX-12 | App の名前・説明が App の実際の機能と一致している | required | 読み合わせ |
| UX-13 | AKARI OS の他の App や Shell と競合する機能名を使っていない | required | 名称確認 |
| UX-14 | アイコン（icon フィールド）が適切で、他 App のアイコンと混同されない | recommended | 目視 |

---

## 3. チェックリスト: セキュリティ / Security

**適用**: Full App 必須 / MCP-Declarative は OAuth・Permission 項目のみ必須

### 3.1 React / Panel コードのセキュリティ（Full のみ）

| # | チェック項目 | 重大度 | 確認方法 |
|---|---|---|---|
| SEC-01 | `dangerouslySetInnerHTML` を使用していない、または使用箇所が適切にサニタイズされている | required | コードレビュー |
| SEC-02 | `eval()` / `new Function()` の使用がない | required | コードレビュー |
| SEC-03 | ユーザー入力をそのまま DOM に挿入していない（XSS 対策） | required | コードレビュー |
| SEC-04 | サードパーティライブラリに既知の重大脆弱性がない（`npm audit` 相当） | required | `npm audit --audit-level high` |
| SEC-05 | API キー・シークレット・認証トークンがソースコードにハードコードされていない | required | コードレビュー / 静的解析 |
| SEC-06 | ユーザーデータをコンソールに出力していない | required | コードレビュー |

---

### 3.2 OAuth / 認証

| # | チェック項目 | 重大度 | 確認方法 | Full | MCP-D |
|---|---|---|---|:-:|:-:|
| SEC-07 | manifest に宣言された OAuth スコープが最小権限であること | required | manifest 確認 | ✅ | ✅ |
| SEC-08 | OAuth スコープが App の機能で実際に必要なものだけに限定されている | required | 機能比較 | ✅ | ✅ |
| SEC-09 | OAuth トークンを AMP または安全なストレージに保存している（localStorage は禁止） | required | コードレビュー | ✅ | ✅ |
| SEC-10 | OAuth フローが PKCE を使用している（Implicit Flow は禁止） | required | コードレビュー | ✅ | ✅ |
| SEC-11 | トークンの有効期限切れ時に適切なリフレッシュ処理またはエラーハンドリングがある | required | コードレビュー | ✅ | ✅ |

**SEC-07/SEC-08 の具体例**:
```toml
# NG: 読み取り専用機能なのに write スコープを要求
oauth = ["x.com"]
# akari.toml [permissions] には投稿機能があると宣言しているが...
# 実際の MCP ツールは x.read しか呼ばない → write スコープは不要

# OK: 宣言したスコープが機能に対応している
[mcp]
tools = ["x.post"]    # 投稿機能あり → write スコープは正当
```

---

### 3.3 機密データの取り扱い

| # | チェック項目 | 重大度 | 確認方法 | Full | MCP-D |
|---|---|---|---|:-:|:-:|
| SEC-12 | ユーザーの個人情報（氏名・メール・住所等）を必要以上に収集していない | required | コードレビュー | ✅ | ✅ |
| SEC-13 | 収集したデータを外部サービスに送信する場合、manifest の external-network に宣言されている | required | manifest + コードレビュー | ✅ | ✅ |
| SEC-14 | Pool / AMP に保存するデータが App の機能に必要なものに限定されている | required | コードレビュー | ✅ | ✅ |
| SEC-15 | パスワードや秘密鍵を Pool / AMP に平文で保存していない | required | コードレビュー | ✅ | ✅ |
| SEC-16 | App がユーザーに成り代わって HITL なしに外部サービスへ投稿・送信していない | required | コードレビュー | ✅ | ✅ |

---

### 3.4 Permission の妥当性

| # | チェック項目 | 重大度 | 確認方法 | Full | MCP-D |
|---|---|---|---|:-:|:-:|
| SEC-17 | 宣言されたすべての Permission がソースコード内で実際に使われている | required | コードレビュー | ✅ | ✅ |
| SEC-18 | HITL が必要な操作（外部送信・削除等）で hitl: true が宣言されている | required | コードレビュー | ✅ | ✅ |
| SEC-19 | Permission が「将来のため」に過剰に宣言されていない | required | manifest 確認 | ✅ | ✅ |

---

## 4. チェックリスト: パフォーマンス / Performance

**適用**: Full App 必須 / MCP-Declarative スキップ（Schema レンダラが担保）

### 4.1 起動時間

| # | チェック項目 | 基準 | 重大度 |
|---|---|---|---|
| PERF-01 | Panel の初回 mount 時間（Cold Start） | ≤ 3 秒 | required |
| PERF-02 | Panel の 2 回目以降の mount 時間（Warm Start） | ≤ 500 ms | required |
| PERF-03 | Agent の初回 invoke までのレイテンシ | ≤ 5 秒（モデル API 除く） | recommended |

**計測方法**: `akari app certify --profile` でパフォーマンスプロファイルが出力される。
この値がレビュー時に参照される。

---

### 4.2 メモリ使用量

| # | チェック項目 | 基準 | 重大度 |
|---|---|---|---|
| PERF-04 | Panel mount 後の JavaScript Heap 使用量 | ≤ 50 MB | required |
| PERF-05 | 1 時間継続使用後のメモリ増加（メモリリーク） | ≤ 10 MB/hr | required |
| PERF-06 | 大量データ（Pool 1000 件以上）を扱う際のメモリ安定性 | クラッシュしない | recommended |

---

### 4.3 CPU・描画パフォーマンス

| # | チェック項目 | 基準 | 重大度 |
|---|---|---|---|
| PERF-07 | Panel のスクロールが滑らか（jank なし） | 60 fps | recommended |
| PERF-08 | アイドル時の CPU 使用率が低い（バックグラウンドポーリング禁止） | ≤ 1% | required |
| PERF-09 | `setInterval` や `requestAnimationFrame` の不要な使用がない | — | required |

---

### 4.4 バンドルサイズ

| # | チェック項目 | 基準 | 重大度 |
|---|---|---|---|
| PERF-10 | App バンドル（JS）の合計サイズ | ≤ 5 MB（gzip 後） | required |
| PERF-11 | 不要な依存ライブラリが含まれていない（`lodash` 全体 import 等） | — | recommended |
| PERF-12 | 画像・音声等のアセットが適切に最適化されている | — | recommended |

---

## 5. チェックリスト: i18n 品質 / i18n Quality

**適用**: Full App 必須 / MCP-Declarative 任意（推奨）

### 5.1 言語対応の基本

| # | チェック項目 | 重大度 | Full | MCP-D |
|---|---|---|:-:|:-:|
| I18N-01 | すべての表示文字列が `locales/ja.json` に外部化されている（コード内ハードコード禁止） | required | ✅ | ✅ |
| I18N-02 | 日本語ロケール（`ja`）が完備されている | required | ✅ | ✅ |
| I18N-03 | 英語ロケール（`en`）が存在する | recommended | ✅ | opt |
| I18N-04 | 未翻訳キーがない（`{{t:key}}` がそのまま表示される状態がない） | required | ✅ | ✅ |

---

### 5.2 翻訳の品質

| # | チェック項目 | 重大度 | Full | MCP-D |
|---|---|---|:-:|:-:|
| I18N-05 | 日本語の文言が自然な日本語である（機械翻訳の直訳でない） | required | ✅ | ✅ |
| I18N-06 | エラーメッセージが技術用語の羅列でなく、ユーザーが理解できる表現になっている | required | ✅ | ✅ |
| I18N-07 | ボタン・ラベルの文言が動詞で始まるなど、UI の言語的統一感がある | recommended | ✅ | opt |
| I18N-08 | 英語ロケールの文言が英語として自然である | recommended | ✅ | opt |

---

### 5.3 文字数・レイアウトの配慮

| # | チェック項目 | 重大度 | Full | MCP-D |
|---|---|---|:-:|:-:|
| I18N-09 | 英語に切り替えたときにボタン・ラベルが欠けたり折り返したりしない | recommended | ✅ | — |
| I18N-10 | 数値・日時のフォーマットがロケールに合わせて変わる（`Intl` API 使用） | recommended | ✅ | — |
| I18N-11 | 複数形の扱い（1 件 / N 件）がロケールで適切に切り替わる | recommended | ✅ | — |

---

## 6. チェックリスト: ドキュメント充実度 / Documentation Quality

**適用**: Full App 必須 / MCP-Declarative は最低限必須

### 6.1 必須ドキュメント

| # | チェック項目 | 重大度 | Full | MCP-D |
|---|---|---|:-:|:-:|
| DOC-01 | `README.md` が存在し、App の目的・機能を 1 パラグラフで説明している | required | ✅ | ✅ |
| DOC-02 | インストール手順が記載されている | required | ✅ | ✅ |
| DOC-03 | 必要な Permission と OAuth スコープの**理由**が README に記載されている | required | ✅ | ✅ |
| DOC-04 | `CHANGELOG.md` または `RELEASES.md` が存在する | required | ✅ | opt |

---

### 6.2 使い方ドキュメント

| # | チェック項目 | 重大度 | Full | MCP-D |
|---|---|---|:-:|:-:|
| DOC-05 | 主要な使い方（Happy Path）がスクリーンショットまたは手順で示されている | required | ✅ | recommended |
| DOC-06 | よくある問題と解決策（FAQ / Troubleshooting）が記載されている | recommended | ✅ | opt |
| DOC-07 | 公開 Skill（`[skills.exposed]`）の入出力仕様が文書化されている | required | ✅（skills あり） | — |

---

### 6.3 開発者向けドキュメント（公開 SDK / OSS の場合）

| # | チェック項目 | 重大度 | Full | MCP-D |
|---|---|---|:-:|:-:|
| DOC-08 | App のビルド手順・開発環境のセットアップ手順がある | recommended | ✅ | opt |
| DOC-09 | API / Skill のリファレンスが JSDoc または別ドキュメントで提供されている | recommended | ✅ | — |
| DOC-10 | コントリビューションガイドが存在する（OSS の場合） | recommended | opt | opt |

---

### 6.4 マーケットプレイス掲載情報

| # | チェック項目 | 重大度 | Full | MCP-D |
|---|---|---|:-:|:-:|
| DOC-11 | `akari.toml` の `[app] name` / `description` が適切に記載されている | required | ✅ | ✅ |
| DOC-12 | マーケット用のスクリーンショットが 1 枚以上提供されている（推奨: 3 枚以上） | required | ✅ | recommended |
| DOC-13 | プライバシーポリシーへのリンクが存在する（個人データを扱う場合） | required | 条件付き | 条件付き |

---

## 7. Tier 別要件差分 / Tier-Specific Requirements Differences

### 7.1 Full App と MCP-Declarative の審査差分

```
Full App                      MCP-Declarative App
───────────────────────────────  ──────────────────────────────────
UX / アクセシビリティ: 全項目必須  スキップ（Schema レンダラが担保）

セキュリティ:
  コードレビュー（React）: 必須    なし（コードを持たない）
  OAuth スコープ: 必須             必須（同等の審査）
  Permission 妥当性: 必須          必須（同等の審査）
  機密データ取扱: 必須             必須（同等の審査）

パフォーマンス: 全項目必須         スキップ（Schema レンダラが担保）

i18n 品質: 全項目必須              ja.json 完備 + 翻訳品質のみ

ドキュメント:
  README / インストール: 必須      必須（同等）
  使い方: 必須                     推奨のみ
  Skill 仕様: 必須（あれば）       なし

平均審査時間: 3〜5 営業日          1〜2 営業日
```

### 7.2 MCP-Declarative のレビュー重点項目

MCP-Declarative のレビュアーが特に重点的に見る項目:

1. **OAuth スコープの最小権限**（SEC-07 / SEC-08）
   - `akari.toml [permissions] oauth` に記載されているスコープが、宣言した MCP ツールの動作に必要最小限であることを確認
   - 例: 「投稿のみ」の App が Read スコープまで要求していないか

2. **MCP ツールの宣言と実際の動作の一致**（DOC-03 相当）
   - `[mcp] tools` に宣言したツールが、App の説明に書かれた機能と一致しているか

3. **external-network ドメインの妥当性**
   - `external-network = ["api.x.com"]` のように宣言されたドメインが、App の機能に必要なものに限られているか

4. **README の Permission 説明**（DOC-03）
   - なぜその Permission / OAuth スコープが必要かが、ユーザーが理解できる言葉で書かれているか

### 7.3 Full App の審査で特に厳しく見る項目

1. **React コードの XSS リスク**（SEC-01 〜 SEC-06）
2. **アクセシビリティ**（ACC-01 〜 ACC-05）
3. **メモリリーク**（PERF-05）
4. **HITL が必要な操作の漏れ**（SEC-18 / SEC-16）

---

## 8. 審査フローと提出方法 / Review Flow and Submission

### 8.1 提出前の自己チェック

```bash
# 提出前に必ず実行
akari app certify

# パフォーマンスプロファイルも出力
akari app certify --profile

# Manual Review 用のセルフチェックリストを出力
akari app certify --checklist manual
```

`akari app certify --checklist manual` は本ページのチェックリストを Tier に合わせて絞り込んで出力する。
これをもとに自己チェックしてから提出することを推奨する。

### 8.2 提出コマンド

```bash
# マーケット掲載申請（Manual Review キューに追加）
akari app publish

# 審査ステータス確認
akari app publish status

# 修正後の再申請
akari app publish --resubmit
```

### 8.3 提出時に同梱するもの

`akari app publish` を実行する前に、以下を準備する:

| ファイル | 必須度 | 内容 |
|---|---|---|
| `README.md` | 必須 | App の説明・インストール手順・Permission 理由 |
| `CHANGELOG.md` | Full 必須 / MCP-D 任意 | バージョン別変更履歴 |
| `screenshots/` | 必須 | PNG / WebP 形式、1280×800 px 以上、1 枚以上 |
| `privacy-policy.md` または外部 URL | 条件付き | 個人データを扱う場合 |

---

## 9. 審査結果と異議申し立て / Review Results and Appeals

### 9.1 審査結果の種類

| 結果 | 意味 | 次のアクション |
|---|---|---|
| **APPROVED** | 全チェックをパス。マーケット掲載可能 | `akari app publish --confirm` |
| **CONDITIONAL** | 軽微な修正で通過可能。推奨事項あり | 修正後に `--resubmit`（または説明を添えて条件付き承認を受け入れ）|
| **REJECTED** | 重大な問題あり。修正後に再申請必要 | 修正後に `--resubmit` |
| **PENDING** | 審査中 | 待機（`akari app publish status` で確認） |

### 9.2 REJECTED の主な理由と対処

| よくある拒否理由 | 対処法 |
|---|---|
| OAuth スコープが過剰（SEC-07/08） | `akari.toml [permissions] oauth` を最小スコープに絞る |
| React コードに XSS リスク（SEC-01） | `dangerouslySetInnerHTML` を削除し、適切なサニタイズに変更 |
| アクセシビリティ不備（ACC-01/02） | `aria-label` 追加、キーボード操作の実装 |
| パフォーマンス基準未達（PERF-01） | バンドルサイズ削減、初期化の遅延読み込み |
| README に Permission 説明なし（DOC-03） | `README.md` に Permission が必要な理由を追記 |
| 翻訳品質（I18N-05） | ネイティブスピーカーに確認を依頼 |

### 9.3 異議申し立て

審査結果に不服がある場合、以下の手順で異議申し立てができる:

1. `akari app publish appeal` を実行
2. 審査員の指摘に対する反論・説明を記述
3. AKARI チームが 5 営業日以内に再審査

異議申し立ては 1 App あたり 1 回まで。再審査後の判定は最終とする。

---

## 関連リソース / Related Resources

- [Certification README](./README.md) — 全体像と CLI
- [Automated Lint](./automated-lint.md) — 層 1 のルール一覧
- [Contract Test](./contract-test.md) — 層 2 のテストスイート
- [HUB-024 §6.8](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Certification 仕様（正典）
- [HUB-025](https://github.com/Akari-OS/.github/blob/main/VISION.md) — Panel Schema v0（MCP-Declarative の UI 規格）
