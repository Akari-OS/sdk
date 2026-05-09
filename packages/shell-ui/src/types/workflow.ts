/**
 * @file types/workflow.ts
 * AKARI-HUB-072 Phase 1 (T-1): Workflow / Step / Trace の Hub 共有 TS types。
 *
 * ADR-094 で確定した 6 概念モデル（Pool / Work / Stage / Trace / Workflow /
 * Checkpoint）のうち、Workflow / Step / Trace に関する shape を定義する。
 * spec-workflow-checkpoint-context-budget-learning-loop.md §6 Data Models が
 * 正典 — 本ファイルはその TS 表現で、Workflow Editor / Checkpoint UI /
 * ContextBudgetBar / Workflow Engine（akari-agents）/ Trace 永続化（pool-impl）
 * いずれからも import される。
 *
 * 関連:
 *   - spec: akari-os/docs/sdd/specs/spec-workflow-checkpoint-context-budget-learning-loop.md
 *           §6 Data Models（Workflow / Step / Trace）
 *   - ADR-094 (6 概念モデル + Asset Tier + Workflow Learning Loop — 親 ADR)
 *   - ADR-078 v0.2.0 (Variant 並列創作ブランチ — parallel Step → 新規 Variant 自動生成)
 *   - ADR-080 (3 段スキル骨格 — Skill と Workflow Step.tool の関係)
 *   - ADR-095 (Style as Asset Subtype — Step の `style_ref` 受け入れ)
 *   - AKARI-HUB-074 (pool-impl schema migration — `traces.variant_id` 列を含む永続化層)
 *
 * 注意:
 *   - 本ファイルは型定義のみ（runtime / I/O は持たない）。
 *   - `parallel` Step の **schema** は v0.2.0 で確定済（aggregation / variant_strategy）。
 *     **実装着手** は v0.3.0 候補（spec §4 Out of Scope 参照）。
 *   - `branch` Step は v0.3.0+ 候補で本ファイルに含めない（spec §4 Out of Scope）。
 *   - Variant 連携（current_variant 受け取り）は engine 側で扱う API レイヤの話で、
 *     本ファイルは Workflow / Step / Trace 構造のみ定義する。
 */

// ---------------------------------------------------------------------------
// Step union
// ---------------------------------------------------------------------------

/**
 * Checkpoint UI 種別。
 *
 *   - 'inline-edit' : Step 出力をテキスト編集して次 Step に渡す（自由編集）
 *   - 'list-select' : 提示された候補から 1 つ選んで次 Step に渡す（離散選択）
 *
 * 一画面化原則（RULES.md ルール 9 / 11）に従い、いずれもモーダルではなく
 * Workflow パネル内の inline 表示で実装する（spec AC-8）。
 */
export type CheckpointUI = "inline-edit" | "list-select"

/**
 * `parallel` Step の集約セマンティクス（v0.2.0 schema）。
 * TAKT 分析（docs/research/takt-workflow-orchestration-analysis-2026.md）より。
 *
 *   - 'all'      : 全 branch 完了を待つ（既定）
 *   - 'any'      : 最初に成功した branch で進む（race）
 *   - 'majority' : 過半数の成功で進む
 *   - 'min'      : N 件以上成功で進む（`n` で指定）
 *
 * 実装着手は v0.3.0 候補だが、schema は v0.2.0 で確定済（HUB-072 v0.2.0）。
 */
export type ParallelAggregation =
  | { kind: "all" }
  | { kind: "any" }
  | { kind: "majority" }
  | { kind: "min"; n: number }

/**
 * `parallel` Step の各 branch を新規 Variant として保存するかの戦略。
 * ADR-078 v0.2.0 連携 — parallel Step → 新規 Variant 自動生成の semantics。
 *
 *   - 'none'                       : 既定。Variant を作らず一時実行
 *   - 'create-variants'            : 各 branch を新規 Variant として保存
 *   - 'create-variants-aggregate'  : Variant 作成 + aggregation 結果を `primary` 指定で
 *                                    どれを primary に昇格させるかを決める
 *     - 'first-success'  : 最初に成功した branch を primary に
 *     - 'highest-score'  : スコア（評価関数）最高の branch を primary に
 */
export type ParallelVariantStrategy =
  | { kind: "none" }
  | { kind: "create-variants" }
  | {
      kind: "create-variants-aggregate"
      primary: "first-success" | "highest-score"
    }

/**
 * Workflow を構成する Step の union 型。
 * MVP（v0.1.0）は 'tool' / 'checkpoint' / 'sub_workflow' の 3 種を実装。
 * 'parallel' は schema を v0.2.0 で確定（実装は v0.3.0 候補）。
 *
 * 共通フィールド:
 *   - id              : Step ID（Workflow 内 unique）
 *   - estimated_tokens: Context Budget の集計対象（Tool API は T-7、checkpoint /
 *                       sub_workflow / parallel は子要素から算出するか手動指定）
 */
export type Step =
  /**
   * Tool 呼び出し Step。
   *   - tool         : Tool / Skill ID（snake_case の dotted。例 "writer.generate_draft"）
   *   - agent        : 実行 agent（research / video / design / writer / voice / scheduler 等）
   *   - style_ref    : 参照する Style Asset ID（ADR-095）
   *   - params       : Tool 固有 parameters（schema は Tool 側で validate）
   */
  | {
      id: string
      type: "tool"
      tool: string
      agent?: string
      style_ref?: string
      estimated_tokens: number
      params?: Record<string, unknown>
    }
  /**
   * Human-in-loop Checkpoint Step。
   *   - prompt           : 人間に提示するメッセージ
   *   - ui               : 'inline-edit' | 'list-select'（一画面化原則で必ず inline 表示）
   *   - input            : 直前 Step の出力をどう Checkpoint に渡すかの参照（任意）
   *   - blocking         : 必ず true（MVP は async checkpoint 非対応 — spec §10 OQ）
   *   - estimated_tokens : Checkpoint で人間応答を待つ間の context 量推定
   */
  | {
      id: string
      type: "checkpoint"
      prompt: string
      ui: CheckpointUI
      input?: string
      blocking: true
      estimated_tokens: number
    }
  /**
   * Sub-Workflow 呼び出し Step（再帰合成）。
   *   - workflow    : 呼び出す Workflow ID
   *   - agent       : 実行 agent override（任意）
   *   - version_pin : Workflow version 固定（未指定なら latest、spec §9 Risks 参照）
   */
  | {
      id: string
      type: "sub_workflow"
      workflow: string
      agent?: string
      version_pin?: string
      estimated_tokens: number
    }
  /**
   * Parallel Step（schema は v0.2.0 確定 / 実装は v0.3.0 候補）。
   *   - branches         : 並列実行する Step 群
   *   - aggregation      : 完了判定セマンティクス
   *   - variant_strategy : ADR-078 v0.2.0 連携 — branch を Variant 化するか
   */
  | {
      id: string
      type: "parallel"
      branches: Step[]
      aggregation: ParallelAggregation
      variant_strategy?: ParallelVariantStrategy
      estimated_tokens: number
    }

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

/**
 * Workflow Learning Loop の changelog 1 entry。
 * 旧 version → 新 version の差分要約と承認情報を記録（spec AC-18 / AC-20）。
 */
export interface ChangelogEntry {
  /** 新 version semver（例: "0.2.0"） */
  version: string
  /** 旧 version semver（root version は null） */
  parent_version: string | null
  /** ISO 8601 承認時刻 */
  approved_at: string
  /** 承認者（user ID / agent ID） */
  approved_by: string
  /** 改善内容のサマリ（人間可読、LLM 提案 → 人間承認の 1 行要約） */
  summary: string
  /**
   * 学習素材になった Trace IDs（Trace.promoted_to_learning が true のもの）。
   * Workflow.trace_refs と整合する subset。
   */
  trace_refs: string[]
}

/**
 * Workflow（Step テンプレート）。Asset.type === 'workflow' の専用 schema。
 *
 * spec §6 Data Models が正典:
 *   - scope                     : 'leaf' | 'orchestration'（leaf = 末端 / orchestration = 上位）
 *   - version / parent_version  : semver chain（Learning Loop で増える）
 *   - trace_refs                : 学習素材になった Trace IDs（Workflow を進化させた根拠）
 *   - context_budget            : 推奨 token 上限（実行前に Step 別 + 累積で UI に表示）
 *   - max_steps                 : **必須**（既定 100）。再帰 sub_workflow 含む step 上限
 *   - steps                     : 順序付き Step 列
 *   - changelog                 : version 更新の履歴
 */
export interface Workflow {
  /** Workflow ID（UUID 等） */
  id: string
  /** Asset.type と整合する固定値 */
  type: "workflow"
  /** 'leaf' = 末端 Workflow / 'orchestration' = 他 Workflow を組み合わせる上位 */
  scope: "leaf" | "orchestration"
  /** semver（例: "0.1.0"） */
  version: string
  /** 親 version semver（root は null） */
  parent_version: string | null
  /**
   * 学習素材になった Trace IDs。
   * Workflow Learning Loop（spec AC-20）で trace 蓄積 → 改善提案 → version up の経路で
   * 新 version 作成に使われた Trace ID 群を記録する。
   */
  trace_refs: string[]
  /**
   * 推奨 context budget（token 数）。
   * UI（ContextBudgetBar）が `Σ steps[i].estimated_tokens` と比較し、
   * 超過時は警告 + summary mode 提案を出す（spec AC-9〜AC-12）。
   */
  context_budget: number
  /**
   * **必須**（既定 100、ADR-094 / TAKT 分析）。
   * 再帰 sub_workflow を含む実行 step 数の上限。
   * 達したら明示エラーで停止（spec AC-4b）。
   */
  max_steps: number
  /** 実行順 Step 列 */
  steps: Step[]
  /** version chain の changelog（spec AC-18 / AC-20） */
  changelog: ChangelogEntry[]
}

// ---------------------------------------------------------------------------
// Trace
// ---------------------------------------------------------------------------

/**
 * Workflow 実行中の 1 Step イベント。
 * spec §6 Data Models が正典:
 *   - step_id        : Step ID
 *   - step_type      : Step 種別（'tool' | 'checkpoint' | 'sub_workflow' | 'parallel'）
 *   - timestamp      : ISO 8601 イベント時刻
 *   - input / output : 入力 / 出力（任意 unknown — Tool 側で型保証）
 *   - human_response : Checkpoint で人間が返した応答（checkpoint Step の場合のみ）
 *   - duration_ms    : Step 実行時間（ms）
 */
export interface TraceEvent {
  step_id: string
  step_type: Step["type"]
  timestamp: string
  input?: unknown
  output?: unknown
  /** Checkpoint Step の場合の人間応答（spec §6 / AC-7） */
  human_response?: unknown
  duration_ms: number
}

/**
 * Workflow 1 回分の実行 Trace。
 * (Work, Variant) ペア単位で保存（ADR-078 v0.2.0 / HUB-074 `traces.variant_id` 列）。
 *
 * spec §6 Data Models が正典:
 *   - work_id              : 親 Work ID
 *   - workflow_id / version: 実行した Workflow とその version
 *   - events               : 時系列 TraceEvent
 *   - started_at           : ISO 8601 開始時刻
 *   - finished_at          : ISO 8601 終了時刻（実行中は null）
 *   - archived_at          : TTL 経過で archive された時刻（既定 90 日 / spec AC-15）
 *   - promoted_to_learning : Learning に使われたら true で永続化（spec AC-15）
 */
export interface Trace {
  /** Trace ID (UUID) */
  id: string
  /** 親 Work ID */
  work_id: string
  /** 実行した Workflow ID */
  workflow_id: string
  /** 実行時の Workflow version semver */
  workflow_version: string
  /** 時系列 Step イベント */
  events: TraceEvent[]
  /** ISO 8601 開始時刻 */
  started_at: string
  /** ISO 8601 終了時刻（実行中 / suspend 中は null） */
  finished_at: string | null
  /** TTL 経過で archive された時刻（既定 90 日 / spec AC-15） */
  archived_at: string | null
  /** Learning 素材になった Trace は永続化（spec AC-15） */
  promoted_to_learning: boolean
}
