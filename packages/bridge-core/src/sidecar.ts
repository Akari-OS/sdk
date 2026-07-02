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
import { checkHttpAuth, checkWsAuth, loadOrCreateToken } from "./bridge-auth.ts"
import type {
  BridgeHello,
  BridgePorts,
  BridgeRequest,
  BridgeResponse,
  ToolDef,
} from "./protocol.ts"
import { createToolTierGate } from "./tool-tier-gate.ts"

const HOST = "127.0.0.1"
const MCP_HTTP_PATH = "/mcp"
const RESPONSE_TIMEOUT_MS = 15_000

// ────────────────────────────────────────────────────────────────────────────
// MCP ブリッジ認証は bridge-auth.ts に一元化（discovery/実行と同様、二重実装を避ける）。
// 共有トークン: ~/.akari/secrets/mcp-bridge-token（0600）
// AKARI_MCP_AUTH=off で無効化できる脱出ハッチ（既定は on、production 相当では無視される）
// ────────────────────────────────────────────────────────────────────────────

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
  /**
   * ADR-130: discovery（tools/list）に出す初期ツール名のサブセット。
   * 省略時は exposedToolNames 全件を返す（tier 非対応・後方互換モード）。
   *
   * gap-audit SEC-12 対応: CallTool も「今ロードされているツール」だけを受け付ける
   * （discovery と同一の判定ロジックを共有。二重実装しない — tool-tier-gate.ts 参照）。
   * つまり listedToolNames を絞ったのに CallTool が全件を許す、という抜け穴は無い。
   */
  listedToolNames?: string[]
  /**
   * ADR-130 D-4: 遅延グループ（lazy bundle）定義。キー=グループ名、値=解放するツール名一覧。
   * `loadGroupToolName` と組み合わせて使う。
   */
  toolGroups?: Record<string, string[]>
  /**
   * `<app>_load_group(name)` に相当するメタツールの名前。
   * CallTool でこの名前が呼ばれると、bridge-core が `toolGroups[input.name]` を
   * discovery/実行の両方に解放する（アプリ側で localHandler を書く必要はない）。
   * このツール自体は `listedToolNames` に含めて常時呼び出せるようにしておくこと。
   */
  loadGroupToolName?: string
  localHandlers?: Record<string, LocalHandlerFn>
}

export interface BridgeSidecar {
  start(): Promise<void>
  /** 起動した WS/MCP HTTP サーバを閉じる（主にテスト・グレースフルシャットダウン用）。 */
  stop(): Promise<void>
}

export function createBridgeSidecar(
  opts: CreateBridgeSidecarOptions,
): BridgeSidecar {
  const exposedToolNames = new Set(opts.exposedToolNames)
  // ADR-130: discovery（tools/list）と CallTool の両方がこの tierGate を参照する
  // （判定ロジックの単一ソース。gap-audit SEC-12 の「discoveryだけ絞ってCallToolは素通り」を解消）。
  const tierGate = createToolTierGate({
    toolDefs: opts.toolDefs,
    exposedToolNames,
    listedToolNames: opts.listedToolNames,
    toolGroups: opts.toolGroups,
  })
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

    // ADR-130: discovery は tierGate がロード済みと判定したツールだけを返す（既定は全件）。
    server.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: tierGate.listLoadedTools().map((tool) => ({
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
        const args = request.params.arguments ?? {}

        if (opts.loadGroupToolName && requestedName === opts.loadGroupToolName) {
          return handleLoadGroupCall(args)
        }

        if (!exposedToolNames.has(requestedName)) {
          return errorResult(`Unknown tool: ${requestedName}`)
        }

        // gap-audit SEC-12: discovery で見えていない（tier 未ロードの）ツールは実行も拒否する。
        // tierGate.isLoaded は ListTools と同じ判定ロジックを参照する（二重実装しない）。
        if (!tierGate.isLoaded(requestedName)) {
          return errorResult(
            `Tool "${requestedName}" is not loaded yet (tier-gated).` +
              (opts.loadGroupToolName
                ? ` Call "${opts.loadGroupToolName}" with the containing group name first.`
                : " It is not currently exposed by this sidecar."),
          )
        }

        return invokeTool(requestedName, args)
      },
    )

    return server
  }

  /** ADR-130 D-4: `<app>_load_group(name)` 相当のメタツール呼び出しを bridge-core 側で処理する。 */
  function handleLoadGroupCall(args: unknown): ToolResult {
    const groupName = isRecord(args) && typeof args.name === "string" ? args.name : undefined
    if (!groupName) {
      return errorResult(`${opts.loadGroupToolName} requires { name: string }`)
    }

    const result = tierGate.loadGroup(groupName)
    if (!result) {
      return errorResult(`Unknown tool group: ${groupName}`)
    }

    return valueToToolResult({
      group: groupName,
      loaded: result.loaded,
      alreadyLoaded: result.alreadyLoaded,
    })
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
    if (!checkHttpAuth(req, res, { port: opts.ports.mcp, token: authToken })) {
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

  async function startWebSocketServer(
    authToken: string,
  ): Promise<{ wss: WebSocketServer; httpServer: http.Server }> {
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
      if (!checkWsAuth(req, socket, { port: opts.ports.ws, token: authToken })) {
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
    return { wss, httpServer }
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

  let wsHttpServer: http.Server | null = null
  let mcpHttpServer: http.Server | null = null

  function closeServer(server: http.Server | null): Promise<void> {
    if (!server) return Promise.resolve()
    return new Promise<void>((resolve) => {
      server.close(() => resolve())
      // keep-alive 中の接続が残っていると close() のコールバックが遅延するため強制切断する。
      server.closeAllConnections?.()
    })
  }

  return {
    async start(): Promise<void> {
      // 認証トークンをロード or 生成（AKARI_MCP_AUTH=off なら "" を返す）
      const authToken = await loadOrCreateToken()
      const { httpServer } = await startWebSocketServer(authToken)
      wsHttpServer = httpServer
      mcpHttpServer = await startMcpHttpServer(authToken)
    },
    async stop(): Promise<void> {
      rejectAllPending(new Error(`${opts.appId}-sidecar stopped`))
      await Promise.all([closeServer(wsHttpServer), closeServer(mcpHttpServer)])
      wsHttpServer = null
      mcpHttpServer = null
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
