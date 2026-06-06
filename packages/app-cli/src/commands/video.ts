/**
 * video.ts — `akari video` コマンド群 (akari-video MCP sidecar 連携)
 *
 * akari-video アプリの MCP sidecar (Streamable HTTP / http://127.0.0.1:47616/mcp) を叩く
 * 汎用 CLI コマンドを提供する。
 *
 * tools/list を毎回フェッチして動的サブコマンドを生成するため、
 * sidecar が持つツールと CLI が常に同期する (drift なし)。
 *
 * 提供コマンド:
 *   akari video tools                            — ツール一覧を表示
 *   akari video call <tool> [--json <str>] [-f key=value ...]  — 汎用ツール呼び出し
 *   akari video <suffix> [--<prop> <val> ...]    — 動的登録サブコマンド
 */

import { Command } from "commander";
import os from "os";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** MCP ツール定義 */
interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };
}

/** MCP tools/list レスポンス */
interface McpToolsListResult {
  tools: McpTool[];
}

/** MCP tools/call コンテンツ要素 */
interface McpContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

/** MCP tools/call レスポンス */
interface McpCallResult {
  content?: McpContent[];
  isError?: boolean;
}

// ---------------------------------------------------------------------------
// MCP クライアント (fetch ベース raw JSON-RPC 2.0)
// ---------------------------------------------------------------------------

/**
 * MCP sidecar へ JSON-RPC 2.0 リクエストを送信する。
 * @modelcontextprotocol/sdk の StreamableHTTPClientTransport は stateful session を前提とするため、
 * stateless sidecar に対しては raw fetch の方がシンプルかつ確実。
 */
async function mcpRequest(
  endpoint: string,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`MCP sidecar returned HTTP ${res.status}: ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type") ?? "";

  // Streamable HTTP はレスポンスを SSE ストリームで返す場合がある
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    // SSE の data: 行を抽出して最初の有効な JSON を返す
    for (const line of text.split("\n")) {
      if (line.startsWith("data: ")) {
        const json = line.slice(6).trim();
        if (json) {
          const parsed = JSON.parse(json);
          if (parsed.result !== undefined) return parsed.result;
          if (parsed.error) throw new Error(`MCP error: ${JSON.stringify(parsed.error)}`);
        }
      }
    }
    throw new Error("MCP sidecar returned empty SSE stream");
  }

  const parsed = await res.json() as { result?: unknown; error?: unknown };
  if (parsed.error) throw new Error(`MCP error: ${JSON.stringify(parsed.error)}`);
  return parsed.result;
}

/** tools/list を取得する */
async function fetchTools(endpoint: string): Promise<McpTool[]> {
  const result = (await mcpRequest(endpoint, "tools/list", {})) as McpToolsListResult;
  return result.tools ?? [];
}

/** tools/call を実行する */
async function callTool(
  endpoint: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<McpCallResult> {
  return (await mcpRequest(endpoint, "tools/call", {
    name: toolName,
    arguments: args,
  })) as McpCallResult;
}

// ---------------------------------------------------------------------------
// 結果表示
// ---------------------------------------------------------------------------

/** tools/call の結果を表示する。image があれば tmp に保存してパスを表示 */
function printCallResult(result: McpCallResult): void {
  if (!result.content || result.content.length === 0) {
    console.log("(レスポンスなし)");
    return;
  }

  for (const item of result.content) {
    if (item.type === "text") {
      console.log(item.text ?? "");
    } else if (item.type === "image" && item.data) {
      // base64 画像を一時ファイルへ保存
      const ext = item.mimeType?.split("/")[1] ?? "png";
      const tmpPath = path.join(os.tmpdir(), `akari-video-${Date.now()}.${ext}`);
      const buf = Buffer.from(item.data, "base64");
      fs.writeFileSync(tmpPath, buf);
      console.log(`[image] 一時ファイルへ保存: ${tmpPath}`);
    } else {
      console.log(JSON.stringify(item, null, 2));
    }
  }
}

// ---------------------------------------------------------------------------
// -f key=value パーサー
// ---------------------------------------------------------------------------

function parseFieldArgs(fields: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const f of fields) {
    const idx = f.indexOf("=");
    if (idx === -1) {
      console.warn(`警告: -f の値 '${f}' は key=value 形式ではありません。スキップします。`);
      continue;
    }
    result[f.slice(0, idx)] = f.slice(idx + 1);
  }
  return result;
}

// ---------------------------------------------------------------------------
// 動的サブコマンド登録
// ---------------------------------------------------------------------------

/**
 * JSON Schema のプロパティ型から commander の option 型ヒントを返す。
 */
function schemaTypeToOptionHint(type?: string): string {
  switch (type) {
    case "number":
    case "integer":
      return "<number>";
    case "boolean":
      return "";        // --flag (フラグ型)
    case "array":
      return "<items>"; // カンマ区切り文字列として受け取る
    default:
      return "<string>";
  }
}

/**
 * 動的サブコマンドを commander に登録する。
 * sidecar が未起動の場合は例外をキャッチして親切なエラーを表示し、登録をスキップする。
 */
export async function registerDynamicVideoSubcommands(
  videoCmd: Command,
  endpoint: string
): Promise<void> {
  let tools: McpTool[];
  try {
    tools = await fetchTools(endpoint);
  } catch {
    console.error(
      "ℹ️  akari-video MCP sidecar (:47616) に接続できませんでした。\n" +
        "   akari-video アプリを shell で開いて sidecar(:47616) を起動してください。\n" +
        "   接続後は 'akari video tools' でツール一覧を確認できます。"
    );
    return;
  }

  for (const tool of tools) {
    // suffix = ツール名から先頭 'video_' を除去 (例: video_render → render)
    const suffix = tool.name.startsWith("video_") ? tool.name.slice(6) : tool.name;
    const props = tool.inputSchema?.properties ?? {};

    const sub = videoCmd
      .command(suffix)
      .description(
        (tool.title ? `[${tool.title}] ` : "") +
          (tool.description?.split("\n")[0] ?? "")
      );

    // JSON Schema のプロパティを --flag にマップ
    for (const [propName, propDef] of Object.entries(props)) {
      const hint = schemaTypeToOptionHint(propDef.type);
      const desc = propDef.description ?? propName;
      if (hint === "") {
        // boolean: --flag (フラグ)
        sub.option(`--${propName}`, desc);
      } else {
        sub.option(`--${propName} ${hint}`, desc);
      }
    }

    sub.action(async (options: Record<string, unknown>) => {
      // boolean フラグが undefined の場合は args から除外
      const args: Record<string, unknown> = {};
      for (const key of Object.keys(props)) {
        if (options[key] !== undefined) {
          const propType = props[key].type;
          if (propType === "number" || propType === "integer") {
            args[key] = Number(options[key]);
          } else if (propType === "array" && typeof options[key] === "string") {
            args[key] = (options[key] as string).split(",");
          } else {
            args[key] = options[key];
          }
        }
      }
      try {
        const result = await callTool(endpoint, tool.name, args);
        printCallResult(result);
      } catch (err) {
        console.error("エラー:", (err as Error).message);
        process.exit(1);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Commander 登録
// ---------------------------------------------------------------------------

/**
 * `video` コマンドを登録する。
 * 動的サブコマンドは非同期で登録するため、呼び出し側は
 * program.parseAsync() を使うか、事前に await する必要がある。
 * cli.ts 側では process.argv[2] === 'video' を検出した場合のみ
 * 動的登録を実行する。
 */
export function registerVideoCommand(program: Command): Command {
  const videoCmd = program
    .command("video")
    .description(
      "akari-video MCP sidecar を叩く汎用コマンド群。" +
        "sidecar が起動している場合は動的サブコマンドも利用可能。"
    )
    .option(
      "--endpoint <url>",
      "MCP sidecar エンドポイント URL",
      "http://127.0.0.1:47616/mcp"
    );

  // tools — ツール一覧表示
  videoCmd
    .command("tools")
    .description("akari-video sidecar が提供するツール一覧を表示する")
    .action(async () => {
      const endpoint = (videoCmd.opts() as { endpoint: string }).endpoint;
      try {
        const tools = await fetchTools(endpoint);
        if (tools.length === 0) {
          console.log("ツールが見つかりませんでした。");
          return;
        }
        console.log(`\nakari-video MCP ツール一覧 (${tools.length} 件)\n`);
        for (const t of tools) {
          const title = t.title ? ` (${t.title})` : "";
          const desc = t.description?.split("\n")[0] ?? "";
          console.log(`  ${t.name}${title}`);
          if (desc) console.log(`    ${desc}`);
        }
        console.log("");
      } catch (err) {
        console.error(
          "akari-video sidecar に接続できませんでした:\n  " + (err as Error).message
        );
        console.error(
          "\nakari-video アプリを shell で開いて sidecar(:47616) を起動してください。"
        );
        process.exit(1);
      }
    });

  // call — 汎用ツール呼び出し
  videoCmd
    .command("call <tool>")
    .description(
      "指定したツールを呼び出す汎用コマンド。" +
        "--json で引数 JSON を直接渡すか、-f key=value で個別指定する。"
    )
    .option("--json <jsonString>", "ツール引数を JSON 文字列で指定 (優先)")
    .option("-f, --field <key=value...>", "ツール引数を key=value 形式で指定 (複数可)")
    .action(
      async (tool: string, options: { json?: string; field?: string[] }) => {
        const endpoint = (videoCmd.opts() as { endpoint: string }).endpoint;
        let args: Record<string, unknown> = {};

        if (options.json) {
          try {
            args = JSON.parse(options.json) as Record<string, unknown>;
          } catch {
            console.error("--json の値が不正な JSON です:", options.json);
            process.exit(1);
          }
        } else if (options.field && options.field.length > 0) {
          args = parseFieldArgs(options.field);
        }

        try {
          const result = await callTool(endpoint, tool, args);
          printCallResult(result);
        } catch (err) {
          console.error("エラー:", (err as Error).message);
          console.error(
            "\nakari-video アプリを shell で開いて sidecar(:47616) を起動してください。"
          );
          process.exit(1);
        }
      }
    );

  return videoCmd;
}
