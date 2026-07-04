/**
 * @file Switch.tsx
 * ON/OFF トグル primitive（shell-ui 版）。
 *
 * akari-video `WorksPanelPrimitives.WorksSwitch` の見た目・挙動（role="switch" の
 * ON/OFF トグル）を shell-ui の Tailwind 慣習で書き直したもの。コピーではなく
 * 再実装であり、Video 側の plain CSS（`--accent` 等の CSS 変数）は持ち込まず、
 * shadcn/radix-ui ベースの semantic クラス（bg-primary / bg-input 等）に置き換えている。
 *
 * 想定用途: Writer 投稿先タブのプラットフォーム行の表示/非表示トグルなど
 * （`ListRow` の `actions` slot に置く想定）。
 */
import { Switch as SwitchPrimitive } from "radix-ui"

import { cn } from "./lib/cn"

export interface SwitchProps {
  /** ON/OFF の現在値 */
  checked: boolean
  /** トグル操作時に呼ばれる callback（次の状態を渡す） */
  onChange: (checked: boolean) => void
  /** アクセシビリティ用ラベル（aria-label 兼 title フォールバック） */
  label: string
  /** title 属性を label と別にしたい場合に指定 */
  title?: string
  disabled?: boolean
  className?: string
}

/** ON/OFF トグル primitive（radix-ui `Switch` を shell-ui の見た目で使う薄いラッパー） */
export function Switch({
  checked,
  onChange,
  label,
  title,
  disabled = false,
  className,
}: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className={cn(
        "peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80",
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-4 rounded-full bg-background ring-0 transition-transform",
          "data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0",
          "dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground",
        )}
      />
    </SwitchPrimitive.Root>
  )
}
