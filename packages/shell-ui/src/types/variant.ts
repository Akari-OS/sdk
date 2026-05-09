/**
 * @file types/variant.ts
 * AKARI-HUB-071 Phase 1 (T-14): Variant 並列創作ブランチ UI 用の表示型。
 *
 * ADR-078 v0.2.0 で Variant の semantics が「出力単位 + override」から
 * **「並列創作ブランチ単位（その帰結として出力単位 + override 分離）」** に拡張された。
 * 1 Work : N アプリ instance（N = active Variant 数）の関係になり、各 instance は
 * 独立 WorkState を持ち、Trace は (Work, Variant) 単位で保存される。
 *
 * 本ファイルは UI 表示と (Work, Variant) ペアでの app launch / cross-Variant compare
 * に必要な shape のみを定義する。永続化層（HUB-074 の variants table）と 1:1 では
 * なく、subset + UI 派生フィールドを持つ。
 *
 * 関連:
 *   - spec: akari-os/docs/sdd/specs/spec-pool-ui-redesign-stage-context-pane.md §6 (T-14〜T-17)
 *   - ADR-078 v0.2.0 (Variant 並列創作ブランチ §6-1〜6-10)
 *   - AKARI-HUB-074 (variants table 拡張: is_primary / is_archived / depends_on_json /
 *     forked_from_variant_id) — pool-impl 永続化層
 *
 * 注意:
 *   - v0.1.0 範囲（PoolKind / StageKind / PoolDisplay / StageDisplay /
 *     ContextPaneState）は `./pool.ts` 側に定義済み。本ファイルは v0.2.0 帯。
 *   - URL handler 受け取りや子アプリ launch payload で `WorkContext` を必須化する
 *     （ADR-078 v0.2.0 §6-2: app instance = (Work, Variant) ペア）。
 */

/**
 * 並列創作ブランチ単位としての Variant の表示情報。
 * Output Stage 表示 / VariantTabBar / cross-Variant compare で使う UI subset。
 *
 * HUB-074 variants table との対応:
 *   - id / work_id / name は 1:1
 *   - is_primary / is_archived / forked_from_variant_id / depends_on は 1:1
 *   - format / preset / studios は ADR-078 v0.2.0 §4 (Variant プロパティ) と整合
 *
 * @see ADR-078 v0.2.0 §6-6 (Output Stage で primary を最上段、その他は折りたたみ)
 */
export interface VariantDisplay {
  /** Variant ID (UUID) */
  id: string
  /** 親 Work の ID */
  work_id: string
  /** 表示名（例: 「Variant A: ブログ本文」） */
  name: string
  /**
   * 出力フォーマット。'blog' | 'video' | 'audio' | 'image' | 'slide' ...
   * v0.2.0 帯の追加フィールド。Variant 一覧 / 切替 UI の format ラベル表示に使う。
   */
  format: string
  /**
   * 出力先プリセット（任意）。'instagram' | 'twitter' | 'youtube' | 'tiktok' ...
   * v0.2.0 帯の追加フィールド。同 Work 内に Instagram 用 / Twitter 用 が並列存在可能。
   */
  preset?: string
  /**
   * 使用するスタジオ ID 一覧（例: ['writer'] / ['video', 'writer']）。
   * v0.2.0 帯の追加フィールド。複数スタジオを跨ぐ Variant を表現できる。
   */
  studios: string[]
  /**
   * Output Stage の最上段 / primary に昇格しているか。
   * AC-14 (Pool browser の Work 配下で primary が最上段に固定される) の根拠。
   */
  is_primary: boolean
  /**
   * 探索打ち止め（履歴は残るが active リストから消える）。
   * AC-17 (archive 操作) / ADR-078 v0.2.0 §6-6 の根拠。
   */
  is_archived: boolean
  /**
   * 派生元 Variant ID（fork した場合のみ）。
   * fork 履歴の表示 / 新規 Variant 作成時の「現 Variant から fork」既定の根拠。
   */
  forked_from?: string
  /**
   * cross-variant ref。A の Output を B が ref している場合に A を含める。
   * AC-17 archive 警告（B が A を ref している間は A の archive を警告）の根拠。
   */
  depends_on: string[]
  /** 最近触ったもの順での並び替え用 (ISO8601) */
  last_activity: string
}

/**
 * 1 Work に紐づく Variant 一覧。VariantTabBar が表示する集約 state。
 *
 * AC-14 / AC-17 (Variant 数 > 10 で警告 UI) の根拠:
 *   - active_count（archive 除いた active 数）が soft 警告 max 10 の対象
 *   - total_count は archive 含む総数（履歴表示用）
 */
export interface VariantList {
  /** 親 Work の ID */
  work_id: string
  /**
   * Variant 一覧。primary を先頭、その後 active な Variant、最後に archived な順で
   * 並べることが推奨（VariantTabBar 実装側で sort）。
   */
  variants: VariantDisplay[]
  /** primary Variant の ID（必ず variants 内に含まれる） */
  primary_variant_id: string
  /**
   * 現在 app instance で開いている Variant ID（active）。
   * primary と一致するとは限らない（fork 直後 / 切替後 など）。
   */
  active_variant_id: string
  /** archive 含む総数（履歴表示用） */
  total_count: number
  /**
   * archive 除いた active 数（soft 警告 max 10 の対象）。
   * AC-17 の warning UI トリガに使う（10 を超えても作成可能、警告のみ）。
   */
  active_count: number
}

/**
 * app 起動 / Workflow 実行で渡される (Work, Variant) ペア。
 * Trace 単位 / WorkState スコープと一致する（ADR-078 v0.2.0 §6-1, §6-5）。
 *
 * AC-15 の根拠:
 *   - shell URL handler `akari://shell/open?app=...&work=<id>&variant=<id>` の
 *     payload として子アプリ（akari-design / akari-video / akari-writer / audio）
 *     に渡される
 *   - variant=省略時は primary_variant_id を default として渡す（旧 URL 互換）
 */
export interface WorkContext {
  /** 親 Work の ID */
  work_id: string
  /**
   * Variant ID。
   * ADR-078 v0.2.0 で必須化（旧形式 URL は shell 側で primary に解決して渡す）。
   */
  variant_id: string
}

/**
 * cross-Variant compare の表示状態。
 * CrossVariantCompareView が保持する UI state。
 *
 * AC-16 の根拠:
 *   - 2-3 Variant を split-screen で並列表示
 *   - 共通 Asset / Variant 固有 override の視覚的区別
 */
export interface CompareViewState {
  /** 親 Work の ID */
  work_id: string
  /**
   * 比較対象の Variant ID 群（2-3 個、split-screen 制約）。
   * 4+ Variant の grid 比較は v0.3.0 候補（§10 OQ 参照）。
   */
  variant_ids: string[]
  /**
   * 表示モード。
   *   - 'side-by-side': 横並び split-screen（既定）
   *   - 'overlay': 重ね合わせ表示（差分を強調）
   */
  diff_mode: "side-by-side" | "overlay"
  /**
   * Variant-local override を視覚的に強調するか。
   * true なら共通 Asset と override されたフィールドを別色 / バッジで区別する。
   */
  highlight_overrides: boolean
}

/**
 * Variant context menu の操作種別。
 * VariantContextMenu / useVariantAction hook で発火される。
 *
 * AC-17 の根拠:
 *   - promote: primary に昇格（既存 primary は降格）
 *   - archive: 履歴保持で非 active 化
 *   - fork: 既定 'current'（現 Variant から fork、Cmd+D ショートカット） /
 *           'empty'（New Empty Variant） /
 *           それ以外の Variant ID（Fork from another Variant）
 *   - compare: cross-Variant compare 起動（with: 比較する他の Variant ID 群）
 */
export type VariantAction =
  | { kind: "promote" }
  | { kind: "archive" }
  | { kind: "fork"; from: "current" | "empty" | string }
  | { kind: "compare"; with: string[] }
