import crypto from "node:crypto"
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

export interface CreateBridgeSidecarOptions {
  appId: string
  ports: BridgePorts
  toolDefs: ToolDef[]
  exposedToolNames: string[]
  localHandlers?: Record<string, (input: unknown) => Promise<unknown>>
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

  async function invokeTool(name: string, input: unknown): Promise<ToolResult> {
    try {
      const localHandler = opts.localHandlers?.[name]
      if (localHandler) {
        return valueToToolResult(await localHandler(input))
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
  ): Promise<void> {
    const urlPath = (req.url ?? "/").split("?")[0]
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

  async function startWebSocketServer(): Promise<WebSocketServer> {
    const wss = new WebSocketServer({ host: HOST, port: opts.ports.ws })

    wss.on("connection", attachRendererSocket)
    wss.on("error", (error: Error) => {
      console.error(`[${opts.appId}-sidecar] websocket server error`, error)
    })

    await new Promise<void>((resolve, reject) => {
      wss.once("listening", resolve)
      wss.once("error", reject)
    })

    console.error(
      `[${opts.appId}-sidecar] websocket listening on ws://${HOST}:${opts.ports.ws}`,
    )
    return wss
  }

  async function startMcpHttpServer(): Promise<http.Server> {
    const httpServer = http.createServer((req, res) => {
      void handleMcpHttpRequest(req, res)
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
      await startWebSocketServer()
      await startMcpHttpServer()
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
