/**
 * @file types/pool.ts
 * shell-ui の Pool 表示用共通型。
 */

/**
 * 左サイドバーの 3 領域分類。
 *   - 'personal'   : Personal Pool（ユーザー 1 人につき 1 つ・system / ambient）
 *   - 'work'       : Work Pool（現在の Work に紐づく一時 Pool・system）
 *   - 'cross-work' : ピン留め / archived な永続 Pool（ADR-079 統合後の単一概念）
 */
export type PoolKind = "personal" | "work" | "cross-work"

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
