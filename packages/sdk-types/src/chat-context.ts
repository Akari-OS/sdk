/**
 * @file chat-context.ts
 * Runtime: Chat UI context selection フレームワーク。
 *
 * ユーザが選択したテキスト・画像・画面要素・プリセットを
 * Chat プロンプトに合成するための共通基盤。
 *
 * spec: AKARI-HUB-010
 *
 * NOTE: `@akari-os/sdk/context` は ACE Context 構築プロトコルの型定義
 * （`context.build({ intent, goal_ref })`）で、ここは Chat UI の
 * 今日の runtime。subpath を別にしている。
 *
 * @packageDocumentation
 */

export type ContextType =
  | "text-selection"
  | "image-region"
  | "video-frame"
  | "preset"
  | "pointer-element"

/**
 * Chat UI 上で選択された context の基底。
 *
 * NOTE: `@akari-os/sdk/context` の `ContextItem` は ACE Context 構築プロトコル側で、
 * ここは Chat UI の today-runtime。subpath を別にしている。
 */
export interface ContextItem {
  id: string
  type: ContextType
  label: string
}

export interface TextSelectionContext extends ContextItem {
  type: "text-selection"
  selectedText: string
  startOffset: number
  endOffset: number
}

export function createTextSelectionContext(
  selectedText: string,
  startOffset: number,
  endOffset: number,
): TextSelectionContext {
  const label =
    selectedText.length > 20 ? selectedText.slice(0, 20) + "…" : selectedText
  return {
    id: Math.random().toString(36).slice(2),
    type: "text-selection",
    label,
    selectedText,
    startOffset,
    endOffset,
  }
}

/** プリセットコンテキスト（プラットフォーム特性、スキルヒント等） */
export interface PresetContext extends ContextItem {
  type: "preset"
  content: string
  /** プリセットのカテゴリ（表示用） */
  category?: string
}

export function createPresetContext(
  label: string,
  content: string,
  category?: string,
): PresetContext {
  return {
    id: Math.random().toString(36).slice(2),
    type: "preset",
    label,
    content,
    category,
  }
}

/** ポインターで画面要素を指して追加したコンテキスト */
export interface PointerElementContext extends ContextItem {
  type: "pointer-element"
  /** 要素の textContent（trim + 長さカット済み） */
  content: string
  /** 選択時の tagName（例: "DIV" "BUTTON"） */
  tagName?: string
  /** 要素のサイズ（例: "320x48"） */
  size?: string
}

export function createPointerElementContext(
  content: string,
  tagName?: string,
  size?: string,
): PointerElementContext {
  const label = content.length > 24 ? content.slice(0, 24) + "…" : content
  return {
    id: Math.random().toString(36).slice(2),
    type: "pointer-element",
    label: label || (tagName ? `<${tagName.toLowerCase()}>` : "要素"),
    content,
    tagName,
    size,
  }
}

/** 画像コンテキスト（添付画像を AI に送る） */
export interface ImageContext extends ContextItem {
  type: "image-region"
  /** 画像の data URL (base64) */
  dataUrl: string
  /** 画像のファイル名 */
  fileName: string
}

export function createImageContext(
  dataUrl: string,
  fileName: string,
): ImageContext {
  return {
    id: Math.random().toString(36).slice(2),
    type: "image-region",
    label: `画像: ${fileName.length > 15 ? fileName.slice(0, 15) + "…" : fileName}`,
    dataUrl,
    fileName,
  }
}

/** コンテキスト配列から AI プロンプト用テキストを組み立てる */
export function contextsToPromptText(contexts: ContextItem[]): string {
  if (contexts.length === 0) return ""
  const parts = contexts.map((ctx, i) => {
    if (ctx.type === "text-selection") {
      const tc = ctx as TextSelectionContext
      return `[選択箇所 ${i + 1}]\n「${tc.selectedText}」`
    }
    if (ctx.type === "preset") {
      const pc = ctx as PresetContext
      return `[${pc.category ?? "コンテキスト"}] ${pc.content}`
    }
    if (ctx.type === "image-region") {
      const ic = ctx as ImageContext
      return `[添付画像 ${i + 1}: ${ic.fileName}]\n（画像が添付されています。この画像の内容を考慮してください）`
    }
    if (ctx.type === "pointer-element") {
      const pe = ctx as PointerElementContext
      const meta = [
        pe.tagName ? `<${pe.tagName.toLowerCase()}>` : null,
        pe.size,
      ]
        .filter(Boolean)
        .join(" ")
      return `[🎯 画面要素 ${i + 1}${meta ? ` ${meta}` : ""}]\n${pe.content}`
    }
    return `[コンテキスト ${i + 1}] ${ctx.label}`
  })
  return parts.join("\n\n") + "\n\n"
}
