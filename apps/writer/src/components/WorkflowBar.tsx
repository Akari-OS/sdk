/**
 * WorkflowBar — 4フェーズ進捗バー
 *
 * Chat 入力欄の上に固定表示。①②③④ の番号付き4フェーズ。
 * クリックでフローチャートポップオーバーを展開。
 * spec: AKARI-HUB-015
 */

import { useState } from "react";
import { Check, Circle, AlertCircle, ChevronDown, Loader2 } from "lucide-react";

import type { WorkflowState, StepStatus } from "../lib/workflow-state";
import type { PipelinePlan } from "@akari-os/pipeline-core";

export interface WorkflowBarProps {
  workflowState: WorkflowState;
  pipelinePlan?: PipelinePlan | null;
}

const STATUS_COLORS: Record<StepStatus, string> = {
  done: "bg-emerald-500 text-white",
  active: "bg-primary text-primary-foreground",
  pending: "bg-muted text-muted-foreground/50",
  error: "bg-destructive text-destructive-foreground",
};

function PhaseIcon({ status, number }: { status: StepStatus; number: number }) {
  if (status === "done") return <Check className="w-3 h-3" />;
  if (status === "active") return <Loader2 className="w-3 h-3 animate-spin" />;
  if (status === "error") return <AlertCircle className="w-3 h-3" />;
  return <span className="text-[9px] font-bold">{number}</span>;
}

function PipelineStepIcon({ status }: { status: string }) {
  switch (status) {
    case "done":
      return <Check className="w-3.5 h-3.5 text-emerald-500" />;
    case "active":
      return <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />;
    default:
      return <Circle className="w-3.5 h-3.5 text-muted-foreground/30" />;
  }
}

export function WorkflowBar({ workflowState, pipelinePlan }: WorkflowBarProps) {
  const { steps } = workflowState;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative">
      {/* コンパクトバー: ① ② ③ ④ */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 border-t border-border bg-muted/20 hover:bg-muted/40 transition cursor-pointer"
      >
        {steps.map((step, i) => (
          <div key={step.step} className="flex items-center gap-1.5">
            {/* 番号バッジ */}
            <div
              className={`w-5 h-5 rounded-full flex items-center justify-center ${STATUS_COLORS[step.status]}`}
              title={`${step.number}. ${step.label}: ${step.status}`}
            >
              <PhaseIcon status={step.status} number={step.number} />
            </div>
            <span className={`text-[10px] ${
              step.status === "active" ? "text-primary font-medium" :
              step.status === "done" ? "text-emerald-500" :
              "text-muted-foreground/50"
            }`}>
              {step.label}
            </span>
            {/* 接続線 */}
            {i < steps.length - 1 && (
              <div className={`w-4 h-px ${
                step.status === "done" ? "bg-emerald-500/40" : "bg-border"
              }`} />
            )}
          </div>
        ))}
        <ChevronDown
          className={`w-3 h-3 ml-1 text-muted-foreground/50 shrink-0 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* 展開フローチャート */}
      {expanded && (
        <div className="absolute bottom-full left-0 right-0 border border-border rounded-t-lg bg-card shadow-lg z-10 px-3 py-2.5 max-h-[300px] overflow-y-auto">
          <div className="text-[10px] font-medium text-muted-foreground mb-2">
            ワークフロー詳細
          </div>

          {/* 4フェーズ詳細 */}
          <div className="space-y-1.5">
            {steps.map((step, i) => (
              <div key={step.step} className="flex items-start gap-2">
                <div className="flex flex-col items-center">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] ${STATUS_COLORS[step.status]}`}>
                    <PhaseIcon status={step.status} number={step.number} />
                  </div>
                  {i < steps.length - 1 && (
                    <div className={`w-px h-4 ${
                      step.status === "done" ? "bg-emerald-500/40" : "bg-border"
                    }`} />
                  )}
                </div>
                <div className="pt-0.5">
                  <div className={`text-xs font-medium ${
                    step.status === "active" ? "text-primary" :
                    step.status === "done" ? "text-muted-foreground" :
                    "text-muted-foreground/50"
                  }`}>
                    {step.label}
                  </div>
                  {step.step === "hearing" && (
                    <div className="text-[9px] text-muted-foreground/60">トピック・意図のヒアリング</div>
                  )}
                  {step.step === "confirm" && (
                    <div className="text-[9px] text-muted-foreground/60">方針・スタイル・SNS の確認</div>
                  )}
                  {step.step === "generate" && (
                    <div className="text-[9px] text-muted-foreground/60">全 SNS の投稿文を AI 生成</div>
                  )}
                  {step.step === "review" && (
                    <div className="text-[9px] text-muted-foreground/60">品質チェック・微調整・投稿</div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* パイプライン詳細（AI プランがある場合） */}
          {pipelinePlan && (
            <div className="mt-3 pt-2 border-t border-border">
              <div className="text-[10px] font-medium text-primary mb-1">AI プラン</div>
              <div className="space-y-0.5">
                {pipelinePlan.steps.map((ps) => (
                  <div key={ps.id} className="flex items-center gap-1.5 text-[10px]">
                    <PipelineStepIcon status={ps.status} />
                    <span className={ps.status === "done" ? "text-muted-foreground" : "text-foreground"}>
                      {ps.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
