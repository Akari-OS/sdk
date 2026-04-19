/**
 * Notion MCP Server — AKARI Module SDK example
 *
 * Starts a local MCP server that exposes 10 Notion tools.
 * Communicates over stdio (default MCP transport).
 *
 * Usage:
 *   NOTION_ACCESS_TOKEN=<token> tsx mcp-server/index.ts
 *
 * In production this process is spawned by AKARI Core, which injects
 * credentials from the Keychain and manages the process lifecycle.
 *
 * Alternative (recommended for production):
 *   Set `server = "npm:@notionhq/mcp"` in akari.toml to use the official
 *   Notion MCP server directly — no local implementation needed.
 *
 * See README.md for a full explanation of the tradeoffs.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveAuthContext } from "./oauth.js";
import { ALL_TOOLS } from "./tools.js";

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "com.akari.example.notion",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Register tools
// ---------------------------------------------------------------------------

for (const tool of ALL_TOOLS) {
  server.tool(
    tool.name,
    tool.description,
    // McpServer.tool() accepts a JSON Schema shape; zod .shape works for objects.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tool.inputSchema as any).shape ?? {},
    async (args: unknown) => {
      // Validate input with the tool's Zod schema
      const parsed = tool.inputSchema.safeParse(args);
      if (!parsed.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Invalid input: ${parsed.error.message}`,
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await tool.handler(parsed.data);
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
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Auth check + start
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // Resolve credentials early — fail fast if not configured
  try {
    resolveAuthContext();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[notion-mcp] Auth error: ${message}`);
    console.error(
      "[notion-mcp] Set NOTION_ACCESS_TOKEN or NOTION_INTEGRATION_TOKEN, " +
        "or complete the OAuth flow via AKARI Shell.",
    );
    // TODO (T-4c): Instead of exiting, trigger AKARI Shell re-auth prompt:
    //   await akari.permission.oauth.requestReauth("notion.com")
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(
    `[notion-mcp] Server started (${ALL_TOOLS.length} tools registered)`,
  );
}

main().catch((err) => {
  console.error("[notion-mcp] Fatal error:", err);
  process.exit(1);
});
