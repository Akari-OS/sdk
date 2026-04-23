/**
 * RadarChart — モデル比較用 Canvas 2D レーダーチャート。
 *
 * ModelSelector ドロップダウン / SettingsView モデルタブ両方から使われる共通部品。
 * primary（青）と secondary（オレンジ）を重ね描きする。stats は 0-5 スケール。
 *
 * spec: AKARI-HUB-009
 */

import { useEffect, useRef } from "react"
import { STAT_LABEL_JA, type ModelInfo } from "@akari-os/sdk/models"

/** レーダーチャート軸の順番（stats キー） */
export const STAT_KEYS: (keyof ModelInfo["stats"])[] = [
  "speed",
  "quality",
  "reasoning",
  "creativity",
  "cost",
]

export interface RadarChartProps {
  /** メイン描画対象（青） */
  primary: ModelInfo
  /** 比較対象（オレンジ）。同一 ID or null のときは描画しない */
  secondary: ModelInfo | null
  /** 表示サイズ (px)。デフォルト 200 */
  size?: number
}

/** Canvas 2D でレーダーチャートを描く小コンポーネント */
export function RadarChart({
  primary,
  secondary,
  size = 200,
}: RadarChartProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let rafId = 0
    rafId = window.requestAnimationFrame(() => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = size * dpr
      canvas.height = size * dpr
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(dpr, dpr)

      const cx = size / 2
      const cy = size / 2
      const radius = size * 0.32
      const axes = STAT_KEYS.length
      const angleStep = (Math.PI * 2) / axes
      const startAngle = -Math.PI / 2

      ctx.clearRect(0, 0, size, size)

      for (let level = 1; level <= 5; level++) {
        const r = (radius * level) / 5
        ctx.beginPath()
        for (let i = 0; i <= axes; i++) {
          const angle = startAngle + angleStep * (i % axes)
          const x = cx + r * Math.cos(angle)
          const y = cy + r * Math.sin(angle)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.strokeStyle = "rgba(120,120,120,0.2)"
        ctx.lineWidth = 0.5
        ctx.stroke()
      }

      for (let i = 0; i < axes; i++) {
        const angle = startAngle + angleStep * i
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle))
        ctx.strokeStyle = "rgba(120,120,120,0.3)"
        ctx.lineWidth = 0.5
        ctx.stroke()
      }

      const labelFontSize = Math.max(10, Math.round(size * 0.05))
      ctx.font = `${labelFontSize}px sans-serif`
      ctx.fillStyle = "#888"
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      for (let i = 0; i < axes; i++) {
        const angle = startAngle + angleStep * i
        const labelR = radius + 16
        const x = cx + labelR * Math.cos(angle)
        const y = cy + labelR * Math.sin(angle)
        ctx.fillText(STAT_LABEL_JA[STAT_KEYS[i]], x, y)
      }

      const drawData = (
        model: ModelInfo,
        stroke: string,
        fill: string,
      ): void => {
        ctx.beginPath()
        for (let i = 0; i <= axes; i++) {
          const idx = i % axes
          const angle = startAngle + angleStep * idx
          const value = model.stats[STAT_KEYS[idx]] / 5
          const r = radius * value
          const x = cx + r * Math.cos(angle)
          const y = cy + r * Math.sin(angle)
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.fillStyle = fill
        ctx.fill()
        ctx.strokeStyle = stroke
        ctx.lineWidth = 1.5
        ctx.stroke()

        for (let i = 0; i < axes; i++) {
          const angle = startAngle + angleStep * i
          const value = model.stats[STAT_KEYS[i]] / 5
          const r = radius * value
          const x = cx + r * Math.cos(angle)
          const y = cy + r * Math.sin(angle)
          ctx.beginPath()
          ctx.arc(x, y, 2.5, 0, Math.PI * 2)
          ctx.fillStyle = stroke
          ctx.fill()
        }
      }

      if (secondary && secondary.id !== primary.id) {
        drawData(secondary, "rgba(249,115,22,1)", "rgba(249,115,22,0.12)")
      }
      drawData(primary, "rgba(59,130,246,1)", "rgba(59,130,246,0.14)")
    })

    return () => {
      window.cancelAnimationFrame(rafId)
    }
  }, [primary, secondary, size])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      data-testid="model-radar-chart"
    />
  )
}
