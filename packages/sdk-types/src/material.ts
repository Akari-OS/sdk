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
 * ADR-124: PoolItemLicense / grant モデルを追加。contextJson.license に刻印。
 * ADR-123: registerRender を追加。書き出し物を使用先 Work Pool の generated として登録し
 *          ソースへ lineage リンクする。
 * ADR-140 D-4 ③: 四点契約「素材登録」の遵守コストを下げるため、`resolveMaterialApi` /
 *          `registerMaterialSafe` / `registerRenderSafe` を追加。各アプリが個別コピペしていた
 *          `globalThis.__akari_sdk?.material` 解決ボイラープレートをこの 3 関数に集約する。
 *
 * 設計 SSOT: docs/design/creator-app-shell-standard-2026-06-03.md §7-4
 */

import { invoke } from "@tauri-apps/api/core"

// ---------------------------------------------------------------------------
// ADR-124: PoolItemLicense — grant モデル
// ---------------------------------------------------------------------------

/**
 * 素材アイテムへのアクセス権限（ADR-124 D2）。
 *
 * - view           : 一覧・プレビュー表示
 * - use-in-render  : レンダリング / 書き出しへの素材利用
 * - edit-source    : ソース編集（パッチ変更・テロップ本文変更等）
 * - export-source  : ソースファイル（パッチ JSON / SVG 等）のエクスポート
 * - redistribute   : 素材そのものの再配布・転売
 */
export type MaterialGrant =
  | "view"
  | "use-in-render"
  | "edit-source"
  | "export-source"
  | "redistribute"

/** 全 grant の順序付きリスト（user-owned → ALL_GRANTS）。 */
export const ALL_GRANTS: MaterialGrant[] = [
  "view",
  "use-in-render",
  "edit-source",
  "export-source",
  "redistribute",
]

/**
 * Pool item の contextJson.license に刻印するライセンス情報（ADR-124 D2）。
 *
 * - user-owned   : ユーザー自作素材（全 grant）
 * - akari        : AKARI 提供素材。grants で許可操作を明示
 * - marketplace  : マーケットプレイス素材。source は出品者 id。grants で許可操作を明示
 */
export type PoolItemLicense =
  | { kind: "user-owned" }
  | { kind: "akari"; grants: MaterialGrant[] }
  | { kind: "marketplace"; source: string; grants: MaterialGrant[] }

/**
 * contextJson.license を安全に解釈する。
 * 未設定・不正な値は { kind: "user-owned" } にフォールバック（ADR-124 D5: 既存素材は user-owned 扱い）。
 */
export function parseItemLicense(contextJson: unknown): PoolItemLicense {
  if (!contextJson || typeof contextJson !== "object") {
    return { kind: "user-owned" }
  }
  const ctx = contextJson as Record<string, unknown>
  const raw = ctx.license
  if (!raw || typeof raw !== "object") {
    return { kind: "user-owned" }
  }
  const l = raw as Record<string, unknown>
  if (l.kind === "user-owned") {
    return { kind: "user-owned" }
  }
  if (l.kind === "akari" && Array.isArray(l.grants)) {
    return { kind: "akari", grants: l.grants as MaterialGrant[] }
  }
  if (l.kind === "marketplace" && typeof l.source === "string" && Array.isArray(l.grants)) {
    return { kind: "marketplace", source: l.source, grants: l.grants as MaterialGrant[] }
  }
  // 不正フォールバック
  return { kind: "user-owned" }
}

/**
 * PoolItemLicense から有効な grant 一覧を返す。
 * user-owned → ALL_GRANTS、それ以外 → grants（view は常に含める）。
 */
export function licenseGrants(l: PoolItemLicense): MaterialGrant[] {
  if (l.kind === "user-owned") return [...ALL_GRANTS]
  const base: MaterialGrant[] = l.grants
  // view は常時含める（ADR-124 D2 暗黙の前提）
  if (!base.includes("view")) return ["view", ...base]
  return base
}

/**
 * contextJson を持つ Pool item が特定の grant を持つかチェックする。
 * 引数 contextJson は PoolItemFull.context_json 等をそのまま渡せる。
 */
export function hasGrant(contextJson: unknown, g: MaterialGrant): boolean {
  return licenseGrants(parseItemLicense(contextJson)).includes(g)
}

// ---------------------------------------------------------------------------
// 素材カテゴリ
// ---------------------------------------------------------------------------

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
  | "telop-template" // telop（ATF テロップテンプレ、docFormat: atf）
  | "diagram-part"
  | "diagram-template" // diagram
  | "stage-shot" // stage（モックアップショット・静止/動き）
  | "mockup-shot" // 旧称（akari-mockup 時代。2026-06-04 stage へ改名。後方互換で残置）
  | "3d-model" // 3d
  | "svg" // SVG ベクター素材（docFormat: svg.shape.v1 など）
  | "vector" // SVG を含むベクター素材の汎用カテゴリ
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
  /** ADR-124: 素材ライセンス。省略時は { kind: "user-owned" }。 */
  license?: PoolItemLicense
  /**
   * ADR-137 D1: 素材の生成元区分。contextJson.origin に刻印する。
   * - created   : ユーザーが自ら作成した素材（既定）
   * - sourced   : 外部から取り込んだ素材（インポート / マーケットプレイス等）
   * - generated : AI / 自動生成で作られた素材
   * opts.context.origin より優先される。
   */
  origin?: "created" | "sourced" | "generated"
  /**
   * ADR-133 §2.6: true のとき、pool upsert 完了後に
   * `akari:pool-analyze-request` イベントを window に dispatch する。
   * 既定 false。
   */
  analyzeAfter?: boolean
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

// ---------------------------------------------------------------------------
// ADR-133 §2.6: pool analyze request イベント
// ---------------------------------------------------------------------------

/**
 * `akari:pool-analyze-request` CustomEvent の detail 型。
 * shell 側の PoolAnalyzeDrawer がこのイベントをリッスンして分析を実行する。
 */
export type PoolAnalyzeRequestDetail = {
  /** 対象 Pool ライブラリ名。 */
  library: string
  /** 対象アイテム id。 */
  itemId: string
  /** MIME タイプヒント（分かる場合のみ）。 */
  mimeHint?: string
  /** true のとき通知を抑制する（既定 false = 通知あり）。 */
  silent?: boolean
}

/**
 * pool upsert 完了後に分析リクエストイベントを dispatch する内部ヘルパ。
 * ブラウザ / webview 環境専用（typeof window チェック済み）。
 */
function dispatchPoolAnalyzeRequest(detail: PoolAnalyzeRequestDetail): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent<PoolAnalyzeRequestDetail>("akari:pool-analyze-request", {
      detail,
    }),
  )
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
    // ADR-123 / ADR-124 / ADR-137: origin + license を contextJson に刻印
    // opts.origin（型付き）> opts.context.origin（後方互換レガシー）> 既定 "created"
    origin: opts?.origin ?? (opts?.context?.origin as string) ?? "created",
    license: opts?.license ?? { kind: "user-owned" },
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

  // ADR-133 §2.6: analyzeAfter が true のとき分析リクエストイベントを発火する
  if (opts?.analyzeAfter) {
    dispatchPoolAnalyzeRequest({ library, itemId: summary.id })
  }

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

// ---------------------------------------------------------------------------
// ADR-123 D1: registerRender — 書き出し物の登録
// ---------------------------------------------------------------------------

/**
 * 書き出し成果物アセット。filePath か data のどちらかを必須とする。
 * ADR-123 D1: 書き出し物は使用先 Work Pool の generated + ソースへ lineage リンク。
 */
export type RenderedOutputAsset = {
  /** 表示名 */
  name: string
  /**
   * 既にディスクにある書き出しファイルの絶対パス（ffmpeg 出力等）。
   * storageMode "reference" で登録する。filePath か data のどちらかが必須。
   */
  filePath?: string
  /**
   * ブラウザ内生成バイト列（WAV 等）。
   * save_blob_to_pool_uploads 経由で一時ファイルに書き出してから storageMode "copy" で登録する。
   * filePath か data のどちらかが必須。
   */
  data?: Uint8Array
  /**
   * data 指定時の保存ファイル名（拡張子込み）。
   * data を指定した場合は必須（省略時は throw）。
   */
  filename?: string
  /** 派生元ソース素材 itemId（lineage）。contextJson.source_item_id に刻印。 */
  sourceItemId?: string
  /** 使用先 Work id。指定時の既定置き場は `work-${workId}` Pool。 */
  workId?: string
  /** 任意タグ */
  tags?: string[]
}

export type RegisterRenderOptions = {
  /**
   * 明示的な登録先 Pool 名。
   * 省略時: workId あり → `work-${workId}` / なし → "akari-outputs"
   */
  library?: string
  /**
   * ライセンス。省略時:
   *   sourceItemId がある → pool_get_item で source の contextJson.license を継承（失敗時は user-owned）
   *   sourceItemId なし  → { kind: "user-owned" }
   */
  license?: PoolItemLicense
  /** 追加メタデータ。context.origin は opts.origin より優先度が低い（後方互換）。 */
  context?: Record<string, unknown>
  /**
   * ADR-137 D1: 書き出し物の生成元区分。contextJson.origin に刻印する。
   * - created   : ユーザー操作で作成
   * - sourced   : 外部から取り込んだ出力物
   * - generated : AI / 自動パイプラインで生成（既定）
   * opts.context.origin より優先される。省略時は "generated"。
   */
  origin?: "created" | "sourced" | "generated"
  /**
   * ADR-133 §2.6: true のとき、pool upsert 完了後に
   * `akari:pool-analyze-request` イベントを window に dispatch する。
   * 既定 false。
   */
  analyzeAfter?: boolean
}

/** 書き出し物のデフォルト登録先（system-managed library）。 */
const OUTPUTS_LIBRARY = "akari-outputs"

/**
 * 書き出し成果物を Pool に登録する（ADR-123 D1）。
 *
 * - material: true は付けない（書き出し物は MaterialPanel の素材ではない）
 * - scope: "output" を contextJson に刻印
 * - source_work_id があれば facets.ts が generated facet に分類する
 * - Work Pool（`work-${workId}`）は auto-create しない。存在しなければ akari-outputs にフォールバック
 * - dedupKey は付けない（書き出しは毎回新規）
 */
export async function registerRender(
  r: RenderedOutputAsset,
  opts?: RegisterRenderOptions,
): Promise<{ itemId: string }> {
  // --- 入力バリデーション ---
  if (!r.filePath && !r.data) {
    throw new Error("[registerRender] filePath か data のどちらかは必須です。")
  }
  if (r.data && !r.filename) {
    throw new Error("[registerRender] data を指定する場合は filename も必須です。")
  }

  // --- 登録先 Pool の決定 ---
  let library: string
  if (opts?.library) {
    library = opts.library
    await ensurePool(library)
  } else if (r.workId) {
    const workPoolName = `work-${r.workId}`
    // Work Pool は auto-create しない。存在するか確認してからフォールバック。
    const workPoolExists = await checkPoolExists(workPoolName)
    if (workPoolExists) {
      library = workPoolName
    } else {
      console.warn(
        `[registerRender] Work Pool "${workPoolName}" が見つかりません。akari-outputs にフォールバックします。`,
      )
      library = OUTPUTS_LIBRARY
      await ensurePool(OUTPUTS_LIBRARY)
    }
  } else {
    library = OUTPUTS_LIBRARY
    await ensurePool(OUTPUTS_LIBRARY)
  }

  // --- ファイルパスの解決 ---
  let absPath: string
  let storageMode: "copy" | "reference"
  if (r.filePath) {
    absPath = r.filePath
    storageMode = "reference"
  } else {
    // data → save_blob_to_pool_uploads で一時ファイルに書き出す
    const dataArr = Array.from(r.data!)
    absPath = await invoke<string>("save_blob_to_pool_uploads", {
      filename: r.filename!,
      data: dataArr,
    })
    storageMode = "copy"
  }

  // --- ライセンス解決 ---
  let license: PoolItemLicense
  if (opts?.license) {
    license = opts.license
  } else if (r.sourceItemId) {
    // sourceItemId がある場合、ソースの license を継承しようとする
    // pool_get_item には library が必要だが、ソースの library は不明のため
    // フォールバックとして akari-materials → akari-outputs → current library の順で試みる
    // 実装上の注意: pool_get_item は library 必須なので sourceItemId だけでは検索できない。
    // ここでは最低限 user-owned にフォールバックし、アプリ側で明示 opts.license を渡すことを推奨。
    license = await resolveSourceLicense(r.sourceItemId)
  } else {
    license = { kind: "user-owned" }
  }

  // --- contextJson 構築 ---
  const contextJson: Record<string, unknown> = {
    scope: "output",
    // ADR-137 D1: opts.origin（型付き）> opts.context.origin（後方互換レガシー）> 既定 "generated"
    origin: opts?.origin ?? (opts?.context?.origin as string) ?? "generated",
    license,
    tags: r.tags ?? [],
    ...(opts?.context ?? {}),
  }
  if (r.sourceItemId) {
    contextJson.source_item_id = r.sourceItemId
  }
  if (r.workId) {
    // facets.ts inferFacet: source_work_id が存在 → generated facet に分類される
    contextJson.source_work_id = r.workId
  }

  // --- Pool に登録（dedupKey なし = 毎回新規） ---
  const summary = await invoke<{ id: string }>("pool_upsert_item", {
    library,
    filePath: absPath,
    name: r.name,
    dedupKey: null,
    contextJson,
    storageMode,
  })

  // ADR-133 §2.6: analyzeAfter が true のとき分析リクエストイベントを発火する
  if (opts?.analyzeAfter) {
    dispatchPoolAnalyzeRequest({ library, itemId: summary.id })
  }

  return { itemId: summary.id }
}

/**
 * Pool が存在するかを確認する内部ヘルパ。
 * pool_list_pools にヒットすれば true、それ以外 false（archived は除外）。
 */
async function checkPoolExists(name: string): Promise<boolean> {
  try {
    const pools = await invoke<{ name: string }[]>("pool_list_pools", {
      includeArchived: false,
    })
    return pools.some((p) => p.name === name)
  } catch {
    return false
  }
}

/**
 * sourceItemId からソース素材のライセンスを推定する内部ヘルパ。
 * pool_get_item には library 情報が必要なため、既知の候補 Pool を順に試みる。
 * 取得失敗時は { kind: "user-owned" } にフォールバック。
 */
async function resolveSourceLicense(sourceItemId: string): Promise<PoolItemLicense> {
  // 素材の置き場として可能性が高い Pool 候補を試みる順序
  const candidates = [DEFAULT_MATERIAL_POOL, OUTPUTS_LIBRARY, "akari-uploads"]
  for (const lib of candidates) {
    try {
      const item = await invoke<{ context_json?: unknown }>("pool_get_item", {
        library: lib,
        id: sourceItemId,
      })
      if (item && item.context_json !== undefined) {
        return parseItemLicense(item.context_json)
      }
    } catch {
      // 見つからなければ次の候補へ
    }
  }
  // 全候補で見つからなかった場合は user-owned にフォールバック
  return { kind: "user-owned" }
}

// ---------------------------------------------------------------------------
// ADR-140 D-4 ③（素材登録契約）: Tier B 向け解決ヘルパー
//
// telop / svg / synth / diagram / stage 等の各アプリが `src/lib/material.ts` に個別
// コピペしていた「globalThis.__akari_sdk?.material?.registerMaterial を型なしで拾う」
// ボイラープレート（resolveRegisterMaterial パターン）を、型安全な 1 関数に集約する。
// telop はさらに契約をローカル再実装していたが、本ヘルパーで置き換え可能。
//
// 前提: `@akari-os/sdk/material` は shell の externals shim
// （`akari-shell/public/akari-externals/akari-sdk-material.js`）経由で
// `globalThis.__akari_sdk.material`（本モジュール全体）に解決される（HUB-024 / RULES.md ルール14）。
// 単体 dev 起動・テストなど shell 外実行では未解決 = null（Tauri backend が無いので実登録もしない）。
// ---------------------------------------------------------------------------

/** `globalThis.__akari_sdk.material` として shell が露出する API のうち登録系のみを型付けしたもの。 */
export type MaterialApi = {
  registerMaterial: typeof registerMaterial
  registerRender: typeof registerRender
}

type AkariSdkMaterialGlobal = typeof globalThis & {
  __akari_sdk?: {
    material?: Partial<MaterialApi>
  }
}

/**
 * ADR-140 D-4 ③: `globalThis.__akari_sdk?.material` を型安全に解決する。
 *
 * shell 内で Full Tier app として mount されているときのみ非 null を返す。
 * 単体 dev 起動（アプリ単独の `pnpm dev` / storybook / unit test 等）や shell 外実行では null。
 *
 * @example
 * ```ts
 * const api = resolveMaterialApi()
 * if (api) {
 *   const { itemId } = await api.registerMaterial(asset, opts)
 * }
 * ```
 */
export function resolveMaterialApi(): MaterialApi | null {
  const g = globalThis as AkariSdkMaterialGlobal
  const m = g.__akari_sdk?.material
  if (m && typeof m.registerMaterial === "function" && typeof m.registerRender === "function") {
    return { registerMaterial: m.registerMaterial, registerRender: m.registerRender }
  }
  return null
}

/**
 * `registerMaterialSafe` / `registerRenderSafe` の戻り値。
 * shell 外実行時・invoke 失敗時も例外を投げず、常にこの形で結果を返す
 * （呼び出し側は `if (result.registered)` だけ見れば良い）。
 */
export type SafeRegistrationResult =
  | { registered: true; itemId: string }
  | { registered: false; itemId: null; reason: "unavailable" | "error"; error?: string }

function describeRegistrationError(err: unknown, subject: string): string {
  const detail = err instanceof Error ? err.message : String(err)
  return `[AKARI SDK] ${subject}の登録に失敗しました（AKARI シェル内で実行されているか、Pool 接続が有効かをご確認ください）: ${detail}`
}

/**
 * ADR-140 D-4 ③（素材登録契約）: {@link registerMaterial} の失敗しないラッパー。
 *
 * - shell 内で mount されている（{@link resolveMaterialApi} が非 null）ときのみ実際に登録する。
 * - shell 外・単体 dev 起動時は no-op で `{ registered: false, reason: "unavailable" }` を返す。
 * - invoke 失敗時も例外を投げず、丁寧な日本語エラーメッセージ付きで結果を返す。
 *
 * 各アプリの `resolveRegisterMaterial` ボイラープレート（akari-svg / akari-telop 等でコピペ
 * 実装されていたもの）はこの 1 関数の呼び出しに置き換えられる。
 *
 * @example
 * ```ts
 * const result = await registerMaterialSafe(
 *   { type: "svg", name, docFormat: SVG_DOC_FORMAT, doc: aspSvg },
 *   { library, dedupKey },
 * )
 * if (result.registered) {
 *   console.log("登録完了:", result.itemId)
 * }
 * ```
 */
export async function registerMaterialSafe(
  m: MaterialAsset,
  opts?: RegisterMaterialOptions,
): Promise<SafeRegistrationResult> {
  const api = resolveMaterialApi()
  if (!api) {
    return { registered: false, itemId: null, reason: "unavailable" }
  }
  try {
    const { itemId } = await api.registerMaterial(m, opts)
    return { registered: true, itemId }
  } catch (err) {
    return {
      registered: false,
      itemId: null,
      reason: "error",
      error: describeRegistrationError(err, "素材"),
    }
  }
}

/**
 * ADR-140 D-4 ③（素材登録契約）: {@link registerRender} の失敗しないラッパー。
 * 挙動は {@link registerMaterialSafe} と同様（shell 外 no-op / invoke 失敗を握りつぶさず日本語で返す）。
 */
export async function registerRenderSafe(
  r: RenderedOutputAsset,
  opts?: RegisterRenderOptions,
): Promise<SafeRegistrationResult> {
  const api = resolveMaterialApi()
  if (!api) {
    return { registered: false, itemId: null, reason: "unavailable" }
  }
  try {
    const { itemId } = await api.registerRender(r, opts)
    return { registered: true, itemId }
  } catch (err) {
    return {
      registered: false,
      itemId: null,
      reason: "error",
      error: describeRegistrationError(err, "書き出し物"),
    }
  }
}
