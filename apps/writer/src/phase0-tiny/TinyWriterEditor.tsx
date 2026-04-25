/**
 * @file TinyWriterEditor.tsx
 * AKARI Writer Phase 0 MVP ("Tiny Writer") — minimum viable editor for X (Twitter) posting.
 *
 * spec-id: AKARI-HUB-003
 * scope: 140/280 字投稿に特化したシンプルエディタ
 *
 * Features:
 * - Plain text input (basic Markdown support for ~bold~ *italic*)
 * - Character counter (140 / 280 mode toggle)
 * - Partner chat panel
 * - "Post to X" button with HITL gate
 * - Post history save to Pool
 * - Memory integration for writing style
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Send, MessageSquare, AlertCircle, Copy } from "lucide-react";
import "./tiny-writer.css";

interface TinyWriterEditorProps {
  onPost?: (text: string) => Promise<void>;
  onChat?: (message: string) => void;
  agentName?: string;
}

export function TinyWriterEditor({
  onPost,
  onChat,
  agentName = "Partner",
}: TinyWriterEditorProps) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"140" | "280">("280");
  const [isPosting, setIsPosting] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; text: string }[]
  >([]);
  const [chatInput, setChatInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const charLimit = mode === "140" ? 140 : 280;
  const charCount = [...text].length;
  const isOverLimit = charCount > charLimit;
  const isEmpty = charCount === 0;

  const handlePost = useCallback(async () => {
    if (isEmpty || isOverLimit) return;

    setIsPosting(true);
    try {
      if (onPost) {
        await onPost(text);
      }
      // Reset for next draft
      setText("");
      setChatMessages([]);
    } catch (err) {
      console.error("Post failed:", err);
      // エラーはトースト等で表示するべき（後の実装）
    } finally {
      setIsPosting(false);
    }
  }, [text, isEmpty, isOverLimit, onPost]);

  const handleSendChat = useCallback(() => {
    if (!chatInput.trim()) return;

    setChatMessages((prev) => [
      ...prev,
      { role: "user", text: chatInput },
    ]);

    if (onChat) {
      onChat(chatInput);
    }

    setChatInput("");
  }, [chatInput, onChat]);

  const handleCopyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(text);
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.metaKey) {
      // cmd+enter: Post
      handlePost();
    }
  };

  const handleModeToggle = () => {
    setMode((prev) => (prev === "140" ? "280" : "140"));
  };

  return (
    <div className="tiny-writer-container">
      {/* Header */}
      <div className="tiny-writer-header">
        <h1>書く</h1>
        <div className="header-controls">
          <button
            className="mode-toggle"
            onClick={handleModeToggle}
            title="文字制限切替 (cmd+shift+m)"
          >
            {mode} 字
          </button>
        </div>
      </div>

      <div className="tiny-writer-main">
        {/* Editor Section */}
        <div className="editor-section">
          <div className="editor-wrapper">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="何か考えたことを書いて..."
              className="editor-textarea"
            />
          </div>

          {/* Status Bar */}
          <div className="status-bar">
            <div className="char-counter">
              <span
                className={`char-count ${isOverLimit ? "over-limit" : ""}`}
              >
                {charCount}
              </span>
              <span className="char-limit">/ {charLimit}</span>
            </div>

            {isOverLimit && (
              <div className="warning">
                <AlertCircle size={16} />
                <span>{charCount - charLimit} 字オーバー</span>
              </div>
            )}

            <div className="status-actions">
              <button
                className="btn-secondary btn-small"
                onClick={handleCopyToClipboard}
                disabled={isEmpty}
                title="Copy to clipboard"
              >
                <Copy size={16} />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button
              className={`btn-primary ${isEmpty || isOverLimit ? "disabled" : ""}`}
              onClick={handlePost}
              disabled={isEmpty || isOverLimit || isPosting}
              title="Post to X (cmd+enter)"
            >
              {isPosting ? "投稿中..." : "X に投稿"}
            </button>

            <button
              className={`btn-secondary ${showChat ? "active" : ""}`}
              onClick={() => setShowChat(!showChat)}
              title="Partner チャット (cmd+/)"
            >
              <MessageSquare size={16} />
            </button>
          </div>
        </div>

        {/* Chat Panel */}
        {showChat && (
          <div className="chat-panel">
            <div className="chat-header">
              <h3>{agentName}</h3>
            </div>

            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <div className="chat-empty">
                  <p>「ここの言い回し変えて」などと頼める</p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`chat-message ${msg.role}`}>
                  <p>{msg.text}</p>
                </div>
              ))}
            </div>

            <div className="chat-input-wrapper">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSendChat();
                  }
                }}
                placeholder="Partner に相談..."
                className="chat-input"
              />
              <button
                className="btn-chat-send"
                onClick={handleSendChat}
                disabled={!chatInput.trim()}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
