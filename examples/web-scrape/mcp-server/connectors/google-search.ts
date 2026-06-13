/**
 * Google search connector (google-search-v1) — HUB-104 §8-1
 *
 * Renders the Google results page with Playwright, extracts the result list
 * (title / url / snippet), and optionally deep-reads the top N links.
 *
 * Selectors are intentionally fallback-arrays: Google's DOM changes often, and
 * per HUB-104 §8-2 selector breakage is fixed in the connector, not the spec.
 *
 * ToS note (§8-5 ゾーン B): Google prohibits robot access. Prefer SerpAPI
 * (HUB-099); this scrape path is the internal-use fallback.
 */

import type { ScrapeSession } from "../core/browser.js";
import type { PolitenessGovernor } from "../core/governor.js";
import { domainOf } from "../core/governor.js";
import { detectBlock, BlockedError } from "../core/block-detector.js";
import { readPage } from "./page.js";
import type { ScrapeResponse, ScrapeResultItem } from "../types.js";

const RESULT_CONTAINER_SELECTORS = ["div.g", "div.MjjYud", "div[data-hveid]"];

export interface GoogleSearchArgs {
  query: string;
  maxResults: number;
  deepReadTop: number; // 0 = list only
}

export async function googleSearch(
  session: ScrapeSession,
  governor: PolitenessGovernor,
  args: GoogleSearchArgs,
): Promise<ScrapeResponse> {
  const searchUrl =
    "https://www.google.com/search?q=" + encodeURIComponent(args.query) + "&hl=ja";
  const domain = domainOf(searchUrl);

  const results = await governor.run(domain, async () => {
    const page = await session.newPage();
    try {
      const resp = await page.goto(searchUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      const html = await page.content();
      const block = detectBlock({
        status: resp?.status(),
        title: await page.title(),
        html,
        bodyBytes: Buffer.byteLength(html, "utf8"),
      });
      if (block.blocked) throw new BlockedError(block.reason ?? "unknown");

      const items = await page.evaluate(
        (selectors: string[]) => {
          const out: { title: string; url: string; snippet: string }[] = [];
          const seen = new Set<string>();
          for (const sel of selectors) {
            const blocks = Array.from(document.querySelectorAll(sel));
            for (const b of blocks) {
              const a = b.querySelector("a[href^='http']") as HTMLAnchorElement | null;
              const h3 = b.querySelector("h3") as HTMLElement | null;
              if (!a || !h3) continue;
              const url = a.href;
              if (seen.has(url)) continue;
              const snippetEl = b.querySelector(
                "div[data-sncf], div[role='text'], .VwiC3b",
              ) as HTMLElement | null;
              out.push({
                title: h3.innerText.trim(),
                url,
                snippet: (snippetEl?.innerText ?? "").trim(),
              });
              seen.add(url);
            }
            if (out.length > 0) break; // first selector that yields hits wins
          }
          return out;
        },
        RESULT_CONTAINER_SELECTORS,
      );

      return items.slice(0, args.maxResults);
    } finally {
      await page.close();
    }
  });

  const enriched: ScrapeResultItem[] = results.map((r) => ({ ...r }));

  // Optional deep read of the top N links (each governed + paced per-domain).
  const n = Math.min(args.deepReadTop, enriched.length);
  for (let i = 0; i < n; i++) {
    const item = enriched[i];
    const linkDomain = domainOf(item.url);
    try {
      const read = await governor.run(linkDomain, async () => {
        const page = await session.newPage();
        try {
          return await readPage(page, item.url);
        } finally {
          await page.close();
        }
      });
      item.body_text = read.body_text;
    } catch {
      // Deep-read failures are non-fatal; keep the list entry.
    }
  }

  return {
    kind: "scrape_result",
    source_connector: "google-search-v1",
    query: args.query,
    source_url: searchUrl,
    fetched_at: new Date().toISOString(),
    usage_right: "reference_only",
    results: enriched,
  };
}
