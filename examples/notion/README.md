# Notion — AKARI MCP-Declarative Documents App 参考実装

> **Category**: Documents  
> **Tier**: MCP-Declarative  
> **App ID**: `com.akari.example.notion`  
> **Related guide**: [`../../docs/examples/notion.md`](../../docs/examples/notion.md)

---

## What you'll learn

- How to use an **official MCP server** (`@notionhq/mcp`) via `server = "npm:@notionhq/mcp"` in `akari.toml` — zero custom server code needed in production
- How to write a **local MCP server** (`mcp-server/`) when you need custom logic — this example ships both
- How to build a **4-tab Panel Schema** with `layout: "tabs"` for Documents-category apps
- How to wire `options_source` so select fields auto-populate from MCP tool results
- How to implement `visible_when` for wizard-style progressive disclosure
- HITL policies for Documents: `diff` / `text-summary` / `custom-markdown` preview variants
- **3-direction Cross-over**: Writer → Notion / Research → Notion / Notion → Pool
- OAuth 2.0 PKCE flow + Personal Integration Token fallback
- Offline: Pool cache (read) + write queue (write)

---

## Prerequisites

- Node.js 18+
- pnpm 9+ (workspace)
- A Notion account with either:
  - An **OAuth App** (Client ID + Secret) — for the full OAuth 2.0 flow
  - A **Personal Integration Token** — simpler, for local testing
- AKARI Shell (for full app behavior; not required to run the MCP server standalone)

---

## Quick start

```bash
# 1. Install dependencies
cd examples/notion
pnpm install

# 2. Set credentials (choose one)
export NOTION_ACCESS_TOKEN="secret_..."         # OAuth access token
# OR
export NOTION_INTEGRATION_TOKEN="secret_..."    # Personal Integration Token

# 3. Start the local MCP server
pnpm dev

# 4. (Optional) Run certification checks
pnpm certify
```

The MCP server starts on stdio. Connect via AKARI Shell or any MCP client.

---

## Structure

```
examples/notion/
├── README.md               This file
├── package.json            private, @akari-os-examples/notion
├── tsconfig.json           extends ../../tsconfig.base.json
├── akari.toml              App manifest (MCP-Declarative, category = "documents")
├── panel.schema.json       4-tab AKARI Panel Schema v0
├── locales/
│   ├── ja.json             Japanese translations for all {{t:key}} tokens
│   └── en.json             English translations
├── mcp-server/
│   ├── index.ts            McpServer startup (stdio transport)
│   ├── tools.ts            10 Notion tools with Zod schemas + Pool/AMP stubs
│   ├── oauth.ts            OAuth 2.0 PKCE + Integration Token helpers
│   └── types.ts            Notion API TypeScript types
└── .gitignore
```

### akari.toml — two MCP server options

The manifest includes a choice:

```toml
# Option A — official Notion MCP (recommended for production, no local code needed)
[mcp]
server = "npm:@notionhq/mcp"

# Option B — local implementation (this example; useful when you need custom logic)
[mcp]
server = "mcp-server/index.ts"
```

Switch to Option A when you don't need the local stubs. AKARI Core handles
installation and lifecycle automatically.

### panel.schema.json — 4 tabs

| Tab ID | Label | Purpose |
|---|---|---|
| `db-query` | DB Query | Filter + sort a Notion database; display results in a table |
| `page-editor` | Page Editor | Append blocks to an existing page OR create a new page |
| `pool-export` | Pool → Notion | Publish Pool items as Notion pages |
| `pool-import` | Notion → Pool | Import Notion database entries as Pool items |

Key patterns to study:

- **`options_source`** — select fields auto-load from MCP tool results (e.g., database list)
- **`options_source_args: { database_id: "$db_id" }`** — dependent field loading
- **`visible_when`** — progressive disclosure (filter value hidden until operator chosen)
- **`radio` mode switch** — `page_source_mode` toggles between edit/create flows
- **`doc-outline-tree`** — Documents-category widget for Notion block structure
- **`rich-text-editor`** — toolbar-configured block editor

The `_comment_section` keys in the JSON are for readability only; they are ignored by
the AKARI Panel Schema renderer.

### mcp-server/tools.ts — 10 tools

| # | Tool | HITL | Notes |
|---|---|:---:|---|
| 1 | `notion.search` | — | Full-text search across pages + databases |
| 2 | `notion.query_database` | — | Filter / sort / paginate; results cached in Pool |
| 3 | `notion.create_page` | `custom-markdown` | Writer handoff target; AMP `export-action` |
| 4 | `notion.update_page_properties` | `diff` | Shows before/after property values |
| 5 | `notion.append_block_children` | `diff` | Max 100 blocks per call (Notion API limit) |
| 6 | `notion.retrieve_page` | — | Metadata + properties; read-only |
| 7 | `notion.retrieve_database` | — | Schema (property definitions); read-only |
| 8 | `notion.list_users` | — | Workspace members for @mention / assignee |
| 9 | `notion.retrieve_block_children` | — | Read page content (recursive) |
| 10 | `notion.delete_block` | `custom-markdown` | Irreversible; full content shown before confirm |

HITL gates are declared in `panel.schema.json` actions and enforced by AKARI Shell
**before** the MCP tool is invoked. The MCP server can trust that confirmation has
already been obtained.

### mcp-server/oauth.ts — auth helpers

- `resolveAuthContext()` — reads credentials from env vars (stub; use Keychain in production)
- `generateCodeVerifier()` / `deriveCodeChallenge()` — PKCE helpers
- `buildAuthorizationUrl()` — constructs the Notion OAuth authorization URL
- `exchangeCodeForToken()` — exchanges authorization code for access token
- `saveTokensToKeychain()` / `revokeTokens()` — Keychain stubs (TODO T-4a)

---

## Patterns to borrow

This example is designed as a template for other **Documents-category apps**.
Here is what to keep and what to change when building Google Docs, Microsoft Word,
Coda, or similar integrations.

### Keep as-is

| Pattern | Location |
|---|---|
| `tier = "mcp-declarative"`, `category = "documents"` | `akari.toml` |
| 4-tab layout with `layout: "tabs"` | `panel.schema.json` |
| `amp = ["read", "write"]` — read required for handoff receive | `akari.toml` |
| `visible_when` progressive disclosure | `panel.schema.json` fields |
| HITL policy: new = `custom-markdown`, edit = `diff`, delete = `custom-markdown` | `panel.schema.json` actions |
| AMP record pattern (`kind`, `goal_ref`) | `mcp-server/tools.ts` stubs |
| Offline: Pool cache + write queue | `tools.ts` `poolCache()` stub |

### Change for a different Documents service

| Item | This example | Your app |
|---|---|---|
| `id` | `com.akari.example.notion` | `com.akari.example.google-docs` |
| `[mcp].server` | `npm:@notionhq/mcp` | `npm:@google-ai-studio/mcp` or custom |
| `[mcp].tools` | `notion.*` | `gdocs.*` etc. |
| `external-network` | `api.notion.com` | `docs.googleapis.com` |
| `oauth` provider | `notion.com` | `accounts.google.com` |
| Widgets | `doc-outline-tree`, `rich-text-editor` | Adapt to target service block model |

---

## Cross-over 3 patterns

### Writer → Notion (draft → Notion page)

```
app.handoff({
  to:      "com.akari.example.notion",
  intent:  "export-to-notion",
  payload: {
    draft_ref:  "<amp_record_id>",
    assets:     ["<pool_item_id>"],
    target_db:  "<notion_database_id>",  // optional
  }
})
→ Panel pre-fills page-editor tab with draft content
→ HITL custom-markdown preview
→ Approved → notion.create_page
→ AMP kind="export-action"
```

### Research → Notion (results → database rows)

```
app.handoff({
  to:      "com.akari.example.notion",
  intent:  "save-to-notion-db",
  payload: {
    records:   ["<amp_record_id>"],
    target_db: "<notion_database_id>",
    field_map: { title: "title", url: "URL", summary: "Summary" }
  }
})
→ Duplicate check via notion.query_database
→ HITL text-summary: "N items will be added to database X"
→ Approved → notion.create_page for each new entry
→ AMP kind="research-export"
```

### Notion → Pool (database → Pool items)

```
User selects database in "Notion → Pool" tab
→ notion.retrieve_database (schema)
→ notion.query_database (entries)
→ Pool.put each entry (mime: "text/notion-page", tags: ["notion", "imported"])
→ AMP kind="pool-import"
→ Items available in Pool Browser, Writer, Research
```

---

## TODO — items required for production use

The following stubs must be implemented before this app passes `akari app certify`:

| ID | File | What to implement |
|---|---|---|
| T-2a | `package.json` | Verify `@notionhq/client` and `@modelcontextprotocol/sdk` versions |
| T-2b | `mcp-server/tools.ts` | Replace all `// TODO (T-2b)` stubs with real `@notionhq/client` calls |
| T-4a | `mcp-server/oauth.ts` | Replace env-var credential lookup with AKARI Keychain API calls |
| T-4b | `mcp-server/oauth.ts` | Wire `buildAuthorizationUrl` + `exchangeCodeForToken` into AKARI Permission API OAuth flow |
| T-4c | `mcp-server/index.ts` | On auth failure, trigger `akari.permission.oauth.requestReauth()` instead of `process.exit(1)` |
| T-5a | — | Run `akari app certify` and fix any Lint / Contract Test failures |
| T-5b | — | Offline test: block `api.notion.com` and verify Pool cache display + `notion-cache` badge |
| T-5c | — | HITL gate test: verify create/update/delete actions show preview; verify API not called on cancel |
| T-6a | `mcp-server/tools.ts` | Implement `intent: "export-to-notion"` handoff receive + draft expansion |
| T-6b | `mcp-server/tools.ts` | AMP record → Notion page property mapping function |
| T-7a | `mcp-server/tools.ts` | Replace `ampRecord()` stub with real `@akari-os/sdk` AMP write |
| T-7b | `mcp-server/tools.ts` | Implement `intent: "save-to-notion-db"` handoff + duplicate check + batch HITL |
| T-7c | `mcp-server/tools.ts` | Replace `poolCache()` stub with real `@akari-os/sdk` Pool.put |

---

## Related docs

- Guide (reading walkthrough): [`../../docs/examples/notion.md`](../../docs/examples/notion.md)
- AKARI SDK overview: [`../../README.md`](../../README.md)
- Panel Schema v0 spec: [`../../docs/api-reference/panel-schema.md`](../../docs/api-reference/panel-schema.md)
- Certification guide: [`../../docs/certification/`](../../docs/certification/)
- Notion API reference: https://developers.notion.com/reference
- Notion OAuth 2.0 guide: https://developers.notion.com/docs/authorization
- Official Notion MCP server: https://github.com/notionhq/notion-mcp-server
