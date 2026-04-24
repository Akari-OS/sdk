/**
 * BraveProvider — Phase 1 stub.
 *
 * Brave Search provides an independent index with good privacy properties.
 * Enabling this provider involves:
 *   1. Sign up at https://brave.com/search/api/ and get an API key
 *   2. Set BRAVE_API_KEY in .env
 *   3. Replace the throw below with real calls to https://api.search.brave.com/res/v1/web/search
 *   4. Brave does not return a pre-synthesized AI answer; synthesize via AKARI Agents
 *      (Phase 1 research.summarize) or leave `answer` undefined.
 */

import type { SearchResponse, DeepReadResponse } from "../types.js";
import type { SearchProvider, SearchArgs } from "./index.js";

export class BraveProvider implements SearchProvider {
  readonly name = "brave" as const;

  async search(_args: SearchArgs): Promise<SearchResponse> {
    throw new Error(
      "BraveProvider is a Phase 1 stub. Implement REST calls to api.search.brave.com and remove this throw."
    );
  }

  async deepRead(_url: string): Promise<DeepReadResponse> {
    throw new Error("BraveProvider.deepRead is a Phase 1 stub.");
  }
}
