/**
 * @file CheckpointInline.tsx
 * AKARI-HUB-072 Phase 1 (T-4): Workflow Checkpoint Step の inline 表示 component。
 *
 * 役割:
 *   - Workflow が blocking Checkpoint Step に到達したとき、Workflow パネル内に
 *     **inline** で人間の判断 UI を表示する（モーダル / Dialog 禁止）
 *   - UI mode "inline-edit" : textarea で自由入力 + 確定 / 取り消し
 *   - UI mode "list-select" : 選択肢 list + 確定
 *   - 確定時に `onResolve(HumanResponse)` を呼び出し元へ返す
 *
 * 設計指針（ルール 9 / 11 — 一画面化原則）:
 *   - モーダル / Portal / Dialog を使わない
 *   - 「OK / キャンセル」ダイアログを出さない。inline button のみ
 *   - 「戻る」操作が不要な構造（Undo = onCancel 1 ボタン）
 *   - Cmd/Ctrl+Enter で確定ショートカット（inline-edit mode）
 *
 * 関連 spec / ADR:
 *   - spec-workflow-checkpoint-context-budget-learning-loop (AKARI-HUB-072) §6 / §3 AC-5〜AC-8
 *   - ADR-094 (Workflow / Step schema)
 *   - docs/RULES.md ルール 9 / 11 (一画面化原則)
 */

import * as React from "react"
import { useState, useCallback, useRef, useEffect } from "react"
import { cn } from "./lib/cn"
import { Button } from "./button"
import { PoolBadge } from "./PoolBadge"
import type { Step } from "./types/workflow"

// ──────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────

/**
 * 確定時に呼び出し元へ返す human 応答。
 *
 * - 'inline-edit' : textarea で編集された自由記述
 * - 'list-select' : 選択された 1 つの候補
 *
 * 注: 本型は spec §6 Data Models には含まれていないが、Checkpoint UI が呼び出し元
 *     （Workflow Engine / WorkflowEditor）に応答を返すための共通 shape として
 *     ここで定義 + export する。Workflow Engine からの API も同 shape を期待する。
 */
export type HumanResponse =
  | { kind: "inline-edit"; value: string }
  | { kind: "list-select"; selected: string }

/**
 * CheckpointInline が受け取る Step。
 *
 * 正典 `Step` の `type: "checkpoint"` メンバに、UI 専用フィールド `choices` を
 * 拡張で追加した shape。`choices` は `ui === "list-select"` のときに必須相当。
 *
 * 注: spec §6 Data Models の Checkpoint Step schema に `choices` は含まれていない
 *     （Open Question 扱い）。Workflow Engine から runtime で injection される or
 *     editor 側で append される運用を想定し、UI レイヤで intersection で受ける。
 */
export type CheckpointInlineStep = Extract<Step, { type: "checkpoint" }> & {
  /** list-select 時の選択肢（runtime injection / editor append） */
  choices?: string[]
}

/** CheckpointInline に渡す Step は type="checkpoint" + choices 拡張 */
type CheckpointStep = CheckpointInlineStep

/**
 * CheckpointInline component props。
 *
 * Workflow Engine が Checkpoint Step に到達したとき、Workflow パネルから
 * このコンポーネントを mount して人間の判断を待つ。
 */
export interface CheckpointInlineProps {
  /** Checkpoint Step（type: "checkpoint" の Step union メンバ） */
  step: CheckpointStep
  /** 人間応答が確定したら呼ばれる callback */
  onResolve: (response: HumanResponse) => void
  /** キャンセル（checkpoint abort / workflow abort）。任意 */
  onCancel?: () => void
  /** textarea の初期値 override（編集再開用）。inline-edit mode のみ有効 */
  defaultValue?: string
  className?: string
}

// ──────────────────────────────────────────────────────────────────
// Sub components
// ──────────────────────────────────────────────────────────────────

/**
 * Checkpoint の見出しエリア。
 *   - ⚠ 一時停止中バナー
 *   - `step.prompt`（人間が判断する内容）
 *   - Step ID / estimated_tokens の small label
 */
function CheckpointHeader({ step }: { step: CheckpointStep }) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* 一時停止中インジケータ */}
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-amber-500/40",
          "bg-amber-500/10 px-2.5 py-1.5",
        )}
        role="status"
        aria-label="Workflow が一時停止中 — 人間の判断を待っています"
      >
        {/* ⚠ icon（SVG、lucide-react 非依存） */}
        <svg
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="size-3.5 shrink-0 text-amber-400"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-[11px] font-medium text-amber-300">
          Workflow が一時停止中 — 人間の判断が必要です
        </span>
      </div>

      {/* prompt */}
      <p className="text-[13px] font-medium leading-snug text-foreground">
        {step.prompt}
      </p>

      {/* Step ID + estimated_tokens */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] tabular-nums text-muted-foreground">
          Step ID: <code className="font-mono">{step.id}</code>
        </span>
        <PoolBadge
          variant="inactive"
          compact
          label={`~${step.estimated_tokens} tok`}
          title={`推定トークン数: ${step.estimated_tokens}`}
          aria-label={`推定トークン数 ${step.estimated_tokens}`}
        />
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// inline-edit mode
// ──────────────────────────────────────────────────────────────────

/**
 * `step.ui === "inline-edit"` 時の入力 UI。
 *
 * - textarea で自由入力（初期値は `step.input` または `defaultValue`）
 * - 「確定」「取り消し」を inline button で配置（モーダルなし）
 * - Cmd/Ctrl+Enter で確定ショートカット
 */
function InlineEditUI({
  step,
  defaultValue,
  onResolve,
  onCancel,
}: {
  step: CheckpointStep
  defaultValue?: string
  onResolve: (response: HumanResponse) => void
  onCancel?: () => void
}) {
  const [value, setValue] = useState<string>(
    defaultValue ?? step.input ?? "",
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // mount 時に textarea にフォーカス
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const handleConfirm = useCallback(() => {
    onResolve({ kind: "inline-edit", value })
  }, [onResolve, value])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Cmd/Ctrl + Enter で確定
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        handleConfirm()
      }
    },
    [handleConfirm],
  )

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="ここに編集内容を入力"
        rows={5}
        aria-label="Checkpoint 入力欄"
        className={cn(
          "w-full resize-y rounded-md border border-border bg-background px-3 py-2",
          "text-[13px] text-foreground placeholder:text-muted-foreground/60",
          "outline-none transition",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        )}
      />
      <p className="text-[10px] text-muted-foreground">
        ヒント: <kbd className="rounded border border-border px-1 font-mono text-[9px]">⌘</kbd>
        {" / "}
        <kbd className="rounded border border-border px-1 font-mono text-[9px]">Ctrl</kbd>
        {" + "}
        <kbd className="rounded border border-border px-1 font-mono text-[9px]">Enter</kbd>
        {" で確定"}
      </p>

      {/* inline action buttons — モーダルではなく pane 内に直接配置 */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={handleConfirm}
          aria-label="入力内容を確定して Workflow を再開する"
        >
          確定
        </Button>
        {onCancel && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            aria-label="Checkpoint を取り消して Workflow を中断する"
          >
            取り消し
          </Button>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// list-select mode
// ──────────────────────────────────────────────────────────────────

/**
 * `step.ui === "list-select"` 時の選択 UI。
 *
 * - `step.choices` をクリッカブルなラジオリストで表示
 * - 選択 → 「確定」ボタン、または直接クリックで即時確定
 * - `step.choices` が undefined の場合は placeholder + 取り消しボタン
 */
function ListSelectUI({
  step,
  onResolve,
  onCancel,
}: {
  step: CheckpointStep
  onResolve: (response: HumanResponse) => void
  onCancel?: () => void
}) {
  const [selected, setSelected] = useState<string | null>(
    step.choices?.[0] ?? null,
  )

  const handleConfirm = useCallback(() => {
    if (selected == null) return
    onResolve({ kind: "list-select", selected })
  }, [onResolve, selected])

  // 選択肢なし — placeholder
  if (!step.choices || step.choices.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p
          className={cn(
            "rounded-md border border-border bg-muted/30 px-3 py-2",
            "text-[12px] text-muted-foreground",
          )}
          role="status"
        >
          選択肢が定義されていません
        </p>
        {onCancel && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            aria-label="Checkpoint を取り消して Workflow を中断する"
          >
            取り消し
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* 選択肢リスト */}
      <ul
        role="listbox"
        aria-label="選択肢"
        aria-required="true"
        className="flex flex-col gap-1"
      >
        {step.choices.map((choice) => {
          const isSelected = choice === selected
          return (
            <li key={choice} role="option" aria-selected={isSelected}>
              <button
                type="button"
                onClick={() => setSelected(choice)}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left text-[13px] transition",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  isSelected
                    ? "border-primary/50 bg-primary/10 text-primary font-medium"
                    : "border-border bg-card/30 text-foreground hover:bg-accent hover:text-foreground",
                )}
                aria-label={`選択肢: ${choice}`}
              >
                <span className="flex items-center gap-2">
                  {/* ラジオ的なインジケータ */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                      isSelected
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/50 bg-transparent",
                    )}
                  >
                    {isSelected && (
                      <span className="size-1.5 rounded-full bg-primary-foreground" />
                    )}
                  </span>
                  {choice}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* action buttons */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={handleConfirm}
          disabled={selected == null}
          aria-label="選択した内容を確定して Workflow を再開する"
          aria-disabled={selected == null}
        >
          確定
        </Button>
        {onCancel && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            aria-label="Checkpoint を取り消して Workflow を中断する"
          >
            取り消し
          </Button>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────────
// Main export
// ──────────────────────────────────────────────────────────────────

/**
 * Workflow Checkpoint Step の inline 表示 component。
 *
 * Workflow Engine が `type: "checkpoint"` の Step に到達したとき、
 * Workflow パネル内（pane 内）に直接 mount して人間の判断を待つ。
 *
 * **モーダル / Dialog / Portal は使用しない**（ルール 9 / 11）。
 * すべての操作は pane 内 inline button で完結する。
 *
 * @example
 * ```tsx
 * <CheckpointInline
 *   step={checkpointStep}
 *   onResolve={(response) => engine.continueWorkflow(response)}
 *   onCancel={() => engine.abortWorkflow()}
 * />
 * ```
 */
export function CheckpointInline({
  step,
  onResolve,
  onCancel,
  defaultValue,
  className,
}: CheckpointInlineProps): React.ReactElement {
  return (
    <section
      aria-label={`Checkpoint: ${step.id}`}
      data-checkpoint-id={step.id}
      data-checkpoint-ui={step.ui}
      className={cn(
        "flex flex-col gap-3 rounded-lg border-2 border-amber-500/40 bg-card/60 p-4",
        className,
      )}
    >
      {/* 見出し（prompt / step id / token badge） */}
      <CheckpointHeader step={step} />

      {/* divider */}
      <hr className="border-border" />

      {/* UI mode 切り替え */}
      {step.ui === "inline-edit" ? (
        <InlineEditUI
          step={step}
          defaultValue={defaultValue}
          onResolve={onResolve}
          onCancel={onCancel}
        />
      ) : (
        <ListSelectUI
          step={step}
          onResolve={onResolve}
          onCancel={onCancel}
        />
      )}
    </section>
  )
}
