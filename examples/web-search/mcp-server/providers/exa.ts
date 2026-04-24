/**
 * ExaProvider — Phase 1 stub.
 *
 * Exa provides neural / semantic web search and has a first-class
 * `summary` field comparable to Tavily's `answer`, which maps cleanly to
 * SearchResponse.answer. Enabling this provider involves:
 *   1. Sign up at https://exa.ai and get an API key
 *   2. Set EXA_API_KEY in .env
 *   3. Replace the throw below with `exa-js` client calls
 *   4. Map `result.text` → snippet, `result.summary` → answer when requested
 */

import type { SearchResponse, DeepReadResponse } from "../types.js";
import type { SearchProvider, SearchArgs } from "./index.js";

export class ExaProvider implements SearchProvider {
  readonly name = "exa" as const;

  async search(_args: SearchArgs): Promise<SearchResponse> {
    throw new Error(
      "ExaProvider is a Phase 1 stub. Implement calls via exa-js and remove this throw."
    );
  }

  async deepRead(_url: string): Promise<DeepReadResponse> {
    throw new Error("ExaProvider.deepRead is a Phase 1 stub.");
  }
}
