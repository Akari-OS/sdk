/**
 * @file ContextBudgetBar.tsx
 * AKARI-HUB-072 Phase 1 (T-6): Workflow 全体の context budget 使用量を
 * 「コップから水が見える」プログレスバーで可視化するコンポーネント。
 *
 * 実行前は全 Step を「予定」として表示し、実行中は current_step_id までを
 * 「使用済」として濃い色で塗り分ける。overflow 時は警告メッセージを表示。
 *
 * 関連 spec:
 *   - spec-workflow-checkpoint-context-budget-learning-loop (AKARI-HUB-072)
 *     §6 Data Models / §3 AC-9〜AC-12
 * 関連 ADR:
 *   - ADR-094 (Workflow schema / max_steps)
 */

import * as React from "react"
import { useMemo } from "react"
import { cn } from "./lib/cn"
import type { Step, Workflow } from "./types/workflow"

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** computeBudgetUsage の戻り値 */
export interface BudgetUsage {
  /** Workflow 全体の estimated_tokens 合計 */
  total: number
  /** Step 別の内訳 */
  per_step: Array<{
    step_id: string
    /** Step の estimated_tokens（parallel は branches 合計） */
    tokens: number
    /** Step type */
    type: Step["type"]
    /** Step の簡易ラベル (tool 名 / prompt 抜粋 / workflow id) */
    label: string
  }>
}

export interface ContextBudgetBarProps {
  /** budget 計算対象の Workflow */
  workflow: Workflow
  /**
   * 実行中の現在 Step ID。指定されていれば、その Step までの累積 token を
   * 「使用済」として濃い色で塗り、それ以降は予定（薄い色）で表示。
   * 編集時 (実行前) は省略 → 全 Step を「予定」として表示。
   */
  current_step_id?: string
  /**
   * 実行中の実 token（actual usage）。current_step_id と組み合わせて
   * 「予定 vs 実際」の対比に使う。省略時は estimated_tokens 累積を使う。
   */
  accumulated_tokens?: number
  /**
   * 表示モード:
   *   - "compact"  : 進捗バーのみ (header に埋め込む用)
   *   - "detailed" : 進捗バー + Step 別 breakdown list (default)
   */
  layout?: "compact" | "detailed"
  /** 警告閾値（既定 0.8 = 80%） */
  warningThreshold?: number
  /** 危険閾値（既定 1.0 = 100% / overflow） */
  dangerThreshold?: number
  className?: string
}

// ---------------------------------------------------------------------------
// Step type 表示設定
// ---------------------------------------------------------------------------

const STEP_TYPE_CONFIG: Record<
  Step["type"],
  { label: string; badgeClass: string }
> = {
  tool: {
    label: "Tool",
    badgeClass: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  },
  checkpoint: {
    label: "Check",
    badgeClass: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  },
  sub_workflow: {
    label: "Sub",
    badgeClass: "border-purple-500/40 bg-purple-500/10 text-purple-300",
  },
  parallel: {
    label: "Para",
    badgeClass: "border-teal-500/40 bg-teal-500/10 text-teal-300",
  },
}

// ---------------------------------------------------------------------------
// Helper: Step ラベル生成
// ---------------------------------------------------------------------------

function getStepLabel(step: Step): string {
  if (step.type === "tool") return step.tool
  if (step.type === "checkpoint") return step.prompt
  if (step.type === "sub_workflow") return step.workflow
  if (step.type === "parallel") return `${step.branches.length} branches`
  return ""
}

function truncate(str: string, max: number): string {
  return str.length <= max ? str : `${str.slice(0, max)}…`
}

// ---------------------------------------------------------------------------
// Helper: parallel branches の estimated_tokens 合計
// ---------------------------------------------------------------------------

function parallelBranchesTotal(branches: Step[]): number {
  return branches.reduce((acc, b) => acc + b.estimated_tokens, 0)
}

// ---------------------------------------------------------------------------
// 集計: computeBudgetUsage (export — testability のため pure function)
// ---------------------------------------------------------------------------

/**
 * Workflow の Step 群から context budget 使用量を集計する pure 関数。
 * parallel Step は branches.estimated_tokens の合計を使用
 * （全 branch が同時に context を消費する前提）。
 *
 * @param workflow - 集計対象の Workflow
 * @returns 全体合計と Step 別内訳
 */
export function computeBudgetUsage(workflow: Workflow): BudgetUsage {
  const per_step = workflow.steps.map((step) => {
    const tokens =
      step.type === "parallel"
        ? parallelBranchesTotal(step.branches)
        : step.estimated_tokens

    return {
      step_id: step.id,
      tokens,
      type: step.type,
      label: getStepLabel(step),
    }
  })

  const total = per_step.reduce((acc, s) => acc + s.tokens, 0)

  return { total, per_step }
}

// ---------------------------------------------------------------------------
// Bar カラー解決
// ---------------------------------------------------------------------------

function resolveBarColor(
  ratio: number,
  warningThreshold: number,
  dangerThreshold: number,
): { fill: string; track: string; highlight: string } {
  if (ratio >= dangerThreshold) {
    return {
      fill: "bg-rose-500",
      track: "bg-rose-950/50",
      highlight: "from-rose-400/60 to-transparent",
    }
  }
  if (ratio >= warningThreshold) {
    return {
      fill: "bg-amber-500",
      track: "bg-amber-950/50",
      highlight: "from-amber-400/60 to-transparent",
    }
  }
  return {
    fill: "bg-emerald-500",
    track: "bg-emerald-950/30",
    highlight: "from-emerald-400/60 to-transparent",
  }
}

// ---------------------------------------------------------------------------
// Token 数フォーマット
// ---------------------------------------------------------------------------

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ---------------------------------------------------------------------------
// メインバー
// ---------------------------------------------------------------------------

interface BudgetBarProps {
  ratio: number
  warningThreshold: number
  dangerThreshold: number
  usedLabel: string
  budgetLabel: string
  percentLabel: string
}

function BudgetBar({
  ratio,
  warningThreshold,
  dangerThreshold,
  usedLabel,
  budgetLabel,
  percentLabel,
}: BudgetBarProps): React.ReactElement {
  const clampedRatio = Math.min(ratio, 1)
  const { fill, track, highlight } = resolveBarColor(
    ratio,
    warningThreshold,
    dangerThreshold,
  )

  return (
    <div className="flex flex-col gap-1">
      {/* label */}
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">
          <span className="font-semibold text-foreground">{usedLabel}</span>
          {" / "}
          {budgetLabel} tokens
        </span>
        <span
          className={cn(
            "tabular-nums font-semibold",
            ratio >= dangerThreshold
              ? "text-rose-400"
              : ratio >= warningThreshold
                ? "text-amber-400"
                : "text-emerald-400",
          )}
        >
          {percentLabel}
        </span>
      </div>

      {/* track + fill */}
      <div
        role="progressbar"
        aria-label="context budget 使用率"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className={cn(
          "relative h-3 w-full overflow-hidden rounded-full",
          track,
        )}
      >
        {/* fill */}
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all", fill)}
          style={{ width: `${clampedRatio * 100}%` }}
        >
          {/* water-line highlight — グラデーションで「水面の光」を表現 */}
          <div
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b",
              highlight,
            )}
          />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Step Breakdown list (detailed mode)
// ---------------------------------------------------------------------------

interface StepRowProps {
  entry: BudgetUsage["per_step"][number]
  /** Step の token が全体 budget に占める割合 */
  ratioOfBudget: number
  status: "done" | "current" | "pending" | "none"
}

function StepRow({ entry, ratioOfBudget, status }: StepRowProps): React.ReactElement {
  const typeConfig = STEP_TYPE_CONFIG[entry.type]
  const shortId = truncate(entry.step_id, 8)
  const labelText = truncate(entry.label, 40)
  const miniBarWidth = `${Math.min(ratioOfBudget * 100, 100).toFixed(1)}%`

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded px-2 py-1 text-[11px]",
        status === "current" && "border border-primary/40 bg-primary/5",
        status === "done" && "opacity-60",
      )}
    >
      {/* status icon */}
      <span
        aria-label={
          status === "done"
            ? "完了"
            : status === "current"
              ? "実行中"
              : status === "pending"
                ? "予定"
                : ""
        }
        className="shrink-0 select-none text-[10px]"
      >
        {status === "done" ? "✓" : status === "current" ? "▶" : "○"}
      </span>

      {/* type badge */}
      <span
        className={cn(
          "shrink-0 rounded border px-1 py-px text-[9px] font-medium leading-none",
          typeConfig.badgeClass,
        )}
      >
        {typeConfig.label}
      </span>

      {/* step id */}
      <span
        className="w-[72px] shrink-0 truncate font-mono text-[10px] text-muted-foreground"
        title={entry.step_id}
      >
        {shortId}
      </span>

      {/* label */}
      <span className="min-w-0 flex-1 truncate text-foreground/80" title={entry.label}>
        {labelText}
      </span>

      {/* token count */}
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {fmtTokens(entry.tokens)}
      </span>

      {/* mini bar */}
      <div
        className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-muted"
        aria-hidden="true"
      >
        <div
          className="h-full rounded-full bg-emerald-500/60"
          style={{ width: miniBarWidth }}
        />
      </div>
    </li>
  )
}

// ---------------------------------------------------------------------------
// ContextBudgetBar (main export)
// ---------------------------------------------------------------------------

/**
 * Workflow の context budget 使用量を「コップから水が見える」UI で可視化する
 * プログレスバーコンポーネント。
 *
 * - 実行前: 全 Step を「予定」として薄く表示
 * - 実行中: current_step_id までを「使用済」として濃い色で塗り分け
 * - overflow 時: ⚠ 警告メッセージ + Asset summary mode 切替提案
 *
 * spec: AKARI-HUB-072 §6 / §3 AC-9〜AC-12
 */
export function ContextBudgetBar({
  workflow,
  current_step_id,
  accumulated_tokens,
  layout = "detailed",
  warningThreshold = 0.8,
  dangerThreshold = 1.0,
  className,
}: ContextBudgetBarProps): React.ReactElement {
  const usage = useMemo(() => computeBudgetUsage(workflow), [workflow])

  const budget = workflow.context_budget

  // 使用済 token 数: accumulated_tokens が渡されていればそれ優先、
  // なければ current_step_id までの accumulated estimated_tokens を使う
  const usedTokens = useMemo<number>(() => {
    if (accumulated_tokens !== undefined) return accumulated_tokens
    if (!current_step_id) return usage.total

    let acc = 0
    for (const s of usage.per_step) {
      acc += s.tokens
      if (s.step_id === current_step_id) break
    }
    return acc
  }, [accumulated_tokens, current_step_id, usage])

  const displayTokens = current_step_id ? usedTokens : usage.total
  const ratio = budget > 0 ? displayTokens / budget : 0
  const isOverflow = ratio >= dangerThreshold

  // 各 Step の status を決定
  const stepStatuses = useMemo<Record<string, StepRowProps["status"]>>(() => {
    if (!current_step_id) return {}
    const map: Record<string, StepRowProps["status"]> = {}
    let found = false
    for (const s of usage.per_step) {
      if (s.step_id === current_step_id) {
        map[s.step_id] = "current"
        found = true
      } else if (!found) {
        map[s.step_id] = "done"
      } else {
        map[s.step_id] = "pending"
      }
    }
    return map
  }, [current_step_id, usage.per_step])

  const usedLabel = fmtTokens(displayTokens)
  const budgetLabel = fmtTokens(budget)
  const percentLabel = `${Math.round(ratio * 100)}%`

  return (
    <section
      aria-label="Context Budget"
      className={cn("flex flex-col gap-2", className)}
      data-layout={layout}
    >
      {/* メインバー */}
      <BudgetBar
        ratio={ratio}
        warningThreshold={warningThreshold}
        dangerThreshold={dangerThreshold}
        usedLabel={usedLabel}
        budgetLabel={budgetLabel}
        percentLabel={percentLabel}
      />

      {/* overflow 警告 (AC-11) */}
      {isOverflow && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-rose-500/40 bg-rose-950/30 px-3 py-2 text-[11px] text-rose-300"
        >
          <span aria-hidden="true" className="mt-px shrink-0 text-[13px]">
            ⚠
          </span>
          <span>
            context budget を超過しています。Asset の summary mode
            切替を提案します。
          </span>
        </div>
      )}

      {/* Step breakdown — detailed mode のみ */}
      {layout === "detailed" && (
        <ul
          aria-label="Step 別 context budget 内訳"
          className="flex flex-col gap-0.5"
        >
          {usage.per_step.map((entry) => {
            const ratioOfBudget = budget > 0 ? entry.tokens / budget : 0
            const status: StepRowProps["status"] =
              stepStatuses[entry.step_id] ??
              (current_step_id ? "pending" : "none")

            return (
              <StepRow
                key={entry.step_id}
                entry={entry}
                ratioOfBudget={ratioOfBudget}
                status={status}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}
