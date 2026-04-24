/**
 * WidgetRegistry — Widget レジストリのインターフェース定義
 *
 * Phase 3b が個々の Widget 実装を提供する際の契約。
 * SchemaPanel は WidgetRegistry 経由で Widget を dispatch する。
 *
 * WidgetRegistry = { [widgetType: string]: React.ComponentType<WidgetProps> }
 *
 * Phase 3b 向け実装ガイド:
 * ```ts
 * // src/widgets/TextWidget.tsx
 * export const TextWidget: React.FC<WidgetProps> = ({ field, value, onChange, isEnabled, i18nResolver }) => {
 *   return (
 *     <div>
 *       <label>{i18nResolver.resolve(field.label ?? "")}</label>
 *       <input
 *         type="text"
 *         value={String(value ?? "")}
 *         onChange={(e) => onChange(e.target.value)}
 *         disabled={!isEnabled}
 *       />
 *     </div>
 *   );
 * };
 *
 * // src/widgets/index.ts
 * export const customWidgetRegistry: WidgetRegistry = {
 *   ...defaultWidgetRegistry,
 *   text: TextWidget,
 *   textarea: TextareaWidget,
 *   // ...
 * };
 * ```
 *
 * SchemaPanel への登録:
 * ```tsx
 * <SchemaPanel schema={schema} context={context} widgetRegistry={customWidgetRegistry} />
 * ```
 */

import React from "react";
import type { Field, WidgetType } from "./types/schema";
import type { RenderContext } from "./types/context";
import type { BindingResolver } from "./engine/BindingResolver";
import type { I18nResolver } from "./engine/I18nResolver";

// ---------------------------------------------------------------------------
// WidgetProps — すべての Widget が受け取る共通 props
// ---------------------------------------------------------------------------

export interface WidgetProps {
  /** フィールド定義（schema から） */
  field: Field;

  /** 現在の値 */
  value: unknown;

  /**
   * 値が変更されたときに呼ぶコールバック。
   * SchemaPanel が Zustand store を更新する。
   */
  onChange: (value: unknown) => void;

  /** 有効状態（enabled_when の評価結果） */
  isEnabled: boolean;

  /** i18n 解決器 */
  i18nResolver: I18nResolver;

  /**
   * Binding 解決器。
   * options_source 等の動的データ取得に使う。
   */
  bindingResolver: BindingResolver;

  /** 実行時コンテキスト（MCP / Pool / AMP クライアント） */
  context: RenderContext;
}

// ---------------------------------------------------------------------------
// WidgetRegistry 型
// ---------------------------------------------------------------------------

/**
 * Widget レジストリ。
 * WidgetType をキーに、対応する React コンポーネントをマップする。
 *
 * defaultWidgetRegistry はすべてのキーを PlaceholderWidget で埋める。
 * Phase 3b で各 Widget の実装を差し替える。
 */
export type WidgetRegistry = {
  [K in WidgetType]?: React.ComponentType<WidgetProps>;
} & {
  [key: string]: React.ComponentType<WidgetProps> | undefined;
};

// ---------------------------------------------------------------------------
// PlaceholderWidget — Phase 3b 実装前のフォールバック
// ---------------------------------------------------------------------------

/**
 * Phase 3b が実装する前の仮 Widget。
 * 「このフィールドはまだ実装されていない」と視覚的に示す。
 *
 * TODO: Phase 3b で各 Widget 実装に差し替える
 */
export const PlaceholderWidget: React.FC<WidgetProps> = ({
  field,
  value,
  onChange,
  isEnabled,
  i18nResolver,
}) => {
  const label = field.label ? i18nResolver.resolve(field.label) : field.id;

  return (
    <div className="rounded border border-dashed border-muted-foreground/40 p-3">
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        [{field.type}] {label}
      </p>
      <input
        type="text"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        disabled={!isEnabled}
        placeholder={`(${field.type} — Phase 3b placeholder)`}
        className="w-full rounded border border-input bg-transparent px-2 py-1 text-sm disabled:opacity-50"
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// MarkdownDisplayWidget — read-only markdown display (最小実装)
// ---------------------------------------------------------------------------

/**
 * `type: "markdown"` フィールド向けの最小 display widget。
 *
 * 本格的な markdown parser（react-markdown + remark-gfm）の導入は
 * widgets/Display/MarkdownWidget.tsx の TODO（Phase 3b 本番実装）。
 * それまでは `<pre>` + `whitespace-pre-wrap` で plain-text として描画する。
 * 値が空 / null の場合は何も描画しない（display widget の慣例）。
 */
const MarkdownDisplayWidget: React.FC<WidgetProps> = ({
  field,
  value,
  i18nResolver,
}) => {
  const label = field.label ? i18nResolver.resolve(field.label) : null;
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const content = raw ? i18nResolver.resolve(raw) : "";
  if (!content) return null;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      )}
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <pre className="whitespace-pre-wrap font-sans leading-relaxed">
          {content}
        </pre>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// TableDisplayWidget — read-only table display (最小実装)
// ---------------------------------------------------------------------------

/** `TableField` の runtime 形状（spec の `columns` は schema.ts の型に未反映）。 */
interface TableFieldRuntime {
  columns?: Array<{ key: string; label?: string }>;
}

/**
 * `type: "table"` フィールド向けの最小 table widget。
 *
 * `field.columns` の順で列を描画。値は array of object を想定し、
 * `row[col.key]` を String() 変換して表示する。
 * selectable / selection_bind / row_click_bind 等の interactive 機能は
 * 後続 Phase で実装（現状は pure display）。
 */
const TableDisplayWidget: React.FC<WidgetProps> = ({
  field,
  value,
  i18nResolver,
}) => {
  const label = field.label ? i18nResolver.resolve(field.label) : null;
  const columns = (field as unknown as TableFieldRuntime).columns ?? [];
  const rows = Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];

  if (columns.length === 0) {
    return (
      <div className="rounded border border-dashed border-muted-foreground/40 p-3 text-xs text-muted-foreground">
        [table] {label ?? field.id}: columns が定義されていません
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <p className="text-xs font-medium text-muted-foreground">
          {label} {rows.length > 0 ? `(${rows.length})` : ""}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">結果なし</p>
      ) : (
        <div className="overflow-x-auto rounded border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-3 py-2 text-left font-medium text-muted-foreground"
                  >
                    {col.label ? i18nResolver.resolve(col.label) : col.key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-border">
                  {columns.map((col) => {
                    const cell = row[col.key];
                    const display =
                      cell == null
                        ? ""
                        : typeof cell === "object"
                          ? JSON.stringify(cell)
                          : String(cell);
                    return (
                      <td
                        key={col.key}
                        className="px-3 py-2 align-top max-w-md truncate"
                        title={display}
                      >
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// defaultWidgetRegistry
// ---------------------------------------------------------------------------

/**
 * デフォルト Widget レジストリ。
 * すべての WidgetType を PlaceholderWidget にマップする。
 *
 * Phase 3b でこのオブジェクトを拡張 / 上書きして実装を提供する。
 *
 * 実装優先度（Panel Schema v0 T-2 より）:
 * - High: text, textarea, select, datetime, datetime-optional, button, toggle, radio
 * - Medium: pool-picker, multi-select, stepper, number, markdown, table
 * - Low: 残り（Documents 系、AKARI 固有系）
 */
export const defaultWidgetRegistry: WidgetRegistry = {
  // テキスト入力（High priority）
  text: PlaceholderWidget,
  textarea: PlaceholderWidget,
  password: PlaceholderWidget,
  email: PlaceholderWidget,
  url: PlaceholderWidget,

  // 数値（Medium）
  number: PlaceholderWidget,
  slider: PlaceholderWidget,
  stepper: PlaceholderWidget,

  // 選択（High priority）
  select: PlaceholderWidget,
  "multi-select": PlaceholderWidget,
  radio: PlaceholderWidget,
  checkbox: PlaceholderWidget,
  toggle: PlaceholderWidget,

  // 日時（High priority）
  date: PlaceholderWidget,
  time: PlaceholderWidget,
  datetime: PlaceholderWidget,
  "datetime-optional": PlaceholderWidget,
  duration: PlaceholderWidget,

  // AKARI 固有（High priority）
  "pool-picker": PlaceholderWidget,
  "amp-query": PlaceholderWidget,
  "app-picker": PlaceholderWidget,
  "agent-picker": PlaceholderWidget,

  // Documents（Low priority）
  "rich-text-editor": PlaceholderWidget,
  "doc-outline-tree": PlaceholderWidget,
  "sheet-row-picker": PlaceholderWidget,
  "cell-range-picker": PlaceholderWidget,
  "slide-template-picker": PlaceholderWidget,
  "slide-preview": PlaceholderWidget,

  // ファイル（Medium）
  "file-upload": PlaceholderWidget,
  "image-preview": PlaceholderWidget,
  "video-preview": PlaceholderWidget,

  // 表示（Medium priority）— markdown / table は最小実装済み
  markdown: MarkdownDisplayWidget,
  badge: PlaceholderWidget,
  stat: PlaceholderWidget,
  progress: PlaceholderWidget,
  image: PlaceholderWidget,
  divider: PlaceholderWidget,

  // 構造（Medium）
  tabs: PlaceholderWidget,
  accordion: PlaceholderWidget,
  split: PlaceholderWidget,
  group: PlaceholderWidget,
  repeater: PlaceholderWidget,

  // データ（Medium）— table は最小実装済み（list / card-grid は Phase 3b）
  table: TableDisplayWidget,
  list: PlaceholderWidget,
  "card-grid": PlaceholderWidget,

  // Action（High priority）
  button: PlaceholderWidget,
  link: PlaceholderWidget,
  menu: PlaceholderWidget,
};
