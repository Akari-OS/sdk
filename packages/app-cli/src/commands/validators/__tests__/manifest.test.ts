import assert from "node:assert/strict";
import test from "node:test";

import { validateManifest } from "../manifest";

const baseManifest = {
  app: {
    id: "com.example.test",
    name: "Test App",
    tier: "full",
    sdk: ">=0.1.0 <1.0",
  },
  permissions: {},
};

test("validateManifest accepts a valid compat shell_api range", () => {
  const result = validateManifest({
    ...baseManifest,
    compat: {
      shell_api: "^0.1",
      sdk: ">=0.1.0 <1.0",
    },
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(
    result.warnings.some((warning) => warning.includes("[compat].shell_api 未宣言")),
    false,
  );
});

test("validateManifest rejects an invalid compat shell_api range", () => {
  const result = validateManifest({
    ...baseManifest,
    compat: {
      shell_api: "not a range",
    },
  });

  assert.equal(result.valid, false);
  assert.equal(
    result.errors.some((error) => error.code === "INVALID_COMPAT_SHELL_API"),
    true,
  );
});

test("validateManifest warns when compat shell_api is missing without failing", () => {
  const result = validateManifest(baseManifest);

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(
    result.warnings.includes(
      "[compat].shell_api 未宣言: shell 0.x 期間は互換とみなされるが、新規アプリは宣言を必須とする (AKARI-HUB-108 3-5)",
    ),
    true,
  );
});
