#!/usr/bin/env node
// compatibility.schema.json を sdk-types パッケージ内へコピーする（publish 用）。
//
// SSOT はリポ直下 schemas/compatibility.schema.json（ADR-093 / HUB-033 T1.1）。
// package.json の files に `../../schemas/...` を書くと npm pack が `..` パスを
// 警告付きでスキップし、公開物から schema が欠落するため、prepublishOnly で
// パッケージ内 schemas/ へコピーしてから pack する。コピーは git 管理しない
// （.gitignore 済み。drift 防止のため毎 publish 時に SSOT から再生成）。

import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const src = path.join(repoRoot, "schemas", "compatibility.schema.json");
const destDir = path.join(repoRoot, "packages", "sdk-types", "schemas");
const dest = path.join(destDir, "compatibility.schema.json");

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
console.log(`[copy-compat-schema] ${path.relative(repoRoot, src)} → ${path.relative(repoRoot, dest)}`);
