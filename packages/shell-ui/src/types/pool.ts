/**
 * @file types/pool.ts
 * AKARI-HUB-071 Phase 1 (T-1): shell-ui の Pool / Stage / Context Pane 共通型。
 *
 * ADR-094 で確定した 6 概念モデル（Pool / Work / Stage / Trace / Workflow /
 * Checkpoint）のうち、左サイドバー / Stage 視覚化 / Agent panel "現在のコンテキスト"
 * pane が扱う表示用 shape を定義する。pool-impl の DB schema（HUB-074）と 1:1 では
 * なく、UI 側の表示と attach/detach 操作に必要な部分だけを保持する。
 *
 * 関連:
 *   - spec: akari-os/docs/sdd/specs/spec-pool-ui-redesign-stage-context-pane.md
 *   - ADR-094 (6 概念モデル)
 *   - ADR-075 (Personal Pool アンビエント化)
 *   - ADR-079 (Pool 統合 / pin・archive)
 *
 * 注意:
 *   - 本ファイルは v0.1.0 spec 範囲（PoolKind / StageKind / PoolDisplay /
 *     StageDisplay / ContextPaneState）のみを扱う。
 *   - Variant 関連型（VariantDisplay / VariantList / WorkContext /
 *     CompareViewState / VariantAction）は v0.2.0 で T-14 が追加する（ADR-078
 *     v0.2.0、別 Teammate）。
 */

/**
 * 左サイドバーの 3 領域分類。
 *   - 'personal'   : Personal Pool（ユーザー 1 人につき 1 つ・system / ambient）
 *   - 'work'       : Work Pool（現在の Work に紐づく一時 Pool・system）
 *   - 'cross-work' : ピン留め / archived な永続 Pool（ADR-079 統合後の単一概念）
 */
export type PoolKind = "personal" | "work" | "cross-work"

/**
 * Work Pool 配下の固定 3 段 Stage。ADR-094 で確定した分類。
 *   - 'upload'    : ユーザーが取り込んだ素材（一次資料）
 *   - 'workstate' : 編集中の作業状態（中間生成物）
 *   - 'output'    : 出力候補・公開用 variant
 */
export type StageKind = "upload" | "workstate" | "output"

/**
 * 左サイドバーに表示する 1 Pool の display shape。
 * pool-impl の Pool entity を UI 用に subset したもの。
 */
export interface PoolDisplay {
  /** Pool ID (Personal Pool は固定文字列、それ以外は UUID 等) */
  id: string
  /** 3 領域分類 (Personal / Work / Cross-Work) */
  kind: PoolKind
  /** 表示名 */
  name: string
  /**
   * 削除不可フラグ。
   * Personal Pool / Work Pool では true（context menu に「削除」を出さない）。
   * AC-3 / AC-5 の根拠。
   */
  is_system: boolean
  /** Pool の pin 状態（ADR-079: pin できるのは最大 10、soft 制約） */
  is_pinned: boolean
  /** archive 済みか（履歴は残るが active リストから外れる） */
  is_archived: boolean
  /**
   * Agent context に attach 中か（active バッジ 🟢/⚪）。
   * Personal Pool は ADR-075 アンビエント化で常時 true 既定。
   */
  is_active: boolean
  /** 最近触ったもの順での並び替え用 (ISO8601) */
  last_activity: string
}

/**
 * Work Pool 配下の 1 Stage の display shape。
 * Stage 自体は Pool ではなく、Work Pool 内の固定 3 段「区画」として扱う。
 */
export interface StageDisplay {
  /** 'upload' | 'workstate' | 'output' (固定 3 種) */
  kind: StageKind
  /** Agent context に attach 中か（active バッジ） */
  is_active: boolean
  /**
   * 参照中の Asset IDs（実体は Pool 側）。
   * UI では件数バッジ表示や、Stage 切替時の Asset list filter に使う。
   */
  asset_refs: string[]
}

/**
 * Agent パネルの「現在のコンテキスト」pane が表示する集約 state。
 * useContextPane() hook が返す型 / useContextToggle() hook の対象。
 *
 * AC-8 / AC-9 の根拠:
 *   - attach 中の Pool / Stage / Asset を list 表示
 *   - 個別に toggle 可能（即時反映、Undo は MVP 後）
 */
export interface ContextPaneState {
  /** attach 中の Pool 一覧（Personal Pool は ADR-075 で常時含まれる） */
  attached_pools: PoolDisplay[]
  /**
   * attach 中の Stage 一覧（Work ID で grouping）。
   * 通常は現在開いている 1 Work 分だけだが、cross-work compare 用に配列で保持。
   */
  attached_stages: { workId: string; stage: StageDisplay }[]
  /**
   * attach 中の Asset 一覧。
   * - 'manual'    : ユーザーが明示的に attach したもの
   * - 'inherited' : 親 Pool / Stage が attach されたことで自動 inclusion
   */
  attached_assets: { assetId: string; reason: "manual" | "inherited" }[]
}
