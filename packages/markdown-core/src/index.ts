/**
 * Markdown <-> HTML conversion utilities.
 *
 * - marked: Markdown -> HTML (preview / tiptap import)
 * - turndown: HTML -> Markdown (tiptap export)
 *
 * Defaults: GFM + breaks on the Markdown side, ATX headings + `-` bullets on
 * the turndown side.
 */

import { marked } from "marked";
import TurndownService from "turndown";

marked.setOptions({ breaks: true, gfm: true });

const turndown = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  emDelimiter: "*",
  strongDelimiter: "**",
});

/**
 * `data-akari-node` 規約: この属性を持つ要素は turndown の HTML->Markdown 変換で
 * 素通し（raw HTML のまま）にする。
 *
 * turndown はテキスト子を持たない未知の atom 要素（例: TipTap のカスタム
 * void ノードを描画した `<div data-akari-node="...">` ）を既定では空文字化して
 * 消してしまう。`data-akari-node` を付けた要素はこの規約により md<->html を
 * 素通りできるようになるため、Writer に限らず将来どのアプリがカスタム
 * TipTap ノード（プレースホルダ等）を追加する場合も、このマーカー属性を
 * 付与するだけで保存時の消失を回避できる（アプリ横断の汎用規約）。
 */
turndown.keep((node) => !!(node as HTMLElement).hasAttribute?.("data-akari-node"));

export function markdownToHtml(md: string): string {
  if (!md.trim()) return "";
  return marked.parse(md) as string;
}

export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return "";
  return turndown.turndown(html);
}
