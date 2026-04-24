/**
 * SearchProvider abstraction.
 *
 * Phase 0 ships Tavily only; Brave / Exa are skeletons that throw until
 * Phase 1 (see ../../docs/examples/web-search.md). The interface is kept
 * narrow on purpose — any provider that implements `search` + `deepRead`
 * can slot in without touching tools.ts.
 *
 * To add a new provider:
 *   1. Create providers/<name>.ts implementing SearchProvider
 *   2. Add a case in getProvider() below
 *   3. Add the endpoint to akari.toml [permissions].external-network
 *   4. Document the API key env var in README.md
 */

import type {
  SearchResponse,
  DeepReadResponse,
  ProviderName,
} from "../types.js";
import { TavilyProvider } from "./tavily.js";
import { BraveProvider } from "./brave.js";
import { ExaProvider } from "./exa.js";

export interface SearchArgs {
  query: string;
  max_results?: number;
  include_answer?: boolean;
  /** If true, include raw article body when the provider supports it. */
  include_raw_content?: boolean;
}

export interface SearchProvider {
  readonly name: ProviderName;
  search(args: SearchArgs): Promise<SearchResponse>;
  deepRead(url: string): Promise<DeepReadResponse>;
}

/**
 * Resolve a SearchProvider instance from a name (or from $PROVIDER env var).
 * Defaults to "tavily" in Phase 0.
 */
export function getProvider(name?: string): SearchProvider {
  const resolved = (name ?? process.env.PROVIDER ?? "tavily").toLowerCase();
  switch (resolved) {
    case "tavily":
      return new TavilyProvider();
    case "brave":
      return new BraveProvider();
    case "exa":
      return new ExaProvider();
    default:
      throw new Error(
        `Unknown provider: ${resolved}. Expected one of: tavily, brave, exa.`
      );
  }
}
