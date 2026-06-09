declare module "ws" {
  import { EventEmitter } from "node:events"
  import type { Server } from "node:http"

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
    constructor(options: { host?: string; port?: number; server?: Server })
    address(): string | { address: string; family: string; port: number } | null
    close(cb?: (err?: Error) => void): void
  }
}
