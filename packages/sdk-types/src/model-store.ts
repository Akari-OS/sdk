/**
 * @file model-store.ts
 * Runtime: 選択中 LLM モデルの管理。
 *
 * localStorage + CustomEvent によるシンプルな購読。Zustand 等のグローバルストアは
 * 使わず、純粋関数 + イベントで済ませる。ModelSelector / Settings / CommandPalette
 * 等、shell と app の複数箇所で共通で参照される。
 *
 * @packageDocumentation
 */

import { useEffect, useState } from "react"
import { DEFAULT_MODEL_ID, getModelById, type ModelInfo } from "./models.js"

const STORAGE_KEY = "akari.selectedModelId"
const EVENT_NAME = "akari:model-changed"

/** localStorage から現在選択中のモデル ID を取得 */
export function getSelectedModelId(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL_ID
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MODEL_ID
}

/** モデル ID を保存し、変更を購読者に通知 */
export function setSelectedModelId(id: string): void {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, id)
  window.dispatchEvent(new CustomEvent<string>(EVENT_NAME, { detail: id }))
}

/** ID から ModelInfo を解決。見つからなければ DEFAULT_MODEL_ID にフォールバック */
function resolveModel(id: string): ModelInfo {
  const found = getModelById(id)
  if (found) return found
  const fallback = getModelById(DEFAULT_MODEL_ID)
  if (!fallback) {
    throw new Error(
      `DEFAULT_MODEL_ID "${DEFAULT_MODEL_ID}" not found in MODELS`,
    )
  }
  return fallback
}

/**
 * React hook: 選択中モデルを購読する。
 *
 * 返り値は `[ModelInfo, setter]`。setter を呼ぶと localStorage に保存され、
 * 同一ウィンドウ内の他の購読者にも CustomEvent で通知される。
 */
export function useSelectedModel(): [ModelInfo, (id: string) => void] {
  const [modelId, setModelId] = useState<string>(() => getSelectedModelId())

  useEffect(() => {
    const handleCustom = (e: Event): void => {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === "string") {
        setModelId(detail)
      }
    }
    const handleStorage = (e: StorageEvent): void => {
      if (e.key === STORAGE_KEY && typeof e.newValue === "string") {
        setModelId(e.newValue)
      }
    }
    window.addEventListener(EVENT_NAME, handleCustom)
    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener(EVENT_NAME, handleCustom)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  const setter = (id: string): void => {
    setSelectedModelId(id)
  }

  return [resolveModel(modelId), setter]
}

// ---------------------------------------------------------------------------
// 機能別モデルデフォルト（2 層構造）
// ---------------------------------------------------------------------------
//
// グローバルデフォルト（既存の `akari.selectedModelId`）に加えて、
// 機能（Writer / Chat / Partner / Worker）ごとの override を管理する。
//
// - `global` は `getSelectedModelId()` を常に参照する（二重管理を避ける）
// - `overrides` のみ別キー（`akari.modelPreferences`）で永続化する
// - override が `null` または未設定なら "グローバルに従う" と解釈する
// ---------------------------------------------------------------------------

/** モデルデフォルトを決める機能（エージェント）キー */
export type FeatureKey = "global" | "chat" | "writer" | "partner" | "worker"

/** グローバル以外の機能キー（override を持てるもの） */
export type OverridableFeatureKey = Exclude<FeatureKey, "global">

const FEATURE_STORAGE_KEY = "akari.modelPreferences"
const FEATURE_EVENT_NAME = "akari:feature-model-changed"

/** モデルプリファレンス全体 */
export interface ModelPreferences {
  /** グローバルデフォルト（既存の STORAGE_KEY と同期） */
  global: string
  /** 機能別のオーバーライド。null or undefined は "グローバルに従う" */
  overrides: Partial<Record<OverridableFeatureKey, string | null>>
}

interface FeatureModelChangeDetail {
  feature: OverridableFeatureKey
  id: string | null
}

function readOverrides(): Partial<Record<OverridableFeatureKey, string | null>> {
  if (typeof window === "undefined") return {}
  const raw = localStorage.getItem(FEATURE_STORAGE_KEY)
  if (raw === null) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "overrides" in parsed &&
      typeof (parsed as { overrides: unknown }).overrides === "object" &&
      (parsed as { overrides: unknown }).overrides !== null
    ) {
      const overrides = (parsed as { overrides: Record<string, unknown> })
        .overrides
      const result: Partial<Record<OverridableFeatureKey, string | null>> = {}
      const allowed: OverridableFeatureKey[] = [
        "chat",
        "writer",
        "partner",
        "worker",
      ]
      for (const key of allowed) {
        const value = overrides[key]
        if (value === null) {
          result[key] = null
        } else if (typeof value === "string") {
          result[key] = value
        }
      }
      return result
    }
  } catch {
    // JSON 破損時は無視して空を返す
  }
  return {}
}

function writeOverrides(
  overrides: Partial<Record<OverridableFeatureKey, string | null>>,
): void {
  if (typeof window === "undefined") return
  localStorage.setItem(FEATURE_STORAGE_KEY, JSON.stringify({ overrides }))
}

export function getModelPreferences(): ModelPreferences {
  return {
    global: getSelectedModelId(),
    overrides: readOverrides(),
  }
}

/**
 * 指定機能のモデル ID を解決する。
 *
 * `global` は常に `getSelectedModelId()` を返す。
 * それ以外は override があれば override、無ければ global にフォールバック。
 */
export function resolveModelId(feature: FeatureKey): string {
  const globalId = getSelectedModelId()
  if (feature === "global") return globalId
  const overrides = readOverrides()
  const override = overrides[feature]
  if (typeof override === "string" && override.length > 0) {
    return override
  }
  return globalId
}

/**
 * 指定機能のモデル override を設定する。
 *
 * `id` に `null` を渡すと override をクリアしてグローバルに従う状態に戻す。
 */
export function setFeatureModelId(
  feature: OverridableFeatureKey,
  id: string | null,
): void {
  if (typeof window === "undefined") return
  const overrides = readOverrides()
  if (id === null) {
    delete overrides[feature]
  } else {
    overrides[feature] = id
  }
  writeOverrides(overrides)
  window.dispatchEvent(
    new CustomEvent<FeatureModelChangeDetail>(FEATURE_EVENT_NAME, {
      detail: { feature, id },
    }),
  )
}

/** useFeatureModel の返り値 */
export interface UseFeatureModelResult {
  model: ModelInfo
  effectiveId: string
  override: string | null
  setOverride: (id: string | null) => void
}

/**
 * React hook: 指定機能のモデル解決 + setter を返す。
 *
 * グローバル変更 / 同機能の override 変更 / 別タブでの localStorage 変更のすべてに追随する。
 */
export function useFeatureModel(feature: FeatureKey): UseFeatureModelResult {
  const [globalId, setGlobalId] = useState<string>(() => getSelectedModelId())
  const [overrides, setOverrides] = useState<
    Partial<Record<OverridableFeatureKey, string | null>>
  >(() => readOverrides())

  useEffect(() => {
    const handleGlobal = (e: Event): void => {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === "string") {
        setGlobalId(detail)
      }
    }
    const handleFeature = (): void => {
      setOverrides(readOverrides())
    }
    const handleStorage = (e: StorageEvent): void => {
      if (e.key === STORAGE_KEY && typeof e.newValue === "string") {
        setGlobalId(e.newValue)
      } else if (e.key === FEATURE_STORAGE_KEY) {
        setOverrides(readOverrides())
      }
    }
    window.addEventListener(EVENT_NAME, handleGlobal)
    window.addEventListener(FEATURE_EVENT_NAME, handleFeature)
    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener(EVENT_NAME, handleGlobal)
      window.removeEventListener(FEATURE_EVENT_NAME, handleFeature)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  const override: string | null =
    feature === "global" ? null : (overrides[feature] ?? null)

  const effectiveId: string =
    feature === "global"
      ? globalId
      : typeof override === "string" && override.length > 0
        ? override
        : globalId

  const setOverride = (id: string | null): void => {
    if (feature === "global") {
      return
    }
    setFeatureModelId(feature, id)
  }

  return {
    model: resolveModel(effectiveId),
    effectiveId,
    override,
    setOverride,
  }
}
