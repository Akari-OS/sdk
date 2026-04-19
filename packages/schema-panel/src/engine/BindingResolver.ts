/**
 * BindingResolver
 *
 * Panel Schema v0 §6.4 の Binding 規約に従い、bind 文字列を解決する。
 *
 * サポートするパターン:
 *   mcp.<tool>.<param>      → MCP 呼び出しの引数キーとして返す
 *   pool.<query_id>         → Pool Picker 経由 or 直接取得（stub）
 *   amp.<kind>.<field>      → AMP レコード参照（stub）
 *   state.<key>             → Zustand store 読み書き
 *   const.<value>           → リテラル値
 *
 * 各 resolve メソッドは Promise<unknown> を返す contract。
 * Shell 側が実際のクライアントをインジェクトする。
 *
 * TODO: mcp.* は MCP 呼び出しの「引数名」を特定するために使うのが主目的。
 *       実際の値の書き込み / 読み込みは ActionDispatcher が担う。
 */

import type { BindingPattern } from "../types/schema";
import type { McpClient, PoolClient, AmpClient } from "../types/context";

// ---------------------------------------------------------------------------
// Binding parts
// ---------------------------------------------------------------------------

export type BindingKind = "mcp" | "pool" | "amp" | "state" | "const";

export interface ParsedBinding {
  kind: BindingKind;
  /** パス全体（kind 以降） */
  path: string;
  /** パスの各セグメント */
  segments: string[];
}

/**
 * bind 文字列をパースして ParsedBinding を返す。
 * 不正な形式の場合は null を返す。
 */
export function parseBinding(bind: BindingPattern): ParsedBinding | null {
  const dotIdx = bind.indexOf(".");
  if (dotIdx === -1) {
    console.warn(`[BindingResolver] Invalid binding (no dot): "${bind}"`);
    return null;
  }

  const kind = bind.slice(0, dotIdx) as BindingKind;
  const path = bind.slice(dotIdx + 1);
  const segments = path.split(".");

  if (!["mcp", "pool", "amp", "state", "const"].includes(kind)) {
    console.warn(`[BindingResolver] Unknown binding kind: "${kind}"`);
    return null;
  }

  return { kind, path, segments };
}

// ---------------------------------------------------------------------------
// State accessor (Zustand store 経由)
// ---------------------------------------------------------------------------

/**
 * Panel ローカル state への read/write インターフェース。
 * usePanelState フック（Zustand）から注入される。
 */
export interface PanelStateAccessor {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

// ---------------------------------------------------------------------------
// BindingResolver
// ---------------------------------------------------------------------------

export interface BindingResolverOptions {
  mcpClient: McpClient;
  poolClient: PoolClient;
  ampClient: AmpClient;
  stateAccessor: PanelStateAccessor;
}

/**
 * Binding を解決するクラス。
 *
 * 使い方（値の読み取り）:
 * ```ts
 * const resolver = new BindingResolver({ mcpClient, poolClient, ampClient, stateAccessor });
 * const value = await resolver.resolve("state.db_results");
 * ```
 *
 * 使い方（値の書き込み）:
 * ```ts
 * await resolver.write("state.db_results", rows);
 * ```
 */
export class BindingResolver {
  private mcp: McpClient;
  private pool: PoolClient;
  private amp: AmpClient;
  private state: PanelStateAccessor;

  constructor(options: BindingResolverOptions) {
    this.mcp = options.mcpClient;
    this.pool = options.poolClient;
    this.amp = options.ampClient;
    this.state = options.stateAccessor;
  }

  /**
   * bind 文字列から現在の値を読み取る。
   *
   * @param bind  Binding パターン文字列
   * @returns     解決された値（Promise）
   */
  async resolve(bind: BindingPattern): Promise<unknown> {
    const parsed = parseBinding(bind);
    if (!parsed) return undefined;

    switch (parsed.kind) {
      case "mcp":
        // mcp.* バインディングは「引数キー」の識別子として使うのが主目的。
        // 値の読み取りは MCP ツール呼び出し結果（ActionDispatcher 経由）なので
        // ここでは null を返す（呼び出し前に値がないのは正常）。
        // TODO: 将来 MCP resource（読み取り専用データ）への対応が必要 (Panel Schema v0 Q-4)
        return undefined;

      case "pool":
        // pool.<query_id> → Pool を検索して初期値として返す
        return this.resolvePool(parsed.path);

      case "amp":
        // amp.<kind>.<field> → AMP レコードのフィールドを返す
        return this.resolveAmp(parsed.segments);

      case "state":
        // state.<key> → Zustand store から読み取る
        return this.state.get(parsed.path);

      case "const":
        // const.<value> → リテラル値（数値変換を試みる）
        return this.resolveConst(parsed.path);

      default: {
        const _never: never = parsed.kind;
        console.warn(`[BindingResolver] Unhandled binding kind: ${_never}`);
        return undefined;
      }
    }
  }

  /**
   * bind 文字列に値を書き込む。
   * state.* のみ書き込み可能。mcp.* は ActionDispatcher が処理する。
   *
   * @param bind   Binding パターン文字列
   * @param value  書き込む値
   */
  async write(bind: BindingPattern, value: unknown): Promise<void> {
    const parsed = parseBinding(bind);
    if (!parsed) return;

    switch (parsed.kind) {
      case "state":
        this.state.set(parsed.path, value);
        break;

      case "mcp":
        // mcp.* への直接書き込みは ActionDispatcher が担う
        console.warn(
          `[BindingResolver] Direct write to mcp binding not supported: "${bind}". Use ActionDispatcher.`
        );
        break;

      case "amp":
        // TODO: AMP への書き込み実装（AKARI Module SDK §6.2 Memory API）
        console.warn(`[BindingResolver] AMP write not yet implemented: "${bind}"`);
        break;

      case "pool":
        // Pool への直接書き込みは通常 Pool Picker Widget が担う
        console.warn(`[BindingResolver] Pool write not yet implemented: "${bind}"`);
        break;

      case "const":
        console.warn(`[BindingResolver] Cannot write to const binding: "${bind}"`);
        break;

      default: {
        const _never: never = parsed.kind;
        console.warn(`[BindingResolver] Unhandled binding kind for write: ${_never}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private resolvers
  // ---------------------------------------------------------------------------

  /**
   * pool.<query_id> を解決する。
   * Pool クライアントに query_id をキーワードとして渡す。
   *
   * TODO: query_id の意味（tagged / recent / semantic search）は Pool spec で定義する
   */
  private async resolvePool(queryId: string): Promise<unknown> {
    try {
      const results = await this.pool.search({ query: queryId });
      return results;
    } catch (err) {
      console.error(`[BindingResolver] Pool search failed for "${queryId}":`, err);
      return null;
    }
  }

  /**
   * amp.<kind>.<field> を解決する。
   * AMP クライアントから最新レコードのフィールドを返す。
   *
   * TODO: レコード特定の方法（最新 / goal_ref / ID）は AMP spec に従う
   */
  private async resolveAmp(segments: string[]): Promise<unknown> {
    const [kind, field] = segments;
    if (!kind || !field) {
      console.warn(`[BindingResolver] Invalid amp binding segments:`, segments);
      return null;
    }
    try {
      const records = await this.amp.query({ kind, limit: 1 });
      if (records.length === 0) return null;
      return records[0].fields?.[field] ?? null;
    } catch (err) {
      console.error(`[BindingResolver] AMP query failed for "${kind}.${field}":`, err);
      return null;
    }
  }

  /**
   * const.<value> を解決する。
   * 数値 / boolean / null / 文字列に変換して返す。
   */
  private resolveConst(value: string): unknown {
    if (value === "null") return null;
    if (value === "true") return true;
    if (value === "false") return false;
    const num = Number(value);
    if (!isNaN(num)) return num;
    return value;
  }
}

// ---------------------------------------------------------------------------
// MCP args builder
// ---------------------------------------------------------------------------

/**
 * Action の mcp.args を解決して実際の呼び出し引数オブジェクトを作る。
 *
 * args 内の "$fieldId" 参照をフィールド値マップから置換する。
 * ネストしたオブジェクト / 配列も再帰的に処理する。
 *
 * @param argsTemplate  Action.mcp.args テンプレート
 * @param fieldValues   フィールド ID → 現在値のマップ
 * @returns             実際の MCP 呼び出し引数
 */
export function resolveActionArgs(
  argsTemplate: Record<string, unknown>,
  fieldValues: Record<string, unknown>
): Record<string, unknown> {
  return resolveValue(argsTemplate, fieldValues) as Record<string, unknown>;
}

function resolveValue(
  template: unknown,
  fieldValues: Record<string, unknown>
): unknown {
  if (typeof template === "string") {
    // "$fieldId" の単純参照
    const match = template.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/);
    if (match) {
      const fieldId = match[1];
      return fieldValues[fieldId] ?? null;
    }
    return template;
  }

  if (Array.isArray(template)) {
    return template.map((item) => resolveValue(item, fieldValues));
  }

  if (typeof template === "object" && template !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template)) {
      result[key] = resolveValue(value, fieldValues);
    }
    return result;
  }

  return template;
}
