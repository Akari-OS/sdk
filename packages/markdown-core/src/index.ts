/**
 * Markdown <-> HTML conversion utilities.
 *
 * - marked: Markdown -> HTML (preview / tiptap import)
 * - turndown: HTML -> Markdown (tiptap export)
 *
 * Defaults: GFM + breaks on the Markdown side, ATX headings + `-` bullets on
 * the turndown side. Callers override via `configure()` if they need different
 * behaviour.
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

export function markdownToHtml(md: string): string {
  if (!md.trim()) return "";
  return marked.parse(md) as string;
}

export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return "";
  return turndown.turndown(html);
}
