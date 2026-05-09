/**
 * @file PoolBadge.tsx
 * AKARI-HUB-071 Phase 1 (T-2): Pool / Stage 行に付ける状態バッジ。
 *
 * 表示種:
 *   - active    : 🟢 / ⚪ — Agent context に attach されているか（AC-6）
 *   - system    : 削除不可フラグ（Personal / Work Pool / 固定 Stage、AC-3 / AC-5）
 *   - ambient   : 🟢 ambient + 「常時有効」label（Personal Pool 専用、AC-2）
 *
 * 設計指針:
 *   - 単一の `<PoolBadge variant="..." />` で 4 種を扱う lightweight component
 *   - lucide-react に依存せず、絵文字 + 静的 svg dot で軽量実装
 *   - `cn` で外部 className を merge し、行末への inline 配置を許容
 *   - aria-label を必ず指定し、screen reader でも状態が読める
 *
 * 関連 spec / ADR:
 *   - spec-pool-ui-redesign-stage-context-pane (AKARI-HUB-071)
 *   - ADR-075 (Personal Pool ambient)
 *   - ADR-079 (Pool 統合)
 */

import * as React from "react"
import { cn } from "./lib/cn"

export type PoolBadgeVariant = "active" | "inactive" | "system" | "ambient"

export interface PoolBadgeProps
  extends Omit<React.HTMLAttributes<HTMLSpanElement>, "children"> {
  /**
   * バッジの種類。
   *   - 'active'   : 🟢 attach 中
   *   - 'inactive' : ⚪ detach
   *   - 'system'   : 削除不可（system Pool / Stage）
   *   - 'ambient'  : Personal Pool 専用（🟢 + 「常時有効」label）
   */
  variant: PoolBadgeVariant
  /**
   * label を非表示にして dot のみ表示する compact mode。
   * Pool 行末の小さなインジケータ用途を想定。default false。
   */
  compact?: boolean
  /** 表示文字列の override（多言語化時の差し替え用） */
  label?: string
}

interface VariantConfig {
  defaultLabel: string
  ariaLabel: string
  /** バッジ全体の class */
  containerClass: string
  /**
   * dot 部分の class。'inactive' は枠線のみ、'active'/'ambient' は塗り、
   * 'system' は dot を出さず錠アイコン的扱い（ここでは小さい四角）。
   */
  dotClass: string
}

const VARIANT_CONFIG: Record<PoolBadgeVariant, VariantConfig> = {
  active: {
    defaultLabel: "active",
    ariaLabel: "Agent コンテキストに attach 中",
    containerClass:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    dotClass: "bg-emerald-400",
  },
  inactive: {
    defaultLabel: "detached",
    ariaLabel: "Agent コンテキストに attach されていない",
    containerClass:
      "border-border bg-muted/40 text-muted-foreground",
    dotClass: "border border-muted-foreground/60 bg-transparent",
  },
  system: {
    defaultLabel: "system",
    ariaLabel: "system Pool / Stage（削除不可）",
    containerClass:
      "border-amber-500/30 bg-amber-500/10 text-amber-300",
    // 鍵感を出すため小さい四角
    dotClass: "rounded-sm bg-amber-400",
  },
  ambient: {
    defaultLabel: "常時有効",
    ariaLabel: "Personal Pool — Agent コンテキストに常時 attach（ambient）",
    containerClass:
      "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    dotClass: "bg-emerald-400",
  },
}

/**
 * Pool / Stage の状態を 1 行で表示する軽量バッジ。
 *
 * @example
 *   <PoolBadge variant="active" />            // 🟢 active
 *   <PoolBadge variant="ambient" />           // 🟢 常時有効
 *   <PoolBadge variant="system" compact />    // 鍵 dot のみ
 */
export function PoolBadge({
  variant,
  compact = false,
  label,
  className,
  title,
  ...rest
}: PoolBadgeProps): React.ReactElement {
  const config = VARIANT_CONFIG[variant]
  const text = label ?? config.defaultLabel
  const resolvedTitle = title ?? config.ariaLabel

  return (
    <span
      role="status"
      aria-label={config.ariaLabel}
      title={resolvedTitle}
      data-variant={variant}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[9px] font-medium leading-none whitespace-nowrap select-none",
        config.containerClass,
        compact && "px-1 py-px",
        className,
      )}
      {...rest}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-1.5 rounded-full",
          config.dotClass,
        )}
      />
      {!compact && <span>{text}</span>}
    </span>
  )
}
