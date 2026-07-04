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

// ===== AKARI-HUB-114: プールごとの指示 (AKARI.md instruction blocks) =====

/** 指示ブロックの発動条件。Rust `InstructionActivation` と同期。 */
export type InstructionActivation = "always" | "on_keyword"

/**
 * 指示ブロック 1 件。Rust `pool-core::InstructionBlock` と 1:1 対応。
 */
export interface InstructionBlock {
  id: string
  title: string
  body_md: string
  enabled: boolean
  activation: InstructionActivation
  /** 適用アプリ id（空 = 全アプリ）。 */
  target_apps: string[]
  /** on_keyword 時の発動語。 */
  keywords: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

/**
 * 指示ブロックの upsert リクエスト。`id` 無しなら新規作成、有りなら更新。
 * Rust `pool-core::UpsertInstructionRequest` と同形（全フィールド省略可）。
 */
export interface UpsertInstructionRequest {
  id?: string | null
  title?: string
  body_md?: string
  enabled?: boolean
  activation?: InstructionActivation
  target_apps?: string[]
  keywords?: string[]
  /** 省略時は末尾に追加する（既存最大 + 1）。 */
  sort_order?: number | null
}

/** Pool に紐づく指示ブロック一覧を取得する（sort_order 順）。 */
export async function listInstructions(library: string): Promise<InstructionBlock[]> {
  return (await invoke("pool_list_instructions", { library })) as InstructionBlock[]
}

/** 指示ブロックを upsert する（`block.id` 有無で新規/更新を分岐）。 */
export async function upsertInstruction(
  library: string,
  block: UpsertInstructionRequest,
): Promise<InstructionBlock> {
  return (await invoke("pool_upsert_instruction", { library, block })) as InstructionBlock
}

/** 指示ブロックを削除する。 */
export async function deleteInstruction(library: string, id: string): Promise<void> {
  await invoke("pool_delete_instruction", { library, id })
}

/** 指示ブロックの表示順を並べ替える。 */
export async function reorderInstructions(
  library: string,
  ids: string[],
): Promise<void> {
  await invoke("pool_reorder_instructions", { library, ids })
}

/**
 * AKARI-HUB-114 T-4: 親チェーン継承込みで指示ブロックを Markdown へ合成する。
 * `inherit=false` のとき自 Pool のみ（由来見出しなし、既定 true）。
 * `appId` / `keywords` でアプリ・キーワードフィルタをかける。
 */
export async function compileContextInherited(
  library: string,
  appId?: string,
  keywords?: string[],
  inherit?: boolean,
): Promise<string> {
  return (await invoke("pool_compile_context_inherited", {
    library,
    appId: appId ?? null,
    keywords: keywords ?? null,
    inherit: inherit ?? null,
  })) as string
}

// ===== AKARI-HUB-071 / HUB-074: ContextAttach（Work/Variant への Pool/Stage/Asset attach） =====

/** attach 対象の種別。 */
export type ContextAttachTargetKind = "pool" | "stage" | "asset"

/**
 * 現在の attach 状態 1 件。Rust `pool_bridge::ContextAttachDto` と 1:1 対応。
 */
export interface ContextAttachRecord {
  work_id: string
  variant_id: string
  target_kind: ContextAttachTargetKind | string
  target_id: string
  attached: boolean
  updated_at: string
}

/**
 * Work / Variant に attach 中の Pool / Stage / Asset を返す。
 * `variantId` 省略時は primary Variant にフォールバックする。
 */
export async function contextAttachGet(
  library: string | null,
  workId: string,
  variantId?: string | null,
): Promise<ContextAttachRecord[]> {
  return (await invoke("pool_context_attach_get", {
    library,
    workId,
    variantId: variantId ?? null,
  })) as ContextAttachRecord[]
}

/** attach 状態を upsert する。 */
export async function contextAttachSet(
  library: string | null,
  workId: string,
  variantId: string,
  targetKind: ContextAttachTargetKind,
  targetId: string,
  attached: boolean,
): Promise<void> {
  await invoke("pool_context_attach_set", {
    library,
    workId,
    variantId,
    targetKind,
    targetId,
    attached,
  })
}

// ===== AKARI-HUB-095: ScheduleEntry（予約投稿・タスク・マイルストーンの統一エンティティ） =====

/** ScheduleEntry の種別。Rust `EntryKind` と同期。 */
export type EntryKind = "post" | "task" | "milestone"

/** ScheduleEntry の状態。Rust `EntryStatus` と同期。 */
export type EntryStatus =
  | "draft"
  | "scheduled"
  | "queued"
  | "publishing"
  | "published"
  | "partial"
  | "failed"
  | "canceled"
  | "done"

/** ScheduleEntry エンティティ。Rust `pool-core::ScheduleEntry` と 1:1 対応。 */
export interface ScheduleEntry {
  id: string
  schema_version: number
  pool_id: string
  kind: EntryKind
  status: EntryStatus
  title: string
  work_id: string | null
  variant_ids: unknown | null
  payload: unknown | null
  campaign_id: string | null
  cloud_entry_id: string | null
  scheduled_at: string | null
  recurrence: string | null
  timezone: string
  results: unknown | null
  created_at: string
  updated_at: string
  created_by: string
  tags: unknown
}

/**
 * ScheduleEntry 作成入力。`pool_id` / `created_by` は省略可（shell 側で library から自動解決）。
 */
export interface CreateScheduleEntryInput {
  pool_id?: string | null
  kind: EntryKind
  title: string
  work_id?: string | null
  variant_ids?: unknown | null
  payload?: unknown | null
  campaign_id?: string | null
  cloud_entry_id?: string | null
  scheduled_at?: string | null
  recurrence?: string | null
  timezone?: string
  results?: unknown | null
  created_by?: string | null
  tags?: unknown
}

/** ScheduleEntry 更新リクエスト。`undefined` フィールドは変更しない。 */
export interface UpdateScheduleEntryReq {
  status?: EntryStatus | null
  title?: string | null
  work_id?: string | null
  variant_ids?: unknown | null
  payload?: unknown | null
  campaign_id?: string | null
  cloud_entry_id?: string | null
  scheduled_at?: string | null
  recurrence?: string | null
  timezone?: string | null
  results?: unknown | null
  tags?: unknown | null
}

/** ScheduleEntry 一覧フィルタ。`pool_id` 省略時は library から自動解決する。 */
export interface ScheduleEntryFilter {
  pool_id?: string
  status?: EntryStatus | null
  kind?: EntryKind | null
  work_id?: string | null
  scheduled_at_from?: string | null
  scheduled_at_to?: string | null
}

/** ScheduleEntry を新規作成する。 */
export async function scheduleEntryCreate(
  library: string,
  input: CreateScheduleEntryInput,
): Promise<ScheduleEntry> {
  return (await invoke("pool_schedule_entry_create", {
    library,
    req: input,
  })) as ScheduleEntry
}

/** ScheduleEntry を部分更新する。 */
export async function scheduleEntryUpdate(
  library: string,
  id: string,
  req: UpdateScheduleEntryReq,
): Promise<ScheduleEntry> {
  return (await invoke("pool_schedule_entry_update", {
    library,
    id,
    req,
  })) as ScheduleEntry
}

/** ScheduleEntry を 1 件取得する。 */
export async function scheduleEntryGet(
  library: string,
  id: string,
): Promise<ScheduleEntry> {
  return (await invoke("pool_schedule_entry_get", { library, id })) as ScheduleEntry
}

/** ScheduleEntry 一覧を取得する。`filter.pool_id` 省略時は library から自動解決する。 */
export async function scheduleEntryList(
  library: string,
  filter: ScheduleEntryFilter = {},
): Promise<ScheduleEntry[]> {
  return (await invoke("pool_schedule_entry_list", {
    library,
    filter: {
      pool_id: filter.pool_id ?? "",
      status: filter.status ?? null,
      kind: filter.kind ?? null,
      work_id: filter.work_id ?? null,
      scheduled_at_from: filter.scheduled_at_from ?? null,
      scheduled_at_to: filter.scheduled_at_to ?? null,
    },
  })) as ScheduleEntry[]
}

/** ScheduleEntry をキャンセルする（publishing 以降は不可）。 */
export async function scheduleEntryCancel(
  library: string,
  id: string,
): Promise<ScheduleEntry> {
  return (await invoke("pool_schedule_entry_cancel", { library, id })) as ScheduleEntry
}

/** ScheduleEntry を物理削除する（Publishing/Published/Partial/Queued は不可）。 */
export async function scheduleEntryDelete(library: string, id: string): Promise<void> {
  await invoke("pool_schedule_entry_delete", { library, id })
}

/**
 * ScheduleEntry を cloud キューへ push する（status=scheduled のみ許可）。
 * bearer token は shell 側（`system::cloud_session`）で解決するため引数不要。
 */
export async function scheduleEntryPushToCloud(
  library: string,
  id: string,
): Promise<Record<string, unknown>> {
  return (await invoke("pool_schedule_entry_push_to_cloud", {
    library,
    id,
  })) as Record<string, unknown>
}

// ===== Writer 改修 Phase F (spec-writer-renovation-2026 §3.8): Context Composer =====
//
// 「テンプレプロンプト + 自分の辞書 + Work 方針 + 追加指示を 1 回で送る」機構。
// 素材となる 3 層は Pool に実在するため、本節は **合成ロジックのみ**を持つ:
//
//   (a) 組織/ブランド規約 — `compileContextInherited`（instruction blocks、親 Pool 継承つき）
//   (b) Work 文脈       — `getWorkContext`（purpose / strategy / tone）
//   (c) 個人の声・辞書   — `contextAttachGet` で attach 中の Asset を列挙 → `getItem` で
//                          取得した Item の `context_json` が StyleAsset 形（domain /
//                          extracted_rules / human_overrides）であれば chip 化する
//   (d) テンプレ / 追加指示 — 呼び出し側（UI）が直接指定する chip（`input.extraChips`）
//
// `@akari-os/sdk` に置く（Writer 専用にしない）— Video / Design も自分の domain の
// StyleAsset を合成できるよう、Writer 固有の結合は持ち込まない（純データ入出力）。
// どの層が欠けていても（instruction 未登録 / work context 未設定 / attach 無し）
// 例外を投げず、単にその層の chip を作らないだけで壊れない。
//
// 実装は本ファイル（pool.ts）に同居させる（隣接ファイル分割にしない）。理由:
// composeContext は compileContextInherited / getWorkContext / contextAttachGet /
// getItem を直接呼び出すが、本パッケージは `emitDeclarationOnly` でソース .ts を
// そのまま配布するため、別ファイルに分けて値 import（`import { getItem } from
// "./pool.js"` 等）すると、Vite 等バンドラ経由では解決できる一方、Node 単体実行
// （`node --test tests/*.test.ts` — 型ストリッピングのみで拡張子 .js→.ts の
// read-through 解決をしない）では `ERR_MODULE_NOT_FOUND` になり sdk 側テストが
// 壊れることを実機検証で確認したため、同一ファイル内の関数参照に留める。
//
// NOTE: StyleAsset の正典 shape は `@akari-os/shell-ui` の `types/style.ts` にあるが、
// shell-ui → sdk への依存方向（shell-ui が @akari-os/sdk に依存）を逆転させないため、
// ここでは `WorkflowStepDTO` と同じ流儀で、必要フィールドのみの構造的 duck type を
// 再定義する（型としては shell-ui の StyleAsset と互換）。また、現時点で shell の
// Tauri invoke_handler には Style（`styles` table）を直接読み出すコマンドがまだ
// registered されていない（pool-mcp 経由の agent 専用 tool のみ）。そのため (c) は
// `getItem` が返す `context_json` に StyleAsset 相当の shape が乗っている場合にのみ
// chip 化する best-effort 実装であり、現状は何も attach されていない/されていても
// shape が無ければ chip 0 件になる（壊れはしないが、shell 側に `pool_style_get`
// 相当の command が追加されるまでは実データが載らない既知のギャップ）。

/** Style 適用ドメイン。shell-ui `types/style.ts` の `StyleDomain` と同期。 */
export type StyleDomain = "video" | "writing" | "design" | "voice" | "mixed"

/** 合成チップの種別。UI（ContextChipRow 等）はこれで表示色・ラベルを出し分ける。 */
export type ContextChipKind = "brand" | "work" | "style" | "template" | "adhoc"

/**
 * 合成された文脈の 1 チップ。UI 上で個別に外せる/差し替えられる最小単位。
 */
export interface ContextChip {
  /** チップ ID。`excludeChipIds` で除外指定する際のキー。 */
  id: string
  kind: ContextChipKind
  /** UI 表示用の短いラベル（例: "ブランド規約", "文体: 自分の声 v3"）。 */
  label: string
  /** system prompt に合成される本文（Markdown / 自然言語）。 */
  body: string
  /** UI がチップの削除ボタンを出してよいか。 */
  removable: boolean
}

/** 合成済みプロンプト。`system` がそのまま LLM system prompt に使える。 */
export interface ComposedPrompt {
  system: string
  /** 合成に使われた chip 一覧（`ContextChipRow` 等の表示用）。 */
  sections: ContextChip[]
}

/** `composeContext` の入力。 */
export interface ComposeContextInput {
  /** (a)(c) の対象 Pool 名。 */
  library: string
  /** 発動アプリ id（instruction block の `target_apps` フィルタに使用。例 "writer"）。 */
  appId?: string
  /** (b)(c) の対象 Work id。 */
  workId: string
  /** (b)(c) の対象 Variant id。 */
  variantId: string
  /** instruction block の `on_keyword` 発動フィルタに使うキーワード。 */
  keywords?: string[]
  /** 親 Pool チェーンからの継承込みで compile するか（既定 true）。 */
  inherit?: boolean
  /** 添付 StyleAsset を絞り込む domain（省略時は domain 不問で全件対象）。 */
  styleDomain?: StyleDomain
  /** テンプレプロンプト・自由記述の追加指示など、呼び出し側が直接指定する chip。 */
  extraChips?: ContextChip[]
  /** 除外する chip ID 一覧（UI でチップを外した結果を反映）。 */
  excludeChipIds?: string[]
}

/**
 * shell-ui `StyleAsset`（`types/style.ts`）と shape 互換の最小 duck type。
 * `getItem` の `context_json`（`unknown`）がこの形であれば style chip を作る。
 */
interface StyleAssetLike {
  domain: StyleDomain
  extracted_rules: Array<{ rule?: unknown; approved?: unknown }>
  human_overrides: unknown[]
}

function asStyleAssetLike(value: unknown): StyleAssetLike | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  if (
    typeof v.domain !== "string" ||
    !Array.isArray(v.extracted_rules) ||
    !Array.isArray(v.human_overrides)
  ) {
    return null
  }
  return v as unknown as StyleAssetLike
}

function formatWorkContext(ctx: WorkContextPayload): string {
  const lines: string[] = []
  if (ctx.purpose && ctx.purpose.trim()) lines.push(`目的: ${ctx.purpose.trim()}`)
  if (ctx.tone && ctx.tone.trim()) lines.push(`トーン: ${ctx.tone.trim()}`)
  for (const field of ctx.strategy?.fields ?? []) {
    if (field.value && field.value.trim()) lines.push(`${field.key}: ${field.value.trim()}`)
  }
  if (ctx.strategy?.memo && ctx.strategy.memo.trim()) lines.push(`メモ: ${ctx.strategy.memo.trim()}`)
  return lines.join("\n")
}

function formatStyleAsset(style: StyleAssetLike): string {
  const lines: string[] = []
  // human_overrides は「最強優先」（spec §3.8）— overrides を先に列挙する
  for (const override of style.human_overrides) {
    if (typeof override === "string" && override.trim()) lines.push(`- ${override.trim()}`)
  }
  for (const rule of style.extracted_rules) {
    if (rule.approved && typeof rule.rule === "string" && rule.rule.trim()) {
      lines.push(`- ${rule.rule.trim()}`)
    }
  }
  return lines.join("\n")
}

function buildSystemPrompt(chips: ContextChip[]): string {
  return chips.map((chip) => `## ${chip.label}\n\n${chip.body}`).join("\n\n")
}

/** `composeContext` が呼び出す下位 API 群。テスト時は fake 実装に差し替え可能。 */
export interface ComposeContextDeps {
  compileContextInherited: typeof compileContextInherited
  getWorkContext: typeof getWorkContext
  contextAttachGet: typeof contextAttachGet
  getItem: typeof getItem
}

const defaultComposeContextDeps: ComposeContextDeps = {
  compileContextInherited,
  getWorkContext,
  contextAttachGet,
  getItem,
}

/**
 * (a) 組織/ブランド規約 + (b) Work 文脈 + (c) 添付 StyleAsset + (d) 追加 chip を
 * 1 つの system prompt に合成する。Video / Design も同じ関数で自分の domain の
 * StyleAsset を合成できるよう、Writer 固有の結合は持ち込まない。
 *
 * `deps` は unit test で invoke ベースの下位 API をモックするための注入口
 * （既定値は実際の pool.ts 実装＝本物の Tauri invoke 経由）。
 */
export async function composeContext(
  input: ComposeContextInput,
  deps: Partial<ComposeContextDeps> = {},
): Promise<ComposedPrompt> {
  const impl: ComposeContextDeps = { ...defaultComposeContextDeps, ...deps }
  const excluded = new Set(input.excludeChipIds ?? [])
  const chips: ContextChip[] = []

  // (a) 組織/ブランド規約 — instruction blocks（親 Pool 継承込み）
  if (!excluded.has("brand")) {
    const brandMd = await impl.compileContextInherited(
      input.library,
      input.appId,
      input.keywords,
      input.inherit,
    )
    if (brandMd && brandMd.trim().length > 0) {
      chips.push({
        id: "brand",
        kind: "brand",
        label: "ブランド規約",
        body: brandMd.trim(),
        removable: true,
      })
    }
  }

  // (b) Work 文脈 — purpose / strategy / tone
  if (!excluded.has("work")) {
    const workCtx = await impl.getWorkContext(input.library, input.workId, input.variantId)
    const workBody = formatWorkContext(workCtx)
    if (workBody.length > 0) {
      chips.push({
        id: "work",
        kind: "work",
        label: "この Work の方針",
        body: workBody,
        removable: true,
      })
    }
  }

  // (c) 個人の声・辞書 — attach 中の Asset のうち StyleAsset 形の item を chip 化
  const attachRecords = await impl.contextAttachGet(input.library, input.workId, input.variantId)
  const attachedAssetIds = attachRecords
    .filter((record) => record.target_kind === "asset" && record.attached)
    .map((record) => record.target_id)

  for (const assetId of attachedAssetIds) {
    const chipId = `style:${assetId}`
    if (excluded.has(chipId)) continue

    let item: PoolItemFull
    try {
      item = await impl.getItem(input.library, assetId)
    } catch {
      // attach 済みだが item が既に削除された等（dangling reference）— 無視して続行
      continue
    }

    const style = asStyleAssetLike(item.context_json)
    if (!style) continue
    if (input.styleDomain && style.domain !== input.styleDomain) continue

    const body = formatStyleAsset(style)
    if (!body) continue

    chips.push({
      id: chipId,
      kind: "style",
      label: `文体: ${item.name}`,
      body,
      removable: true,
    })
  }

  // (d) テンプレ / 追加指示 — 呼び出し側指定
  for (const chip of input.extraChips ?? []) {
    if (excluded.has(chip.id)) continue
    if (!chip.body.trim()) continue
    chips.push(chip)
  }

  return { system: buildSystemPrompt(chips), sections: chips }
}
