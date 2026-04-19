/**
 * dev.ts — `akari dev` command (AKARI-HUB-024 §6.9)
 *
 * Local development server: starts the MCP server for the module in the current
 * directory and launches a Panel Schema previewer so developers can iterate
 * without deploying to a live AKARI Shell.
 *
 * Current state: STUB
 * This file provides the command registration and a clear TODO map for
 * Phase 2b / Phase 3 implementation.
 *
 * TODO (Phase 2b — MCP server hot reload):
 *   - Read [mcp] server path from akari.toml
 *   - Spawn the MCP server process (node / cargo run / etc.)
 *   - Watch for file changes and restart on save (chokidar or Vite's HMR)
 *   - Forward MCP stdio to a local TCP bridge for inspection
 *
 * TODO (Phase 2b — Panel Schema previewer):
 *   - Start a lightweight Express / Fastify server on localhost
 *   - Serve a minimal Shell-like HTML page with the Schema renderer React component
 *   - Watch panel.schema.json for changes and live-reload the preview
 *   - For Full Tier modules, optionally serve the React Panel bundle (Vite dev server)
 *
 * TODO (Phase 3 — Shell mount):
 *   - akari dev should be able to hot-mount the module into a running local Shell
 *     instance via the Shell development overlay (Shell Panel Framework (internal spec))
 *
 * Spec reference: AKARI-HUB-024 §6.9 Toolchain
 */

import { Command } from "commander";
import path from "path";

// ---------------------------------------------------------------------------
// Dev server runner (stub)
// ---------------------------------------------------------------------------

export async function runDev(moduleDir: string, port: number): Promise<void> {
  const absDir = path.resolve(moduleDir);

  // TODO (Phase 2b): Replace the stub block below with real implementation.
  // The steps below are the intended execution order.

  console.log(`\nAKARI Dev Server — stub mode`);
  console.log(`Module dir : ${absDir}`);
  console.log(`Port       : ${port}`);
  console.log("");

  // ── Step 1: Read manifest ───────────────────────────────────────────────
  // TODO (Phase 2b): Call loadAndValidateManifest(absDir) from validators/manifest.ts.
  //   - If manifest is invalid, print errors and abort.
  //   - Extract tier, [mcp] server path, [panels] schema paths.
  console.log("[stub] Would read and validate akari.toml from:", absDir);

  // ── Step 2: Start MCP server ────────────────────────────────────────────
  // TODO (Phase 2b):
  //   For mcp-declarative tier:
  //     const mcpServerPath = manifest.mcp?.server
  //     const mcpProc = spawn("node", [mcpServerPath], { cwd: absDir, stdio: "pipe" })
  //     Pipe mcpProc.stdout / stderr to console with prefix "[mcp]"
  //   For full tier:
  //     Optionally support bundled MCP server if present.
  console.log("[stub] Would launch MCP + Panel previewer.");

  // ── Step 3: Panel Schema previewer ─────────────────────────────────────
  // TODO (Phase 2b):
  //   - Bundle / serve a minimal React app that imports <SchemaPanel> from @akari/sdk/react
  //   - Mount each panel listed in manifest.panels with its schema
  //   - Watch panel.schema.json with chokidar, send ws message to trigger hot reload
  //
  //   Rough server setup:
  //     import Fastify from "fastify"
  //     import staticPlugin from "@fastify/static"
  //     const app = Fastify()
  //     app.register(staticPlugin, { root: path.join(__dirname, "../../previewer/dist") })
  //     app.get("/schema/:panelId", (req) => { return fs.readFile(panelSchemaPath) })
  //     app.listen({ port })
  console.log(`[stub] Dev server would run at http://localhost:${port}`);

  // ── Step 4: File watcher ────────────────────────────────────────────────
  // TODO (Phase 2b):
  //   - Watch akari.toml for manifest changes (restart MCP server on [mcp] changes)
  //   - Watch panels/**/*.schema.json for schema changes (hot reload previewer)
  //   - Watch agents/*.md for agent spec changes (informational message only)
  console.log("[stub] Would watch akari.toml and panel.schema.json for changes.");

  // ── Step 5: Graceful shutdown ────────────────────────────────────────────
  // TODO (Phase 2b):
  //   - Register SIGINT / SIGTERM handlers
  //   - Kill MCP server child process
  //   - Close Fastify server

  console.log("\n[stub] Dev server stub. Would launch MCP + Panel previewer.");
  console.log("  → Full implementation coming in Phase 2b.");
  console.log("  → See src/commands/dev.ts for the TODO map.\n");

  // Do not keep the process alive in stub mode.
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Commander registration
// ---------------------------------------------------------------------------

/**
 * Register the `dev` command.
 * Called from cli.ts.
 *
 * Usage: akari dev [--dir <path>] [--port <n>]
 */
export function registerDevCommand(program: Command): void {
  program
    .command("dev")
    .description(
      "Start the local development server: MCP server + Panel Schema previewer (AKARI-HUB-024 §6.9) [stub]"
    )
    .option("-d, --dir <path>", "Module root directory (default: current working directory)", ".")
    .option("-p, --port <number>", "Port for the Panel previewer server", "3737")
    .action(async (options: { dir: string; port: string }) => {
      await runDev(options.dir, parseInt(options.port, 10));
    });
}
