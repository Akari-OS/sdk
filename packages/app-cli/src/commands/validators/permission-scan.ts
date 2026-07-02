/**
 * permission-scan.ts — Permission Suite（HUB-024 §6.6.6）の実装
 *
 * 2026-06-12 クリーンルーム監査（certify.ts が STUB を PASS 扱いする問題）を受け、
 * Contract Test 7 スイート中「Permission API」を最初の STUB→実テスト化とする（P1-6）。
 *
 * 2 段構えで検証する:
 *   1. 形状検証 — akari.toml [permissions] を sdk-types/src/manifest.ts の
 *      PermissionsSection と突き合わせ、既知キー・値の型を検証する。
 *      （cross-package import はビルド依存を増やすため avoid し、型の "shape" だけを
 *        ここにミラーする。ズレたら sdk-types 側も見て手動で追従すること）
 *   2. 静的スキャン — アプリの src/（Full Tier）または mcp-server/（MCP-Declarative）
 *      配下を grep ベースで走査し、SDK の権限必要 API 使用箇所を検出する。
 *      宣言なしで使用していれば FAIL、宣言のみで使用が検出できなければ WARN。
 *
 * ヒューリスティクスの限界（正直に明記する — 誤って過信しないこと）:
 *   - 動的 import() / 文字列結合で組み立てたモジュール指定子は検知できない
 *   - `import * as pool from "@akari-os/sdk/pool"` のような namespace import 経由の
 *     呼び出しは非対応（named import のみ対応。理由: 実アプリ（examples/akari-lens）が
 *     named import のみを使っているため、まずそちらを正確に検出することを優先した）
 *   - dist/ が minify されている場合、関数名が短縮され検出できない
 *   - fetch() のドメイン抽出は文字列/テンプレートリテラルの直書きのみ対応。
 *     `fetch(new URL(...).href)` のような間接呼び出しは「fetch 使用あり」までは
 *     検出できるが、ドメイン単位の宣言突合はできない（WARN に留める）
 *   - keychain / process 等、sdk-types の PermissionsSection にまだ定義されていない
 *     パーミッションキーはスキャン対象外（未知キーとして WARN するのみ）
 *   - amp.record() / amp.query() は sdk-types にランタイム関数が存在しないため
 *     （型定義のみ）、正規表現ベースの命名パターン一致で代用している
 *
 * Reference: AKARI-HUB-024 §6.6.6 Permission API / §6.8 Certification
 */

import { promises as fsp } from "fs";
import path from "path";
import type { Dirent } from "fs";

import type { AppManifest } from "./manifest.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * contract-test.ts の ContractCase と構造的に同一の形（circular import を避けるため
 * 型を re-declare している。フィールドがズレたら contract-test.ts 側も直すこと）。
 */
export interface PermissionCaseResult {
  name: string;
  status: "PASS" | "FAIL" | "WARN" | "SKIP";
  message?: string;
}

// ---------------------------------------------------------------------------
// 1. 形状検証（sdk-types/src/manifest.ts PermissionsSection のミラー）
// ---------------------------------------------------------------------------

export interface PermissionShapeResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** sdk-types/src/manifest.ts PermissionsSection が定義済みのキー */
const KNOWN_PERMISSION_KEYS = new Set([
  "pool",
  "amp",
  "external-network",
  "oauth",
  "mcp",
  "inter-app",
  "filesystem",
]);

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isReadWriteArray(v: unknown): v is Array<"read" | "write"> {
  return Array.isArray(v) && v.every((x) => x === "read" || x === "write");
}

/**
 * `[permissions]` の形状を検証する。
 * 未知キーは FAIL にはしない（sdk-types 側の schema が実運用の akari.toml に
 * 追従できていないケースが既にあるため — keychain / process 等。§comment 参照）。
 */
export function validatePermissionsShape(permissions: unknown): PermissionShapeResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (permissions === undefined || permissions === null) {
    return { valid: true, errors, warnings };
  }

  if (typeof permissions !== "object" || Array.isArray(permissions)) {
    return { valid: false, errors: ["[permissions] はテーブル（TOML table）である必要があります"], warnings };
  }

  const perm = permissions as Record<string, unknown>;

  for (const key of Object.keys(perm)) {
    if (!KNOWN_PERMISSION_KEYS.has(key)) {
      warnings.push(
        `未知のパーミッションキー "${key}" — sdk-types/src/manifest.ts の PermissionsSection 未対応（例: keychain, process 等）。schema 拡張候補として記録するのみで FAIL にはしません。`
      );
    }
  }

  if (perm.pool !== undefined && !isReadWriteArray(perm.pool)) {
    errors.push('[permissions] pool は "read" / "write" の配列である必要があります');
  }
  if (perm.amp !== undefined && !isReadWriteArray(perm.amp)) {
    errors.push('[permissions] amp は "read" / "write" の配列である必要があります');
  }

  const en = perm["external-network"];
  if (en !== undefined && en !== false && !isStringArray(en)) {
    errors.push('[permissions] external-network は文字列配列または false である必要があります');
  }

  for (const key of ["oauth", "mcp", "inter-app"] as const) {
    const v = perm[key];
    if (v !== undefined && !isStringArray(v)) {
      errors.push(`[permissions] ${key} は文字列配列である必要があります`);
    }
  }

  if (perm.filesystem !== undefined) {
    const fsOk = isStringArray(perm.filesystem) && perm.filesystem.every((x) => /^(read|write):.+/.test(x));
    if (!fsOk) {
      errors.push('[permissions] filesystem は "read:<key>" / "write:<key>" 形式の文字列配列である必要があります');
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ---------------------------------------------------------------------------
// 2. 静的スキャン — ソースファイル探索
// ---------------------------------------------------------------------------

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const EXCLUDED_DIR_NAMES = new Set(["node_modules", ".git", "dist", "build", "coverage", "__tests__", "test", "tests"]);

async function pathExists(p: string): Promise<boolean> {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function collectSourceFiles(root: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(dir: string): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
        await walk(full);
      } else if (entry.isFile() && SCAN_EXTENSIONS.has(path.extname(entry.name))) {
        out.push(full);
      }
    }
  }

  await walk(root);
  return out;
}

/**
 * スキャン対象ルートを決定する。
 * Full Tier は `src/`、MCP-Declarative は `mcp-server/` に実装が入るのが慣習
 * （examples/* 参照）。どちらも存在しなければ最終手段として `dist/`（ビルド成果物）を
 * 使う — minify されていると検出精度は落ちる（既知の限界）。
 */
async function resolveScanRoots(
  appDir: string
): Promise<{ roots: { label: string; dir: string }[]; usedDistFallback: boolean }> {
  const candidateLabels = ["src", "mcp-server"];
  const roots: { label: string; dir: string }[] = [];

  for (const label of candidateLabels) {
    const dir = path.join(appDir, label);
    if (await pathExists(dir)) {
      roots.push({ label, dir });
    }
  }

  if (roots.length > 0) {
    return { roots, usedDistFallback: false };
  }

  const distDir = path.join(appDir, "dist");
  if (await pathExists(distDir)) {
    return { roots: [{ label: "dist", dir: distDir }], usedDistFallback: true };
  }

  return { roots: [], usedDistFallback: false };
}

/**
 * ブロックコメント / 行コメントを除去する（誤検出を減らすため）。
 * `://`（URL リテラル内の `//`）は行コメントとして誤爆しないよう、直前の文字が
 * `:` の場合はマッチさせない。
 */
function stripComments(source: string): string {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, "");
  out = out.replace(/(^|[^:])\/\/.*$/gm, "$1");
  return out;
}

// ---------------------------------------------------------------------------
// pool.ts（sdk-types 実行時 API）の read/write 分類
// 手動同期: packages/sdk-types/src/pool.ts の export 一覧を変更したらここも追従すること
// ---------------------------------------------------------------------------

const POOL_READ_FNS = new Set([
  "listWorkspaces",
  "listArchivedWorkspaces",
  "listItems",
  "searchItems",
  "getItem",
  "listRelations",
  "analyzeItem",
  "readItemContent",
  "listArchivedItems",
  "getItemFilePath",
  "getItemThumbnail",
  "getPoolSettings",
  "checkPoolTools",
  "getWorkContext",
  "slotListEntries",
  "listEntities",
  "listEntityRelations",
  "searchEntities",
  "entityGraph",
  "checkAssetDeletion",
  "getWorkflowSteps",
]);

const POOL_WRITE_FNS = new Set([
  "createWorkspace",
  "deleteWorkspace",
  "archiveWorkspace",
  "restoreWorkspace",
  "purgeWorkspace",
  "renameWorkspace",
  "updateWorkspaceMeta",
  "addItem",
  "upsertItem",
  "deleteItem",
  "archiveItem",
  "restoreItem",
  "purgeItem",
  "purgeOldArchives",
  "savePoolSettings",
  "setWorkContext",
  "slotAddEntry",
  "slotRemoveEntry",
  "slotReorderEntries",
  "slotPromoteEntry",
  "updateItem",
  "updateItemContext",
  "setWorkflowSteps",
]);

interface ScanEvidence {
  poolRead: boolean;
  poolWrite: boolean;
  ampRead: boolean;
  ampWrite: boolean;
  interApp: boolean;
  networkGeneric: boolean;
  networkDomains: Set<string>;
}

function createEmptyEvidence(): ScanEvidence {
  return {
    poolRead: false,
    poolWrite: false,
    ampRead: false,
    ampWrite: false,
    interApp: false,
    networkGeneric: false,
    networkDomains: new Set<string>(),
  };
}

const POOL_NAMED_IMPORT_RE = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*["']@akari-os\/sdk\/pool["']/g;
const AMP_WRITE_RE = /\bamp\s*\.\s*record\s*\(/;
const AMP_READ_RE = /\bamp\s*\.\s*query\s*\(/;
const HANDOFF_CALL_RE = /\.handoff\s*\(/;
const INTER_APP_IMPORT_RE = /from\s*["']@akari-os\/sdk\/inter-app["']/;
const FETCH_CALL_RE = /\bfetch\s*\(/;
const FETCH_LITERAL_RE = /\bfetch\s*\(\s*(["'`])([^"'`]*)\1/g;

function scanFileContent(raw: string, evidence: ScanEvidence): void {
  const src = stripComments(raw);

  let m: RegExpExecArray | null;
  POOL_NAMED_IMPORT_RE.lastIndex = 0;
  while ((m = POOL_NAMED_IMPORT_RE.exec(src))) {
    const names = m[1]
      .split(",")
      .map((s) => s.replace(/^\s*type\s+/, "").trim().split(/\s+as\s+/)[0]?.trim())
      .filter((n): n is string => Boolean(n));
    for (const n of names) {
      if (POOL_WRITE_FNS.has(n)) evidence.poolWrite = true;
      if (POOL_READ_FNS.has(n)) evidence.poolRead = true;
    }
  }

  if (AMP_WRITE_RE.test(src)) evidence.ampWrite = true;
  if (AMP_READ_RE.test(src)) evidence.ampRead = true;
  if (HANDOFF_CALL_RE.test(src) || INTER_APP_IMPORT_RE.test(src)) evidence.interApp = true;

  if (FETCH_CALL_RE.test(src)) evidence.networkGeneric = true;
  FETCH_LITERAL_RE.lastIndex = 0;
  while ((m = FETCH_LITERAL_RE.exec(src))) {
    const literal = m[2];
    const domainMatch = /^https?:\/\/([^/:?#]+)/.exec(literal);
    if (domainMatch) evidence.networkDomains.add(domainMatch[1]);
  }
}

export interface ScanAppSourceResult {
  evidence: ScanEvidence;
  roots: string[];
  fileCount: number;
  usedDistFallback: boolean;
}

export async function scanAppSource(appDir: string): Promise<ScanAppSourceResult> {
  const { roots, usedDistFallback } = await resolveScanRoots(appDir);
  const evidence = createEmptyEvidence();
  let fileCount = 0;

  for (const root of roots) {
    const files = await collectSourceFiles(root.dir);
    for (const file of files) {
      let content: string;
      try {
        content = await fsp.readFile(file, "utf-8");
      } catch {
        continue;
      }
      fileCount += 1;
      scanFileContent(content, evidence);
    }
  }

  return { evidence, roots: roots.map((r) => r.label), fileCount, usedDistFallback };
}

// ---------------------------------------------------------------------------
// 宣言 vs 使用の突合ロジック
// ---------------------------------------------------------------------------

type SubStatus = "PASS" | "FAIL" | "WARN";

function evaluateUsage(label: string, declared: boolean, used: boolean): { status: SubStatus; note: string } {
  if (used && !declared) {
    return { status: "FAIL", note: `${label}: 使用箇所を検出しましたが [permissions] に未宣言です` };
  }
  if (used && declared) {
    return { status: "PASS", note: `${label}: 宣言と使用が一致` };
  }
  if (!used && declared) {
    return {
      status: "WARN",
      note: `${label}: 宣言されていますが使用箇所を検出できませんでした（静的スキャンの限界の可能性あり）`,
    };
  }
  return { status: "PASS", note: `${label}: 未使用・未宣言` };
}

function mergeCase(name: string, evals: { status: SubStatus; note: string }[]): PermissionCaseResult {
  const rank: Record<SubStatus, number> = { FAIL: 0, WARN: 1, PASS: 2 };
  const status = evals.slice().sort((a, b) => rank[a.status] - rank[b.status])[0]?.status ?? "PASS";
  return { name, status, message: evals.map((e) => e.note).join(" / ") };
}

function evaluateNetworkCase(manifest: AppManifest, evidence: ScanEvidence): PermissionCaseResult {
  const name = "external-network（fetch）宣言 vs 使用";
  const decl = manifest.permissions?.["external-network"];
  const used = evidence.networkGeneric || evidence.networkDomains.size > 0;

  if (!used) {
    if (Array.isArray(decl) && decl.length > 0) {
      return {
        name,
        status: "WARN",
        message: "宣言されていますが fetch() 使用箇所を検出できませんでした（静的スキャンの限界の可能性あり）",
      };
    }
    return { name, status: "PASS", message: "未使用・未宣言" };
  }

  if (decl === false || decl === undefined) {
    return {
      name,
      status: "FAIL",
      message: "fetch() 使用箇所を検出しましたが [permissions] external-network が未宣言または false です",
    };
  }

  if (Array.isArray(decl)) {
    if (decl.includes("*")) {
      return { name, status: "PASS", message: 'fetch() 使用箇所を検出（宣言はワイルドカード "*" でカバー）' };
    }
    const undeclared = [...evidence.networkDomains].filter((d) => !decl.includes(d));
    if (undeclared.length > 0) {
      return { name, status: "FAIL", message: `未宣言ドメインへの fetch() を検出: ${undeclared.join(", ")}` };
    }
    if (evidence.networkDomains.size === 0) {
      return {
        name,
        status: "WARN",
        message:
          "fetch() 使用箇所を検出しましたがリテラル URL からドメインを特定できませんでした（宣言との厳密照合は不可。宣言済みのため WARN に留めます）",
      };
    }
    return { name, status: "PASS", message: "fetch() 使用箇所を検出、宣言ドメインと一致" };
  }

  return { name, status: "PASS", message: "OK" };
}

// ---------------------------------------------------------------------------
// Public API — Permission Suite 本体
// ---------------------------------------------------------------------------

/**
 * Permission Suite の Contract Test ケース一覧を生成する。
 * contract-test.ts の runPermissionApiSuite から呼ばれる。
 */
export async function runPermissionScan(manifest: AppManifest, appDir: string): Promise<PermissionCaseResult[]> {
  const cases: PermissionCaseResult[] = [];

  // ── 1. 形状検証 ──────────────────────────────────────────────────────────
  const shape = validatePermissionsShape(manifest.permissions);
  const shapeMessages = [...shape.errors, ...shape.warnings];
  cases.push({
    name: "パーミッション宣言の形状検証（sdk-types PermissionsSection 準拠）",
    status: shape.valid ? "PASS" : "FAIL",
    message: shapeMessages.length > 0 ? shapeMessages.join(" / ") : "OK",
  });

  // ── 2. 宣言サマリ（旧stub: ゼロ宣言=FAIL というバグを修正。ゼロ宣言は
  //      最小権限アプリとして正当なので PASS 扱いにする）────────────────────
  const declaredKeys = Object.keys(manifest.permissions ?? {});
  cases.push({
    name: `宣言されたスコープ一覧（${declaredKeys.length} 件）`,
    status: "PASS",
    message:
      declaredKeys.length > 0
        ? declaredKeys.join(", ")
        : "宣言なし（ゼロパーミッションアプリとして有効 — HUB-024 §6.7 rule 5 の default deny の理想形）",
  });

  // ── 3. 静的スキャン ─────────────────────────────────────────────────────
  const { evidence, roots, fileCount, usedDistFallback } = await scanAppSource(appDir);

  const pool = manifest.permissions?.pool ?? [];
  const poolReadEval = evaluateUsage("pool:read", pool.includes("read"), evidence.poolRead);
  const poolWriteEval = evaluateUsage("pool:write", pool.includes("write"), evidence.poolWrite);
  cases.push(mergeCase("pool アクセス（read/write）宣言 vs 使用", [poolReadEval, poolWriteEval]));

  const amp = manifest.permissions?.amp ?? [];
  const ampReadEval = evaluateUsage("amp:read", amp.includes("read"), evidence.ampRead);
  const ampWriteEval = evaluateUsage("amp:write", amp.includes("write"), evidence.ampWrite);
  cases.push(
    mergeCase("amp アクセス（record/query）宣言 vs 使用（ヒューリスティック: 関数名の正規表現一致のみ）", [
      ampReadEval,
      ampWriteEval,
    ])
  );

  const interAppDeclared = Array.isArray(manifest.permissions?.["inter-app"]) && manifest.permissions!["inter-app"]!.length > 0;
  const interAppEval = evaluateUsage("inter-app", interAppDeclared, evidence.interApp);
  cases.push({ name: "inter-app（handoff）宣言 vs 使用", status: interAppEval.status, message: interAppEval.note });

  cases.push(evaluateNetworkCase(manifest, evidence));

  // ── 4. スキャン範囲・既知の限界（常に表示。誤って過信されないための注記）───
  cases.push({
    name: "静的スキャンの範囲と既知の限界",
    status: "SKIP",
    message:
      `scan roots: [${roots.length > 0 ? roots.join(", ") : "(none found)"}]` +
      `${usedDistFallback ? " (dist フォールバック使用 — 検出精度低下の可能性)" : ""}, ` +
      `files scanned: ${fileCount}. ` +
      "検出不能: 動的 import() / 文字列結合によるモジュール指定子 / namespace import 経由の呼び出し " +
      "(import * as pool ...) / minify 済み dist の関数名 / keychain・process 等 schema 未定義キー / " +
      "OAuth フロー専用の検出（external-network の fetch 検出に間接的に依存するのみ）。",
  });

  return cases;
}
