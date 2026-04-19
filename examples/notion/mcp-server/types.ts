/**
 * Notion API types used across the MCP server implementation.
 * These mirror the Notion REST API v1 data shapes.
 * See: https://developers.notion.com/reference
 */

// ---------------------------------------------------------------------------
// Parent references
// ---------------------------------------------------------------------------

export type NotionParent =
  | { type: "database_id"; database_id: string }
  | { type: "page_id"; page_id: string }
  | { type: "workspace"; workspace: true };

// ---------------------------------------------------------------------------
// Rich text
// ---------------------------------------------------------------------------

export interface NotionRichText {
  type: "text" | "mention" | "equation";
  text?: { content: string; link?: { url: string } | null };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
    color?: string;
  };
  plain_text?: string;
  href?: string | null;
}

// ---------------------------------------------------------------------------
// Block types
// ---------------------------------------------------------------------------

export type NotionBlockType =
  | "paragraph"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "bulleted_list_item"
  | "numbered_list_item"
  | "to_do"
  | "toggle"
  | "code"
  | "quote"
  | "callout"
  | "divider"
  | "image"
  | "video"
  | "file"
  | "pdf"
  | "bookmark"
  | "child_page"
  | "child_database";

export interface NotionBlock {
  object: "block";
  id: string;
  type: NotionBlockType;
  created_time: string;
  last_edited_time: string;
  has_children: boolean;
  archived: boolean;
  [key: string]: unknown; // block-type-specific content
}

export interface NotionBlockInput {
  object?: "block";
  type: NotionBlockType;
  [key: string]: unknown; // block-type-specific content
}

// ---------------------------------------------------------------------------
// Page / database properties
// ---------------------------------------------------------------------------

export type NotionPropertyValue =
  | { type: "title"; title: NotionRichText[] }
  | { type: "rich_text"; rich_text: NotionRichText[] }
  | { type: "number"; number: number | null }
  | { type: "select"; select: { name: string } | null }
  | { type: "multi_select"; multi_select: Array<{ name: string }> }
  | { type: "date"; date: { start: string; end?: string | null } | null }
  | { type: "checkbox"; checkbox: boolean }
  | { type: "url"; url: string | null }
  | { type: "email"; email: string | null }
  | { type: "phone_number"; phone_number: string | null }
  | { type: "status"; status: { name: string } | null }
  | { type: "people"; people: NotionUser[] }
  | { type: "relation"; relation: Array<{ id: string }> }
  | { type: "formula"; formula: unknown }
  | { type: "rollup"; rollup: unknown };

export type NotionProperties = Record<string, NotionPropertyValue>;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export interface NotionPage {
  object: "page";
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: { object: "user"; id: string };
  last_edited_by: { object: "user"; id: string };
  cover: unknown | null;
  icon: unknown | null;
  parent: NotionParent;
  archived: boolean;
  properties: NotionProperties;
  url: string;
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

export interface NotionDatabase {
  object: "database";
  id: string;
  created_time: string;
  last_edited_time: string;
  title: NotionRichText[];
  description: NotionRichText[];
  parent: NotionParent;
  archived: boolean;
  properties: Record<string, NotionDatabasePropertySchema>;
  url: string;
}

export interface NotionDatabasePropertySchema {
  id: string;
  name: string;
  type: string;
  [key: string]: unknown; // type-specific schema
}

// ---------------------------------------------------------------------------
// User
// ---------------------------------------------------------------------------

export interface NotionUser {
  object: "user";
  id: string;
  name?: string;
  avatar_url?: string | null;
  type?: "person" | "bot";
  person?: { email?: string };
  bot?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface NotionPaginatedResponse<T> {
  object: "list";
  results: T[];
  has_more: boolean;
  next_cursor: string | null;
  type: string;
}

// ---------------------------------------------------------------------------
// Filter / Sort (query_database)
// ---------------------------------------------------------------------------

export interface NotionFilter {
  property?: string;
  operator?: string;
  value?: string | number | boolean | null;
  // Notion API compound filters
  and?: NotionFilter[];
  or?: NotionFilter[];
}

export interface NotionSort {
  property?: string;
  timestamp?: "created_time" | "last_edited_time";
  direction: "ascending" | "descending";
}

// ---------------------------------------------------------------------------
// Auth context (passed from AKARI Core → MCP server)
// ---------------------------------------------------------------------------

export interface AuthContext {
  /** OAuth access token from Keychain */
  access_token?: string;
  /** Personal Integration Token (fallback) */
  integration_token?: string;
  /** Resolved Notion workspace ID */
  workspace_id?: string;
}
