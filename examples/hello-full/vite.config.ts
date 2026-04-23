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
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "process.env": "{}",
  },
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
        assetFileNames: (asset) => {
          if (asset.name && asset.name.endsWith(".css")) return "index.css"
          return "assets/[name]-[hash][extname]"
        },
      },
    },
    sourcemap: false,
  },
})
