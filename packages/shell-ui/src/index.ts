/**
 * @file index.ts
 * Public API for @akari-os/shell-ui — shell と app 共有の汎用 UI 部品。
 */

export { Button, buttonVariants } from "./button"
export { ImagePreviewModal } from "./ImagePreview"
export { RadarChart, STAT_KEYS, type RadarChartProps } from "./RadarChart"
export { DelegationAccordion } from "./DelegationAccordion"
export { MaterialPanel, type MaterialItemType, type MaterialPick } from "./MaterialPanel"
export type { HeaderAction } from "./types/header-action"
export {
  useWorkStateSync,
  type UseWorkStateSyncOptions,
  type WorkStateSyncApp,
} from "./use-work-state-sync"
// AKARI-HUB-071 Phase 1
export {
  PoolBadge,
  type PoolBadgeProps,
  type PoolBadgeVariant,
} from "./PoolBadge"
export {
  StageView,
  STAGE_ORDER,
  type StageViewProps,
  type StageViewLayout,
} from "./StageView"
export {
  PoolBrowserView,
  POOL_PIN_MAX,
  type PoolBrowserViewProps,
} from "./PoolBrowserView"
export type {
  PoolKind,
  StageKind,
  PoolDisplay,
  StageDisplay,
  ContextPaneState,
} from "./types/pool"
// AKARI-HUB-071 Phase 1 v0.2.0 (T-14〜T-17): Variant 並列創作ブランチ UI
export {
  VariantTabBar,
  type VariantTabBarProps,
  type NewVariantChoice,
} from "./VariantTabBar"
export {
  VariantContextMenu,
  type VariantContextMenuProps,
} from "./VariantContextMenu"
export {
  CrossVariantCompareView,
  type CrossVariantCompareViewProps,
} from "./CrossVariantCompareView"
export {
  useVariantList,
  useActiveVariant,
  useVariantAction,
  type VariantBackend,
} from "./use-variant"
export type {
  VariantDisplay,
  VariantList,
  WorkContext,
  CompareViewState,
  VariantAction,
} from "./types/variant"
// AKARI-HUB-071 Phase 1 (T-6 / T-7 / T-8): ContextPane + hooks + adapter
export {
  ContextPane,
  CONTEXT_PANE_COLLAPSED_LS_KEY,
  poolTarget,
  stageTarget,
  assetTarget,
  type ContextPaneProps,
} from "./ContextPane"
export {
  useContextPane,
  __internalRecordsToPaneState,
  type UseContextPaneOptions,
} from "./hooks/useContextPane"
export {
  useContextToggle,
  type UseContextToggleOptions,
} from "./hooks/useContextToggle"
export {
  createInMemoryContextAdapter,
  type InMemoryContextAdapter,
} from "./lib/in-memory-context-adapter"
export type {
  ContextAttachAdapter,
  ContextAttachRecord,
  ContextDisplayResolver,
  ContextTargetKind,
  ContextToggleTarget,
  UseContextPaneResult,
  UseContextToggleResult,
} from "./types/context-attach"
// AKARI-HUB-072 Phase 1 (T-1): Workflow / Step / Trace 共有型
export type {
  Workflow,
  Step,
  CheckpointUI,
  ParallelAggregation,
  ParallelVariantStrategy,
  ChangelogEntry,
  Trace,
  TraceEvent,
} from "./types/workflow"
// AKARI-HUB-072 Phase 1 (T-4): Checkpoint Step の inline 表示 component
export {
  CheckpointInline,
  type CheckpointInlineProps,
  type CheckpointInlineStep,
  type HumanResponse,
} from "./CheckpointInline"
// AKARI-HUB-072 Phase 1 (T-5): Workflow 編集 UI（Step list + 右パネル inspector）
export {
  WorkflowEditor,
  type WorkflowEditorProps,
  type WorkflowEditorLayout,
  type WorkflowEditorWorkflow,
  type EditableStep,
} from "./WorkflowEditor"
// AKARI-HUB-072 Phase 1 (T-6): Context budget 進捗バー + Step 別 breakdown
export {
  ContextBudgetBar,
  computeBudgetUsage,
  type ContextBudgetBarProps,
  type BudgetUsage,
} from "./ContextBudgetBar"
// AKARI-HUB-072 Phase 2 (T-11): Workflow version chain timeline + ワンクリック rollback
export {
  WorkflowVersionTimeline,
  type WorkflowVersionTimelineProps,
} from "./WorkflowVersionTimeline"
// AKARI-HUB-073 Phase 1 (T-1): Style Asset 共有型
export type {
  StyleAsset,
  StyleDomain,
  ExtractedRule,
  StyleChangelog,
  ReferenceDiff,
  RulesDiff,
} from "./types/style"
// AKARI-HUB-073 Phase 1 (T-2): Style 一覧パネル（domain filter + version badge）
export {
  StylePanel,
  STYLE_DOMAIN_FILTER_ORDER,
  type StylePanelProps,
} from "./StylePanel"
// AKARI-HUB-073 Phase 1 (T-3): Style 3 層編集 UI（reference / extracted / overrides）
export {
  StyleEditor,
  type StyleEditorProps,
  type StyleEditorStyle,
} from "./StyleEditor"
// AKARI-HUB-073 Phase 2 (T-11): Style version timeline + rollback ワンクリック
export {
  StyleVersionTimeline,
  type StyleVersionTimelineProps,
} from "./StyleVersionTimeline"
// AKARI-HUB-073 Phase 1 (T-6): Workflow Step に Style を attach する picker
export {
  StyleAttachPicker,
  parseStyleRef,
  formatStyleRef,
  type StyleAttachPickerProps,
} from "./StyleAttachPicker"
// AKARI-HUB-073 Phase 1 (T-5): Style 抽出 trigger hook + adapter
export {
  useStyleExtract,
  type UseStyleExtractOptions,
} from "./use-style-extract"
export {
  createLocalStorageStyleExtractAdapter,
  type LocalStorageStyleExtractAdapter,
  type StyleExtractScenario,
} from "./lib/local-storage-style-extract-adapter"
export type {
  StyleExtractAdapter,
  AssetSummary,
  ExtractTriggerKind,
  ExtractRulesRequest,
  ExtractRulesResponse,
  UseStyleExtractResult,
} from "./types/style-extract"
export { cn } from "./lib/cn"
// AKARI-HUB-079 Phase 1 (T2): Library Marketplace ブラウザ + types + hooks
export type {
  LibraryListingType,
  LibraryListing,
  LibraryFilter,
  LibraryListPage,
  LibraryInstallResult,
  LibraryBrowserBackend,
} from "./types/listing";
export {
  LibraryBrowser,
  type LibraryBrowserProps,
} from "./LibraryBrowser";
export {
  LibraryListingsView,
  type LibraryListingsViewProps,
} from "./LibraryListingsView";
export {
  useLibrary,
  useLibraryInstall,
  type UseLibraryResult,
  type UseLibraryInstallResult,
} from "./use-library";
// AKARI-HUB-038 Phase 3: 共有 UI 部品 (PanelTabs / InspectorShell / AIChatPanel)
export {
  PanelTabs,
  type PanelTabDef,
  type PanelTabsProps,
} from "./PanelTabs";
export {
  InspectorShell,
  type InspectorShellProps,
} from "./InspectorShell";
export {
  AIChatPanel,
  type AIChatPanelProps,
  type ChatMessage,
} from "./AIChatPanel";
