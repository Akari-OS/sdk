/**
 * AKARI-HUB-088 §3 (S0-6): scaffold 共通契約の回帰ロック（純ロジック分）。
 * dist からビルド済み JS を import する（`pnpm build` 前提）。
 * React/DOM を要するコンポーネント（AppLayout / ShortcutsDialog UI）は対象外。
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { COMMON_SHORTCUTS, createShortcutRegistry } from "../dist/shortcuts.js"

/** 最小の KeyboardEvent ライク。matchBinding は key / metaKey / ctrlKey / shiftKey / altKey のみ参照。 */
function evt(key, mods = {}) {
  return {
    key,
    metaKey: !!mods.mod,
    ctrlKey: false,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
  }
}

test("AC-2: COMMON_SHORTCUTS は横断バインドを公開し Shell 所有キーは含まない", () => {
  const ids = new Set(COMMON_SHORTCUTS.map((d) => d.id))
  for (const id of ["undo", "redo", "play", "save", "export", "copy", "paste"]) {
    assert.ok(ids.has(id), `COMMON_SHORTCUTS に ${id} がない`)
  }
  // Cmd+K（コマンドパレット）/ Cmd+Esc（戻る）は Shell 所有 → registry に含めない
  assert.ok(!ids.has("commandPalette"))
  assert.ok(!ids.has("back"))
})

test("AC-2: createShortcutRegistry.handleKeyDown が keys 文字列を正しく照合する", () => {
  const reg = createShortcutRegistry("test_app", [...COMMON_SHORTCUTS])
  assert.equal(reg.handleKeyDown(evt("Z", { mod: true })), "undo")
  assert.equal(reg.handleKeyDown(evt("Z", { mod: true, shift: true })), "redo")
  assert.equal(reg.handleKeyDown(evt("S", { mod: true })), "save")
  assert.equal(reg.handleKeyDown(evt("Space")), "play")
  // 未登録キーは null
  assert.equal(reg.handleKeyDown(evt("Q")), null)
  // mod 無しの Z はどの common にもマッチしない
  assert.equal(reg.handleKeyDown(evt("Z")), null)
})

test("AC-2: when() が false の間はそのショートカットを発火させない", () => {
  let enabled = false
  const reg = createShortcutRegistry("test_gate", [
    { id: "x", keys: "X", label: "x", when: () => enabled },
  ])
  assert.equal(reg.handleKeyDown(evt("X")), null)
  enabled = true
  assert.equal(reg.handleKeyDown(evt("X")), "x")
})

test("AC-2: setOverride / resetOverride が binding を差し替え・復元する", () => {
  const reg = createShortcutRegistry("test_override", [
    { id: "save", keys: "mod+S", label: "save" },
  ])
  assert.equal(reg.handleKeyDown(evt("S", { mod: true })), "save")
  reg.setOverride("save", "mod+shift+S")
  assert.equal(reg.handleKeyDown(evt("S", { mod: true })), null)
  assert.equal(reg.handleKeyDown(evt("S", { mod: true, shift: true })), "save")
  reg.resetOverride("save")
  assert.equal(reg.handleKeyDown(evt("S", { mod: true })), "save")
})
