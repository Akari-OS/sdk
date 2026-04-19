/**
 * ScheduleSummaryPreview
 *
 * HITL preview type: "schedule-summary"
 *
 * 日時・繰り返し条件を承認ダイアログに表示する。
 * X Sender の「予約投稿確認」などのユースケースに対応。
 *
 * 表示内容:
 * - resolvedArgs から日時フィールドを検出して人間可読フォーマットで表示
 * - 繰り返し条件（rrule 等）が含まれる場合は展開表示
 * - タイムゾーン情報を表示
 */

import React from "react";
import type { Action } from "../types/schema";
import type { I18nResolver } from "../engine/I18nResolver";

export interface ScheduleSummaryPreviewProps {
  action: Action;
  resolvedArgs: Record<string, unknown>;
  fieldValues: Record<string, unknown>;
  i18nResolver: I18nResolver;
}

/**
 * 値が ISO8601 日時文字列かどうかを判定する。
 */
function isDateTimeString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // 簡易判定: "2026-04-19T..." 形式
  return /^\d{4}-\d{2}-\d{2}/.test(value);
}

/**
 * ISO8601 日時文字列を人間可読なフォーマットに変換する。
 * ロケール対応（Intl.DateTimeFormat）。
 */
function formatDateTime(isoString: string, locale: string): string {
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);
  } catch {
    return isoString;
  }
}

export const ScheduleSummaryPreview: React.FC<ScheduleSummaryPreviewProps> = ({
  action,
  resolvedArgs,
  i18nResolver,
}) => {
  // resolvedArgs から日時フィールドを探す
  const dateTimeEntries = Object.entries(resolvedArgs).filter(([, value]) =>
    isDateTimeString(value)
  );

  // 日時以外のフィールドも表示（コンテキスト情報）
  const otherEntries = Object.entries(resolvedArgs).filter(
    ([, value]) =>
      !isDateTimeString(value) &&
      value !== null &&
      value !== undefined &&
      typeof value !== "object"
  );

  // locale を i18nResolver から取得（プライベートだが型があれば直接アクセス）
  // TODO: I18nResolver に locale getter を追加する
  const localeHint = "ja"; // デフォルト

  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Schedule Summary
      </p>

      {dateTimeEntries.length === 0 && otherEntries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No schedule information.</p>
      ) : (
        <>
          {/* 日時フィールド */}
          {dateTimeEntries.length > 0 && (
            <div className="space-y-1">
              {dateTimeEntries.map(([key, value]) => (
                <div key={key} className="flex items-start gap-2">
                  <span className="mt-0.5 text-base">📅</span>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {i18nResolver.resolve(`{{t:${key}}}`) || key}
                    </p>
                    <p className="text-sm font-medium">
                      {formatDateTime(value as string, localeHint)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* その他フィールド */}
          {otherEntries.length > 0 && (
            <dl className="space-y-1">
              {otherEntries.map(([key, value]) => (
                <div key={key} className="grid grid-cols-3 gap-1 text-sm">
                  <dt className="text-muted-foreground">
                    {i18nResolver.resolve(`{{t:${key}}}`) || key}
                  </dt>
                  <dd className="col-span-2 font-medium">{String(value)}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}

      {action.mcp?.tool && (
        <p className="text-xs text-muted-foreground">
          Tool: <code className="rounded bg-muted px-1">{action.mcp.tool}</code>
        </p>
      )}
    </div>
  );
};

export default ScheduleSummaryPreview;
