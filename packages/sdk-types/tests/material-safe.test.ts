/**
 * ADR-140 D-4 ③（素材登録契約）: resolveMaterialApi / registerMaterialSafe / registerRenderSafe の
 * 解決・フォールバック動作を globalThis.__akari_sdk モックで検証する。
 *
 * 実行: `pnpm --filter @akari-os/sdk test`（Node 22+ の型ストリッピングで .ts を直接実行、ビルド不要）。
 */
import test from "node:test"
import assert from "node:assert/strict"

import {
  resolveMaterialApi,
  registerMaterialSafe,
  registerRenderSafe,
  type MaterialApi,
} from "../src/material.ts"

type GlobalWithSdk = typeof globalThis & {
  __akari_sdk?: { material?: Partial<MaterialApi> }
}

const g = globalThis as GlobalWithSdk

/** テスト間で globalThis.__akari_sdk を汚染しないための後始末ヘルパ。 */
function withMaterialApi<T>(material: Partial<MaterialApi> | undefined, fn: () => T): T {
  const prev = g.__akari_sdk
  g.__akari_sdk = material ? { material } : undefined
  try {
    return fn()
  } finally {
    g.__akari_sdk = prev
  }
}

// ---------------------------------------------------------------------------
// resolveMaterialApi
// ---------------------------------------------------------------------------

test("resolveMaterialApi: globalThis.__akari_sdk 未設定（shell 外・単体 dev 起動）では null", () => {
  withMaterialApi(undefined, () => {
    assert.equal(resolveMaterialApi(), null)
  })
})

test("resolveMaterialApi: registerMaterial / registerRender の一方が欠けている場合は null", () => {
  withMaterialApi({ registerMaterial: async () => ({ itemId: "x" }) }, () => {
    assert.equal(resolveMaterialApi(), null)
  })
})

test("resolveMaterialApi: 両方揃っていれば MaterialApi を返す", () => {
  const registerMaterial: MaterialApi["registerMaterial"] = async () => ({ itemId: "m1" })
  const registerRender: MaterialApi["registerRender"] = async () => ({ itemId: "r1" })
  withMaterialApi({ registerMaterial, registerRender }, () => {
    const api = resolveMaterialApi()
    assert.notEqual(api, null)
    assert.equal(api?.registerMaterial, registerMaterial)
    assert.equal(api?.registerRender, registerRender)
  })
})

// ---------------------------------------------------------------------------
// registerMaterialSafe
// ---------------------------------------------------------------------------

test("registerMaterialSafe: 未解決時（shell 外）は no-op で reason: unavailable を返す", async () => {
  await withMaterialApi(undefined, async () => {
    const result = await registerMaterialSafe({
      type: "svg",
      name: "test-material",
      docFormat: "svg.shape.v1",
      doc: "<svg/>",
    })
    assert.deepEqual(result, { registered: false, itemId: null, reason: "unavailable" })
  })
})

test("registerMaterialSafe: 解決できれば shell 側 registerMaterial に委譲し itemId を返す", async () => {
  let receivedName: string | undefined
  const registerMaterial: MaterialApi["registerMaterial"] = async (asset) => {
    receivedName = asset.name
    return { itemId: "item-123" }
  }
  const registerRender: MaterialApi["registerRender"] = async () => ({ itemId: "unused" })

  await withMaterialApi({ registerMaterial, registerRender }, async () => {
    const result = await registerMaterialSafe({
      type: "svg",
      name: "test-material",
      docFormat: "svg.shape.v1",
      doc: "<svg/>",
    })
    assert.deepEqual(result, { registered: true, itemId: "item-123" })
    assert.equal(receivedName, "test-material")
  })
})

test("registerMaterialSafe: invoke 失敗時も例外を投げず、日本語の丁寧なエラーで返す", async () => {
  const registerMaterial: MaterialApi["registerMaterial"] = async () => {
    throw new Error("pool_upsert_item failed: connection refused")
  }
  const registerRender: MaterialApi["registerRender"] = async () => ({ itemId: "unused" })

  await withMaterialApi({ registerMaterial, registerRender }, async () => {
    const result = await registerMaterialSafe({
      type: "svg",
      name: "test-material",
      docFormat: "svg.shape.v1",
      doc: "<svg/>",
    })
    assert.equal(result.registered, false)
    if (result.registered) throw new Error("unreachable")
    assert.equal(result.reason, "error")
    assert.match(result.error ?? "", /素材の登録に失敗しました/)
    assert.match(result.error ?? "", /connection refused/)
  })
})

// ---------------------------------------------------------------------------
// registerRenderSafe
// ---------------------------------------------------------------------------

test("registerRenderSafe: 未解決時（shell 外）は no-op で reason: unavailable を返す", async () => {
  await withMaterialApi(undefined, async () => {
    const result = await registerRenderSafe({ name: "out.wav", filePath: "/tmp/out.wav" })
    assert.deepEqual(result, { registered: false, itemId: null, reason: "unavailable" })
  })
})

test("registerRenderSafe: 解決できれば shell 側 registerRender に委譲し itemId を返す", async () => {
  const registerMaterial: MaterialApi["registerMaterial"] = async () => ({ itemId: "unused" })
  const registerRender: MaterialApi["registerRender"] = async () => ({ itemId: "render-456" })

  await withMaterialApi({ registerMaterial, registerRender }, async () => {
    const result = await registerRenderSafe({ name: "out.wav", filePath: "/tmp/out.wav" })
    assert.deepEqual(result, { registered: true, itemId: "render-456" })
  })
})

test("registerRenderSafe: invoke 失敗時も例外を投げず、日本語の丁寧なエラーで返す", async () => {
  const registerMaterial: MaterialApi["registerMaterial"] = async () => ({ itemId: "unused" })
  const registerRender: MaterialApi["registerRender"] = async () => {
    throw new Error("disk full")
  }

  await withMaterialApi({ registerMaterial, registerRender }, async () => {
    const result = await registerRenderSafe({ name: "out.wav", filePath: "/tmp/out.wav" })
    assert.equal(result.registered, false)
    if (result.registered) throw new Error("unreachable")
    assert.equal(result.reason, "error")
    assert.match(result.error ?? "", /書き出し物の登録に失敗しました/)
    assert.match(result.error ?? "", /disk full/)
  })
})
