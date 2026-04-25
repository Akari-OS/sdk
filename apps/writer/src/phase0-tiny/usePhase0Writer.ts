/**
 * @file usePhase0Writer.ts
 * AKARI Writer Phase 0 MVP hook — API integration & state management
 *
 * Responsibilities:
 * - Pool save/load (post_history, draft)
 * - Memory subscribe (writing_style)
 * - Inter-App handoff (app.handoff to Publishing category)
 * - Permission gate (HITL before external post)
 * - Agent chat integration (Partner)
 */

import { useState, useCallback, useEffect } from "react";

export interface Phase0WriterState {
  draft: string;
  isLoading: boolean;
  error: string | null;
  postHistory: PostHistoryEntry[];
}

export interface PostHistoryEntry {
  id: string;
  text: string;
  platform: "x" | "threads" | "note";
  postedAt: number;
  status: "draft" | "published" | "failed";
}

/**
 * Phase 0 MVP: Tiny Writer の state & API hook
 *
 * Features:
 * - Draft の Pool save/load
 * - 投稿履歴の取得
 * - Partner との対話
 * - Publishing app への handoff
 * - HITL permission gate
 */
export function usePhase0Writer() {
  const [state, setState] = useState<Phase0WriterState>({
    draft: "",
    isLoading: false,
    error: null,
    postHistory: [],
  });

  // ===== Pool Operations =====

  /**
   * Draft を Pool に保存
   * spec-id: AKARI-HUB-003 T-0a, T-0f
   */
  const saveDraft = useCallback(async (text: string) => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      // NOTE: Actual implementation requires akari.pool.put()
      // window.akari.pool.put({
      //   bytes: text,
      //   mime: "text/plain",
      //   tags: ["draft"],
      //   metadata: { platform: "x", timestamp: Date.now() }
      // })

      console.log("Draft saved:", text);
      setState((prev) => ({ ...prev, isLoading: false, error: null }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to save draft",
      }));
    }
  }, []);

  /**
   * Post history を Pool から読込
   * spec-id: AKARI-HUB-003 T-0g (直近 20 件)
   */
  const loadPostHistory = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      // NOTE: Actual implementation requires akari.pool.search()
      // const results = await window.akari.pool.search({
      //   tags: ["post_history"],
      //   limit: 20,
      //   sort: "created_desc"
      // })

      // Mock data for now
      const mockHistory: PostHistoryEntry[] = [
        {
          id: "post_001",
          text: "AKARI Writer の MVP が完成した！",
          platform: "x",
          postedAt: Date.now() - 86400000,
          status: "published",
        },
      ];

      setState((prev) => ({
        ...prev,
        postHistory: mockHistory,
        isLoading: false,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load history",
      }));
    }
  }, []);

  // ===== Memory Operations =====

  /**
   * 文体好み（writing_style）を Memory から読込
   * spec-id: AKARI-HUB-003 T-0h
   */
  const loadWritingStyle = useCallback(async () => {
    try {
      // NOTE: Actual implementation requires akari.memory.get()
      // const style = await window.akari.memory.get("writing_style")
      // console.log("Writing style:", style)

      // For MVP, return empty style
      return {};
    } catch (err) {
      console.error("Failed to load writing style:", err);
      return {};
    }
  }, []);

  /**
   * ユーザーの文体好みを Memory に記録
   * spec-id: AKARI-HUB-003 T-0h (例: "よく使う語尾")
   */
  const saveWritingStyle = useCallback(
    async (style: Record<string, unknown>) => {
      try {
        // NOTE: Actual implementation requires akari.memory.put()
        // await window.akari.memory.put("writing_style", style)

        console.log("Writing style saved:", style);
      } catch (err) {
        console.error("Failed to save writing style:", err);
      }
    },
    []
  );

  // ===== Inter-App Handoff =====

  /**
   * Publishing app (com.akari.x-sender など) への handoff
   * spec-id: AKARI-HUB-003 T-0e
   *
   * @param text 投稿テキスト
   * @param platform "x" | "threads" | "note"
   */
  const handoffToPublisher = useCallback(
    async (text: string, platform: "x" | "threads" | "note" = "x") => {
      try {
        setState((prev) => ({ ...prev, isLoading: true }));

        // Step 1: Draft を Pool に保存
        await saveDraft(text);

        // Step 2: HITL gate (Permission API)
        // NOTE: Actual implementation requires akari.permission.gate()
        // await window.akari.permission.gate({
        //   action: "external-network.post",
        //   reason: `${platform} に投稿する`,
        //   hitl: true
        // })

        // Step 3: Inter-App handoff
        // NOTE: Actual implementation requires akari.app.handoff()
        // await window.akari.app.handoff({
        //   to: `com.akari.${platform}-sender`,
        //   intent: "publish-draft",
        //   payload: {
        //     draft_ref: draftId,
        //     assets: []
        //   }
        // })

        // Step 4: Clipboard fallback (MVP)
        // Copy to clipboard as fallback
        const clipboardText = `[${platform.toUpperCase()}]\n${text}`;
        await navigator.clipboard.writeText(clipboardText);

        // Step 5: Post history に記録
        const newPost: PostHistoryEntry = {
          id: `post_${Date.now()}`,
          text,
          platform,
          postedAt: Date.now(),
          status: "published",
        };

        setState((prev) => ({
          ...prev,
          postHistory: [newPost, ...prev.postHistory],
          isLoading: false,
          error: null,
        }));

        return true;
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Handoff failed";
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMsg,
        }));
        return false;
      }
    },
    [saveDraft]
  );

  // ===== Partner Chat Integration =====

  /**
   * Partner エージェントに相談
   * spec-id: AKARI-HUB-003 T-0d (Partner チャットパネル)
   *
   * @param message ユーザーメッセージ
   * @param selectedText 選択範囲（コンテキスト）
   */
  const chatWithPartner = useCallback(
    async (message: string, selectedText?: string) => {
      try {
        // NOTE: Actual implementation requires partner agent integration
        // const context = {
        //   app: "writer",
        //   selection: selectedText,
        //   documentId: "active_draft",
        // }
        // const response = await window.akari.agent.chat({
        //   message,
        //   context,
        //   modelHint: "default"
        // })
        // return response.text

        // Mock response for MVP
        const responses = [
          "いいね！その調子です。",
          "もう少し簡潔に書くとより良くなると思いますよ。",
          "絵文字を入れるとより親しみやすくなるかもしれません。",
        ];

        return responses[
          Math.floor(Math.random() * responses.length)
        ];
      } catch (err) {
        console.error("Partner chat failed:", err);
        return null;
      }
    },
    []
  );

  // ===== Initialization =====

  useEffect(() => {
    // Initial load: post history を読込
    void loadPostHistory();
  }, [loadPostHistory]);

  return {
    state,
    saveDraft,
    loadPostHistory,
    loadWritingStyle,
    saveWritingStyle,
    handoffToPublisher,
    chatWithPartner,
  };
}
