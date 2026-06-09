export interface BridgeRequest<T = unknown> {
  id: string
  tool: string
  input: T
}

export interface BridgeResponse<T = unknown> {
  id: string
  ok: boolean
  result?: T
  error?: string
}

export interface BridgeHello {
  type: "hello"
  app: string
  tools: string[]
}

export interface BridgePorts {
  ws: number
  mcp: number
}

export const APP_BRIDGE_PORTS: Record<string, BridgePorts> = {
  "com.akari.video": { ws: 47615, mcp: 47616 },
  "com.akari.svg": { ws: 47617, mcp: 47618 },
  "com.akari.sheets": { ws: 47619, mcp: 47620 },
  "com.akari.stage": { ws: 47621, mcp: 47622 },
  "com.akari.design": { ws: 47623, mcp: 47624 },
  "com.akari.3d": { ws: 47625, mcp: 47626 },
}

export interface ToolDef {
  name: string
  title?: string
  description: string
  inputSchema: object
}
