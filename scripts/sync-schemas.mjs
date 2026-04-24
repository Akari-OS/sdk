#!/usr/bin/env node
// 上流 spec リポ（akari-amp / akari-m2c）から schema を取り込む。
// - sibling 配置を前提（../akari-amp, ../akari-m2c）。別配置の場合は環境変数で override。
// - 同期後は schemas/README.md の「上流コミット」表を手で更新すること（自動化は Phase 3）。

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const schemaRoot = path.join(repoRoot, "schemas");

const AMP_REPO = process.env.AMP_REPO_PATH || path.resolve(repoRoot, "..", "akari-amp");
const M2C_REPO = process.env.M2C_REPO_PATH || path.resolve(repoRoot, "..", "akari-m2c");

const plan = [
  { proto: "amp", version: "v0.1", srcRoot: AMP_REPO, files: ["schema.json", "error.schema.json", "mcp-tools.schema.json"] },
  { proto: "m2c", version: "v0.2", srcRoot: M2C_REPO, files: ["schema.json", "capabilities.schema.json", "request.schema.json"] },
];

function gitHead(repoPath) {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: repoPath }).toString().trim();
  } catch {
    return null;
  }
}

async function run() {
  for (const { proto, version, srcRoot, files } of plan) {
    if (!existsSync(srcRoot)) {
      console.warn(`[sync-schemas] SKIP ${proto} — repo not found at ${srcRoot}`);
      console.warn(`  Set ${proto.toUpperCase()}_REPO_PATH to override.`);
      continue;
    }
    const head = gitHead(srcRoot);
    console.log(`[sync-schemas] ${proto} ${version} from ${srcRoot} @ ${head ?? "unknown"}`);
    const destDir = path.join(schemaRoot, proto, version);
    await mkdir(destDir, { recursive: true });
    for (const fname of files) {
      const src = path.join(srcRoot, "spec", version, fname);
      if (!existsSync(src)) {
        console.warn(`  MISSING: ${src}`);
        continue;
      }
      await copyFile(src, path.join(destDir, fname));
      console.log(`  ${fname}`);
    }
  }
  console.log("[sync-schemas] done. Next: update schemas/README.md upstream-commit table, then `pnpm codegen`.");
}

run().catch((err) => {
  console.error("[sync-schemas] FAILED:", err);
  process.exit(1);
});
