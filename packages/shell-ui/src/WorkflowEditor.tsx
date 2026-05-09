/**
 * @file WorkflowEditor.tsx
 * AKARI-HUB-072 Phase 1 (T-5): Workflow 編集 UI。
 *
 * 役割:
 *   - Workflow の Step list を左カラムで表示し、右カラム inspector で詳細編集する
 *     2 カラム split UI（パネル切替、モーダル禁止 / ルール 9・11）
 *   - Step の追加 / 削除 / 複製 / 上下移動 / type 別フィールド編集を提供
 *   - Workflow メタ情報（name / context_budget / max_steps / scope 等）を上部で編集
 *   - render-prop で CheckpointInline / ContextBudgetBar を外側から差し込める疎結合設計
 *
 * 実装指針:
 *   - 全操作は同一コンポーネント内で完結（画面遷移禁止）
 *   - 全更新は immutable — new workflow object を onChange に渡す
 *   - 削除は 2 回押し confirm（inline、モーダル不使用）
 *   - drag-and-drop は MVP 範囲外。上下矢印ボタンで順序変更
 *
 * 関連 spec / ADR:
 *   - spec-workflow-checkpoint-context-budget-learning-loop (AKARI-HUB-072) §3 AC-1〜AC-4 / §6
 *   - ADR-094 (max_steps / Workflow schema)
 *   - ADR-078 (Variant / Parallel 戦略)
 *   - ADR-079 (Pool 統合)
 */

import * as React from "react"
import { useState, useCallback, useId } from "react"
import { cn } from "./lib/cn"
import { Button } from "./button"
import type {
  Workflow,
  Step,
  CheckpointUI,
  ParallelAggregation,
  ParallelVariantStrategy,
} from "./types/workflow"

// ─── 型 ────────────────────────────────────────────────────────────────────

/** レイアウトモード（StageView と同じ流儀） */
export type WorkflowEditorLayout = "split" | "stacked"

/**
 * UI 表示用の Workflow 拡張（intersection で `name?` を追加）。
 *
 * 正典 `Workflow`（`./types/workflow`）には `name` フィールドが含まれていない
 * （spec §6 Data Models 未確定 — Asset.name を使う想定）。
 * Workflow Editor 単独で表示名を編集できるよう、UI レイヤで `name?: string` を
 * intersection で受け取る。Asset 連携時は Asset.name と双方向同期する想定。
 */
export type WorkflowEditorWorkflow = Workflow & {
  /** UI 表示名（spec §6 schema 拡張案 / 編集 UI 専用フィールド） */
  name?: string
}

/**
 * UI 表示用の Checkpoint Step 拡張（list-select の choices を含む）。
 * 詳細は `CheckpointInline.CheckpointInlineStep` を参照。
 */
type EditableCheckpointStep = Extract<Step, { type: "checkpoint" }> & {
  choices?: string[]
}

/** Editor 内で扱う Step 拡張（checkpoint のみ choices 拡張） */
export type EditableStep = Exclude<Step, { type: "checkpoint" }> | EditableCheckpointStep

/** WorkflowEditor の Props */
export interface WorkflowEditorProps {
  /** 編集対象の Workflow（UI 表示用 `name?` 拡張を受ける） */
  workflow: WorkflowEditorWorkflow
  /** 変更時 callback (新規 workflow 全体を返す immutable 流儀) */
  onChange: (next: WorkflowEditorWorkflow) => void
  /** 制御モード: 選択中の Step ID を外側で持つ場合 */
  selectedStepId?: string
  onSelectStep?: (stepId: string | null) => void
  /**
   * inspector に追加で描画する slot。Checkpoint Step inspector に
   * CheckpointInline を差し込む等に使う（render-prop で疎結合）。
   */
  renderStepInspector?: (step: Step) => React.ReactNode
  /**
   * Workflow 全体の context budget bar 等を上部に出すための slot
   * （ContextBudgetBar をここに差し込む想定、render-prop）。
   */
  renderHeader?: (workflow: Workflow) => React.ReactNode
  className?: string
  /**
   * Step を編集できないモード（read-only 表示。実行中の Trace 表示等で使う）
   */
  readOnly?: boolean
  /**
   * レイアウト: "split"（デフォルト: 左 40% list + 右 60% inspector）
   * / "stacked"（縦並び、横幅狭い時）
   */
  layout?: WorkflowEditorLayout
}

// ─── 定数 / ユーティリティ ──────────────────────────────────────────────────

const STEP_TYPE_LABELS: Record<Step["type"], string> = {
  tool: "tool",
  checkpoint: "checkpoint",
  sub_workflow: "sub_workflow",
  parallel: "parallel",
}

const STEP_TYPE_COLORS: Record<Step["type"], string> = {
  tool: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  checkpoint: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  sub_workflow: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  parallel: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
}

/** Step の preview テキスト（list 行に表示する短い要約） */
function stepPreview(step: Step): string {
  switch (step.type) {
    case "tool":
      return step.tool
    case "checkpoint":
      return step.prompt.slice(0, 60) + (step.prompt.length > 60 ? "…" : "")
    case "sub_workflow":
      return `ref: ${step.workflow}`
    case "parallel":
      return `${step.branches.length} branches`
  }
}

/** 新しい Step のデフォルト値 */
function makeDefaultStep(type: Step["type"], index: number): Step {
  const id = `step-${type}-${Date.now()}-${index}`
  switch (type) {
    case "tool":
      return { id, type: "tool", tool: "new-tool", estimated_tokens: 500 }
    case "checkpoint":
      return {
        id,
        type: "checkpoint",
        prompt: "",
        ui: "inline-edit",
        blocking: true,
        estimated_tokens: 100,
      }
    case "sub_workflow":
      return { id, type: "sub_workflow", workflow: "", estimated_tokens: 1000 }
    case "parallel":
      return {
        id,
        type: "parallel",
        branches: [],
        aggregation: { kind: "all" },
        variant_strategy: { kind: "none" },
        estimated_tokens: 2000,
      }
  }
}

/** Workflow 内の Step を id で置換（immutable） */
function replaceStep(workflow: Workflow, next: Step): Workflow {
  return {
    ...workflow,
    steps: workflow.steps.map((s) => (s.id === next.id ? next : s)),
  }
}

/** Workflow 内の Step を削除（immutable） */
function removeStep(workflow: Workflow, stepId: string): Workflow {
  return { ...workflow, steps: workflow.steps.filter((s) => s.id !== stepId) }
}

/** Step を上下に移動（immutable） */
function moveStep(
  workflow: Workflow,
  stepId: string,
  dir: "up" | "down",
): Workflow {
  const idx = workflow.steps.findIndex((s) => s.id === stepId)
  if (idx < 0) return workflow
  const next = [...workflow.steps]
  const target = dir === "up" ? idx - 1 : idx + 1
  if (target < 0 || target >= next.length) return workflow
  ;[next[idx], next[target]] = [next[target], next[idx]]
  return { ...workflow, steps: next }
}

// ─── Step type badge ────────────────────────────────────────────────────────

function StepTypeBadge({ type }: { type: Step["type"] }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-medium leading-none whitespace-nowrap select-none",
        STEP_TYPE_COLORS[type],
      )}
    >
      {STEP_TYPE_LABELS[type]}
    </span>
  )
}

// ─── Step list row ─────────────────────────────────────────────────────────

interface StepRowProps {
  step: Step
  index: number
  isFirst: boolean
  isLast: boolean
  isSelected: boolean
  readOnly: boolean
  onSelect: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}

/**
 * Step list の 1 行。選択状態 / type badge / preview / 移動ボタンを表示。
 */
function StepRow({
  step,
  index,
  isFirst,
  isLast,
  isSelected,
  readOnly,
  onSelect,
  onMoveUp,
  onMoveDown,
}: StepRowProps) {
  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={onSelect}
      className={cn(
        "group flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-[11px] transition",
        isSelected
          ? "border-primary/50 bg-primary/10"
          : "border-border bg-card/30 hover:bg-accent/40",
      )}
    >
      {/* order index */}
      <span className="mt-0.5 w-5 shrink-0 text-center tabular-nums text-muted-foreground">
        {index + 1}
      </span>

      {/* badge + preview */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <StepTypeBadge type={step.type} />
          <span className="font-mono text-[10px] text-muted-foreground">
            {step.id}
          </span>
        </div>
        <p className="mt-0.5 truncate text-foreground/80">{stepPreview(step)}</p>
      </div>

      {/* move buttons (非 readOnly 時のみ) */}
      {!readOnly && (
        <div className="flex flex-col gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            disabled={isFirst}
            onClick={(e) => {
              e.stopPropagation()
              onMoveUp()
            }}
            aria-label="Step を上へ移動"
            className="flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            ▲
          </button>
          <button
            type="button"
            disabled={isLast}
            onClick={(e) => {
              e.stopPropagation()
              onMoveDown()
            }}
            aria-label="Step を下へ移動"
            className="flex size-4 items-center justify-center rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
          >
            ▼
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Step inspector — field editors ─────────────────────────────────────────

interface FieldRowProps {
  label: string
  htmlFor?: string
  children: React.ReactNode
  note?: string
}

function FieldRow({ label, htmlFor, children, note }: FieldRowProps) {
  return (
    <div className="grid grid-cols-[6rem_1fr] items-start gap-2">
      <label
        htmlFor={htmlFor}
        className="pt-1.5 text-[10px] font-medium text-muted-foreground"
      >
        {label}
      </label>
      <div className="flex flex-col gap-1">
        {children}
        {note && <p className="text-[9px] text-muted-foreground/70">{note}</p>}
      </div>
    </div>
  )
}

const INPUT_CLS =
  "rounded-md border border-border bg-input/30 px-2 py-1 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"

const TEXTAREA_CLS =
  "rounded-md border border-border bg-input/30 px-2 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-y disabled:opacity-50"

/** tool Step 専用フィールド */
function ToolStepFields({
  step,
  onChange,
  readOnly,
}: {
  step: Extract<Step, { type: "tool" }>
  onChange: (next: Step) => void
  readOnly: boolean
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-3">
      <FieldRow label="tool name" htmlFor={`${id}-tool`}>
        <input
          id={`${id}-tool`}
          type="text"
          disabled={readOnly}
          value={step.tool}
          onChange={(e) => onChange({ ...step, tool: e.target.value })}
          className={INPUT_CLS}
        />
      </FieldRow>
      <FieldRow label="agent" htmlFor={`${id}-agent`}>
        <input
          id={`${id}-agent`}
          type="text"
          disabled={readOnly}
          value={step.agent ?? ""}
          placeholder="（省略可）"
          onChange={(e) =>
            onChange({ ...step, agent: e.target.value || undefined })
          }
          className={INPUT_CLS}
        />
      </FieldRow>
      <FieldRow label="est. tokens" htmlFor={`${id}-tokens`}>
        <input
          id={`${id}-tokens`}
          type="number"
          disabled={readOnly}
          min={0}
          value={step.estimated_tokens}
          onChange={(e) =>
            onChange({ ...step, estimated_tokens: Number(e.target.value) })
          }
          className={INPUT_CLS}
        />
      </FieldRow>
      <FieldRow label="style_ref" htmlFor={`${id}-style`}>
        <input
          id={`${id}-style`}
          type="text"
          disabled={readOnly}
          value={step.style_ref ?? ""}
          placeholder="（省略可）"
          onChange={(e) =>
            onChange({ ...step, style_ref: e.target.value || undefined })
          }
          className={INPUT_CLS}
        />
      </FieldRow>
      <FieldRow label="params (JSON)" htmlFor={`${id}-params`}>
        <textarea
          id={`${id}-params`}
          disabled={readOnly}
          rows={4}
          value={step.params != null ? JSON.stringify(step.params, null, 2) : ""}
          onChange={(e) => {
            try {
              const parsed =
                e.target.value.trim() === ""
                  ? undefined
                  : (JSON.parse(e.target.value) as Record<string, unknown>)
              onChange({ ...step, params: parsed })
            } catch {
              /* JSON parse error は無視してそのまま typing できるようにする */
            }
          }}
          className={TEXTAREA_CLS}
          placeholder="{}"
        />
      </FieldRow>
    </div>
  )
}

/** checkpoint Step 専用フィールド */
function CheckpointStepFields({
  step,
  onChange,
  readOnly,
}: {
  step: EditableCheckpointStep
  onChange: (next: Step) => void
  readOnly: boolean
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-3">
      <FieldRow label="prompt" htmlFor={`${id}-prompt`}>
        <textarea
          id={`${id}-prompt`}
          disabled={readOnly}
          rows={4}
          value={step.prompt}
          onChange={(e) => onChange({ ...step, prompt: e.target.value })}
          className={TEXTAREA_CLS}
        />
      </FieldRow>
      <FieldRow label="UI mode">
        <div className="flex gap-3">
          {(["inline-edit", "list-select"] as CheckpointUI[]).map((ui) => (
            <label
              key={ui}
              className="flex items-center gap-1.5 text-[11px] cursor-pointer"
            >
              <input
                type="radio"
                disabled={readOnly}
                checked={step.ui === ui}
                onChange={() => onChange({ ...step, ui })}
                className="accent-primary"
              />
              {ui}
            </label>
          ))}
        </div>
      </FieldRow>
      {step.ui === "list-select" && (
        <FieldRow
          label="choices"
          htmlFor={`${id}-choices`}
          note="1 行 1 選択肢で入力"
        >
          <textarea
            id={`${id}-choices`}
            disabled={readOnly}
            rows={4}
            value={(step.choices ?? []).join("\n")}
            onChange={(e) => {
              const next: EditableCheckpointStep = {
                ...step,
                choices: e.target.value
                  .split("\n")
                  .map((s) => s.trimEnd())
                  .filter(Boolean),
              }
              onChange(next as Step)
            }}
            className={TEXTAREA_CLS}
            placeholder="選択肢 A&#10;選択肢 B&#10;選択肢 C"
          />
        </FieldRow>
      )}
      <FieldRow label="input" htmlFor={`${id}-input`}>
        <input
          id={`${id}-input`}
          type="text"
          disabled={readOnly}
          value={step.input ?? ""}
          placeholder="（省略可）"
          onChange={(e) =>
            onChange({ ...step, input: e.target.value || undefined })
          }
          className={INPUT_CLS}
        />
      </FieldRow>
      <FieldRow label="est. tokens" htmlFor={`${id}-tokens`}>
        <input
          id={`${id}-tokens`}
          type="number"
          disabled={readOnly}
          min={0}
          value={step.estimated_tokens}
          onChange={(e) =>
            onChange({ ...step, estimated_tokens: Number(e.target.value) })
          }
          className={INPUT_CLS}
        />
      </FieldRow>
    </div>
  )
}

/** sub_workflow Step 専用フィールド */
function SubWorkflowStepFields({
  step,
  onChange,
  readOnly,
}: {
  step: Extract<Step, { type: "sub_workflow" }>
  onChange: (next: Step) => void
  readOnly: boolean
}) {
  const id = useId()
  return (
    <div className="flex flex-col gap-3">
      <FieldRow label="workflow ref" htmlFor={`${id}-wf`}>
        <input
          id={`${id}-wf`}
          type="text"
          disabled={readOnly}
          value={step.workflow}
          onChange={(e) => onChange({ ...step, workflow: e.target.value })}
          className={INPUT_CLS}
        />
      </FieldRow>
      <FieldRow label="agent" htmlFor={`${id}-agent`}>
        <input
          id={`${id}-agent`}
          type="text"
          disabled={readOnly}
          value={step.agent ?? ""}
          placeholder="（省略可）"
          onChange={(e) =>
            onChange({ ...step, agent: e.target.value || undefined })
          }
          className={INPUT_CLS}
        />
      </FieldRow>
      <FieldRow label="version_pin" htmlFor={`${id}-pin`}>
        <input
          id={`${id}-pin`}
          type="text"
          disabled={readOnly}
          value={step.version_pin ?? ""}
          placeholder="（省略可）"
          onChange={(e) =>
            onChange({ ...step, version_pin: e.target.value || undefined })
          }
          className={INPUT_CLS}
        />
      </FieldRow>
      <FieldRow label="est. tokens" htmlFor={`${id}-tokens`}>
        <input
          id={`${id}-tokens`}
          type="number"
          disabled={readOnly}
          min={0}
          value={step.estimated_tokens}
          onChange={(e) =>
            onChange({ ...step, estimated_tokens: Number(e.target.value) })
          }
          className={INPUT_CLS}
        />
      </FieldRow>
    </div>
  )
}

/** parallel Step 専用フィールド */
function ParallelStepFields({
  step,
  onChange,
  readOnly,
}: {
  step: Extract<Step, { type: "parallel" }>
  onChange: (next: Step) => void
  readOnly: boolean
}) {
  const id = useId()
  const aggKind = step.aggregation.kind
  const vsKind = step.variant_strategy?.kind ?? "none"

  function setAggKind(kind: ParallelAggregation["kind"]) {
    const agg: ParallelAggregation =
      kind === "min" ? { kind: "min", n: 2 } : { kind }
    onChange({ ...step, aggregation: agg })
  }

  function setVsKind(kind: ParallelVariantStrategy["kind"]) {
    const vs: ParallelVariantStrategy =
      kind === "create-variants-aggregate"
        ? { kind, primary: "first-success" }
        : { kind }
    onChange({ ...step, variant_strategy: vs })
  }

  return (
    <div className="flex flex-col gap-3">
      <FieldRow label="aggregation" htmlFor={`${id}-agg`}>
        <select
          id={`${id}-agg`}
          disabled={readOnly}
          value={aggKind}
          onChange={(e) =>
            setAggKind(e.target.value as ParallelAggregation["kind"])
          }
          className={INPUT_CLS}
        >
          <option value="all">all</option>
          <option value="any">any</option>
          <option value="majority">majority</option>
          <option value="min">min (n)</option>
        </select>
        {aggKind === "min" && (
          <input
            type="number"
            disabled={readOnly}
            min={1}
            value={(step.aggregation as { kind: "min"; n: number }).n}
            onChange={(e) =>
              onChange({
                ...step,
                aggregation: { kind: "min", n: Number(e.target.value) },
              })
            }
            className={cn(INPUT_CLS, "mt-1 w-20")}
            placeholder="n"
          />
        )}
      </FieldRow>
      <FieldRow label="variant strategy" htmlFor={`${id}-vs`}>
        <select
          id={`${id}-vs`}
          disabled={readOnly}
          value={vsKind}
          onChange={(e) =>
            setVsKind(e.target.value as ParallelVariantStrategy["kind"])
          }
          className={INPUT_CLS}
        >
          <option value="none">none</option>
          <option value="create-variants">create-variants</option>
          <option value="create-variants-aggregate">
            create-variants-aggregate
          </option>
        </select>
        {vsKind === "create-variants-aggregate" && (
          <select
            disabled={readOnly}
            value={
              (step.variant_strategy as { kind: "create-variants-aggregate"; primary: string }).primary
            }
            onChange={(e) =>
              onChange({
                ...step,
                variant_strategy: {
                  kind: "create-variants-aggregate",
                  primary: e.target.value as "first-success" | "highest-score",
                },
              })
            }
            className={cn(INPUT_CLS, "mt-1")}
          >
            <option value="first-success">first-success</option>
            <option value="highest-score">highest-score</option>
          </select>
        )}
      </FieldRow>
      <FieldRow label="branches" note="branches[] の編集は v0.3.0 で実装予定">
        <span className="text-[11px] text-muted-foreground">
          {step.branches.length} branch（read-only）
        </span>
      </FieldRow>
      <FieldRow label="est. tokens" htmlFor={`${id}-tokens`}>
        <input
          id={`${id}-tokens`}
          type="number"
          disabled={readOnly}
          min={0}
          value={step.estimated_tokens}
          onChange={(e) =>
            onChange({ ...step, estimated_tokens: Number(e.target.value) })
          }
          className={INPUT_CLS}
        />
      </FieldRow>
    </div>
  )
}

// ─── Step inspector ─────────────────────────────────────────────────────────

interface StepInspectorProps {
  step: Step
  readOnly: boolean
  onChange: (next: Step) => void
  onDelete: () => void
  onDuplicate: () => void
  renderStepInspector?: (step: Step) => React.ReactNode
}

/**
 * 右カラムの Step 詳細 inspector。type 別フィールド + 共通操作ボタンを表示。
 * 削除は 2 回押し inline confirm（モーダル禁止 / ルール 9）。
 */
function StepInspector({
  step,
  readOnly,
  onChange,
  onDelete,
  onDuplicate,
  renderStepInspector,
}: StepInspectorProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleDeleteClick() {
    if (confirmDelete) {
      onDelete()
    } else {
      setConfirmDelete(true)
    }
  }

  // 別 step に切替時は confirm state をリセット
  React.useEffect(() => {
    setConfirmDelete(false)
  }, [step.id])

  return (
    <div className="flex flex-col gap-4">
      {/* render-prop slot (CheckpointInline 等) */}
      {renderStepInspector?.(step)}

      {/* 共通: id (read-only) */}
      <div className="flex flex-col gap-1">
        <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
          Step ID
        </p>
        <code className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-foreground/70">
          {step.id}
        </code>
      </div>

      {/* type 別フィールド */}
      {step.type === "tool" && (
        <ToolStepFields
          step={step}
          onChange={onChange}
          readOnly={readOnly}
        />
      )}
      {step.type === "checkpoint" && (
        <CheckpointStepFields
          step={step}
          onChange={onChange}
          readOnly={readOnly}
        />
      )}
      {step.type === "sub_workflow" && (
        <SubWorkflowStepFields
          step={step}
          onChange={onChange}
          readOnly={readOnly}
        />
      )}
      {step.type === "parallel" && (
        <ParallelStepFields
          step={step}
          onChange={onChange}
          readOnly={readOnly}
        />
      )}

      {/* 共通操作ボタン */}
      {!readOnly && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onDuplicate}
          >
            複製
          </Button>
          <Button
            variant={confirmDelete ? "destructive" : "outline"}
            size="sm"
            onClick={handleDeleteClick}
            onBlur={() => setConfirmDelete(false)}
          >
            {confirmDelete ? "もう一度押すと削除" : "削除"}
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Add Step chip bar ───────────────────────────────────────────────────────

const STEP_TYPES: Step["type"][] = ["tool", "checkpoint", "sub_workflow", "parallel"]

interface AddStepBarProps {
  onAdd: (type: Step["type"]) => void
}

/**
 * Step 追加チップバー。inline chip 選択（popover / modal 不使用）。
 */
function AddStepBar({ onAdd }: AddStepBarProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
        + Step を追加
      </p>
      <div className="flex flex-wrap gap-1.5">
        {STEP_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onAdd(type)}
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition hover:opacity-80 active:scale-95",
              STEP_TYPE_COLORS[type],
            )}
          >
            + {type}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Workflow header editor ─────────────────────────────────────────────────

interface WorkflowHeaderProps {
  workflow: WorkflowEditorWorkflow
  onChange: (next: WorkflowEditorWorkflow) => void
  readOnly: boolean
  renderHeader?: (workflow: Workflow) => React.ReactNode
}

/**
 * Workflow メタ情報の上部編集エリア。
 * name / version / max_steps / context_budget / scope + renderHeader slot。
 */
function WorkflowHeader({
  workflow,
  onChange,
  readOnly,
  renderHeader,
}: WorkflowHeaderProps) {
  const id = useId()
  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-card/30 p-3">
      {/* render-prop slot (ContextBudgetBar 等) */}
      {renderHeader?.(workflow)}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3">
        {/* name */}
        <div className="col-span-2 sm:col-span-3 flex flex-col gap-1">
          <label
            htmlFor={`${id}-name`}
            className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            Workflow 名
          </label>
          <input
            id={`${id}-name`}
            type="text"
            disabled={readOnly}
            value={workflow.name ?? ""}
            placeholder="（未設定）"
            onChange={(e) =>
              onChange({ ...workflow, name: e.target.value || undefined })
            }
            className={cn(INPUT_CLS, "text-sm font-medium")}
          />
        </div>

        {/* version (read-only) */}
        <div className="flex flex-col gap-1">
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            version
          </p>
          <code className="rounded bg-muted/50 px-1.5 py-1 text-[10px] text-foreground/70">
            {workflow.version}
          </code>
        </div>

        {/* parent_version (read-only) */}
        <div className="flex flex-col gap-1">
          <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            parent
          </p>
          <code className="rounded bg-muted/50 px-1.5 py-1 text-[10px] text-foreground/70">
            {workflow.parent_version ?? "—"}
          </code>
        </div>

        {/* scope */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${id}-scope`}
            className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            scope
          </label>
          <select
            id={`${id}-scope`}
            disabled={readOnly}
            value={workflow.scope}
            onChange={(e) =>
              onChange({
                ...workflow,
                scope: e.target.value as Workflow["scope"],
              })
            }
            className={INPUT_CLS}
          >
            <option value="leaf">leaf</option>
            <option value="orchestration">orchestration</option>
          </select>
        </div>

        {/* max_steps */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${id}-maxsteps`}
            className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            max_steps
          </label>
          <input
            id={`${id}-maxsteps`}
            type="number"
            disabled={readOnly}
            min={1}
            value={workflow.max_steps}
            onChange={(e) =>
              onChange({ ...workflow, max_steps: Number(e.target.value) })
            }
            className={INPUT_CLS}
          />
        </div>

        {/* context_budget */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor={`${id}-budget`}
            className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            context_budget (tokens)
          </label>
          <input
            id={`${id}-budget`}
            type="number"
            disabled={readOnly}
            min={0}
            value={workflow.context_budget}
            onChange={(e) =>
              onChange({ ...workflow, context_budget: Number(e.target.value) })
            }
            className={INPUT_CLS}
          />
        </div>
      </div>
    </div>
  )
}

// ─── WorkflowEditor (main) ──────────────────────────────────────────────────

/**
 * Workflow 編集 UI（AKARI-HUB-072 §6 / AC-1〜AC-4）。
 *
 * - 左: Step list + 上下移動 + 追加チップ
 * - 右: Step inspector（type 別フィールド / 削除 / 複製）+ render-prop slot
 * - 上: Workflow メタ情報 + renderHeader slot
 * - layout="split"（default）or "stacked" で切替可能（StageView 流儀）
 */
export function WorkflowEditor({
  workflow,
  onChange,
  selectedStepId,
  onSelectStep,
  renderStepInspector,
  renderHeader,
  className,
  readOnly = false,
  layout = "split",
}: WorkflowEditorProps): React.ReactElement {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    null,
  )

  const activeId: string | null = selectedStepId !== undefined
    ? selectedStepId
    : internalSelectedId

  const handleSelectStep = useCallback(
    (id: string | null) => {
      if (selectedStepId === undefined) setInternalSelectedId(id)
      onSelectStep?.(id)
    },
    [selectedStepId, onSelectStep],
  )

  const handleStepChange = useCallback(
    (next: Step) => onChange(replaceStep(workflow, next)),
    [workflow, onChange],
  )

  const handleStepDelete = useCallback(
    (stepId: string) => {
      onChange(removeStep(workflow, stepId))
      handleSelectStep(null)
    },
    [workflow, onChange, handleSelectStep],
  )

  const handleStepDuplicate = useCallback(
    (step: Step) => {
      const clone: Step = { ...step, id: `${step.id}-copy-${Date.now()}` } as Step
      const idx = workflow.steps.findIndex((s) => s.id === step.id)
      const next = [...workflow.steps]
      next.splice(idx + 1, 0, clone)
      onChange({ ...workflow, steps: next })
      handleSelectStep(clone.id)
    },
    [workflow, onChange, handleSelectStep],
  )

  const handleAddStep = useCallback(
    (type: Step["type"]) => {
      const step = makeDefaultStep(type, workflow.steps.length)
      onChange({ ...workflow, steps: [...workflow.steps, step] })
      handleSelectStep(step.id)
    },
    [workflow, onChange, handleSelectStep],
  )

  const selectedStep = workflow.steps.find((s) => s.id === activeId) ?? null

  // ── render ──────────────────────────────────────────────────────────────

  const stepList = (
    <div className="flex flex-col gap-1.5" role="listbox" aria-label="Step list">
      {workflow.steps.map((step, i) => (
        <StepRow
          key={step.id}
          step={step}
          index={i}
          isFirst={i === 0}
          isLast={i === workflow.steps.length - 1}
          isSelected={step.id === activeId}
          readOnly={readOnly}
          onSelect={() => handleSelectStep(step.id)}
          onMoveUp={() => onChange(moveStep(workflow, step.id, "up"))}
          onMoveDown={() => onChange(moveStep(workflow, step.id, "down"))}
        />
      ))}
      {workflow.steps.length === 0 && (
        <p className="py-4 text-center text-[11px] text-muted-foreground">
          Step がありません
        </p>
      )}
      {!readOnly && <AddStepBar onAdd={handleAddStep} />}
    </div>
  )

  const inspector = selectedStep ? (
    <StepInspector
      step={selectedStep}
      readOnly={readOnly}
      onChange={handleStepChange}
      onDelete={() => handleStepDelete(selectedStep.id)}
      onDuplicate={() => handleStepDuplicate(selectedStep)}
      renderStepInspector={renderStepInspector}
    />
  ) : (
    <div className="flex h-full items-center justify-center py-12 text-[11px] text-muted-foreground">
      Step を選択してください
    </div>
  )

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Workflow メタ header */}
      <WorkflowHeader
        workflow={workflow}
        onChange={onChange}
        readOnly={readOnly}
        renderHeader={renderHeader}
      />

      {/* Step list + inspector */}
      {layout === "split" ? (
        <div className="flex gap-3">
          <div className="w-[40%] shrink-0 overflow-y-auto rounded-md border border-border bg-card/20 p-2">
            {stepList}
          </div>
          <div className="flex-1 overflow-y-auto rounded-md border border-border bg-card/20 p-3">
            {inspector}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-card/20 p-2">
            {stepList}
          </div>
          {selectedStep && (
            <div className="rounded-md border border-border bg-card/20 p-3">
              {inspector}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
