/**
 * Writer 改修 Phase F（spec-writer-renovation-2026 §3.8）: composeContext の単体テスト。
 *
 * `composeContext` は invoke ベースの pool.ts 関数（compileContextInherited /
 * getWorkContext / contextAttachGet / getItem）に依存するが、Tauri IPC を経由せず
 * テストできるよう `deps` 注入口を持つ。本テストはその注入口経由で下位 API を
 * fake 実装に差し替え、実際の invoke を呼ばずに合成ロジックのみを検証する。
 *
 * 実行: `pnpm --filter @akari-os/sdk test`（Node 22+ の型ストリッピングで .ts を直接実行、ビルド不要）。
 */
import test from "node:test"
import assert from "node:assert/strict"

import {
  composeContext,
  type ComposeContextDeps,
  type ContextAttachRecord,
  type ContextChip,
  type PoolItemFull,
} from "../src/pool.ts"
import type { WorkContextPayload } from "../src/work-context.ts"

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function emptyWorkContext(overrides: Partial<WorkContextPayload> = {}): WorkContextPayload {
  return {
    work_id: "work-1",
    purpose: "",
    strategy: { fields: [], memo: "" },
    tone: null,
    slot_definitions: [],
    slot_entries: [],
    references: [],
    ...overrides,
  }
}

function attachRecord(overrides: Partial<ContextAttachRecord> = {}): ContextAttachRecord {
  return {
    work_id: "work-1",
    variant_id: "variant-1",
    target_kind: "asset",
    target_id: "asset-1",
    attached: true,
    updated_at: "2026-07-05T00:00:00Z",
    ...overrides,
  }
}

function poolItem(overrides: Partial<PoolItemFull> = {}): PoolItemFull {
  return {
    id: "asset-1",
    name: "自分の声 v3",
    file_path: null,
    source_path: null,
    mime_type: null,
    item_type: "style",
    size_bytes: null,
    role: null,
    layer: null,
    ai_summary: null,
    ai_tags: [],
    context_json: null,
    analyzed_at: null,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...overrides,
  }
}

function styleContextJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    domain: "writing",
    extracted_rules: [
      { id: "r1", rule: "段落冒頭は短い断定文で始める", approved: true },
      { id: "r2", rule: "未承認のルールは無視される", approved: false },
    ],
    human_overrides: ["「弊社」ではなく「私たち」を使う"],
    ...overrides,
  }
}

function makeDeps(overrides: Partial<ComposeContextDeps> = {}): ComposeContextDeps {
  return {
    compileContextInherited: async () => "",
    getWorkContext: async () => emptyWorkContext(),
    contextAttachGet: async () => [],
    getItem: async () => {
      throw new Error("getItem should not be called in this fixture")
    },
    ...overrides,
  }
}

function chipIds(chips: ContextChip[]): string[] {
  return chips.map((c) => c.id)
}

// ---------------------------------------------------------------------------
// 3 層合成
// ---------------------------------------------------------------------------

test("composeContext: 3 層（brand / work / style）+ テンプレ chip をすべて合成する", async () => {
  const deps = makeDeps({
    compileContextInherited: async (library, appId, keywords, inherit) => {
      assert.equal(library, "pool-a")
      assert.equal(appId, "writer")
      assert.deepEqual(keywords, ["catchy"])
      assert.equal(inherit, true)
      return "# ブランドの原則\n\n常に丁寧語を使う。"
    },
    getWorkContext: async (library, workId, variantId) => {
      assert.equal(library, "pool-a")
      assert.equal(workId, "work-1")
      assert.equal(variantId, "variant-1")
      return emptyWorkContext({
        purpose: "新商品のローンチ告知",
        tone: "明るく親しみやすく",
        strategy: {
          fields: [{ key: "対象読者", value: "20代女性" }],
          memo: "価格には触れない",
        },
      })
    },
    contextAttachGet: async () => [attachRecord()],
    getItem: async (library, id) => {
      assert.equal(library, "pool-a")
      assert.equal(id, "asset-1")
      return poolItem({ context_json: styleContextJson() })
    },
  })

  const result = await composeContext(
    {
      library: "pool-a",
      appId: "writer",
      workId: "work-1",
      variantId: "variant-1",
      keywords: ["catchy"],
      inherit: true,
      styleDomain: "writing",
      extraChips: [
        {
          id: "template:add-catchy",
          kind: "template",
          label: "テンプレ: キャッチーに",
          body: "見出しを疑問形にしてください。",
          removable: true,
        },
      ],
    },
    deps,
  )

  assert.deepEqual(chipIds(result.sections), [
    "brand",
    "work",
    "style:asset-1",
    "template:add-catchy",
  ])

  const styleChip = result.sections.find((c) => c.id === "style:asset-1")
  assert.ok(styleChip)
  assert.equal(styleChip?.label, "文体: 自分の声 v3")
  // human_overrides が最優先 → approved rule のみ含み、未承認 rule は含まない
  assert.match(styleChip?.body ?? "", /「弊社」ではなく「私たち」を使う/)
  assert.match(styleChip?.body ?? "", /段落冒頭は短い断定文で始める/)
  assert.doesNotMatch(styleChip?.body ?? "", /未承認のルールは無視される/)

  assert.match(result.system, /## ブランド規約/)
  assert.match(result.system, /## この Work の方針/)
  assert.match(result.system, /目的: 新商品のローンチ告知/)
  assert.match(result.system, /対象読者: 20代女性/)
  assert.match(result.system, /## 文体: 自分の声 v3/)
  assert.match(result.system, /## テンプレ: キャッチーに/)
})

// ---------------------------------------------------------------------------
// 層欠落 — 壊れず、単に chip を作らない
// ---------------------------------------------------------------------------

test("composeContext: 全層が空でも例外を投げず sections=[] / system=''", async () => {
  const result = await composeContext(
    { library: "pool-a", workId: "work-1", variantId: "variant-1" },
    makeDeps(),
  )
  assert.deepEqual(result.sections, [])
  assert.equal(result.system, "")
})

test("composeContext: attach 済みだが getItem が失敗する dangling asset は無視する", async () => {
  const deps = makeDeps({
    contextAttachGet: async () => [attachRecord({ target_id: "asset-deleted" })],
    getItem: async () => {
      throw new Error("pool_get_item failed: not found")
    },
  })
  const result = await composeContext(
    { library: "pool-a", workId: "work-1", variantId: "variant-1" },
    deps,
  )
  assert.deepEqual(result.sections, [])
})

test("composeContext: attached=false の attach record は style chip 化しない", async () => {
  const deps = makeDeps({
    contextAttachGet: async () => [attachRecord({ attached: false })],
  })
  const result = await composeContext(
    { library: "pool-a", workId: "work-1", variantId: "variant-1" },
    deps,
  )
  assert.deepEqual(result.sections, [])
})

test("composeContext: target_kind が asset 以外の attach record は無視する", async () => {
  const deps = makeDeps({
    contextAttachGet: async () => [attachRecord({ target_kind: "pool" })],
  })
  const result = await composeContext(
    { library: "pool-a", workId: "work-1", variantId: "variant-1" },
    deps,
  )
  assert.deepEqual(result.sections, [])
})

test("composeContext: context_json が StyleAsset 形でない item は skip する", async () => {
  const deps = makeDeps({
    contextAttachGet: async () => [attachRecord()],
    getItem: async () => poolItem({ context_json: { source_app: "writer" } }),
  })
  const result = await composeContext(
    { library: "pool-a", workId: "work-1", variantId: "variant-1" },
    deps,
  )
  assert.deepEqual(result.sections, [])
})

test("composeContext: styleDomain が指定と一致しない StyleAsset は skip する", async () => {
  const deps = makeDeps({
    contextAttachGet: async () => [attachRecord()],
    getItem: async () => poolItem({ context_json: styleContextJson({ domain: "video" }) }),
  })
  const result = await composeContext(
    { library: "pool-a", workId: "work-1", variantId: "variant-1", styleDomain: "writing" },
    deps,
  )
  assert.deepEqual(result.sections, [])
})

// ---------------------------------------------------------------------------
// チップ除外
// ---------------------------------------------------------------------------

test("composeContext: excludeChipIds で指定した chip は合成から外れる（他層は影響を受けない）", async () => {
  const deps = makeDeps({
    compileContextInherited: async () => "常に丁寧語を使う。",
    getWorkContext: async () => emptyWorkContext({ purpose: "告知" }),
    contextAttachGet: async () => [attachRecord()],
    getItem: async () => poolItem({ context_json: styleContextJson() }),
  })

  const result = await composeContext(
    {
      library: "pool-a",
      workId: "work-1",
      variantId: "variant-1",
      excludeChipIds: ["work", "style:asset-1"],
    },
    deps,
  )

  assert.deepEqual(chipIds(result.sections), ["brand"])
  assert.doesNotMatch(result.system, /この Work の方針/)
  assert.doesNotMatch(result.system, /文体:/)
})

test("composeContext: excludeChipIds は extraChips にも適用される", async () => {
  const result = await composeContext(
    {
      library: "pool-a",
      workId: "work-1",
      variantId: "variant-1",
      extraChips: [
        { id: "adhoc:1", kind: "adhoc", label: "追加指示", body: "短くして", removable: true },
      ],
      excludeChipIds: ["adhoc:1"],
    },
    makeDeps(),
  )
  assert.deepEqual(result.sections, [])
})
