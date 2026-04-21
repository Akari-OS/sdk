/**
 * CustomMarkdownPreview
 *
 * HITL preview type: "custom-markdown"
 *
 * 任意 markdown テンプレートを承認ダイアログに表示する。
 * `preview_template` フィールドで指定された markdown を
 * フィールド値とi18nで補完して表示する。
 *
 * 使用例（notion-app-panel.schema.json から）:
 * ```json
 * "preview_template": "### {{t:hitl.create_page_heading}}\n\n**{{t:hitl.title}}**: {{page_title}}\n**{{t:hitl.parent_db}}**: {{page_parent_db}}"
 * ```
 *
 * TODO: markdown レンダリングは react-markdown や @akari/sdk の
 *       markdown widget を使う。v0 では生テキスト表示のみ。
 */

import React from "react";
import type { Action } from "../types/schema";
import type { I18nResolver } from "../engine/I18nResolver";

export interface CustomMarkdownPreviewProps {
  action: Action;
  resolvedArgs: Record<string, unknown>;
  fieldValues: Record<string, unknown>;
  i18nResolver: I18nResolver;
  previewTemplate?: string;
}

/**
 * テンプレート文字列を i18n + フィールド値で補完する。
 * 補完順序:
 * 1. {{t:key}} → i18n 解決
 * 2. {{fieldId}} / {{argKey}} → フィールド値 or args 値で置換
 */
function renderTemplate(
  template: string,
  fieldValues: Record<string, unknown>,
  resolvedArgs: Record<string, unknown>,
  i18nResolver: I18nResolver
): string {
  // 1. i18n 解決
  const i18nResolved = i18nResolver.resolve(template);

  // 2. {{key}} 置換（fieldValues + resolvedArgs のマージ）
  const allValues = { ...fieldValues, ...resolvedArgs };
  return i18nResolved.replace(/\{\{([^}]+)\}\}/g, (_match, key) => {
    const trimmedKey = key.trim();
    const value = allValues[trimmedKey];
    if (value === undefined) return `{{${trimmedKey}}}`;
    if (Array.isArray(value)) return String(value.length);
    return String(value);
  });
}

export const CustomMarkdownPreview: React.FC<CustomMarkdownPreviewProps> = ({
  action,
  resolvedArgs,
  fieldValues,
  i18nResolver,
  previewTemplate,
}) => {
  // template がない場合は args のサマリーを表示
  if (!previewTemplate) {
    return (
      <FallbackSummary
        action={action}
        resolvedArgs={resolvedArgs}
        i18nResolver={i18nResolver}
      />
    );
  }

  const rendered = renderTemplate(
    previewTemplate,
    fieldValues,
    resolvedArgs,
    i18nResolver
  );

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Preview
      </p>
      {/* TODO: react-markdown でレンダリングする (Phase 3b) */}
      {/* 現在はプレーンテキスト + 簡易見出し処理 */}
      <MarkdownTextRenderer text={rendered} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// 簡易 markdown テキストレンダラー
// ---------------------------------------------------------------------------

/**
 * markdown の最小サブセットをレンダリングする。
 * Phase 3b では react-markdown に差し替える。
 *
 * サポート:
 * - ### / ## / # 見出し
 * - **bold** → <strong>
 * - 段落（空行区切り）
 * - 改行
 */
const MarkdownTextRenderer: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let keyIdx = 0;

  for (const line of lines) {
    const key = keyIdx++;

    // 見出し
    const h3Match = line.match(/^###\s+(.+)/);
    const h2Match = line.match(/^##\s+(.+)/);
    const h1Match = line.match(/^#\s+(.+)/);
    if (h3Match) {
      elements.push(
        <h3 key={key} className="text-base font-semibold">
          {parseBold(h3Match[1])}
        </h3>
      );
      continue;
    }
    if (h2Match) {
      elements.push(
        <h2 key={key} className="text-lg font-semibold">
          {parseBold(h2Match[1])}
        </h2>
      );
      continue;
    }
    if (h1Match) {
      elements.push(
        <h1 key={key} className="text-xl font-bold">
          {parseBold(h1Match[1])}
        </h1>
      );
      continue;
    }

    // 空行
    if (line.trim() === "") {
      elements.push(<div key={key} className="h-2" />);
      continue;
    }

    // 通常行（bold 処理あり）
    elements.push(
      <p key={key} className="text-sm">
        {parseBold(line)}
      </p>
    );
  }

  return <div className="space-y-1">{elements}</div>;
};

/**
 * **bold** を <strong> に変換する。
 */
function parseBold(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return <strong key={i}>{boldMatch[1]}</strong>;
    }
    return part;
  });
}

// ---------------------------------------------------------------------------
// Fallback（template なし時）
// ---------------------------------------------------------------------------

const FallbackSummary: React.FC<{
  action: Action;
  resolvedArgs: Record<string, unknown>;
  i18nResolver: I18nResolver;
}> = ({ action, resolvedArgs }) => {
  const entries = Object.entries(resolvedArgs).filter(
    ([, v]) => v !== null && v !== undefined
  );
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Action Summary
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No arguments.</p>
      ) : (
        <dl className="space-y-1">
          {entries.map(([key, value]) => (
            <div key={key} className="grid grid-cols-3 gap-1 text-sm">
              <dt className="text-muted-foreground">{key}</dt>
              <dd className="col-span-2 truncate font-medium">
                {Array.isArray(value)
                  ? `${value.length} item(s)`
                  : typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {action.mcp?.tool && (
        <p className="text-xs text-muted-foreground">
          Tool: <code className="rounded bg-muted px-1">{action.mcp.tool}</code>
        </p>
      )}
    </div>
  );
};

export default CustomMarkdownPreview;
