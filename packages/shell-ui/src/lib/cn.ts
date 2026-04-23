import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Tailwind クラス名をマージするユーティリティ。
 * shadcn 系コンポーネントの合成に使う。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
