import type {
  BridgeHello,
  BridgePorts,
  BridgeRequest,
  BridgeResponse,
} from "./protocol.ts"

const MAX_RECONNECT_DELAY_MS = 30_000

export interface ConnectBridgeOptions {
  appId: string
  ports: BridgePorts
  supportedTools: string[]
  dispatch: (tool: string, input: unknown) => Promise<unknown>
}

export interface BridgeConnection {
  disconnect(): void
}

// ────────────────────────────────────────────────────────────────────────────
// トークン読み取り（Tauri 環境: system_read_text_file / それ以外: 空文字列）
// ────────────────────────────────────────────────────────────────────────────

/** キャッシュ済みトークン（初回読み取り後に保持）。null = 未取得。*/
let cachedToken: string | null = null

/**
 * ~/.akari/secrets/mcp-bridge-token を読み取る。
 * Tauri WebView 上では system_read_text_file invoke を使う。
 * dev ブラウザ / invoke 不可の場合は空文字列を返す（AKARI_MCP_AUTH=off 相当）。
 */
async function readTokenFile(): Promise<string> {
  if (cachedToken !== null) return cachedToken
  try {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) {
      cachedToken = ""
      return ""
    }
    const { invoke } = await import("@tauri-apps/api/core")
    const raw = await invoke<string>("system_read_text_file", {
      path: "~/.akari/secrets/mcp-bridge-token",
    }).catch(() => "")
    cachedToken = (raw ?? "").trim()
  } catch {
    cachedToken = ""
  }
  return cachedToken
}

export function connectBridge(opts: ConnectBridgeOptions): BridgeConnection {
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectDelayMs = 1_000
  let closedByClient = false

  const bridgeBaseUrl = `ws://127.0.0.1:${opts.ports.ws}`

  function scheduleReconnect(): void {
    if (closedByClient || reconnectTimer) return

    const delay = reconnectDelayMs
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      // トークンを再取得してから再接続（トークンが変わった場合に対応）
      void readTokenFile().then((token) => openSocket(token))
    }, delay)
  }

  async function handleMessage(ws: WebSocket, data: unknown): Promise<void> {
    try {
      const text = typeof data === "string" ? data : await blobLikeToText(data)
      const parsed = JSON.parse(text) as unknown
      if (!isBridgeRequest(parsed)) return

      const response = await dispatchToResponse(parsed)
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(response))
      }
    } catch (error) {
      console.warn("[akari-bridge] failed to handle message", error)
    }
  }

  async function dispatchToResponse(
    request: BridgeRequest,
  ): Promise<BridgeResponse> {
    try {
      const result = await opts.dispatch(request.tool, request.input)
      return { id: request.id, ok: true, result }
    } catch (error) {
      return {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  function openSocket(token: string): void {
    if (closedByClient) return
    if (typeof WebSocket === "undefined") {
      console.warn("[akari-bridge] WebSocket is not available")
      return
    }
    if (socket && socket.readyState !== WebSocket.CLOSED) return

    // トークンが有れば ?token= クエリを付与（ブラウザ WS はカスタムヘッダ不可）
    const url = token
      ? `${bridgeBaseUrl}?token=${encodeURIComponent(token)}`
      : bridgeBaseUrl

    try {
      socket = new WebSocket(url)
    } catch (error) {
      console.warn("[akari-bridge] failed to create WebSocket", error)
      socket = null
      scheduleReconnect()
      return
    }

    const ws = socket
    ws.addEventListener("open", () => {
      reconnectDelayMs = 1_000
      const hello: BridgeHello = {
        type: "hello",
        app: opts.appId,
        tools: opts.supportedTools,
      }
      ws.send(JSON.stringify(hello))
    })

    ws.addEventListener("message", (event) => {
      void handleMessage(ws, event.data)
    })

    ws.addEventListener("close", () => {
      if (socket === ws) socket = null
      scheduleReconnect()
    })

    ws.addEventListener("error", (event) => {
      console.warn("[akari-bridge] WebSocket error", event)
      if (socket === ws) socket = null
      try {
        ws.close()
      } catch {
        // close 失敗時も reconnect は close/error 側で進める。
      }
      scheduleReconnect()
    })
  }

  // トークンを非同期で取得してから接続
  void readTokenFile().then((token) => openSocket(token))

  return {
    disconnect(): void {
      closedByClient = true
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (socket) {
        const ws = socket
        socket = null
        try {
          ws.close()
        } catch {
          // disconnect は best-effort。
        }
      }
    },
  }
}

function isBridgeRequest(value: unknown): value is BridgeRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const record = value as Record<string, unknown>
  return typeof record.id === "string" && typeof record.tool === "string"
}

async function blobLikeToText(data: unknown): Promise<string> {
  if (data instanceof Blob) return data.text()
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data)
  throw new Error("Unsupported WebSocket message payload")
}
