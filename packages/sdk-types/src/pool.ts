/**
 * @file pool.ts
 * Runtime: Pool（ワークスペース + アイテム + アーカイブ + 検索）クライアント。
 *
 * MVP 実装は Tauri invoke 経由で Rust 側の pool-core に直接依存する。
 * 将来 daemon / MCP 経由に切り替える場合もこのファイルだけ差し替える。
 *
 * NOTE: `@akari-os/sdk/memory` は ACE 仕様のプロトコル型（Content-Addressed Pool）で、
 * ここは Phase 1 実装の today-runtime。両者は意図的に別 subpath に分離している。
 *
 * @packageDocumentation
 */

import { invoke } from "@tauri-apps/api/core"

import type { SlotEntry, SlotEntryView, SlotRole } from "./slot.js"
import type { WorkContextPayload } from "./work-context.js"

// ===== 型定義 =====

/**
 * pool-impl の Pool（旧 Library）単位のメタ情報。ADR-103 で Library→Pool リネーム。
 */
export interface PoolInfo {
  name: string
  display_name: string | null
  description?: string | null
  icon: string | null
  role?: "brand" | "domain" | "work" | string | null
  is_ambient?: boolean
  parent_pool_id?: string | null
  item_count: number
  created_at: string | null
  archived_at?: string | null
  /**
   * system-managed pool (ADR-084) — `akari-outputs` 等の Shell が管理する出力先。
   * UI 側は true の場合に rename / archive / purge ボタンを抑制すべき。
   */
  is_system_managed?: boolean
}


export interface PoolItemSummary {
  id: string
  name: string
  item_type: string
  ai_summary: string | null
  ai_tags: string[]
  size_bytes: number | null
  analyzed_at: string | null
  created_at: string
  updated_at: string
  archived_at?: string | null
  /** ADR-084 metadata: 出力元 app ("design"/"video"/"writer"/...)。 */
  source_app?: string | null
  /** ADR-084 metadata: 出力元 Work id。 */
  source_work_id?: string | null
  /** ADR-084 metadata: 出力元 Work タイトル snapshot。グループ header 表示用 */
  source_work_title?: string | null
  /** ADR-085 D-5': true = Reference 経路（user 元 path 参照）/ false = Copy 経路 */
  is_referenced?: boolean
  /** ADR-110 D-1: true = app 私的 working-state（context_json.work_state）。
   * provenance facet `state` 判定 key。producer 境界(D-2)で素材ビューには既定で出さない。 */
  is_work_state?: boolean
}

export interface PoolSearchResult {
  /**
   * 検索ヒットが属する Pool 名（旧 `library` フィールド。ADR-103 で改名）。
   * pool-impl commit bb1e8ac 以降、SearchHit の JSON キーは "pool"。
   */
  pool: string
  item_id: string
  name: string
  ai_summary: string | null
  score: number
}

export interface PoolItemFull {
  id: string
  name: string
  file_path: string | null
  source_path: string | null
  mime_type: string | null
  item_type: string
  size_bytes: number | null
  role: string | null
  layer: string | null
  ai_summary: string | null
  ai_tags: string[]
  context_json: unknown | null
  analyzed_at: string | null
  created_at: string
  updated_at: string
  archived_at?: string | null
}

export interface PoolRelation {
  id: number
  source_item_id: string
  target_item_id: string
  relation_type: string
  strength: number
  created_by: string
}

export interface ListItemsFilter {
  itemType?: string
  role?: string
  layer?: string
  sortBy?: string
  sortOrder?: string
  limit?: number
}

export interface WorkspaceMetaUpdate {
  display_name?: string | null
  description?: string | null
  icon?: string | null
  color?: string | null
  intent?: string | null
  preset?: string | null
}

export interface PoolSettings {
  scene_threshold: number
  whisper_model: string
  vision_model: string
  max_transcribe_seconds: number
  preset: string
}

export interface ToolStatus {
  ffmpeg: boolean
  faster_whisper: boolean
  ollama: boolean
  ollama_models: string[]
}

// ===== Pool（旧 Library）管理 API =====

export async function listWorkspaces(
  includeArchived?: boolean,
): Promise<PoolInfo[]> {
  return (await invoke("pool_list_pools", {
    includeArchived: includeArchived ?? false,
  })) as PoolInfo[]
}

export async function listArchivedWorkspaces(): Promise<PoolInfo[]> {
  return (await invoke("pool_list_archived_pools")) as PoolInfo[]
}

export async function createWorkspace(
  name: string,
  description?: string,
): Promise<PoolInfo> {
  return (await invoke("pool_create_pool", {
    name,
    description: description ?? null,
  })) as PoolInfo
}

export async function deleteWorkspace(name: string): Promise<void> {
  await archiveWorkspace(name)
}

export async function archiveWorkspace(name: string): Promise<void> {
  await invoke("pool_archive_pool", { name })
}

export async function restoreWorkspace(name: string): Promise<void> {
  await invoke("pool_restore_pool", { name })
}

export async function purgeWorkspace(name: string): Promise<void> {
  await invoke("pool_purge_pool", { name })
}

export async function renameWorkspace(
  oldName: string,
  newName: string,
): Promise<void> {
  await invoke("pool_rename_pool", { oldName, newName })
}

export async function updateWorkspaceMeta(
  name: string,
  update: WorkspaceMetaUpdate,
): Promise<void> {
  await invoke("pool_update_pool_meta", { name, update })
}

// ===== Item API =====

export async function listItems(
  library: string,
  filter?: ListItemsFilter,
): Promise<PoolItemSummary[]> {
  return (await invoke("pool_list_items", {
    library,
    itemType: filter?.itemType ?? null,
    role: filter?.role ?? null,
    layer: filter?.layer ?? null,
    sortBy: filter?.sortBy ?? null,
    sortOrder: filter?.sortOrder ?? null,
    limit: filter?.limit ?? null,
  })) as PoolItemSummary[]
}

export async function searchItems(
  query: string,
  library?: string,
  limit?: number,
): Promise<PoolSearchResult[]> {
  return (await invoke("pool_search_items", {
    query,
    library: library ?? null,
    limit: limit ?? null,
  })) as PoolSearchResult[]
}

export async function getItem(
  library: string,
  id: string,
  options: { checkHash?: boolean } = {},
): Promise<PoolItemFull> {
  return (await invoke("pool_get_item", {
    library,
    id,
    checkHash: options.checkHash ?? false,
  })) as PoolItemFull
}

export async function listRelations(
  library: string,
): Promise<PoolRelation[]> {
  return (await invoke("pool_list_relations", { library })) as PoolRelation[]
}

/**
 * Pool に Item を追加する。
 *
 * `contextJson` は Optional。ADR-084 metadata (source_app / source_work_id /
 * source_work_title / exported_at / variant_spec 等) を埋めることで、Pool Browser
 * の chip filter / グループ化が機能するようになる。
 */
export async function addItem(
  library: string,
  filePath: string,
  name?: string,
  contextJson?: Record<string, unknown> | null,
): Promise<PoolItemSummary> {
  return (await invoke("pool_add_item", {
    library,
    filePath,
    name: name ?? null,
    contextJson: contextJson ?? null,
  })) as PoolItemSummary
}

/**
 * Pool に Item を upsert する（ADR-084 v5）。
 *
 * 同じ `dedupKey` で active (archived_at IS NULL) な Item があれば archive してから
 * 新規 add する。`dedupKey` は client が決める string（AKARI 推奨:
 * `${source_app}:${source_work_id}:${variant_id}`）。
 *
 * `contextJson` は Optional。ADR-084 metadata (source_app / source_work_id 等)。
 *
 * pool-impl 側は schema v5 で `pool_items.dedup_key` カラム + 部分 unique index
 * (active item のみで unique) を持つ。
 */
export async function upsertItem(
  library: string,
  filePath: string,
  dedupKey: string,
  name?: string,
  contextJson?: Record<string, unknown> | null,
): Promise<PoolItemSummary> {
  return (await invoke("pool_upsert_item", {
    library,
    filePath,
    name: name ?? null,
    dedupKey,
    contextJson: contextJson ?? null,
  })) as PoolItemSummary
}

export async function analyzeItem(
  library: string,
  id: string,
  mode?: "api" | "local" | "markitdown",
): Promise<PoolItemFull> {
  return (await invoke("pool_analyze_item", {
    library,
    id,
    mode: mode ?? null,
  })) as PoolItemFull
}

export async function readItemContent(
  library: string,
  id: string,
): Promise<string> {
  return (await invoke("pool_read_content", { library, id })) as string
}

export async function deleteItem(library: string, id: string): Promise<void> {
  await archiveItem(library, id)
}

export async function archiveItem(library: string, id: string): Promise<void> {
  await invoke("pool_archive_item", { library, id })
}

export async function restoreItem(library: string, id: string): Promise<void> {
  await invoke("pool_restore_item", { library, id })
}

export async function purgeItem(library: string, id: string): Promise<void> {
  await invoke("pool_purge_item", { library, id })
}

export async function listArchivedItems(
  library: string,
): Promise<PoolItemSummary[]> {
  return (await invoke("pool_list_archived_items", {
    library,
  })) as PoolItemSummary[]
}

export async function purgeOldArchives(
  library: string,
  days: number,
): Promise<number> {
  return (await invoke("pool_purge_old_archives", {
    library,
    days,
  })) as number
}

export async function getItemFilePath(
  library: string,
  id: string,
): Promise<string> {
  return (await invoke("pool_get_file_path", { library, id })) as string
}

/**
 * 画像 / 動画のサムネイルの**絶対ファイルパス**を返す（disk cache 済 JPEG, 最大 400px）。
 *
 * 性能対策（perf fix 2026-05-08）で base64 data URL → ファイルパス返却に変更。
 * `<img src>` には `convertFileSrc(path)` で変換すること。
 */
export async function getItemThumbnail(
  library: string,
  id: string,
): Promise<string | null> {
  return (await invoke("pool_get_thumbnail", { library, id })) as string | null
}

// ===== 設定 API =====

export async function getPoolSettings(): Promise<PoolSettings> {
  return (await invoke("pool_get_settings")) as PoolSettings
}

export async function savePoolSettings(settings: PoolSettings): Promise<void> {
  await invoke("pool_save_settings", { settings })
}

export async function checkPoolTools(): Promise<ToolStatus> {
  return (await invoke("pool_check_tools")) as ToolStatus
}

// ===== HUB-086 Phase 1: Work コンテキスト + Slot =====
//
// `library` は null で current Pool に fallback（Rust 側 library_or_current）。
// Tauri v2 は camelCase JS キー → snake_case Rust 引数を自動変換する
// （workId → work_id 等）。ネスト object（context）の field は serde が
// struct の snake_case field 名で deserialize するため、WorkContextPayload の
// snake_case キーをそのまま渡す。

/** Work レベルコンテキスト（context_json への保存分） */
export type WorkContextInput = Pick<
  WorkContextPayload,
  "purpose" | "strategy" | "tone" | "slot_definitions" | "references"
>

/** AKARI-HUB-086 AC-6: Work コンテキストを取得（merge 済み payload） */
export async function getWorkContext(
  library: string | null,
  workId: string,
  variantId: string,
): Promise<WorkContextPayload> {
  return (await invoke("pool_get_work_context", {
    library,
    workId,
    variantId,
  })) as WorkContextPayload
}

/** AKARI-HUB-086 AC-6: Work レベルコンテキスト（slot_entries を除く部分）を保存 */
export async function setWorkContext(
  library: string | null,
  workId: string,
  context: WorkContextInput,
): Promise<void> {
  await invoke("pool_set_work_context", { library, workId, context })
}

/** AKARI-HUB-086 AC-7: スロットエントリを追加 */
export async function slotAddEntry(
  library: string | null,
  params: {
    workId: string
    variantId: string
    role: SlotRole
    assetId?: string | null
    externalUrl?: string | null
    position?: number | null
    promotedFrom?: string | null
    id?: string | null
  },
): Promise<SlotEntry> {
  return (await invoke("slot_add_entry", {
    library,
    workId: params.workId,
    variantId: params.variantId,
    role: params.role,
    assetId: params.assetId ?? null,
    externalUrl: params.externalUrl ?? null,
    position: params.position ?? null,
    promotedFrom: params.promotedFrom ?? null,
    id: params.id ?? null,
  })) as SlotEntry
}

/** AKARI-HUB-086 AC-7: スロットエントリを削除 */
export async function slotRemoveEntry(
  library: string | null,
  id: string,
): Promise<void> {
  await invoke("slot_remove_entry", { library, id })
}

/**
 * (work, variant) の全スロットエントリを取得（role → position 順）。
 * 参照 Pool item の `asset_name` / `asset_analyzed_at` を JOIN 同梱（freeze-safe）。
 */
export async function slotListEntries(
  library: string | null,
  workId: string,
  variantId: string,
): Promise<SlotEntryView[]> {
  return (await invoke("slot_list_entries", {
    library,
    workId,
    variantId,
  })) as SlotEntryView[]
}

/** AKARI-HUB-086 AC-7: 同 (work, variant, role) 内でエントリ順序を並べ替え */
export async function slotReorderEntries(
  library: string | null,
  workId: string,
  variantId: string,
  role: SlotRole,
  orderedIds: string[],
): Promise<void> {
  await invoke("slot_reorder_entries", {
    library,
    workId,
    variantId,
    role,
    orderedIds,
  })
}

/** AKARI-HUB-086 AC-9: misc → 他スロットへの昇格 */
export async function slotPromoteEntry(
  library: string | null,
  id: string,
  newRole: SlotRole,
): Promise<SlotEntry> {
  return (await invoke("slot_promote_entry", {
    library,
    id,
    newRole,
  })) as SlotEntry
}

// ===== Entity / Knowledge Graph API =====

export interface Entity {
  id: string
  canonical_key: string
  entity_type: string | null
  display_name: string
  aliases: string[]
  created_at: string
  updated_at: string
}

export interface EntityRelation {
  id: string
  subject_entity_id: string
  predicate: string
  object_entity_id: string
  source_item_id: string | null
  confidence: number | null
  created_at: string
}

/** Pool 内の全エンティティ（更新が新しい順） */
export async function listEntities(
  library: string,
  limit?: number,
): Promise<Entity[]> {
  return (await invoke("pool_entity_list", { library, limit: limit ?? null })) as Entity[]
}

/** Pool 内の全エンティティ関係（entity 層グラフのエッジ） */
export async function listEntityRelations(
  library: string,
  limit?: number,
): Promise<EntityRelation[]> {
  return (await invoke("pool_entity_relations", { library, limit: limit ?? null })) as EntityRelation[]
}

/** canonical_key / display_name / alias の部分一致検索 */
export async function searchEntities(
  library: string,
  query: string,
): Promise<Entity[]> {
  return (await invoke("pool_entity_search", { library, query })) as Entity[]
}

/** 近傍関係（by="item": item の言及エンティティ近傍 / by="entity": entity 近傍） */
export async function entityGraph(
  library: string,
  by: "item" | "entity",
  id: string,
): Promise<EntityRelation[]> {
  return (await invoke("pool_entity_graph", { library, by, id })) as EntityRelation[]
}

// ===== Item 更新 API =====

export interface ItemUpdate {
  /** 表示名 (空文字列は受け付けない、null/undefined はそのまま) */
  name?: string
  /** AI 要約 (空文字列で NULL クリア) */
  ai_summary?: string
  /** タグ配列 (空配列で NULL クリア) */
  ai_tags?: string[]
  /** Role (空文字列で NULL クリア) */
  role?: string
  /** Layer (空文字列で NULL クリア) */
  layer?: string
}

/**
 * アイテムのメタデータを部分更新する。
 * undefined のフィールドは変更しない。空文字列 / 空配列は明示的にクリア。
 * 更新後の最新 PoolItemFull を返す。
 */
export async function updateItem(
  library: string,
  id: string,
  update: ItemUpdate,
): Promise<PoolItemFull> {
  return (await invoke("pool_update_item", { library, id, update })) as PoolItemFull
}

/**
 * アイテムの context_json を完全置換で更新する。
 */
export async function updateItemContext(
  library: string,
  id: string,
  contextJson: Record<string, unknown> | null,
): Promise<PoolItemFull> {
  return (await invoke("pool_update_item_context", { library, id, contextJson })) as PoolItemFull
}

export interface AssetDeleteCheck {
  safe: boolean
  blockers: string[]
  warnings: string[]
}

export async function checkAssetDeletion(
  library: string,
  id: string,
): Promise<AssetDeleteCheck> {
  return (await invoke("pool_check_asset_deletion", { library, id })) as AssetDeleteCheck
}

// ===== WorkflowPanel 手順永続化 =====
//
// work_states テーブルの state_json に "workflow_steps" キーで保存。
// 既存 HUB-086 用途（slot_definitions 等）とキーが分離しており衝突しない。

/**
 * WorkflowPanel の 1 手順。shell-ui の `WorkflowStep` interface と同形。
 * Rust 側の `WorkflowStepDto` に対応する。
 */
export interface WorkflowStepDTO {
  id: string
  title: string
  note?: string
  done: boolean
}

/**
 * (library, workId, variantId) に紐づくワークフロー手順一覧を取得する。
 * 未設定・row 不存在なら空配列を返す。
 * `library` は null で current Pool に fallback。
 */
export async function getWorkflowSteps(
  library: string | null,
  workId: string,
  variantId: string,
): Promise<WorkflowStepDTO[]> {
  return (await invoke("pool_get_workflow_steps", {
    library,
    workId,
    variantId,
  })) as WorkflowStepDTO[]
}

/**
 * (library, workId, variantId) のワークフロー手順一覧を保存する（他キーは保持）。
 * `library` は null で current Pool に fallback。
 */
export async function setWorkflowSteps(
  library: string | null,
  workId: string,
  variantId: string,
  steps: WorkflowStepDTO[],
): Promise<void> {
  await invoke("pool_set_workflow_steps", {
    library,
    workId,
    variantId,
    steps,
  })
}
