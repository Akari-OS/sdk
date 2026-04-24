/**
 * Web Search — MCP server entry point (MCP-Declarative Tier)
 * App ID: com.akari.example.web-search
 *
 * Spawned by AKARI Shell; communicates via stdio (StdioServerTransport).
 *
 * Tools implemented (Phase 0):
 *   research.search        — Query + optional AI answer
 *   research.deep_read     — Fetch single URL's full body
 *   research.save_to_pool  — Persist selected results / answers to Pool (HITL)
 *
 * All tools are declared in:
 *   - akari.toml        [mcp].tools
 *   - panel.schema.json actions[].mcp.tool
 *
 * akari app certify verifies the triple-consistency of these declarations.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  researchSearch,
  researchDeepRead,
  researchSaveToPool,
} from "./tools.js";

const server = new McpServer({
  name: "com.akari.example.web-search",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Tool: research.search
// ---------------------------------------------------------------------------

server.tool(
  "research.search",
  "Run a web search via the configured provider (default: Tavily). If include_answer is true, the response carries a provider-synthesized AI answer alongside the results.",
  {
    query: z.string().min(1).describe("Search query. Required."),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10)
      .describe("Maximum number of results (1-20)."),
    include_answer: z
      .boolean()
      .default(true)
      .describe(
        "If true, request a provider-synthesized AI answer (Tavily include_answer)."
      ),
    provider: z
      .enum(["tavily", "brave", "exa"])
      .optional()
      .describe(
        "Provider override. Defaults to $PROVIDER or 'tavily'. Phase 0: only 'tavily' is implemented."
      ),
  },
  async (args) => {
    try {
      const result = await researchSearch(args);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new McpError(
        ErrorCode.InternalError,
        `research.search failed: ${message}`
      );
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: research.deep_read
// ---------------------------------------------------------------------------

server.tool(
  "research.deep_read",
  "Fetch a single URL's full article body as markdown. Uses the same provider as research.search.",
  {
    url: z.string().url().describe("URL to fetch. Required."),
    provider: z
      .enum(["tavily", "brave", "exa"])
      .optional()
      .describe("Provider override."),
  },
  async (args) => {
    try {
      const result = await researchDeepRead(args);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new McpError(
        ErrorCode.InternalError,
        `research.deep_read failed: ${message}`
      );
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: research.save_to_pool
// ---------------------------------------------------------------------------

server.tool(
  "research.save_to_pool",
  "Save selected search results (and/or an AI answer) to Pool. HITL preview is rendered by Shell before this tool runs.",
  {
    query: z.string().min(1).describe("Original search query. Required."),
    provider: z
      .string()
      .describe("Provider name that produced the items (e.g. 'tavily')."),
    items: z
      .array(
        z.object({
          kind: z
            .enum(["result", "answer"])
            .describe("'result' for a single hit, 'answer' for the AI answer."),
          title: z.string(),
          url: z
            .string()
            .url()
            .optional()
            .describe("Required when kind = 'result'."),
          snippet: z.string().optional(),
          body: z
            .string()
            .optional()
            .describe("Full markdown body if research.deep_read has populated it."),
          answer_sources: z
            .array(z.string().url())
            .optional()
            .describe("Required when kind = 'answer'."),
        })
      )
      .min(1)
      .describe("Items to persist. At least one."),
    tags: z
      .array(z.string())
      .optional()
      .describe("Extra tags in addition to the defaults."),
    note: z
      .string()
      .optional()
      .describe("Operator memo appended to every saved record."),
    goal_ref: z
      .string()
      .optional()
      .describe("AMP goal reference to associate this save with."),
  },
  async (args) => {
    try {
      const result = await researchSaveToPool(args);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new McpError(
        ErrorCode.InternalError,
        `research.save_to_pool failed: ${message}`
      );
    }
  }
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
