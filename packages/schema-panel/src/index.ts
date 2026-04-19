/**
 * @akari-os/schema-panel — public exports
 *
 * AKARI Panel Schema v0 の参考実装（core + binding + action dispatcher + HITL preview）
 *
 * メインコンポーネント:
 *   SchemaPanel         — panel.schema.json を受け取り UI をレンダリングする
 *
 * Types:
 *   PanelSchema         — Panel Schema v0 のルート型
 *   RenderContext       — 実行時クライアント群（Shell 側から注入）
 *   WidgetProps         — Widget コンポーネントの共通 props
 *   WidgetRegistry      — Widget 登録マップ
 *
 * Engines:
 *   BindingResolver     — Binding 解決エンジン
 *   ExpressionEvaluator — JSONLogic ラッパー
 *   ActionDispatcher    — Action 実行エンジン
 *   I18nResolver        — i18n 解決エンジン
 *
 * State:
 *   createPanelStore    — Panel ローカル state の Zustand store
 *   usePanelFieldValues — フィールド値マップのフック
 *
 * HITL:
 *   PreviewDialog         — HITL preview ダイアログ（ルーター）
 *   TextSummaryPreview    — text-summary タイプ
 *   ScheduleSummaryPreview— schedule-summary タイプ
 *   DiffPreview           — diff タイプ
 *   CustomMarkdownPreview — custom-markdown タイプ
 *
 * Stubs（開発 / テスト用）:
 *   createStubRenderContext — 全クライアントが stub の RenderContext
 */

// Main component
export { SchemaPanel } from "./SchemaPanel";
export type { SchemaPanelProps } from "./SchemaPanel";

// Types: Schema
export type {
  PanelSchema,
  Field,
  FieldBase,
  TextField,
  NumberField,
  SelectField,
  ToggleField,
  PoolPickerField,
  RichTextEditorField,
  DocOutlineTreeField,
  TableField,
  MarkdownField,
  Action,
  ActionKind,
  ActionType,
  McpCall,
  HandoffCall,
  OnSuccess,
  OnError,
  HitlPreview,
  HitlPreviewType,
  BindingPattern,
  WidgetOption,
  WidgetType,
  TabDefinition,
  LayoutType,
  ThemeHint,
  LocaleCode,
  LocaleDict,
  LocalesMap,
  Expression,
  I18nString,
  FieldRef,
} from "./types/schema";

// Types: Context
export type {
  RenderContext,
  McpClient,
  PoolClient,
  AmpClient,
  ModuleClient,
  NavigationClient,
  ToastClient,
  PoolItem,
  AmpRecord,
} from "./types/context";

// Stubs
export {
  createStubRenderContext,
  createStubMcpClient,
  createStubPoolClient,
  createStubAmpClient,
  createStubModuleClient,
  createStubNavigationClient,
  createStubToastClient,
} from "./types/context";

// Widget Registry
export type { WidgetRegistry, WidgetProps } from "./WidgetRegistry";
export { defaultWidgetRegistry, PlaceholderWidget } from "./WidgetRegistry";

// Engines
export { BindingResolver, parseBinding, resolveActionArgs } from "./engine/BindingResolver";
export type { ParsedBinding, PanelStateAccessor } from "./engine/BindingResolver";

export { ExpressionEvaluator, expressionEvaluator } from "./engine/ExpressionEvaluator";
export type { ExpressionContext } from "./engine/ExpressionEvaluator";

export { ActionDispatcher } from "./engine/ActionDispatcher";
export type { ShowHitlPreview } from "./engine/ActionDispatcher";

export { I18nResolver } from "./engine/I18nResolver";
export type { I18nResolverOptions } from "./engine/I18nResolver";

// State
export {
  createPanelStore,
  createStateAccessor,
  usePanelFieldValues,
  usePanelFieldValue,
  usePanelSetFieldValue,
  extractStateBindings,
} from "./state/usePanelState";
export type { PanelStateStore } from "./state/usePanelState";

// HITL
export { PreviewDialog } from "./hitl/PreviewDialog";
export type { PreviewDialogProps } from "./hitl/PreviewDialog";

export { TextSummaryPreview } from "./hitl/TextSummaryPreview";
export type { TextSummaryPreviewProps } from "./hitl/TextSummaryPreview";

export { ScheduleSummaryPreview } from "./hitl/ScheduleSummaryPreview";
export type { ScheduleSummaryPreviewProps } from "./hitl/ScheduleSummaryPreview";

export { DiffPreview } from "./hitl/DiffPreview";
export type { DiffPreviewProps } from "./hitl/DiffPreview";

export { CustomMarkdownPreview } from "./hitl/CustomMarkdownPreview";
export type { CustomMarkdownPreviewProps } from "./hitl/CustomMarkdownPreview";
