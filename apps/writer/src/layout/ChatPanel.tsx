/**
 * Chat Panel — Writer 文脈付きの Partner AI チャット (右端カラム)。
 *
 * Video の AIChatPanel を参考に強化:
 * - タイピングエフェクト (文字が段階的に表示)
 * - `/` コマンド (スラッシュで定型指示を選択)
 * - 下書き context の自動注入
 * - トーン設定の context 反映
 *
 * spec: AKARI-HUB-009
 */

import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type DragEvent } from "react";
import { X, ChevronRight, Target, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callToolJson, readResourceJson } from "@/lib/api";
import { uuid, type ConversationMessage, type PartnerChatResponse, type PartnerNewConversationResult } from "@/lib/types";
import { DelegationAccordion } from "@/modules/chat/DelegationAccordion";
import { QuestionsWizard, type Question } from "@/components/chat/QuestionsWizard";
import { type PlatformResult } from "@/components/chat/PlatformDiffView";
import { PipelineMessage, type PipelineData } from "@/components/chat/PipelineMessage";
import { PlanMessage } from "@/components/chat/PlanMessage";
import { WorkflowBar } from "../components/WorkflowBar";
import { createPlanFromAI, type PipelinePlan } from "@akari-os/pipeline-core";
import { contextsToPromptText, type ContextItem, type PresetContext, type TextSelectionContext, type PointerElementContext } from "@/lib/context-selection";
import { getPlatform } from "@/lib/platforms";
import { ModelSelector } from "@/components/chat/ModelSelector";
import { PoolPickerPopup } from "@/components/chat/PoolPickerPopup";
import { useSelectedModel } from "@/lib/model-store";
import { getModelById } from "@/lib/model-data";
import { policyToPromptContext, getTemplate } from "@akari-os/templates-core";
import type { WorkflowState } from "../lib/workflow-state";
import { styleConfigToPromptContext } from "@akari-os/writer-style-core";
import { isReadyForApproval } from "../lib/workflow-state";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** タイピングエフェクト用: 表示済み文字数 */
  displayedChars?: number;
  createdAt: number;
  /** サブエージェント委譲記録 */
  delegations?: import("@/lib/types").Delegation[];
}

type ChatMode = "normal" | "deep" | "plan";

interface ChatPanelProps {
  draft: string;
  onCollapse: () => void;
  /** AI 生成テキストを Editor に適用 */
  onApplyText?: (text: string) => void;
  /** / コマンド実行時に Inspector のスキルタブを開く */
  onSkillActivated?: (skillId: string) => void;
  /** エディタから渡されたコンテキスト */
  pendingContexts?: ContextItem[];
  onContextRemove?: (id: string) => void;
  /** Chat ヘッダーに表示するエージェント名 */
  agentName?: string;
  /** Work に保存済みの conversationId (復元用) */
  initialConversationId?: string;
  /** 新規 conversationId が発行された時のコールバック */
  onConversationCreated?: (conversationId: string) => void;
  /** プラットフォーム ID（コンテキスト注入用） */
  platformId?: string;
  /** AI コンテキストメモ（自動注入） */
  aiContext?: string;
  /** 全プラットフォームのテキスト・メディア（マルチPFコンテキスト用） */
  allContents?: Record<string, { text: string; media: { id: string; name: string; dataUrl: string }[] }>;
  /** 投稿方針（コンテキスト注入用） */
  policy?: import("@akari-os/templates-core").PolicyData;
  /** Partner からの方針更新を親に反映 */
  onPolicyUpdate?: (update: Partial<import("@akari-os/templates-core").PolicyData>) => void;
  /** ワークフロー進捗 */
  workflowState?: WorkflowState;
  /** 承認コールバック */
  onApprove?: () => void;
  /** 投稿コールバック */
  onPublish?: () => void;
  /** 2層スタイル設定 */
  activeStyleConfig?: import("@akari-os/writer-style-core").WorkStyleConfig;
  /** パイプラインプラン */
  pipelinePlan?: PipelinePlan | null;
  /** プラン開始済みか */
  pipelineStarted?: boolean;
  /** プラン全体を承認して開始 */
  onPipelineStart?: (plan: PipelinePlan) => void;
  /** 現在のステップを承認して次へ */
  onStepApprove?: () => void;
  /** SNS プラットフォーム追加 */
  onPlatformsSelect?: (platformIds: string[]) => void;
  /** スタイル更新 */
  onStyleUpdate?: (update: { tone?: string; emojiUsage?: string; hashtagRule?: string; notes?: string }) => void;
  /** AI の更新タグに連動してサイドパネルのタブを切り替える */
  onTabSwitch?: (tabId: string) => void;
  /** エンハンス（生成）を実行 */
  onEnhance?: () => void;
}

/** スラッシュメニュー: カテゴリ → サブアイテムの2段構造 */
interface SlashItem {
  id: string;
  label: string;
  /** 選択時に input に反映するテキスト。undefined なら何もしない（mode/model は直接適用） */
  inputText?: string;
  /** スキル ID (Inspector 連動) */
  skillId?: string;
  /** 選択時の副作用: mode 切替等 */
  action?: "mode-normal" | "mode-deep" | "mode-plan";
}

interface SlashCategory {
  id: string;
  label: string;
  icon: string;
  items: SlashItem[];
}

const SLASH_CATEGORIES: SlashCategory[] = [
  {
    id: "skill", label: "スキル", icon: "✨",
    items: [
      { id: "polish", label: "添削", inputText: "/添削 ", skillId: "polish" },
      { id: "catchy", label: "キャッチーに", inputText: "/キャッチー ", skillId: "catchy" },
      { id: "shorten", label: "短くする", inputText: "/短く ", skillId: "shorten" },
      { id: "hook", label: "フック強化", inputText: "/フック ", skillId: "hook" },
      { id: "alternative", label: "別案", inputText: "/別案 ", skillId: "alternative" },
      { id: "translate", label: "翻訳", inputText: "/翻訳 ", skillId: "translate" },
    ],
  },
  {
    id: "mode", label: "モード", icon: "🔀",
    items: [
      { id: "normal", label: "💬 普通モード", action: "mode-normal" },
      { id: "deep", label: "🔍 深掘りモード", action: "mode-deep" },
      { id: "plan", label: "📋 プランモード", action: "mode-plan" },
    ],
  },
];

/**
 * daemon に保存された buildMessage 形式のテキストから、ユーザーの入力部分だけ抽出する。
 * 復元時に「[現在の下書き]...」「※投稿文面を...」を表示しないため。
 */
function extractUserText(content: string): string {
  const match = content.match(/\[指示\]\n([\s\S]*?)(?:\n\n(?:※|##|利用可能)|$)/);
  if (match) return match[1].trim();
  return content;
}

function buildMessage(
  userText: string,
  draft: string,
  contexts?: ContextItem[],
  platformInfo?: string,
  aiContextMemo?: string,
  allContents?: Record<string, { text: string; media: { id: string; name: string; dataUrl: string }[] }>,
  policyContext?: string,
  policy?: import("@akari-os/templates-core").PolicyData,
  styleContext?: string,
  selectedPlatforms?: string[],
): string {
  const parts: string[] = [];

  // 現在の設定状況（AI が既存設定を認識してスキップ判断に使う）
  const hasPolicy = !!(policy?.templateId && policy.templateId !== "free" || policy?.fields && Object.values(policy.fields).some((v) => v?.trim()));
  const hasPlatforms = !!(selectedPlatforms && selectedPlatforms.length > 0);
  const hasStyle = !!styleContext?.trim();
  const statusLines: string[] = [];
  statusLines.push(`目的: ${hasPolicy ? "設定済み" : "未設定"}`);
  statusLines.push(`SNS: ${hasPlatforms ? selectedPlatforms!.map((id) => getPlatform(id).name).join(", ") : "未選択"}`);
  statusLines.push(`スタイル: ${hasStyle ? "設定済み" : "デフォルト"}`);
  parts.push(`[現在の設定状況]\n${statusLines.join("\n")}`);

  // プラットフォーム情報
  if (platformInfo) {
    parts.push(`[プラットフォーム情報]\n${platformInfo}`);
  }

  // 投稿方針
  if (policyContext?.trim()) {
    parts.push(`[投稿方針]\n${policyContext}`);
  }

  // スタイル指定
  if (styleContext?.trim()) {
    parts.push(`[スタイル指定]\n${styleContext}`);
  }

  // AI コンテキストメモ
  if (aiContextMemo?.trim()) {
    parts.push(`[追加コンテキスト]\n${aiContextMemo}`);
  }

  // コンテキストチップがある場合
  if (contexts && contexts.length > 0) {
    parts.push(contextsToPromptText(contexts));
  }

  if (draft.trim().length > 0) {
    parts.push(`[現在の下書き]\n${draft}`);
  }

  // 全プラットフォームの下書き（マルチPF編集時）
  if (allContents && Object.keys(allContents).length > 1) {
    const platformTexts = Object.entries(allContents)
      .filter(([, c]) => c.text.trim())
      .map(([pid, c]) => `[${getPlatform(pid).name}]\n${c.text}`)
      .join("\n\n");
    if (platformTexts) {
      parts.push(`[全プラットフォームの下書き]\n${platformTexts}`);
    }
  }

  parts.push(`[指示]\n${userText}`);

  // 生成ガードレール + 設定反映タグ
  parts.push(
    `## 絶対ルール（違反厳禁）\n` +
    `1. 日本語で応答すること。英語を混ぜない。\n` +
    `2. 投稿文・文例・サンプルを直接書くな。生成はシステムが自動実行する。\n` +
    `3. 1メッセージで1つのことだけ。更新タグを出したら、そのメッセージはそれで終わり。\n` +
    `4. 更新タグを含むメッセージに質問・[suggestions]・[questions]を絶対に混ぜるな。\n` +
    `5. UIが「反映して次へ」ボタンを表示する。ユーザーがそれを押すまで次のステップに進むな。\n` +
    `6. 3つの設定（方針・SNS・スタイル）が必要。[現在の設定状況]を確認し、既に設定済みのステップは「この設定のままでいいですか？」と確認するだけでよい。未設定のステップだけ詳しくヒアリングせよ。\n` +
    `7. 全て設定されたら「これで生成しますか？」+ [generate] タグ。\n` +
    `8. テンプレートID・フィールドID・技術的な内部情報をユーザーに見せるな。自然な会話で方針を聞き、内部的に適切なIDを選べ。\n\n` +
    `## 更新タグ（設定が決まった時に、メッセージ末尾に1つだけ付ける。タグはシステムが処理するので人間には見えない）\n` +
    `方針: [policy-update]{"templateId":"ID","fields":{"key":"val"},"memo":"補足"}[/policy-update]\n` +
    `SNS: [sns-update]{"platforms":["X","Threads"]}[/sns-update]\n` +
    `スタイル: [style-update]{"tone":"カジュアル","emojiUsage":"普通","hashtagRule":"3個"}[/style-update]\n\n` +
    `## 内部参照用（ユーザーに見せるな）\n` +
    `templateID: free, event, product, release, blog_share, daily, quote, tips, news, thread\n` +
    `SNS: X, Threads, Facebook, IGフィード, IGストーリー, IGリール, TikTok, YouTube, YTショート, note, ブログ\n` +
    `※ 同じ内容を繰り返すな。変更があった時だけ出す。`
  );

  // テンプレートのフィールド情報
  if (policy) {
    const tmpl = getTemplate(policy.templateId);
    const fieldList = tmpl.fields.map((f) => `  ${f.id}: ${f.label}${f.required ? "（必須）" : ""}`).join("\n");
    if (fieldList) {
      parts.push(`利用可能なフィールドID:\n${fieldList}`);
    }
  }

  return parts.join("\n\n");
}

/**
 * AI のメッセージから --- で囲まれた「適用可能ブロック」を抽出してパースする。
 * --- で囲まれた部分 = 投稿文面（採用ボタン付き）
 * それ以外 = 説明テキスト（採用ボタンなし）
 */
interface Suggestion {
  label: string;
  prompt: string;
}

interface PolicyUpdate {
  templateId?: string;
  fields?: Record<string, string>;
  memo?: string;
}

interface SnsUpdate {
  platforms: string[];
}

interface StyleUpdate {
  tone?: string;
  emojiUsage?: string;
  hashtagRule?: string;
  notes?: string;
}

interface MessagePart {
  type: "text" | "draft" | "suggestions" | "questions" | "platformResults" | "policyUpdate" | "snsUpdate" | "styleUpdate" | "pipeline" | "plan" | "generate";
  content: string;
  suggestions?: Suggestion[];
  questions?: Question[];
  platformResults?: PlatformResult[];
  policyUpdate?: PolicyUpdate;
  snsUpdate?: SnsUpdate;
  styleUpdate?: StyleUpdate;
  pipelineData?: PipelineData;
  planSteps?: { id: string; label: string; data?: Record<string, unknown> }[];
}

/** 目的更新カードのアクションボタン（反映して次へ + 自由入力フィードバック） */
function PolicyUpdateActions({ onApprove, onSendFeedback }: { onApprove: () => void; onSendFeedback: (text: string) => void }) {
  const [showInput, setShowInput] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [applied, setApplied] = useState(false);

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <button
          onClick={() => { if (!applied) { setApplied(true); onApprove(); } }}
          disabled={applied}
          className={`text-[10px] px-2.5 py-1 rounded-full border transition font-medium ${applied ? "border-blue-400/20 bg-blue-400/5 text-blue-400/50 cursor-default" : "border-blue-400/40 bg-blue-400/10 text-blue-400 hover:bg-blue-400/20"}`}
        >
          {applied ? "✓ 反映済み" : "反映して次へ"}
        </button>
        <button
          onClick={() => setShowInput((v) => !v)}
          className="text-[10px] px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/30 transition"
        >
          修正リクエスト
        </button>
      </div>
      {showInput && (
        <div className="flex gap-1">
          <input
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.nativeEvent.isComposing && feedback.trim()) {
                onSendFeedback(feedback.trim());
                setFeedback("");
                setShowInput(false);
              }
            }}
            placeholder="こうしてほしい..."
            className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-primary/40"
            autoFocus
          />
          <button
            onClick={() => {
              if (feedback.trim()) {
                onSendFeedback(feedback.trim());
                setFeedback("");
                setShowInput(false);
              }
            }}
            disabled={!feedback.trim()}
            className="text-[10px] px-2 py-1 rounded-md bg-primary text-primary-foreground disabled:opacity-40"
          >
            送信
          </button>
        </div>
      )}
    </div>
  );
}

/** 条件付きメッセージを「実行」ラベル + 控えめな条件テキストで表示 */
function UserConditionsMessage({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const lines = text.split("\n").slice(1); // "以下の条件で..." を除く
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span>⚡ 条件を指定して実行</span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-[9px] opacity-60 hover:opacity-100 transition underline"
        >
          {open ? "閉じる" : "詳細"}
        </button>
      </div>
      {open && (
        <div className="mt-1 text-[10px] opacity-70 space-y-0.5">
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function parseSuggestions(block: string): Suggestion[] {
  return block.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("|"))
    .map((line) => {
      const [label, ...rest] = line.split("|");
      return { label: label!.trim(), prompt: rest.join("|").trim() };
    });
}

function parseMessage(text: string): MessagePart[] {
  const parts: MessagePart[] = [];

  // [suggestions]...[/suggestions] ブロックを先に抽出
  const suggestionsRegex = /\[suggestions\]\n([\s\S]*?)\[\/suggestions\]/;
  const sugMatch = text.match(suggestionsRegex);

  // [questions]...[/questions] ブロックを抽出
  const questionsRegex = /\[questions\]\n([\s\S]*?)\[\/questions\]/;
  const qMatch = text.match(questionsRegex);

  // [platform-results]...[/platform-results] ブロックを抽出（改行あり/なし両対応）
  const platformRegex = /\[platform-results\]\n?([\s\S]*?)\[\/platform-results\]/;
  const prMatch = text.match(platformRegex);

  // [policy-update]...[/policy-update] ブロックを抽出
  const policyRegex = /\[policy-update\]([\s\S]*?)\[\/policy-update\]/;
  const polMatch = text.match(policyRegex);

  // [sns-update]...[/sns-update] ブロックを抽出
  const snsRegex = /\[sns-update\]([\s\S]*?)\[\/sns-update\]/;
  const snsMatch = text.match(snsRegex);

  // [style-update]...[/style-update] ブロックを抽出
  const styleRegex = /\[style-update\]([\s\S]*?)\[\/style-update\]/;
  const styleMatch = text.match(styleRegex);

  // [pipeline]...[/pipeline] ブロックを抽出
  const pipelineRegex = /\[pipeline\]([\s\S]*?)\[\/pipeline\]/;
  const pipMatch = text.match(pipelineRegex);

  // [plan]...[/plan] ブロックを抽出
  const planRegex = /\[plan\]([\s\S]*?)\[\/plan\]/;
  const planMatch = text.match(planRegex);

  // [generate] マーカーを検出
  const hasGenerate = text.includes("[generate]");

  let remaining = text;

  if (sugMatch) {
    const before = text.slice(0, sugMatch.index!).trim();
    const after = text.slice(sugMatch.index! + sugMatch[0].length).trim();
    remaining = before + (after ? "\n" + after : "");
  }
  if (qMatch) {
    remaining = remaining.replace(questionsRegex, "").trim();
  }
  if (prMatch) {
    remaining = remaining.replace(platformRegex, "").trim();
  }
  if (polMatch) {
    remaining = remaining.replace(policyRegex, "").trim();
  }
  if (snsMatch) {
    remaining = remaining.replace(snsRegex, "").trim();
  }
  if (styleMatch) {
    remaining = remaining.replace(styleRegex, "").trim();
  }
  if (pipMatch) {
    remaining = remaining.replace(pipelineRegex, "").trim();
  }
  if (planMatch) {
    remaining = remaining.replace(planRegex, "").trim();
  }
  if (hasGenerate) {
    remaining = remaining.replace(/\[generate\]/g, "").trim();
  }

  // --- ブロック解析
  const lines = remaining.split("\n");
  let inBlock = false;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.trim() === "---") {
      if (inBlock) {
        parts.push({ type: "draft", content: currentLines.join("\n").trim() });
        currentLines = [];
        inBlock = false;
      } else {
        if (currentLines.length > 0) {
          const text = currentLines.join("\n").trim();
          if (text) parts.push({ type: "text", content: text });
        }
        currentLines = [];
        inBlock = true;
      }
    } else {
      currentLines.push(line);
    }
  }

  // 残りのテキスト
  if (currentLines.length > 0) {
    const text = currentLines.join("\n").trim();
    if (text) {
      parts.push({ type: inBlock ? "draft" : "text", content: text });
    }
  }

  // suggestions パートを追加
  if (sugMatch) {
    const suggestions = parseSuggestions(sugMatch[1]);
    if (suggestions.length > 0) {
      parts.push({ type: "suggestions", content: "", suggestions });
    }
  }

  // questions パートを追加
  if (qMatch) {
    try {
      const questions = JSON.parse(qMatch[1]) as Question[];
      if (Array.isArray(questions) && questions.length > 0) {
        parts.push({ type: "questions", content: "", questions });
      }
    } catch {
      // JSON パース失敗時は無視
    }
  }

  // platform-results パートを追加
  if (prMatch) {
    try {
      const platformResults = JSON.parse(prMatch[1]) as PlatformResult[];
      if (Array.isArray(platformResults) && platformResults.length > 0) {
        parts.push({ type: "platformResults", content: "", platformResults });
      }
    } catch {
      // JSON パース失敗時は無視
    }
  }

  // policy-update パートを追加（テキストの直後、suggestions の前に挿入）
  if (polMatch) {
    try {
      const policyUpdate = JSON.parse(polMatch[1]!) as PolicyUpdate;
      if (policyUpdate && typeof policyUpdate === "object") {
        // テキストパーツの直後に挿入（最後尾ではなく）
        let lastTextIdx = -1;
        for (let j = parts.length - 1; j >= 0; j--) {
          if (parts[j]!.type === "text" || parts[j]!.type === "draft") { lastTextIdx = j; break; }
        }
        if (lastTextIdx >= 0) {
          parts.splice(lastTextIdx + 1, 0, { type: "policyUpdate", content: "", policyUpdate });
        } else {
          parts.unshift({ type: "policyUpdate", content: "", policyUpdate });
        }
      }
    } catch {
      // JSON パース失敗時は無視
    }
  }

  // sns-update パートを追加
  if (snsMatch) {
    try {
      const snsUpdate = JSON.parse(snsMatch[1]!) as SnsUpdate;
      if (snsUpdate && Array.isArray(snsUpdate.platforms)) {
        let lastTextIdx = -1;
        for (let j = parts.length - 1; j >= 0; j--) {
          if (parts[j]!.type === "text" || parts[j]!.type === "draft" || parts[j]!.type === "policyUpdate") { lastTextIdx = j; break; }
        }
        if (lastTextIdx >= 0) {
          parts.splice(lastTextIdx + 1, 0, { type: "snsUpdate", content: "", snsUpdate });
        } else {
          parts.push({ type: "snsUpdate", content: "", snsUpdate });
        }
      }
    } catch {
      // JSON パース失敗時は無視
    }
  }

  // style-update パートを追加
  if (styleMatch) {
    try {
      const styleUpdate = JSON.parse(styleMatch[1]!) as StyleUpdate;
      if (styleUpdate && typeof styleUpdate === "object") {
        let lastTextIdx = -1;
        for (let j = parts.length - 1; j >= 0; j--) {
          if (parts[j]!.type === "text" || parts[j]!.type === "draft" || parts[j]!.type === "policyUpdate" || parts[j]!.type === "snsUpdate") { lastTextIdx = j; break; }
        }
        if (lastTextIdx >= 0) {
          parts.splice(lastTextIdx + 1, 0, { type: "styleUpdate", content: "", styleUpdate });
        } else {
          parts.push({ type: "styleUpdate", content: "", styleUpdate });
        }
      }
    } catch {
      // JSON パース失敗時は無視
    }
  }

  // plan パートを追加
  if (planMatch) {
    try {
      const parsed = JSON.parse(planMatch[1]!) as { steps: { id: string; label: string; data?: Record<string, unknown> }[] };
      if (parsed && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
        parts.push({ type: "plan", content: "", planSteps: parsed.steps });
      }
    } catch {
      // JSON パース失敗時は無視
    }
  }

  // pipeline パートを追加
  if (pipMatch) {
    try {
      const pipelineData = JSON.parse(pipMatch[1]!) as PipelineData;
      if (pipelineData && typeof pipelineData === "object" && pipelineData.type) {
        parts.push({ type: "pipeline", content: "", pipelineData });
      }
    } catch {
      // JSON パース失敗時は無視
    }
  }

  // generate パートを追加
  if (hasGenerate) {
    parts.push({ type: "generate", content: "" });
  }

  // --- が見つからなかった場合: 全体が短ければ draft 扱い
  // ただし質問・提案・箇条書きを含む場合は対話テキストなので draft にしない
  if (parts.length === 1 && parts[0]!.type === "text") {
    const t = parts[0]!.content;
    const isConversational = t.includes("？") || t.includes("?") || t.includes("ください")
      || t.includes("ましょう") || t.includes("します") || t.includes("ました")
      || t.includes("以下") || t.includes("- ") || t.includes("1.") || t.includes("①");
    if (t.length <= 300 && !isConversational) {
      return [{ type: "draft", content: t }];
    }
  }

  return parts;
}


export function ChatPanel({ draft, onCollapse, onApplyText, onSkillActivated, pendingContexts, onContextRemove, agentName = "Partner", initialConversationId, onConversationCreated, platformId, aiContext, allContents, policy, onPolicyUpdate, workflowState, onApprove, onPublish, activeStyleConfig, pipelinePlan, pipelineStarted, onPipelineStart, onStepApprove, onPlatformsSelect, onStyleUpdate, onTabSwitch, onEnhance }: ChatPanelProps) {
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId ?? null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashCatIndex, setSlashCatIndex] = useState(0);
  const [slashSubIndex, setSlashSubIndex] = useState(0);
  const [slashExpanded, setSlashExpanded] = useState(false);
  const [chatMode, setChatMode] = useState<ChatMode>("normal");
  const [pointerActive, setPointerActive] = useState(false);
  const [selectedModel, setSelectedModel] = useSelectedModel();
  const [modelToast, setModelToast] = useState<string | null>(null);
  const modelToastTimerRef = useRef<number | null>(null);
  const handleModelChange = useCallback(
    (id: string) => {
      setSelectedModel(id);
      const m = getModelById(id);
      if (!m) return;
      setModelToast(`次のメッセージから ${m.name} を使います`);
      if (modelToastTimerRef.current !== null) {
        window.clearTimeout(modelToastTimerRef.current);
      }
      modelToastTimerRef.current = window.setTimeout(() => {
        setModelToast(null);
        modelToastTimerRef.current = null;
      }, 3000);
    },
    [setSelectedModel],
  );
  // cleanup
  useEffect(() => {
    return () => {
      if (modelToastTimerRef.current !== null) {
        window.clearTimeout(modelToastTimerRef.current);
      }
    };
  }, []);

  // ポインターモードなどから組み立て済みメッセージを入力欄に挿入するイベント購読
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ text: string; autoSend?: boolean }>).detail;
      if (!detail?.text) return;
      setInput(detail.text);
      // autoSend フラグは将来用途のため現状は無視
    };
    window.addEventListener("akari:chat-insert", handler);
    return () => window.removeEventListener("akari:chat-insert", handler);
  }, []);

  // ポインターモード state 追随（入力欄左のボタンで active 表示）
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ active: boolean }>).detail;
      setPointerActive(!!detail?.active);
    };
    window.addEventListener("akari:pointer-mode-changed", handler);
    return () => window.removeEventListener("akari:pointer-mode-changed", handler);
  }, []);

  // --- D&D ブロックカード: 内部で順序管理 ---
  const [internalContexts, setInternalContexts] = useState<ContextItem[]>(pendingContexts ?? []);
  // ポインターモードで追加されたコンテキスト (ローカル管理)
  const [pointerContexts, setPointerContexts] = useState<ContextItem[]>([]);
  // Pool ピッカーで追加されたコンテキスト (ローカル管理)
  const [poolPickerContexts, setPoolPickerContexts] = useState<ContextItem[]>([]);
  const [poolPickerOpen, setPoolPickerOpen] = useState(false);
  const poolPickerBtnRef = useRef<HTMLButtonElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 親から pendingContexts が変わったら内部を同期（追加・削除の反映）
  useEffect(() => {
    setInternalContexts((prev) => {
      const incoming = pendingContexts ?? [];
      if (incoming.length === 0) return [];
      // 既存の順序を維持しつつ、新規追加分を末尾に、削除分を除去
      const incomingIds = new Set(incoming.map((c) => c.id));
      const kept = prev.filter((c) => incomingIds.has(c.id));
      const keptIds = new Set(kept.map((c) => c.id));
      const added = incoming.filter((c) => !keptIds.has(c.id));
      return [...kept, ...added];
    });
  }, [pendingContexts]);

  // ポインターモードからのコンテキスト追加イベント購読
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ context: ContextItem }>).detail;
      if (!detail?.context) return;
      setPointerContexts((prev) => [...prev, detail.context]);
    };
    window.addEventListener("akari:context-add", handler);
    return () => window.removeEventListener("akari:context-add", handler);
  }, []);

  // ポインターコンテキストの削除 (ローカル管理分)
  const removePointerContext = useCallback((id: string): void => {
    setPointerContexts((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // Pool ピッカーコンテキストの追加・削除 (ローカル管理分)
  const addPoolPickerContext = useCallback((ctx: PresetContext): void => {
    setPoolPickerContexts((prev) => [...prev, ctx]);
  }, []);
  const removePoolPickerContext = useCallback((id: string): void => {
    setPoolPickerContexts((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // 表示用: 親から来た context + ポインター + Pool ピッカーで追加した分をマージ
  const orderedContexts = [...internalContexts, ...pointerContexts, ...poolPickerContexts];

  const handleDragStart = useCallback((e: DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e: DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: DragEvent, targetIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndex;
    setDragIndex(null);
    setDragOverIndex(null);
    if (fromIndex === null || fromIndex === targetIndex) return;
    setInternalContexts((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(fromIndex, 1);
      if (!moved) return prev;
      copy.splice(targetIndex, 0, moved);
      return copy;
    });
  }, [dragIndex]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // 初回マウントで会話を初期化（Work に保存済みの conversationId があれば復元）
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        if (initialConversationId) {
          // Work に紐づく会話を復元
          try {
            const history = await readResourceJson<ConversationMessage[]>(
              `akari://conversations/${initialConversationId}`,
            );
            if (cancelled) return;
            setConversationId(initialConversationId);
            const uiMessages: ChatMessage[] = history
              .filter((m) => m.role === "user" || m.role === "assistant")
              .map((m) => ({
                id: uuid(),
                role: m.role as "user" | "assistant",
                content: m.role === "user" ? extractUserText(m.content) : m.content,
                createdAt: m.createdAt,
              }));
            setMessages(uiMessages);
            return;
          } catch {
            // 履歴復元失敗 → 新規発行にフォールバック
          }
        }
        // 新規会話 ID を発行
        const res = await callToolJson<PartnerNewConversationResult>("partner_new_conversation");
        if (!cancelled) {
          setConversationId(res.conversationId);
          onConversationCreated?.(res.conversationId);
          // 自動ヒアリング: 新規会話時にウェルカムメッセージ
          setMessages([{
            id: uuid(),
            role: "assistant",
            content: "何を投稿しますか？目的を教えてください。\n\n自由に話しかけるか、プランモードで一緒に考えましょう。\n\n[suggestions]\nイベント告知|イベントの告知をしたい\n商品紹介|商品やサービスを紹介したい\n日常シェア|日常の出来事を投稿したい\nノウハウ共有|知識やTipsをまとめたい\n📋 プランモードで一緒に考える|/プラン 投稿の目的から一緒に考えてほしい\n[/suggestions]",
            displayedChars: 0,
            createdAt: Date.now(),
          }]);
        }
      } catch {
        // daemon 未接続時は黙って待つ
      }
    }
    void init();
    return () => { cancelled = true; };
  }, []);

  // 外部（handleEnhance 等）で conversationId が作成された場合に同期
  useEffect(() => {
    if (initialConversationId && !conversationId) {
      setConversationId(initialConversationId);
    }
  }, [initialConversationId, conversationId]);

  // タイピングエフェクト
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.role !== "assistant") return;
    if (lastMsg.displayedChars === undefined) return;
    if (lastMsg.displayedChars >= lastMsg.content.length) return;

    const timer = setTimeout(() => {
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1]!;
        if (last.displayedChars !== undefined) {
          // 1回に3-8文字ずつ表示 (速めのタイピング)
          const step = Math.min(5 + Math.floor(Math.random() * 4), last.content.length - last.displayedChars);
          copy[copy.length - 1] = { ...last, displayedChars: last.displayedChars + step };
        }
        return copy;
      });
    }, 20);
    return () => clearTimeout(timer);
  }, [messages]);

  // 自動サマリー: 方針+スタイル+SNS が揃ったら承認確認メッセージを自動表示
  // プランモード中は AI が [generate] タグで確認するので無効
  const lastApprovalKey = useRef<string>("");
  useEffect(() => {
    if (chatMode === "plan") return;
    if (!workflowState || !policy || !activeStyleConfig) return;
    if (!isReadyForApproval(workflowState)) return;

    // 同じ条件で2回表示しない
    const key = `${policy.templateId}:${JSON.stringify(policy.fields)}:${activeStyleConfig.base.name}`;
    if (lastApprovalKey.current === key) return;
    lastApprovalKey.current = key;

    const polCtx = policyToPromptContext(policy);
    const summary = {
      policy: polCtx.split("\n").slice(0, 2).join(" / "),
      style: activeStyleConfig.base.name,
      platforms: undefined as string[] | undefined,
    };
    // platforms は workflowState から取得できないが、allContents のキーから推定
    if (allContents) {
      summary.platforms = Object.keys(allContents).map((pid) => {
        try { return getPlatform(pid).name; } catch { return pid; }
      });
    }

    const pipelineJson = JSON.stringify({ type: "approval-request", summary });
    setMessages((prev) => [
      ...prev,
      {
        id: uuid(),
        role: "assistant",
        content: `投稿の準備が整いました。内容を確認してください。\n\n[pipeline]${pipelineJson}[/pipeline]`,
        createdAt: Date.now(),
      },
    ]);
  }, [workflowState, policy, activeStyleConfig, allContents]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading || !conversationId) return;

    const userMsg: ChatMessage = {
      id: uuid(),
      role: "user",
      content: msg,
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setShowSlashMenu(false);

    // 「生成して」系キーワードを検出 → AI に投稿文を書かせず handleEnhance を直接実行
    const generateKeywords = /生成し|生成して|生成したい|エンハンス|リライト/;
    if (onEnhance && generateKeywords.test(msg)) {
      const confirmMsg: ChatMessage = {
        id: uuid(),
        role: "assistant",
        content: "設定した内容で各 SNS の投稿文を生成します。\n\n[generate]",
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, confirmMsg]);
      return;
    }

    setLoading(true);
    // 送信時にローカル管理コンテキストをクリア (親管理の context は親側が制御)
    // orderedContexts は render-time に算出されるので、送信に使う値はクリア前のものが渡る
    setPointerContexts([]);
    setPoolPickerContexts([]);

    try {
      const pf = platformId ? getPlatform(platformId) : null;
      const pfInfo = pf ? `${pf.name} (${pf.description})\n[スペック]\n${pf.facts.join("\n")}\n[ノウハウ]\n${pf.knowhow.map((k) => k.text).join("\n")}` : undefined;
      // スラッシュコマンドのスキルコンテキストを注入
      // /プラン コマンド検出 → プランモードに切替
      if (msg.startsWith("/プラン")) {
        setChatMode("plan");
      }

      let skillContext = aiContext;
      const slashMatch = msg.match(/^\/(添削|キャッチー|短く|フック|別案|翻訳)/);
      if (slashMatch) {
        const skillMap: Record<string, string> = { "添削": "polish", "キャッチー": "catchy", "短く": "shorten", "フック": "hook", "別案": "alternative", "翻訳": "translate" };
        const skillId = skillMap[slashMatch[1]];
        if (skillId) {
          const saved = localStorage.getItem(`akari.skill.context.${skillId}`);
          if (saved?.trim()) {
            skillContext = (skillContext ?? "") + `\n[スキル補足: ${slashMatch[1]}]\n${saved}`;
          }
        }
      }
      const polCtx = policy ? policyToPromptContext(policy) : undefined;
      const styleCtx = activeStyleConfig && platformId ? styleConfigToPromptContext(activeStyleConfig, platformId) : undefined;
      const selectedPFs = allContents ? Object.keys(allContents) : undefined;
      let builtMessage = buildMessage(msg, draft, orderedContexts.length > 0 ? orderedContexts : pendingContexts, pfInfo, skillContext, allContents, polCtx, policy, styleCtx, selectedPFs);
      if (chatMode === "deep") {
        builtMessage = `[モード: 対話深掘り]\n質問を重ねてユーザーの意図を徹底的に確認してください。リライトや文案は出さず、質問だけしてください。\n\n${builtMessage}`;
      } else if (chatMode === "plan") {
        builtMessage = `[モード: プランモード]
投稿プランナーとして対話してください。

## 最重要ルール（絶対厳守）
- 日本語で応答すること。英語を混ぜない。
- あなたは「設定を決める」役割。投稿文を書く役割ではない。
- 投稿文・下書き・文案・例文を一切書いてはいけない。生成フェーズでも書かない。
- 生成は UI の handleEnhance が自動実行する。あなたは [generate] タグを付けるだけ。
- 「こんな感じの文章」「例えば」等の文例提示も禁止。

## 進め方
まず [現在の設定状況] を確認し、3つの設定（方針・SNS・スタイル）のうち未設定のものだけヒアリングする。設定済みのものは「この設定のままでいいですか？」と短く確認するだけでよい。
1. 方針（テンプレート + メモ）が未設定 → ヒアリングして [policy-update] タグ。設定済みなら確認だけ
2. SNSが未選択 → 提案して [sns-update] タグ。選択済みなら確認だけ
3. スタイルがデフォルト → 提案して [style-update] タグ。設定済みなら確認だけ
4. 全て揃ったら「これで生成しますか？」+ [generate] タグ
各ステップでユーザーが「反映して次へ」を押すまで待つ。

## 1メッセージのルール
- 1メッセージで1つのことだけ
- 更新タグを出したらそのメッセージはそれで終わり。質問を追加するな
- 更新タグは1メッセージに1つだけ
- 更新タグと [suggestions] / [questions] を同じメッセージに絶対に混ぜない
- 確認なしに次に進まない（UI の「反映して次へ」ボタンをユーザーが押すまで待つ）

## 更新タグ（提案時にテキストの末尾に付ける。タグはシステムが処理するので人間には見えない）
方針: [policy-update]{"templateId":"ID","fields":{"key":"val"},"memo":"補足"}[/policy-update]
SNS: [sns-update]{"platforms":["X","Threads"]}[/sns-update]
スタイル: [style-update]{"tone":"カジュアル","emojiUsage":"普通","hashtagRule":"3個"}[/style-update]

## 内部参照用（ユーザーに見せるな）
templateID: free, event, product, release, blog_share, daily, quote, tips, news, thread
SNS: X, Threads, Facebook, IGフィード, IGストーリー, IGリール, TikTok, YouTube, YTショート, note, ブログ

## 禁止事項（違反するとエラーになる）
- ❌ 投稿文を書く（「〜についての投稿文です」等）
- ❌ 文例・サンプル文を提示する
- ❌ --- で囲んだブロックを出力する
- ❌ [platform-results] タグを出力する
- ❌ 1メッセージに複数の更新タグを含める
- ❌ テンプレートID・フィールドID・技術情報をユーザーに見せる

${builtMessage}`;
      }
      const response = await callToolJson<PartnerChatResponse>("partner_chat", {
        conversationId,
        message: builtMessage,
        model: selectedModel.id,
      });
      const assistantMsg: ChatMessage = {
        id: uuid(),
        role: "assistant",
        content: response.text,
        displayedChars: 0, // タイピングエフェクト開始
        createdAt: Date.now(),
        delegations: response.delegations?.length > 0 ? response.delegations : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // 更新タグに連動してサイドパネルのタブを自動切替
      if (onTabSwitch) {
        const rt = response.text;
        if (rt.includes("[policy-update]")) onTabSwitch("policy");
        else if (rt.includes("[sns-update]")) onTabSwitch("sns");
        else if (rt.includes("[style-update]")) onTabSwitch("style");
      }
    } catch {
      // エラー時
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // スラッシュメニュー表示中のキー操作
    if (showSlashMenu) {
      const cats = SLASH_CATEGORIES;
      if (slashExpanded) {
        // サブアイテム操作
        const items = cats[slashCatIndex]?.items ?? [];
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashSubIndex((i) => (i + 1) % items.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashSubIndex((i) => (i - 1 + items.length) % items.length);
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "Escape") {
          e.preventDefault();
          setSlashExpanded(false);
          return;
        }
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          const item = items[slashSubIndex];
          if (item) selectSlashItem(item);
          return;
        }
      } else {
        // カテゴリ操作
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashCatIndex((i) => (i + 1) % cats.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashCatIndex((i) => (i - 1 + cats.length) % cats.length);
          return;
        }
        if (e.key === "ArrowRight" || e.key === "Enter") {
          e.preventDefault();
          setSlashExpanded(true);
          setSlashSubIndex(0);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowSlashMenu(false);
          return;
        }
      }
    }

    // Cmd+Enter で送信 (Enter 単体は改行)
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  function handleInputChange(value: string) {
    setInput(value);
    const isSlash = value.startsWith("/") && value.length > 0 && value.length < 20;
    setShowSlashMenu(isSlash);
    if (isSlash) {
      setSlashCatIndex(0);
      setSlashSubIndex(0);
      setSlashExpanded(false);
    }
  }

  function selectSlashItem(item: SlashItem) {
    setShowSlashMenu(false);
    setSlashExpanded(false);

    if (item.action === "mode-normal") {
      setChatMode("normal");
      setInput("");
    } else if (item.action === "mode-deep") {
      setChatMode("deep");
      setInput("");
    } else if (item.action === "mode-plan") {
      setChatMode("plan");
      setInput("");
      setMessages((prev) => [
        ...prev,
        {
          id: uuid(),
          role: "assistant",
          content: "📋 **プランモードに入りました**\n\n投稿の目的から一緒に決めていきましょう。まず、何を伝えたいですか？\n\n[suggestions]\nニュース発信|最新のニュースを発信したい\n商品・サービス紹介|商品やサービスを紹介したい\nイベント告知|イベントの告知をしたい\nノウハウ共有|知識やTipsをまとめたい\n[/suggestions]",
          createdAt: Date.now(),
        },
      ]);
    } else if (item.inputText) {
      setInput(item.inputText);
      if (item.skillId && onSkillActivated) onSkillActivated(item.skillId);
    }
    inputRef.current?.focus();
  }

  async function resetConversation() {
    try {
      const res = await callToolJson<PartnerNewConversationResult>("partner_new_conversation");
      setConversationId(res.conversationId);
      onConversationCreated?.(res.conversationId);
      setMessages([{
        id: uuid(),
        role: "assistant",
        content: "何を投稿しますか？目的を教えてください。\n\n自由に話しかけるか、プランモードで一緒に考えましょう。\n\n[suggestions]\nイベント告知|イベントの告知をしたい\n商品紹介|商品やサービスを紹介したい\n日常シェア|日常の出来事を投稿したい\nノウハウ共有|知識やTipsをまとめたい\n📋 プランモードで一緒に考える|/プラン 投稿の目的から一緒に考えてほしい\n[/suggestions]",
        displayedChars: 0,
        createdAt: Date.now(),
      }]);
      setChatMode("normal");
    } catch {
      // ignore
    }
  }


  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold akari-gradient-text tracking-wider">
            {agentName}
          </span>
          {/* モード切替 */}
          <button
            onClick={() => setChatMode((m) => m === "normal" ? "plan" : m === "plan" ? "deep" : "normal")}
            className={`text-[9px] px-1.5 py-0.5 rounded-full border transition ${
              chatMode !== "normal"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
            title={chatMode === "plan" ? "プランモード ON" : chatMode === "deep" ? "深掘りモード ON" : "普通モード"}
          >
            {chatMode === "plan" ? "📋 プラン" : chatMode === "deep" ? "🔍 深掘り" : "💬 普通"}
          </button>
          {/* モデルセレクタ */}
          <ModelSelector value={selectedModel.id} onChange={handleModelChange} compact />
          {/* まとめボタン (深掘りモード時) */}
          {chatMode === "deep" && messages.length >= 2 && (
            <button
              onClick={() => void send("これまでの会話をまとめて、投稿に使える文章にしてください。")}
              className="text-[9px] px-1.5 py-0.5 rounded-full border border-primary/40 text-primary hover:bg-primary/10 transition"
              title="会話をまとめて書き出し"
            >
              📝 まとめ
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={resetConversation} className="text-[10px] text-muted-foreground hover:text-foreground transition px-1" title="会話をリセット">
            reset
          </button>
          <button onClick={onCollapse} className="text-muted-foreground hover:text-foreground transition p-0.5">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* モデル変更トースト */}
      {modelToast && (
        <div className="px-3 py-1.5 bg-primary/10 border-b border-primary/20 text-[10px] text-primary shrink-0">
          {modelToast}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground opacity-60 px-2">
            <p className="text-[11px]">Partner に相談</p>
            <p className="text-[10px] mt-1">/ コマンド · Cmd+Enter 送信</p>
          </div>
        )}
        {messages.map((msg) => {
          const fullText = msg.content;
          const displayText = msg.role === "assistant" && msg.displayedChars !== undefined
            ? fullText.slice(0, msg.displayedChars)
            : fullText;
          const isTyping = msg.role === "assistant" && msg.displayedChars !== undefined && msg.displayedChars < fullText.length;
          const doneTyping = msg.role === "assistant" && !isTyping;

          // AI メッセージをパースして draft ブロックを検出
          const parts = doneTyping ? parseMessage(fullText) : null;

          return (
            <div key={msg.id} className={`mb-3 ${msg.role === "user" ? "text-right" : ""} animate-fade-in`}>
              {/* ユーザーメッセージ or タイピング中 */}
              {(!parts) && (
                <div className={`inline-block max-w-[90%] rounded-lg px-3 py-1.5 text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}>
                  {msg.role === "user" && displayText.startsWith("以下の条件でお願いします:") ? (
                    <UserConditionsMessage text={displayText} />
                  ) : (
                    <div className="whitespace-pre-wrap">{displayText}{isTyping && <span className="animate-typing">▊</span>}</div>
                  )}
                </div>
              )}

              {/* サブエージェント委譲の折りたたみ (タイピング完了後に表示) */}
              {doneTyping && msg.delegations && msg.delegations.length > 0 && (
                <div className="max-w-[90%] mb-1">
                  <DelegationAccordion delegations={msg.delegations} />
                </div>
              )}

              {/* AI メッセージ (パース済み) — 1 つのバブル内で draft/suggestions を表示 */}
              {parts && (
                <div className="max-w-[90%] rounded-lg bg-muted text-foreground overflow-hidden">
                  {parts.map((part, i) => (
                    part.type === "text" ? (
                      <div key={i} className="px-3 py-1.5 text-xs leading-relaxed">
                        <div className="whitespace-pre-wrap">{part.content}</div>
                      </div>
                    ) : part.type === "questions" && part.questions ? (
                      <div key={i} className="px-2 py-2">
                        <QuestionsWizard
                          questions={part.questions}
                          onComplete={(answers) => {
                            // SNS 選択の回答があればプラットフォームを自動追加
                            const platformAnswer = answers["platforms"] || answers["投稿先を選んでください（複数OK）"];
                            if (platformAnswer && onPlatformsSelect) {
                              const nameToId: Record<string, string> = {
                                "X": "x", "X長文": "x_long", "Threads": "threads",
                                "Facebook": "facebook", "IGフィード": "ig_feed",
                                "IGストーリー": "ig_story", "IGリール": "ig_reel",
                                "Instagram": "ig_feed", "TikTok": "tiktok",
                                "YouTube": "youtube", "YTショート": "youtube_short",
                                "note": "note", "Note": "note", "ブログ": "blog",
                              };
                              const selected = platformAnswer.split(",").map((s: string) => s.trim());
                              const ids = selected.map((name: string) => nameToId[name] || name.toLowerCase()).filter(Boolean);
                              if (ids.length > 0) onPlatformsSelect(ids);
                            }
                            const lines = Object.entries(answers)
                              .filter(([, v]) => v)
                              .map(([k, v]) => `- ${k}: ${v}`);
                            void send("以下の条件でお願いします:\n" + lines.join("\n"));
                          }}
                          onCancel={() => {}}
                        />
                      </div>
                    ) : part.type === "platformResults" && part.platformResults ? (
                      <div key={i} className="mx-2 my-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/5 px-3 py-2">
                        <div className="text-[10px] font-medium text-emerald-400 mb-1">生成結果</div>
                        <div className="text-xs text-muted-foreground">
                          {part.platformResults.length} 件の投稿文をメインパネルに反映しました
                        </div>
                      </div>
                    ) : part.type === "policyUpdate" && part.policyUpdate ? (
                      <div key={i} className="mx-2 my-1.5 rounded-md border border-blue-400/30 bg-blue-400/5 px-3 py-2">
                        <div className="text-[10px] font-medium text-blue-400 mb-1.5">方針の更新提案</div>
                        <div className="text-xs leading-relaxed space-y-0.5">
                          {part.policyUpdate.templateId && (() => {
                            const tmpl = getTemplate(part.policyUpdate!.templateId!);
                            return (
                              <div className="flex gap-1">
                                <span className="text-muted-foreground">タイプ:</span>
                                <span>{tmpl.icon} {tmpl.name}</span>
                              </div>
                            );
                          })()}
                          {part.policyUpdate.fields && Object.entries(part.policyUpdate.fields).map(([k, v]) => {
                            // フィールドIDをテンプレートのラベルに変換
                            const tmpl = part.policyUpdate?.templateId ? getTemplate(part.policyUpdate.templateId) : null;
                            const field = tmpl?.fields.find((f) => f.id === k);
                            const label = field?.label ?? k;
                            return (
                              <div key={k} className="flex gap-1">
                                <span className="text-muted-foreground">{label}:</span>
                                <span>{v}</span>
                              </div>
                            );
                          })}
                        </div>
                        {onPolicyUpdate && (
                          <PolicyUpdateActions
                            onApprove={() => {
                              onPolicyUpdate(part.policyUpdate!);
                              setMessages((prev) => [...prev, {
                                id: uuid(), role: "user" as const,
                                content: "✓ 目的を反映しました", createdAt: Date.now(),
                              }]);
                            }}
                            onSendFeedback={(text) => void send(text)}
                          />
                        )}
                      </div>
                    ) : part.type === "snsUpdate" && part.snsUpdate ? (
                      <div key={i} className="mx-2 my-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/5 px-3 py-2">
                        <div className="text-[10px] font-medium text-emerald-400 mb-1.5">SNS の更新提案</div>
                        <div className="text-xs leading-relaxed">
                          投稿先: {part.snsUpdate.platforms.join(", ")}
                        </div>
                        {onPlatformsSelect && (
                          <PolicyUpdateActions
                            onApprove={() => {
                              const nameToId: Record<string, string> = {
                                "X": "x", "X長文": "x_long", "Threads": "threads",
                                "Facebook": "facebook", "IGフィード": "ig_feed",
                                "IGストーリー": "ig_story", "IGリール": "ig_reel",
                                "Instagram": "ig_feed", "TikTok": "tiktok",
                                "YouTube": "youtube", "YTショート": "youtube_short",
                                "note": "note", "Note": "note", "ブログ": "blog",
                              };
                              const ids = part.snsUpdate!.platforms.map((name) => nameToId[name] || name.toLowerCase()).filter(Boolean);
                              onPlatformsSelect(ids);
                              setMessages((prev) => [...prev, {
                                id: uuid(), role: "user" as const,
                                content: "✓ SNSを反映しました", createdAt: Date.now(),
                              }]);
                            }}
                            onSendFeedback={(text) => void send(text)}
                          />
                        )}
                      </div>
                    ) : part.type === "styleUpdate" && part.styleUpdate ? (
                      <div key={i} className="mx-2 my-1.5 rounded-md border border-violet-400/30 bg-violet-400/5 px-3 py-2">
                        <div className="text-[10px] font-medium text-violet-400 mb-1.5">スタイルの更新提案</div>
                        <div className="text-xs leading-relaxed space-y-0.5">
                          {part.styleUpdate.tone && (
                            <div className="flex gap-1"><span className="text-muted-foreground">口調:</span><span>{part.styleUpdate.tone}</span></div>
                          )}
                          {part.styleUpdate.emojiUsage && (
                            <div className="flex gap-1"><span className="text-muted-foreground">絵文字:</span><span>{part.styleUpdate.emojiUsage}</span></div>
                          )}
                          {part.styleUpdate.hashtagRule && (
                            <div className="flex gap-1"><span className="text-muted-foreground">ハッシュタグ:</span><span>{part.styleUpdate.hashtagRule}</span></div>
                          )}
                        </div>
                        {onStyleUpdate && (
                          <PolicyUpdateActions
                            onApprove={() => {
                              onStyleUpdate(part.styleUpdate!);
                              setMessages((prev) => [...prev, {
                                id: uuid(), role: "user" as const,
                                content: "✓ スタイルを反映しました", createdAt: Date.now(),
                              }]);
                            }}
                            onSendFeedback={(text) => void send(text)}
                          />
                        )}
                      </div>
                    ) : part.type === "generate" ? (
                      <div key={i} className="mx-2 my-1.5 rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2">
                        <div className="text-[10px] font-medium text-amber-400 mb-1.5">生成準備完了</div>
                        <div className="text-xs text-muted-foreground mb-2">
                          設定した内容で各 SNS の投稿文を生成します
                        </div>
                        {onApprove && (
                          <button
                            onClick={onApprove}
                            className="text-[10px] px-3 py-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 transition font-medium"
                          >
                            ⚡ 生成開始
                          </button>
                        )}
                      </div>
                    ) : part.type === "plan" && part.planSteps ? (
                      <div key={i} className="mx-2 my-1.5">
                        <PlanMessage
                          plan={pipelinePlan ?? createPlanFromAI(part.planSteps!)}
                          started={pipelineStarted}
                          onStart={() => onPipelineStart?.(createPlanFromAI(part.planSteps!))}
                          onStepApprove={onStepApprove}
                        />
                      </div>
                    ) : part.type === "pipeline" && part.pipelineData ? (
                      <div key={i} className="mx-2 my-1.5">
                        <PipelineMessage
                          data={part.pipelineData}
                          onApprove={onApprove}
                          onPublish={onPublish}
                          onRetry={onApprove}
                        />
                      </div>
                    ) : part.type === "suggestions" && part.suggestions ? (
                      <div key={i} className="px-3 py-2 flex flex-wrap gap-1.5">
                        {part.suggestions.map((s, j) => (
                          <button
                            key={j}
                            onClick={() => void send(s.label)}
                            className="text-[11px] px-2.5 py-1 rounded-full border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition font-medium"
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div key={i} className="mx-2 my-1.5 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                        <div className="text-xs leading-relaxed whitespace-pre-wrap">{part.content}</div>
                        {onApplyText && (
                          <button
                            onClick={() => onApplyText(part.content)}
                            className="mt-1.5 text-[10px] text-primary hover:text-primary/80 transition font-medium"
                          >
                            ↩ テキストに反映
                          </button>
                        )}
                      </div>
                    )
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {loading && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="animate-bounce [animation-delay:0ms]">●</span>
            <span className="animate-bounce [animation-delay:150ms]">●</span>
            <span className="animate-bounce [animation-delay:300ms]">●</span>
          </div>
        )}
      </div>

      {/* Slash command menu — ネスト型、入力欄の上にフロート */}
      {showSlashMenu && (
        <div className="relative">
        <div className="absolute bottom-0 left-0 right-0 border border-border rounded-lg bg-card shadow-lg z-10 mb-1 mx-2 flex overflow-hidden">
          {/* カテゴリ列 */}
          <div className="border-r border-border min-w-[100px]">
            {SLASH_CATEGORIES.map((cat, ci) => (
              <button
                key={cat.id}
                onClick={() => { setSlashCatIndex(ci); setSlashExpanded(true); setSlashSubIndex(0); }}
                onMouseEnter={() => setSlashCatIndex(ci)}
                className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition ${
                  ci === slashCatIndex ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <span>{cat.icon}</span>
                <span className="font-medium">{cat.label}</span>
                <ChevronRight className="w-3 h-3 ml-auto opacity-40" />
              </button>
            ))}
            <div className="text-[8px] text-muted-foreground/40 px-2.5 py-1">
              ↑↓ 選択 · → 展開
            </div>
          </div>
          {/* サブアイテム列 — 最大アイテム数分の高さを確保してガタつき防止 */}
          <div className="min-w-[140px]">
            {(() => {
              const maxItems = Math.max(...SLASH_CATEGORIES.map((c) => c.items.length));
              const currentItems = SLASH_CATEGORIES[slashCatIndex]?.items ?? [];
              const slots = Array.from({ length: maxItems }, (_, i) => currentItems[i]);
              return slots.map((item, si) => (
                item ? (
                  <button
                    key={item.id}
                    onClick={() => selectSlashItem(item)}
                    className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition ${
                      slashExpanded && si === slashSubIndex ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <span>{item.label}</span>
                  </button>
                ) : (
                  <div key={`empty-${si}`} className="px-2.5 py-1.5 text-xs">&nbsp;</div>
                )
              ));
            })()}
          </div>
        </div>
        </div>
      )}

      {/* Context block cards (draggable) */}
      {orderedContexts.length > 0 && (
        <div className="border-t border-border px-3 py-2 shrink-0">
          <div className="flex flex-wrap items-stretch gap-1.5">
            {orderedContexts.map((ctx, index) => {
              const isPreset = ctx.type === "preset";
              const isPointer = ctx.type === "pointer-element";
              const cardStyle = isPreset
                ? "bg-violet-500/10 text-violet-400 border-violet-500/20"
                : isPointer
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-primary/10 text-primary border-primary/20";
              const closeStyle = isPreset
                ? "text-violet-400/60 hover:text-violet-400"
                : isPointer
                  ? "text-emerald-400/60 hover:text-emerald-400"
                  : "text-primary/60 hover:text-primary";
              // プレビュー用テキスト
              const preview = isPreset
                ? `${(ctx as PresetContext).category ? `[${(ctx as PresetContext).category}] ` : ""}${(ctx as PresetContext).content.slice(0, 20)}`
                : isPointer
                  ? (ctx as PointerElementContext).content.slice(0, 24)
                  : ctx.type === "text-selection"
                    ? (ctx as TextSelectionContext).selectedText.slice(0, 20)
                    : ctx.label;
              const tooltip = isPreset
                ? (ctx as PresetContext).content
                : isPointer
                  ? (ctx as PointerElementContext).content
                  : ctx.type === "text-selection"
                    ? (ctx as TextSelectionContext).selectedText
                    : ctx.label;
              const category = isPreset
                ? (ctx as PresetContext).category
                : isPointer
                  ? (ctx as PointerElementContext).tagName?.toLowerCase()
                  : undefined;
              const icon = isPreset ? "🏷" : isPointer ? "🎯" : "📝";
              // 削除ハンドラの切替: ポインター/Pool ピッカー分はローカル、それ以外は親へ
              const handleRemove = isPointer
                ? removePointerContext
                : poolPickerContexts.some((c) => c.id === ctx.id)
                  ? removePoolPickerContext
                  : onContextRemove;

              return (
                <div key={ctx.id} className="relative">
                  {/* ドロップインジケーター（左側） */}
                  {dragOverIndex === index && (
                    <div className="absolute -left-1 top-0 bottom-0 w-0.5 bg-primary rounded-full" />
                  )}
                  <div
                    draggable
                    onDragStart={(e: DragEvent) => handleDragStart(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e: DragEvent) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e: DragEvent) => handleDrop(e, index)}
                    className={`flex flex-col gap-0.5 px-2.5 py-1.5 rounded-lg border cursor-grab active:cursor-grabbing transition-opacity ${cardStyle} ${
                      dragIndex === index ? "opacity-50" : ""
                    }`}
                    title={tooltip}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px]">{icon}</span>
                      {category && (
                        <span className="text-[9px] opacity-70">[{category}]</span>
                      )}
                      <span className="text-[10px] font-medium truncate max-w-[100px]">{ctx.label}</span>
                      {handleRemove && (
                        <button
                          onClick={() => handleRemove(ctx.id)}
                          className={`${closeStyle} ml-auto text-[10px]`}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="text-[9px] opacity-60 truncate max-w-[160px]">{preview}</div>
                  </div>
                  {/* 最後の要素の右側ドロップインジケーター */}
                  {dragOverIndex === orderedContexts.length && index === orderedContexts.length - 1 && (
                    <div className="absolute -right-1 top-0 bottom-0 w-0.5 bg-primary rounded-full" />
                  )}
                </div>
              );
            })}
          </div>
          {/* すべてクリアボタン */}
          {orderedContexts.length > 1 && (
            <button
              onClick={() => {
                // ローカル管理分は一括クリア、親管理の分は 1 件ずつ親に通知
                setPointerContexts([]);
                setPoolPickerContexts([]);
                if (onContextRemove) {
                  internalContexts.forEach((ctx) => onContextRemove(ctx.id));
                }
              }}
              className="mt-1 text-[9px] text-muted-foreground hover:text-foreground transition"
            >
              クリア
            </button>
          )}
        </div>
      )}

      {/* Workflow progress bar */}
      {workflowState && (
        <WorkflowBar workflowState={workflowState} pipelinePlan={pipelinePlan} />
      )}

      {/* Input */}
      <div className="border-t border-border px-3 py-2 shrink-0">
        <div className="flex gap-1.5 items-end">
          {/* ポインター起動ボタン (トグル) — pointer mode 中は自身をキャプチャ対象外にする */}
          <button
            type="button"
            data-akari-pointer-exempt
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent("akari:pointer-mode-start", {
                  detail: { skillId: "pointer" },
                }),
              );
            }}
            title={pointerActive ? "ポインターを解除" : "ポインターで画面要素を指して質問"}
            aria-pressed={pointerActive}
            className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-md border transition ${
              pointerActive
                ? "border-primary bg-primary/20 text-primary shadow-[0_0_10px_rgba(249,115,22,0.5)]"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Target className="w-3.5 h-3.5" />
          </button>
          {/* Pool ピッカーボタン */}
          <button
            ref={poolPickerBtnRef}
            type="button"
            onClick={() => setPoolPickerOpen((v) => !v)}
            title="Pool 素材を追加"
            aria-pressed={poolPickerOpen}
            className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-md border transition ${
              poolPickerOpen
                ? "border-violet-400 bg-violet-400/20 text-violet-400"
                : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
          </button>
          {poolPickerOpen && poolPickerBtnRef.current && (
            <PoolPickerPopup
              anchorRect={poolPickerBtnRef.current.getBoundingClientRect()}
              onClose={() => setPoolPickerOpen(false)}
              onAddContext={addPoolPickerContext}
              addedNames={new Set(poolPickerContexts.map((c) => c.label))}
              triggerRef={poolPickerBtnRef}
            />
          )}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="/ コマンド · Cmd+Enter 送信"
            disabled={loading || !conversationId}
            rows={3}
            className="flex-1 min-h-[56px] max-h-[200px] resize-y rounded-md border border-input bg-transparent px-2 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          <Button onClick={() => void send()} disabled={loading || !input.trim() || !conversationId} size="sm" className="h-8 px-2 text-xs">
            送信
          </Button>
        </div>
      </div>
    </div>
  );
}
