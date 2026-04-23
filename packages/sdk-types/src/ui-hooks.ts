/**
 * @file ui-hooks.ts
 * Runtime: App 側で使える共通 React フック。
 *
 * 現状は font scale のみ。将来、shell のテーマ・キーボードショートカット取得などを
 * 同じ subpath に追加する。
 *
 * @packageDocumentation
 */

import { useCallback, useEffect, useState } from "react"

/**
 * useFontScale — UI 全体のスケールを管理するフック。
 *
 * `document.documentElement.style.fontSize` を変更して rem ベースの
 * UI 要素を一括スケールする。Tailwind CSS はデフォルトで rem を使うので、
 * ルートの fontSize を変えるだけでテキスト・padding・margin・gap 等すべてがスケールする。
 *
 * キーボードショートカット（Cmd+/Cmd-）は Tauri WebView で横取りされるため、
 * UI ボタンのみで操作する（将来 Tauri shortcut API に移行）。
 *
 * spec: AKARI-HUB-008 Phase 1
 */
const ZOOM_KEY = "akari.ui.zoomLevel"
const DEFAULT_ZOOM = 1.0
const MIN_ZOOM = 0.75
const MAX_ZOOM = 2.0
const STEP = 0.05
const BASE_FONT_SIZE = 16

function loadZoom(): number {
  try {
    const raw = localStorage.getItem(ZOOM_KEY)
    if (raw) {
      const val = Number(raw)
      if (val >= MIN_ZOOM && val <= MAX_ZOOM) return val
    }
  } catch {
    // ignore
  }
  return DEFAULT_ZOOM
}

function applyZoom(level: number) {
  document.documentElement.style.fontSize = `${BASE_FONT_SIZE * level}px`
}

export function useFontScale() {
  const [zoom, setZoom] = useState(loadZoom)

  useEffect(() => {
    applyZoom(zoom)
  }, [zoom])

  const zoomIn = useCallback(() => {
    setZoom((prev) => {
      const next = Math.min(+(prev + STEP).toFixed(2), MAX_ZOOM)
      localStorage.setItem(ZOOM_KEY, String(next))
      return next
    })
  }, [])

  const zoomOut = useCallback(() => {
    setZoom((prev) => {
      const next = Math.max(+(prev - STEP).toFixed(2), MIN_ZOOM)
      localStorage.setItem(ZOOM_KEY, String(next))
      return next
    })
  }, [])

  const resetZoom = useCallback(() => {
    setZoom(DEFAULT_ZOOM)
    localStorage.setItem(ZOOM_KEY, String(DEFAULT_ZOOM))
  }, [])

  return {
    zoom,
    zoomIn,
    zoomOut,
    resetZoom,
    percentage: Math.round(zoom * 100),
  }
}
