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
  "com.akari.diagram": { ws: 47629, mcp: 47630 },
  "com.akari.fx": { ws: 47631, mcp: 47632 },
  "com.akari.synth": { ws: 47633, mcp: 47634 },
  "com.akari.circuit": { ws: 47635, mcp: 47636 },
  "com.akari.site": { ws: 47637, mcp: 47638 },
  "com.akari.audio": { ws: 47639, mcp: 47640 },
  "com.akari.canvas": { ws: 47641, mcp: 47642 },
  // OS 層: shell 自身のオーケストレーション MCP（os_open_app 等でアプリを開く/切替）
  "com.akari.shell": { ws: 47627, mcp: 47628 },
}

export interface ToolDef {
  name: string
  title?: string
  description: string
  inputSchema: object
}
