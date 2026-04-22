/**
 * Writer Studio — WorkspaceHost + マルチプラットフォーム + トーン + 画像添付。
 * spec: AKARI-HUB-009
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { Palette, Share2, Target } from "lucide-react";

import { WorkspaceHost } from "./layout/WorkspaceHost";
import { WorkBar } from "./layout/WorkBar";
import { SidePanel, SnsPlatformList, type SidePanelTab } from "./layout/SidePanel";
import { InspectorPanel } from "./layout/InspectorPanel";
import { ChatPanel } from "./layout/ChatPanel";
import { PolicyPanel } from "./components/PolicyPanel";
import { StylePanel } from "./components/StylePanel";
import { WriterView } from "./WriterView";
import type { MediaAttachment } from "@/lib/media";
import {
  uuid,
  type PartnerChatResponse,
  type PartnerNewConversationResult,
} from "@/lib/types";
import { callToolJson } from "@/lib/api";
import { useFontScale } from "@/lib/use-font-scale";
import { resizeImage } from "@/lib/image-resize";
import { getPlatform, SOURCE_PLATFORM_ID, type ToneId } from "@/lib/platforms";
import type { ContextItem } from "@/lib/context-selection";
import { WriterSettings } from "./layout/WriterSettings";
import { PublishModal } from "./layout/PublishModal";
import { useSelectedModel, useFeatureModel } from "@/lib/model-store";
import {
  type PolicyData,
  getTemplate,
  policyToPromptContext,
  createDefaultPolicy,
} from "@akari-os/templates-core";
import { checkQuality, type QualityReport } from "./lib/quality-check";
import {
  styleConfigToPromptContext,
  createDefaultWorkStyle,
  createWorkStyleFromPreset,
  TONE_PRESETS,
  type WorkStyleConfig,
  type EmojiUsage,
} from "@akari-os/writer-style-core";
import { deriveWorkflowState } from "./lib/workflow-state";
import {
  type PipelinePlan,
  advanceStep,
  getCurrentStep,
  getTabForStep,
} from "@akari-os/pipeline-core";
import {
  type Work,
  type PlatformContent,
  ACTIVE_WORK_KEY,
  loadWorks,
  saveWorks,
  createWork,
} from "@/lib/works";

export type { Work, PlatformContent };
export { ACTIVE_WORK_KEY, loadWorks, saveWorks };

// === Component ===

interface WriterStudioProps {
  onBack?: () => void;
  /** Chat パネルに表示するエージェント名 */
  agentName?: string;
  /** Pool Browser から注入されたコンテキスト（複数可） */
  injectedContexts?: import("@/lib/context-selection").PresetContext[];
  /** 注入コンテキストを消費した後のコールバック */
  onInjectedContextsConsumed?: () => void;
}

export function WriterStudio({
  onBack = () => {},
  agentName = "Partner (Writer)",
  injectedContexts,
  onInjectedContextsConsumed,
}: WriterStudioProps = {}) {
  const fontScale = useFontScale();
  const [selectedModel] = useSelectedModel();
  const writerModel = useFeatureModel("writer");

  // Panel visibility
  const [showToolPalette, setShowToolPalette] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [showChat, setShowChat] = useState(true);

  // / コマンド → Inspector スキル連動
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);

  // Context Selection (テキスト選択 → Chat)
  const [pendingContexts, setPendingContexts] = useState<ContextItem[]>([]);

  // Pool から注入されたコンテキストを pendingContexts に追加
  useEffect(() => {
    if (injectedContexts && injectedContexts.length > 0) {
      setPendingContexts((prev) => [...prev, ...injectedContexts]);
      onInjectedContextsConsumed?.();
    }
  }, [injectedContexts, onInjectedContextsConsumed]);

  // Pool Browser → Writer App のグローバル event 受け口（AppHost 経由マウント用）
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent).detail as import("@/lib/context-selection").PresetContext[] | undefined;
      if (detail && detail.length > 0) {
        setPendingContexts((prev) => [...prev, ...detail]);
      }
    };
    window.addEventListener("akari:writer-inject", handler);
    return () => window.removeEventListener("akari:writer-inject", handler);
  }, []);

  // Writer 設定モーダル
  const [showSettings, setShowSettings] = useState(false);
  // 投稿モーダル
  const [showPublish, setShowPublish] = useState(false);
  // 設定変更時に子コンポーネントを再レンダリングさせるためのカウンター
  const [, setSettingsVersion] = useState(0);
  const handleSettingsChanged = useCallback(() => setSettingsVersion((v) => v + 1), []);

  // Works state
  const [works, setWorks] = useState<Work[]>(loadWorks);
  const [activeWorkId, setActiveWorkId] = useState<string | null>(() =>
    localStorage.getItem(ACTIVE_WORK_KEY),
  );

  const activeWork = works.find((w) => w.id === activeWorkId);

  // 初期化
  useEffect(() => {
    if (works.length === 0) {
      const w = createWork();
      setWorks([w]);
      setActiveWorkId(w.id);
      saveWorks([w]);
      localStorage.setItem(ACTIVE_WORK_KEY, w.id);
    } else if (!activeWorkId || !works.find((w) => w.id === activeWorkId)) {
      setActiveWorkId(works[0]!.id);
      localStorage.setItem(ACTIVE_WORK_KEY, works[0]!.id);
    }
  }, [works, activeWorkId]);

  // === Work 更新ヘルパー ===

  const updateWork = useCallback(
    (updater: (w: Work) => Work) => {
      setWorks((prev) => {
        const next = prev.map((w) =>
          w.id === activeWorkId ? updater({ ...w, updatedAt: Date.now() }) : w,
        );
        saveWorks(next);
        return next;
      });
    },
    [activeWorkId],
  );

  /** アクティブプラットフォームのテキストを更新 */
  const handleTextChange = useCallback(
    (text: string) => updateWork((w) => {
      const pid = w.platformId || w.selectedPlatforms?.[0] || "";
      if (!pid) return w;
      const prev = w.contents[pid] ?? { text: "", media: [] };
      return { ...w, contents: { ...w.contents, [pid]: { ...prev, text } } };
    }),
    [updateWork],
  );
  const handleTitleChange = useCallback(
    (title: string) => updateWork((w) => ({ ...w, title })),
    [updateWork],
  );

  const handlePlatformChange = useCallback(
    (platformId: string) => updateWork((w) => {
      const selected = w.selectedPlatforms ?? [];
      // 原稿タブは selectedPlatforms に含めない（SNS 投稿対象ではない）
      const isSource = platformId === SOURCE_PLATFORM_ID;
      const isNew = !isSource && !selected.includes(platformId);
      const newSelected = isNew ? [...selected, platformId] : selected;
      // 新しいプラットフォームなら空コンテンツで初期化
      const contents = !w.contents[platformId]
        ? { ...w.contents, [platformId]: { text: "", media: [] } }
        : w.contents;
      return { ...w, platformId, selectedPlatforms: newSelected, contents };
    }),
    [updateWork],
  );
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null);
  const handleRemovePlatform = useCallback(
    (platformId: string) => {
      if (platformId === SOURCE_PLATFORM_ID) return;
      setRemoveConfirmId(platformId);
    },
    [],
  );
  const confirmRemovePlatform = useCallback(() => {
    if (!removeConfirmId) return;
    updateWork((w) => {
      const selected = (w.selectedPlatforms ?? []).filter((id) => id !== removeConfirmId);
      const newActiveId =
        w.platformId === removeConfirmId ? (selected[0] ?? SOURCE_PLATFORM_ID) : w.platformId;
      // contents からも削除
      const { [removeConfirmId]: _removed, ...restContents } = w.contents;
      return { ...w, platformId: newActiveId, selectedPlatforms: selected, contents: restContents };
    });
    setRemoveConfirmId(null);
  }, [removeConfirmId, updateWork]);
  const handleToneChange = useCallback(
    (tone: ToneId | null) => updateWork((w) => ({ ...w, tone })),
    [updateWork],
  );
  const handleAiContextChange = useCallback(
    (aiContext: string) => updateWork((w) => ({ ...w, aiContext })),
    [updateWork],
  );

  // 画像添付 (自動リサイズ付き) — アクティブプラットフォームの contents に格納
  const handleMediaAdd = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const original = reader.result as string;
        const resized = await resizeImage(original);
        const attachment: MediaAttachment = {
          id: uuid(),
          name: file.name,
          dataUrl: resized.dataUrl,
        };
        updateWork((w) => {
          if (!w.platformId) return w;
          const prev = w.contents[w.platformId] ?? { text: "", media: [] };
          return { ...w, contents: { ...w.contents, [w.platformId]: { ...prev, media: [...prev.media, attachment] } } };
        });
      };
      reader.readAsDataURL(file);
    },
    [updateWork],
  );

  const handleMediaRemove = useCallback(
    (id: string) => {
      updateWork((w) => {
        if (!w.platformId) return w;
        const prev = w.contents[w.platformId] ?? { text: "", media: [] };
        return { ...w, contents: { ...w.contents, [w.platformId]: { ...prev, media: prev.media.filter((m) => m.id !== id) } } };
      });
    },
    [updateWork],
  );

  // === ソース下書き + AI エンハンス散布 ===

  const [enhancing, setEnhancing] = useState(false);
  const [enhancingPlatform, setEnhancingPlatform] = useState<string | null>(null);

  const handlePolicyChange = useCallback(
    (policy: PolicyData) => {
      updateWork((w) => ({ ...w, policy, sourceDraft: policy.memo }));
      setApproved(false);
    },
    [updateWork],
  );

  // 品質チェック
  const [qualityReport, setQualityReport] = useState<QualityReport | null>(null);

  // スタイル管理（Work.style ベース）
  const activeStyleConfig = activeWork?.style ?? undefined;
  const handleStyleConfigChange = useCallback((config: WorkStyleConfig) => {
    updateWork((w) => ({ ...w, style: config }));
    setApproved(false);
  }, [updateWork]);

  // 承認フロー
  const [approved, setApproved] = useState(false);

  // パイプライン（Chat 主導プランモード）
  const [pipelinePlan, setPipelinePlan] = useState<PipelinePlan | null>(null);
  const [pipelineStarted, setPipelineStarted] = useState(false);
  const [sideTabId, setSideTabId] = useState<string>("policy");

  // Work 切替時にリセット
  useEffect(() => {
    setApproved(false);
    setPipelinePlan(null);
    setPipelineStarted(false);
    setSideTabId("policy");
  }, [activeWorkId]);

  // ワークフロー state 導出
  const workflowState = useMemo(() => {
    if (!activeWork) return undefined;
    const hasGenerated = Object.entries(activeWork.contents).some(
      ([pid, c]) => pid !== SOURCE_PLATFORM_ID && c.text.trim().length > 0,
    );
    return deriveWorkflowState({
      policy: activeWork.policy,
      sourceText: activeWork.contents[SOURCE_PLATFORM_ID]?.text,
      hasStyle: !!(activeWork.style?.base.tone),
      selectedPlatforms: activeWork.selectedPlatforms ?? [],
      approved,
      hasGeneratedContent: hasGenerated,
      qualityReport,
      published: activeWork.status === "published",
    });
  }, [activeWork, approved, qualityReport]);

  const handleEnhance = useCallback(async (targetPlatforms?: string[]) => {
    // 現在値はクロージャではなく state から都度読む
    const current = works.find((w) => w.id === activeWorkId);
    if (!current) return;
    const platforms = targetPlatforms ?? current.selectedPlatforms ?? [];

    // 原稿タブ（__source__）の本文があれば最優先のソースとして使う
    const sourceText = current.contents[SOURCE_PLATFORM_ID]?.text?.trim() ?? "";
    // policy ベースのサブコンテキスト（テンプレート + フィールド + メモ）
    const policy = current.policy;
    const policyContext = policy ? policyToPromptContext(policy) : "";
    const legacySrc = current.sourceDraft?.trim() ?? "";
    if (!sourceText && !policyContext.trim() && !legacySrc) return;
    if (platforms.length === 0) return;

    const template = policy ? getTemplate(policy.templateId) : null;

    setEnhancing(true);
    setQualityReport(null);
    try {
      // 会話 ID を確保（未作成なら新規発行して Work に紐付ける）
      let convId = current.conversationId;
      if (!convId) {
        const newConv = await callToolJson<PartnerNewConversationResult>(
          "partner_new_conversation",
          { moduleId: "writer" },
        );
        convId = newConv.conversationId;
        updateWork((w) => ({ ...w, conversationId: convId }));
      }

      // ローカルで contents を追跡（state は非同期更新なので品質チェック用）
      const localContents = { ...current.contents };

      for (const pid of platforms) {
        setEnhancingPlatform(pid);
        const pf = getPlatform(pid);

        const knowhowText = pf.knowhow.length > 0
          ? pf.knowhow.map((k) => `- ${k.text}`).join("\n")
          : "";
        const sections = [
          `以下の投稿方針を、${pf.name} (${pf.description}) 向けに最適化した投稿文にリライトしてください。`,
          `\n[プラットフォーム特性]\n${pf.facts.join("\n")}`,
          ...(knowhowText ? [`\n[投稿ノウハウ]\n${knowhowText}`] : []),
        ];

        if (template?.aiContext) {
          sections.push(`\n[投稿タイプのガイド]\n${template.aiContext}`);
        }

        if (sourceText) {
          sections.push(`\n[原稿（大元の文章）]\n${sourceText}`);
        }
        const auxContext = policyContext.trim() || legacySrc;
        if (auxContext) {
          sections.push(`\n[投稿方針]\n${auxContext}`);
        }

        if (current.style) {
          sections.push(`\n[スタイル指定]\n${styleConfigToPromptContext(current.style, pid)}`);
          // X 向けスレッド分割数
          const splitCount = current.style.overrides[pid]?.threadSplitCount;
          if (splitCount && splitCount > 1 && (pid === "x" || pid === "x_long")) {
            sections.push(`\n[スレッド分割]\n${splitCount}ポストに分割してください。各ポストは280字以内。ポスト間は「---」で区切ってください。`);
          }
        }

        sections.push(`\n最適化した投稿文だけを === で区切って出力してください。説明は区切りの外に書いてください。`);

        const prompt = sections.join("\n");

        const response = await callToolJson<PartnerChatResponse>("partner_chat", {
          conversationId: convId,
          message: prompt,
          model: writerModel.effectiveId,
        });

        // --- で囲まれた本文を抽出。無ければ全体を採用
        const match = response.text.match(/===\s*\n([\s\S]*?)\n\s*===/);
        const extracted = match ? match[1]!.trim() : response.text.trim();

        localContents[pid] = {
          text: extracted,
          media: localContents[pid]?.media ?? [],
        };

        updateWork((w) => ({
          ...w,
          contents: {
            ...w.contents,
            [pid]: localContents[pid]!,
          },
        }));
      }

      // エンハンス完了後に品質チェック実行（ローカル追跡した最新 contents を使用）
      const report = checkQuality(localContents, platforms);
      setQualityReport(report);

      // issue があれば Chat にシステムメッセージとして通知
      if (report.issues.length > 0) {
        const summary = report.issues
          .map((i) => `${i.severity === "error" ? "❌" : i.severity === "warning" ? "⚠️" : "ℹ️"} ${i.message}`)
          .join("\n");
        setPendingContexts((prev) => [
          ...prev,
          {
            id: uuid(),
            type: "preset" as const,
            label: "品質チェック結果",
            selectedText: `エンハンス後の品質チェックで以下の問題が見つかりました。修正提案してください:\n${summary}`,
            startOffset: 0,
            endOffset: 0,
          },
        ]);
        setShowChat(true);
      }
    } catch {
      // エンハンス失敗時は黙って抜ける（既存エンハンスされた分は残す）
    } finally {
      setEnhancing(false);
      setEnhancingPlatform(null);
    }
  }, [works, activeWorkId, updateWork, writerModel.effectiveId]);

  // 承認 → 自動エンハンス
  const handleApprove = useCallback(() => {
    setApproved(true);
    const current = works.find((w) => w.id === activeWorkId);
    if (current) {
      void handleEnhance(current.selectedPlatforms ?? []);
    }
  }, [works, activeWorkId, handleEnhance]);

  // パイプライン開始（プラン全体を承認）
  const handlePipelineStart = useCallback((plan: PipelinePlan) => {
    setPipelinePlan(plan);
    setPipelineStarted(true);

    // 最初のステップに対応するアクションを実行
    const firstStep = getCurrentStep(plan);
    if (firstStep) {
      const tab = getTabForStep(firstStep.id);
      if (tab) {
        setSideTabId(tab);
        setShowToolPalette(true);
      }
      // AI が提案したデータを自動設定
      applyStepData(firstStep);
    }
  }, []);

  // ステップのデータを自動適用
  const applyStepData = useCallback((step: { id: string; data?: Record<string, unknown> }) => {
    if (!step.data) return;

    if (step.id === "policy") {
      const templateId = (step.data.template as string) || "free";
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(step.data)) {
        if (k !== "template") fields[k] = String(v);
      }
      handlePolicyChange({ templateId, fields, memo: fields.topic || "" });
    }

    if (step.id === "style") {
      const presetId = (step.data.preset as string) || "casual";
      const preset = TONE_PRESETS.find((p) => p.id === presetId) ?? TONE_PRESETS[0]!;
      if (!activeWork?.style?.base.tone) {
        handleStyleConfigChange(createWorkStyleFromPreset(preset));
      }
    }

    if (step.id === "policy") {
      const platforms = step.data.platforms as string[] | undefined;
      if (platforms && platforms.length > 0) {
        for (const pid of platforms) {
          handlePlatformChange(pid);
        }
      }
    }
  }, [handlePolicyChange, activeWork, handleStyleConfigChange, handlePlatformChange]);

  // 現在のステップを承認して次へ
  const handleStepApprove = useCallback(() => {
    if (!pipelinePlan) return;

    const nextPlan = advanceStep(pipelinePlan);
    setPipelinePlan(nextPlan);

    const nextStep = getCurrentStep(nextPlan);
    if (nextStep) {
      const tab = getTabForStep(nextStep.id);
      if (tab) {
        setSideTabId(tab);
        setShowToolPalette(true);
      }
      applyStepData(nextStep);

      // 生成ステップなら自動エンハンス
      if (nextStep.id === "generate") {
        setApproved(true);
        const current = works.find((w) => w.id === activeWorkId);
        if (current) {
          void handleEnhance(current.selectedPlatforms ?? []);
        }
      }

      // 投稿ステップなら PublishModal
      if (nextStep.id === "publish") {
        setShowPublish(true);
      }
    }
  }, [pipelinePlan, applyStepData, works, activeWorkId, handleEnhance]);

  // === Side Panel タブ ===

  const sideTabs: SidePanelTab[] = [
    {
      id: "policy",
      icon: <Target className="w-3.5 h-3.5" />,
      label: "目的",
      content: (
        <PolicyPanel
          policy={activeWork?.policy}
          onPolicyChange={handlePolicyChange}
          selectedPlatforms={activeWork?.selectedPlatforms ?? []}
          onEnhance={handleEnhance}
          enhancing={enhancing}
          enhancingPlatform={enhancingPlatform}
          onDiscussWithAI={() => {
            if (activeWork?.policy) {
              const ctx = policyToPromptContext(activeWork.policy);
              setPendingContexts((prev) => [
                ...prev,
                {
                  id: uuid(),
                  type: "preset" as const,
                  label: "投稿方針",
                  selectedText: ctx,
                  startOffset: 0,
                  endOffset: ctx.length,
                },
              ]);
              setShowChat(true);
            }
          }}
        />
      ),
    },
    {
      id: "sns",
      icon: <Share2 className="w-3.5 h-3.5" />,
      label: "SNS",
      content: (
        <SnsPlatformList
          platformId={activeWork?.platformId ?? ""}
          onSelect={handlePlatformChange}
          selectedPlatforms={activeWork?.selectedPlatforms ?? []}
        />
      ),
    },
    {
      id: "style",
      icon: <Palette className="w-3.5 h-3.5" />,
      label: "スタイル",
      content: (
        <StylePanel
          styleConfig={activeStyleConfig}
          onStyleConfigChange={handleStyleConfigChange}
          activePlatformId={activeWork?.platformId ?? ""}
          selectedPlatforms={activeWork?.selectedPlatforms ?? []}
        />
      ),
    },
  ];

  return (
    <>
    <WorkspaceHost
      topBar={
        <WorkBar
          title={activeWork?.title ?? ""}
          onTitleChange={handleTitleChange}
          draftText={activeWork?.contents[activeWork?.platformId ?? ""]?.text}
          modelId={selectedModel.id}
          onBack={onBack}
          onPublish={() => setShowPublish(true)}
          platformCount={activeWork?.selectedPlatforms?.length ?? 0}
          onOpenSettings={() => setShowSettings(true)}
          saveStatus="saved"
          zoomPercentage={fontScale.percentage}
          onZoomIn={fontScale.zoomIn}
          onZoomOut={fontScale.zoomOut}
          onZoomReset={fontScale.resetZoom}
        />
      }
      toolPalette={
        <SidePanel
          tabs={sideTabs}
          defaultTabId="policy"
          activeTabId={sideTabId}
          onTabChange={setSideTabId}
          onCollapse={() => setShowToolPalette(false)}
          highlight={pipelineStarted}
        />
      }
      showToolPalette={showToolPalette}
      onToggleToolPalette={() => setShowToolPalette((v) => !v)}
      editor={
        <WriterView
          draft={activeWork?.contents[activeWork.platformId]?.text ?? ""}
          onDraftChange={handleTextChange}
          platformId={activeWork?.platformId ?? "x"}
          onPlatformChange={handlePlatformChange}
          selectedPlatforms={activeWork?.selectedPlatforms}
          onRemovePlatform={handleRemovePlatform}
          onAddPlatform={handlePlatformChange}
          media={activeWork?.contents[activeWork?.platformId ?? ""]?.media ?? []}
          onMediaAdd={handleMediaAdd}
          onMediaRemove={handleMediaRemove}
          onSendContext={(ctx) => {
            setPendingContexts((prev) => [...prev, ctx]);
            setShowChat(true);
          }}
          allContents={activeWork?.contents}
        />
      }
      inspector={
        <InspectorPanel
          draft={activeWork?.contents[activeWork.platformId]?.text ?? ""}
          platformId={activeWork?.platformId ?? "x"}
          onPlatformChange={handlePlatformChange}
          tone={activeWork?.tone ?? null}
          onToneChange={handleToneChange}
          media={activeWork?.contents[activeWork?.platformId ?? ""]?.media ?? []}
          onApplyGenerated={handleTextChange}
          onCollapse={() => setShowInspector(false)}
          activeSkillId={activeSkillId}
          onSkillHandled={() => setActiveSkillId(null)}
          aiContext={activeWork?.aiContext ?? ""}
          onAiContextChange={handleAiContextChange}
          selectedPlatforms={activeWork?.selectedPlatforms ?? []}
          onAddContext={(ctx) => {
            setPendingContexts((prev) => [...prev, ctx]);
            setShowChat(true);
          }}
          qualityReport={qualityReport}
        />
      }
      showInspector={showInspector}
      onToggleInspector={() => setShowInspector((v) => !v)}
      chat={
        <ChatPanel
          key={activeWorkId ?? "no-work"}
          draft={activeWork?.contents[activeWork?.platformId ?? ""]?.text ?? ""}
          allContents={activeWork?.contents ?? {}}
          onCollapse={() => setShowChat(false)}
          onApplyText={handleTextChange}
          onSkillActivated={(skillId) => {
            setActiveSkillId(skillId);
            setShowInspector(true);
          }}
          pendingContexts={pendingContexts}
          onContextRemove={(id) => setPendingContexts((prev) => prev.filter((c) => c.id !== id))}
          agentName={agentName}
          initialConversationId={activeWork?.conversationId}
          onConversationCreated={(convId) =>
            updateWork((w) => ({ ...w, conversationId: convId }))
          }
          platformId={activeWork?.platformId ?? "x"}
          aiContext={activeWork?.aiContext}
          policy={activeWork?.policy}
          onPolicyUpdate={(update) => {
            const base = activeWork?.policy ?? createDefaultPolicy();
            handlePolicyChange({
              ...base,
              ...update,
              fields: { ...base.fields, ...(update.fields ?? {}) },
            });
          }}
          workflowState={workflowState}
          onApprove={handleApprove}
          onPublish={() => setShowPublish(true)}
          activeStyleConfig={activeStyleConfig}
          pipelinePlan={pipelinePlan}
          pipelineStarted={pipelineStarted}
          onPipelineStart={handlePipelineStart}
          onStepApprove={handleStepApprove}
          onPlatformsSelect={(platformIds) => {
            for (const pid of platformIds) {
              handlePlatformChange(pid);
            }
          }}
          onTabSwitch={(tabId) => {
            setSideTabId(tabId);
            setShowToolPalette(true);
          }}
          onStyleUpdate={(update) => {
            const current = activeStyleConfig ?? createDefaultWorkStyle();
            const newBase = {
              ...current.base,
              ...(update.tone ? { tone: update.tone } : {}),
              ...(update.emojiUsage ? { emojiUsage: update.emojiUsage as EmojiUsage } : {}),
              ...(update.hashtagRule ? { hashtagRule: update.hashtagRule } : {}),
              ...(update.notes ? { notes: update.notes } : {}),
            };
            handleStyleConfigChange({ base: newBase, overrides: current.overrides });
          }}
          onEnhance={() => {
            const current = works.find((w) => w.id === activeWorkId);
            if (current) {
              setApproved(true);
              void handleEnhance(current.selectedPlatforms ?? []);
            }
          }}
        />
      }
      showChat={showChat}
      onToggleChat={() => setShowChat((v) => !v)}
    />

    {/* 投稿モーダル */}
    {showPublish && (
      <PublishModal
        contents={activeWork?.contents ?? {}}
        selectedPlatforms={activeWork?.selectedPlatforms ?? []}
        onClose={() => setShowPublish(false)}
      />
    )}

    {/* Writer 設定モーダル */}
    {showSettings && <WriterSettings onClose={() => setShowSettings(false)} onSettingsChanged={handleSettingsChanged} />}

    {/* 削除確認ダイアログ */}
    {removeConfirmId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setRemoveConfirmId(null)}>
        <div className="bg-card border border-border rounded-xl p-4 shadow-2xl max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm font-medium mb-1">投稿先を削除</p>
          <p className="text-xs text-muted-foreground mb-4">
            「{getPlatform(removeConfirmId).name}」を削除しますか？この投稿先のデータが消えます。
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setRemoveConfirmId(null)} className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition">
              キャンセル
            </button>
            <button onClick={confirmRemovePlatform} className="px-3 py-1.5 text-xs rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition">
              削除する
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

