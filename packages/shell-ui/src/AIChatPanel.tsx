/**
 * AIChatPanel — クロスアプリ共通 AI 対話パネル（骨格実装）。
 *
 * Writer / Design / Video 各アプリの AI Chat 実装を一本化するための共通コンポーネント。
 * 本ファイルでは「共通骨格」のみを提供する:
 *   - messages 表示（user / assistant / system を視覚区別）
 *   - auto-scroll（新規メッセージで最下部へ自動スクロール）
 *   - streaming 表示（loading インジケータ）
 *   - 入力欄 + Cmd+Enter 送信
 *   - renderExtension slot（writer の WorkflowBar 等 app 固有 UI 差し込み用）
 *   - contextProvider（アプリ固有のコンテキスト供給 callback）
 *
 * スコープ外（各アプリ側が担う）:
 *   - LLM API 呼び出し本体（onSendMessage callback に委譲）
 *   - メッセージ永続化（Pool / DB 側が担う）
 *   - スラッシュコマンドメニュー（Phase 3 以降）
 *   - セッション履歴 UI（Phase 3 以降）
 *
 * ChatMessage 型はここから export し、3 アプリの重複定義を一本化する。
 *
 * 設計指針:
 *   - モーダル禁止・画面遷移禁止（RULES.md ルール 9 / 11）
 *   - Tailwind dark テーマ。既存 shell-ui コンポーネントに揃える
 *
 * 関連 spec: AKARI-HUB-038 §6 (AIChatPanel)
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Send } from "lucide-react"
import { cn } from "./lib/cn"

// ─── 型 ────────────────────────────────────────────────────────────────────

/**
 * チャットメッセージ 1 件。
 * 3 アプリで重複定義されていた型を一本化する正典型定義。
 */
export interface ChatMessage {
  /** メッセージ固有 ID */
  id: string
  /** 発話者ロール */
  role: "user" | "assistant" | "system"
  /** 本文テキスト */
  content: string
  /** Unix 時刻 (ms)。省略可 */
  createdAt?: number
}

export interface AIChatPanelProps {
  /** 表示するメッセージ一覧 */
  messages: ChatMessage[]
  /**
   * 送信ハンドラ。Promise を返す。
   * resolve するまで loading 状態になる。
   */
  onSendMessage: (text: string) => Promise<void>
  /**
   * アプリ固有コンテキストを返す callback。
   * AIChatPanel はこの値を onSendMessage の前に呼ぶことができる（将来拡張）。
   * 現在は型定義のみ（実際の使用は各アプリ側で制御する）。
   */
  contextProvider?: () => unknown
  /**
   * 入力エリア上部に差し込む app 固有 UI（Writer の WorkflowBar 等）。
   * renderExtension が返す内容をそのまま描画する。
   */
  renderExtension?: () => ReactNode
  /** ルート要素の追加 className */
  className?: string
  /** 空メッセージ時のプレースホルダー文言（省略時はデフォルト文言） */
  emptyPlaceholder?: string
  /** 入力欄のプレースホルダー文言 */
  inputPlaceholder?: string
  /**
   * ヘッダ右端に表示する × ボタンのコールバック。
   * 指定するとヘッダに閉じるボタンが描画される。
   */
  onCollapse?: () => void
}

// ─── コンポーネント ────────────────────────────────────────────────────────

export function AIChatPanel({
  messages,
  onSendMessage,
  contextProvider: _contextProvider,
  renderExtension,
  className,
  emptyPlaceholder,
  inputPlaceholder,
  onCollapse,
}: AIChatPanelProps) {
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)

  // 新規メッセージ追加 / loading 変化時に最下部へ自動スクロール
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput("")
    setLoading(true)
    setError(null)

    try {
      await onSendMessage(text)
    } catch (e) {
      setError(`送信失敗: ${(e as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [input, loading, onSendMessage])

  const canSend = Boolean(input.trim()) && !loading

  return (
    <div
      className={cn(
        "h-full w-full min-w-0 flex flex-col gap-2 p-3 box-border bg-card",
        className,
      )}
    >
      {/* ヘッダ */}
      <div className="flex items-center justify-between shrink-0">
        <h3 className="m-0 text-[13px] font-semibold text-foreground">
          Partner
        </h3>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title="パネルを閉じる"
            aria-label="閉じる"
            className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/50 transition text-sm leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* app 固有拡張スロット（WorkflowBar 等） */}
      {renderExtension && (
        <div className="shrink-0">{renderExtension()}</div>
      )}

      {/* メッセージ一覧 */}
      <div
        ref={scrollRef}
        className={cn(
          "flex-1 min-h-0 p-2 rounded",
          "bg-muted/30 border border-border",
          "text-[12px] text-foreground",
          "overflow-auto flex flex-col gap-2",
        )}
      >
        {messages.length === 0 && !loading && (
          <p className="text-muted-foreground text-[12px] leading-relaxed">
            {emptyPlaceholder ??
              "Partner と対話できます。\n例:「IG ストーリー比率にして」「このテンプレで再構成」"}
          </p>
        )}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {loading && (
          <p className="text-[11px] text-muted-foreground italic">考え中...</p>
        )}

        {error && (
          <div className="text-[11px] text-red-300 p-1.5 bg-red-500/10 border border-red-500/30 rounded">
            {error}
          </div>
        )}
      </div>

      {/* 入力エリア */}
      <div className="flex gap-2 min-w-0 shrink-0">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void handleSend()
            }
          }}
          placeholder={inputPlaceholder ?? "メッセージを入力 (⌘+Enter で送信)"}
          rows={2}
          className={cn(
            "flex-1 min-w-0 p-1.5 text-[12px] font-[inherit]",
            "bg-muted/30 text-foreground",
            "border border-border rounded",
            "resize-none box-border",
          )}
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={() => void handleSend()}
          title="送信 (⌘+Enter)"
          className={cn(
            "px-3 py-1.5 text-[12px] rounded shrink-0",
            "flex items-center gap-1",
            "bg-primary text-primary-foreground border-none",
            "transition",
            canSend
              ? "cursor-pointer opacity-100"
              : "cursor-not-allowed opacity-40",
          )}
        >
          <Send className="w-3 h-3" />
          送信
        </button>
      </div>
    </div>
  )
}

// ─── MessageBubble ─────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage
}

function MessageBubble({ message }: MessageBubbleProps) {
  const { role, content } = message

  if (role === "system") {
    return (
      <div className="self-stretch text-[10px] text-muted-foreground/60 italic px-1">
        {content}
      </div>
    )
  }

  const isUser = role === "user"

  return (
    <div
      className={cn(
        "max-w-[85%] px-2.5 py-1.5 rounded-md text-[12px] leading-relaxed whitespace-pre-wrap break-words",
        isUser
          ? "self-end bg-primary text-primary-foreground"
          : "self-start bg-muted border border-border text-foreground",
      )}
    >
      {content}
    </div>
  )
}
