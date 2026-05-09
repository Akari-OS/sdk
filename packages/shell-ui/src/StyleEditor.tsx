/**
 * @file StyleEditor.tsx
 * AKARI-HUB-073 Phase 1 (T-3): Style 3 層編集 UI。
 *
 * 役割:
 *   - StyleAsset の 3 層（reference_assets / extracted_rules / human_overrides）を
 *     1 画面で同時に編集できる pure component（モーダル禁止 / 画面遷移なし — RULES.md
 *     ルール 9 / 11）
 *   - 上部ヘッダ: Style 表示名（任意）/ domain badge / version badge / extract trigger
 *   - 中段以降: 3 層のセクションを縦に積み、それぞれが折りたたみ可能
 *     - reference_assets : D&D drop zone + ID 直入力で追加 / 行ごとに削除
 *     - extracted_rules  : 各 rule に対し approve / reject の inline チップ + confidence 表示
 *     - human_overrides  : 自然言語ルールの inline edit 一覧 + 追加 input
 *   - 全更新は immutable で `onChange` に新 StyleAsset を渡す（WorkflowEditor 流儀）
 *
 * 設計指針:
 *   - presentational only — fetch / persist は外側責任
 *   - confidence < 0.5 の rule は spec §9 Risks に従い既定では未提案扱い。本 UI では
 *     toggle で表示できる（透明度を落として表示し、誤承認を防ぐ）
 *   - 削除は 2 回押し inline confirm（モーダル不使用）
 *   - D&D は HTML5 drag/drop イベントを使用（外側から `text/plain` で asset id を渡す
 *     simple contract。HUB-058 の Common Heavy Source は将来統合予定）
 *   - Variant Signal 関連 (`signal_score` / cross-Variant 比較 / VariantUsage) は v0.2.0
 *     T-14〜T-18 担当。Phase 1 では本 component に含めない（types/style.ts も同様）
 *
 * 関連 spec / ADR:
 *   - spec-style-management-ui-learning-loop (AKARI-HUB-073) §3 AC-1〜AC-5 / §6 / §7 T-3
 *   - ADR-094 (Asset Tier — Style は tier: 'canonical' / weight: 1.0 固定)
 *   - ADR-095 (Style as Asset Subtype)
 *   - ADR-079 (Pool 統合)
 *   - HUB-072 Phase 1 (WorkflowEditor) で確立した shell-ui component pattern を踏襲
 */

import * as React from "react"
import { useCallback, useId, useMemo, useState } from "react"
import { cn } from "./lib/cn"
import { Button } from "./button"
import type {
  ExtractedRule,
  StyleAsset,
  StyleDomain,
} from "./types/style"

// ─── 定数 ──────────────────────────────────────────────────────────────────

/**
 * domain badge の色（StylePanel と完全一致させる — 2 component 間で見た目を
 * 揃えるため、配色は重複定義しても 1:1 で同期させる方針）。
 */
const DOMAIN_COLORS: Record<StyleDomain, string> = {
  video: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  writing: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  design: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  voice: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  mixed: "bg-amber-500/15 text-amber-300 border-amber-500/30",
}

/** UI ラベル（日本語） */
const DOMAIN_LABEL_JA: Record<StyleDomain, string> = {
  video: "動画",
  writing: "文章",
  design: "デザイン",
  voice: "声",
  mixed: "混合",
}

/** domain 選択肢の順（StylePanel.STYLE_DOMAIN_FILTER_ORDER と同期） */
const DOMAIN_ORDER: readonly StyleDomain[] = [
  "video",
  "writing",
  "design",
  "voice",
  "mixed",
] as const

/**
 * confidence 閾値（spec §9 Risks: 0.5 未満は提案しない）。
 * 既定では未満の rule を非表示にし、toggle で表示できる。
 */
const CONFIDENCE_PROPOSE_THRESHOLD = 0.5

const INPUT_CLS =
  "rounded-md border border-border bg-input/30 px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"

const TEXTAREA_CLS =
  "rounded-md border border-border bg-input/30 px-2 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y disabled:opacity-50"

// ─── UI 表示用 Style 拡張 ─────────────────────────────────────────────────

/**
 * UI 表示用の StyleAsset 拡張（intersection で `name?` を追加）。
 *
 * 正典 `StyleAsset`（`./types/style`）は `name` を持たず、表示名は Asset.name に
 * 紐づく。StyleEditor 単独で「表示名を編集できる」UX を提供するため、UI レイヤで
 * `name?: string` を intersection で受け取る。Asset 連携時は外側で Asset.name と
 * 双方向同期する想定（WorkflowEditor の `WorkflowEditorWorkflow` と同じ流儀）。
 */
export type StyleEditorStyle = StyleAsset & {
  /** UI 表示名（Asset.name 同期想定） */
  name?: string
}

// ─── Props ─────────────────────────────────────────────────────────────────

/** StyleEditor の Props */
export interface StyleEditorProps {
  /** 編集対象の Style（UI 表示用 `name?` 拡張を受ける） */
  style: StyleEditorStyle
  /** 変更時 callback（immutable に新 Style 全体を返す流儀） */
  onChange: (next: StyleEditorStyle) => void
  /**
   * 「+ 抽出 trigger」ボタンが押された時に発火（T-5 担当 — TM-C）。
   * 省略すると trigger ボタン自体が非表示になる。
   */
  onExtractTrigger?: () => void
  /**
   * reference_assets の Asset ID から表示名を解決する（StylePanel.resolveStyleName と
   * 同流儀）。省略時は ID をそのまま表示。
   */
  resolveAssetName?: (assetId: string) => string
  /**
   * Drop zone で受け取る MIME types（既定 `text/plain`）。
   * shell 側で別 MIME（`application/x-akari-asset` 等）を採用する場合に override。
   */
  dropMimeTypes?: readonly string[]
  /** read-only モード（trace 表示等） */
  readOnly?: boolean
  className?: string
}

// ─── 内部小物 ──────────────────────────────────────────────────────────────

/** domain badge — StylePanel と同じ流儀で行内に表示 */
function DomainBadge({
  domain,
  className,
}: {
  domain: StyleDomain
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-medium leading-none whitespace-nowrap select-none",
        DOMAIN_COLORS[domain],
        className,
      )}
    >
      {DOMAIN_LABEL_JA[domain]}
    </span>
  )
}

/** version badge（"v1.2.3" 表示） */
function VersionBadge({ version }: { version: string }) {
  return (
    <code
      className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] font-mono leading-none text-foreground/70"
      title={`version ${version}`}
    >
      v{version}
    </code>
  )
}

/** confidence pill（0.0–1.0 を背景濃度 + 数値表示） */
function ConfidencePill({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  // 4 段階: ≥0.75 緑 / ≥0.5 amber / ≥0.25 orange / それ未満は灰
  const tier =
    confidence >= 0.75
      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
      : confidence >= 0.5
        ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
        : confidence >= 0.25
          ? "bg-orange-500/15 text-orange-300 border-orange-500/30"
          : "bg-muted/50 text-muted-foreground border-border"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-medium leading-none whitespace-nowrap select-none tabular-nums",
        tier,
      )}
      title={`confidence ${pct}%`}
    >
      {pct}%
    </span>
  )
}

/**
 * セクション折りたたみヘッダ。タイトル + バッジ + 折りたたみ▼/▶ をまとめる。
 * children に右寄せボタン群を差し込める（reference 追加 / Add override 等）。
 */
function SectionHeader({
  title,
  count,
  collapsed,
  onToggle,
  hint,
  children,
}: {
  title: string
  count: number
  collapsed: boolean
  onToggle: () => void
  hint?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground transition"
      >
        <span aria-hidden="true">{collapsed ? "▶" : "▼"}</span>
        <span>{title}</span>
        <span className="rounded bg-muted/50 px-1 py-px text-[9px] tabular-nums leading-none">
          {count}
        </span>
      </button>
      {hint && (
        <span className="text-[9px] text-muted-foreground/70">{hint}</span>
      )}
      <div className="ml-auto flex items-center gap-1.5">{children}</div>
    </div>
  )
}

// ─── 1: Style Header ─────────────────────────────────────────────────────

interface StyleHeaderProps {
  style: StyleEditorStyle
  onChange: (next: StyleEditorStyle) => void
  onExtractTrigger?: () => void
  readOnly: boolean
}

/**
 * 上部ヘッダ。Style 表示名 / domain selector / version / parent_version / 抽出 trigger。
 * 全項目を inline で編集（モーダル不使用）。
 */
function StyleHeader({
  style,
  onChange,
  onExtractTrigger,
  readOnly,
}: StyleHeaderProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card/30 p-3">
      {/* 上段: 表示名 + domain badge + version */}
      <div className="flex flex-wrap items-center gap-2">
        <DomainBadge domain={style.domain} />
        <input
          id={`${id}-name`}
          type="text"
          disabled={readOnly}
          value={style.name ?? ""}
          placeholder="（未設定）"
          aria-label="Style 表示名"
          onChange={(e) =>
            onChange({ ...style, name: e.target.value || undefined })
          }
          className={cn(
            INPUT_CLS,
            "min-w-[12rem] flex-1 text-sm font-medium",
          )}
        />
        <VersionBadge version={style.version} />
        {!readOnly && onExtractTrigger && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExtractTrigger}
            title="reference_assets から rule 候補を AI 抽出（spec AC-11）"
          >
            + 抽出
          </Button>
        )}
      </div>

      {/* 下段: domain 選択 + parent_version + Style ID */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {/* domain 選択（filter 同流儀の inline chips） */}
        <div className="col-span-2 sm:col-span-3 flex flex-col gap-1">
          <label
            htmlFor={`${id}-domain`}
            className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            domain
          </label>
          <div
            id={`${id}-domain`}
            role="radiogroup"
            aria-label="Style domain"
            className="flex flex-wrap gap-1.5"
          >
            {DOMAIN_ORDER.map((d) => {
              const isActive = d === style.domain
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  disabled={readOnly}
                  aria-checked={isActive}
                  onClick={() => onChange({ ...style, domain: d })}
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition active:scale-95",
                    DOMAIN_COLORS[d],
                    isActive
                      ? "ring-1 ring-primary/60 bg-opacity-100"
                      : "opacity-60 hover:opacity-100",
                    readOnly && "cursor-not-allowed",
                  )}
                >
                  {DOMAIN_LABEL_JA[d]}
                </button>
              )
            })}
          </div>
        </div>

        {/* version (read-only) */}
        <div className="flex flex-col gap-1">
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            version
          </p>
          <code className="rounded bg-muted/50 px-1.5 py-1 text-[10px] text-foreground/70">
            {style.version}
          </code>
        </div>

        {/* parent_version (read-only) */}
        <div className="flex flex-col gap-1">
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            parent
          </p>
          <code className="rounded bg-muted/50 px-1.5 py-1 text-[10px] text-foreground/70">
            {style.parent_version ?? "—"}
          </code>
        </div>

        {/* Style ID (read-only) */}
        <div className="flex flex-col gap-1">
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            id
          </p>
          <code
            className="truncate rounded bg-muted/50 px-1.5 py-1 text-[10px] text-foreground/70"
            title={style.id}
          >
            {style.id}
          </code>
        </div>
      </div>
    </div>
  )
}

// ─── 2: reference_assets section ─────────────────────────────────────────

interface ReferenceAssetsSectionProps {
  references: string[]
  onChange: (next: string[]) => void
  resolveAssetName?: (assetId: string) => string
  dropMimeTypes: readonly string[]
  readOnly: boolean
}

/**
 * reference_assets 編集セクション。
 *   - D&D drop zone: 外側で `dataTransfer.setData(mime, assetId)` した DragEvent を受け取り、
 *     重複排除して reference_assets に追加（複数行 / 改行区切りで複数 ID も受理）
 *   - inline 入力欄: ID を直接ペーストして追加（Enter / "+追加" ボタン）
 *   - 一覧: 1 行ごとに「× 削除」ボタン
 *
 * モーダル禁止（spec AC-1）/ 削除は 1 click（reference は再追加が容易のため inline 直削除）。
 */
function ReferenceAssetsSection({
  references,
  onChange,
  resolveAssetName,
  dropMimeTypes,
  readOnly,
}: ReferenceAssetsSectionProps) {
  const inputId = useId()
  const [draftId, setDraftId] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)

  const addId = useCallback(
    (raw: string) => {
      const id = raw.trim()
      if (!id) return
      if (references.includes(id)) return
      onChange([...references, id])
    },
    [references, onChange],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragOver(false)
      if (readOnly) return
      // 試行する MIME types を順に走査して最初に取れた値を使う
      let payload = ""
      for (const mime of dropMimeTypes) {
        const v = e.dataTransfer.getData(mime)
        if (v) {
          payload = v
          break
        }
      }
      if (!payload) return
      // 改行 / カンマ / スペースで複数 ID も受理
      const ids = payload
        .split(/[\n,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      const merged = Array.from(new Set([...references, ...ids]))
      onChange(merged)
    },
    [references, onChange, readOnly, dropMimeTypes],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      if (readOnly) return
      e.preventDefault()
      e.dataTransfer.dropEffect = "copy"
      setIsDragOver(true)
    },
    [readOnly],
  )

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleSubmitDraft = useCallback(() => {
    addId(draftId)
    setDraftId("")
  }, [addId, draftId])

  return (
    <div className="flex flex-col gap-2">
      {/* 一覧 */}
      <div className="flex flex-col gap-1">
        {references.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">
            reference がまだありません。下の drop zone か入力欄から追加してください。
          </p>
        ) : (
          references.map((assetId) => {
            const display = resolveAssetName ? resolveAssetName(assetId) : assetId
            return (
              <div
                key={assetId}
                className="flex items-center gap-2 rounded-md border border-border bg-card/30 px-2.5 py-1.5"
              >
                <span aria-hidden="true" className="text-muted-foreground">
                  📎
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-foreground">
                    {display}
                  </p>
                  {display !== assetId && (
                    <p
                      className="truncate font-mono text-[9px] text-muted-foreground"
                      title={assetId}
                    >
                      {assetId}
                    </p>
                  )}
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() =>
                      onChange(references.filter((r) => r !== assetId))
                    }
                    aria-label="reference を削除"
                    className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* drop zone + 入力欄（読み取り専用なら非表示） */}
      {!readOnly && (
        <>
          <div
            role="region"
            aria-label="Asset drop zone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              "rounded-md border-2 border-dashed px-3 py-4 text-center text-[11px] transition",
              isDragOver
                ? "border-primary/60 bg-primary/5 text-foreground"
                : "border-border bg-card/10 text-muted-foreground",
            )}
          >
            ここに Asset をドロップ（複数 ID は改行 / カンマ区切りで OK）
          </div>

          {/* inline ID 直入力 */}
          <div className="flex items-center gap-2">
            <label htmlFor={inputId} className="sr-only">
              Asset ID を入力
            </label>
            <input
              id={inputId}
              type="text"
              value={draftId}
              placeholder="Asset ID を貼り付けて Enter / +追加"
              onChange={(e) => setDraftId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleSubmitDraft()
                }
              }}
              className={cn(INPUT_CLS, "flex-1")}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSubmitDraft}
              disabled={!draftId.trim()}
            >
              +追加
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── 3: extracted_rules section ──────────────────────────────────────────

interface ExtractedRulesSectionProps {
  rules: ExtractedRule[]
  onChange: (next: ExtractedRule[]) => void
  resolveAssetName?: (assetId: string) => string
  showLowConfidence: boolean
  onToggleLowConfidence: () => void
  readOnly: boolean
}

/** 単一 rule 行 — approve / reject / edit / source 表示を統合 */
function RuleRow({
  rule,
  onChange,
  onRemove,
  resolveAssetName,
  readOnly,
  isLowConfidence,
}: {
  rule: ExtractedRule
  onChange: (next: ExtractedRule) => void
  onRemove: () => void
  resolveAssetName?: (assetId: string) => string
  readOnly: boolean
  isLowConfidence: boolean
}) {
  const id = useId()
  const [confirmRemove, setConfirmRemove] = useState(false)
  // rule 切替時に confirm state リセット
  React.useEffect(() => {
    setConfirmRemove(false)
  }, [rule.id])

  const handleApprove = useCallback(() => {
    onChange({
      ...rule,
      approved: true,
      approved_at: new Date().toISOString(),
    })
  }, [rule, onChange])

  const handleReject = useCallback(() => {
    // approved=false の rule はそのまま残しつつ approved 情報をクリア。
    // 完全削除したい場合は × ボタンで onRemove を使う（ユーザに選ばせる）。
    onChange({
      ...rule,
      approved: false,
      approved_at: undefined,
      approved_by: undefined,
    })
  }, [rule, onChange])

  const handleRemove = useCallback(() => {
    if (confirmRemove) onRemove()
    else setConfirmRemove(true)
  }, [confirmRemove, onRemove])

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border px-2.5 py-2 transition",
        rule.approved
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-border bg-card/30",
        isLowConfidence && "opacity-60",
      )}
    >
      {/* ヘッダ: confidence + status + source */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ConfidencePill confidence={rule.confidence} />
        {rule.approved ? (
          <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-1.5 py-px text-[9px] font-medium leading-none text-emerald-300">
            approved
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border border-border bg-muted/40 px-1.5 py-px text-[9px] font-medium leading-none text-muted-foreground">
            pending
          </span>
        )}
        {isLowConfidence && (
          <span
            className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[9px] font-medium leading-none text-amber-300"
            title={`confidence < ${CONFIDENCE_PROPOSE_THRESHOLD * 100}% は spec §9 Risks に従い既定で低提案`}
          >
            low confidence
          </span>
        )}
        {rule.approved_at && (
          <span
            className="text-[9px] text-muted-foreground"
            title={`approved at ${rule.approved_at}${rule.approved_by ? ` by ${rule.approved_by}` : ""}`}
          >
            {new Date(rule.approved_at).toLocaleDateString()}
          </span>
        )}
        <code
          className="ml-auto truncate font-mono text-[9px] text-muted-foreground"
          title={rule.id}
        >
          {rule.id}
        </code>
      </div>

      {/* rule 本文（inline edit 可。重要な編集ではないが、誤字訂正等に使う） */}
      <textarea
        id={`${id}-rule`}
        disabled={readOnly}
        rows={2}
        value={rule.rule}
        onChange={(e) => onChange({ ...rule, rule: e.target.value })}
        className={TEXTAREA_CLS}
        placeholder="rule 本文（自然言語）"
      />

      {/* source assets traceability */}
      {rule.source_assets.length > 0 && (
        <details className="text-[10px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            source ({rule.source_assets.length})
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5 pl-3">
            {rule.source_assets.map((assetId) => (
              <li
                key={assetId}
                className="truncate font-mono text-muted-foreground"
                title={assetId}
              >
                {resolveAssetName ? resolveAssetName(assetId) : assetId}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* 操作ボタン群 */}
      {!readOnly && (
        <div className="flex flex-wrap gap-1.5">
          {rule.approved ? (
            <Button
              variant="outline"
              size="xs"
              onClick={handleReject}
              title="承認を取り消す（rule は残るが適用されない）"
            >
              承認取消
            </Button>
          ) : (
            <Button
              variant="default"
              size="xs"
              onClick={handleApprove}
              title="この rule を承認して適用する（spec AC-4）"
            >
              ✓ 承認
            </Button>
          )}
          <Button
            variant={confirmRemove ? "destructive" : "outline"}
            size="xs"
            onClick={handleRemove}
            onBlur={() => setConfirmRemove(false)}
            title="rule を削除（再抽出で復活する可能性あり）"
          >
            {confirmRemove ? "もう一度押すと削除" : "削除"}
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * extracted_rules 編集セクション。
 *   - rule ごとに行表示。inline で approve / reject / 削除 / 文言修正
 *   - confidence pill で base confidence を可視化
 *   - confidence < 0.5 の rule は既定では半透明 + low confidence badge を出し、
 *     表示自体は維持（spec §9 Risks に従い「提案しない」=「承認候補にしない」だが、
 *     既存 rule の表示は保持して rollback / 再評価できるようにする）
 *   - 「全 approve」「全 reject」のバルク操作を提供（誤操作軽減のため undo 用 hint）
 */
function ExtractedRulesSection({
  rules,
  onChange,
  resolveAssetName,
  showLowConfidence,
  onToggleLowConfidence,
  readOnly,
}: ExtractedRulesSectionProps) {
  const lowCount = useMemo(
    () =>
      rules.filter((r) => r.confidence < CONFIDENCE_PROPOSE_THRESHOLD).length,
    [rules],
  )

  const visibleRules = useMemo(() => {
    if (showLowConfidence) return rules
    return rules.filter((r) => r.confidence >= CONFIDENCE_PROPOSE_THRESHOLD)
  }, [rules, showLowConfidence])

  const handleRuleChange = useCallback(
    (next: ExtractedRule) => {
      onChange(rules.map((r) => (r.id === next.id ? next : r)))
    },
    [rules, onChange],
  )

  const handleRuleRemove = useCallback(
    (id: string) => onChange(rules.filter((r) => r.id !== id)),
    [rules, onChange],
  )

  const handleApproveAll = useCallback(() => {
    const ts = new Date().toISOString()
    const next = rules.map((r) =>
      r.approved || r.confidence < CONFIDENCE_PROPOSE_THRESHOLD
        ? r
        : { ...r, approved: true, approved_at: ts },
    )
    onChange(next)
  }, [rules, onChange])

  const handleRejectAll = useCallback(() => {
    const next = rules.map((r) =>
      r.approved
        ? {
            ...r,
            approved: false,
            approved_at: undefined,
            approved_by: undefined,
          }
        : r,
    )
    onChange(next)
  }, [rules, onChange])

  return (
    <div className="flex flex-col gap-2">
      {/* バルク操作 + low confidence toggle */}
      {!readOnly && rules.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={handleApproveAll}
            title="confidence ≥ 50% の未承認 rule を一括承認"
          >
            全 ✓ 承認
          </Button>
          <Button
            variant="outline"
            size="xs"
            onClick={handleRejectAll}
            title="承認済み rule を一括取り消し"
          >
            全承認取消
          </Button>
          {lowCount > 0 && (
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[10px] text-muted-foreground">
              <input
                type="checkbox"
                checked={showLowConfidence}
                onChange={onToggleLowConfidence}
                className="accent-primary"
              />
              low confidence 表示 ({lowCount})
            </label>
          )}
        </div>
      )}

      {/* 一覧 */}
      <div className="flex flex-col gap-1.5">
        {visibleRules.length === 0 ? (
          <p className="px-1 py-2 text-[11px] text-muted-foreground">
            {rules.length === 0
              ? "rule がまだありません。reference を追加 → 「+ 抽出」で AI 提案を生成してください。"
              : `low confidence のみのため非表示。「low confidence 表示」で確認できます (${lowCount})`}
          </p>
        ) : (
          visibleRules.map((rule) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              onChange={handleRuleChange}
              onRemove={() => handleRuleRemove(rule.id)}
              resolveAssetName={resolveAssetName}
              readOnly={readOnly}
              isLowConfidence={rule.confidence < CONFIDENCE_PROPOSE_THRESHOLD}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── 4: human_overrides section ──────────────────────────────────────────

interface HumanOverridesSectionProps {
  overrides: string[]
  onChange: (next: string[]) => void
  readOnly: boolean
}

/** 1 行 override を inline edit + 削除する小行 */
function OverrideRow({
  text,
  onChange,
  onRemove,
  readOnly,
  index,
}: {
  text: string
  onChange: (next: string) => void
  onRemove: () => void
  readOnly: boolean
  index: number
}) {
  const [confirmRemove, setConfirmRemove] = useState(false)
  // text/index 切替で confirm リセット（同じ row の再描画 ≠ 別 row）
  React.useEffect(() => {
    setConfirmRemove(false)
  }, [index])

  return (
    <div className="flex items-start gap-2 rounded-md border border-border bg-card/30 px-2.5 py-1.5">
      <span
        className="mt-1.5 w-5 shrink-0 text-center tabular-nums text-[10px] text-muted-foreground"
        aria-hidden="true"
      >
        {index + 1}
      </span>
      <textarea
        rows={1}
        disabled={readOnly}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        className={cn(TEXTAREA_CLS, "flex-1")}
        placeholder="自然言語ルール（例: 「常に敬語で」「絵文字は使わない」）"
      />
      {!readOnly && (
        <button
          type="button"
          onClick={() => {
            if (confirmRemove) onRemove()
            else setConfirmRemove(true)
          }}
          onBlur={() => setConfirmRemove(false)}
          aria-label="override を削除"
          title={confirmRemove ? "もう一度押すと削除" : "削除"}
          className={cn(
            "mt-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition",
            confirmRemove
              ? "bg-destructive/20 text-destructive"
              : "hover:bg-destructive/20 hover:text-destructive",
          )}
        >
          ×
        </button>
      )}
    </div>
  )
}

/**
 * human_overrides 編集セクション。
 *   - 1 行 = 1 自然言語ルール。inline edit 可（textarea で auto-grow）
 *   - 末尾に「+ override 追加」ボタンで空行を append
 *   - 削除は 2 回押し inline confirm（モーダル不使用）
 *
 * spec AC-5: human_overrides は人間の意思を最強優先する layer のため、承認フラグなし。
 */
function HumanOverridesSection({
  overrides,
  onChange,
  readOnly,
}: HumanOverridesSectionProps) {
  const handleChangeAt = useCallback(
    (idx: number, next: string) => {
      const arr = [...overrides]
      arr[idx] = next
      onChange(arr)
    },
    [overrides, onChange],
  )

  const handleRemoveAt = useCallback(
    (idx: number) => {
      onChange(overrides.filter((_, i) => i !== idx))
    },
    [overrides, onChange],
  )

  const handleAdd = useCallback(() => {
    onChange([...overrides, ""])
  }, [overrides, onChange])

  return (
    <div className="flex flex-col gap-2">
      {overrides.length === 0 ? (
        <p className="px-1 py-2 text-[11px] text-muted-foreground">
          override がまだありません。「+ override 追加」で人間の意思を直接書き込めます。
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {overrides.map((text, idx) => (
            <OverrideRow
              key={idx}
              index={idx}
              text={text}
              onChange={(next) => handleChangeAt(idx, next)}
              onRemove={() => handleRemoveAt(idx)}
              readOnly={readOnly}
            />
          ))}
        </div>
      )}
      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          className="self-start"
        >
          + override 追加
        </Button>
      )}
    </div>
  )
}

// ─── StyleEditor (main) ──────────────────────────────────────────────────

const DEFAULT_DROP_MIME_TYPES: readonly string[] = [
  "application/x-akari-asset-id",
  "text/plain",
] as const

/**
 * Style 3 層編集 UI（AKARI-HUB-073 §3 AC-1〜AC-5 / §6 / §7 T-3）。
 *
 *   - 上: StyleHeader（domain badge / 表示名 / version / 抽出 trigger）
 *   - 中段以降: 3 層（reference_assets / extracted_rules / human_overrides）を縦積み
 *   - 各セクションは折りたたみ可能。`localStorage` に collapsed 状態は持たず、
 *     component 内部 state のみ（外側から制御したいケースは v0.2.0 で props 追加検討）
 *
 * 全更新は immutable で `onChange` に新 Style 全体を返す（WorkflowEditor 流儀）。
 * Variant Signal 関連 (cross-Variant 適用差分 / VariantUsage / 弱化候補 badge) は
 * v0.2.0 = T-14〜T-18 担当。Phase 1 では本 component に含めない。
 */
export function StyleEditor({
  style,
  onChange,
  onExtractTrigger,
  resolveAssetName,
  dropMimeTypes = DEFAULT_DROP_MIME_TYPES,
  readOnly = false,
  className,
}: StyleEditorProps): React.ReactElement {
  // セクション折りたたみ state
  const [refCollapsed, setRefCollapsed] = useState(false)
  const [rulesCollapsed, setRulesCollapsed] = useState(false)
  const [overridesCollapsed, setOverridesCollapsed] = useState(false)
  const [showLowConfidence, setShowLowConfidence] = useState(false)

  const handleReferencesChange = useCallback(
    (next: string[]) => onChange({ ...style, reference_assets: next }),
    [style, onChange],
  )

  const handleRulesChange = useCallback(
    (next: ExtractedRule[]) => onChange({ ...style, extracted_rules: next }),
    [style, onChange],
  )

  const handleOverridesChange = useCallback(
    (next: string[]) => onChange({ ...style, human_overrides: next }),
    [style, onChange],
  )

  const approvedRuleCount = useMemo(
    () => style.extracted_rules.filter((r) => r.approved).length,
    [style.extracted_rules],
  )

  return (
    <div
      className={cn("flex flex-col gap-3", className)}
      data-component="StyleEditor"
    >
      {/* Header */}
      <StyleHeader
        style={style}
        onChange={onChange}
        onExtractTrigger={onExtractTrigger}
        readOnly={readOnly}
      />

      {/* Section 1: reference_assets */}
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card/20 p-3">
        <SectionHeader
          title="reference_assets"
          count={style.reference_assets.length}
          collapsed={refCollapsed}
          onToggle={() => setRefCollapsed((v) => !v)}
          hint="AI 抽出に使う元素材（過去作品・参考画像 等）"
        />
        {!refCollapsed && (
          <ReferenceAssetsSection
            references={style.reference_assets}
            onChange={handleReferencesChange}
            resolveAssetName={resolveAssetName}
            dropMimeTypes={dropMimeTypes}
            readOnly={readOnly}
          />
        )}
      </section>

      {/* Section 2: extracted_rules */}
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card/20 p-3">
        <SectionHeader
          title="extracted_rules"
          count={style.extracted_rules.length}
          collapsed={rulesCollapsed}
          onToggle={() => setRulesCollapsed((v) => !v)}
          hint={`AI 抽出 rule（${approvedRuleCount} 承認済み）`}
        />
        {!rulesCollapsed && (
          <ExtractedRulesSection
            rules={style.extracted_rules}
            onChange={handleRulesChange}
            resolveAssetName={resolveAssetName}
            showLowConfidence={showLowConfidence}
            onToggleLowConfidence={() => setShowLowConfidence((v) => !v)}
            readOnly={readOnly}
          />
        )}
      </section>

      {/* Section 3: human_overrides */}
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card/20 p-3">
        <SectionHeader
          title="human_overrides"
          count={style.human_overrides.length}
          collapsed={overridesCollapsed}
          onToggle={() => setOverridesCollapsed((v) => !v)}
          hint="人間直書きルール（最強優先）"
        />
        {!overridesCollapsed && (
          <HumanOverridesSection
            overrides={style.human_overrides}
            onChange={handleOverridesChange}
            readOnly={readOnly}
          />
        )}
      </section>
    </div>
  )
}
