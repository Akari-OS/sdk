/**
 * @file models.ts
 * Runtime: LLM モデルカタログ（OpenRouter 経由）。
 *
 * ModelSelector / Settings / CommandPalette 等 app 側 UI の土台。
 * 無料 + 激安モデル中心（Claude / GPT 等の高額モデルは扱わない）。
 *
 * stats はレーダーチャート比較用の主観値（0-5）。
 *
 * @packageDocumentation
 */

/** AI モデル情報 */
export interface ModelInfo {
  /** OpenRouter モデル ID */
  id: string
  /** 表示名 */
  name: string
  /** プロバイダ名（"Google" "Z.ai" 等） */
  provider: string
  /** 無料モデルかどうか */
  isFree: boolean
  /** 入力 1K トークンあたりコスト (USD)。free は 0 */
  costPer1kInput: number
  /** 出力 1K トークンあたりコスト (USD)。free は 0 */
  costPer1kOutput: number
  /** コンテキストウィンドウ (tokens) */
  contextWindow: number
  /** 1 行説明 */
  description: string
  /** レーダーチャート用の主観値（各 0-5） */
  stats: {
    speed: number
    quality: number
    reasoning: number
    creativity: number
    cost: number
  }
}

/** レーダーチャート軸の日本語ラベル */
export const STAT_LABEL_JA: Record<keyof ModelInfo["stats"], string> = {
  speed: "速度",
  quality: "品質",
  reasoning: "推論",
  creativity: "創造性",
  cost: "コスパ",
}

/** 対応モデル一覧 */
export const MODELS: ModelInfo[] = [
  {
    id: "google/gemma-3-27b-it",
    name: "Gemma 3 27B",
    provider: "Google",
    isFree: false,
    costPer1kInput: 0.0001,
    costPer1kOutput: 0.0002,
    contextWindow: 96000,
    description: "Google の軽量高性能モデル。激安でレート制限なし。",
    stats: { speed: 5, quality: 3, reasoning: 3, creativity: 3, cost: 5 },
  },
  {
    id: "google/gemma-3-27b-it:free",
    name: "Gemma 3 27B (Free)",
    provider: "Google",
    isFree: true,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    contextWindow: 96000,
    description: "無料版。上流レート制限で失敗しやすい。お試し向き。",
    stats: { speed: 4, quality: 3, reasoning: 3, creativity: 3, cost: 5 },
  },
  {
    id: "z-ai/glm-4.6",
    name: "GLM 4.6",
    provider: "Z.ai",
    isFree: false,
    costPer1kInput: 0.0006,
    costPer1kOutput: 0.0022,
    contextWindow: 200000,
    description: "安価で高性能。コーディング・構造化出力が得意。",
    stats: { speed: 4, quality: 4, reasoning: 4, creativity: 3, cost: 4 },
  },
  {
    id: "qwen/qwen-2.5-72b-instruct",
    name: "Qwen 2.5 72B",
    provider: "Alibaba",
    isFree: false,
    costPer1kInput: 0.00023,
    costPer1kOutput: 0.0004,
    contextWindow: 131072,
    description: "daemon デフォルト。速度・品質・コストのバランス型。",
    stats: { speed: 4, quality: 4, reasoning: 3, creativity: 3, cost: 5 },
  },
  {
    id: "deepseek/deepseek-chat-v3-0324",
    name: "DeepSeek V3",
    provider: "DeepSeek",
    isFree: false,
    costPer1kInput: 0.00027,
    costPer1kOutput: 0.0011,
    contextWindow: 64000,
    description: "激安で推論力が高い。ロジック系タスクに強い。",
    stats: { speed: 3, quality: 4, reasoning: 5, creativity: 3, cost: 5 },
  },
  {
    id: "meta-llama/llama-3.3-70b-instruct:free",
    name: "Llama 3.3 70B (Free)",
    provider: "Meta",
    isFree: true,
    costPer1kInput: 0,
    costPer1kOutput: 0,
    contextWindow: 131072,
    description: "Meta の無料大型モデル。汎用チャット向き。",
    stats: { speed: 3, quality: 4, reasoning: 4, creativity: 4, cost: 5 },
  },
  {
    id: "z-ai/glm-4.5-air",
    name: "GLM 4.5 Air",
    provider: "Z.ai",
    isFree: false,
    costPer1kInput: 0.00015,
    costPer1kOutput: 0.0005,
    contextWindow: 128000,
    description: "GLM 4.6 の軽量版。汎用・激安でサブ用途に最適。",
    stats: { speed: 5, quality: 3, reasoning: 3, creativity: 3, cost: 5 },
  },
  {
    id: "google/gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "Google",
    isFree: false,
    costPer1kInput: 0.0003,
    costPer1kOutput: 0.0025,
    contextWindow: 1000000,
    description: "Google 公式・スピード最強。1M コンテキストで長文処理に強い。",
    stats: { speed: 5, quality: 4, reasoning: 4, creativity: 3, cost: 4 },
  },
  {
    id: "qwen/qwen3-30b-a3b",
    name: "Qwen3 30B A3B",
    provider: "Alibaba",
    isFree: false,
    costPer1kInput: 0.0001,
    costPer1kOutput: 0.0004,
    contextWindow: 131072,
    description: "新世代 MoE モデル。日本語が強く、激安で汎用性が高い。",
    stats: { speed: 4, quality: 4, reasoning: 4, creativity: 4, cost: 5 },
  },
]

/** デフォルトのモデル ID（daemon 側のデフォルトと一致させる） */
export const DEFAULT_MODEL_ID = "qwen/qwen-2.5-72b-instruct"

/** ID からモデル情報を取得 */
export function getModelById(id: string): ModelInfo | undefined {
  return MODELS.find((m) => m.id === id)
}
