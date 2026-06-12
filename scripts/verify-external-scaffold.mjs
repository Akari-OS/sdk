#!/usr/bin/env node
/**
 * verify-external-scaffold.mjs
 *
 * scaffold したアプリが monorepo 外で install → build まで通ることを tarball ベースで検証する。
 * publish 前必須ガード（AKARI-HUB-108 K-3 P0）。
 *
 * 処理フロー:
 *   1. @akari-os/sdk / @akari-os/shell-ui をビルドし、pnpm pack で tarball を /tmp 作業ディレクトリへ生成
 *   2. app-cli をビルド → node dist/cli.js create でアプリを scaffold（外部文脈 → ^0.1.0 deps）
 *   3. package.json の @akari-os/sdk / @akari-os/shell-ui を file:<tarball> に書き換え
 *   4. npm install（キャッシュを作業ディレクトリ内に隔離）→ npm run build
 *   5. dist/index.js の存在を assert + bare specifier チェック（許容 external 集合以外を弾く）
 *   6. 成功時: サマリー表示 + 作業ディレクトリを削除。失敗時: exit 1 + 原因表示
 */

import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// ---------------------------------------------------------------------------
// 許容 external specifier 集合（Shell の import map + shim で解決される）
// ---------------------------------------------------------------------------
const ALLOWED_EXTERNAL_PREFIXES = [
  "react",
  "react/",
  "react-dom",
  "react-dom/",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "@akari-os/sdk",
  "@akari-os/sdk/",
  "@akari-os/shell-ui",
  "@akari-os/shell-ui/",
  "@tauri-apps/api/core",
  "@tauri-apps/api/event",
];

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/**
 * コマンドを実行し、失敗時は原因表示して exit 1 する。
 * @param {string} cmd
 * @param {import("node:child_process").ExecSyncOptions} opts
 */
function run(cmd, opts = {}) {
  console.log(`\n$ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", ...opts });
  } catch (e) {
    console.error(`\n[verify-external-scaffold] コマンド失敗: ${cmd}`);
    process.exit(1);
  }
}

/**
 * spawnSync ラッパー: stdout/stderr を文字列で返す（エラー時は null）。
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} opts
 * @returns {{ stdout: string; stderr: string } | null}
 */
function runCapture(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (res.status !== 0) return null;
  return { stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/**
 * pnpm pack して tarball を destDir にコピーし、コピー先パスを返す。
 * @param {string} pkgDir  — パッケージのルート（絶対パス）
 * @param {string} destDir — tarball のコピー先（絶対パス）
 * @returns {string}       — コピー後の tarball 絶対パス
 */
function packPackage(pkgDir, destDir) {
  // pnpm pack は stdout に tarball 名を出力する
  const res = runCapture("pnpm", ["pack", "--pack-destination", destDir], { cwd: pkgDir });
  if (!res) {
    console.error(`[verify-external-scaffold] pnpm pack 失敗: ${pkgDir}`);
    process.exit(1);
  }
  // 出力の最後の行がファイルパス
  const lines = res.stdout.trim().split("\n").filter(Boolean);
  const tarballPath = lines[lines.length - 1].trim();
  if (!fs.existsSync(tarballPath)) {
    console.error(`[verify-external-scaffold] tarball が見つからない: ${tarballPath}`);
    process.exit(1);
  }
  return tarballPath;
}

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const SDK_TYPES_DIR = path.join(REPO_ROOT, "packages", "sdk-types");
const SHELL_UI_DIR = path.join(REPO_ROOT, "packages", "shell-ui");
const APP_CLI_DIR = path.join(REPO_ROOT, "packages", "app-cli");

// 作業ディレクトリ（/tmp 以下）
const WORK_DIR = path.join(os.tmpdir(), `akari-verify-external-${Date.now()}`);
fs.mkdirSync(WORK_DIR, { recursive: true });

console.log("=".repeat(60));
console.log("[verify-external-scaffold] 開始");
console.log(`  作業ディレクトリ: ${WORK_DIR}`);
console.log(`  リポジトリルート: ${REPO_ROOT}`);
console.log("=".repeat(60));

try {
  // -----------------------------------------------------------------------
  // Step 1: ビルド + tarball 生成
  // -----------------------------------------------------------------------
  console.log("\n[Step 1] @akari-os/sdk と @akari-os/shell-ui をビルドして tarball を生成...");

  // sdk-types をビルド
  run("pnpm run build", { cwd: SDK_TYPES_DIR });

  // shell-ui をビルド
  run("pnpm run build", { cwd: SHELL_UI_DIR });

  // tarball を生成
  console.log("\n  tarball を生成中...");
  const sdkTarball = packPackage(SDK_TYPES_DIR, WORK_DIR);
  const shellUiTarball = packPackage(SHELL_UI_DIR, WORK_DIR);

  console.log(`  @akari-os/sdk tarball: ${sdkTarball}`);
  console.log(`  @akari-os/shell-ui tarball: ${shellUiTarball}`);

  // -----------------------------------------------------------------------
  // Step 2: app-cli ビルド → scaffold
  // -----------------------------------------------------------------------
  console.log("\n[Step 2] app-cli をビルドして、アプリを scaffold...");

  // app-cli をビルド（dist/cli.js を生成）
  run("pnpm run build", { cwd: APP_CLI_DIR });

  const cliPath = path.join(APP_CLI_DIR, "dist", "cli.js");
  if (!fs.existsSync(cliPath)) {
    console.error(`[verify-external-scaffold] cli.js が見つからない: ${cliPath}`);
    process.exit(1);
  }

  // 作業ディレクトリ内で scaffold（WORK_DIR は monorepo 外のため ^0.1.0 deps になる）
  const APP_NAME = "verify-app";
  run(
    `node "${cliPath}" create ${APP_NAME} --tier full --author ci --category research`,
    { cwd: WORK_DIR }
  );

  const APP_DIR = path.join(WORK_DIR, APP_NAME);
  if (!fs.existsSync(APP_DIR)) {
    console.error(`[verify-external-scaffold] scaffold 先が見つからない: ${APP_DIR}`);
    process.exit(1);
  }

  // -----------------------------------------------------------------------
  // Step 3: package.json の依存を file:<tarball> に書き換え
  // -----------------------------------------------------------------------
  console.log("\n[Step 3] package.json の @akari-os/* を file:<tarball> に書き換え...");

  const pkgJsonPath = path.join(APP_DIR, "package.json");
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));

  // file: パスは相対でも絶対でも ok（npm が解決できる絶対パスを使う）
  if (!pkgJson.dependencies) {
    console.error("[verify-external-scaffold] package.json に dependencies が見つからない");
    process.exit(1);
  }

  pkgJson.dependencies["@akari-os/sdk"] = `file:${sdkTarball}`;
  pkgJson.dependencies["@akari-os/shell-ui"] = `file:${shellUiTarball}`;

  // postbuild で sync-install.mjs を呼ぼうとするが CI では不要なので削除
  if (pkgJson.scripts && pkgJson.scripts.postbuild) {
    delete pkgJson.scripts.postbuild;
  }

  fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2), "utf8");
  console.log(`  @akari-os/sdk  → file:${sdkTarball}`);
  console.log(`  @akari-os/shell-ui → file:${shellUiTarball}`);

  // -----------------------------------------------------------------------
  // Step 4: npm install + npm run build
  // -----------------------------------------------------------------------
  console.log("\n[Step 4] npm install...");

  // npm キャッシュを作業ディレクトリ内に隔離（グローバルキャッシュを汚染しない）
  const npmCacheDir = path.join(WORK_DIR, ".npm-cache");
  fs.mkdirSync(npmCacheDir, { recursive: true });

  run(`npm install --cache "${npmCacheDir}" --prefer-offline --legacy-peer-deps`, { cwd: APP_DIR });

  console.log("\n[Step 4] npm run build...");
  run("npm run build", { cwd: APP_DIR });

  // -----------------------------------------------------------------------
  // Step 5: dist/index.js を検証
  // -----------------------------------------------------------------------
  console.log("\n[Step 5] dist/index.js を検証...");

  const distIndexPath = path.join(APP_DIR, "dist", "index.js");
  if (!fs.existsSync(distIndexPath)) {
    console.error(`[verify-external-scaffold] dist/index.js が生成されていない: ${distIndexPath}`);
    process.exit(1);
  }

  const distContent = fs.readFileSync(distIndexPath, "utf8");

  // import specifier を抽出する
  // ESM static import: import ... from "specifier"
  // ESM dynamic import: import("specifier") または await import("specifier")
  const importRegex = /(?:^|\s)import\s+(?:[^"']*\s+from\s+)?["']([^"']+)["']/gm;
  const dynamicImportRegex = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  const requireRegex = /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

  const specifiers = new Set();
  for (const regex of [importRegex, dynamicImportRegex, requireRegex]) {
    let m;
    while ((m = regex.exec(distContent)) !== null) {
      const spec = m[1];
      // bare specifier = node_modules 参照（相対パス・絶対パス・data: は除外）
      if (!spec.startsWith(".") && !spec.startsWith("/") && !spec.startsWith("data:")) {
        specifiers.add(spec);
      }
    }
  }

  console.log(`  検出した bare specifier: ${[...specifiers].join(", ") || "(なし)"}`);

  const unexpected = [...specifiers].filter(
    (spec) => !ALLOWED_EXTERNAL_PREFIXES.some((prefix) => spec === prefix || spec.startsWith(prefix))
  );

  if (unexpected.length > 0) {
    console.error("\n[verify-external-scaffold] ❌ 許容されていない bare specifier が dist/index.js に含まれています:");
    for (const s of unexpected) {
      console.error(`  - ${s}`);
    }
    console.error("\n  Shell の import map / shim に登録されていないモジュールが bundle 漏れしています。");
    console.error("  vite.config.ts の external 設定、または ALLOWED_EXTERNAL_PREFIXES を確認してください。");
    process.exit(1);
  }

  // -----------------------------------------------------------------------
  // 成功 → クリーンアップ
  // -----------------------------------------------------------------------
  console.log("\n" + "=".repeat(60));
  console.log("[verify-external-scaffold] ✅ 全ステップ パス");
  console.log(`  scaffold アプリ : ${APP_DIR}`);
  console.log(`  dist/index.js   : ${distIndexPath} (${(distContent.length / 1024).toFixed(1)} KB)`);
  console.log(`  bare specifier  : ${[...specifiers].join(", ") || "(なし)"}`);
  console.log("=".repeat(60));

  // 作業ディレクトリを削除
  console.log("\n  作業ディレクトリを削除中...");
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  console.log("  完了。\n");
} catch (err) {
  console.error("\n[verify-external-scaffold] 予期しないエラーが発生しました:");
  console.error(err);
  console.error(`\n  作業ディレクトリを残します: ${WORK_DIR}`);
  process.exit(1);
}
