/**
 * TextSummaryPreview
 *
 * HITL preview type: "text-summary"
 *
 * text 系フィールドの要約を承認ダイアログに表示する。
 * X Sender のような「投稿前の内容確認」ユースケースに対応。
 *
 * 表示内容:
 * - resolvedArgs の中から文字列フィールドを抽出して列挙
 * - 文字数カウントを表示（text / textarea バインディングの場合）
 * - 配列フィールド（添付ファイル等）は件数を表示
 */

import React from "react";
import type { Action } from "../types/schema";
import type { I18nResolver } from "../engine/I18nResolver";

export interface TextSummaryPreviewProps {
  action: Action;
  resolvedArgs: Record<string, unknown>;
  fieldValues: Record<string, unknown>;
  i18nResolver: I18nResolver;
}

export const TextSummaryPreview: React.FC<TextSummaryPreviewProps> = ({
  action,
  resolvedArgs,
  i18nResolver,
}) => {
  const entries = Object.entries(resolvedArgs).filter(
    ([, value]) => value !== null && value !== undefined
  );

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Text Summary
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No content to display.</p>
      ) : (
        <dl className="space-y-2">
          {entries.map(([key, value]) => (
            <div key={key}>
              <dt className="text-xs font-medium text-muted-foreground">
                {i18nResolver.resolve(`{{t:${key}}}`) || key}
              </dt>
              <dd className="mt-0.5 text-sm">
                <TextValueDisplay value={value} />
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* 文字数表示（MCP tool 名から "post" 系を検出した場合） */}
      {action.mcp?.tool && (
        <p className="mt-2 text-xs text-muted-foreground">
          Tool: <code className="rounded bg-muted px-1">{action.mcp.tool}</code>
        </p>
      )}
    </div>
  );
};

const TextValueDisplay: React.FC<{ value: unknown }> = ({ value }) => {
  if (typeof value === "string") {
    const isLong = value.length > 100;
    return (
      <span className="block whitespace-pre-wrap break-words">
        {isLong ? value.slice(0, 100) + "…" : value}
        {typeof value === "string" && value.length > 0 && (
          <span className="ml-1 text-xs text-muted-foreground">
            ({value.length} chars)
          </span>
        )}
      </span>
    );
  }
  if (Array.isArray(value)) {
    return (
      <span className="text-muted-foreground">{value.length} item(s)</span>
    );
  }
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span>{String(value)}</span>;
};

export default TextSummaryPreview;
