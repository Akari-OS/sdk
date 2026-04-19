/**
 * Notion MCP tools — 10 tools with Zod schema validation and AKARI
 * Pool / AMP integration stubs.
 *
 * Each tool follows this pattern:
 *   1. Declare input schema with Zod
 *   2. Validate + extract args
 *   3. Call Notion API via @notionhq/client (stub: logs intent, returns mock)
 *   4. On write operations: enforce HITL (declared in panel.schema.json actions)
 *   5. On success: record to AMP and/or write to Pool
 *
 * HITL gates for tools 3, 4, 5, 10 are declared in panel.schema.json and
 * enforced by the AKARI Shell before the MCP tool is actually invoked.
 * The MCP server itself does NOT need to implement HITL — it can trust that
 * Shell has already obtained user confirmation.
 *
 * TODO items are marked per task ID from the spec.
 *
 * References:
 *   Notion API: https://developers.notion.com/reference
 *   @notionhq/client: https://github.com/makenotion/notion-sdk-js
 */

import { z } from "zod";
import type {
  NotionBlock,
  NotionBlockInput,
  NotionDatabase,
  NotionFilter,
  NotionPage,
  NotionPaginatedResponse,
  NotionSort,
  NotionUser,
} from "./types.js";

// ---------------------------------------------------------------------------
// Shared Zod schemas
// ---------------------------------------------------------------------------

const RichTextSchema = z.array(
  z.object({
    type: z.enum(["text", "mention", "equation"]).default("text"),
    text: z
      .object({
        content: z.string(),
        link: z.object({ url: z.string() }).nullable().optional(),
      })
      .optional(),
    plain_text: z.string().optional(),
  }),
);

const BlockInputSchema: z.ZodType<NotionBlockInput> = z.object({
  object: z.literal("block").optional(),
  type: z.string() as z.ZodType<NotionBlockInput["type"]>,
}).passthrough();

const FilterSchema: z.ZodType<NotionFilter> = z
  .object({
    property: z.string().optional(),
    operator: z.string().optional(),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
  })
  .passthrough();

const SortSchema: z.ZodType<NotionSort> = z.object({
  property: z.string().optional(),
  timestamp: z.enum(["created_time", "last_edited_time"]).optional(),
  direction: z.enum(["ascending", "descending"]),
});

// ---------------------------------------------------------------------------
// Tool registry type
// ---------------------------------------------------------------------------

export interface ToolDefinition<TInput> {
  name: string;
  description: string;
  inputSchema: z.ZodType<TInput>;
  handler: (args: TInput) => Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Tool 1: notion.search
// ---------------------------------------------------------------------------

const SearchInput = z.object({
  query: z.string().describe("Search query text"),
  filter: z
    .object({
      value: z.enum(["page", "database"]),
      property: z.literal("object"),
    })
    .optional()
    .describe("Narrow results to pages or databases"),
  sort: z
    .object({
      direction: z.enum(["ascending", "descending"]),
      timestamp: z.enum(["last_edited_time"]),
    })
    .optional(),
  page_size: z.number().int().min(1).max(100).default(10),
});

export const notionSearch: ToolDefinition<z.infer<typeof SearchInput>> = {
  name: "notion.search",
  description:
    "Search Notion workspace for pages and databases matching the query text.",
  inputSchema: SearchInput,
  async handler(args) {
    // TODO (T-2b): replace stub with real @notionhq/client call:
    //   const client = getNotionClient();
    //   return client.search({ query: args.query, filter: args.filter, ... });
    console.log("[notion.search] stub invoked", args);
    return {
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    } satisfies NotionPaginatedResponse<NotionPage | NotionDatabase>;
  },
};

// ---------------------------------------------------------------------------
// Tool 2: notion.query_database
// ---------------------------------------------------------------------------

const QueryDatabaseInput = z.object({
  database_id: z.string().describe("Notion database ID"),
  filter: FilterSchema.optional().describe("Filter condition"),
  sorts: z.array(SortSchema).optional().describe("Sort order"),
  page_size: z.number().int().min(1).max(100).default(20),
  start_cursor: z.string().optional().describe("Pagination cursor"),
});

export const notionQueryDatabase: ToolDefinition<
  z.infer<typeof QueryDatabaseInput>
> = {
  name: "notion.query_database",
  description:
    "Query a Notion database with optional filter and sort conditions. " +
    "Returns paginated page entries. Results are cached in Pool (tags: [notion-cache]) " +
    "for offline access.",
  inputSchema: QueryDatabaseInput,
  async handler(args) {
    // TODO (T-2b): replace stub:
    //   const client = getNotionClient();
    //   const result = await client.databases.query({ database_id: args.database_id, ... });
    //   await poolCache(result, ["notion-cache"]);  // TODO (T-7c)
    //   return result;
    console.log("[notion.query_database] stub invoked", args);
    return {
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    } satisfies NotionPaginatedResponse<NotionPage>;
  },
};

// ---------------------------------------------------------------------------
// Tool 3: notion.create_page  (HITL: custom-markdown, enforced by Shell)
// ---------------------------------------------------------------------------

const CreatePageInput = z.object({
  parent: z
    .union([
      z.object({ database_id: z.string() }),
      z.object({ page_id: z.string() }),
    ])
    .describe("Parent database or page"),
  properties: z
    .record(z.unknown())
    .describe("Page properties (title, status, tags, etc.)"),
  children: z
    .array(BlockInputSchema)
    .optional()
    .describe("Initial block children (page body)"),
  icon: z.unknown().optional(),
  cover: z.unknown().optional(),
});

export const notionCreatePage: ToolDefinition<
  z.infer<typeof CreatePageInput>
> = {
  name: "notion.create_page",
  description:
    "Create a new page (or database entry) in Notion. " +
    "HITL gate is required before this tool is called — Shell shows a custom-markdown preview. " +
    "After success, records kind='export-action' in AMP.",
  inputSchema: CreatePageInput,
  async handler(args) {
    // TODO (T-2b): replace stub:
    //   const client = getNotionClient();
    //   const page = await client.pages.create({ parent: args.parent, properties: args.properties, children: args.children });
    //   await ampRecord({ kind: "export-action", goal_ref: currentGoalRef(), payload: { page_id: page.id } });  // TODO (T-7a)
    //   return page;
    console.log("[notion.create_page] stub invoked", args);
    return {
      object: "page",
      id: "stub-page-id",
      url: "https://www.notion.so/stub-page-id",
    } as Partial<NotionPage>;
  },
};

// ---------------------------------------------------------------------------
// Tool 4: notion.update_page_properties  (HITL: diff, enforced by Shell)
// ---------------------------------------------------------------------------

const UpdatePagePropertiesInput = z.object({
  page_id: z.string().describe("Notion page ID"),
  properties: z
    .record(z.unknown())
    .describe("Properties to update (title, status, etc.)"),
});

export const notionUpdatePageProperties: ToolDefinition<
  z.infer<typeof UpdatePagePropertiesInput>
> = {
  name: "notion.update_page_properties",
  description:
    "Update properties of an existing Notion page. " +
    "HITL gate (diff preview) is required before this tool is called. " +
    "After success, records kind='export-action' in AMP.",
  inputSchema: UpdatePagePropertiesInput,
  async handler(args) {
    // TODO (T-2b): replace stub:
    //   const client = getNotionClient();
    //   const page = await client.pages.update({ page_id: args.page_id, properties: args.properties });
    //   await ampRecord({ kind: "export-action", ... });  // TODO (T-7a)
    //   return page;
    console.log("[notion.update_page_properties] stub invoked", args);
    return {
      object: "page",
      id: args.page_id,
    } as Partial<NotionPage>;
  },
};

// ---------------------------------------------------------------------------
// Tool 5: notion.append_block_children  (HITL: diff, enforced by Shell)
// ---------------------------------------------------------------------------

const AppendBlockChildrenInput = z.object({
  block_id: z.string().describe("Page or block ID to append children to"),
  children: z
    .array(BlockInputSchema)
    .max(100, "Notion API limit: max 100 blocks per call")
    .describe("Blocks to append"),
  after: z
    .string()
    .optional()
    .describe("Block ID after which to insert (default: end of page)"),
});

export const notionAppendBlockChildren: ToolDefinition<
  z.infer<typeof AppendBlockChildrenInput>
> = {
  name: "notion.append_block_children",
  description:
    "Append block children to an existing Notion page or block. " +
    "Maximum 100 blocks per call (Notion API limit). " +
    "HITL gate (diff preview) is required before this tool is called. " +
    "After success, records kind='export-action' in AMP.",
  inputSchema: AppendBlockChildrenInput,
  async handler(args) {
    // TODO (T-2b): replace stub:
    //   const client = getNotionClient();
    //   const result = await client.blocks.children.append({ block_id: args.block_id, children: args.children });
    //   await ampRecord({ kind: "export-action", ... });  // TODO (T-7a)
    //   return result;
    console.log("[notion.append_block_children] stub invoked", args);
    return {
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    } satisfies NotionPaginatedResponse<NotionBlock>;
  },
};

// ---------------------------------------------------------------------------
// Tool 6: notion.retrieve_page
// ---------------------------------------------------------------------------

const RetrievePageInput = z.object({
  page_id: z.string().describe("Notion page ID"),
  filter_properties: z
    .array(z.string())
    .optional()
    .describe("Limit returned properties to these IDs"),
});

export const notionRetrievePage: ToolDefinition<
  z.infer<typeof RetrievePageInput>
> = {
  name: "notion.retrieve_page",
  description:
    "Retrieve metadata and properties of a Notion page. " +
    "Read-only; no HITL required.",
  inputSchema: RetrievePageInput,
  async handler(args) {
    // TODO (T-2b): replace stub:
    //   const client = getNotionClient();
    //   return client.pages.retrieve({ page_id: args.page_id });
    console.log("[notion.retrieve_page] stub invoked", args);
    return {
      object: "page",
      id: args.page_id,
      properties: {},
    } as Partial<NotionPage>;
  },
};

// ---------------------------------------------------------------------------
// Tool 7: notion.retrieve_database
// ---------------------------------------------------------------------------

const RetrieveDatabaseInput = z.object({
  database_id: z.string().describe("Notion database ID"),
});

export const notionRetrieveDatabase: ToolDefinition<
  z.infer<typeof RetrieveDatabaseInput>
> = {
  name: "notion.retrieve_database",
  description:
    "Retrieve the schema (property definitions) of a Notion database. " +
    "Use this before query_database to understand available properties. " +
    "Read-only; no HITL required.",
  inputSchema: RetrieveDatabaseInput,
  async handler(args) {
    // TODO (T-2b): replace stub:
    //   const client = getNotionClient();
    //   return client.databases.retrieve({ database_id: args.database_id });
    console.log("[notion.retrieve_database] stub invoked", args);
    return {
      object: "database",
      id: args.database_id,
      title: [],
      properties: {},
    } as Partial<NotionDatabase>;
  },
};

// ---------------------------------------------------------------------------
// Tool 8: notion.list_users
// ---------------------------------------------------------------------------

const ListUsersInput = z.object({
  page_size: z.number().int().min(1).max(100).default(100),
  start_cursor: z.string().optional(),
});

export const notionListUsers: ToolDefinition<z.infer<typeof ListUsersInput>> =
  {
    name: "notion.list_users",
    description:
      "List all users in the Notion workspace. " +
      "Useful for @mention and assignee dropdowns. " +
      "Read-only; no HITL required.",
    inputSchema: ListUsersInput,
    async handler(args) {
      // TODO (T-2b): replace stub:
      //   const client = getNotionClient();
      //   return client.users.list({ page_size: args.page_size, start_cursor: args.start_cursor });
      console.log("[notion.list_users] stub invoked", args);
      return {
        object: "list",
        results: [],
        has_more: false,
        next_cursor: null,
      } satisfies NotionPaginatedResponse<NotionUser>;
    },
  };

// ---------------------------------------------------------------------------
// Tool 9: notion.retrieve_block_children
// ---------------------------------------------------------------------------

const RetrieveBlockChildrenInput = z.object({
  block_id: z.string().describe("Page or block ID"),
  page_size: z.number().int().min(1).max(100).default(100),
  start_cursor: z.string().optional(),
});

export const notionRetrieveBlockChildren: ToolDefinition<
  z.infer<typeof RetrieveBlockChildrenInput>
> = {
  name: "notion.retrieve_block_children",
  description:
    "Retrieve child blocks of a Notion page or block. " +
    "Use recursively to read full page content. " +
    "Read-only; no HITL required.",
  inputSchema: RetrieveBlockChildrenInput,
  async handler(args) {
    // TODO (T-2b): replace stub:
    //   const client = getNotionClient();
    //   return client.blocks.children.list({ block_id: args.block_id, page_size: args.page_size });
    console.log("[notion.retrieve_block_children] stub invoked", args);
    return {
      object: "list",
      results: [],
      has_more: false,
      next_cursor: null,
    } satisfies NotionPaginatedResponse<NotionBlock>;
  },
};

// ---------------------------------------------------------------------------
// Tool 10: notion.delete_block  (HITL: custom-markdown, enforced by Shell)
// ---------------------------------------------------------------------------

const DeleteBlockInput = z.object({
  block_id: z.string().describe("ID of the block to delete (archive)"),
});

export const notionDeleteBlock: ToolDefinition<
  z.infer<typeof DeleteBlockInput>
> = {
  name: "notion.delete_block",
  description:
    "Delete (archive) a Notion block. This operation is irreversible from the AKARI side — " +
    "recovery requires manual unarchive in Notion. " +
    "HITL gate (custom-markdown full content preview) is REQUIRED before this tool is called. " +
    "AKARI Workflow Rollback does NOT apply to this operation.",
  inputSchema: DeleteBlockInput,
  async handler(args) {
    // TODO (T-2b): replace stub:
    //   const client = getNotionClient();
    //   return client.blocks.delete({ block_id: args.block_id });
    console.log("[notion.delete_block] stub invoked", args);
    return {
      object: "block",
      id: args.block_id,
      archived: true,
    } as Partial<NotionBlock>;
  },
};

// ---------------------------------------------------------------------------
// Tool registry — all 10 tools
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_TOOLS: ToolDefinition<any>[] = [
  notionSearch,
  notionQueryDatabase,
  notionCreatePage,
  notionUpdatePageProperties,
  notionAppendBlockChildren,
  notionRetrievePage,
  notionRetrieveDatabase,
  notionListUsers,
  notionRetrieveBlockChildren,
  notionDeleteBlock,
];

// ---------------------------------------------------------------------------
// AKARI Pool / AMP integration stubs
// ---------------------------------------------------------------------------

/**
 * Cache a Notion API result in Pool for offline access.
 *
 * TODO (T-7c): replace with real Pool.put call via @akari-os/sdk:
 *   await akari.memory.pool.put({ content, mime: "application/json", tags })
 */
export async function poolCache(
  _content: unknown,
  _tags: string[],
): Promise<void> {
  console.log("[pool] poolCache stub — not persisted");
}

/**
 * Record an operation in AMP.
 *
 * TODO (T-7a): replace with real AMP call via @akari-os/sdk:
 *   await akari.memory.amp.record({ kind, goal_ref, payload })
 */
export async function ampRecord(_entry: {
  kind: "export-action" | "research-export" | "pool-import";
  goal_ref?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  console.log("[amp] ampRecord stub — not persisted");
}

/**
 * Return the current goal_ref from the active handoff context, if any.
 *
 * TODO (T-6a / T-7b): retrieve from AKARI Shell handoff context:
 *   return akari.interApp.currentHandoff()?.goal_ref
 */
export function currentGoalRef(): string | undefined {
  return undefined;
}
