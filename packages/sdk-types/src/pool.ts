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

// ===== 型定義 =====

export interface LibraryInfo {
  name: string
  display_name: string | null
  description?: string | null
  icon: string | null
  item_count: number
  created_at: string | null
  archived_at?: string | null
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
}

export interface PoolSearchResult {
  library: string
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

// ===== Library API =====

export async function listWorkspaces(
  includeArchived?: boolean,
): Promise<LibraryInfo[]> {
  return (await invoke("pool_list_libraries", {
    includeArchived: includeArchived ?? false,
  })) as LibraryInfo[]
}

export async function listArchivedWorkspaces(): Promise<LibraryInfo[]> {
  return (await invoke("pool_list_archived_libraries")) as LibraryInfo[]
}

export async function createWorkspace(
  name: string,
  description?: string,
): Promise<LibraryInfo> {
  return (await invoke("pool_create_library", {
    name,
    description: description ?? null,
  })) as LibraryInfo
}

export async function deleteWorkspace(name: string): Promise<void> {
  await archiveWorkspace(name)
}

export async function archiveWorkspace(name: string): Promise<void> {
  await invoke("pool_archive_library", { name })
}

export async function restoreWorkspace(name: string): Promise<void> {
  await invoke("pool_restore_library", { name })
}

export async function purgeWorkspace(name: string): Promise<void> {
  await invoke("pool_purge_library", { name })
}

export async function renameWorkspace(
  oldName: string,
  newName: string,
): Promise<void> {
  await invoke("pool_rename_library", { oldName, newName })
}

export async function updateWorkspaceMeta(
  name: string,
  update: WorkspaceMetaUpdate,
): Promise<void> {
  await invoke("pool_update_library_meta", { name, update })
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
): Promise<PoolItemFull> {
  return (await invoke("pool_get_item", { library, id })) as PoolItemFull
}

export async function listRelations(
  library: string,
): Promise<PoolRelation[]> {
  return (await invoke("pool_list_relations", { library })) as PoolRelation[]
}

export async function addItem(
  library: string,
  filePath: string,
  name?: string,
): Promise<PoolItemSummary> {
  return (await invoke("pool_add_item", {
    library,
    filePath,
    name: name ?? null,
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
