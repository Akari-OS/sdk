/**
 * @file partner.ts
 * Runtime + 型: Partner Agent（7 Reference Agents の "Partner"）との
 * Chat プロトコル契約。
 *
 * daemon 側 `partner_chat` / `partner_new_conversation` / `operator_publish`
 * 等の tool 応答形式を共通化。App がこの subpath の型を参照することで、
 * daemon ⇔ App 間の契約が SDK で一元化される。
 *
 * NOTE: `@akari-os/sdk/agent` は `AgentAPI` / `AgentSpec` 等の Agent 定義の
 * プロトコル型（`defineAgent()`）で、ここは partner chat の runtime 契約。
 *
 * @packageDocumentation
 */

/** サブエージェント委譲の記録 */
export interface Delegation {
  agent: string
  query: string
  result: string
}

/** `partner_chat` tool の JSON レスポンス */
export interface PartnerChatResponse {
  text: string
  delegations: Delegation[]
}

/** `partner_new_conversation` tool の応答 */
export interface PartnerNewConversationResult {
  conversationId: string
  agentId: string
}

/**
 * `akari://conversations/{id}` resource の 1 メッセージ shape。
 * daemon 側 `ConversationStore.getMessages` の戻り値と一致。
 */
export interface ConversationMessage {
  role: "user" | "assistant" | "system"
  content: string
  createdAt: number
}

/**
 * `operator_publish` tool の応答。daemon 側 PublishResult と同形。
 */
export interface PublishResult {
  status: "success" | "queued" | "failed" | "awaiting_approval"
  publishedAt?: string
  url?: string
  errorCode?: string
  errorMessage?: string
  retryCount?: number
}

/**
 * シンプルな非暗号学的 uuid 生成ヘルパ。
 * Conversation / message / context 等のフロント側 id 採番用。
 */
export function uuid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}
