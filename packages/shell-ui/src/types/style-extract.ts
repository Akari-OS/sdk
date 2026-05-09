/**
 * @file types/style-extract.ts
 * AKARI-HUB-073 Phase 1 (T-5): Style 抽出 (extractor) を呼ぶための adapter
 * interface と関連 types。
 *
 * 役割:
 *   - shell-ui は Tauri / akari-agents に直接依存できないため、
 *     `StyleExtractAdapter` を依存性注入で渡す DI 抽象を提供する
 *     （HUB-071 `ContextAttachAdapter` と同形）
 *   - shell-ui 単体では `LocalStorageStyleExtractAdapter` (lib/) で動作確認可能
 *   - 4 app（design / video / writer / shell）から共通の hook を使える
 *
 * shape は **akari-agents/src/style/extractor.ts** の対応 type と 1:1。
 * agents 側 (Node) は repo 独立を保つため shell-ui に依存しないが、
 * 構造は spec §6 Data Models を共通正典として揃えている。
 *
 * 関連:
 *   - spec: AKARI-HUB-073 §6 Components / §7 T-5 / §3 Style Learning Loop
 *   - agents: akari-agents/src/style/extractor.ts (TM-C 同梱)
 *   - 上位 types: ./style.ts (TM-A: StyleAsset / ExtractedRule / StyleDomain)
 */

import type { ExtractedRule, StyleDomain } from "./style"

// ---------------------------------------------------------------------------
// Asset summary（抽出のインプット）
// ---------------------------------------------------------------------------

/**
 * Extractor に渡す Asset の最小 summary。
 *
 * Pool / shell 側で実 Asset の本体ではなく要約 (タイトル + テキスト抜粋
 * + メタ) のみを渡す想定。動画 / 音声などのバイナリは Phase 2 以降
 * (spec §10 OQ — modality 別 extract pipeline)。
 */
export interface AssetSummary {
  /** Asset ID（Pool 上の一意 ID） */
  id: string
  /** 表示名 / タイトル（任意） */
  name?: string
  /**
   * テキスト要約（任意）。MVP は writing 系で使う本文の冒頭抜粋等。
   * バイナリ系 (video / audio) は v2 で AI 生成説明文を埋める。
   */
  text_excerpt?: string
  /** Asset 種別（image / text / video / audio / pdf 等、任意） */
  modality?: string
}

// ---------------------------------------------------------------------------
// Extract trigger / 結果
// ---------------------------------------------------------------------------

/**
 * Extract trigger 種別（spec §6 API `learning.on_*` 群と整合）。
 *
 *   - 'manual'             : UI ボタンで明示起動（**Phase 1 で実装**）
 *   - 'reference_added'    : reference Asset 追加で自動起動（v0.2.0 = T-8）
 *   - 'trace_accumulated'  : 同 Style の Trace が N=5 累積で起動（v0.2.0 = T-8）
 *   - 'variant_promoted'   : Variant promote で起動（v0.2.0 = T-19）
 *   - 'variant_archived'   : Variant archive で起動（v0.2.0 = T-19）
 */
export type ExtractTriggerKind =
  | "manual"
  | "reference_added"
  | "trace_accumulated"
  | "variant_promoted"
  | "variant_archived"

/** Extract 起動リクエスト（hook → adapter）。 */
export interface ExtractRulesRequest {
  /** 対象 Style ID（仮 Style の場合は空文字でも可） */
  style_id: string
  /** 抽出対象 Asset の summary 群 */
  references: AssetSummary[]
  /** Style の domain（system prompt 切替に使用） */
  domain: StyleDomain
  /** 既存 rule（重複抑制用、任意） */
  existing_rules?: ExtractedRule[]
  /** Trigger 種別（telemetry / changelog 用、既定 'manual'） */
  kind?: ExtractTriggerKind
}

/**
 * Extract 結果。`extracted_rules` は **未承認** (`approved=false`) で返り、
 * 承認は StyleEditor / inline Checkpoint UI で行う（spec AC-4 / AC-14）。
 */
export interface ExtractRulesResponse {
  /** 新規候補 rule 群 */
  extracted_rules: ExtractedRule[]
  /** 入力 reference 数（telemetry / dedup 判定用） */
  reference_count: number
  /**
   * LLM 呼び出しが省略された場合 true
   * (空 reference / クールダウン / dev stub 等)。
   */
  skipped: boolean
}

// ---------------------------------------------------------------------------
// Adapter interface（DI ポイント）
// ---------------------------------------------------------------------------

/**
 * shell-ui の `useStyleExtract` hook が呼ぶ adapter interface。
 *
 * shell（Tauri 環境）側で MCP `callToolJson` 等を wrap した実装を渡す（DI）。
 * 本番接続が用意されるまでは {@link createLocalStorageStyleExtractAdapter}
 * を使うことで shell-ui 単体 / dev preview / hook 単体テストが回せる。
 */
export interface StyleExtractAdapter {
  /**
   * Style 抽出を 1 回実行する。
   *
   * 失敗時は reject — caller (`useStyleExtract`) が `error` state に詰める。
   */
  extract(request: ExtractRulesRequest): Promise<ExtractRulesResponse>
}

// ---------------------------------------------------------------------------
// useStyleExtract hook の戻り値
// ---------------------------------------------------------------------------

/** {@link useStyleExtract} hook の戻り値。 */
export interface UseStyleExtractResult {
  /**
   * Extract を実行する。
   *
   * @param request 抽出パラメータ。`kind` 既定は `'manual'`。
   * @returns 結果（成功時）/ throw（失敗時、UI 側で toast 等）
   */
  extract: (request: ExtractRulesRequest) => Promise<ExtractRulesResponse>
  /** 直近の extract 結果（hook 内 cache、`null` = 未実行） */
  lastResult: ExtractRulesResponse | null
  /** 進行中フラグ（連打防止 / spinner 表示） */
  pending: boolean
  /** 直近のエラー（nullable、再 extract で clear） */
  error: Error | null
  /** 結果 / error を手動で reset するヘルパ */
  reset: () => void
}
