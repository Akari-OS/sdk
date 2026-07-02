/**
 * Akari Lens — dev 限定バズ分析アプリ (v1 実データ配線フェーズ)
 *
 * タスク [G]: pool 実配線 + 可視化 + ViralRecipe 保存。
 * 設計書: akari-os/docs/planning/akari-lens-vertical-slice-2026-06-30.md §G
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react"
import { convertFileSrc, invoke } from "@tauri-apps/api/core"
import { getItem, listWorkspaces, listItems } from "@akari-os/sdk/pool"
import { callToolJson } from "@akari-os/sdk/mcp"
import type { PoolInfo, PoolItemSummary, PoolItemFull } from "@akari-os/sdk/pool"

// ── 型定義 ───────────────────────────────────────────────────────────────────

/** pool_get_transcript の戻り値 */
interface TranscriptResult {
  item_id: string
  variant: string
  transcription: string | null
  segments: TranscriptSegment[] | null
  words: unknown[] | null
  language: string | null
}

interface TranscriptSegment {
  start: number
  end: number
  text: string
}

/** pool_get_analysis の戻り値 */
interface AnalysisResult {
  summary?: string | null
  tags?: string[] | null
  keyframes?: KeyframeEntry[] | null
  keyframe_descriptions?: string[] | null
  entities?: unknown[] | null
}

interface KeyframeEntry {
  /** 絶対ファイルパス */
  frame_path?: string
  /** 秒 (pool-impl が time_sec で出力) */
  time_sec?: number
  /** 秒 (旧表記 time_s でも受け取れるように) */
  time_s?: number
  /** フックフレームフラグ */
  is_hook?: boolean
}

/** context_json から取り出す virality_features 構造 */
interface ViralityFeatures {
  pacing?: {
    cuts_per_min?: number
    mean_shot_s?: number
    _confidence?: number
  }
  hook?: {
    hook_text_latency_s?: number
    text_on_screen_0_3s?: boolean
    face_present_0_3s?: boolean
    audio_rms_spike_0_3s?: boolean
    _confidence?: number
  }
  audio?: {
    integrated_rms?: number
    excitement_curve_ref?: string
    _confidence?: number
  }
  text?: {
    caption_coverage_pct?: number
    text_density_rate?: number
    _confidence?: number
  }
  _meta?: {
    confidence?: Record<string, number>
    provenance?: Record<string, string>
    schema_v?: number
  }
}

/** アプリの画面状態 */
type AppPhase =
  | { kind: "idle" }
  | { kind: "picking" }
  | { kind: "analyzing"; library: string; itemId: string; itemName: string }
  | { kind: "done"; library: string; itemId: string; itemFull: PoolItemFull; analysis: AnalysisResult; transcript: TranscriptResult }
  | { kind: "error"; message: string }

// ── ユーティリティ ────────────────────────────────────────────────────────────

/** excitement 配列を SVG polyline の points 文字列に変換する */
function buildPolylinePoints(
  curve: number[],
  svgWidth: number,
  svgHeight: number,
  paddingX = 8,
  paddingY = 8,
): string {
  if (curve.length < 2) return ""
  const innerW = svgWidth - paddingX * 2
  const innerH = svgHeight - paddingY * 2
  return curve
    .map((v, i) => {
      const x = paddingX + (i / (curve.length - 1)) * innerW
      // SVG y は下向きなので反転
      const y = paddingY + (1 - Math.max(0, Math.min(1, v))) * innerH
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(" ")
}

/** confidence 値を色クラスに変換する (Tailwind) */
function confidenceColor(conf: number | undefined): string {
  if (conf === undefined) return "text-slate-400"
  if (conf >= 0.9) return "text-emerald-600 dark:text-emerald-400"
  if (conf >= 0.75) return "text-yellow-600 dark:text-yellow-400"
  return "text-slate-400"
}

/** provenance 値からバッジスタイルを決定する */
function provenanceBadgeClass(prov: string | undefined): string {
  if (!prov) return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
  if (prov.includes("creator-prior") || prov === "prior")
    return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
  // 検証済み
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
}

/** boolean 値の視覚ラベル */
function BoolBadge({ val }: { val: boolean | undefined }) {
  if (val === undefined) return <span className="text-xs text-muted-foreground">—</span>
  return val ? (
    <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
      ✓ あり
    </span>
  ) : (
    <span className="px-1.5 py-0.5 rounded text-xs bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      なし
    </span>
  )
}

/** context_json から excitement_curve を取り出す */
function extractExcitementCurve(contextJson: unknown): number[] {
  if (!contextJson || typeof contextJson !== "object") return []
  const ctx = contextJson as Record<string, unknown>
  const raw = ctx["excitement_curve"]
  if (!Array.isArray(raw)) return []
  return raw.filter((v) => typeof v === "number") as number[]
}

/** context_json から virality_features を取り出す */
function extractViralityFeatures(contextJson: unknown): ViralityFeatures | null {
  if (!contextJson || typeof contextJson !== "object") return null
  const ctx = contextJson as Record<string, unknown>
  const raw = ctx["virality_features"]
  if (!raw || typeof raw !== "object") return null
  return raw as ViralityFeatures
}

// ── パネル共通ラッパー ─────────────────────────────────────────────────────

function Panel({
  title,
  badge,
  children,
}: {
  title: string
  badge?: string
  children: React.ReactNode
}) {
  return (
    <section className="border border-border rounded-xl overflow-hidden">
      <header className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-border">
        <h2 className="text-sm font-semibold">{title}</h2>
        {badge && (
          <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

// ── 動画選択 UI ───────────────────────────────────────────────────────────────

function PoolItemPicker({
  onSelect,
  onClose,
}: {
  onSelect: (library: string, item: PoolItemSummary) => void
  onClose: () => void
}) {
  const [libraries, setLibraries] = useState<PoolInfo[]>([])
  const [selectedLib, setSelectedLib] = useState<string>("")
  const [items, setItems] = useState<PoolItemSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ライブラリ一覧を読み込む
  useEffect(() => {
    setLoading(true)
    listWorkspaces(false)
      .then((libs) => {
        setLibraries(libs)
        if (libs.length > 0) setSelectedLib(libs[0].name)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  // 選択ライブラリのアイテムを読み込む（video / audio のみ）
  useEffect(() => {
    if (!selectedLib) return
    setLoading(true)
    setItems([])
    listItems(selectedLib, { limit: 200 })
      .then((all) => {
        // video / audio のみ表示（item_type で判定）
        const media = all.filter(
          (i) =>
            i.item_type === "video" ||
            i.item_type === "audio",
        )
        setItems(media)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [selectedLib])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
        {/* ヘッダ */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-semibold">動画を選択</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-lg leading-none"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        {/* ライブラリ選択 */}
        <div className="px-6 pt-4 pb-2">
          <select
            value={selectedLib}
            onChange={(e) => setSelectedLib(e.target.value)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
          >
            {libraries.map((lib) => (
              <option key={lib.name} value={lib.name}>
                {lib.display_name ?? lib.name} ({lib.item_count})
              </option>
            ))}
          </select>
        </div>

        {/* アイテム一覧 */}
        <div className="flex-1 overflow-y-auto px-6 pb-4">
          {error && (
            <p className="text-sm text-destructive py-4">{error}</p>
          )}
          {loading && (
            <p className="text-sm text-muted-foreground py-4">読み込み中…</p>
          )}
          {!loading && items.length === 0 && !error && (
            <p className="text-sm text-muted-foreground py-4">
              動画・音声アイテムがありません
            </p>
          )}
          <ul className="space-y-2 mt-2">
            {items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => onSelect(selectedLib, item)}
                  className="w-full text-left px-4 py-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground shrink-0">
                      {item.item_type}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      {item.ai_summary && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {item.ai_summary}
                        </p>
                      )}
                      {item.analyzed_at ? (
                        <span className="text-xs text-emerald-600 dark:text-emerald-400 mt-1 inline-block">
                          ✓ 分析済み
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground mt-1 inline-block">
                          未分析
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// ── Transcript パネル ──────────────────────────────────────────────────────────

function TranscriptPanel({ data }: { data: TranscriptResult | null }) {
  if (!data) {
    return (
      <Panel title="Transcript" badge="未取得">
        <p className="text-sm text-muted-foreground">transcript データなし</p>
      </Panel>
    )
  }
  const segments = data.segments ?? []
  return (
    <Panel
      title="Transcript"
      badge={
        segments.length > 0
          ? `${segments.length} segments`
          : data.transcription
            ? "full text"
            : "空"
      }
    >
      {segments.length > 0 ? (
        <ol className="space-y-2 max-h-64 overflow-y-auto">
          {segments.map((seg, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="shrink-0 w-16 text-right text-muted-foreground font-mono text-xs pt-0.5">
                {seg.start.toFixed(1)}s
              </span>
              <span>{seg.text}</span>
            </li>
          ))}
        </ol>
      ) : data.transcription ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
          {data.transcription}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">transcript なし</p>
      )}
      {data.language && (
        <p className="mt-2 text-xs text-muted-foreground">言語: {data.language}</p>
      )}
    </Panel>
  )
}

// ── Excitement 曲線パネル ──────────────────────────────────────────────────────

function ExcitementCurvePanel({
  curve,
  fallback,
}: {
  curve: number[]
  fallback?: string
}) {
  const SVG_W = 600
  const SVG_H = 120

  if (fallback || curve.length < 2) {
    return (
      <Panel title="Excitement 曲線（音声 RMS/秒）" badge={fallback ?? "データなし"}>
        <p className="text-sm text-muted-foreground">
          {fallback ?? "excitement_curve がまだ context_json にありません。分析後に表示されます。"}
        </p>
      </Panel>
    )
  }

  const points = buildPolylinePoints(curve, SVG_W, SVG_H)
  // フック区間（0-3s）の x 範囲
  const hookEndX = 8 + (Math.min(3, curve.length - 1) / (curve.length - 1)) * (SVG_W - 16)

  return (
    <Panel
      title="Excitement 曲線（音声 RMS/秒）"
      badge={`${curve.length}s`}
    >
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          className="w-full"
          style={{ minWidth: 280, height: SVG_H }}
          aria-label="excitement curve"
        >
          {/* フック区間（0-3s）強調 */}
          <rect
            x={8}
            y={0}
            width={hookEndX - 8}
            height={SVG_H}
            fill="rgba(249,115,22,0.08)"
          />
          {/* グリッド横線 */}
          {[0.25, 0.5, 0.75].map((v) => {
            const y = 8 + (1 - v) * (SVG_H - 16)
            return (
              <line
                key={v}
                x1={8}
                y1={y}
                x2={SVG_W - 8}
                y2={y}
                stroke="currentColor"
                strokeOpacity={0.1}
                strokeDasharray="4 4"
              />
            )
          })}
          {/* RMS 折れ線 */}
          <polyline
            points={points}
            fill="none"
            stroke="#f97316"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* フック区間ラベル */}
          <text x={12} y={SVG_H - 6} fontSize={9} fill="#f97316" opacity={0.8}>
            hook 0-3s
          </text>
        </svg>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        オレンジ帯 = フック区間 (0-3s)。縦軸: RMS 0-1.0、横軸: 秒。
      </p>
    </Panel>
  )
}

// ── キーフレームパネル ─────────────────────────────────────────────────────────

function KeyframesPanel({
  keyframes,
  descriptions,
  fallback,
}: {
  keyframes: KeyframeEntry[] | null | undefined
  descriptions: string[] | null | undefined
  fallback?: string
}) {
  if (fallback || !keyframes || keyframes.length === 0) {
    return (
      <Panel title="キーフレーム（Smart Selector）" badge={fallback ?? "データなし"}>
        <p className="text-sm text-muted-foreground">
          {fallback ?? "キーフレームがありません。分析後に表示されます。"}
        </p>
      </Panel>
    )
  }

  return (
    <Panel
      title="キーフレーム（Smart Selector）"
      badge={`${keyframes.length} frames`}
    >
      <ul className="space-y-3 max-h-80 overflow-y-auto">
        {keyframes.map((kf, i) => {
          const timeSec = kf.time_sec ?? kf.time_s
          const caption = descriptions?.[i] ?? null
          const imgSrc = kf.frame_path ? convertFileSrc(kf.frame_path) : null
          return (
            <li key={i} className="flex items-start gap-3">
              {/* サムネイル */}
              {imgSrc ? (
                <img
                  src={imgSrc}
                  alt={`frame ${i + 1}`}
                  className="shrink-0 w-24 h-14 rounded-md object-cover border border-border bg-muted"
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).style.display = "none"
                  }}
                />
              ) : (
                <div className="shrink-0 w-24 h-14 rounded-md bg-muted flex items-center justify-center text-muted-foreground text-xs border border-border">
                  {timeSec !== undefined ? `${timeSec.toFixed(1)}s` : `#${i + 1}`}
                </div>
              )}
              <div className="min-w-0 flex-1">
                {timeSec !== undefined && (
                  <p className="text-xs text-muted-foreground font-mono">
                    {timeSec.toFixed(2)}s
                  </p>
                )}
                {caption && (
                  <p className="text-sm leading-snug mt-0.5">{caption}</p>
                )}
                {kf.is_hook && (
                  <span className="mt-1 inline-block px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
                    hook frame
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

// ── フック分解カードパネル ─────────────────────────────────────────────────────

function HookBreakdownPanel({
  virality,
  fallback,
}: {
  virality: ViralityFeatures | null
  fallback?: string
}) {
  const hook = virality?.hook
  const meta = virality?._meta

  if (fallback || !hook) {
    return (
      <Panel title="フック分解 (0-3s)" badge={fallback ?? "データなし"}>
        <p className="text-sm text-muted-foreground">
          {fallback ?? "virality_features がまだ context_json にありません。分析後に表示されます。"}
        </p>
      </Panel>
    )
  }

  const conf = hook._confidence
  const prov = meta?.provenance

  // hook フィールドの provenance を解決
  const getProvenance = (key: string): string | undefined => {
    return prov?.[`hook.${key}`] ?? prov?.["hook"] ?? undefined
  }

  const rows: Array<{
    key: string
    label: string
    value: React.ReactNode
    provKey: string
  }> = [
    {
      key: "text_on_screen_0_3s",
      label: "テキスト出現 (0-3s)",
      value: <BoolBadge val={hook.text_on_screen_0_3s} />,
      provKey: "text_on_screen_0_3s",
    },
    {
      key: "face_present_0_3s",
      label: "顔の存在 (0-3s)",
      value: <BoolBadge val={hook.face_present_0_3s} />,
      provKey: "face_present_0_3s",
    },
    {
      key: "audio_rms_spike_0_3s",
      label: "音声スパイク (0-3s)",
      value: <BoolBadge val={hook.audio_rms_spike_0_3s} />,
      provKey: "audio_rms_spike_0_3s",
    },
    {
      key: "hook_text_latency_s",
      label: "テキスト出現ラグ",
      value: hook.hook_text_latency_s !== undefined
        ? <span className="text-sm font-mono">{hook.hook_text_latency_s.toFixed(2)}s</span>
        : <span className="text-xs text-muted-foreground">—</span>,
      provKey: "hook_text_latency_s",
    },
  ]

  return (
    <Panel title="フック分解 (0-3s)">
      <ul className="space-y-2">
        {rows.map(({ key, label, value, provKey }) => {
          const rowProv = getProvenance(provKey)
          return (
            <li
              key={key}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="text-muted-foreground">{label}</span>
              <div className="flex items-center gap-1.5">
                {value}
                {rowProv && (
                  <span
                    className={`px-1 py-0.5 rounded text-[10px] ${provenanceBadgeClass(rowProv)}`}
                  >
                    {rowProv}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs">
        <span className="text-muted-foreground">confidence</span>
        {conf !== undefined ? (
          <span className={confidenceColor(conf)}>{(conf * 100).toFixed(0)}%</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
    </Panel>
  )
}

// ── virality_features テーブルパネル ──────────────────────────────────────────

function ViralityFeaturesPanel({
  virality,
  fallback,
}: {
  virality: ViralityFeatures | null
  fallback?: string
}) {
  if (fallback || !virality) {
    return (
      <Panel
        title="virality_features"
        badge={fallback ?? "データなし"}
      >
        <p className="text-sm text-muted-foreground">
          {fallback ?? "virality_features がまだ context_json にありません。分析後に表示されます。"}
        </p>
      </Panel>
    )
  }

  const prov = virality._meta?.provenance ?? {}

  type Row = {
    bucket: string
    key: string
    value: string
    conf: number | undefined
    provenance: string | undefined
  }

  const rows: Row[] = []

  if (virality.pacing) {
    const p = virality.pacing
    const bucketProv = prov["pacing"]
    if (p.cuts_per_min !== undefined)
      rows.push({
        bucket: "pacing",
        key: "cuts_per_min",
        value: String(p.cuts_per_min),
        conf: p._confidence,
        provenance: prov["pacing.cuts_per_min"] ?? bucketProv,
      })
    if (p.mean_shot_s !== undefined)
      rows.push({
        bucket: "pacing",
        key: "mean_shot_s",
        value: `${p.mean_shot_s.toFixed(2)}s`,
        conf: p._confidence,
        provenance: prov["pacing.mean_shot_s"] ?? bucketProv,
      })
  }

  if (virality.hook) {
    const h = virality.hook
    const bucketProv = prov["hook"]
    if (h.hook_text_latency_s !== undefined)
      rows.push({
        bucket: "hook",
        key: "hook_text_latency_s",
        value: `${h.hook_text_latency_s.toFixed(2)}s`,
        conf: h._confidence,
        provenance: prov["hook.hook_text_latency_s"] ?? bucketProv,
      })
    if (h.text_on_screen_0_3s !== undefined)
      rows.push({
        bucket: "hook",
        key: "text_on_screen_0_3s",
        value: h.text_on_screen_0_3s ? "あり" : "なし",
        conf: h._confidence,
        provenance: prov["hook.text_on_screen_0_3s"] ?? bucketProv,
      })
    if (h.face_present_0_3s !== undefined)
      rows.push({
        bucket: "hook",
        key: "face_present_0_3s",
        value: h.face_present_0_3s ? "あり" : "なし",
        conf: h._confidence,
        provenance: prov["hook.face_present_0_3s"] ?? bucketProv,
      })
    if (h.audio_rms_spike_0_3s !== undefined)
      rows.push({
        bucket: "hook",
        key: "audio_rms_spike_0_3s",
        value: h.audio_rms_spike_0_3s ? "あり" : "なし",
        conf: h._confidence,
        provenance: prov["hook.audio_rms_spike_0_3s"] ?? bucketProv,
      })
  }

  if (virality.audio) {
    const a = virality.audio
    const bucketProv = prov["audio"]
    if (a.integrated_rms !== undefined)
      rows.push({
        bucket: "audio",
        key: "integrated_rms",
        value: a.integrated_rms.toFixed(3),
        conf: a._confidence,
        provenance: prov["audio.integrated_rms"] ?? bucketProv,
      })
  }

  if (virality.text) {
    const t = virality.text
    const bucketProv = prov["text"]
    if (t.caption_coverage_pct !== undefined)
      rows.push({
        bucket: "text",
        key: "caption_coverage_pct",
        value: `${t.caption_coverage_pct}%`,
        conf: t._confidence,
        provenance: prov["text.caption_coverage_pct"] ?? bucketProv,
      })
    if (t.text_density_rate !== undefined)
      rows.push({
        bucket: "text",
        key: "text_density_rate",
        value: t.text_density_rate.toFixed(3),
        conf: t._confidence,
        provenance: prov["text.text_density_rate"] ?? bucketProv,
      })
  }

  const schemaV = virality._meta?.schema_v

  return (
    <Panel
      title="virality_features"
      badge={schemaV !== undefined ? `schema_v ${schemaV}` : undefined}
    >
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">フィールドなし</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left py-1.5 pr-3 font-medium">bucket</th>
                <th className="text-left py-1.5 pr-3 font-medium">key</th>
                <th className="text-right py-1.5 pr-3 font-medium">value</th>
                <th className="text-right py-1.5 pr-2 font-medium">conf</th>
                <th className="text-left py-1.5 font-medium">provenance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-1.5 pr-3">
                    <span className="px-1.5 py-0.5 rounded text-xs bg-muted text-muted-foreground">
                      {row.bucket}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-xs">{row.key}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-xs">
                    {row.value}
                  </td>
                  <td
                    className={`py-1.5 pr-2 text-right text-xs font-medium ${confidenceColor(row.conf)}`}
                  >
                    {row.conf !== undefined ? `${(row.conf * 100).toFixed(0)}%` : "—"}
                  </td>
                  <td className="py-1.5">
                    {row.provenance && (
                      <span
                        className={`px-1 py-0.5 rounded text-[10px] ${provenanceBadgeClass(row.provenance)}`}
                      >
                        {row.provenance}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        confidence ≥90% = 緑 / ≥75% = 黄 / それ以下 = 灰。creator-prior = 灰バッジ、検証済み = 緑バッジ。
      </p>
    </Panel>
  )
}

// ── ViralRecipe 保存 ──────────────────────────────────────────────────────────

function ViralRecipeSavePanel({
  library,
  itemId,
  itemName,
  curve,
  virality,
  transcript,
}: {
  library: string
  itemId: string
  itemName: string
  curve: number[]
  virality: ViralityFeatures | null
  transcript: TranscriptResult | null
}) {
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      // hook / pacing / excitement の要約をテキストとして組み立てる
      const hookSummary = virality?.hook
        ? {
            hook_text_latency_s: virality.hook.hook_text_latency_s,
            text_on_screen_0_3s: virality.hook.text_on_screen_0_3s,
            face_present_0_3s: virality.hook.face_present_0_3s,
            audio_rms_spike_0_3s: virality.hook.audio_rms_spike_0_3s,
            confidence: virality.hook._confidence,
          }
        : null

      const pacingSummary = virality?.pacing
        ? {
            cuts_per_min: virality.pacing.cuts_per_min,
            mean_shot_s: virality.pacing.mean_shot_s,
            confidence: virality.pacing._confidence,
          }
        : null

      // excitement 曲線の基本統計
      const excitementSummary =
        curve.length > 0
          ? {
              length_sec: curve.length,
              mean_rms: Number((curve.reduce((a, b) => a + b, 0) / curve.length).toFixed(4)),
              peak_rms: Number(Math.max(...curve).toFixed(4)),
              hook_mean_rms:
                curve.length > 3
                  ? Number((curve.slice(0, 3).reduce((a, b) => a + b, 0) / 3).toFixed(4))
                  : null,
            }
          : null

      // 最初のセグメントからフックテキスト
      const hookText = transcript?.segments?.[0]?.text ?? null

      const recipe = {
        source_library: library,
        source_item_id: itemId,
        source_item_name: itemName,
        created_at: new Date().toISOString(),
        hook: hookSummary,
        pacing: pacingSummary,
        excitement: excitementSummary,
        hook_text: hookText,
        schema_v: 1,
      }

      const text = JSON.stringify(recipe, null, 2)
      const name = `viral-recipe:${itemName.slice(0, 40)}`

      // pool_add_text Tauri コマンドで専用ライブラリに保存
      const result = (await invoke("pool_add_text", {
        library: "akari-recipes",
        text,
        name,
        contextJson: {
          source_app: "akari-lens",
          source_item_id: itemId,
          item_type: "viral_recipe",
        },
      })) as { id: string }

      setSavedId(result?.id ?? "saved")
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }, [library, itemId, itemName, curve, virality, transcript])

  if (savedId) {
    return (
      <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
        ✓ ViralRecipe を akari-recipes に保存しました（id: {savedId}）
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => { void handleSave() }}
        disabled={saving}
        className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? "保存中…" : "ViralRecipe を保存"}
      </button>
      <span className="text-xs text-muted-foreground">
        hook / pacing / excitement の要約を akari-recipes ライブラリに保存します
      </span>
      {error && (
        <span className="text-xs text-destructive">{error}</span>
      )}
    </div>
  )
}

// ── 結果表示ビュー ─────────────────────────────────────────────────────────────

function ResultView({
  library,
  itemId,
  itemFull,
  analysis,
  transcript,
  onReset,
}: {
  library: string
  itemId: string
  itemFull: PoolItemFull
  analysis: AnalysisResult
  transcript: TranscriptResult
  onReset: () => void
}) {
  const excitementCurve = extractExcitementCurve(itemFull.context_json)
  const virality = extractViralityFeatures(itemFull.context_json)

  // 未分析フォールバックメッセージ
  const isUnanalyzed = !itemFull.analyzed_at
  const fallbackMsg = isUnanalyzed ? "未分析（まず分析を実行してください）" : undefined

  return (
    <>
      {/* 上段: excitement 曲線（全幅） */}
      <ExcitementCurvePanel curve={excitementCurve} fallback={fallbackMsg} />

      {/* 中段: 2 カラム — transcript / keyframes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TranscriptPanel data={transcript} />
        <KeyframesPanel
          keyframes={analysis.keyframes}
          descriptions={analysis.keyframe_descriptions}
          fallback={fallbackMsg}
        />
      </div>

      {/* 下段: 2 カラム — hook 分解 / virality_features */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HookBreakdownPanel virality={virality} fallback={fallbackMsg} />
        <ViralityFeaturesPanel virality={virality} fallback={fallbackMsg} />
      </div>

      {/* ViralRecipe 保存 */}
      {!isUnanalyzed && (
        <ViralRecipeSavePanel
          library={library}
          itemId={itemId}
          itemName={itemFull.name}
          curve={excitementCurve}
          virality={virality}
          transcript={transcript}
        />
      )}

      {/* 別の動画を選ぶ */}
      <div className="flex justify-center pb-4">
        <button
          onClick={onReset}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
        >
          別の動画を選ぶ
        </button>
      </div>
    </>
  )
}

// ── メインコンポーネント ──────────────────────────────────────────────────────

export default function AkariLensApp() {
  const [phase, setPhase] = useState<AppPhase>({ kind: "idle" })
  const pendingRef = useRef<{ library: string; itemId: string } | null>(null)

  // akari:pool-analyze-complete を購読してデータを取得する
  useEffect(() => {
    const onComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ library?: string; itemId?: string }>).detail
      const pending = pendingRef.current
      if (!pending) return
      if (detail?.itemId !== pending.itemId) return

      const { library, itemId } = pending
      pendingRef.current = null

      // データを並列取得
      Promise.all([
        getItem(library, itemId) as Promise<PoolItemFull>,
        callToolJson<AnalysisResult>("pool_get_analysis", {
          library,
          item_id: itemId,
        }),
        callToolJson<TranscriptResult>("pool_get_transcript", {
          library,
          item_id: itemId,
        }),
      ])
        .then(([itemFull, analysis, transcript]) => {
          setPhase({
            kind: "done",
            library,
            itemId,
            itemFull,
            analysis,
            transcript,
          })
        })
        .catch((e) => {
          setPhase({ kind: "error", message: String(e) })
        })
    }

    window.addEventListener("akari:pool-analyze-complete", onComplete)
    return () => window.removeEventListener("akari:pool-analyze-complete", onComplete)
  }, [])

  /** 動画を選択して分析を依頼する */
  const handleItemSelect = useCallback(
    (library: string, item: PoolItemSummary) => {
      // すでに分析済みならそのまま取得
      if (item.analyzed_at) {
        setPhase({
          kind: "analyzing",
          library,
          itemId: item.id,
          itemName: item.name,
        })
        pendingRef.current = { library, itemId: item.id }
        // 分析完了を模倣 (すでに完了済みなのでイベントが来ないため直接取得)
        Promise.all([
          getItem(library, item.id) as Promise<PoolItemFull>,
          callToolJson<AnalysisResult>("pool_get_analysis", {
            library,
            item_id: item.id,
          }),
          callToolJson<TranscriptResult>("pool_get_transcript", {
            library,
            item_id: item.id,
          }),
        ])
          .then(([itemFull, analysis, transcript]) => {
            pendingRef.current = null
            setPhase({
              kind: "done",
              library,
              itemId: item.id,
              itemFull,
              analysis,
              transcript,
            })
          })
          .catch((e) => {
            pendingRef.current = null
            setPhase({ kind: "error", message: String(e) })
          })
        return
      }

      // 未分析: 分析依頼を発火し、完了イベントを待つ
      pendingRef.current = { library, itemId: item.id }
      setPhase({
        kind: "analyzing",
        library,
        itemId: item.id,
        itemName: item.name,
      })
      window.dispatchEvent(
        new CustomEvent("akari:pool-analyze-request", {
          detail: { library, itemId: item.id, itemIds: [item.id] },
        }),
      )
    },
    [],
  )

  const handleReset = useCallback(() => {
    pendingRef.current = null
    setPhase({ kind: "idle" })
  }, [])

  // ── ヘッダ ──────────────────────────────────────────────────────────────────
  const selectedName =
    phase.kind === "analyzing"
      ? phase.itemName
      : phase.kind === "done"
        ? phase.itemFull.name
        : null

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ヘッダ */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur-sm px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <span className="text-lg font-bold">Akari Lens</span>
          <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 font-medium">
            dev only
          </span>
          {/* 選択中の素材 */}
          <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
            {selectedName && <span className="truncate max-w-64">{selectedName}</span>}
            {phase.kind === "analyzing" && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
                分析中…
              </span>
            )}
            {phase.kind === "idle" && (
              <button
                onClick={() => setPhase({ kind: "picking" })}
                className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
              >
                動画を選択
              </button>
            )}
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* idle: 開始プロンプト */}
        {phase.kind === "idle" && (
          <div className="flex flex-col items-center justify-center py-24 gap-6">
            <p className="text-muted-foreground text-sm">
              分析する動画を pool から選択してください
            </p>
            <button
              onClick={() => setPhase({ kind: "picking" })}
              className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              動画を選択
            </button>
          </div>
        )}

        {/* analyzing: ローディング */}
        {phase.kind === "analyzing" && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-8 h-8 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
            <p className="text-sm text-muted-foreground">
              「{phase.itemName}」を分析中…
            </p>
            <p className="text-xs text-muted-foreground">
              shell の分析ドロワーを確認してください
            </p>
          </div>
        )}

        {/* error */}
        {phase.kind === "error" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-6 py-4">
            <p className="text-sm text-destructive font-medium mb-1">エラーが発生しました</p>
            <p className="text-xs text-destructive/70">{phase.message}</p>
            <button
              onClick={handleReset}
              className="mt-3 text-xs underline text-muted-foreground hover:text-foreground"
            >
              リセット
            </button>
          </div>
        )}

        {/* done: 可視化 */}
        {phase.kind === "done" && (
          <ResultView
            library={phase.library}
            itemId={phase.itemId}
            itemFull={phase.itemFull}
            analysis={phase.analysis}
            transcript={phase.transcript}
            onReset={handleReset}
          />
        )}
      </main>

      {/* 動画選択モーダル */}
      {phase.kind === "picking" && (
        <PoolItemPicker
          onSelect={(lib, item) => {
            handleItemSelect(lib, item)
          }}
          onClose={handleReset}
        />
      )}
    </div>
  )
}
