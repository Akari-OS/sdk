// ワークフロー state — 4フェーズ構成で Work の状態から進捗を導出

import type { PolicyData } from "@akari-os/templates-core";
import type { QualityReport } from "./quality-check";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type WorkflowStep =
  | "hearing"    // ① ヒアリング
  | "confirm"    // ② 設定確認
  | "generate"   // ③ 生成
  | "review";    // ④ レビュー/投稿

export type StepStatus = "pending" | "active" | "done" | "error";

export interface StepInfo {
  step: WorkflowStep;
  label: string;
  number: number;
  status: StepStatus;
}

export interface WorkflowState {
  steps: StepInfo[];
}

// ---------------------------------------------------------------------------
// 導出関数
// ---------------------------------------------------------------------------

interface DeriveInput {
  policy: PolicyData | undefined;
  /** 原稿タブの本文。入力があればヒアリング done に寄与 */
  sourceText?: string;
  hasStyle: boolean;
  selectedPlatforms: string[];
  approved: boolean;
  hasGeneratedContent: boolean;
  qualityReport: QualityReport | null;
  published: boolean;
}

/** Work の状態から4フェーズの進捗を導出 */
export function deriveWorkflowState(input: DeriveInput): WorkflowState {
  const {
    policy,
    sourceText,
    hasStyle,
    selectedPlatforms,
    approved,
    hasGeneratedContent,
    qualityReport,
    published,
  } = input;

  // 各フェーズの done 判定
  const policyHasContent = !!(
    policy &&
    (policy.memo.trim() ||
      Object.values(policy.fields).some((v) => v.trim()))
  );
  const hasSource = !!sourceText?.trim();

  // ① ヒアリング: 原稿または方針に何か入力がある
  const hearingDone = hasSource || policyHasContent;

  // ② 設定確認: 原稿または方針 + スタイル + SNS が全て設定済み & 承認済み
  const confirmDone = (hasSource || policyHasContent) && hasStyle && selectedPlatforms.length > 0 && approved;

  // ③ 生成: コンテンツが生成済み
  const generateDone = hasGeneratedContent;

  // ④ レビュー: 品質チェック OK or 投稿済み
  const qaHasError = qualityReport !== null && qualityReport.issues.filter((i) => i.severity === "error").length > 0;
  const reviewDone = published;

  const phases: { step: WorkflowStep; label: string; done: boolean; error: boolean }[] = [
    { step: "hearing", label: "ヒアリング", done: hearingDone, error: false },
    { step: "confirm", label: "設定確認", done: confirmDone, error: false },
    { step: "generate", label: "生成", done: generateDone, error: false },
    { step: "review", label: "レビュー", done: reviewDone, error: qaHasError },
  ];

  const steps: StepInfo[] = phases.map((p, i) => {
    let status: StepStatus;
    if (p.done) {
      status = "done";
    } else if (p.error) {
      status = "error";
    } else {
      const allPrevDone = phases.slice(0, i).every((prev) => prev.done);
      status = allPrevDone ? "active" : "pending";
    }
    return { step: p.step, label: p.label, number: i + 1, status };
  });

  return { steps };
}

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

/** 設定確認フェーズが完了 → 生成可能 */
export function isReadyForApproval(state: WorkflowState): boolean {
  const confirm = state.steps.find((s) => s.step === "confirm");
  return confirm?.status === "done";
}

/** レビューフェーズが完了 → 投稿可能 */
export function isReadyForPublish(state: WorkflowState): boolean {
  const review = state.steps.find((s) => s.step === "review");
  return review?.status === "done";
}
