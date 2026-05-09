/**
 * @file types/style.ts
 * AKARI-HUB-073 Phase 1 (T-1): Style Asset の Hub 共有 TS types。
 *
 * ADR-095 で確定した Style as Asset Subtype（Asset.type === 'style'）を
 * 表現する型群。3 層構造（reference_assets / extracted_rules / human_overrides）
 * を持つ「再利用可能な表現規範」を、HUB-074 schema v7 `styles` table と
 * 一致する shape で TS 側に持ち込む。本ファイルは StylePanel / StyleEditor /
 * StyleVersionTimeline / StyleAttachPicker いずれからも import される。
 *
 * 関連:
 *   - spec: akari-os/docs/sdd/specs/spec-style-management-ui-learning-loop.md
 *           §6 Data Models（StyleAsset / ExtractedRule / StyleChangelog）
 *   - ADR-094 (Asset Tier — Style は tier: 'canonical' / weight: 1.0 固定)
 *   - ADR-095 (Style as Asset Subtype — Asset.type === 'style' の本体)
 *   - ADR-079 (Pool 統合 — Style は Pool 配下の Asset として扱われる)
 *   - AKARI-HUB-074 (pool-impl schema v7 — `styles` table と本ファイルの shape は 1:1)
 *
 * 注意:
 *   - 本ファイルは型定義のみ（runtime / I/O は持たない）。
 *   - **v0.2.0 で追加予定**の Variant Signal 関連フィールド
 *     （`ExtractedRule.signal_score` / `signal_count` / `effective_confidence`、
 *     `StyleChangelog.signal_diff`、`StyleAsset.variant_signals[]`、`VariantSignal` 型）は
 *     **T-14 で別途追加する**。Phase 1（v0.1.0）では含めない。
 *     spec §7 Tasks / 親 task `AKARI-HUB-073 T-14` を参照。
 *   - persistence layer (akari-pool-impl `crates/pool-core/src/style.rs`) では
 *     `asset_id` / `created_at` / `updated_at` を別途保持しているが、UI 側は spec §6
 *     の shape を踏襲し、UI 表示で必要になった時点で intersection 拡張する流儀
 *     （WorkflowEditor の `WorkflowEditorWorkflow` と同じ、HUB-072 で確立）。
 */

// ---------------------------------------------------------------------------
// Domain / 列挙
// ---------------------------------------------------------------------------

/**
 * Style 適用ドメイン（spec §6 / HUB-074 `styles.domain` と同期）。
 *
 *   - 'video'   : 動画編集テイスト（カット感 / トランジション / 色味 等）
 *   - 'writing' : 文体 / 語彙 / トーン
 *   - 'design'  : ブランドカラー / レイアウト / タイポ
 *   - 'voice'   : 声色 / 抑揚 / 話速
 *   - 'mixed'   : 複数 domain にまたがる Style（ブランド identity 等）
 *
 * 5 種固定。追加は spec §4 Out of Scope。
 */
export type StyleDomain = "video" | "writing" | "design" | "voice" | "mixed"

// ---------------------------------------------------------------------------
// ExtractedRule
// ---------------------------------------------------------------------------

/**
 * AI が reference_assets から抽出した「表現規範の 1 ルール」（自然言語）。
 *
 * spec §6 Data Models が正典:
 *   - id            : Rule ID（Style 内 unique）
 *   - rule          : 自然言語のルール本文（例: "段落冒頭は短い断定文で始める"）
 *   - confidence    : 0.0–1.0 の base confidence（AI 抽出時のスコア）
 *   - approved      : 人間承認済みフラグ。`false` の rule は適用しない（spec AC-4）
 *   - approved_by   : 承認者（user ID / agent ID、未承認 = undefined）
 *   - approved_at   : ISO 8601 承認時刻（未承認 = undefined）
 *   - source_assets : 抽出元の Asset IDs（traceability、人間が「なぜ」を辿れる）
 *
 * **v0.2.0 で追加予定** (T-14):
 *   - `signal_score?: number`               — Σ(VariantSignal.weight)、初期 0
 *   - `signal_count?: { promoted; archived }` — 内訳
 *   - `effective_confidence?: number`       — base + 重み付き signal の clamp [0..1]
 *
 * Phase 1（v0.1.0）では本シェイプは MVP（spec §3 AC-1〜AC-7）のみ満たす。
 */
export interface ExtractedRule {
  /** Rule ID（Style 内 unique） */
  id: string
  /** 自然言語ルール本文 */
  rule: string
  /** 0.0–1.0、AI 抽出時の base confidence */
  confidence: number
  /** 人間承認済みフラグ（false の rule は適用しない） */
  approved: boolean
  /** 承認者（user ID / agent ID） */
  approved_by?: string
  /** ISO 8601 承認時刻 */
  approved_at?: string
  /** 抽出元の Asset IDs（traceability） */
  source_assets: string[]
}

// ---------------------------------------------------------------------------
// StyleChangelog
// ---------------------------------------------------------------------------

/**
 * reference_assets の追加 / 削除 diff（StyleChangelog の 1 部品）。
 * spec §6 / HUB-074 `ReferenceDiff` と同期。
 */
export interface ReferenceDiff {
  /** 追加された Asset IDs */
  added: string[]
  /** 削除された Asset IDs */
  removed: string[]
}

/**
 * extracted_rules の追加 / 削除 / 修正 diff（StyleChangelog の 1 部品）。
 * spec §6 / HUB-074 `RulesDiff` と同期。
 *
 *   - added    : 新規追加された rule (人間承認済み)
 *   - removed  : 削除された rule の id 配列
 *   - modified : 修正された rule（confidence / rule 本文 / approved 等）
 */
export interface RulesDiff {
  added: ExtractedRule[]
  removed: string[]
  modified: ExtractedRule[]
}

/**
 * Style Learning Loop で version up が起きた時の 1 entry（spec §6 / AC-15）。
 * 旧 version → 新 version の差分要約と承認情報を記録する。
 *
 * spec §6 Data Models が正典:
 *   - version        : 新 version semver（例: "0.2.0"）
 *   - date           : ISO 8601 承認時刻
 *   - summary        : 改善内容のサマリ（人間可読、1 行要約）
 *   - reference_diff : reference_assets の追加 / 削除 diff
 *   - rules_diff     : extracted_rules の追加 / 削除 / 修正 diff
 *   - approved_by    : 承認者（user ID / agent ID）
 *
 * **v0.2.0 で追加予定** (T-14):
 *   - `signal_diff?: SignalDiff`
 *     - 取り込まれた VariantSignal[]、rule_score の変化、昇格 override
 */
export interface StyleChangelog {
  /** 新 version semver */
  version: string
  /** ISO 8601 承認時刻 */
  date: string
  /** 1 行要約 */
  summary: string
  /** reference_assets の差分 */
  reference_diff: ReferenceDiff
  /** extracted_rules の差分 */
  rules_diff: RulesDiff
  /** 承認者 */
  approved_by: string
}

// ---------------------------------------------------------------------------
// StyleAsset
// ---------------------------------------------------------------------------

/**
 * Style Asset（Asset.type === 'style' の本体、spec §6 / HUB-074 `styles` table と同期）。
 *
 * 3 層構造:
 *   - reference_assets : 参考にする Asset IDs（過去作品 / 一次資料）
 *   - extracted_rules  : AI が reference から抽出した自然言語ルール群（人間承認制）
 *   - human_overrides  : 人間が直接書いた自然言語ルール（最強優先、spec AC-5）
 *
 * spec §6 Data Models が正典:
 *   - id              : Style ID（UUID 等）
 *   - type            : 固定値 'style'（Asset.type と一致、ADR-095）
 *   - domain          : Style 適用ドメイン（5 種固定）
 *   - tier            : 'canonical' 固定（ADR-094 Asset Tier）
 *   - weight          : 1.0 固定（Style は最強優先の Tier）
 *   - version         : semver（Learning Loop で増える、spec AC-15）
 *   - parent_version  : 親 version semver（root は null）
 *   - reference_assets: Asset IDs（D&D で追加 / 削除、spec AC-3）
 *   - extracted_rules : AI 抽出 rule 群（approve/reject 制、spec AC-4）
 *   - human_overrides : 人間直書きルール群（inline edit、spec AC-5）
 *   - changelog       : version chain の履歴（spec AC-6 / AC-15）
 *
 * **v0.2.0 で追加予定** (T-14):
 *   - `variant_signals: VariantSignal[]` — Variant promote/archive の append-only ログ
 *
 * Phase 1（v0.1.0）では MVP shape のみ。
 */
export interface StyleAsset {
  /** Style ID（UUID 等） */
  id: string
  /** Asset.type と整合する固定値 */
  type: "style"
  /** 適用ドメイン */
  domain: StyleDomain
  /** Asset Tier（ADR-094 — Style は canonical 固定） */
  tier: "canonical"
  /** Tier weight（Style は 1.0 固定） */
  weight: 1.0
  /** semver（例: "0.1.0"） */
  version: string
  /** 親 version semver（root は null） */
  parent_version: string | null
  /** 参照 Asset IDs（D&D で追加 / 削除） */
  reference_assets: string[]
  /** AI 抽出 rule 群（approve/reject 制） */
  extracted_rules: ExtractedRule[]
  /** 人間直書きルール群（自然言語） */
  human_overrides: string[]
  /** version chain の履歴 */
  changelog: StyleChangelog[]
}
