import assert from "node:assert/strict"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import test from "node:test"

import { isAuthEnabled, loadOrCreateToken } from "../bridge-auth.ts"

type EnvOverrides = Record<string, string | undefined>

/** 指定した環境変数だけを差し替えて fn を実行し、終わったら必ず元に戻す。 */
async function withEnv<T>(overrides: EnvOverrides, fn: () => T | Promise<T>): Promise<T> {
  const saved: EnvOverrides = {}
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key]
  }
  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    return await fn()
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// isAuthEnabled: production ガードの意思決定ロジック
// ────────────────────────────────────────────────────────────────────────────

test("AKARI_MCP_AUTH 未指定なら auth は on（既定）", async () => {
  await withEnv(
    { AKARI_MCP_AUTH: undefined, NODE_ENV: undefined, AKARI_ENV: undefined },
    () => {
      assert.equal(isAuthEnabled(), true)
    },
  )
})

test("production 相当（NODE_ENV=production）では AKARI_MCP_AUTH=off を無視して auth=on を維持する", async () => {
  await withEnv(
    { AKARI_MCP_AUTH: "off", NODE_ENV: "production", AKARI_ENV: undefined },
    () => {
      assert.equal(isAuthEnabled(), true)
    },
  )
})

test("環境変数が何も無い（明示 dev フラグ未設定）場合も production 相当として扱い、off を無視する（fail-closed）", async () => {
  await withEnv(
    { AKARI_MCP_AUTH: "off", NODE_ENV: undefined, AKARI_ENV: undefined },
    () => {
      assert.equal(isAuthEnabled(), true)
    },
  )
})

test("明示 dev フラグ（AKARI_ENV=development）があれば dev 扱いで AKARI_MCP_AUTH=off を許可する", async () => {
  await withEnv(
    { AKARI_MCP_AUTH: "off", NODE_ENV: undefined, AKARI_ENV: "development" },
    () => {
      assert.equal(isAuthEnabled(), false)
    },
  )
})

test("NODE_ENV=production は明示 dev フラグより優先される（矛盾設定でも auth=on）", async () => {
  await withEnv(
    { AKARI_MCP_AUTH: "off", NODE_ENV: "production", AKARI_ENV: "development" },
    () => {
      assert.equal(isAuthEnabled(), true)
    },
  )
})

test("AKARI_MCP_AUTH=on（明示）なら dev/production を問わず auth=on", async () => {
  await withEnv(
    { AKARI_MCP_AUTH: "on", NODE_ENV: undefined, AKARI_ENV: "development" },
    () => {
      assert.equal(isAuthEnabled(), true)
    },
  )
})

// ────────────────────────────────────────────────────────────────────────────
// loadOrCreateToken: 実際のトークンファイル発行まで一気通貫で検証
// HOME を一時ディレクトリに差し替え、実ホームディレクトリには一切書き込まない。
// ────────────────────────────────────────────────────────────────────────────

test("dev + AKARI_MCP_AUTH=off の場合、loadOrCreateToken は空文字を返しトークンファイルも作らない", async () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-auth-test-"))
  try {
    await withEnv(
      { HOME: tmpHome, AKARI_MCP_AUTH: "off", NODE_ENV: undefined, AKARI_ENV: "development" },
      async () => {
        const token = await loadOrCreateToken()
        assert.equal(token, "")
        assert.equal(
          fs.existsSync(path.join(tmpHome, ".akari", "secrets", "mcp-bridge-token")),
          false,
        )
      },
    )
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  }
})

test("production 相当 + AKARI_MCP_AUTH=off でも loadOrCreateToken は実トークンを生成する（脱出ハッチ無視）", async () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-auth-test-"))
  try {
    await withEnv(
      { HOME: tmpHome, AKARI_MCP_AUTH: "off", NODE_ENV: "production", AKARI_ENV: undefined },
      async () => {
        const token = await loadOrCreateToken()
        assert.ok(token.length > 0, "production 相当では空トークンを返してはいけない")
        const tokenFile = path.join(tmpHome, ".akari", "secrets", "mcp-bridge-token")
        assert.equal(fs.existsSync(tokenFile), true)
        assert.equal(fs.readFileSync(tokenFile, "utf8").trim(), token)
      },
    )
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true })
  }
})
