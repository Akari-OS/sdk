#!/usr/bin/env node
/**
 * akari-app-cli — AKARI OS App SDK CLI (AKARI-HUB-024 §6.9)
 *
 * Entry point. Delegates to sub-commands:
 *   create   — scaffold a new app (Full or MCP-Declarative tier)
 *   dev      — local development server with hot reload (Phase 2b)
 *   app      — certification and publishing sub-commands
 *   video    — akari-video MCP sidecar を叩く汎用コマンド群
 */

import { Command } from "commander";
import { registerCreateCommand } from "./commands/create.js";
import { registerDevCommand } from "./commands/dev.js";
import { registerCertifyCommand } from "./commands/certify.js";
import {
  registerVideoCommand,
  registerDynamicVideoSubcommands,
} from "./commands/video.js";

const program = new Command();

program
  .name("akari-app-cli")
  .description(
    "AKARI OS App CLI — create, develop, and certify AKARI apps (spec AKARI-HUB-024)"
  )
  .version("0.1.0");

// akari-app-cli create <name> --tier <full|mcp-declarative>
// Also reachable as: akari create <name>
registerCreateCommand(program);

// akari dev
registerDevCommand(program);

// akari app <subcommand>
const appCmd = program
  .command("app")
  .description("App lifecycle commands (certify, publish, add)");

// akari app certify — implemented in src/commands/certify.ts (Phase 2b)
registerCertifyCommand(appCmd);

// akari app publish — placeholder
appCmd
  .command("publish")
  .description("Publish app to the AKARI Marketplace (requires certify to pass)")
  .action(() => {
    // eslint-disable-next-line no-console
    console.error("akari app publish is not yet implemented.");
    process.exit(1);
  });

// akari app add <appId> — placeholder
appCmd
  .command("add <appId>")
  .description("Install an app from the AKARI Marketplace or npm")
  .action(() => {
    // eslint-disable-next-line no-console
    console.error("akari app add is not yet implemented.");
    process.exit(1);
  });

// akari video — MCP sidecar 汎用コマンド群
// process.argv[2] === 'video' のときのみ動的サブコマンドを事前登録する
const videoCmd = registerVideoCommand(program);

(async () => {
  if (process.argv[2] === "video") {
    // sidecar からツール一覧を取得して動的サブコマンドを登録する
    // 失敗時は内部でエラーメッセージを表示してスキップ (汎用 tools/call は引き続き使用可能)
    const endpoint =
      process.argv.includes("--endpoint")
        ? process.argv[process.argv.indexOf("--endpoint") + 1]
        : "http://127.0.0.1:47616/mcp";
    await registerDynamicVideoSubcommands(videoCmd, endpoint);
  }

  program.parse(process.argv);
})();
