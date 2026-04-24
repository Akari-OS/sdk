#!/usr/bin/env node
// 上流 spec リポ（akari-amp / akari-m2c）から schema を取り込む。
// - sibling 配置を前提（../akari-amp, ../akari-m2c）。別配置の場合は環境変数で override。
// - 同期後は schemas/README.md の「上流コミット」表を自動で更新する。

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const schemaRoot = path.join(repoRoot, "schemas");
const readmePath = path.join(schemaRoot, "README.md");

const AMP_REPO = process.env.AMP_REPO_PATH || path.resolve(repoRoot, "..", "akari-amp");
const M2C_REPO = process.env.M2C_REPO_PATH || path.resolve(repoRoot, "..", "akari-m2c");

const plan = [
  { proto: "amp", version: "v0.1", srcRoot: AMP_REPO, files: ["schema.json", "error.schema.json", "mcp-tools.schema.json"] },
  { proto: "m2c", version: "v0.2", srcRoot: M2C_REPO, files: ["schema.json", "capabilities.schema.json", "request.schema.json"] },
];

const TABLE_START = "<!-- upstream-commit-table:start -->";
const TABLE_END = "<!-- upstream-commit-table:end -->";

function gitHead(repoPath) {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: repoPath }).toString().trim();
  } catch {
    return null;
  }
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * schemas/README.md の上流コミット表を置換または新規挿入する。
 * 対象範囲は <!-- upstream-commit-table:start --> … :end --> のマーカー間。
 * マーカーが無ければ README 末尾に追加する。
 */
async function updateReadmeTable(records) {
  const today = isoToday();
  const lines = [];
  lines.push(TABLE_START);
  lines.push("");
  lines.push("| schema | 上流 | 同期日 | 上流コミット |");
  lines.push("|---|---|---|---|");
  for (const r of records) {
    const remoteLabel = `\`Akari-OS/${r.proto === "amp" ? "amp" : "m2c"}\` \`spec/${r.version}/${r.file}\``;
    lines.push(`| ${r.proto}/${r.version}/${r.file} | ${remoteLabel} | ${today} | ${r.head ?? "(unknown)"} |`);
  }
  lines.push("");
  lines.push(TABLE_END);
  const newBlock = lines.join("\n");

  let content;
  try {
    content = await readFile(readmePath, "utf-8");
  } catch {
    content = "# schemas/ — Upstream Protocol Schemas (vendored)\n\n";
  }

  const startIdx = content.indexOf(TABLE_START);
  const endIdx = content.indexOf(TABLE_END);

  let updated;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + TABLE_END.length);
    updated = before + newBlock + after;
  } else {
    // marker 不在: 末尾に "## 各 schema の上流コミット（最終同期）" セクションを追加
    const sep = content.endsWith("\n") ? "" : "\n";
    updated =
      content +
      sep +
      "\n## 各 schema の上流コミット（最終同期）\n\n" +
      "> 本表は `pnpm sync-schemas` が自動更新する。手編集不要。\n\n" +
      newBlock +
      "\n";
  }

  await writeFile(readmePath, updated, "utf-8");
}

async function run() {
  const records = [];
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
      records.push({ proto, version, file: fname, head });
      console.log(`  ${fname}`);
    }
  }

  if (records.length > 0) {
    await updateReadmeTable(records);
    console.log(`[sync-schemas] updated schemas/README.md upstream-commit table (${records.length} entries)`);
  }
  console.log("[sync-schemas] done. Next: `pnpm codegen` to regenerate TS types.");
}

run().catch((err) => {
  console.error("[sync-schemas] FAILED:", err);
  process.exit(1);
});
