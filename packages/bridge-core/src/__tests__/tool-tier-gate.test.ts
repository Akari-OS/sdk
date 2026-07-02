import assert from "node:assert/strict"
import test from "node:test"

import type { ToolDef } from "../protocol.ts"
import { createToolTierGate } from "../tool-tier-gate.ts"

function toolDef(name: string): ToolDef {
  return { name, description: `${name} の説明`, inputSchema: { type: "object" } }
}

const toolDefs: ToolDef[] = [
  toolDef("video_get_state"),
  toolDef("video_split"),
  toolDef("video_color_grade"), // lazy（X tier）想定
  toolDef("video_lut_apply"), // lazy（X tier）想定
  toolDef("video_load_group"),
]

const allNames = toolDefs.map((tool) => tool.name)

test("listedToolNames 省略時は exposedToolNames 全件が discovery/実行可能（後方互換）", () => {
  const gate = createToolTierGate({
    toolDefs,
    exposedToolNames: new Set(allNames),
  })

  assert.deepEqual(
    gate.listLoadedTools().map((t) => t.name).sort(),
    [...allNames].sort(),
  )
  for (const name of allNames) {
    assert.equal(gate.isLoaded(name), true, `${name} は後方互換モードで常にロード済みのはず`)
  }
})

test("listedToolNames で絞った tier 外ツールは discovery にも実行判定にも出ない（SEC-12 の核）", () => {
  const gate = createToolTierGate({
    toolDefs,
    exposedToolNames: new Set(allNames),
    listedToolNames: ["video_get_state", "video_split", "video_load_group"],
    toolGroups: {
      color: ["video_color_grade", "video_lut_apply"],
    },
  })

  // discovery は core のみ
  assert.deepEqual(
    gate.listLoadedTools().map((t) => t.name).sort(),
    ["video_get_state", "video_load_group", "video_split"].sort(),
  )

  // 実行可否も discovery と同じ判定（同一ソース）
  assert.equal(gate.isLoaded("video_split"), true)
  assert.equal(gate.isLoaded("video_color_grade"), false)
  assert.equal(gate.isLoaded("video_lut_apply"), false)
})

test("loadGroup で未知のグループ名は null（discovery 側には一切影響しない）", () => {
  const gate = createToolTierGate({
    toolDefs,
    exposedToolNames: new Set(allNames),
    listedToolNames: ["video_get_state", "video_load_group"],
    toolGroups: { color: ["video_color_grade", "video_lut_apply"] },
  })

  assert.equal(gate.loadGroup("does-not-exist"), null)
  assert.equal(gate.isLoaded("video_color_grade"), false)
})

test("loadGroup でグループを解放すると、以後 discovery にも実行判定にも現れる", () => {
  const gate = createToolTierGate({
    toolDefs,
    exposedToolNames: new Set(allNames),
    listedToolNames: ["video_get_state", "video_load_group"],
    toolGroups: { color: ["video_color_grade", "video_lut_apply"] },
  })

  assert.equal(gate.isLoaded("video_color_grade"), false)

  const result = gate.loadGroup("color")
  assert.deepEqual(result?.loaded.sort(), ["video_color_grade", "video_lut_apply"].sort())
  assert.deepEqual(result?.alreadyLoaded, [])

  // ロード後は discovery・実行判定の両方に反映される（単一ソースであることの検証）
  assert.equal(gate.isLoaded("video_color_grade"), true)
  assert.equal(gate.isLoaded("video_lut_apply"), true)
  assert.ok(gate.listLoadedTools().some((t) => t.name === "video_color_grade"))

  // 2 回目は「既にロード済み」に分類される
  const second = gate.loadGroup("color")
  assert.deepEqual(second?.loaded, [])
  assert.deepEqual(second?.alreadyLoaded.sort(), ["video_color_grade", "video_lut_apply"].sort())
})

test("toolGroups に exposedToolNames 外の名前が混ざっていても無視される（グループ定義ミスの防御）", () => {
  const gate = createToolTierGate({
    toolDefs,
    exposedToolNames: new Set(["video_get_state", "video_load_group", "video_color_grade"]),
    listedToolNames: ["video_get_state", "video_load_group"],
    toolGroups: { color: ["video_color_grade", "video_nonexistent_tool"] },
  })

  const result = gate.loadGroup("color")
  assert.deepEqual(result?.loaded, ["video_color_grade"])
  assert.equal(gate.isLoaded("video_nonexistent_tool"), false)
})
