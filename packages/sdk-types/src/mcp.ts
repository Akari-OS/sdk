/**
 * @file mcp.ts
 * Runtime: Agent daemon への MCP クライアント。
 *
 * Transport: Tauri command 経由で Rust 側の persistent Unix socket に接続。
 * Protocol: Model Context Protocol (MCP) — daemon 側は @modelcontextprotocol/sdk。
 *
 * daemon 側の tool レスポンスは `{ content: [{ type: "text", text }], isError? }`
 * の形で返る。`content[0].text` を取り出し、必要なら JSON.parse する。
 *
 * tool 名は ADR-009 準拠の snake_case + L1 prefix (`partner_chat`, `pool_list_libraries` 等)。
 *
 * @packageDocumentation
 */

import { invoke } from "@tauri-apps/api/core"

/** MCP の CallToolResult 生 shape（id 不要、text と isError のみ使う） */
interface McpCallToolResult {
  content: Array<{ type: string; text?: string }>
  isError?: boolean
}

/** MCP の ReadResourceResult 生 shape */
interface McpReadResourceResult {
  contents: Array<{ uri: string; mimeType?: string; text?: string }>
}

async function callToolRaw(
  name: string,
  args?: Record<string, unknown>,
): Promise<string> {
  const result = (await invoke("agent_call_tool", {
    name,
    arguments: args ?? null,
  })) as McpCallToolResult

  const first = result.content?.[0]
  if (!first || typeof first.text !== "string") {
    throw new Error(`MCP tool ${name} returned no text content`)
  }
  return first.text
}

/**
 * MCP tool を呼び出し、レスポンスの text を JSON として parse して返す。
 * ping / status / partner_new_conversation 等、多くの daemon tool はこの形。
 */
export async function callToolJson<T>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const text = await callToolRaw(name, args)
  try {
    return JSON.parse(text) as T
  } catch (e) {
    throw new Error(
      `MCP tool ${name} returned invalid JSON: ${(e as Error).message}\n---\n${text}`,
    )
  }
}

/**
 * MCP tool を呼び出し、レスポンスの text をそのまま文字列で返す。
 * partner_chat など LLM の生応答を返す tool 用。
 */
export async function callToolText(
  name: string,
  args?: Record<string, unknown>,
): Promise<string> {
  return callToolRaw(name, args)
}

/**
 * MCP resource を読み取り、`contents[0].text` を JSON として parse して返す。
 * 現状 `akari://conversations/{id}` のみ。
 */
export async function readResourceJson<T>(uri: string): Promise<T> {
  const result = (await invoke("agent_read_resource", {
    uri,
  })) as McpReadResourceResult

  const first = result.contents?.[0]
  if (!first || typeof first.text !== "string") {
    throw new Error(`MCP resource ${uri} returned no text content`)
  }
  try {
    return JSON.parse(first.text) as T
  } catch (e) {
    throw new Error(
      `MCP resource ${uri} returned invalid JSON: ${(e as Error).message}`,
    )
  }
}
