import crypto from "node:crypto"
import * as fs from "node:fs"
import * as fsPromises from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import http from "node:http"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js"
import WebSocket, { WebSocketServer, type RawData } from "ws"
import type {
  BridgeHello,
  BridgePorts,
  BridgeRequest,
  BridgeResponse,
  ToolDef,
} from "./protocol.ts"

const HOST = "127.0.0.1"
const MCP_HTTP_PATH = "/mcp"
const RESPONSE_TIMEOUT_MS = 15_000

// ────────────────────────────────────────────────────────────────────────────
// MCP ブリッジ認証（akari-video bridge-auth.ts 踏襲、依存ゼロ・インライン）
// 共有トークン: ~/.akari/secrets/mcp-bridge-token（0600）
// AKARI_MCP_AUTH=off で無効化できる脱出ハッチ（既定は on）
// ────────────────────────────────────────────────────────────────────────────

const SECRETS_DIR = path.join(os.homedir(), ".akari", "secrets")
const TOKEN_FILE = path.join(SECRETS_DIR, "mcp-bridge-token")

function isAuthEnabled(): boolean {
  return (process.env.AKARI_MCP_AUTH ?? "on").toLowerCase() !== "off"
}

/** 起動時に 1 回呼ぶ。ファイルが無ければ生成して返す。あれば読んで返す。 */
async function loadOrCreateToken(): Promise<string> {
  if (!isAuthEnabled()) {
    console.error("[bridge-auth] auth=OFF (AKARI_MCP_AUTH=off)")
    return ""
  }

  await fsPromises.mkdir(SECRETS_DIR, { recursive: true, mode: 0o700 })

  if (fs.existsSync(TOKEN_FILE)) {
    const token = (await fsPromises.readFile(TOKEN_FILE, "utf8")).trim()
    if (token.length > 0) {
      console.error("[bridge-auth] auth=ON  token loaded from", TOKEN_FILE)
      return token
    }
  }

  const token = crypto.randomBytes(32).toString("hex")
  await fsPromises.writeFile(TOKEN_FILE, token + "\n", { encoding: "utf8", mode: 0o600 })
  console.error("[bridge-auth] auth=ON  token generated and saved to", TOKEN_FILE)
  return token
}

function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false
  const normalised = hostHeader.toLowerCase().trim()
  return normalised === `127.0.0.1:${port}` || normalised === `localhost:${port}`
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false
  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")
  if (bufA.length !== bufB.length) {
    const padded = Buffer.alloc(bufB.length)
    bufA.copy(padded, 0, 0, Math.min(bufA.length, padded.length))
    crypto.timingSafeEqual(padded, bufB)
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}

/** HTTP MCP リクエスト認証（失敗時は res に 401/403 を書いて false を返す）。 */
function checkHttpAuth(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  port: number,
  authToken: string,
): boolean {
  if (!isAuthEnabled()) return true

  if (!isAllowedHost(req.headers.host, port)) {
    res.writeHead(403, { "content-type": "text/plain" })
    res.end()
    return false
  }

  const authHeader = req.headers.authorization ?? ""
  const bearerPrefix = "Bearer "
  if (!authHeader.startsWith(bearerPrefix)) {
    res.writeHead(401, { "content-type": "text/plain", "www-authenticate": "Bearer" })
    res.end()
    return false
  }
  const provided = authHeader.slice(bearerPrefix.length).trim()
  if (!timingSafeEqual(provided, authToken)) {
    res.writeHead(401, { "content-type": "text/plain", "www-authenticate": "Bearer" })
    res.end()
    return false
  }

  return true
}

/**
 * WebSocket upgrade 認証（失敗時は 401 を書いて socket を閉じ、false を返す）。
 * 注意: `socket.destroy(new Error(...))` はリスナー不在の 'error' イベントを発火させ
 * **sidecar プロセスごと落とす**ため使わない（実際に dev ブラウザの無認証接続で全断した）。
 */
function checkWsAuth(
  req: http.IncomingMessage,
  socket: { destroy: (err?: Error) => void; write?: (data: string) => void },
  port: number,
  authToken: string,
): boolean {
  const reject = (reason: string): false => {
    console.error(`[bridge-auth] ws upgrade rejected: ${reason}`)
    try {
      socket.write?.("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n")
    } catch {
      // 書き込み失敗は無視（すでに切断済みなど）
    }
    socket.destroy()
    return false
  }

  if (!isAuthEnabled()) return true

  if (!isAllowedHost(req.headers.host, port)) {
    return reject("forbidden host")
  }

  const urlObj = new URL(req.url ?? "/", `http://127.0.0.1:${port}`)
  const provided = urlObj.searchParams.get("token") ?? ""
  if (!timingSafeEqual(provided, authToken)) {
    return reject("unauthorized")
  }

  return true
}

type PendingCall = {
  resolve: (response: BridgeResponse) => void
  reject: (error: Error) => void
  timeout: NodeJS.Timeout
}

type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }

type ToolResult = {
  content: ToolContent[]
  isError?: boolean
}

/**
 * sidecar 側ローカルハンドラから renderer を呼ぶための関数型。
 * `tool` にはレンダラ側で処理されるツール名（内部ツールも可）、
 * `input` はそのツールの入力オブジェクトを渡す。
 * レスポンスが ok=false の場合は Error として reject される。
 */
export type RendererCallFn = (tool: string, input: unknown) => Promise<unknown>

/**
 * sidecar ローカルハンドラの関数型。
 * 第 2 引数 `callRenderer` を使うと、ハンドラ内から renderer 側のツールを呼べる。
 * 既存の `(input) => Promise<unknown>` 形式とも互換（第 2 引数を無視すれば良い）。
 */
export type LocalHandlerFn = (input: unknown, callRenderer: RendererCallFn) => Promise<unknown>

export interface CreateBridgeSidecarOptions {
  appId: string
  ports: BridgePorts
  toolDefs: ToolDef[]
  exposedToolNames: string[]
  localHandlers?: Record<string, LocalHandlerFn>
}

export interface BridgeSidecar {
  start(): Promise<void>
}

export function createBridgeSidecar(
  opts: CreateBridgeSidecarOptions,
): BridgeSidecar {
  const exposedToolNames = new Set(opts.exposedToolNames)
  const exposedTools = opts.toolDefs.filter((tool) => exposedToolNames.has(tool.name))
  const pendingCalls = new Map<string, PendingCall>()

  let rendererSocket: WebSocket | null = null

  function rendererNotConnectedMessage(): string {
    return `${opts.appId} renderer is not connected. Open the app in AKARI and try again.`
  }

  function rejectAllPending(error: Error): void {
    for (const [id, pending] of pendingCalls) {
      clearTimeout(pending.timeout)
      pending.reject(error)
      pendingCalls.delete(id)
    }
  }

  function clearRendererSocket(socket: WebSocket, reason: Error): void {
    if (rendererSocket !== socket) return

    rendererSocket = null
    rejectAllPending(reason)
  }

  function handleRendererMessage(data: RawData): void {
    let message: unknown

    try {
      message = JSON.parse(rawDataToString(data)) as unknown
    } catch (error) {
      console.error(`[${opts.appId}-sidecar] renderer sent invalid JSON`, error)
      return
    }

    if (isBridgeHello(message)) {
      console.error(
        `[${opts.appId}-sidecar] renderer connected: ${message.app} (${message.tools.length} tools)`,
      )
      return
    }

    if (!isBridgeResponse(message)) {
      console.error(`[${opts.appId}-sidecar] renderer sent unknown message`, message)
      return
    }

    const pending = pendingCalls.get(message.id)
    if (!pending) {
      console.error(
        `[${opts.appId}-sidecar] response for unknown request: ${message.id}`,
      )
      return
    }

    clearTimeout(pending.timeout)
    pendingCalls.delete(message.id)
    pending.resolve(message)
  }

  function attachRendererSocket(socket: WebSocket): void {
    if (rendererSocket && rendererSocket.readyState === WebSocket.OPEN) {
      console.error(
        `[${opts.appId}-sidecar] renderer reconnected; closing previous socket`,
      )
      rejectAllPending(new Error("renderer reconnected"))
      rendererSocket.close(1000, "replaced by a newer renderer connection")
    }

    rendererSocket = socket
    console.error(`[${opts.appId}-sidecar] renderer websocket accepted`)

    socket.on("message", handleRendererMessage)
    socket.on("close", () => {
      console.error(`[${opts.appId}-sidecar] renderer websocket closed`)
      clearRendererSocket(socket, new Error("renderer disconnected"))
    })
    socket.on("error", (error: Error) => {
      console.error(`[${opts.appId}-sidecar] renderer websocket error`, error)
      clearRendererSocket(socket, error)
    })
  }

  function callRenderer(tool: string, input: unknown): Promise<BridgeResponse> {
    const socket = rendererSocket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error(rendererNotConnectedMessage()))
    }

    const id = crypto.randomUUID()
    const request: BridgeRequest = { id, tool, input }

    return new Promise<BridgeResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingCalls.delete(id)
        reject(
          new Error(`renderer response timed out after ${RESPONSE_TIMEOUT_MS}ms: ${tool}`),
        )
      }, RESPONSE_TIMEOUT_MS)

      pendingCalls.set(id, { resolve, reject, timeout })

      socket.send(JSON.stringify(request), (error?: Error) => {
        if (!error) return

        clearTimeout(timeout)
        pendingCalls.delete(id)
        reject(error)
      })
    })
  }

  /** localHandler から renderer を直接呼べるラッパー関数。 */
  async function callRendererUnwrapped(tool: string, input: unknown): Promise<unknown> {
    const response = await callRenderer(tool, input)
    if (!response.ok) {
      throw new Error(response.error ?? `renderer returned ok=false for ${tool}`)
    }
    return response.result
  }

  async function invokeTool(name: string, input: unknown): Promise<ToolResult> {
    try {
      const localHandler = opts.localHandlers?.[name]
      if (localHandler) {
        return valueToToolResult(await localHandler(input, callRendererUnwrapped))
      }

      const response = await callRenderer(name, input)
      if (!response.ok) {
        return errorResult(response.error ?? `renderer returned ok=false for ${name}`)
      }
      return valueToToolResult(response.result)
    } catch (error) {
      return errorResult(error)
    }
  }

  function createMcpServer(): McpServer {
    const server = new McpServer(
      {
        name: `${opts.appId}-bridge-sidecar`,
        version: "0.1.0",
      },
      // 低レベル setRequestHandler(ListTools/CallTool) を直接使うため、
      // tools capability を明示宣言する（未宣言だと tools/list で assert 例外になる）
      { capabilities: { tools: {} } },
    )

    server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: exposedTools.map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    }))

    server.server.setRequestHandler(
      CallToolRequestSchema,
      async (request: CallToolRequest) => {
        const requestedName = request.params.name
        if (!exposedToolNames.has(requestedName)) {
          return errorResult(`Unknown tool: ${requestedName}`)
        }

        return invokeTool(requestedName, request.params.arguments ?? {})
      },
    )

    return server
  }

  async function handleMcpHttpRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    authToken: string,
  ): Promise<void> {
    const urlPath = (req.url ?? "/").split("?")[0]

    // 軽量ステータス（GET /status、認証不要）。
    // 127.0.0.1 バインドのみで秘匿情報を含まないため認証前に応答する。
    // AKARI shell / daemon が「bridge 生存 + renderer 接続状態」を確認するために使う
    // （AKARI-HUB-112 T-5: MCP 接続状況の可視化）。
    if (urlPath === "/status" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(
        JSON.stringify({
          ok: true,
          appId: opts.appId,
          rendererConnected:
            rendererSocket !== null && rendererSocket.readyState === WebSocket.OPEN,
        }),
      )
      return
    }

    // 認証チェック（Host + Bearer トークン）
    if (!checkHttpAuth(req, res, opts.ports.mcp, authToken)) {
      return
    }

    if (urlPath !== MCP_HTTP_PATH) {
      writeJsonRpcError(res, 404, -32601, `Not found: ${urlPath}`)
      return
    }

    if (req.method !== "POST") {
      res.writeHead(405, { "content-type": "application/json", allow: "POST" })
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Method not allowed (stateless server, POST only).",
          },
          id: null,
        }),
      )
      return
    }

    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch {
      writeJsonRpcError(res, 400, -32700, "Parse error: invalid JSON body")
      return
    }

    const server = createMcpServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    res.on("close", () => {
      void transport.close()
      void server.close()
    })

    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
    } catch (error) {
      console.error(`[${opts.appId}-sidecar] MCP HTTP request failed`, error)
      writeJsonRpcError(res, 500, -32603, "Internal server error")
    }
  }

  async function startWebSocketServer(authToken: string): Promise<WebSocketServer> {
    // noServer=true にして upgrade イベントで認証してから acceptUpgrade する
    const wss = new WebSocketServer({ noServer: true })

    const httpServer = http.createServer((_req, res) => {
      res.writeHead(404)
      res.end()
    })

    httpServer.on("upgrade", (req, socket, head) => {
      // 生 socket の 'error' は未処理だとプロセスを落とすため必ず吸収する
      socket.on("error", (error) => {
        console.error(`[${opts.appId}-sidecar] ws upgrade socket error`, error.message)
      })
      if (!checkWsAuth(req, socket, opts.ports.ws, authToken)) {
        return
      }
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req)
      })
    })

    wss.on("connection", attachRendererSocket)
    wss.on("error", (error: Error) => {
      console.error(`[${opts.appId}-sidecar] websocket server error`, error)
    })

    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => reject(error)
      httpServer.once("error", onError)
      httpServer.listen(opts.ports.ws, HOST, () => {
        httpServer.off("error", onError)
        resolve()
      })
    })

    console.error(
      `[${opts.appId}-sidecar] websocket listening on ws://${HOST}:${opts.ports.ws}`,
    )
    return wss
  }

  async function startMcpHttpServer(authToken: string): Promise<http.Server> {
    const httpServer = http.createServer((req, res) => {
      void handleMcpHttpRequest(req, res, authToken)
    })

    await new Promise<void>((resolve, reject) => {
      const onError = (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          reject(new Error(`MCP HTTP port ${opts.ports.mcp} is already in use`))
          return
        }
        reject(error)
      }
      httpServer.once("error", onError)
      httpServer.listen(opts.ports.mcp, HOST, () => {
        httpServer.off("error", onError)
        httpServer.on("error", (error: Error) => {
          console.error(`[${opts.appId}-sidecar] MCP HTTP server error`, error)
        })
        resolve()
      })
    })

    console.error(
      `[${opts.appId}-sidecar] MCP HTTP server listening on http://${HOST}:${opts.ports.mcp}${MCP_HTTP_PATH}`,
    )
    return httpServer
  }

  return {
    async start(): Promise<void> {
      // 認証トークンをロード or 生成（AKARI_MCP_AUTH=off なら "" を返す）
      const authToken = await loadOrCreateToken()
      await startWebSocketServer(authToken)
      await startMcpHttpServer(authToken)
    },
  }
}

function rawDataToString(data: RawData): string {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8")
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8")
  }
  return Buffer.from(data).toString("utf8")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isBridgeHello(value: unknown): value is BridgeHello {
  return (
    isRecord(value) &&
    value.type === "hello" &&
    typeof value.app === "string" &&
    Array.isArray(value.tools)
  )
}

function isBridgeResponse(value: unknown): value is BridgeResponse {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.ok === "boolean"
  )
}

function isImageResult(
  value: unknown,
): value is { type: "image"; data: string; mimeType: string } {
  return (
    isRecord(value) &&
    value.type === "image" &&
    typeof value.data === "string" &&
    typeof value.mimeType === "string"
  )
}

function valueToToolResult(value: unknown): ToolResult {
  if (isImageResult(value)) {
    return {
      content: [
        {
          type: "image",
          data: value.data,
          mimeType: value.mimeType,
        },
      ],
    }
  }

  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value),
      },
    ],
  }
}

function errorResult(error: unknown): ToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: error instanceof Error ? error.message : String(error),
      },
    ],
  }
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on("data", (chunk: Buffer) => chunks.push(chunk))
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8")
      if (raw.length === 0) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(raw) as unknown)
      } catch (error) {
        reject(error)
      }
    })
    req.on("error", reject)
  })
}

function writeJsonRpcError(
  res: http.ServerResponse,
  status: number,
  code: number,
  message: string,
): void {
  if (res.headersSent) {
    res.end()
    return
  }
  res.writeHead(status, { "content-type": "application/json" })
  res.end(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }))
}
