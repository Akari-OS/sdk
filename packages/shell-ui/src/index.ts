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
export { cn } from "./lib/cn"
