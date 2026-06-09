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

export function connectBridge(opts: ConnectBridgeOptions): BridgeConnection {
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let reconnectDelayMs = 1_000
  let closedByClient = false

  const bridgeUrl = `ws://127.0.0.1:${opts.ports.ws}`

  function scheduleReconnect(): void {
    if (closedByClient || reconnectTimer) return

    const delay = reconnectDelayMs
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      openSocket()
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

  function openSocket(): void {
    if (closedByClient) return
    if (typeof WebSocket === "undefined") {
      console.warn("[akari-bridge] WebSocket is not available")
      return
    }
    if (socket && socket.readyState !== WebSocket.CLOSED) return

    try {
      socket = new WebSocket(bridgeUrl)
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

  openSocket()

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
