/**
 * @file types/context-attach.ts
 * AKARI-HUB-071 Phase 1 (T-7 / T-8): ContextPane が pool-impl `context_attach`
 * RPC とやり取りするための型と adapter interface。
 *
 * pool-impl 側 schema v7 の `context_attach` table（HUB-074 Phase 2 で実装済）と
 * 1:1 で対応する shape を TypeScript 側でも持つ。RPC tool 名:
 *   - `context_attach_get` — work_id (+ variant_id?) で Vec<ContextAttachRecord>
 *   - `context_attach_set` — (work_id, variant_id, target_kind, target_id, attached)
 *
 * shell-ui パッケージは Tauri API に直接依存しないため、shell（Tauri 環境）
 * 側から `ContextAttachAdapter` を依存性注入で渡す形にする。これにより:
 *   - shell-ui 単体では mock adapter で動作確認可能（in-memory store）
 *   - 4 app（design / video / writer / shell）からも同じ hook を使える
 *
 * 関連:
 *   - spec: AKARI-HUB-071 §6 API / Protocol
 *   - HUB-074 §6 `context_attach` table
 *   - akari-pool-impl/crates/pool-core/src/context_attach.rs
 *   - akari-pool-impl/crates/pool-mcp/src/server.rs (#[tool] context_attach_*)
 */

import type { PoolKind, StageKind, PoolDisplay, ContextPaneState } from "./pool"

/** pool-impl `target_kind` 列と一致（'pool' | 'stage' | 'asset'） */
export type ContextTargetKind = "pool" | "stage" | "asset"

/**
 * pool-impl `context_attach` 1 row に対応する shape。
 * 履歴 view（attached=false 含む）でも同じ型で返ってくる。
 */
export interface ContextAttachRecord {
  work_id: string
  variant_id: string
  target_kind: ContextTargetKind
  target_id: string
  attached: boolean
  /** ISO8601 datetime */
  updated_at: string
}

/**
 * 1 件の attach/detach 操作対象。useContextToggle の引数。
 *
 * `kind`:
 *   - 'pool'  : Pool target（PoolKind は UI 側分類で、RPC 側は単一 'pool'）
 *   - 'stage' : Stage target（StageKind: 'upload' | 'workstate' | 'output'）
 *   - 'asset' : Asset target（任意 ID）
 */
export type ContextToggleTarget =
  | { kind: "pool"; id: string; pool_kind?: PoolKind }
  | { kind: "stage"; id: StageKind }
  | { kind: "asset"; id: string }

/**
 * shell-ui の hook が pool-impl RPC を呼ぶための adapter interface。
 * shell 側で MCP `callToolJson` を wrap した実装を渡す（DI）。
 *
 * mock 実装（in-memory）も `createInMemoryAdapter` で提供する（テスト / dev 用）。
 */
export interface ContextAttachAdapter {
  /**
   * `context_attach_get` RPC。
   * variant_id 省略時は primary variant に fallback（pool-impl 側 semantics）。
   */
  get(workId: string, variantId?: string): Promise<ContextAttachRecord[]>

  /**
   * `context_attach_set` RPC。
   * variant_id は必須（ADR-078 v0.2.0 / HUB-074 §6 / AC-15c〜AC-15e）。
   */
  set(
    workId: string,
    variantId: string,
    target: ContextToggleTarget,
    attached: boolean,
  ): Promise<void>
}

/**
 * ContextPane が表示用に必要とする隣接情報。
 * `useContextPane` hook の caller が、生 ContextAttachRecord に加えて
 * Pool 名や Asset 名等の表示メタデータを resolve するために使う。
 *
 * 実装:
 *   - shell 側: Pool list / Asset list と join して resolve する関数を渡す
 *   - mock: id 文字列をそのまま name として fallback
 */
export interface ContextDisplayResolver {
  /** Pool ID → 表示用 PoolDisplay。未知 Pool は null を返してもよい。 */
  resolvePool?: (poolId: string) => PoolDisplay | null
  /** Asset ID → 表示用 name + reason。 */
  resolveAsset?: (
    assetId: string,
  ) => { name: string; reason: "manual" | "inherited" } | null
}

/**
 * `useContextPane` の戻り値。
 */
export interface UseContextPaneResult {
  /**
   * 現在の attach 状態を集約した state。fetch 中 / 未取得は null。
   * AC-8 の根拠 — 「現在のコンテキスト」 pane が attach 中の Pool / Stage / Asset を
   * list 表示するときの source of truth。
   */
  state: ContextPaneState | null
  /** RPC 進行中フラグ */
  loading: boolean
  /** 直近の RPC エラー（nullable） */
  error: Error | null
  /** 手動 refresh（subscription / 楽観更新失敗時の fallback） */
  refresh: () => Promise<void>
}

/**
 * `useContextToggle` の戻り値。
 *
 * AC-9 の根拠 — Pool / Stage / Asset を個別に toggle (attach/detach) できる。
 * 即時反映（楽観更新）+ 失敗時 rollback で UX を一画面化原則（ルール 9 / 11）に整合させる。
 */
export interface UseContextToggleResult {
  /**
   * 現在の attach 状態を変更する。
   * @returns Promise — 成功時 resolve、失敗時 reject（caller が toast 等で表示）
   */
  toggle: (target: ContextToggleTarget, attached: boolean) => Promise<void>
  /** 進行中フラグ（連打防止 UX 用） */
  pending: boolean
}
