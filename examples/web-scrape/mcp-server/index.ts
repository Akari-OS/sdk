/**
 * Web Scrape — MCP server entry point (MCP-Declarative Tier)
 * App ID: com.akari.example.web-scrape
 *
 * Spawned by AKARI Shell; communicates via stdio (StdioServerTransport).
 * Reference implementation of AKARI-HUB-104 (Web Research & Scraping Connector)
 * Phase 0: Google search / image collection / page extract / Pool save.
 *
 * Channel policy (HUB-104 §5-1): browser-only sources here. X is API-only
 * (HUB-099, the web-search example). Instagram scrape (login session) is a
 * Phase 1b connector and is NOT included in this first cut.
 *
 * All tools are declared in akari.toml [mcp].tools AND panel.schema.json;
 * `akari app certify` verifies the triple-consistency.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  scrapeSearch,
  scrapeImages,
  scrapePage,
  scrapeSaveToPool,
} from "./tools.js";

const server = new McpServer({
  name: "com.akari.example.web-scrape",
  version: "0.1.0",
});

function ok(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

function fail(tool: string, err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  throw new McpError(ErrorCode.InternalError, `${tool} failed: ${message}`);
}

// ---------------------------------------------------------------------------
// Tool: scrape.search
// ---------------------------------------------------------------------------

server.tool(
  "scrape.search",
  "Scrape Google search results for a query (title/url/snippet). Optionally deep-read the top N links. Internal-use fallback to SerpAPI (HUB-099). Throws on anti-bot challenge.",
  {
    query: z.string().min(1).describe("Search query. Required."),
    max_results: z.number().int().min(1).max(50).default(10).describe("Max results (1-50)."),
    deep_read_top: z
      .number()
      .int()
      .min(0)
      .max(10)
      .default(0)
      .describe("Deep-read the top N result links for full body text (0 = list only)."),
  },
  async (args) => {
    try {
      return ok(await scrapeSearch(args));
    } catch (err) {
      fail("scrape.search", err);
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: scrape.images
// ---------------------------------------------------------------------------

server.tool(
  "scrape.images",
  "Collect image references (src + alt/caption + source URL) from a page URL or an image-search query. All items are tagged usage_right: reference_only.",
  {
    url: z.string().url().optional().describe("Page to harvest images from."),
    query: z.string().optional().describe("Image-search query (used if url is absent)."),
    max_images: z.number().int().min(1).max(100).default(20).describe("Max images (1-100)."),
    min_width: z.number().int().min(0).default(200).describe("Skip images narrower than this."),
  },
  async (args) => {
    try {
      return ok(await scrapeImages(args));
    } catch (err) {
      fail("scrape.images", err);
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: scrape.page
// ---------------------------------------------------------------------------

server.tool(
  "scrape.page",
  "Fetch a single URL and extract its title + readable body text. Honours robots.txt Crawl-delay. Throws on anti-bot challenge.",
  {
    url: z.string().url().describe("URL to fetch. Required."),
  },
  async (args) => {
    try {
      return ok(await scrapePage(args));
    } catch (err) {
      fail("scrape.page", err);
    }
  },
);

// ---------------------------------------------------------------------------
// Tool: scrape.save_to_pool
// ---------------------------------------------------------------------------

server.tool(
  "scrape.save_to_pool",
  "Persist selected scrape results and/or media to Pool with a usage_right flag (default reference_only). HITL preview is rendered by Shell before this runs.",
  {
    source_connector: z.string().describe("Connector that produced the items."),
    query: z.string().optional().describe("Original query, for tagging."),
    results: z
      .array(
        z.object({
          title: z.string().optional(),
          url: z.string().url(),
          snippet: z.string().optional(),
          body_text: z.string().optional(),
          author: z.string().optional(),
          caption: z.string().optional(),
          tags: z.array(z.string()).optional(),
        }),
      )
      .optional()
      .describe("Textual results to persist."),
    media: z
      .array(
        z.object({
          type: z.enum(["image", "video"]),
          src: z.string().url(),
          page_url: z.string().url(),
          width: z.number().optional(),
          height: z.number().optional(),
          alt: z.string().optional(),
          caption: z.string().optional(),
        }),
      )
      .optional()
      .describe("Media assets to persist (storage_mode: copy)."),
    usage_right: z
      .enum(["reference_only", "own", "licensed", "public_domain"])
      .default("reference_only")
      .describe("Rights flag. Default reference_only (AC-4)."),
    tags: z.array(z.string()).optional(),
    note: z.string().optional(),
    goal_ref: z.string().optional().describe("AMP goal reference."),
  },
  async (args) => {
    try {
      return ok(await scrapeSaveToPool(args));
    } catch (err) {
      fail("scrape.save_to_pool", err);
    }
  },
);

// ---------------------------------------------------------------------------
// Transport + startup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
