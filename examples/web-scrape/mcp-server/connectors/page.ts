/**
 * Generic page extractor (page-v1)
 *
 * Navigates a single URL and pulls a title + readable body text + basic
 * metadata. Used by deep-read and as a building block for the search connector.
 * Runs BlockDetector (§7-1) on the loaded page.
 */

import type { Page } from "playwright";
import { detectBlock, BlockedError } from "../core/block-detector.js";
import type { ScrapeResultItem } from "../types.js";

/** Extract main readable text from the DOM (lightweight Readability-ish). */
async function extractBody(page: Page): Promise<{ title: string; text: string; html: string }> {
  return page.evaluate(() => {
    const pick = (sel: string) => document.querySelector(sel) as HTMLElement | null;
    const main =
      pick("article") ??
      pick("main") ??
      pick('[role="main"]') ??
      document.body;
    const title =
      document.title ||
      (pick("h1")?.innerText ?? "") ||
      (document.querySelector('meta[property="og:title"]') as HTMLMetaElement | null)?.content ||
      "";
    const text = (main?.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim();
    return { title: title.trim(), text, html: document.documentElement.outerHTML };
  });
}

export interface ReadPageResult extends ScrapeResultItem {
  blocked?: { reason: string };
}

/**
 * Load `url` in `page` and extract its content. Throws BlockedError if the
 * page looks like a challenge/anti-bot wall.
 */
export async function readPage(page: Page, url: string): Promise<ReadPageResult> {
  const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  const status = response?.status();

  const { title, text, html } = await extractBody(page);
  const block = detectBlock({
    status,
    title,
    html,
    bodyBytes: Buffer.byteLength(text, "utf8"),
  });
  if (block.blocked) throw new BlockedError(block.reason ?? "unknown");

  return {
    url,
    title,
    body_text: text,
  };
}
