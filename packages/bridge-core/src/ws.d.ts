declare module "ws" {
  import { EventEmitter } from "node:events"
  import type { IncomingMessage, Server } from "node:http"
  import type { Duplex } from "node:stream"

  export type RawData = Buffer | ArrayBuffer | Buffer[]

  export default class WebSocket extends EventEmitter {
    static readonly CONNECTING: 0
    static readonly OPEN: 1
    static readonly CLOSING: 2
    static readonly CLOSED: 3

    readonly readyState: 0 | 1 | 2 | 3

    send(
      data: string | Buffer,
      cb?: (err?: Error) => void,
    ): void
    close(code?: number, reason?: string): void
  }

  export class WebSocketServer extends EventEmitter {
    constructor(options: {
      host?: string
      port?: number
      server?: Server
      /** noServer=true にすると自動 listen しない。upgrade イベントで手動処理する */
      noServer?: boolean
    })
    address(): string | { address: string; family: string; port: number } | null
    close(cb?: (err?: Error) => void): void
    /** upgrade イベントで認証後にこれを呼ぶと WS コネクションを確立する */
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (ws: WebSocket, request: IncomingMessage) => void,
    ): void
  }
}
