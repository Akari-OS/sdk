/**
 * Writer App — pre-built ESM bundle pipeline.
 *
 * vite lib mode で `src/index.tsx` を ES モジュール 1 本に bundle する。
 * 以下は shell 側が提供するため external 化：
 *   - react / react-dom（shell bundle の React を共有、window 経由）
 *   - @akari-os/sdk / @akari-os/shell-ui（shell workspace で解決）
 *   - @tauri-apps/api（shell の Tauri webview で共有）
 *
 * 出力: apps/writer/dist/index.js（ESM）
 * 消費先: shell が convertFileSrc で動的 import → AppHost に mount。
 */
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"

const externalPrefixes = [
  "react",
  "react-dom",
  "@akari-os/sdk",
  "@akari-os/shell-ui",
  "@tauri-apps/api",
]

function isExternal(id: string): boolean {
  return externalPrefixes.some((p) => id === p || id.startsWith(`${p}/`))
}

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
    cssCodeSplit: false,
    lib: {
      entry: path.resolve(__dirname, "src/index.tsx"),
      formats: ["es"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: isExternal,
      output: {
        inlineDynamicImports: true,
        assetFileNames: (asset) => {
          if (asset.name && asset.name.endsWith(".css")) return "index.css"
          return "assets/[name]-[hash][extname]"
        },
      },
    },
    sourcemap: true,
  },
})
