import { defineConfig } from "tsup";

/**
 * MCP server bundle config.
 *
 * Rationale:
 * shell は `~/.akari/apps/<id>/dist/mcp-server/index.js` を直接 `node <path>` で
 * spawn する。install 時は `node_modules` が配布されない（pnpm symlink 経由で
 * 553MB+ になるため現実的ではない）ので、tsup 側で runtime 依存を全て bundle
 * に内包する必要がある。
 *
 * noExternal に列挙した package は bundle に取り込まれ、subprocess は
 * node stdlib 以外の外部依存を一切必要としない状態になる。
 */
export default defineConfig({
  entry: ["mcp-server/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist/mcp-server",
  clean: true,
  // runtime 依存を全て bundle に内包（node_modules 非配布でも subprocess が動く）
  noExternal: [/^@modelcontextprotocol\//, /^@tavily\//, "zod"],
  // ESM bundle 内で CommonJS ライブラリが `require("util")` 等を呼ぶケースに対応。
  // tavily-core とその依存（form-data / node-fetch 系）の一部が dynamic require を
  // 使うため、`createRequire` を top-level に注入して require を解決可能にする。
  banner: {
    js: [
      `import { createRequire as __akariCreateRequire } from "module";`,
      `const require = __akariCreateRequire(import.meta.url);`,
    ].join("\n"),
  },
});
