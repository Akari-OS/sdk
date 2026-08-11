/**
 * tool-tier-gate — ADR-130（MCP Tool Surface Tiering）の discovery/実行 共通判定ロジック。
 *
 * 背景（gap-audit SEC-12）:
 *   従来の sidecar.ts は「discovery（tools/list）は listedToolNames で絞るが、
 *   CallTool は exposedToolNames 全件を受け付ける（後方互換維持）」という設計だった。
 *   これは tier で「非公開」にしたはずのツールも、名前さえ知っていれば実行できてしまう
 *   抜け穴になる。本モジュールは「今 discovery に出ている（ロード済みの）ツール集合」を
 *   単一のソース・オブ・トゥルースとして持ち、ListTools と CallTool の両方がこれを参照する
 *   ことで、判定ロジックの二重実装を避ける。
 *
 * ロード状態の初期値は listedToolNames（省略時は exposedToolNames 全件 = 後方互換）。
 * ADR-130 D-4 の遅延グループ（`<app>_load_group(name)`）は `loadGroup()` で
 * 実行時にロード済み集合へ追加する。
 */

import type { ToolDef } from "./protocol.ts"

export interface ToolTierGateOptions {
  toolDefs: ToolDef[]
  /** MCP として公開しうる全ツール名（tier に関わらずアプリが実装済みの範囲）。 */
  exposedToolNames: Set<string>
  /**
   * discovery に出す初期ツール名のサブセット。
   * 省略時は exposedToolNames 全件（tier 非対応・後方互換モード）。
   */
  listedToolNames?: string[]
  /**
   * ADR-130 D-4: 遅延グループ定義。キー=グループ名、値=解放するツール名一覧。
   * exposedToolNames に含まれない名前は無視する（グループ定義ミスの防御）。
   */
  toolGroups?: Record<string, string[]>
}

export interface LoadGroupResult {
  /** 今回の呼び出しで新たにロードされたツール名。 */
  loaded: string[]
  /** 既にロード済みだったツール名。 */
  alreadyLoaded: string[]
}

export interface ToolTierGate {
  /** discovery（tools/list）に返すべき ToolDef 一覧。CallTool もこれと同じ集合を参照する。 */
  listLoadedTools(): ToolDef[]
  /** 指定ツール名が「今すぐ呼び出せる」状態か（= discovery にも出ている）。 */
  isLoaded(name: string): boolean
  /** ADR-130 D-4: 名前解決で遅延グループをロード済み集合に追加する。未知のグループ名は null。 */
  loadGroup(groupName: string): LoadGroupResult | null
}

export function createToolTierGate(options: ToolTierGateOptions): ToolTierGate {
  const { toolDefs, exposedToolNames, listedToolNames, toolGroups } = options

  const exposedTools = toolDefs.filter((tool) => exposedToolNames.has(tool.name))

  const initialNames = listedToolNames ? new Set(listedToolNames) : exposedToolNames
  // ロード済み集合はミュータブル（loadGroup で成長する）。discovery/実行 共通の唯一のソース。
  const loadedToolNames = new Set(
    [...exposedToolNames].filter((name) => initialNames.has(name)),
  )

  return {
    listLoadedTools(): ToolDef[] {
      return exposedTools.filter((tool) => loadedToolNames.has(tool.name))
    },

    isLoaded(name: string): boolean {
      return loadedToolNames.has(name)
    },

    loadGroup(groupName: string): LoadGroupResult | null {
      const names = toolGroups?.[groupName]
      if (!names) return null

      const loaded: string[] = []
      const alreadyLoaded: string[] = []
      for (const name of names) {
        // exposedToolNames 外（グループ定義ミス）は静かに無視する。
        if (!exposedToolNames.has(name)) continue
        if (loadedToolNames.has(name)) {
          alreadyLoaded.push(name)
        } else {
          loadedToolNames.add(name)
          loaded.push(name)
        }
      }
      return { loaded, alreadyLoaded }
    },
  }
}
