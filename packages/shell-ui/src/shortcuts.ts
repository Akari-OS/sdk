/**
 * @file shortcuts.ts
 * AKARI-HUB-088 §2-2 (S0-2): アプリ横断のショートカット登録 API。
 *
 * Video の `src/lib/shortcuts.ts`（module-global / app 固定）を、appId ごとの
 * per-instance factory に汎用化したもの。各アプリは
 *   const reg = createShortcutRegistry(appId, [...COMMON_SHORTCUTS, ...固有])
 * を呼ぶだけで、override 永続（localStorage）/ 競合検出 / 編集ダイアログが揃う。
 *
 * ShortcutDef.keys は文字列形式（"mod+shift+Z" / "Space" / "Delete"）。
 * 内部で Binding 構造体に parse して照合する。
 *   - mod   = ⌘(mac) / Ctrl(win/linux)（`e.metaKey || e.ctrlKey`）
 *   - shift / alt はそのまま
 *
 * Cmd+Esc（戻る）/ Cmd+K（コマンドパレット）は Shell 所有のため registry に含めない。
 *
 * 設計 SSOT: docs/design/creator-app-shell-standard-2026-06-03.md §7-2
 */

import {
  createElement as h,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type FC,
  type MouseEvent as ReactMouseEvent,
} from "react"

// ─── 型 ──────────────────────────────────────────────────────────────────────

export type ShortcutDef = {
  /** 一意 id（例: "undo" / "diagram.add_node"）。 */
  id: string
  /** バインド文字列（"mod+shift+Z" / "Space" / "Delete"）。空文字 = 未割当。 */
  keys: string
  /** 一覧表示用ラベル。 */
  label: string
  /** グループ名（ダイアログの見出し）。省略時は "general"。 */
  group?: string
  /** false を返す間は handleKeyDown で発火しない（モード依存ショートカット用）。 */
  when?: () => boolean
}

/** ShortcutsDialog コンポーネントの props（開閉制御）。 */
export type ShortcutsDialogProps = {
  open?: boolean
  onClose?: () => void
}

export type ShortcutRegistry = {
  /** 登録された定義（読み取り専用）。 */
  defs: ShortcutDef[]
  /** user override 込みの現バインドを表示文字列で返す hook（useSyncExternalStore）。 */
  useBinding(id: string): string
  /** ルート keydown で呼ぶ。マッチした def.id を返す（無ければ null）。preventDefault は呼び元の責務。 */
  handleKeyDown(e: KeyboardEvent): string | null
  /** バインドを上書き保存（keys 文字列。空文字で未割当）。 */
  setOverride(id: string, keys: string): void
  /** override を消して default に戻す。 */
  resetOverride(id: string): void
  /** 一覧 + 編集ダイアログ（共通 UI）。 */
  ShortcutsDialog: FC<ShortcutsDialogProps>
}

// ─── Binding プリミティブ（Video shortcuts.ts から移植） ──────────────────────

interface Binding {
  /** 正規化済みキー（英字は大文字、" " は "Space"）。 */
  key: string
  mod?: boolean
  shift?: boolean
  alt?: boolean
}

/** KeyboardEvent.key を正規化（英字は大文字、空白は "Space"）。 */
function normalizeKey(key: string): string {
  if (key === " ") return "Space"
  if (key.length === 1) return key.toUpperCase()
  return key
}

/** "mod+shift+Z" 形式の keys 文字列を Binding に parse。空文字 / 未割当は null。 */
function parseKeys(keys: string): Binding | null {
  const raw = keys.trim()
  if (!raw) return null
  const parts = raw.split("+").map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return null
  let mod = false
  let shift = false
  let alt = false
  let key: string | null = null
  for (const part of parts) {
    const lower = part.toLowerCase()
    if (lower === "mod" || lower === "cmd" || lower === "ctrl" || lower === "meta") {
      mod = true
    } else if (lower === "shift") {
      shift = true
    } else if (lower === "alt" || lower === "option" || lower === "opt") {
      alt = true
    } else {
      key = normalizeKey(part)
    }
  }
  if (!key) return null
  return { key, mod, shift, alt }
}

/** Binding を keys 文字列に戻す（capture した event を override 保存するとき用）。 */
function bindingToKeys(b: Binding | null): string {
  if (!b) return ""
  const tokens: string[] = []
  if (b.mod) tokens.push("mod")
  if (b.shift) tokens.push("shift")
  if (b.alt) tokens.push("alt")
  tokens.push(b.key)
  return tokens.join("+")
}

/** KeyboardEvent から Binding を生成（capture 用）。修飾キー単体は null。 */
function bindingFromEvent(e: KeyboardEvent): Binding | null {
  const key = normalizeKey(e.key)
  if (key === "Meta" || key === "Control" || key === "Shift" || key === "Alt" || key === "OS") {
    return null
  }
  return { key, mod: e.metaKey || e.ctrlKey, shift: e.shiftKey, alt: e.altKey }
}

/** event が binding にマッチするか。 */
function matchBinding(binding: Binding | null, e: KeyboardEvent): boolean {
  if (!binding) return false
  if (normalizeKey(e.key) !== binding.key) return false
  if (Boolean(binding.mod) !== (e.metaKey || e.ctrlKey)) return false
  if (Boolean(binding.shift) !== e.shiftKey) return false
  if (Boolean(binding.alt) !== e.altKey) return false
  return true
}

/** 2 つの binding が等価か。 */
function bindingsEqual(a: Binding | null, b: Binding | null): boolean {
  if (!a || !b) return a === b
  return (
    a.key === b.key &&
    Boolean(a.mod) === Boolean(b.mod) &&
    Boolean(a.shift) === Boolean(b.shift) &&
    Boolean(a.alt) === Boolean(b.alt)
  )
}

function isMacLike(): boolean {
  if (typeof navigator === "undefined") return true
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || "")
}

function displayKey(key: string): string {
  switch (key) {
    case "ArrowLeft":
      return "←"
    case "ArrowRight":
      return "→"
    case "ArrowUp":
      return "↑"
    case "ArrowDown":
      return "↓"
    default:
      return key
  }
}

/** Binding を表示文字列に整形（例: "⌘⇧Z"）。 */
function formatBinding(binding: Binding | null): string {
  if (!binding) return "未割当"
  const tokens: string[] = []
  if (binding.mod) tokens.push(isMacLike() ? "⌘" : "Ctrl")
  if (binding.shift) tokens.push(isMacLike() ? "⇧" : "Shift")
  if (binding.alt) tokens.push(isMacLike() ? "⌥" : "Alt")
  tokens.push(displayKey(binding.key))
  return tokens.join(isMacLike() ? "" : "+")
}

// ─── 横断共通ショートカット（§5-3） ──────────────────────────────────────────

/**
 * 全アプリ共通のバインド。各アプリは
 *   createShortcutRegistry(appId, [...COMMON_SHORTCUTS, ...固有])
 * で取り込む。Cmd+Esc / Cmd+K は Shell 所有のため含めない。
 */
export const COMMON_SHORTCUTS: ShortcutDef[] = [
  { id: "undo", keys: "mod+Z", label: "元に戻す", group: "common" },
  { id: "redo", keys: "mod+shift+Z", label: "やり直し", group: "common" },
  { id: "play", keys: "Space", label: "再生 / 一時停止", group: "common" },
  { id: "save", keys: "mod+S", label: "保存", group: "common" },
  { id: "export", keys: "mod+E", label: "書き出し", group: "common" },
  { id: "copy", keys: "mod+C", label: "コピー", group: "common" },
  { id: "paste", keys: "mod+V", label: "ペースト", group: "common" },
]

// ─── factory ─────────────────────────────────────────────────────────────────

type Overrides = Record<string, string | null>

/**
 * appId ごとの shortcut registry を生成する。
 * override は localStorage["akari.<appId>.shortcuts.v1"] に永続。
 */
export function createShortcutRegistry(
  appId: string,
  defs: ShortcutDef[],
): ShortcutRegistry {
  const STORAGE_KEY = `akari.${appId}.shortcuts.v1`
  const CHANGE_EVENT = `akari:${appId}:shortcuts-changed`
  const defById = new Map(defs.map((d) => [d.id, d]))

  function readOverrides(): Overrides {
    if (typeof window === "undefined") return {}
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === "object") return parsed as Overrides
    } catch {
      // 破損時は無視
    }
    return {}
  }

  function computeBindings(overrides: Overrides): Record<string, Binding | null> {
    const out: Record<string, Binding | null> = {}
    for (const def of defs) {
      const keys = def.id in overrides ? overrides[def.id] : def.keys
      out[def.id] = parseKeys(keys ?? "")
    }
    return out
  }

  // snapshot キャッシュ（useSyncExternalStore の ref equality 用）
  let overrides = readOverrides()
  let bindings = computeBindings(overrides)

  const listeners = new Set<() => void>()

  function emit(): void {
    bindings = computeBindings(overrides)
    for (const cb of listeners) cb()
  }

  function persist(): void {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
    } catch {
      // quota 等は無視
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT))
    }
  }

  // 別タブからの localStorage 変更にも追従
  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) {
        overrides = readOverrides()
        emit()
      }
    })
  }

  function subscribe(cb: () => void): () => void {
    listeners.add(cb)
    return () => {
      listeners.delete(cb)
    }
  }

  function setOverride(id: string, keys: string): void {
    if (!defById.has(id)) return
    overrides = { ...overrides, [id]: keys }
    persist()
    emit()
  }

  function resetOverride(id: string): void {
    if (!(id in overrides)) return
    const next = { ...overrides }
    delete next[id]
    overrides = next
    persist()
    emit()
  }

  function handleKeyDown(e: KeyboardEvent): string | null {
    for (const def of defs) {
      if (def.when && !def.when()) continue
      if (matchBinding(bindings[def.id], e)) return def.id
    }
    return null
  }

  function useBinding(id: string): string {
    const snap = useSyncExternalStore(
      subscribe,
      () => bindings,
      () => bindings,
    )
    return formatBinding(snap[id] ?? null)
  }

  /** 同一バインドを持つ別 def を探す（競合検出）。 */
  function findConflict(binding: Binding | null, excludeId: string): ShortcutDef | null {
    if (!binding) return null
    for (const def of defs) {
      if (def.id === excludeId) continue
      if (bindingsEqual(bindings[def.id], binding)) return def
    }
    return null
  }

  const ShortcutsDialog: FC<ShortcutsDialogProps> = ({ open = true, onClose }) => {
    const snap = useSyncExternalStore(
      subscribe,
      () => bindings,
      () => bindings,
    )
    const [capturingId, setCapturingId] = useState<string | null>(null)
    const [conflictMsg, setConflictMsg] = useState<string | null>(null)

    // 編集中: 次の keydown を capture して override 保存
    useEffect(() => {
      if (!capturingId) return
      const onKey = (e: KeyboardEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.key === "Escape") {
          setCapturingId(null)
          setConflictMsg(null)
          return
        }
        const b = bindingFromEvent(e)
        if (!b) return // 修飾キー単体は無視（押し続けて本キーを待つ）
        const conflict = findConflict(b, capturingId)
        if (conflict) {
          setConflictMsg(`「${formatBinding(b)}」は「${conflict.label}」と競合します`)
          return
        }
        setOverride(capturingId, bindingToKeys(b))
        setCapturingId(null)
        setConflictMsg(null)
      }
      window.addEventListener("keydown", onKey, true)
      return () => window.removeEventListener("keydown", onKey, true)
    }, [capturingId])

    const handleClose = useCallback(() => {
      setCapturingId(null)
      setConflictMsg(null)
      onClose?.()
    }, [onClose])

    if (!open) return null

    // group ごとにまとめる（出現順を維持）
    const groups: { name: string; items: ShortcutDef[] }[] = []
    const groupIndex = new Map<string, number>()
    for (const def of defs) {
      const g = def.group ?? "general"
      let idx = groupIndex.get(g)
      if (idx === undefined) {
        idx = groups.length
        groupIndex.set(g, idx)
        groups.push({ name: g, items: [] })
      }
      groups[idx].items.push(def)
    }

    return h(
      "div",
      {
        className:
          "fixed inset-0 z-50 flex items-center justify-center bg-black/50",
        onClick: handleClose,
        role: "dialog",
        "aria-modal": true,
        "aria-label": "キーボードショートカット",
      },
      h(
        "div",
        {
          className:
            "max-h-[80vh] w-[min(480px,90vw)] overflow-y-auto rounded-lg border border-border bg-card p-4 shadow-xl",
          onClick: (e: ReactMouseEvent) => e.stopPropagation(),
        },
        h(
          "div",
          { className: "mb-3 flex items-center justify-between" },
          h("h2", { className: "text-sm font-semibold text-foreground" }, "キーボードショートカット"),
          h(
            "button",
            {
              type: "button",
              className:
                "rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              onClick: handleClose,
            },
            "閉じる",
          ),
        ),
        conflictMsg &&
          h(
            "div",
            {
              className:
                "mb-2 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive",
            },
            conflictMsg,
          ),
        ...groups.map((group) =>
          h(
            "div",
            { key: group.name, className: "mb-3" },
            h(
              "div",
              { className: "mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground" },
              group.name,
            ),
            ...group.items.map((def) => {
              const isCapturing = capturingId === def.id
              return h(
                "div",
                {
                  key: def.id,
                  className:
                    "flex items-center justify-between gap-2 rounded px-2 py-1 hover:bg-muted/30",
                },
                h("span", { className: "min-w-0 flex-1 truncate text-xs text-foreground" }, def.label),
                h(
                  "button",
                  {
                    type: "button",
                    className: isCapturing
                      ? "rounded border border-primary bg-primary/10 px-2 py-0.5 text-xs text-primary"
                      : "rounded border border-border bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground hover:border-primary hover:text-foreground",
                    onClick: () => {
                      setConflictMsg(null)
                      setCapturingId(isCapturing ? null : def.id)
                    },
                    title: "クリックして新しいキーを入力（Esc で取消）",
                  },
                  isCapturing ? "キー入力待ち…" : formatBinding(snap[def.id] ?? null),
                ),
                def.id in overrides &&
                  h(
                    "button",
                    {
                      type: "button",
                      className: "rounded px-1 text-[10px] text-muted-foreground hover:text-foreground",
                      onClick: () => resetOverride(def.id),
                      title: "既定に戻す",
                    },
                    "↺",
                  ),
              )
            }),
          ),
        ),
      ),
    )
  }

  return {
    defs,
    useBinding,
    handleKeyDown,
    setOverride,
    resetOverride,
    ShortcutsDialog,
  }
}
