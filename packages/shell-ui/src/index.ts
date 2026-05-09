/**
 * @file index.ts
 * Public API for @akari-os/shell-ui — shell と app 共有の汎用 UI 部品。
 */

export { Button, buttonVariants } from "./button"
export { ImagePreviewModal } from "./ImagePreview"
export { RadarChart, STAT_KEYS, type RadarChartProps } from "./RadarChart"
export { DelegationAccordion } from "./DelegationAccordion"
export { MaterialPanel, type MaterialPick } from "./MaterialPanel"
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
export { cn } from "./lib/cn"
