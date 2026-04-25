/**
 * @file Phase0WriterApp.tsx
 * AKARI Writer Phase 0 MVP ("Tiny Writer") app entry component
 *
 * spec-id: AKARI-HUB-003
 * version: 0.1.0
 *
 * This is the complete Phase 0 implementation:
 * - Plain text editor for X (Twitter) 140/280 字投稿
 * - Partner chat panel
 * - Post to X button with HITL gate
 * - Post history
 * - Memory integration
 */

import { useCallback } from "react";
import { TinyWriterEditor } from "./TinyWriterEditor";
import { usePhase0Writer } from "./usePhase0Writer";
import "./phase0-writer.css";

interface Phase0WriterAppProps {
  agentName?: string;
  onBack?: () => void;
}

/**
 * Phase 0 MVP App Container
 * Wraps TinyWriterEditor with API integration
 */
export function Phase0WriterApp({
  agentName = "Partner (Writer)",
  onBack,
}: Phase0WriterAppProps) {
  const {
    state,
    handoffToPublisher,
    chatWithPartner,
  } = usePhase0Writer();

  const handlePost = useCallback(
    async (text: string) => {
      // Handoff to X sender (or clipboard fallback in MVP)
      await handoffToPublisher(text, "x");

      // TODO: Show success toast
      // showToast({ type: "success", message: "投稿しました！" })
    },
    [handoffToPublisher]
  );

  const handleChat = useCallback(
    async (message: string) => {
      // Chat with Partner
      const response = await chatWithPartner(message);
      if (response) {
        // TODO: Display partner response in chat panel
        console.log("Partner response:", response);
      }
    },
    [chatWithPartner]
  );

  return (
    <div className="phase0-writer-app">
      <TinyWriterEditor
        onPost={handlePost}
        onChat={handleChat}
        agentName={agentName}
      />

      {/* Status footer (for future: Guardian, auto-save status, etc) */}
      <div className="writer-footer">
        {state.error && (
          <div className="error-toast">
            <span>{state.error}</span>
          </div>
        )}
        {state.postHistory.length > 0 && (
          <div className="footer-info">
            <span>投稿履歴: {state.postHistory.length} 件</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default Phase0WriterApp;
