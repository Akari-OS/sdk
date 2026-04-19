/**
 * PreviewDialog
 *
 * HITL (Human-in-the-loop) preview のルーターコンポーネント。
 * Panel Schema v0 §6.5 の hitl_preview 定義に対応。
 *
 * preview.type に応じて 4 つのサブコンポーネントへ分岐:
 *   text-summary      → TextSummaryPreview
 *   schedule-summary  → ScheduleSummaryPreview
 *   diff              → DiffPreview
 *   custom-markdown   → CustomMarkdownPreview
 *
 * 承認 / 却下ボタン + 理由入力欄を標準で提供する。
 *
 * 使い方（SchemaPanel から）:
 * ```tsx
 * const [hitlState, setHitlState] = useState<HitlState | null>(null);
 *
 * // ActionDispatcher の showHitlPreview コールバックで state を設定
 * const showHitlPreview: ShowHitlPreview = (action, args, onApprove, onReject) => {
 *   setHitlState({ action, args, onApprove, onReject });
 * };
 *
 * // render
 * {hitlState && (
 *   <PreviewDialog
 *     action={hitlState.action}
 *     resolvedArgs={hitlState.args}
 *     fieldValues={fieldValues}
 *     i18nResolver={i18nResolver}
 *     onApprove={hitlState.onApprove}
 *     onReject={hitlState.onReject}
 *     onClose={() => setHitlState(null)}
 *   />
 * )}
 * ```
 */

import React, { useState } from "react";
import type { Action } from "../types/schema";
import type { I18nResolver } from "../engine/I18nResolver";

import { TextSummaryPreview } from "./TextSummaryPreview";
import { ScheduleSummaryPreview } from "./ScheduleSummaryPreview";
import { DiffPreview } from "./DiffPreview";
import { CustomMarkdownPreview } from "./CustomMarkdownPreview";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PreviewDialogProps {
  /** 実行しようとしている Action */
  action: Action;
  /** BindingResolver で解決済みの MCP args */
  resolvedArgs: Record<string, unknown>;
  /** 現在のフィールド値マップ（preview_template の変数展開に使う） */
  fieldValues: Record<string, unknown>;
  /** i18n 解決器 */
  i18nResolver: I18nResolver;
  /** 承認ハンドラー */
  onApprove: () => Promise<void>;
  /** 却下ハンドラー */
  onReject: () => void;
  /** ダイアログを閉じるハンドラー */
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// PreviewDialog
// ---------------------------------------------------------------------------

export const PreviewDialog: React.FC<PreviewDialogProps> = ({
  action,
  resolvedArgs,
  fieldValues,
  i18nResolver,
  onApprove,
  onReject,
  onClose,
}) => {
  const [isApproving, setIsApproving] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const hitl = action.hitl;
  if (!hitl) return null;

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await onApprove();
    } finally {
      setIsApproving(false);
      onClose();
    }
  };

  const handleReject = () => {
    onReject();
    onClose();
  };

  // preview タイプに応じたコンテンツコンポーネントを選択
  const renderPreviewContent = () => {
    const commonProps = {
      action,
      resolvedArgs,
      fieldValues,
      i18nResolver,
    };

    switch (hitl.preview) {
      case "text-summary":
        return <TextSummaryPreview {...commonProps} />;

      case "schedule-summary":
        return <ScheduleSummaryPreview {...commonProps} />;

      case "diff":
        return (
          <DiffPreview
            {...commonProps}
            previewTemplate={hitl.preview_template}
          />
        );

      case "custom-markdown":
        return (
          <CustomMarkdownPreview
            {...commonProps}
            previewTemplate={hitl.preview_template}
          />
        );

      default: {
        const unknownType = hitl.preview as string;
        console.warn(`[PreviewDialog] Unknown preview type: "${unknownType}"`);
        return (
          <div className="text-sm text-muted-foreground">
            Preview type "{unknownType}" is not supported.
          </div>
        );
      }
    }
  };

  return (
    // shadcn/ui Dialog 相当のオーバーレイ構造
    // TODO: Shell 側で shadcn/ui の <Dialog> コンポーネントに差し替える
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hitl-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleReject}
        aria-hidden="true"
      />

      {/* Dialog panel */}
      <div className="relative z-10 w-full max-w-lg rounded-lg bg-background p-6 shadow-lg">
        {/* Header */}
        <div className="mb-4">
          <h2
            id="hitl-dialog-title"
            className="text-lg font-semibold"
          >
            {i18nResolver.resolve(action.label)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {i18nResolver.resolve("{{t:hitl.review_prompt}}" as `{{t:${string}}}`) ||
              "Please review the action before proceeding."}
          </p>
        </div>

        {/* Preview content */}
        <div className="mb-4 rounded-md border border-border bg-muted/40 p-4">
          {renderPreviewContent()}
        </div>

        {/* Rejection reason input（オプション） */}
        <div className="mb-4">
          <label
            htmlFor="rejection-reason"
            className="mb-1 block text-sm font-medium"
          >
            Reason for rejection (optional)
          </label>
          <textarea
            id="rejection-reason"
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Enter rejection reason..."
          />
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleReject}
            disabled={isApproving}
            className="inline-flex items-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={isApproving}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isApproving ? "Processing..." : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreviewDialog;
