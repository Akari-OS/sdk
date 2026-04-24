/**
 * Web Search — MCP tool implementations
 *
 * Each function here corresponds to one MCP tool declared in:
 *   - akari.toml [mcp].tools
 *   - panel.schema.json actions[].mcp.tool
 *
 * Phase 0 tools (3):
 *   research.search        — Query + optional AI answer (via provider)
 *   research.deep_read     — Fetch single URL's full body
 *   research.save_to_pool  — Persist selected results / answers to Pool (HITL)
 *
 * Conventions:
 *   - HITL gates (save_to_pool) are enforced by Shell BEFORE this tool runs
 *   - All amp.record() calls MUST include goal_ref when available (AKARI App SDK §6.6)
 *   - Pool / AMP calls are currently stubbed; see poolPut() / ampRecord() below
 *   - Offline: search / deep_read throw; save_to_pool works (Pool is local)
 */

import { randomUUID } from "node:crypto";
import { getProvider } from "./providers/index.js";
import type {
  SearchResponse,
  DeepReadResponse,
  SaveToPoolResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Tool: research.search
// ---------------------------------------------------------------------------

export interface ResearchSearchInput {
  query: string;
  max_results?: number;
  include_answer?: boolean;
  provider?: string;
}

/**
 * Run a web search via the configured provider.
 *
 * Pool cache: Same `{provider, query}` within 1 hour returns the cached
 * response (mime: "application/research-cache"). Cache miss → live call +
 * cache write.
 *
 * HITL: not required (read-only).
 */
export async function researchSearch(
  input: ResearchSearchInput
): Promise<SearchResponse> {
  const { query, max_results = 10, include_answer = true, provider } = input;
  const p = getProvider(provider);

  const cached = await poolGetCache(p.name, query);
  if (cached) return cached;

  const response = await p.search({
    query,
    max_results,
    include_answer,
  });

  await poolPutCache(p.name, query, response);
  return response;
}

// ---------------------------------------------------------------------------
// Tool: research.deep_read
// ---------------------------------------------------------------------------

export interface ResearchDeepReadInput {
  url: string;
  provider?: string;
}

/**
 * Fetch a single URL's full body in markdown.
 * Does not write to Pool automatically; the caller decides via save_to_pool.
 */
export async function researchDeepRead(
  input: ResearchDeepReadInput
): Promise<DeepReadResponse> {
  const p = getProvider(input.provider);
  return p.deepRead(input.url);
}

// ---------------------------------------------------------------------------
// Tool: research.save_to_pool
// ---------------------------------------------------------------------------

export interface ResearchSaveItem {
  kind: "result" | "answer";
  title: string;
  url?: string;               // required when kind = "result"
  snippet?: string;
  body?: string;              // full markdown if available
  answer_sources?: string[];  // required when kind = "answer"
}

export interface ResearchSaveToPoolInput {
  query: string;
  provider: string;
  items: ResearchSaveItem[];
  tags?: string[];
  note?: string;
  goal_ref?: string;
}

/**
 * Persist selected search results (and/or an AI answer) to Pool.
 *
 * HITL: Shell shows a text-summary preview ("N items will be saved…")
 *       BEFORE this tool is called. This function trusts that approval has
 *       already been obtained.
 *
 * AMP: Records one `research-action` entry covering all saved items.
 */
export async function researchSaveToPool(
  input: ResearchSaveToPoolInput
): Promise<SaveToPoolResult> {
  const { query, provider, items, tags = [], note, goal_ref } = input;

  const query_slug = slugify(query);
  const baseTags = ["research", "web-search", query_slug, provider, ...tags];

  const pool_ids: string[] = [];
  for (const item of items) {
    const id = await poolPut(buildPoolRecord(item, provider, query, baseTags, note));
    pool_ids.push(id);
  }

  await ampRecord({
    kind: "research-action",
    goal_ref,
    data: {
      provider,
      query,
      result_count: items.length,
      saved_to_pool: pool_ids,
      answer_used: items.some((i) => i.kind === "answer"),
    },
  });

  return {
    pool_ids,
    count: pool_ids.length,
    saved_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Pool record shape helpers
// ---------------------------------------------------------------------------

interface PoolRecord {
  mime: string;
  tags: string[];
  source: Record<string, unknown>;
  body: string;
}

function buildPoolRecord(
  item: ResearchSaveItem,
  provider: string,
  query: string,
  baseTags: string[],
  note: string | undefined
): PoolRecord {
  if (item.kind === "answer") {
    const sources = item.answer_sources ?? [];
    const sourcesMd = sources.map((s) => `- ${s}`).join("\n");
    return {
      mime: "text/research-answer",
      tags: [...baseTags, "ai-answer"],
      source: {
        provider,
        query,
        answer_sources: sources,
      },
      body: [
        `# Answer for: ${query}`,
        "",
        item.body ?? item.snippet ?? "",
        sources.length ? `\n## Sources\n${sourcesMd}` : "",
        note ? `\n---\n${note}` : "",
      ]
        .join("\n")
        .trim(),
    };
  }

  // kind === "result"
  return {
    mime: "text/research-result",
    tags: baseTags,
    source: {
      provider,
      query,
      url: item.url,
      fetched_at: new Date().toISOString(),
    },
    body: [
      `# ${item.title}`,
      "",
      item.url ?? "",
      "",
      item.snippet ?? "",
      item.body ? `\n---\n\n${item.body}` : "",
      note ? `\n---\n${note}` : "",
    ]
      .join("\n")
      .trim(),
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function queryHash(query: string): string {
  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    hash = (hash << 5) - hash + query.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

// ---------------------------------------------------------------------------
// Pool / AMP stubs
//
// TODO: replace with real @akari-os/sdk calls once the SDK is wired in.
// Current behavior: log intent, return synthetic IDs so the rest of the
// flow works end-to-end during development (mirrors notion example pattern).
// ---------------------------------------------------------------------------

async function poolPut(record: PoolRecord): Promise<string> {
  const id = `pool_${randomUUID()}`;
  console.error(
    `[pool] put stub — id=${id} mime=${record.mime} tags=${record.tags.join(",")}`
  );
  return id;
}

async function poolGetCache(
  provider: string,
  query: string
): Promise<SearchResponse | null> {
  // TODO: pool.search({ tags: ["research-cache", queryHash(query), provider] })
  //       + TTL check (cached_at + ttl_sec >= now).
  console.error(
    `[pool] cache lookup stub — ${provider}:${queryHash(query)} → miss`
  );
  return null;
}

async function poolPutCache(
  provider: string,
  query: string,
  response: SearchResponse
): Promise<void> {
  console.error(
    `[pool] cache write stub — ${provider}:${queryHash(query)} ttl=3600 results=${response.results.length}`
  );
}

async function ampRecord(entry: {
  kind: string;
  goal_ref?: string;
  data: Record<string, unknown>;
}): Promise<void> {
  console.error(
    `[amp] record stub — kind=${entry.kind} goal_ref=${entry.goal_ref ?? "(none)"} keys=${Object.keys(entry.data).join(",")}`
  );
}
