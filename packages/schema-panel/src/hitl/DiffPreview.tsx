/**
 * DiffPreview
 *
 * HITL preview type: "diff"
 *
 * before / after の差分を表示する。
 * Notion Page Editor の「ページ変更確認」などの destructive action 用。
 *
 * 表示内容:
 * - preview_template が指定されている場合: i18n 解決後のテンプレートテキストを表示
 * - before / after が args に含まれる場合: 行単位の diff を表示
 *
 * TODO: 実際の diff 計算は diff-match-patch や similar ライブラリを使う。
 *       v0 ではシンプルな before/after 比較のみ実装。
 */

import React from "react";
import type { Action } from "../types/schema";
import type { I18nResolver } from "../engine/I18nResolver";

export interface DiffPreviewProps {
  action: Action;
  resolvedArgs: Record<string, unknown>;
  fieldValues: Record<string, unknown>;
  i18nResolver: I18nResolver;
  previewTemplate?: string;
}

/**
 * テンプレート文字列内の {{fieldId}} を fieldValues で置換する。
 */
function interpolateTemplate(
  template: string,
  fieldValues: Record<string, unknown>,
  i18nResolver: I18nResolver
): string {
  // まず i18n 解決
  const i18nResolved = i18nResolver.resolve(template);
  // 次にフィールド値で置換
  return i18nResolved.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
    const value = fieldValues[key.trim()];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

export const DiffPreview: React.FC<DiffPreviewProps> = ({
  action,
  resolvedArgs,
  fieldValues,
  i18nResolver,
  previewTemplate,
}) => {
  // preview_template が指定されている場合は使用
  if (previewTemplate) {
    const rendered = interpolateTemplate(
      previewTemplate,
      { ...fieldValues, ...resolvedArgs },
      i18nResolver
    );
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Diff Preview
        </p>
        <div className="whitespace-pre-wrap text-sm">{rendered}</div>
      </div>
    );
  }

  // args から before / after を検出する試み
  const children = resolvedArgs.children ?? resolvedArgs.content ?? null;
  const blockId = resolvedArgs.block_id ?? resolvedArgs.page_id ?? null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Diff Preview
      </p>

      {blockId && (
        <p className="text-sm">
          <span className="text-muted-foreground">Target: </span>
          <code className="rounded bg-muted px-1 text-xs">{String(blockId)}</code>
        </p>
      )}

      {/* 変更後コンテンツのプレビュー */}
      {children !== null && children !== undefined ? (
        <div>
          <p className="mb-1 text-xs font-medium text-green-600 dark:text-green-400">
            + New content
          </p>
          <div className="max-h-48 overflow-y-auto rounded border border-green-200 bg-green-50 p-2 text-sm dark:border-green-900 dark:bg-green-950">
            <ContentPreview value={children} />
          </div>
        </div>
      ) : (
        <DiffArgsSummary resolvedArgs={resolvedArgs} i18nResolver={i18nResolver} />
      )}

      {action.mcp?.tool && (
        <p className="text-xs text-muted-foreground">
          Tool: <code className="rounded bg-muted px-1">{action.mcp.tool}</code>
        </p>
      )}
    </div>
  );
};

const ContentPreview: React.FC<{ value: unknown }> = ({ value }) => {
  if (typeof value === "string") {
    return <span className="whitespace-pre-wrap">{value}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <span className="text-muted-foreground">
        {value.length} block(s) to append
      </span>
    );
  }
  return <span>{JSON.stringify(value, null, 2)}</span>;
};

const DiffArgsSummary: React.FC<{
  resolvedArgs: Record<string, unknown>;
  i18nResolver: I18nResolver;
}> = ({ resolvedArgs }) => {
  const entries = Object.entries(resolvedArgs).filter(
    ([, v]) => v !== null && v !== undefined
  );
  return (
    <dl className="space-y-1">
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-3 gap-1 text-sm">
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="col-span-2 truncate font-medium">
            {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
};

export default DiffPreview;
