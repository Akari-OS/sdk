/**
 * Web Search — shared types
 *
 * Provider-agnostic shapes returned by any SearchProvider implementation.
 * Individual providers (Tavily / Brave / Exa) map their native responses
 * into these shapes in providers/<name>.ts.
 */

// ---------------------------------------------------------------------------
// Provider-agnostic result shapes
// ---------------------------------------------------------------------------

/** A single search result row. */
export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  /** Provider-assigned relevance score (0..1). Optional. */
  score?: number;
  /** Raw article body in markdown if the provider returned it inline. */
  raw_content?: string;
  /** ISO 8601 publication timestamp if the provider returned it. */
  published_at?: string;
}

/** Full search response, possibly including a provider-generated AI answer. */
export interface SearchResponse {
  query: string;
  provider: ProviderName;
  results: SearchResultItem[];
  /** Provider-synthesized answer (e.g. Tavily include_answer). Absent if unavailable. */
  answer?: string;
  /** URLs used to generate `answer`. Absent if `answer` is absent. */
  answer_sources?: string[];
  fetched_at: string; // ISO 8601
}

/** Result of fetching a single URL's full text. */
export interface DeepReadResponse {
  url: string;
  title: string;
  content_markdown: string;
  provider: ProviderName;
  fetched_at: string;
}

// ---------------------------------------------------------------------------
// Provider identity
// ---------------------------------------------------------------------------

export type ProviderName = "tavily" | "brave" | "exa";

// ---------------------------------------------------------------------------
// MCP tool output shapes
// ---------------------------------------------------------------------------

/** Returned by research.save_to_pool on success. */
export interface SaveToPoolResult {
  pool_ids: string[];
  saved_at: string;
  count: number;
}
