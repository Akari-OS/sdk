/**
 * Web Scrape — MCP tool implementations (HUB-104 Phase 0)
 *
 * Tools:
 *   scrape.search        — Google results (+ optional deep read)   [§8-1]
 *   scrape.images        — image collection (reference_only)        [§8-3]
 *   scrape.page          — single-page extract                      [page-v1]
 *   scrape.save_to_pool  — persist results/media to Pool (HITL)     [§6-3 / AC-4]
 *
 * Conventions (mirrors the web-search example):
 *   - HITL gate (save_to_pool) is enforced by Shell BEFORE this runs
 *   - Pool / AMP calls are stubbed until the SDK is wired in
 *   - Pacing / robots / circuit-breaker live in core/* (PolitenessGovernor)
 *   - On anti-bot challenge, connectors throw BlockedError (no CAPTCHA solving)
 */

import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { resolveConfig } from "./config.js";
import { PolitenessGovernor, domainOf } from "./core/governor.js";
import { launchSession } from "./core/browser.js";
import type { ScrapeSession } from "./core/browser.js";
import { fetchRobots } from "./core/robots.js";
import { googleSearch } from "./connectors/google-search.js";
import { imageScrape } from "./connectors/images.js";
import { readPage } from "./connectors/page.js";
import type {
  ScrapeResponse,
  ScrapeResultItem,
  MediaAsset,
  UsageRight,
  SaveToPoolResult,
} from "./types.js";

const UA_TOKEN = "AkariResearchBot";

/** Anonymous (no-login) profile for Google / web / images (§6-5). */
function anonymousProfileDir(): string {
  return join(homedir(), ".akari", "web-scrape", "profiles", "anonymous");
}

/** Open a session, run `fn`, always close. */
async function withSession<T>(fn: (s: ScrapeSession) => Promise<T>): Promise<T> {
  const cfg = resolveConfig();
  const session = await launchSession(cfg, { userDataDir: anonymousProfileDir() });
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

// ---------------------------------------------------------------------------
// Tool: scrape.search
// ---------------------------------------------------------------------------

export interface ScrapeSearchInput {
  query: string;
  max_results?: number;
  deep_read_top?: number;
}

export async function scrapeSearch(input: ScrapeSearchInput): Promise<ScrapeResponse> {
  const cfg = resolveConfig();
  const governor = new PolitenessGovernor(cfg);
  return withSession((session) =>
    googleSearch(session, governor, {
      query: input.query,
      maxResults: Math.min(input.max_results ?? 10, cfg.max_pages_per_run),
      deepReadTop: input.deep_read_top ?? 0,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tool: scrape.images
// ---------------------------------------------------------------------------

export interface ScrapeImagesInput {
  url?: string;
  query?: string;
  max_images?: number;
  min_width?: number;
}

export async function scrapeImages(input: ScrapeImagesInput): Promise<ScrapeResponse> {
  if (!input.url && !input.query) {
    throw new Error("scrape.images requires either `url` or `query`.");
  }
  const cfg = resolveConfig();
  const governor = new PolitenessGovernor(cfg);
  return withSession((session) =>
    imageScrape(session, governor, {
      url: input.url,
      query: input.query,
      maxImages: Math.min(input.max_images ?? 20, cfg.max_pages_per_run),
      minWidth: input.min_width ?? 200,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tool: scrape.page
// ---------------------------------------------------------------------------

export interface ScrapePageInput {
  url: string;
}

export async function scrapePage(input: ScrapePageInput): Promise<ScrapeResponse> {
  const cfg = resolveConfig();
  const governor = new PolitenessGovernor(cfg);
  const domain = domainOf(input.url);
  const robots = cfg.respect_robots_txt
    ? await fetchRobots(new URL(input.url).origin, UA_TOKEN)
    : undefined;

  return withSession(async (session) => {
    const item = await governor.run(
      domain,
      async () => {
        const page = await session.newPage();
        try {
          return await readPage(page, input.url);
        } finally {
          await page.close();
        }
      },
      robots?.crawlDelayMs,
    );
    return {
      kind: "scrape_result",
      source_connector: "page-v1",
      source_url: input.url,
      fetched_at: new Date().toISOString(),
      usage_right: "reference_only",
      results: [item],
    } satisfies ScrapeResponse;
  });
}

// ---------------------------------------------------------------------------
// Tool: scrape.save_to_pool
// ---------------------------------------------------------------------------

export interface ScrapeSaveInput {
  query?: string;
  source_connector: string;
  results?: ScrapeResultItem[];
  media?: MediaAsset[];
  /** Rights flag for everything saved in this call. Default reference_only (AC-4). */
  usage_right?: UsageRight;
  tags?: string[];
  note?: string;
  goal_ref?: string;
}

export async function scrapeSaveToPool(input: ScrapeSaveInput): Promise<SaveToPoolResult> {
  const {
    query,
    source_connector,
    results = [],
    media = [],
    usage_right = "reference_only",
    tags = [],
    note,
    goal_ref,
  } = input;

  if (results.length === 0 && media.length === 0) {
    throw new Error("scrape.save_to_pool requires at least one result or media item.");
  }

  const baseTags = ["research", "web-scrape", source_connector, `right:${usage_right}`, ...tags];
  const pool_ids: string[] = [];

  for (const r of results) {
    pool_ids.push(await poolPut(buildTextRecord(r, source_connector, usage_right, baseTags, note)));
  }
  for (const m of media) {
    // storage_mode: copy — the source may vanish, so Pool keeps the bytes (§6-3).
    pool_ids.push(await poolPutMedia(m, source_connector, usage_right, baseTags));
  }

  await ampRecord({
    kind: "research-action",
    goal_ref,
    data: {
      source_connector,
      query: query ?? null,
      usage_right,
      result_count: results.length,
      media_count: media.length,
      saved_to_pool: pool_ids,
    },
  });

  return { pool_ids, count: pool_ids.length, saved_at: new Date().toISOString() };
}

// ---------------------------------------------------------------------------
// Pool record helpers
// ---------------------------------------------------------------------------

interface PoolRecord {
  mime: string;
  tags: string[];
  source: Record<string, unknown>;
  body: string;
  usage_right: UsageRight;
}

function buildTextRecord(
  item: ScrapeResultItem,
  connector: string,
  usage_right: UsageRight,
  baseTags: string[],
  note: string | undefined,
): PoolRecord {
  return {
    mime: "text/scrape-result",
    tags: [...baseTags, ...(item.tags ?? [])],
    usage_right,
    source: {
      connector,
      url: item.url,
      author: item.author,
      fetched_at: new Date().toISOString(),
    },
    body: [
      `# ${item.title ?? item.url}`,
      "",
      item.url,
      "",
      item.snippet ?? "",
      item.body_text ? `\n---\n\n${item.body_text}` : "",
      note ? `\n---\n${note}` : "",
    ]
      .join("\n")
      .trim(),
  };
}

// ---------------------------------------------------------------------------
// Pool / AMP stubs (mirror the web-search example; replace with @akari-os/sdk)
// ---------------------------------------------------------------------------

async function poolPut(record: PoolRecord): Promise<string> {
  const id = `pool_${randomUUID()}`;
  console.error(
    `[pool] put stub — id=${id} mime=${record.mime} right=${record.usage_right} tags=${record.tags.join(",")}`,
  );
  return id;
}

async function poolPutMedia(
  m: MediaAsset,
  connector: string,
  usage_right: UsageRight,
  baseTags: string[],
): Promise<string> {
  const id = `pool_${randomUUID()}`;
  // TODO: download bytes (storage_mode: copy) and register via @akari-os/sdk.
  console.error(
    `[pool] put media stub — id=${id} connector=${connector} type=${m.type} right=${usage_right} src=${m.src} tags=${baseTags.join(",")}`,
  );
  return id;
}

async function ampRecord(entry: {
  kind: string;
  goal_ref?: string;
  data: Record<string, unknown>;
}): Promise<void> {
  console.error(
    `[amp] record stub — kind=${entry.kind} goal_ref=${entry.goal_ref ?? "(none)"} keys=${Object.keys(entry.data).join(",")}`,
  );
}
