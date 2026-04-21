/**
 * RenderContext 型定義
 *
 * SchemaPanel コンポーネントに渡す実行時コンテキスト。
 * Shell 側が実際の MCP / Pool / AMP クライアントを注入する。
 * リファレンス実装では全クライアントは stub。
 */

import type { LocaleCode } from "./schema";

// ---------------------------------------------------------------------------
// MCP Client (stub contract)
// ---------------------------------------------------------------------------

export interface McpToolCallOptions {
  timeout?: number;
}

/**
 * MCP クライアントのインターフェース。
 * Shell 側が Tauri command ラッパーを注入する。
 */
export interface McpClient {
  /**
   * MCP ツールを呼び出す。
   * @param tool  ツール名（例: "notion.query_database"）
   * @param args  ツール引数
   * @returns     ツールの返り値
   */
  call(
    tool: string,
    args: Record<string, unknown>,
    options?: McpToolCallOptions
  ): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Pool Client (stub contract)
// ---------------------------------------------------------------------------

export interface PoolSearchOptions {
  query?: string;
  types?: string[];
  limit?: number;
}

export interface PoolItem {
  id: string;
  name: string;
  mime: string;
  tags: string[];
  url?: string;
  createdAt: string;
}

/**
 * Pool クライアントのインターフェース。
 * Shell 側が実際の Pool daemon 接続を注入する。
 */
export interface PoolClient {
  /** Pool を検索する */
  search(options: PoolSearchOptions): Promise<PoolItem[]>;

  /** Pool アイテムを取得する */
  get(id: string): Promise<PoolItem | null>;

  /** Pool アイテムを保存する */
  put(item: Omit<PoolItem, "id" | "createdAt">): Promise<string>;
}

// ---------------------------------------------------------------------------
// AMP Client (stub contract)
// ---------------------------------------------------------------------------

export interface AmpRecord {
  id: string;
  kind: string;
  content: string;
  goal_ref?: string;
  createdAt: string;
  fields?: Record<string, unknown>;
}

export interface AmpQueryOptions {
  kind?: string;
  goal_ref?: string;
  limit?: number;
}

/**
 * AMP クライアントのインターフェース。
 * Shell 側が実際の AMP 接続を注入する。
 */
export interface AmpClient {
  /** AMP レコードを照会する */
  query(options: AmpQueryOptions): Promise<AmpRecord[]>;

  /** AMP レコードを書き込む */
  record(record: Omit<AmpRecord, "id" | "createdAt">): Promise<string>;

  /** AMP レコードをフィールドパスで取得する */
  getField(
    kind: string,
    recordId: string,
    field: string
  ): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Inter-App Handoff (AKARI App SDK §6.5)
// ---------------------------------------------------------------------------

export interface HandoffPayload {
  to: string;
  intent: string;
  payload: Record<string, unknown>;
}

export interface AppClient {
  /** 他 App への handoff を実行する */
  handoff(params: HandoffPayload): Promise<void>;
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

export interface NavigationClient {
  /**
   * Panel 内ナビゲーション。
   * "tab:<tabId>" 形式で特定タブに遷移する。
   */
  navigate(target: string): void;
}

// ---------------------------------------------------------------------------
// Toast / notification
// ---------------------------------------------------------------------------

export interface ToastClient {
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
}

// ---------------------------------------------------------------------------
// RenderContext
// ---------------------------------------------------------------------------

/**
 * SchemaPanel コンポーネントに渡す実行時コンテキスト。
 *
 * Shell 側でこのオブジェクトを組み立て、
 * `<SchemaPanel schema={schema} context={context} />` に渡す。
 *
 * TODO: Shell 側での wiring が必要
 * - mcpClient: Tauri command ラッパーを実装
 * - poolClient: Pool daemon への Unix socket 接続を実装
 * - ampClient: AMP への接続を実装
 * - appClient: Inter-App handoff を実装
 * - navigationClient: TanStack Router を使ったナビゲーションを実装
 * - toastClient: shadcn/ui の Toaster を使ったトースト実装
 */
export interface RenderContext {
  /** MCP ツール呼び出しクライアント */
  mcpClient: McpClient;

  /** Pool クライアント */
  poolClient: PoolClient;

  /** AMP クライアント */
  ampClient: AmpClient;

  /** Inter-App handoff クライアント */
  appClient: AppClient;

  /** Panel 内ナビゲーション */
  navigationClient: NavigationClient;

  /** トースト通知 */
  toastClient: ToastClient;

  /** 現在ロケール（例: "ja", "en"） */
  locale: LocaleCode;

  /** フォールバックロケール（未定義キーのフォールバック先）。省略時は "en" */
  fallbackLocale?: LocaleCode;
}

// ---------------------------------------------------------------------------
// Stub implementations（開発 / テスト用）
// ---------------------------------------------------------------------------

export const createStubMcpClient = (): McpClient => ({
  async call(tool, args) {
    console.warn(`[StubMcpClient] call(${tool}, ${JSON.stringify(args)}) — not wired`);
    return null;
  },
});

export const createStubPoolClient = (): PoolClient => ({
  async search(options) {
    console.warn(`[StubPoolClient] search(${JSON.stringify(options)}) — not wired`);
    return [];
  },
  async get(id) {
    console.warn(`[StubPoolClient] get(${id}) — not wired`);
    return null;
  },
  async put(item) {
    console.warn(`[StubPoolClient] put(${JSON.stringify(item)}) — not wired`);
    return "stub-id";
  },
});

export const createStubAmpClient = (): AmpClient => ({
  async query(options) {
    console.warn(`[StubAmpClient] query(${JSON.stringify(options)}) — not wired`);
    return [];
  },
  async record(record) {
    console.warn(`[StubAmpClient] record(${JSON.stringify(record)}) — not wired`);
    return "stub-id";
  },
  async getField(kind, recordId, field) {
    console.warn(`[StubAmpClient] getField(${kind}, ${recordId}, ${field}) — not wired`);
    return null;
  },
});

export const createStubAppClient = (): AppClient => ({
  async handoff(params) {
    console.warn(`[StubAppClient] handoff(${JSON.stringify(params)}) — not wired`);
  },
});

export const createStubNavigationClient = (): NavigationClient => ({
  navigate(target) {
    console.warn(`[StubNavigationClient] navigate(${target}) — not wired`);
  },
});

export const createStubToastClient = (): ToastClient => ({
  success(message) { console.log(`[Toast:success] ${message}`); },
  error(message) { console.error(`[Toast:error] ${message}`); },
  info(message) { console.info(`[Toast:info] ${message}`); },
});

/**
 * 開発 / テスト用のフル stub RenderContext を生成する。
 * Shell 本番では各クライアントを実際の実装に差し替える。
 */
export const createStubRenderContext = (
  locale: LocaleCode = "ja"
): RenderContext => ({
  mcpClient: createStubMcpClient(),
  poolClient: createStubPoolClient(),
  ampClient: createStubAmpClient(),
  appClient: createStubAppClient(),
  navigationClient: createStubNavigationClient(),
  toastClient: createStubToastClient(),
  locale,
  fallbackLocale: "en",
});
