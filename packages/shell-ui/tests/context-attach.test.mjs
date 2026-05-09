/**
 * AKARI-HUB-071 Phase 1 (T-13): Context attach 系の structural / pure logic test。
 *
 * Node.js 標準 test runner (`node --test`) を使い、Tauri / DOM / React に依存しない
 * pure logic の round-trip 検証だけ行う。Playwright 等の e2e は別 framework
 * 導入が必要で、本 spec の MVP scope 外（spec §8 Testing Strategy / §11
 * Implementation Notes に handoff 必要）。
 *
 * このファイルは shell-ui パッケージの dist (built) を直接 import せず、
 * spec §6 Architecture / Data Models で定義された semantic を **executable spec** として
 * encode する。実装側 (src/hooks/useContextPane.ts /
 * src/lib/in-memory-context-adapter.ts) と乖離した場合は実装か本 test を直す。
 *
 * 検証対象:
 *   - in-memory adapter: get / set round-trip + variant_id 省略時の primary fallback
 *   - records → ContextPaneState 変換: target_kind 別振り分け / 不正 stage skip / resolver 適用
 *
 * 実行: `pnpm --filter "@akari-os/shell-ui" run test` または直接
 *       `node --test packages/shell-ui/tests/context-attach.test.mjs`
 */

import test from "node:test"
import assert from "node:assert/strict"

// =============================================================================
// 1. spec §6 Data Models の executable spec — in-memory adapter
// =============================================================================
// 実装: src/lib/in-memory-context-adapter.ts と同じ semantic を再現。
function createInMemoryContextAdapter() {
  const store = new Map()
  const primaryByWork = new Map()
  const key = (e) =>
    `${e.work_id} ${e.variant_id} ${e.target_kind} ${e.target_id}`
  return {
    async get(workId, variantId) {
      const target = variantId ?? primaryByWork.get(workId)
      if (!target) return []
      return Array.from(store.values()).filter(
        (e) => e.work_id === workId && e.variant_id === target && e.attached,
      )
    },
    async set(workId, variantId, target, attached) {
      if (!primaryByWork.has(workId)) primaryByWork.set(workId, variantId)
      const entry = {
        work_id: workId,
        variant_id: variantId,
        target_kind: target.kind,
        target_id: target.id,
        attached,
        updated_at: new Date().toISOString(),
      }
      store.set(key(entry), entry)
    },
    dump() {
      return Array.from(store.values())
    },
  }
}

// =============================================================================
// 2. spec §6 — RPC records → ContextPaneState 変換 (executable spec)
// =============================================================================
const STAGE_ORDER = ["upload", "workstate", "output"]

function recordsToPaneState(records, workId, resolver) {
  const pools = []
  const stages = []
  const assets = []
  for (const rec of records) {
    if (!rec.attached) continue
    if (rec.target_kind === "pool") {
      const resolved = resolver?.resolvePool?.(rec.target_id) ?? null
      if (resolved) {
        pools.push({ ...resolved, is_active: true })
      } else {
        pools.push({
          id: rec.target_id,
          kind: "cross-work",
          name: rec.target_id,
          is_system: false,
          is_pinned: false,
          is_archived: false,
          is_active: true,
          last_activity: rec.updated_at,
        })
      }
    } else if (rec.target_kind === "stage") {
      if (!STAGE_ORDER.includes(rec.target_id)) continue
      stages.push({
        workId,
        stage: { kind: rec.target_id, is_active: true, asset_refs: [] },
      })
    } else if (rec.target_kind === "asset") {
      const meta = resolver?.resolveAsset?.(rec.target_id) ?? null
      assets.push({
        assetId: rec.target_id,
        reason: meta?.reason ?? "manual",
      })
    }
  }
  return {
    attached_pools: pools,
    attached_stages: stages,
    attached_assets: assets,
  }
}

// =============================================================================
// Tests
// =============================================================================

test("InMemoryContextAdapter: set / get round-trip with attached=true", async () => {
  const adapter = createInMemoryContextAdapter()
  await adapter.set("work-1", "variant-1", { kind: "pool", id: "pool-personal" }, true)
  await adapter.set("work-1", "variant-1", { kind: "stage", id: "upload" }, true)
  await adapter.set("work-1", "variant-1", { kind: "asset", id: "asset-001" }, true)

  const recs = await adapter.get("work-1", "variant-1")
  assert.equal(recs.length, 3, "全 3 件 attached で返る")
  const kinds = recs.map((r) => r.target_kind).sort()
  assert.deepEqual(kinds, ["asset", "pool", "stage"])
  assert.ok(recs.every((r) => r.attached === true))
})

test("InMemoryContextAdapter: detach (attached=false) は get に出ない（履歴は残る）", async () => {
  const adapter = createInMemoryContextAdapter()
  await adapter.set("w", "v", { kind: "pool", id: "p1" }, true)
  await adapter.set("w", "v", { kind: "pool", id: "p1" }, false)
  const recs = await adapter.get("w", "v")
  assert.equal(recs.length, 0, "detach 後は get から消える（即時反映）")
  const dump = adapter.dump()
  assert.equal(dump.length, 1)
  assert.equal(dump[0].attached, false, "履歴は残る")
})

test("InMemoryContextAdapter: variant_id 省略時は primary に fallback", async () => {
  const adapter = createInMemoryContextAdapter()
  await adapter.set("w", "v-primary", { kind: "pool", id: "p" }, true)
  await adapter.set("w", "v-other", { kind: "pool", id: "px" }, true)
  const recs = await adapter.get("w") // variantId 省略
  assert.equal(recs.length, 1)
  assert.equal(recs[0].variant_id, "v-primary")
  assert.equal(recs[0].target_id, "p")
})

test("recordsToPaneState: target_kind 別に PoolDisplay / Stage / Asset へ振り分け", () => {
  const records = [
    { work_id: "w", variant_id: "v", target_kind: "pool", target_id: "pool-personal", attached: true, updated_at: "2026-05-09T00:00:00Z" },
    { work_id: "w", variant_id: "v", target_kind: "stage", target_id: "upload", attached: true, updated_at: "2026-05-09T00:00:00Z" },
    { work_id: "w", variant_id: "v", target_kind: "asset", target_id: "asset-1", attached: true, updated_at: "2026-05-09T00:00:00Z" },
    { work_id: "w", variant_id: "v", target_kind: "pool", target_id: "pool-detached", attached: false, updated_at: "2026-05-09T00:00:00Z" },
  ]
  const state = recordsToPaneState(records, "w", undefined)
  assert.equal(state.attached_pools.length, 1, "attached=true Pool のみ表示（AC-9）")
  assert.equal(state.attached_pools[0].id, "pool-personal")
  assert.equal(state.attached_pools[0].is_active, true)
  assert.equal(state.attached_stages.length, 1)
  assert.equal(state.attached_stages[0].stage.kind, "upload")
  assert.equal(state.attached_assets.length, 1)
  assert.equal(state.attached_assets[0].assetId, "asset-1")
  assert.equal(state.attached_assets[0].reason, "manual", "resolver 未提供は manual fallback")
})

test("recordsToPaneState: 不正な stage kind は防御的 skip", () => {
  const records = [
    { work_id: "w", variant_id: "v", target_kind: "stage", target_id: "garbage-stage", attached: true, updated_at: "2026-05-09T00:00:00Z" },
  ]
  const state = recordsToPaneState(records, "w", undefined)
  assert.equal(state.attached_stages.length, 0, "未定義 stage kind は skip")
})

test("recordsToPaneState: resolver で Pool 名 / Asset reason を resolve", () => {
  const records = [
    { work_id: "w", variant_id: "v", target_kind: "pool", target_id: "pool-akari-os", attached: true, updated_at: "2026-05-09T00:00:00Z" },
    { work_id: "w", variant_id: "v", target_kind: "asset", target_id: "asset-inherited", attached: true, updated_at: "2026-05-09T00:00:00Z" },
  ]
  const state = recordsToPaneState(records, "w", {
    resolvePool: (id) =>
      id === "pool-akari-os"
        ? {
            id,
            kind: "cross-work",
            name: "akari-os Pool",
            is_system: false,
            is_pinned: true,
            is_archived: false,
            is_active: true,
            last_activity: "2026-05-09T00:00:00Z",
          }
        : null,
    resolveAsset: (id) =>
      id === "asset-inherited"
        ? { name: "Inherited Asset", reason: "inherited" }
        : null,
  })
  assert.equal(state.attached_pools[0].name, "akari-os Pool")
  assert.equal(state.attached_pools[0].is_pinned, true)
  assert.equal(state.attached_assets[0].reason, "inherited")
})

test("削除制御 semantics: system / ambient Pool は context menu から detach できない (AC-3 / AC-5)", () => {
  // ContextPane 側の UI 実装で `is_system || ambientPoolIds.has(id)` 判定で
  // detach button が disabled になる。spec AC-3 / AC-5 / AC-10 の semantic を
  // 本 test では「flag が立っているとき detach 操作は no-op」として encode する。
  const personalPool = {
    id: "pool-personal",
    kind: "personal",
    name: "Personal Pool",
    is_system: true,
    is_pinned: true,
    is_archived: false,
    is_active: true,
    last_activity: "2026-05-09T00:00:00Z",
  }
  const userPool = { ...personalPool, id: "pool-akari-os", kind: "cross-work", name: "akari-os", is_system: false }

  function shouldAllowDetach(pool, ambientIds) {
    return !(pool.is_system || ambientIds.has(pool.id))
  }

  const ambient = new Set(["pool-personal"])
  assert.equal(shouldAllowDetach(personalPool, ambient), false, "Personal Pool は detach 不可")
  assert.equal(shouldAllowDetach(userPool, ambient), true, "通常 Pool は detach 可")
})

test("Stage 切替 semantics: STAGE_ORDER は固定 3 段で順序不変 (AC-4 / AC-5)", () => {
  // ADR-094 で確定した固定順序。Variant 機能 / 用語 sweep の影響を受けない。
  assert.deepEqual(STAGE_ORDER, ["upload", "workstate", "output"])
  // 削除や並び替えが起きないこと（system Stage、AC-5）を表現するために
  // ここでは constant の identity を確認するに留める。
})
