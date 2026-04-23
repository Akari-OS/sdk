/**
 * PlanMessage — Claude Code 風プランカード
 *
 * AI が提示するプランをチェックリスト形式で表示。
 * 各ステップに状態（pending/active/done）+ アクティブステップに [OK] ボタン。
 * 初回は全体の [承認して開始] ボタン。
 * spec: AKARI-HUB-015 Phase 1.1
 */

import { Check, Circle, Loader2, Play, ChevronRight } from "lucide-react";
import { Button } from "@akari-os/shell-ui/button";
import type { PipelinePlan, PipelineStep } from "@akari-os/pipeline-core";

export interface PlanMessageProps {
  plan: PipelinePlan;
  /** プラン全体を承認して開始 */
  onStart?: () => void;
  /** 現在のステップを承認して次へ */
  onStepApprove?: () => void;
  /** 特定ステップの変更を要求 */
  onStepModify?: (stepId: string) => void;
  /** プランが開始済みか */
  started?: boolean;
}

function StepIcon({ status }: { status: PipelineStep["status"] }) {
  switch (status) {
    case "done":
      return <Check className="w-3.5 h-3.5 text-emerald-500" />;
    case "active":
      return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
    case "skipped":
      return <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40" />;
    default:
      return <Circle className="w-3.5 h-3.5 text-muted-foreground/30" />;
  }
}

export function PlanMessage({
  plan,
  onStart,
  onStepApprove,
  onStepModify,
  started = false,
}: PlanMessageProps) {
  const currentStep = plan.steps[plan.currentIndex];

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5">
      {/* ヘッダー */}
      <div className="text-[10px] font-medium text-primary mb-2 flex items-center gap-1">
        <Play className="w-3 h-3" />
        投稿プラン
      </div>

      {/* ステップリスト */}
      <div className="space-y-1 mb-3">
        {plan.steps.map((step) => {
          const isCurrent = step.id === currentStep?.id && started;
          const hasData = step.data && Object.keys(step.data).length > 0;
          return (
            <div
              key={step.id}
              className={`flex items-start gap-2 px-2 py-1 rounded text-xs ${
                isCurrent
                  ? "bg-primary/10"
                  : step.status === "done"
                    ? "opacity-70"
                    : ""
              }`}
            >
              <div className="mt-0.5 shrink-0">
                <StepIcon status={step.status} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{step.label}</div>
                {hasData && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {Object.entries(step.data!).map(([k, v]) => (
                      <span key={k} className="mr-2">
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {!started && step.data && onStepModify && (
                <button
                  onClick={() => onStepModify(step.id)}
                  className="text-[9px] text-primary/60 hover:text-primary transition shrink-0"
                >
                  変更
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* アクションボタン */}
      {!started && onStart && (
        <Button
          onClick={onStart}
          size="sm"
          className="h-7 text-[11px] gap-1"
        >
          <Play className="w-3 h-3" />
          承認して開始
        </Button>
      )}

      {started && currentStep?.status === "active" && onStepApprove && (
        <Button
          onClick={onStepApprove}
          size="sm"
          variant="outline"
          className="h-7 text-[11px] gap-1"
        >
          <Check className="w-3 h-3" />
          OK — 次へ
        </Button>
      )}
    </div>
  );
}
