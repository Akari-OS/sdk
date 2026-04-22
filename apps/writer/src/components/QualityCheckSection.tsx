/**
 * QualityCheckSection — 品質チェック結果の表示
 *
 * spec: AKARI-HUB-014 §4.3
 */

import { AlertTriangle, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { sortIssues, type QualityReport, type CheckSeverity } from "../lib/quality-check";
import { PlatformIcon } from "@/components/icons/SnsIcons";

interface QualityCheckSectionProps {
  report: QualityReport | null;
}

const SEVERITY_STYLES: Record<CheckSeverity, { icon: typeof AlertCircle; color: string; bg: string }> = {
  error: { icon: AlertCircle, color: "text-red-400", bg: "bg-red-400/10 border-red-400/30" },
  warning: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-400/10 border-yellow-400/30" },
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/30" },
};

export function QualityCheckSection({ report }: QualityCheckSectionProps) {
  if (!report) {
    return (
      <div className="px-3 py-6 text-center text-xs text-muted-foreground opacity-50">
        エンハンス後に品質チェック結果が表示されます
      </div>
    );
  }

  const sorted = sortIssues(report.issues);
  const errorCount = sorted.filter((i) => i.severity === "error").length;
  const warningCount = sorted.filter((i) => i.severity === "warning").length;

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* サマリー */}
      <div className="flex items-center gap-2">
        {errorCount === 0 && warningCount === 0 ? (
          <>
            <CheckCircle2 className="w-4 h-4 text-green-400" />
            <span className="text-xs font-medium text-green-400">問題なし</span>
          </>
        ) : (
          <>
            {errorCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-red-400">
                <AlertCircle className="w-3.5 h-3.5" />
                {errorCount}
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-1 text-xs text-yellow-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                {warningCount}
              </span>
            )}
          </>
        )}
      </div>

      {/* issue 一覧 */}
      {sorted.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {sorted.map((issue, i) => {
            const style = SEVERITY_STYLES[issue.severity];
            const Icon = style.icon;
            return (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-[10px] ${style.bg}`}
              >
                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${style.color}`} />
                <div className="flex items-center gap-1.5 min-w-0">
                  <PlatformIcon platformId={issue.platformId} size={12} />
                  <span className="text-foreground/90 leading-relaxed">{issue.message}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
