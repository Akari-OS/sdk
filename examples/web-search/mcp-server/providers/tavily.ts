/**
 * TavilyProvider — Phase 0 active provider.
 *
 * Uses @tavily/core (REST wrapper) rather than a local MCP server because
 * AI-answer search is a single-call flow with no persistent session.
 *
 * Tavily features used:
 *   - include_answer=true  → AI-synthesized answer in the same response
 *   - include_raw_content  → full article body, avoids a second fetch
 *
 * API key: TAVILY_API_KEY (env). Phase 1 migrates to AKARI Keychain.
 * Docs: https://docs.tavily.com/
 */

import type {
  SearchResponse,
  DeepReadResponse,
  SearchResultItem,
} from "../types.js";
import type { SearchProvider, SearchArgs } from "./index.js";

// ---------------------------------------------------------------------------
// @tavily/core has its own types; we keep our own narrow shape to stay
// provider-agnostic at the boundary. Import lazily so missing deps during
// `akari app certify` Lint don't crash the static analyzer.
// ---------------------------------------------------------------------------

interface TavilySearchOptions {
  maxResults?: number;
  includeAnswer?: boolean;
  includeRawContent?: boolean;
}

interface TavilyRawResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  raw_content?: string | null;
  published_date?: string;
}

interface TavilyRawResponse {
  query: string;
  answer?: string;
  results: TavilyRawResult[];
}

interface TavilyClient {
  search(query: string, options?: TavilySearchOptions): Promise<TavilyRawResponse>;
}

async function getClient(): Promise<TavilyClient> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing TAVILY_API_KEY. Copy .env.example → .env and set your Tavily key."
    );
  }
  const mod = (await import("@tavily/core")) as {
    tavily: (opts: { apiKey: string }) => TavilyClient;
  };
  return mod.tavily({ apiKey });
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class TavilyProvider implements SearchProvider {
  readonly name = "tavily" as const;

  async search(args: SearchArgs): Promise<SearchResponse> {
    const client = await getClient();
    const raw = await client.search(args.query, {
      maxResults: args.max_results ?? 10,
      includeAnswer: args.include_answer ?? true,
      includeRawContent: args.include_raw_content ?? false,
    });

    const results: SearchResultItem[] = raw.results.map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.content,
      score: r.score,
      raw_content: r.raw_content ?? undefined,
      published_at: r.published_date,
    }));

    return {
      query: args.query,
      provider: this.name,
      results,
      answer: raw.answer,
      answer_sources: raw.answer ? results.map((r) => r.url) : undefined,
      fetched_at: new Date().toISOString(),
    };
  }

  /**
   * Tavily has no dedicated "fetch URL" endpoint; re-run search against the
   * URL itself with include_raw_content=true to get the full body. This is
   * the officially recommended pattern.
   */
  async deepRead(url: string): Promise<DeepReadResponse> {
    const client = await getClient();
    const raw = await client.search(url, {
      maxResults: 1,
      includeRawContent: true,
      includeAnswer: false,
    });
    const hit = raw.results.find((r) => r.url === url) ?? raw.results[0];
    if (!hit) {
      throw new Error(`deep_read: no content returned for ${url}`);
    }
    return {
      url: hit.url,
      title: hit.title,
      content_markdown: hit.raw_content ?? hit.content,
      provider: this.name,
      fetched_at: new Date().toISOString(),
    };
  }
}
