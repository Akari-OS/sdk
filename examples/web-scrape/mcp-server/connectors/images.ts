/**
 * Image collection connector (image-scrape-v1) — HUB-104 §8-3
 *
 * Collects <img> / og:image references from a target page (or Google Images
 * results), with source URL + page context (alt / caption). Every asset is
 * tagged usage_right: reference_only (AC-4). Actual byte download → Pool copy
 * happens in save_to_pool (stubbed for this first cut).
 */

import type { ScrapeSession } from "../core/browser.js";
import type { PolitenessGovernor } from "../core/governor.js";
import { domainOf } from "../core/governor.js";
import { detectBlock, BlockedError } from "../core/block-detector.js";
import type { ScrapeResponse, MediaAsset } from "../types.js";

export interface ImageScrapeArgs {
  /** Either a page URL to harvest, or a query for Google Images. */
  url?: string;
  query?: string;
  maxImages: number;
  minWidth: number;
}

export async function imageScrape(
  session: ScrapeSession,
  governor: PolitenessGovernor,
  args: ImageScrapeArgs,
): Promise<ScrapeResponse> {
  const target =
    args.url ??
    "https://www.google.com/search?tbm=isch&q=" +
      encodeURIComponent(args.query ?? "") +
      "&hl=ja";
  const domain = domainOf(target);

  const media = await governor.run(domain, async () => {
    const page = await session.newPage();
    try {
      const resp = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 });
      const html = await page.content();
      const block = detectBlock({
        status: resp?.status(),
        title: await page.title(),
        html,
        bodyBytes: Buffer.byteLength(html, "utf8"),
      });
      if (block.blocked) throw new BlockedError(block.reason ?? "unknown");

      // Light scroll to trigger lazy-loaded images (human-like, bounded).
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
      await page.waitForTimeout(800);

      const collected = await page.evaluate(
        (minWidth: number) => {
          const out: {
            type: "image";
            src: string;
            page_url: string;
            width?: number;
            height?: number;
            alt?: string;
          }[] = [];
          const seen = new Set<string>();

          const og = document.querySelector(
            'meta[property="og:image"]',
          ) as HTMLMetaElement | null;
          if (og?.content) {
            out.push({ type: "image", src: og.content, page_url: location.href });
            seen.add(og.content);
          }

          for (const img of Array.from(document.images)) {
            const src = img.currentSrc || img.src;
            if (!src || !src.startsWith("http") || seen.has(src)) continue;
            if (img.naturalWidth && img.naturalWidth < minWidth) continue;
            out.push({
              type: "image",
              src,
              page_url: location.href,
              width: img.naturalWidth || undefined,
              height: img.naturalHeight || undefined,
              alt: img.alt || undefined,
            });
            seen.add(src);
          }
          return out;
        },
        args.minWidth,
      );

      return collected.slice(0, args.maxImages) as MediaAsset[];
    } finally {
      await page.close();
    }
  });

  return {
    kind: "media_asset",
    source_connector: "image-scrape-v1",
    query: args.query,
    source_url: target,
    fetched_at: new Date().toISOString(),
    usage_right: "reference_only",
    media,
  };
}
