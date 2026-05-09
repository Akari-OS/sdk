/**
 * @file lib/local-storage-style-extract-adapter.ts
 * AKARI-HUB-073 Phase 1 (T-5): LocalStorage backed StyleExtractAdapter stub。
 *
 * 用途:
 *   - shell-ui 単体での dev / preview（akari-agents 接続なし）
 *   - hook 単体テスト用（fake adapter）
 *   - HUB-073 Risk「extractor.rs（agents）未配線で UI が触れない」の軽減策
 *
 * 動作:
 *   - `extract()` は LocalStorage に保存された "シナリオ" を引いて返す
 *     (シナリオ未登録時は domain に応じた最小ダミー rule を 1〜2 件生成)
 *   - 結果は LocalStorage の `akari:hub-073:last-extract` キーに保存し、
 *     再ロード後も `loadLastExtract()` で取り出せる（dev で再現性確保）
 *
 * 既知の制約:
 *   - 実 LLM を呼ばない（あくまで shape 確認用）
 *   - SSR 環境では `localStorage` 不在のため in-memory fallback
 *
 * 関連:
 *   - types/style-extract.ts (StyleExtractAdapter interface)
 *   - akari-agents/src/style/extractor.ts (本番実装、Phase 2 で配線)
 */

import type { ExtractedRule, StyleDomain } from "../types/style"
import type {
  ExtractRulesRequest,
  ExtractRulesResponse,
  StyleExtractAdapter,
} from "../types/style-extract"

const SCENARIO_KEY = "akari:hub-073:scenario"
const LAST_EXTRACT_KEY = "akari:hub-073:last-extract"

/** dev preview で配信できる「擬似 extract 結果」のシナリオ。 */
export interface StyleExtractScenario {
  /** 返す rule（id 等は LocalStorage 保存時の sample で OK、adapter 側で再採番） */
  rules: Array<Pick<ExtractedRule, "rule" | "confidence">>
}

// =============================================================================
// Public API
// =============================================================================

/**
 * 公開 inspector を持つ拡張 adapter (テスト用 / dev 用)。
 */
export interface LocalStorageStyleExtractAdapter extends StyleExtractAdapter {
  /** 直近の extract 結果を取得（dev で再現性確保用） */
  loadLastExtract(): ExtractRulesResponse | null
  /** シナリオを差し替える（テストで rule 集合を制御するため） */
  setScenario(scenario: StyleExtractScenario): void
  /** 全消去（テスト reset 用） */
  clear(): void
}

/**
 * LocalStorage backed の StyleExtractAdapter を作る。
 *
 * @example
 *   const adapter = createLocalStorageStyleExtractAdapter()
 *   adapter.setScenario({ rules: [{ rule: 'rule-1', confidence: 0.9 }] })
 *   const r = await adapter.extract({ style_id, references, domain: 'writing' })
 *   // → r.extracted_rules[0].rule === 'rule-1'
 */
export function createLocalStorageStyleExtractAdapter(): LocalStorageStyleExtractAdapter {
  // SSR / node 環境への fallback として in-memory map を持つ
  const memory = new Map<string, string>()

  function getItem(key: string): string | null {
    if (typeof globalThis !== "undefined") {
      const ls = (globalThis as { localStorage?: Storage }).localStorage
      if (ls) {
        try {
          return ls.getItem(key)
        } catch {
          // ignore — fall through to memory
        }
      }
    }
    return memory.get(key) ?? null
  }

  function setItem(key: string, value: string): void {
    if (typeof globalThis !== "undefined") {
      const ls = (globalThis as { localStorage?: Storage }).localStorage
      if (ls) {
        try {
          ls.setItem(key, value)
          return
        } catch {
          // ignore — fall through to memory
        }
      }
    }
    memory.set(key, value)
  }

  function removeItem(key: string): void {
    if (typeof globalThis !== "undefined") {
      const ls = (globalThis as { localStorage?: Storage }).localStorage
      if (ls) {
        try {
          ls.removeItem(key)
        } catch {
          // ignore
        }
      }
    }
    memory.delete(key)
  }

  return {
    async extract(request: ExtractRulesRequest): Promise<ExtractRulesResponse> {
      // 空 reference は agents 側と同じく skip
      if (request.references.length === 0) {
        const empty: ExtractRulesResponse = {
          extracted_rules: [],
          reference_count: 0,
          skipped: true,
        }
        setItem(LAST_EXTRACT_KEY, JSON.stringify(empty))
        return empty
      }

      const scenarioRaw = getItem(SCENARIO_KEY)
      const scenario = scenarioRaw ? safeParseScenario(scenarioRaw) : null
      const sourceIds = request.references.map((r) => r.id)

      const candidates =
        scenario?.rules ?? defaultScenarioFor(request.domain).rules

      const extracted_rules: ExtractedRule[] = candidates.map((c, i) => ({
        id: `dev-rule-${i + 1}-${randomSuffix()}`,
        rule: c.rule,
        confidence: clamp(c.confidence, 0, 1),
        approved: false,
        source_assets: sourceIds,
      }))

      const response: ExtractRulesResponse = {
        extracted_rules,
        reference_count: request.references.length,
        skipped: false,
      }
      setItem(LAST_EXTRACT_KEY, JSON.stringify(response))
      return response
    },

    loadLastExtract(): ExtractRulesResponse | null {
      const raw = getItem(LAST_EXTRACT_KEY)
      if (!raw) return null
      try {
        return JSON.parse(raw) as ExtractRulesResponse
      } catch {
        return null
      }
    },

    setScenario(scenario: StyleExtractScenario): void {
      setItem(SCENARIO_KEY, JSON.stringify(scenario))
    },

    clear(): void {
      removeItem(SCENARIO_KEY)
      removeItem(LAST_EXTRACT_KEY)
    },
  }
}

// =============================================================================
// helpers
// =============================================================================

function safeParseScenario(raw: string): StyleExtractScenario | null {
  try {
    const parsed = JSON.parse(raw) as StyleExtractScenario
    if (!parsed || !Array.isArray(parsed.rules)) return null
    return parsed
  } catch {
    return null
  }
}

function defaultScenarioFor(domain: StyleDomain): StyleExtractScenario {
  switch (domain) {
    case "writing":
      return {
        rules: [
          { rule: "(dev stub) 一文を短く保ち、断定形で締める", confidence: 0.82 },
          { rule: "(dev stub) 漢字よりひらがなを優先する", confidence: 0.7 },
        ],
      }
    case "video":
      return {
        rules: [
          { rule: "(dev stub) 1 カット 3 秒以下のテンポを保つ", confidence: 0.78 },
        ],
      }
    case "design":
      return {
        rules: [
          { rule: "(dev stub) 余白を全要素で 24px 以上確保する", confidence: 0.75 },
        ],
      }
    case "voice":
      return {
        rules: [
          { rule: "(dev stub) フィラー (えーと等) を控え、間で代替する", confidence: 0.7 },
        ],
      }
    case "mixed":
    default:
      return {
        rules: [
          { rule: "(dev stub) ブランドカラーは #1a1a1a を主軸に統一する", confidence: 0.65 },
        ],
      }
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

function randomSuffix(): string {
  // crypto に依存せず軽量な suffix（dev stub 用、衝突回避は best-effort）
  return Math.random().toString(36).slice(2, 8)
}
