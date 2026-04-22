/**
 * PipelineMessage — [pipeline] タグのレンダラ
 *
 * サマリーカード + アクションボタンを描画。
 * 3タイプ: approval-request / qa-result / publish-ready
 * spec: AKARI-HUB-015 §4
 */

import { CheckCircle2, AlertTriangle, Send, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface PipelineSummary {
  policy?: string;
  style?: string;
  platforms?: string[];
  charCounts?: Record<string, number>;
}

export interface QaIssue {
  severity: "error" | "warning" | "info";
  message: string;
}

export type PipelineData =
  | { type: "approval-request"; summary: PipelineSummary }
  | { type: "qa-result"; pass: boolean; issues: QaIssue[] }
  | { type: "publish-ready"; summary: PipelineSummary };

export interface PipelineMessageProps {
  data: PipelineData;
  onApprove?: () => void;
  onPublish?: () => void;
  onRetry?: () => void;
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function PipelineMessage({ data, onApprove, onPublish, onRetry }: PipelineMessageProps) {
  if (data.type === "approval-request") {
    return (
      <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
        <div className="text-[10px] font-medium text-primary mb-2 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          投稿準備の確認
        </div>
        <div className="text-xs leading-relaxed space-y-1 mb-2.5">
          {data.summary.policy && (
            <div className="flex gap-1">
              <span className="text-muted-foreground shrink-0">方針:</span>
              <span>{data.summary.policy}</span>
            </div>
          )}
          {data.summary.style && (
            <div className="flex gap-1">
              <span className="text-muted-foreground shrink-0">スタイル:</span>
              <span>{data.summary.style}</span>
            </div>
          )}
          {data.summary.platforms && data.summary.platforms.length > 0 && (
            <div className="flex gap-1">
              <span className="text-muted-foreground shrink-0">SNS:</span>
              <span>{data.summary.platforms.join(", ")}</span>
            </div>
          )}
        </div>
        {onApprove && (
          <Button
            onClick={onApprove}
            size="sm"
            className="h-7 text-[11px] gap-1"
          >
            <Sparkles className="w-3 h-3" />
            承認して生成
          </Button>
        )}
      </div>
    );
  }

  if (data.type === "qa-result") {
    const icon = data.pass ? (
      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
    ) : (
      <AlertTriangle className="w-3 h-3 text-amber-500" />
    );
    const borderColor = data.pass ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5";
    const labelColor = data.pass ? "text-emerald-500" : "text-amber-500";

    return (
      <div className={`rounded-md border ${borderColor} px-3 py-2`}>
        <div className={`text-[10px] font-medium ${labelColor} mb-1.5 flex items-center gap-1`}>
          {icon}
          品質チェック {data.pass ? "OK" : "NG"}
        </div>
        {data.issues.length > 0 && (
          <div className="text-xs leading-relaxed space-y-0.5 mb-2">
            {data.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-1">
                <span className="shrink-0">
                  {issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️"}
                </span>
                <span>{issue.message}</span>
              </div>
            ))}
          </div>
        )}
        {!data.pass && onRetry && (
          <Button
            onClick={onRetry}
            variant="outline"
            size="sm"
            className="h-7 text-[11px] gap-1"
          >
            <RefreshCw className="w-3 h-3" />
            再生成
          </Button>
        )}
      </div>
    );
  }

  if (data.type === "publish-ready") {
    return (
      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
        <div className="text-[10px] font-medium text-emerald-500 mb-1.5 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          投稿準備完了
        </div>
        {data.summary.platforms && (
          <div className="text-xs text-muted-foreground mb-2">
            {data.summary.platforms.join(", ")} に投稿可能です
          </div>
        )}
        {onPublish && (
          <Button
            onClick={onPublish}
            size="sm"
            className="h-7 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700"
          >
            <Send className="w-3 h-3" />
            投稿する
          </Button>
        )}
      </div>
    );
  }

  return null;
}
