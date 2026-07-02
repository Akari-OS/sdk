/**
 * bridge-auth — MCP ブリッジ共通トークン認証モジュール
 *
 * 設計方針:
 *   - 全 akari-* sidecar で共有する単一ファイル（依存ゼロ）
 *   - 共有トークンファイル: ~/.akari/secrets/mcp-bridge-token（0600）
 *   - AKARI_MCP_AUTH=off で無効化できる脱出ハッチ（既定は on）
 *   - ただし production 相当の環境では脱出ハッチを無視する（gap-audit SEC-12）。
 *     「production 相当」= NODE_ENV=production、または明示 dev フラグ
 *     （AKARI_ENV=development、cookbook 既定の慣習に合わせる）が無い場合。
 *     つまり dev で off を許すには AKARI_ENV=development を明示指定する必要がある
 *     （NODE_ENV 未設定のまま off だけ指定しても production 扱いで無視される＝fail-closed）。
 *
 * 保護対象:
 *   1. HTTP MCP: Host ヘッダ + Authorization: Bearer
 *   2. WebSocket: Host ヘッダ + ?token= query param
 *
 * akari-video sidecar/bridge-auth.ts（コミット 6a8d046）から移植。
 * 旧: 各リポの sidecar/ にコピー方式 → 新: bridge-core ライブラリとして一元管理。
 * sidecar.ts はここを import して使う（認証ロジックの二重実装を避ける）。
 */

import * as crypto from "node:crypto"
import * as fs from "node:fs"
import * as fsPromises from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import type * as http from "node:http"

// ────────────────────────────────────────────────────────────────────────────
// トークンファイルパス（全アプリ共通）
// 呼び出しの都度 os.homedir() を評価する（モジュール読み込み時に固定しない）。
// テストで HOME を差し替えてから呼べるようにするための設計で、本番挙動は変わらない
// （プロセス生存中に HOME が変わることは通常無い）。
// ────────────────────────────────────────────────────────────────────────────
function getSecretsDir(): string {
  return path.join(os.homedir(), ".akari", "secrets")
}

function getTokenFile(): string {
  return path.join(getSecretsDir(), "mcp-bridge-token")
}

// ────────────────────────────────────────────────────────────────────────────
// Auth の on/off スイッチ（+ production ガード）
// ────────────────────────────────────────────────────────────────────────────

/** 明示 dev フラグ（cookbook 慣習: AKARI_ENV=development）。 */
function isExplicitDevFlagSet(): boolean {
  return (process.env.AKARI_ENV ?? "").toLowerCase() === "development"
}

/**
 * production 相当の環境か判定する。
 * NODE_ENV=production なら常に true（明示 dev フラグより優先、fail-closed）。
 * それ以外は「明示 dev フラグが無い」場合に true（未設定は production 扱い）。
 */
function isProductionLike(): boolean {
  if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") return true
  return !isExplicitDevFlagSet()
}

interface AuthDecision {
  enabled: boolean
  /** AKARI_MCP_AUTH=off の指定を production ガードで無視したかどうか。 */
  offOverridden: boolean
}

function resolveAuthDecision(): AuthDecision {
  const requestedOff = (process.env.AKARI_MCP_AUTH ?? "on").toLowerCase() === "off"
  if (!requestedOff) return { enabled: true, offOverridden: false }
  if (isProductionLike()) return { enabled: true, offOverridden: true }
  return { enabled: false, offOverridden: false }
}

/** テスト・sidecar.ts から使う公開版。process.env を都度読むので副作用なしの純関数。 */
export function isAuthEnabled(): boolean {
  return resolveAuthDecision().enabled
}

// ────────────────────────────────────────────────────────────────────────────
// トークン生成・読み込み
// ────────────────────────────────────────────────────────────────────────────

/** 起動時に 1 回呼ぶ。ファイルが無ければ生成して返す。あれば読んで返す。 */
export async function loadOrCreateToken(): Promise<string> {
  const decision = resolveAuthDecision()

  if (decision.offOverridden) {
    console.error(
      "[bridge-auth] 警告: AKARI_MCP_AUTH=off is ignored because the environment " +
        `looks production-like (NODE_ENV=${process.env.NODE_ENV ?? "(unset)"}, ` +
        `AKARI_ENV=${process.env.AKARI_ENV ?? "(unset)"}). ` +
        "認証を維持します。dev で無効化するには AKARI_ENV=development を明示指定してください。",
    )
  }

  if (!decision.enabled) {
    console.error("[bridge-auth] auth=OFF (AKARI_MCP_AUTH=off)")
    return ""
  }

  const secretsDir = getSecretsDir()
  const tokenFile = getTokenFile()

  // ディレクトリを 0700 で作成
  await fsPromises.mkdir(secretsDir, { recursive: true, mode: 0o700 })

  if (fs.existsSync(tokenFile)) {
    const token = (await fsPromises.readFile(tokenFile, "utf8")).trim()
    if (token.length > 0) {
      console.error("[bridge-auth] auth=ON  token loaded from", tokenFile)
      return token
    }
  }

  // 新規生成
  const token = crypto.randomBytes(32).toString("hex")
  await fsPromises.writeFile(tokenFile, token + "\n", { encoding: "utf8", mode: 0o600 })
  console.error("[bridge-auth] auth=ON  token generated and saved to", tokenFile)
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
 *
 * 注意: `socket.destroy(new Error(...))` はリスナー不在の 'error' イベントを発火させ
 * **sidecar プロセスごと落とす**ため使わない（実際に dev ブラウザの無認証接続で全断した）。
 * 401 を書いてからエラーを渡さずに destroy する。
 */
export function checkWsAuth(
  req: http.IncomingMessage,
  socket: { destroy: (err?: Error) => void; write?: (data: string) => void },
  ctx: WsAuthContext,
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

  // (a) Host 検証
  if (!isAllowedHost(req.headers.host, ctx.port)) {
    return reject("forbidden host")
  }

  // (b) ?token= クエリパラム検証
  const urlObj = new URL(req.url ?? "/", `http://127.0.0.1:${ctx.port}`)
  const provided = urlObj.searchParams.get("token") ?? ""
  if (!timingSafeEqual(provided, ctx.token)) {
    return reject("unauthorized")
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
