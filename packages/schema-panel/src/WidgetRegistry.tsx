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

  // 表示（Medium priority）
  markdown: PlaceholderWidget,
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

  // データ（Medium）
  table: PlaceholderWidget,
  list: PlaceholderWidget,
  "card-grid": PlaceholderWidget,

  // Action（High priority）
  button: PlaceholderWidget,
  link: PlaceholderWidget,
  menu: PlaceholderWidget,
};
