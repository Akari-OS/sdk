/**
 * X Sender — MCP server entry point (MCP-Declarative Tier)
 * Module ID: com.akari.example.x-sender
 *
 * This process is spawned by AKARI Shell when the module is active.
 * Communication happens via stdio (StdioServerTransport).
 *
 * Tools implemented (Phase 0):
 *   x.post       — Immediate tweet
 *   x.schedule   — Scheduled tweet
 *   x.draft_save — Save draft to Pool
 *   x.get_me     — Fetch authenticated user info
 *
 * All tools are declared in:
 *   - akari.toml        [mcp].tools
 *   - panel.schema.json actions[].mcp.tool
 *
 * akari module certify verifies the triple-consistency of these declarations.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { xPost, xSchedule, xDraftSave, xGetMe } from "./tools.js";

// ---------------------------------------------------------------------------
// MCP server instance
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "com.akari.example.x-sender",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Tool: x.post
// Immediate tweet. HITL is enforced by Shell (panel.schema.json hitl.require: true).
// ---------------------------------------------------------------------------

server.tool(
  "x.post",
  "Post a tweet to X immediately. Requires HITL approval (handled by Shell).",
  {
    text: z
      .string()
      .max(280)
      .describe("Tweet text (max 280 characters). Required."),
    media: z
      .array(z.string())
      .max(4)
      .optional()
      .describe("Pool item IDs for media attachments (max 4). Optional."),
    dry_run: z
      .boolean()
      .default(false)
      .describe(
        "If true, skip the X API call and return a mock result. Useful for testing."
      ),
  },
  async (args) => {
    try {
      const result = await xPost(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Surface structured errors for offline / auth failures
      if (message.startsWith("not_authenticated")) {
        throw new McpError(ErrorCode.InvalidRequest, message);
      }
      if (message.startsWith("network_error")) {
        throw new McpError(ErrorCode.InternalError, message);
      }
      throw new McpError(ErrorCode.InternalError, `x.post failed: ${message}`);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: x.schedule
// Scheduled tweet. HITL is enforced by Shell (panel.schema.json hitl.require: true).
// ---------------------------------------------------------------------------

server.tool(
  "x.schedule",
  "Schedule a tweet for future publication. Requires HITL approval (handled by Shell).",
  {
    text: z
      .string()
      .max(280)
      .describe("Tweet text (max 280 characters). Required."),
    publish_at: z
      .string()
      .datetime()
      .describe("ISO 8601 UTC datetime for publication. Required."),
    media: z
      .array(z.string())
      .max(4)
      .optional()
      .describe("Pool item IDs for media attachments (max 4). Optional."),
  },
  async (args) => {
    try {
      const result = await xSchedule(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InternalError, `x.schedule failed: ${message}`);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: x.draft_save
// Save draft to Pool. No HITL (internal memory layer write).
// Fully offline-capable.
// ---------------------------------------------------------------------------

server.tool(
  "x.draft_save",
  "Save a tweet draft to Pool. No HITL required (internal storage only).",
  {
    text: z
      .string()
      .max(280)
      .describe("Draft tweet text (max 280 characters). Required."),
    media: z
      .array(z.string())
      .optional()
      .describe("Pool item IDs for media attachments. Optional."),
  },
  async (args) => {
    try {
      const result = await xDraftSave(args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new McpError(ErrorCode.InternalError, `x.draft_save failed: ${message}`);
    }
  }
);

// ---------------------------------------------------------------------------
// Tool: x.get_me
// Fetch authenticated user info. No HITL (read-only).
// Returns cached result if offline.
// ---------------------------------------------------------------------------

server.tool(
  "x.get_me",
  "Return info about the currently authenticated X account. Used for auth verification.",
  {},
  async () => {
    try {
      const result = await xGetMe();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("not_authenticated")) {
        throw new McpError(ErrorCode.InvalidRequest, message);
      }
      throw new McpError(ErrorCode.InternalError, `x.get_me failed: ${message}`);
    }
  }
);

// ---------------------------------------------------------------------------
// Transport + startup
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // MCP server is now listening on stdio.
  // Shell connects to this process after spawning it via akari.toml [mcp].server.
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
