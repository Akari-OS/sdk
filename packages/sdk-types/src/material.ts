/**
 * @file material.ts
 * AKARI-HUB-088 §2-4 (S0-4): Library 登録契約。素材オーサリングアプリ
 * （synth / motion / diagram / mockup / 3d）が「再利用可能な素材」を Pool +
 * MaterialPanel（素材ブラウザ）に出すための共通出力口。
 *
 * pool-core の add_item は実ファイル必須なので、doc(JSON) を一時 blob に書き出してから
 * pool_upsert_item（storageMode="copy"）で登録する実績パターン（use-work-state-sync.ts）を踏襲。
 * material_type / doc_format / doc / thumbnail を contextJson に載せ、MaterialPanel が
 * material_type で絞り込む。
 *
 * 設計 SSOT: docs/design/creator-app-shell-standard-2026-06-03.md §7-4
 */

import { invoke } from "@tauri-apps/api/core"

/**
 * 素材カテゴリ。MaterialPanel（素材ブラウザ）はこの値でカテゴリ分け / 絞り込みする。
 * 既知値の補完を効かせつつ、未知の拡張カテゴリ（任意 string）も許容する。
 */
export type MaterialType =
  | "audio"
  | "sfx" // synth
  | "transition"
  | "effect"
  | "sticker"
  | "text-anim" // motion
  | "diagram-part"
  | "diagram-template" // diagram
  | "stage-shot" // stage（モックアップショット・静止/動き）
  | "mockup-shot" // 旧称（akari-mockup 時代。2026-06-04 stage へ改名。後方互換で残置）
  | "3d-model" // 3d
  | "chart"
  | "chart-template"
  | "table" // sheets
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {})

/**
 * 登録する素材。`doc` が各アプリ SSOT の本体（Diagram Doc / AMF / Mockup Scene 等）。
 */
export type MaterialAsset = {
  /** 素材カテゴリ（MaterialPanel の絞り込みキー）。 */
  type: MaterialType
  /** 一覧表示名。 */
  name: string
  /** doc の種別（"diagram" / "amf" / "mockup-scene" / "sdf-scene" / ...）。 */
  docFormat: string
  /** SSOT 本体（JSON シリアライズ可能であること）。 */
  doc: unknown
  /** 代表 PNG サムネの Pool item id。 */
  thumbnailItemId?: string
  /** 任意: ループ WebM 等プレビュー item id（一覧再生用）。 */
  previewItemId?: string
  /** 任意: doc から焼いた派生物（3d-model の GLB 等）の item id。 */
  bakedItemId?: string
  /** 任意タグ。 */
  tags?: string[]
}

export type RegisterMaterialOptions = {
  /** 登録先 Pool 名。省略時は既定の素材 Pool（auto-ensure）。 */
  library?: string
  /** 同一素材の上書きキー。省略時は `material:<type>:<name>`。 */
  dedupKey?: string
  /** ADR-084 metadata（source_app / source_work_id 等）を追加で混ぜたいとき。 */
  context?: Record<string, unknown>
}

/** contextJson の material メタ（MaterialPanel / 編集導線が参照する形）。 */
export type MaterialContext = {
  material: true
  material_type: MaterialType
  doc_format: string
  doc: unknown
  thumbnail_item_id: string | null
  preview_item_id: string | null
  baked_item_id: string | null
  tags: string[]
  [key: string]: unknown
}

/** 既定の素材 Pool 名。app が library を指定しない場合の置き場。 */
export const DEFAULT_MATERIAL_POOL = "akari-materials"

const ensuredPools = new Set<string>()

async function ensurePool(name: string): Promise<void> {
  if (ensuredPools.has(name)) return
  try {
    const pools = await invoke<{ name: string }[]>("pool_list_pools", {
      includeArchived: false,
    })
    if (pools.some((p) => p.name === name)) {
      ensuredPools.add(name)
      return
    }
  } catch {
    // fall through
  }
  try {
    const archived = await invoke<{ name: string }[]>("pool_list_archived_pools")
    if (archived.some((p) => p.name === name)) {
      await invoke("pool_restore_pool", { name })
      ensuredPools.add(name)
      return
    }
  } catch {
    // fall through
  }
  try {
    await invoke("pool_create_pool", {
      name,
      description: "AKARI 素材ライブラリ（AKARI-HUB-088 registerMaterial）",
    })
    ensuredPools.add(name)
  } catch {
    // 既に存在 / 並行作成は無視（upsert 側で再評価される）
    ensuredPools.add(name)
  }
}

/** dedupKey / name を filesystem-safe な .json ファイル名に変換。 */
function safeFilename(seed: string): string {
  const base =
    seed
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "material"
  return base.endsWith(".json") ? base : `${base}.json`
}

/**
 * 素材を Pool + MaterialPanel に登録する。
 *
 * 同じ `dedupKey` の active item があれば archive してから upsert（履歴は残る）。
 * 戻り値の itemId は MaterialPanel の右クリック「編集」/ AuthoringEditorProps.sourceItem に渡せる。
 */
export async function registerMaterial(
  m: MaterialAsset,
  opts?: RegisterMaterialOptions,
): Promise<{ itemId: string }> {
  const library = opts?.library ?? DEFAULT_MATERIAL_POOL
  const dedupKey = opts?.dedupKey ?? `material:${m.type}:${m.name}`

  await ensurePool(library)

  const json = JSON.stringify(m.doc)
  const filename = safeFilename(dedupKey)
  const data = Array.from(new TextEncoder().encode(json))
  const absPath = await invoke<string>("save_blob_to_pool_uploads", {
    filename,
    data,
  })

  const contextJson: MaterialContext = {
    material: true,
    material_type: m.type,
    doc_format: m.docFormat,
    doc: m.doc,
    thumbnail_item_id: m.thumbnailItemId ?? null,
    preview_item_id: m.previewItemId ?? null,
    baked_item_id: m.bakedItemId ?? null,
    tags: m.tags ?? [],
    ...(opts?.context ?? {}),
  }

  const summary = await invoke<{ id: string }>("pool_upsert_item", {
    library,
    filePath: absPath,
    name: m.name,
    dedupKey,
    contextJson,
    storageMode: "copy",
  })

  return { itemId: summary.id }
}

/**
 * Pool item の context_json から material_type を安全に取り出す。
 * MaterialPanel など素材ブラウザ側のフィルタで使う。material でなければ null。
 */
export function getMaterialType(contextJson: unknown): MaterialType | null {
  if (!contextJson || typeof contextJson !== "object") return null
  const ctx = contextJson as Record<string, unknown>
  const t = ctx.material_type
  return typeof t === "string" ? (t as MaterialType) : null
}
