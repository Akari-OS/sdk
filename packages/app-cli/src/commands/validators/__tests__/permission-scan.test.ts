import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import type { AppManifest } from "../manifest";
import { runPermissionScan, validatePermissionsShape } from "../permission-scan";

// フィクスチャは tests/fixtures/permission-scan/ 配下の src/ のみを使う（静的スキャン対象）。
// manifest 本体は akari.toml の TOML パースを介さずインラインで組み立てる —
// `tsc --outDir /tmp/...` でコンパイルされた実行時パスからは @iarna/toml が
// node_modules 解決できない（symlink 越しの workspace 構成 + /tmp 実行のため）。
// 既存の manifest.test.ts も同じ理由で validateManifest() に直接オブジェクトを渡している。
// パスは npm/pnpm が packages/app-cli をカレントディレクトリにして `test` スクリプトを
// 実行する前提（package.json の "test" スクリプトと同じ規約）。
function fixtureDir(name: string): string {
  return path.resolve(process.cwd(), "tests", "fixtures", "permission-scan", name);
}

function makeManifest(overrides: { permissions?: AppManifest["permissions"] }): AppManifest {
  return {
    app: {
      id: "com.example.permission-scan-test",
      name: "Permission Scan Test",
      version: "0.1.0",
      tier: "full",
      sdk: ">=0.1.0 <1.0",
      category: "studio",
    },
    permissions: overrides.permissions ?? {},
    panels: { main: { title: "Test", mount: "dist/index.js" } },
  };
}

test("runPermissionScan: pool read import が宣言と一致すれば FAIL/WARN が出ない", async () => {
  const manifest = makeManifest({ permissions: { pool: ["read"] } });
  const cases = await runPermissionScan(manifest, fixtureDir("pool-read-ok"));

  assert.equal(
    cases.some((c) => c.status === "FAIL"),
    false,
    `FAIL が出ています: ${JSON.stringify(cases.filter((c) => c.status === "FAIL"))}`,
  );
  assert.equal(
    cases.some((c) => c.status === "WARN"),
    false,
    `WARN が出ています: ${JSON.stringify(cases.filter((c) => c.status === "WARN"))}`,
  );

  const poolCase = cases.find((c) => c.name.startsWith("pool アクセス"));
  assert.ok(poolCase);
  assert.match(poolCase!.message ?? "", /pool:read: 宣言と使用が一致/);
});

test("runPermissionScan: 未宣言の pool write import は FAIL", async () => {
  const manifest = makeManifest({ permissions: { pool: ["read"] } });
  const cases = await runPermissionScan(manifest, fixtureDir("pool-write-undeclared"));

  const poolCase = cases.find((c) => c.name.startsWith("pool アクセス"));
  assert.ok(poolCase);
  assert.equal(poolCase!.status, "FAIL");
  assert.match(poolCase!.message ?? "", /pool:write: 使用箇所を検出しましたが \[permissions\] に未宣言です/);
});

test("runPermissionScan: pool write を宣言していれば同じソースでも FAIL しない", async () => {
  const manifest = makeManifest({ permissions: { pool: ["read", "write"] } });
  const cases = await runPermissionScan(manifest, fixtureDir("pool-write-undeclared"));

  const poolCase = cases.find((c) => c.name.startsWith("pool アクセス"));
  assert.ok(poolCase);
  assert.notEqual(poolCase!.status, "FAIL");
});

test("runPermissionScan: 未宣言ドメインへの fetch() は FAIL", async () => {
  const manifest = makeManifest({ permissions: {} });
  const cases = await runPermissionScan(manifest, fixtureDir("network-fail"));

  const networkCase = cases.find((c) => c.name.startsWith("external-network"));
  assert.ok(networkCase);
  assert.equal(networkCase!.status, "FAIL");
});

test('runPermissionScan: external-network が "*" ならワイルドカードでカバーされ PASS', async () => {
  const manifest = makeManifest({ permissions: { "external-network": ["*"] } });
  const cases = await runPermissionScan(manifest, fixtureDir("network-wildcard-ok"));

  const networkCase = cases.find((c) => c.name.startsWith("external-network"));
  assert.ok(networkCase);
  assert.equal(networkCase!.status, "PASS");
});

test("runPermissionScan: ゼロパーミッション宣言は FAIL にならない（旧stubのバグ回帰）", async () => {
  const manifest = makeManifest({ permissions: {} });
  const cases = await runPermissionScan(manifest, fixtureDir("zero-permissions-ok"));

  assert.equal(
    cases.some((c) => c.status === "FAIL"),
    false,
    `ゼロ宣言アプリで FAIL が出ています: ${JSON.stringify(cases.filter((c) => c.status === "FAIL"))}`,
  );

  const summaryCase = cases.find((c) => c.name.includes("宣言されたスコープ一覧"));
  assert.ok(summaryCase);
  assert.equal(summaryCase!.status, "PASS");
});

test("validatePermissionsShape: 未知キーは WARN のみで FAIL にしない（keychain/process 等の実運用ギャップ）", () => {
  const result = validatePermissionsShape({ keychain: ["com.example.app"], pool: ["read"] });

  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(
    result.warnings.some((w) => w.includes('未知のパーミッションキー "keychain"')),
    true,
  );
});

test("validatePermissionsShape: pool の値が read/write 以外なら FAIL", () => {
  const result = validatePermissionsShape({ pool: ["delete"] });

  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((e) => e.includes("pool")),
    true,
  );
});

test("validatePermissionsShape: external-network は文字列配列または false", () => {
  const okFalse = validatePermissionsShape({ "external-network": false });
  assert.equal(okFalse.valid, true);

  const okArray = validatePermissionsShape({ "external-network": ["api.example.com"] });
  assert.equal(okArray.valid, true);

  const bad = validatePermissionsShape({ "external-network": "api.example.com" });
  assert.equal(bad.valid, false);
});
