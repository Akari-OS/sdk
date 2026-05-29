/**
 * @file types/header-action.ts
 * AKARI Studio 統一上部バー（shell 所有）に Full Tier app が差し込む
 * アプリ固有アクションの契約型。
 *
 * 背景:
 *   従来は shell 共通バー（AppHostPhase1Wrapper）と各アプリ独自バーの 2 本が
 *   縦に並び、「戻る」「ワーク名」が二重表示されていた。共通バーへ一本化し、
 *   アプリ固有のアクション（構造ビューア / 書き出し / 公開 等）だけを
 *   このディスクリプタ配列として shell に渡し、バー右側スロットに描画する。
 *
 * React は import map で shell・app 間共有のため（akari-video/vite.config.ts）、
 * `icon` に ReactNode、`onClick` に関数を境界越しに渡して安全。
 */

import type { ReactNode } from "react";

export interface HeaderAction {
  /** 安定キー（React key / 重複排除用） */
  id: string;
  /** ボタン表示ラベル */
  label: string;
  /** 任意アイコン。lucide 要素でも emoji 文字列でも可 */
  icon?: ReactNode;
  /**
   * 見た目のバリアント。
   * - "default": 通常のセカンダリボタン
   * - "primary": 強調アクション（video の「書き出し」相当、accent 色）
   */
  variant?: "default" | "primary";
  /** 無効化（例: clip 0 件で書き出し不可） */
  disabled?: boolean;
  /** tooltip（title 属性） */
  title?: string;
  /** クリックハンドラ */
  onClick: () => void;
}
