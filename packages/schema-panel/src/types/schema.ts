/**
 * Panel Schema v0 TypeScript 型定義
 *
 * AKARI Panel Schema v0 の完全な型定義。
 * Shell の汎用 Schema レンダラ（SchemaPanel）が消費する。
 *
 * @schema akari://panel-schema/v0
 */

// ---------------------------------------------------------------------------
// Utility types
// ---------------------------------------------------------------------------

/** i18n キー参照を含む文字列。例: "{{t:post.body}}" */
export type I18nString = string;

/** フィールド参照式。例: "$fieldId", "$fieldId != null" (シュガー記法) */
export type FieldRef = string;

/** JSONLogic オブジェクト（正規形）または シュガー記法文字列 */
export type Expression = Record<string, unknown> | string;

// ---------------------------------------------------------------------------
// Binding
// ---------------------------------------------------------------------------

/**
 * Binding パターン（Panel Schema v0 §6.4）
 *
 * - `mcp.<tool>.<param>`  : 指定 MCP ツールの引数にバインド
 * - `pool.<query_id>`     : Pool 検索結果を初期値に
 * - `amp.<record_kind>.<field>` : AMP レコードから初期値 / 保存先
 * - `state.<key>`         : Panel ローカル state（揮発）
 * - `const.<value>`       : 固定値
 */
export type BindingPattern =
  | `mcp.${string}`
  | `pool.${string}`
  | `amp.${string}`
  | `state.${string}`
  | `const.${string}`;

// ---------------------------------------------------------------------------
// Widget option
// ---------------------------------------------------------------------------

export interface WidgetOption {
  value: string;
  label: I18nString;
}

// ---------------------------------------------------------------------------
// Widget types (Widget Catalog v0, Panel Schema v0 §6.2)
// ---------------------------------------------------------------------------

export type WidgetType =
  // テキスト入力
  | "text"
  | "textarea"
  | "password"
  | "email"
  | "url"
  // 数値
  | "number"
  | "slider"
  | "stepper"
  // 選択
  | "select"
  | "multi-select"
  | "radio"
  | "checkbox"
  | "toggle"
  // 日時
  | "date"
  | "time"
  | "datetime"
  | "datetime-optional"
  | "duration"
  // AKARI 固有
  | "pool-picker"
  | "amp-query"
  | "module-picker"
  | "agent-picker"
  // Documents (Office 系)
  | "rich-text-editor"
  | "doc-outline-tree"
  | "sheet-row-picker"
  | "cell-range-picker"
  | "slide-template-picker"
  | "slide-preview"
  // ファイル
  | "file-upload"
  | "image-preview"
  | "video-preview"
  // 表示
  | "markdown"
  | "badge"
  | "stat"
  | "progress"
  | "image"
  | "divider"
  // 構造
  | "tabs"
  | "accordion"
  | "split"
  | "group"
  | "repeater"
  // データ
  | "table"
  | "list"
  | "card-grid"
  // Action
  | "button"
  | "link"
  | "menu";

// ---------------------------------------------------------------------------
// Field (Widget instance)
// ---------------------------------------------------------------------------

export interface FieldBase {
  /** 一意 ID。action args での "$fieldId" 参照に使う */
  id: string;

  /** Widget の種別 */
  type: WidgetType;

  /** tabs レイアウト時のタブ所属 */
  tab?: string;

  /** ラベル（i18n 対応） */
  label?: I18nString;

  /** プレースホルダー（i18n 対応） */
  placeholder?: I18nString;

  /** ヘルパーテキスト（i18n 対応） */
  helperText?: I18nString;

  /** Binding（出所 / 書き込み先） */
  bind?: BindingPattern;

  /** 必須フィールド */
  required?: boolean;

  /** 読み取り専用 */
  read_only?: boolean;

  /** 表示条件（JSONLogic or シュガー記法） */
  visible_when?: Expression;

  /** 有効化条件（JSONLogic or シュガー記法） */
  enabled_when?: Expression;

  /** デフォルト値 */
  default?: unknown;

  /** コメントフィールド（Schema 内の _comment_section 等、無視する） */
  _comment_section?: string;
}

// テキスト系

export interface TextField extends FieldBase {
  type: "text" | "textarea" | "password" | "email" | "url";
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

// 数値系

export interface NumberField extends FieldBase {
  type: "number" | "slider" | "stepper";
  min?: number;
  max?: number;
  step?: number;
}

// 選択系（静的 options）

export interface SelectField extends FieldBase {
  type: "select" | "multi-select" | "radio" | "checkbox";
  options?: WidgetOption[];
  /** MCP ツール呼び出しで動的 options を取得 */
  options_source?: string;
  options_source_args?: Record<string, FieldRef | unknown>;
}

export interface ToggleField extends FieldBase {
  type: "toggle";
}

// Pool Picker

export interface PoolPickerField extends FieldBase {
  type: "pool-picker";
  /** 受け入れる MIME タイプ or Pool カテゴリ */
  accept?: string[];
  max?: number;
}

// rich-text-editor

export interface RichTextEditorField extends FieldBase {
  type: "rich-text-editor";
  toolbar?: string[];
}

// doc-outline-tree

export interface DocOutlineTreeField extends FieldBase {
  type: "doc-outline-tree";
  source?: string;
  source_args?: Record<string, FieldRef | unknown>;
}

// table / list / card-grid

export interface TableField extends FieldBase {
  type: "table" | "list" | "card-grid";
}

// markdown (static display)

export interface MarkdownField extends FieldBase {
  type: "markdown";
}

// catch-all for other widget types

export type Field =
  | TextField
  | NumberField
  | SelectField
  | ToggleField
  | PoolPickerField
  | RichTextEditorField
  | DocOutlineTreeField
  | TableField
  | MarkdownField
  | FieldBase; // fallback for all other types

// ---------------------------------------------------------------------------
// HITL Preview (Panel Schema v0 §6.5)
// ---------------------------------------------------------------------------

export type HitlPreviewType =
  | "text-summary"
  | "schedule-summary"
  | "diff"
  | "custom-markdown";

export interface HitlPreview {
  require: boolean;
  preview: HitlPreviewType;
  /**
   * custom-markdown / diff タイプで使うテンプレート文字列。
   * フィールド参照は {{fieldId}} で行う。
   */
  preview_template?: string;
}

// ---------------------------------------------------------------------------
// Action (Panel Schema v0 §6.5)
// ---------------------------------------------------------------------------

export type ActionKind = "primary" | "secondary" | "destructive" | "ghost";

export type ActionType =
  | "mcp.invoke" // MCP ツール呼び出し
  | "handoff"    // 他 Module への handoff
  | "navigate"   // Panel 内遷移
  | "submit";    // Form 送信

export interface McpCall {
  tool: string;
  args: Record<string, FieldRef | unknown>;
}

export interface HandoffCall {
  to: string;         // 遷移先 Module ID（例: "com.akari.video"）
  intent: string;     // 意図文字列
  payload: Record<string, FieldRef | unknown>;
}

export interface OnSuccess {
  toast?: I18nString;
  navigate?: string;
  /** MCP の返り値を state に書き込む先 */
  bind_result?: BindingPattern;
}

export interface OnError {
  toast?: I18nString;
}

export interface Action {
  id: string;
  label: I18nString;
  kind: ActionKind;

  /** Action の種別 */
  type: ActionType;

  /** tabs レイアウト時のタブ所属 */
  tab?: string;

  /** MCP ツール呼び出し定義（type: "mcp.invoke" のとき） */
  mcp?: McpCall;

  /** Module 間 handoff 定義（type: "handoff" のとき） */
  handoff?: HandoffCall;

  /** HITL ゲート */
  hitl?: HitlPreview;

  /** 有効化条件 */
  enabled_when?: Expression;

  /** 表示条件 */
  visible_when?: Expression;

  on_success?: OnSuccess;
  on_error?: OnError;

  _comment_section?: string;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export type LayoutType = "form" | "tabs" | "split" | "dashboard" | "list";

export interface TabDefinition {
  id: string;
  label: I18nString;
}

// ---------------------------------------------------------------------------
// Theme hint (Panel Schema v0 §6.8)
// ---------------------------------------------------------------------------

export interface ThemeHint {
  color_scheme?: "auto" | "light" | "dark";
  hint?: string;
  dark_mode_aware?: boolean;
}

// ---------------------------------------------------------------------------
// Locales (Panel Schema v0 §6.7)
// ---------------------------------------------------------------------------

/** locale コード（例: "ja", "en"） */
export type LocaleCode = string;

/** locale ディクショナリ。例: { "post.body": "本文" } */
export type LocaleDict = Record<string, string>;

export type LocalesMap = Record<LocaleCode, LocaleDict>;

// ---------------------------------------------------------------------------
// Panel Schema v0 Root
// ---------------------------------------------------------------------------

export interface PanelSchema {
  /** スキーマバージョン宣言 */
  $schema: "akari://panel-schema/v0";

  /** Panel のタイトル（i18n 対応） */
  title: I18nString;

  /** レイアウト種別 */
  layout: LayoutType;

  /** tabs レイアウト時のタブ定義 */
  tabs?: TabDefinition[];

  /** フィールド一覧 */
  fields: Field[];

  /** アクション一覧 */
  actions: Action[];

  /** テーマヒント */
  theme?: ThemeHint;

  /** 多言語化辞書（locale コード → 翻訳マップ） */
  locales?: LocalesMap;
}
