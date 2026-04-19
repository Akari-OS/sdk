#!/usr/bin/env node
/**
 * akari-module-cli — AKARI OS Module SDK CLI (AKARI-HUB-024 §6.9)
 *
 * Entry point. Delegates to sub-commands:
 *   create   — scaffold a new module (Full or MCP-Declarative tier)
 *   dev      — local development server with hot reload (Phase 2b)
 *   module   — certification and publishing sub-commands
 */

import { Command } from "commander";
import { registerCreateCommand } from "./commands/create.js";
import { registerDevCommand } from "./commands/dev.js";
import { registerCertifyCommand } from "./commands/certify.js";

const program = new Command();

program
  .name("akari-module-cli")
  .description(
    "AKARI OS Module CLI — create, develop, and certify AKARI modules (spec AKARI-HUB-024)"
  )
  .version("0.1.0");

// akari-module-cli create <name> --tier <full|mcp-declarative>
// Also reachable as: akari create <name>
registerCreateCommand(program);

// akari dev
registerDevCommand(program);

// akari module <subcommand>
const moduleCmd = program
  .command("module")
  .description("Module lifecycle commands (certify, publish, add)");

// akari module certify — implemented in src/commands/certify.ts (Phase 2b)
registerCertifyCommand(moduleCmd);

// akari module publish — placeholder
moduleCmd
  .command("publish")
  .description("Publish module to the AKARI Marketplace (requires certify to pass)")
  .action(() => {
    // eslint-disable-next-line no-console
    console.error("akari module publish is not yet implemented.");
    process.exit(1);
  });

// akari module add <module-id> — placeholder
moduleCmd
  .command("add <moduleId>")
  .description("Install a module from the AKARI Marketplace or npm")
  .action(() => {
    // eslint-disable-next-line no-console
    console.error("akari module add is not yet implemented.");
    process.exit(1);
  });

program.parse(process.argv);
