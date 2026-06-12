/**
 * bridge-auth — MCP ブリッジ共通トークン認証モジュール
 *
 * 設計方針:
 *   - 全 akari-* sidecar で共有する単一ファイル（依存ゼロ）
 *   - 共有トークンファイル: ~/.akari/secrets/mcp-bridge-token（0600）
 *   - AKARI_MCP_AUTH=off で無効化できる脱出ハッチ（既定は on）
 *
 * 保護対象:
 *   1. HTTP MCP: Host ヘッダ + Authorization: Bearer
 *   2. WebSocket: Host ヘッダ + ?token= query param
 *
 * akari-video sidecar/bridge-auth.ts（コミット 6a8d046）から移植。
 * 旧: 各リポの sidecar/ にコピー方式 → 新: bridge-core ライブラリとして一元管理。
 */

import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as fsPromises from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import type * as http from "node:http"

// ────────────────────────────────────────────────────────────────────────────
// トークンファイルパス（全アプリ共通）
// ────────────────────────────────────────────────────────────────────────────
const SECRETS_DIR = path.join(os.homedir(), ".akari", "secrets")
const TOKEN_FILE = path.join(SECRETS_DIR, "mcp-bridge-token")

// ────────────────────────────────────────────────────────────────────────────
// Auth の on/off スイッチ
// ────────────────────────────────────────────────────────────────────────────
function isAuthEnabled(): boolean {
  return (process.env.AKARI_MCP_AUTH ?? "on").toLowerCase() !== "off"
}

// ────────────────────────────────────────────────────────────────────────────
// トークン生成・読み込み
// ────────────────────────────────────────────────────────────────────────────

/** 起動時に 1 回呼ぶ。ファイルが無ければ生成して返す。あれば読んで返す。 */
export async function loadOrCreateToken(): Promise<string> {
  if (!isAuthEnabled()) {
    console.error("[bridge-auth] auth=OFF (AKARI_MCP_AUTH=off)")
    return ""
  }

  // ディレクトリを 0700 で作成
  await fsPromises.mkdir(SECRETS_DIR, { recursive: true, mode: 0o700 })

  if (fs.existsSync(TOKEN_FILE)) {
    const token = (await fsPromises.readFile(TOKEN_FILE, "utf8")).trim()
    if (token.length > 0) {
      console.error("[bridge-auth] auth=ON  token loaded from", TOKEN_FILE)
      return token
    }
  }

  // 新規生成
  const token = crypto.randomBytes(32).toString("hex")
  await fsPromises.writeFile(TOKEN_FILE, token + "\n", { encoding: "utf8", mode: 0o600 })
  console.error("[bridge-auth] auth=ON  token generated and saved to", TOKEN_FILE)
  return token
}

// ────────────────────────────────────────────────────────────────────────────
// Host ヘッダ検証（DNS rebinding 対策）
// ────────────────────────────────────────────────────────────────────────────

function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (!hostHeader) return false
  const normalised = hostHeader.toLowerCase().trim()
  return (
    normalised === `127.0.0.1:${port}` ||
    normalised === `localhost:${port}`
  )
}

// ────────────────────────────────────────────────────────────────────────────
// HTTP MCP リクエスト検証
// ────────────────────────────────────────────────────────────────────────────

export interface HttpAuthContext {
  /** sidecar が listen しているポート（DNS rebinding 検証用） */
  port: number
  /** loadOrCreateToken() で得たトークン */
  token: string
}

/**
 * HTTP リクエストのアクセス可否を判定する。
 * 拒否の場合は res に 401/403 を書いて false を返す。
 * 認証が off の場合は常に true（res には何も書かない）。
 */
export function checkHttpAuth(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: HttpAuthContext,
): boolean {
  if (!isAuthEnabled()) return true

  // (a) Host 検証（DNS rebinding 遮断）
  if (!isAllowedHost(req.headers.host, ctx.port)) {
    res.writeHead(403, { "content-type": "text/plain" })
    res.end()
    return false
  }

  // (b) Bearer トークン検証
  const authHeader = req.headers.authorization ?? ""
  const bearerPrefix = "Bearer "
  if (!authHeader.startsWith(bearerPrefix)) {
    res.writeHead(401, { "content-type": "text/plain", "www-authenticate": "Bearer" })
    res.end()
    return false
  }
  const provided = authHeader.slice(bearerPrefix.length).trim()
  if (!timingSafeEqual(provided, ctx.token)) {
    res.writeHead(401, { "content-type": "text/plain", "www-authenticate": "Bearer" })
    res.end()
    return false
  }

  return true
}

// ────────────────────────────────────────────────────────────────────────────
// WebSocket upgrade 検証
// ────────────────────────────────────────────────────────────────────────────

export interface WsAuthContext {
  /** sidecar が listen しているポート */
  port: number
  /** loadOrCreateToken() で得たトークン */
  token: string
}

/**
 * WebSocket upgrade リクエストのアクセス可否を判定する。
 * 拒否の場合は socket を閉じて false を返す。
 * 認証が off の場合は常に true。
 *
 * トークン渡し方: ?token=<hex> クエリパラム（ブラウザ WS API では
 * カスタムヘッダが使えないため query param が現実的）。
 */
export function checkWsAuth(
  req: http.IncomingMessage,
  socket: { destroy: (err?: Error) => void },
  ctx: WsAuthContext,
): boolean {
  if (!isAuthEnabled()) return true

  // (a) Host 検証
  if (!isAllowedHost(req.headers.host, ctx.port)) {
    socket.destroy(new Error("bridge-auth: forbidden host"))
    return false
  }

  // (b) ?token= クエリパラム検証
  const urlObj = new URL(req.url ?? "/", `http://127.0.0.1:${ctx.port}`)
  const provided = urlObj.searchParams.get("token") ?? ""
  if (!timingSafeEqual(provided, ctx.token)) {
    socket.destroy(new Error("bridge-auth: unauthorized"))
    return false
  }

  return true
}

// ────────────────────────────────────────────────────────────────────────────
// タイミングセーフ文字列比較（タイミング攻撃対策）
// ────────────────────────────────────────────────────────────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length === 0 || b.length === 0) return false
  const bufA = Buffer.from(a, "utf8")
  const bufB = Buffer.from(b, "utf8")
  if (bufA.length !== bufB.length) {
    // 長さが違う場合でもタイミングを均す（固定長バッファで比較）
    const padded = Buffer.alloc(bufB.length)
    bufA.copy(padded, 0, 0, Math.min(bufA.length, padded.length))
    crypto.timingSafeEqual(padded, bufB)
    return false
  }
  return crypto.timingSafeEqual(bufA, bufB)
}
