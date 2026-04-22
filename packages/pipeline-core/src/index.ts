// パイプライン state machine — Chat 主導の投稿ワークフロー制御
// spec: AKARI-HUB-015 Phase 1.1

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type PipelinePhase =
  | "idle"
  | "planning"
  | "policy"
  | "style"
  | "sns"
  | "generating"
  | "qa"
  | "ready"
  | "published";

export type StepStatus = "pending" | "active" | "done" | "skipped";

export interface PipelineStep {
  id: string;
  label: string;
  status: StepStatus;
  /** AI が提案した設定値 */
  data?: Record<string, unknown>;
}

export interface PipelinePlan {
  steps: PipelineStep[];
  currentIndex: number;
}

// ---------------------------------------------------------------------------
// ステップ定義
// ---------------------------------------------------------------------------

const STEP_DEFINITIONS: { id: string; label: string }[] = [
  { id: "policy", label: "方針" },
  { id: "style", label: "スタイル" },
  { id: "sns", label: "SNS選定" },
  { id: "generate", label: "テキスト生成" },
  { id: "qa", label: "品質チェック" },
  { id: "publish", label: "投稿" },
];

// ---------------------------------------------------------------------------
// ファクトリ
// ---------------------------------------------------------------------------

/** AI のプラン JSON からパイプラインを生成 */
export function createPlanFromAI(
  aiSteps: { id: string; label: string; data?: Record<string, unknown> }[],
): PipelinePlan {
  const steps: PipelineStep[] = aiSteps.map((s, i) => ({
    id: s.id,
    label: s.label,
    status: i === 0 ? "active" : "pending",
    data: s.data,
  }));
  return { steps, currentIndex: 0 };
}

/** デフォルトプランを生成（AI が [plan] を返さなかった場合のフォールバック） */
export function createDefaultPlan(): PipelinePlan {
  return createPlanFromAI(STEP_DEFINITIONS);
}

// ---------------------------------------------------------------------------
// 操作
// ---------------------------------------------------------------------------

/** 現在のステップを完了して次に進む */
export function advanceStep(plan: PipelinePlan): PipelinePlan {
  const { steps, currentIndex } = plan;
  if (currentIndex >= steps.length) return plan;

  const next = steps.map((s, i) => {
    if (i === currentIndex) return { ...s, status: "done" as const };
    if (i === currentIndex + 1) return { ...s, status: "active" as const };
    return s;
  });

  return { steps: next, currentIndex: currentIndex + 1 };
}

/** 特定ステップをスキップ */
export function skipStep(plan: PipelinePlan, stepId: string): PipelinePlan {
  return {
    ...plan,
    steps: plan.steps.map((s) =>
      s.id === stepId ? { ...s, status: "skipped" } : s,
    ),
  };
}

/** 現在のアクティブステップを取得 */
export function getCurrentStep(plan: PipelinePlan): PipelineStep | null {
  return plan.steps[plan.currentIndex] ?? null;
}

/** プランが完了したか */
export function isPlanComplete(plan: PipelinePlan): boolean {
  return plan.steps.every((s) => s.status === "done" || s.status === "skipped");
}

// ---------------------------------------------------------------------------
// タブマッピング
// ---------------------------------------------------------------------------

const PHASE_TAB_MAP: Record<string, string> = {
  policy: "policy",
  style: "style",
  sns: "sns",
};

/** パイプラインのステップ ID に対応するサイドパネルタブ ID を返す */
export function getTabForStep(stepId: string): string | null {
  return PHASE_TAB_MAP[stepId] ?? null;
}

// ---------------------------------------------------------------------------
// フェーズ判定
// ---------------------------------------------------------------------------

/** PipelinePlan からフェーズを導出 */
export function derivePhase(plan: PipelinePlan | null): PipelinePhase {
  if (!plan) return "idle";
  const current = getCurrentStep(plan);
  if (!current) return isPlanComplete(plan) ? "published" : "idle";

  switch (current.id) {
    case "policy": return "policy";
    case "style": return "style";
    case "sns": return "sns";
    case "generate": return "generating";
    case "qa": return "qa";
    case "publish": return "ready";
    default: return "idle";
  }
}
