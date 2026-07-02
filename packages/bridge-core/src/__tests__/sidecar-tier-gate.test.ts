/**
 * sidecar.ts の CallTool/ListTools ハンドラを実際の MCP HTTP 経路で検証する統合テスト。
 * tool-tier-gate.test.ts はロジック単体を検証するが、こちらは
 * 「discovery で隠れているツールは CallTool でも拒否される」という
 * gap-audit SEC-12 の要件を、実プロトコル越しに確認する。
 */
import assert from "node:assert/strict"
import * as net from "node:net"
import test from "node:test"

import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

import { createBridgeSidecar } from "../sidecar.ts"
import type { ToolDef } from "../protocol.ts"

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (address && typeof address === "object") {
        const port = address.port
        server.close(() => resolve(port))
      } else {
        server.close(() => reject(new Error("failed to allocate free port")))
      }
    })
  })
}

const toolDefs: ToolDef[] = [
  { name: "video_get_state", description: "state 取得", inputSchema: { type: "object" } },
  { name: "video_load_group", description: "遅延グループを解放する", inputSchema: { type: "object" } },
  { name: "video_color_grade", description: "カラーグレーディング（lazy）", inputSchema: { type: "object" } },
]

test("discovery で隠れている tier 未ロードのツールは CallTool でも MCP エラーで拒否される", async () => {
  const wsPort = await getFreePort()
  const mcpPort = await getFreePort()

  // AKARI_MCP_AUTH=off + AKARI_ENV=development: このテストは tier gating のみを検証するため
  // 認証は無効化する（認証自体の production ガードは bridge-auth.test.ts で別途検証済み）。
  const savedAuth = process.env.AKARI_MCP_AUTH
  const savedEnv = process.env.AKARI_ENV
  process.env.AKARI_MCP_AUTH = "off"
  process.env.AKARI_ENV = "development"

  const sidecar = createBridgeSidecar({
    appId: "com.akari.video-test",
    ports: { ws: wsPort, mcp: mcpPort },
    toolDefs,
    exposedToolNames: toolDefs.map((tool) => tool.name),
    listedToolNames: ["video_get_state", "video_load_group"],
    toolGroups: { color: ["video_color_grade"] },
    loadGroupToolName: "video_load_group",
  })

  const client = new Client({ name: "test-client", version: "0.0.0" })

  try {
    await sidecar.start()

    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${mcpPort}/mcp`),
    )
    await client.connect(transport)

    // (1) discovery には core（listedToolNames）だけが出る
    const listed = await client.listTools()
    assert.deepEqual(
      listed.tools.map((tool) => tool.name).sort(),
      ["video_get_state", "video_load_group"].sort(),
    )

    // (2) tier 未ロードのツールを CallTool しても実行されず、MCP エラー（isError）で拒否される
    const rejected = await client.callTool({ name: "video_color_grade", arguments: {} })
    assert.equal(rejected.isError, true)
    const rejectedText =
      Array.isArray(rejected.content) && rejected.content[0]?.type === "text"
        ? rejected.content[0].text
        : ""
    assert.match(String(rejectedText), /not loaded yet \(tier-gated\)/)

    // (3) load_group でグループを解放する
    const loadResult = await client.callTool({
      name: "video_load_group",
      arguments: { name: "color" },
    })
    assert.equal(loadResult.isError, undefined)

    // (4) discovery にも video_color_grade が現れるようになる
    const listedAfterLoad = await client.listTools()
    assert.ok(listedAfterLoad.tools.some((tool) => tool.name === "video_color_grade"))

    // (5) ロード後は tier チェックを通過し、実行フェーズまで到達する
    //     （renderer 未接続のため最終的には失敗するが、エラー理由が「tier-gated」から
    //     「renderer is not connected」に変わることで、tier ゲートを通過したと確認できる）
    const afterLoad = await client.callTool({ name: "video_color_grade", arguments: {} })
    assert.equal(afterLoad.isError, true)
    const afterLoadText =
      Array.isArray(afterLoad.content) && afterLoad.content[0]?.type === "text"
        ? afterLoad.content[0].text
        : ""
    assert.doesNotMatch(String(afterLoadText), /tier-gated/)
    assert.match(String(afterLoadText), /renderer is not connected/)

    // (6) 未知のツール名は従来通り Unknown tool
    const unknown = await client.callTool({ name: "video_does_not_exist", arguments: {} })
    assert.equal(unknown.isError, true)
    const unknownText =
      Array.isArray(unknown.content) && unknown.content[0]?.type === "text"
        ? unknown.content[0].text
        : ""
    assert.match(String(unknownText), /Unknown tool/)

    await client.close()
  } finally {
    await sidecar.stop()
    if (savedAuth === undefined) delete process.env.AKARI_MCP_AUTH
    else process.env.AKARI_MCP_AUTH = savedAuth
    if (savedEnv === undefined) delete process.env.AKARI_ENV
    else process.env.AKARI_ENV = savedEnv
  }
})
