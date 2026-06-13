import { defineConfig } from "tsup";

/**
 * MCP server bundle config.
 *
 * Unlike the web-search example, Playwright CANNOT be bundled into a single
 * standalone ESM file — it spawns native browser binaries and resolves browser
 * paths from its own package layout. So `playwright` (and its `-core`) stay
 * EXTERNAL and are resolved at runtime from node_modules.
 *
 * Consequence: this app is distributed WITH node_modules (or installed in
 * place), and the host must run `npx playwright install chromium` once. The MCP
 * SDK and zod are still bundled so only Playwright remains as an external dep.
 */
export default defineConfig({
  entry: ["mcp-server/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist/mcp-server",
  clean: true,
  noExternal: [/^@modelcontextprotocol\//, "zod"],
  external: ["playwright", "playwright-core"],
  banner: {
    js: [
      `import { createRequire as __akariCreateRequire } from "module";`,
      `const require = __akariCreateRequire(import.meta.url);`,
    ].join("\n"),
  },
});
