/**
 * @file StylePanel.tsx
 * AKARI-HUB-073 Phase 1 (T-2): Style 一覧表示パネル。
 *
 * 役割:
 *   - StyleAsset[] を「行」リストとして縦に並べる
 *   - domain filter（video / writing / design / voice / mixed）— inline chips
 *   - 各行: domain badge / Style 名（asset name 相当を ID で代替）/ version badge / rule 数
 *   - 行クリックで onSelect callback を発火（StyleEditor を開く起点 — TM-B 担当）
 *   - 「+ 新規」ボタンの slot は本 component スコープ外（外側で配置）
 *
 * 設計指針:
 *   - 全操作が 1 画面で完結（モーダル / 画面遷移禁止 — RULES.md ルール 9 / 11）
 *   - filter UI は inline chips（dropdown / popover を避ける）
 *   - 制御モード対応: `activeStyleId` を外側で持つことで master-detail で StyleEditor と同期可能
 *   - StagView / WorkflowEditor の流儀に揃え、render-prop は最小限に留める
 *
 * 関連 spec / ADR:
 *   - spec-style-management-ui-learning-loop (AKARI-HUB-073) §3 AC-2 / §6 / §7 T-2
 *   - ADR-094 (Asset Tier — Style は tier: 'canonical' 固定)
 *   - ADR-095 (Style as Asset Subtype)
 *   - ADR-079 (Pool 統合)
 *   - HUB-072 Phase 1 で確立した shell-ui types/ + component pattern を踏襲
 */

import * as React from "react"
import { useMemo, useState, useCallback } from "react"
import { cn } from "./lib/cn"
import type { StyleAsset, StyleDomain } from "./types/style"

// ─── 定数 ──────────────────────────────────────────────────────────────────

/**
 * domain filter chips の表示順（spec §3 AC-2 / §6 5 種固定）。
 * "all" は filter 解除を表すセンチネル。
 */
export const STYLE_DOMAIN_FILTER_ORDER: readonly (StyleDomain | "all")[] = [
  "all",
  "video",
  "writing",
  "design",
  "voice",
  "mixed",
] as const

/** UI ラベル（日本語） */
const DOMAIN_LABEL_JA: Record<StyleDomain | "all", string> = {
  all: "all",
  video: "動画",
  writing: "文章",
  design: "デザイン",
  voice: "声",
  mixed: "混合",
}

/** 各 domain 用の badge 色（Step type badge と同じ流儀） */
const DOMAIN_COLORS: Record<StyleDomain, string> = {
  video: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  writing: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  design: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  voice: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  mixed: "bg-amber-500/15 text-amber-300 border-amber-500/30",
}

// ─── Props ─────────────────────────────────────────────────────────────────

/** StylePanel の Props */
export interface StylePanelProps {
  /** 表示対象の Style 一覧 */
  styles: StyleAsset[]
  /**
   * 行クリック時 callback。StyleEditor（TM-B 担当）を開く起点。
   * 同じ行を 2 回押した場合の挙動は外側 (onSelect) で決める（toggle / 単方向のいずれも可）。
   */
  onSelect: (style: StyleAsset) => void
  /**
   * master-detail で外側に「現在編集中の Style」を保持する場合の制御値。
   * 行に `aria-selected` / 強調スタイルを付ける。
   */
  activeStyleId?: string
  /**
   * domain filter の制御モード。指定すると filter chip は外側 state を反映。
   * 未指定なら component 内 state で自己制御（デフォルト "all"）。
   */
  domainFilter?: StyleDomain | "all"
  onDomainFilterChange?: (domain: StyleDomain | "all") => void
  /**
   * 各行の表示名解決関数。Style 自体は `id` のみ持ち、表示名は Asset 側に
   * 紐づくため、外側（PoolBrowser 等）から Asset.name を解決して渡す想定。
   * 省略時は `style.id` を fallback 表示。
   */
  resolveStyleName?: (style: StyleAsset) => string
  /** 空状態の placeholder 文言（任意 override） */
  emptyLabel?: string
  className?: string
}

// ─── 内部 component ────────────────────────────────────────────────────────

/** domain badge（行内 + filter chip の両方で再利用） */
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

/** version badge（"v1.2.3" 表示、行内右寄せで使う） */
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

interface StyleRowProps {
  style: StyleAsset
  isSelected: boolean
  displayName: string
  onClick: () => void
}

/**
 * Style list の 1 行。
 *   - 左: domain badge
 *   - 中央: 表示名（resolveStyleName で解決） + Style ID（hint, monospace）
 *   - 右: rule 数 / version badge
 */
function StyleRow({ style, isSelected, displayName, onClick }: StyleRowProps) {
  const ruleCount = style.extracted_rules.length
  const refCount = style.reference_assets.length
  const overrideCount = style.human_overrides.length
  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onClick()
        }
      }}
      tabIndex={0}
      className={cn(
        "group flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] transition focus:outline-none focus:ring-1 focus:ring-ring",
        isSelected
          ? "border-primary/50 bg-primary/10"
          : "border-border bg-card/30 hover:bg-accent/40",
      )}
    >
      {/* 左: domain badge */}
      <div className="mt-0.5 shrink-0">
        <DomainBadge domain={style.domain} />
      </div>

      {/* 中央: 表示名 + Style ID */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-foreground">
          {displayName}
        </p>
        <p className="mt-0.5 truncate font-mono text-[9px] text-muted-foreground">
          {style.id}
        </p>
        {/* rule / reference / override の数を行末に小さく */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground">
          <span title="参照 Asset 数">refs {refCount}</span>
          <span title="抽出 rule 数">rules {ruleCount}</span>
          <span title="human override 数">overrides {overrideCount}</span>
        </div>
      </div>

      {/* 右: version badge */}
      <div className="mt-0.5 flex shrink-0 flex-col items-end gap-1">
        <VersionBadge version={style.version} />
      </div>
    </div>
  )
}

// ─── domain filter bar ──────────────────────────────────────────────────────

interface DomainFilterBarProps {
  active: StyleDomain | "all"
  onChange: (domain: StyleDomain | "all") => void
  /** 各 chip の右に件数を表示するための内訳 */
  counts: Record<StyleDomain | "all", number>
}

/**
 * domain filter chips（spec §3 AC-2）。
 * inline chip 切替（popover / modal 不使用 — RULES.md ルール 9 / 11）。
 */
function DomainFilterBar({ active, onChange, counts }: DomainFilterBarProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        domain
      </p>
      <div
        role="tablist"
        aria-label="Style domain filter"
        className="flex flex-wrap gap-1.5"
      >
        {STYLE_DOMAIN_FILTER_ORDER.map((d) => {
          const isActive = d === active
          const count = counts[d]
          const baseCls =
            d === "all"
              ? "border-border bg-muted/40 text-foreground/80"
              : DOMAIN_COLORS[d]
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(d)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition active:scale-95",
                baseCls,
                isActive
                  ? "ring-1 ring-primary/60 bg-opacity-100"
                  : "opacity-60 hover:opacity-100",
              )}
            >
              <span>{DOMAIN_LABEL_JA[d]}</span>
              <span
                className="rounded-full bg-background/40 px-1 text-[9px] tabular-nums leading-none"
                aria-hidden="true"
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── StylePanel (main) ──────────────────────────────────────────────────────

/**
 * Style 一覧パネル（AKARI-HUB-073 §3 AC-2 / §6 / §7 T-2）。
 *
 *   - 上: domain filter chips
 *   - 下: フィルタ後の Style list（行クリックで onSelect）
 *
 * 「+ 新規 Style」ボタンや「Style import」等の周辺 UI は本 component の責務外。
 * 外側（PoolBrowserView 配下 / shell side bar 等）で配置する。
 */
export function StylePanel({
  styles,
  onSelect,
  activeStyleId,
  domainFilter,
  onDomainFilterChange,
  resolveStyleName,
  emptyLabel = "Style がまだありません",
  className,
}: StylePanelProps): React.ReactElement {
  // ── 制御 / 非制御 mode の filter state ────────────────────────────────────
  const [internalFilter, setInternalFilter] = useState<StyleDomain | "all">(
    "all",
  )
  const activeFilter: StyleDomain | "all" =
    domainFilter !== undefined ? domainFilter : internalFilter

  const handleFilterChange = useCallback(
    (next: StyleDomain | "all") => {
      if (domainFilter === undefined) setInternalFilter(next)
      onDomainFilterChange?.(next)
    },
    [domainFilter, onDomainFilterChange],
  )

  // ── 内訳 + フィルタ後 list の memoize ─────────────────────────────────────
  const counts = useMemo(() => {
    const acc: Record<StyleDomain | "all", number> = {
      all: styles.length,
      video: 0,
      writing: 0,
      design: 0,
      voice: 0,
      mixed: 0,
    }
    for (const s of styles) acc[s.domain] += 1
    return acc
  }, [styles])

  const filtered = useMemo(() => {
    if (activeFilter === "all") return styles
    return styles.filter((s) => s.domain === activeFilter)
  }, [styles, activeFilter])

  // ── 表示名解決 ──────────────────────────────────────────────────────────
  const nameOf = useCallback(
    (style: StyleAsset) =>
      resolveStyleName ? resolveStyleName(style) : style.id,
    [resolveStyleName],
  )

  // ── render ──────────────────────────────────────────────────────────────
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <DomainFilterBar
        active={activeFilter}
        onChange={handleFilterChange}
        counts={counts}
      />

      <div
        role="listbox"
        aria-label="Style list"
        className="flex flex-col gap-1.5"
      >
        {filtered.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-muted-foreground">
            {styles.length === 0
              ? emptyLabel
              : `${DOMAIN_LABEL_JA[activeFilter]} に該当する Style はありません`}
          </p>
        ) : (
          filtered.map((style) => (
            <StyleRow
              key={style.id}
              style={style}
              isSelected={style.id === activeStyleId}
              displayName={nameOf(style)}
              onClick={() => onSelect(style)}
            />
          ))
        )}
      </div>
    </div>
  )
}
