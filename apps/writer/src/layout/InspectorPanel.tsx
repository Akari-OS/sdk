/**
 * Inspector Panel — タブ切替 (プレビュー / スキル / アクション)。
 *
 * spec: AKARI-HUB-009 §8
 * Video の ArticleInspector 参考: タブ + アコーディオンセクション。
 */

import { useState, useEffect, useCallback } from "react";
import { ImagePreviewModal } from "@/components/ui/ImagePreview";
import { getSnsAccount } from "../lib/account-store";
import { PlatformKnowledge, KnowledgeButton } from "./PlatformKnowledge";
import { QualityCheckSection } from "../components/QualityCheckSection";
import { TimingSuggestions } from "../components/TimingSuggestions";
import { splitThread, isThreadContent } from "../lib/thread-utils";
import { ChevronRight, ChevronDown, Wand2, Send, FileText, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { callToolJson } from "@/lib/api";
import type { PublishResult } from "@/lib/types";
import {
  DeviceFrame,
  DeviceSelector,
  type DeviceType,
} from "@/components/preview/DeviceFrame";
import { PreviewRouter, type PreviewTheme } from "@/components/preview/PreviewRouter";
import {
  TONE_PRESETS,
  LENGTH_PRESETS,
  type ToneId,
  type LengthId,
  type WritingOptions,
  getPlatform,
  buildWritingPrompt,
} from "@/lib/platforms";
import { callToolText } from "@/lib/api";
import type { PartnerNewConversationResult } from "@/lib/types";
import { callToolJson as callToolJsonTyped } from "@/lib/api";
import type { MediaAttachment } from "@/lib/media";
import { useSelectedModel } from "@/lib/model-store";

function countChars(text: string): number {
  return [...text].length;
}

// === テンプレート ===

interface Template {
  id: string;
  name: string;
  text: string;
  platformId: string;
  createdAt: number;
}

const TEMPLATES_KEY = "akari.templates";

function loadTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    return raw ? (JSON.parse(raw) as Template[]) : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: Template[]): void {
  localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
}

function ToggleChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] px-1.5 py-0.5 rounded transition ${
        active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {active ? "✓ " : ""}{label}
    </button>
  );
}

// === Skill 定義 ===

export interface SkillDef {
  id: string;
  label: string;
  icon: string;
  description: string;
  /** Chat の / コマンド名 */
  slashCommand?: string;
  /** 未実装（Coming Soon）表示にする */
  comingSoon?: boolean;
  /** 特殊スキル（通常のコンテキスト渡しではなく独自 UI を持つ） */
  kind?: "pointer" | "generate";
}

export const SKILLS: SkillDef[] = [
  { id: "polish", label: "添削", icon: "✏️", description: "文章をブラッシュアップ", slashCommand: "/添削" },
  { id: "catchy", label: "キャッチーに", icon: "🔥", description: "インパクト重視に書き換え", slashCommand: "/キャッチー" },
  { id: "shorten", label: "短くする", icon: "✂️", description: "核心だけ残して簡潔に", slashCommand: "/短く" },
  { id: "hook", label: "フック強化", icon: "🎣", description: "冒頭1行をインパクトに", slashCommand: "/フック" },
  { id: "alternative", label: "別案", icon: "🔄", description: "違う切り口の別バージョン", slashCommand: "/別案" },
  { id: "translate", label: "英語翻訳", icon: "🌐", description: "自然な英語に翻訳", slashCommand: "/英語" },
  { id: "generate", label: "AI 生成", icon: "🤖", description: "設定に基づいてゼロから生成", kind: "generate" },
  {
    id: "pointer",
    label: "ポインターで聞く",
    icon: "🎯",
    description: "画面の任意の部分をクリックで指して、そこについて質問できます。",
    kind: "pointer",
  },
  {
    id: "research",
    label: "調べる",
    icon: "🔎",
    description: "Web 検索して内容をまとめます。",
    comingSoon: true,
  },
];

// === Tab types ===

type InspectorTab = "overview" | "templates" | "skills" | "actions";

interface InspectorPanelProps {
  draft: string;
  platformId: string;
  onPlatformChange?: (platformId: string) => void;
  tone: ToneId | null;
  onToneChange: (tone: ToneId | null) => void;
  media: MediaAttachment[];
  onApplyGenerated: (text: string) => void;
  onCollapse: () => void;
  /** Chat から / コマンドが発動した時に開くスキル ID */
  activeSkillId?: string | null;
  onSkillHandled?: () => void;
  /** AI に自動送信するコンテキストメモ */
  aiContext?: string;
  onAiContextChange?: (text: string) => void;
  /** 選択された投稿先プラットフォーム */
  selectedPlatforms?: string[];
  /** コンテキストチップを Chat に追加 */
  onAddContext?: (ctx: import("@/lib/context-selection").ContextItem) => void;
  /** 品質チェック結果 */
  qualityReport?: import("../lib/quality-check").QualityReport | null;
}

export function InspectorPanel({
  draft,
  platformId,
  tone,
  onToneChange,
  media,
  onApplyGenerated,
  onCollapse,
  activeSkillId,
  onSkillHandled,
  aiContext = "",
  onAiContextChange,
  onAddContext,
  selectedPlatforms = [],
  qualityReport,
}: InspectorPanelProps) {
  const [selectedModel] = useSelectedModel();
  const [tab, setTab] = useState<InspectorTab>("overview");
  const [showPreview, setShowPreview] = useState(true);
  const [device, setDevice] = useState<DeviceType>("phone");
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>("dark");
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [openSkill, setOpenSkill] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showKnowledge, setShowKnowledge] = useState(false);

  // テンプレート
  const [templates, setTemplates] = useState<Template[]>(loadTemplates);

  const handleSaveTemplate = useCallback(() => {
    if (!draft.trim()) return;
    const name = window.prompt("テンプレート名を入力");
    if (!name?.trim()) return;
    const newTemplate: Template = {
      id: crypto.randomUUID(),
      name: name.trim(),
      text: draft,
      platformId,
      createdAt: Date.now(),
    };
    const updated = [...templates, newTemplate];
    saveTemplates(updated);
    setTemplates(updated);
  }, [draft, platformId, templates]);

  const handleDeleteTemplate = useCallback((id: string) => {
    const updated = templates.filter((t) => t.id !== id);
    saveTemplates(updated);
    setTemplates(updated);
  }, [templates]);

  // スキル別コンテキストプリセット（localStorage 永続化）
  const [skillContexts, setSkillContexts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const skill of SKILLS) {
      if (skill.id === "generate") continue;
      const saved = localStorage.getItem(`akari.skill.context.${skill.id}`);
      if (saved) initial[skill.id] = saved;
    }
    return initial;
  });

  function updateSkillContext(skillId: string, value: string) {
    setSkillContexts((prev) => ({ ...prev, [skillId]: value }));
    localStorage.setItem(`akari.skill.context.${skillId}`, value);
  }

  // 投稿
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<PublishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // AI 生成設定
  const [aiLength, setAiLength] = useState<LengthId>("standard");
  const [aiKeywords, setAiKeywords] = useState("");
  const [aiHookFirst, setAiHookFirst] = useState(true);
  const [aiNoPeriod, setAiNoPeriod] = useState(true);
  const [aiShortSentences, setAiShortSentences] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);

  const platform = getPlatform(platformId);
  const xAccount = getSnsAccount("x");
  const count = countChars(draft);
  const limit = platform.maxChars;
  const overflow = limit !== null && count > limit;
  const remaining = limit !== null ? limit - count : null;

  // / コマンドから起動: Skills タブに切替 + 該当スキルを開く
  useEffect(() => {
    if (activeSkillId) {
      setTab("skills");
      setOpenSkill(activeSkillId);
      onSkillHandled?.();
    }
  }, [activeSkillId, onSkillHandled]);

  async function publish(dryRun: boolean) {
    if (publishing || draft.trim().length === 0 || overflow) return;
    setPublishing(true);
    setError(null);
    setPublishResult(null);
    try {
      const mediaPayload = media.length > 0
        ? media.map((m) => ({ base64: m.dataUrl, mimeType: "image/jpeg" }))
        : undefined;
      const result = await callToolJson<PublishResult>("operator_publish", {
        target: "x",
        text: draft,
        dryRun,
        media: mediaPayload,
      });
      setPublishResult(result);
    } catch (e) {
      setError(`${e}`);
    } finally {
      setPublishing(false);
    }
  }

  async function generateWithAI() {
    setGenerating(true);
    setGenerated(null);
    try {
      const opts: WritingOptions = {
        tone, length: aiLength, keywords: aiKeywords,
        hookFirst: aiHookFirst, noPeriod: aiNoPeriod, shortSentences: aiShortSentences,
      };
      const prompt = buildWritingPrompt(platform.name, platform.maxChars, opts, draft);
      const conv = await callToolJsonTyped<PartnerNewConversationResult>("partner_new_conversation");
      const text = await callToolText("partner_chat", { conversationId: conv.conversationId, message: prompt, model: selectedModel.id });
      setGenerated(text);
    } catch (e) {
      setError(`${e}`);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      {/* Header + Tabs */}
      <div className="flex items-center justify-between px-2 py-1 border-b border-border shrink-0">
        <div className="flex items-center gap-0.5">
          {([
            { id: "overview" as const, icon: <FileText className="w-3.5 h-3.5" />, label: "概要" },
            { id: "templates" as const, icon: <Bookmark className="w-3.5 h-3.5" />, label: "テンプレ" },
            { id: "skills" as const, icon: <Wand2 className="w-3.5 h-3.5" />, label: "スキル" },
            { id: "actions" as const, icon: <Send className="w-3.5 h-3.5" />, label: "アクション" },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded transition ${
                tab === t.id
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              <span className="text-[7px] leading-none">{t.label}</span>
            </button>
          ))}
        </div>
        <button onClick={onCollapse} className="text-muted-foreground hover:text-foreground transition p-0.5">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {/* === Overview Tab === */}
        {tab === "overview" && (
          <>
            {/* 基本情報 */}
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">📋 基本情報</div>
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium">{platform.icon} {platform.name}</span>
                {limit !== null && (
                  <span className={`text-[10px] font-mono ${overflow ? "text-destructive" : remaining !== null && remaining <= 20 ? "text-primary" : "text-muted-foreground"}`}>
                    {count}/{limit}
                  </span>
                )}
              </div>
              {!platform.enabled && (
                <div className="text-[9px] text-muted-foreground/60 italic">投稿は Phase 1 以降で対応予定</div>
              )}
              {/* 事実スペック */}
              {platform.facts.length > 0 && (
                <div className="space-y-0.5">
                  <div className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">スペック</div>
                  {platform.facts.map((fact, i) => (
                    <div key={i} className="text-[10px] text-muted-foreground flex items-start gap-1 px-1 -mx-1">
                      <span className="text-muted-foreground/40 shrink-0">•</span>
                      <span>{fact}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* ノウハウボタン */}
              {platform.knowhow.length > 0 && (
                <KnowledgeButton onClick={() => setShowKnowledge(true)} count={platform.knowhow.length} />
              )}
              {/* エディター機能 */}
              {platform.editor.features.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {platform.editor.features.map((f) => (
                    <span key={f} className="text-[9px] px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground">{f}</span>
                  ))}
                </div>
              )}
              {/* 画像設定 */}
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground">{platform.media.description}</div>
                <div className="flex flex-wrap gap-1">
                  {platform.media.thumbnail && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground">📷 サムネイル</span>
                  )}
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground">最大{platform.media.maxImages}枚</span>
                  {platform.media.required && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted border border-destructive/50 text-destructive">⚠ 画像必須</span>
                  )}
                  {platform.media.inlineImages && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted border border-border text-muted-foreground">📎 本文内挿入可</span>
                  )}
                </div>
              </div>
            </div>

            {/* AI コンテキスト */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="px-3 py-1.5 bg-muted/30 border-b border-border/50">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">🤖 AI コンテキスト</div>
                <div className="text-[9px] text-muted-foreground/60 mt-0.5">ここに書いた内容は自動で Partner に送信されます</div>
              </div>
              <textarea
                value={aiContext}
                onChange={(e) => onAiContextChange?.(e.target.value)}
                placeholder={`${platform.name} 用の補足情報...\n例: ターゲット層、NG ワード、参考アカウント等`}
                className="w-full text-[11px] px-3 py-2 bg-background border-0 resize-none focus:outline-none placeholder:text-muted-foreground/40"
                rows={3}
              />
            </div>


            {/* プレビュー セクション */}
            <div className="border border-border rounded-lg overflow-hidden">
              <div className="w-full flex items-center gap-1.5 px-3 py-1.5">
                <button
                  onClick={() => setShowPreview((v) => !v)}
                  className="flex items-center gap-1.5 hover:bg-muted/50 transition rounded px-1 -mx-1 py-0.5"
                >
                  {showPreview ? <ChevronDown className="w-3 h-3 text-primary" /> : <ChevronRight className="w-3 h-3" />}
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">👁 プレビュー</span>
                </button>
                <DeviceSelector device={device} onChange={setDevice} />
                <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 bg-background">
                  <button onClick={() => setPreviewTheme("dark")} className={`px-2 py-0.5 text-[10px] rounded transition ${previewTheme === "dark" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>🌙</button>
                  <button onClick={() => setPreviewTheme("light")} className={`px-2 py-0.5 text-[10px] rounded transition ${previewTheme === "light" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>☀️</button>
                </div>
              </div>
              {showPreview && (
                <div className="border-t border-border">
                  <button
                    onClick={() => setPreviewExpanded(true)}
                    className="w-full h-[180px] overflow-hidden bg-background/50 hover:bg-background/70 transition cursor-pointer relative group text-left"
                  >
                    <div className="scale-[0.6] origin-top-left" style={{ pointerEvents: "none", width: "166%" }}>
                      <DeviceFrame device={device} theme={previewTheme}><PreviewRouter platformId={platformId} content={draft} displayName={xAccount?.displayName} username={xAccount?.username} avatarUrl={xAccount?.avatarUrl} mediaUrls={media.map((m) => m.dataUrl)} theme={previewTheme} threadParts={isThreadContent(draft) ? splitThread(draft) : undefined} /></DeviceFrame>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background to-transparent flex items-end justify-center pb-1.5">
                      <span className="text-[10px] text-muted-foreground group-hover:text-primary transition">クリックで拡大</span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* 添付画像 */}
            {media.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">添付画像</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {media.map((m) => (
                    <button key={m.id} onClick={() => setPreviewImage(m.dataUrl)} className="rounded border border-border overflow-hidden hover:border-primary/40 transition cursor-pointer">
                      <img src={m.dataUrl} alt={m.name} className="w-full h-20 object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* === Templates Tab === */}
        {tab === "templates" && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">保存済みテンプレート</span>
              <button
                onClick={handleSaveTemplate}
                disabled={!draft.trim()}
                className="text-[10px] text-primary hover:text-primary/80 disabled:text-muted-foreground/40 disabled:cursor-not-allowed transition"
              >
                + 現在の下書きを保存
              </button>
            </div>
            {templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground/60">
                <Bookmark className="w-6 h-6 mx-auto mb-2 opacity-40" />
                <p className="text-[11px]">テンプレートはまだありません</p>
                <p className="text-[10px] mt-1">下書きを書いて「保存」してください</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {templates.map((t) => (
                  <div key={t.id} className="rounded-lg border border-border hover:border-primary/30 transition group">
                    <button
                      onClick={() => onApplyGenerated(t.text)}
                      className="w-full text-left px-3 py-2"
                      title={t.text.slice(0, 200)}
                    >
                      <div className="text-[11px] font-medium truncate">{t.name}</div>
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5">{t.text.slice(0, 60)}...</div>
                    </button>
                    <div className="flex items-center justify-between px-3 pb-1.5">
                      <span className="text-[9px] text-muted-foreground/50">{t.platformId}</span>
                      <button
                        onClick={() => handleDeleteTemplate(t.id)}
                        className="text-[9px] text-muted-foreground/40 hover:text-destructive transition opacity-0 group-hover:opacity-100"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* === Skills Tab === */}
        {tab === "skills" && (
          <>
            {/* 概念の説明 */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 mb-1">
              <div className="text-[11px] font-medium text-primary mb-0.5">スキルとは</div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                あらかじめ組み込まれた能力（スクリプト）です。実行すると定義された動作を行います。
                各スキルには「追加指示」を書いておけて、実行時にその指示を合わせて AI に渡すことで、
                スキルの挙動を自分好みにカスタマイズできます。
              </p>
            </div>

            {SKILLS.map((skill) => {
              const isOpen = openSkill === skill.id;
              const disabled = skill.comingSoon;
              return (
                <div
                  key={skill.id}
                  className={`border border-border rounded-lg overflow-hidden ${
                    disabled ? "opacity-50" : ""
                  }`}
                >
                  <button
                    onClick={() => !disabled && setOpenSkill(isOpen ? null : skill.id)}
                    disabled={disabled}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-left transition ${
                      disabled ? "cursor-not-allowed" : "hover:bg-muted/50"
                    }`}
                  >
                    {isOpen ? <ChevronDown className="w-3 h-3 text-primary" /> : <ChevronRight className="w-3 h-3" />}
                    <span className="text-xs">{skill.icon}</span>
                    <span className={`text-xs font-medium ${isOpen ? "text-primary" : ""}`}>{skill.label}</span>
                    {skill.comingSoon && (
                      <span className="ml-auto text-[8px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Coming Soon
                      </span>
                    )}
                    {!skill.comingSoon && skill.slashCommand && (
                      <span className="ml-auto text-[9px] text-muted-foreground font-mono">{skill.slashCommand}</span>
                    )}
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 border-t border-border pt-2 space-y-2">
                      <p className="text-[10px] text-muted-foreground">{skill.description}</p>

                      {/* AI 生成スキルの場合は詳細設定を表示 */}
                      {skill.id === "generate" && (
                        <div className="space-y-2">
                          {/* トーン */}
                          <div>
                            <div className="text-[10px] text-muted-foreground mb-1">トーン</div>
                            <div className="flex flex-wrap gap-1">
                              {TONE_PRESETS.map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => onToneChange(tone === t.id ? null : t.id)}
                                  className={`px-1.5 py-0.5 text-[10px] rounded-full border transition ${
                                    tone === t.id ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                                  }`}
                                >
                                  {t.emoji} {t.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* 長さ */}
                          <div>
                            <div className="text-[10px] text-muted-foreground mb-1">長さ</div>
                            <div className="flex gap-1">
                              {LENGTH_PRESETS.map((l) => (
                                <button key={l.id} onClick={() => setAiLength(l.id)}
                                  className={`flex-1 px-2 py-1 text-[10px] rounded border transition ${
                                    aiLength === l.id ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground"
                                  }`}
                                >{l.label}</button>
                              ))}
                            </div>
                          </div>
                          {/* キーワード */}
                          <div>
                            <div className="text-[10px] text-muted-foreground mb-1">キーワード</div>
                            <input value={aiKeywords} onChange={(e) => setAiKeywords(e.target.value)}
                              placeholder="含めたいワード" className="w-full px-2 py-1 text-xs bg-background border border-border rounded focus:border-primary/50 focus:outline-none" />
                          </div>
                          {/* トグル */}
                          <div className="flex flex-wrap gap-x-2 gap-y-1">
                            <ToggleChip label="🔥 冒頭フック" active={aiHookFirst} onClick={() => setAiHookFirst((v) => !v)} />
                            <ToggleChip label="。なし" active={aiNoPeriod} onClick={() => setAiNoPeriod((v) => !v)} />
                            <ToggleChip label="✂️ 短文" active={aiShortSentences} onClick={() => setAiShortSentences((v) => !v)} />
                          </div>
                          <Button onClick={generateWithAI} disabled={generating} size="sm" className="w-full">
                            {generating ? "生成中..." : "AI に書いてもらう"}
                          </Button>
                          {generated && (
                            <div className="rounded border border-primary/30 bg-primary/5 p-2">
                              <div className="text-xs leading-relaxed whitespace-pre-wrap mb-2">{generated}</div>
                              <div className="flex gap-1.5">
                                <Button size="sm" className="flex-1 h-7 text-[11px]" onClick={() => { onApplyGenerated(generated); setGenerated(null); }}>採用する</Button>
                                <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setGenerated(null)}>破棄</Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pointer スキル: 独自 UI（クリックで画面要素を指定） */}
                      {skill.kind === "pointer" && (
                        <div className="space-y-1.5">
                          <textarea
                            value={skillContexts[skill.id] ?? ""}
                            onChange={(e) => updateSkillContext(skill.id, e.target.value)}
                            placeholder="例: 専門用語は避けて初心者向けに説明して"
                            className="w-full text-[11px] px-2 py-1.5 bg-background border border-border rounded resize-none focus:border-primary/50 focus:outline-none placeholder:text-muted-foreground/40"
                            rows={2}
                          />
                          <p className="text-[9px] text-muted-foreground/60">
                            スキルへの追加指示（任意）。起動後に画面上の要素をクリックすると、その内容と上の指示が Chat に渡されます。
                          </p>
                          <Button
                            size="sm"
                            data-akari-pointer-exempt
                            className="w-full h-7 text-[11px]"
                            onClick={() => {
                              window.dispatchEvent(new CustomEvent("akari:pointer-mode-start", { detail: { skillId: skill.id } }));
                            }}
                          >
                            🎯 ポインターを起動
                          </Button>
                        </div>
                      )}

                      {/* 通常スキル: コンテキストプリセット入力 + 実行説明 */}
                      {skill.kind !== "generate" && skill.kind !== "pointer" && !skill.comingSoon && (
                        <div className="space-y-1.5">
                          <textarea
                            value={skillContexts[skill.id] ?? ""}
                            onChange={(e) => updateSkillContext(skill.id, e.target.value)}
                            placeholder="このスキル実行時の追加指示..."
                            className="w-full text-[11px] px-2 py-1.5 bg-background border border-border rounded resize-none focus:border-primary/50 focus:outline-none placeholder:text-muted-foreground/40"
                            rows={2}
                          />
                          <p className="text-[9px] text-muted-foreground/60">
                            入力内容はスキル実行時に自動でプロンプトに含まれます
                          </p>
                          {skill.slashCommand && (
                            <p className="text-[10px] text-muted-foreground italic">
                              Chat で <span className="font-mono text-primary">{skill.slashCommand}</span> と入力して実行
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* === Actions Tab === */}
        {tab === "actions" && (
          <>
            {/* 品質チェック */}
            <QualityCheckSection report={qualityReport ?? null} />

            {/* 投稿タイミング提案 */}
            <TimingSuggestions />

            {/* 投稿先一覧 */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">投稿先</div>
              {selectedPlatforms.length === 0 ? (
                <div className="text-[10px] text-muted-foreground/60 py-2">SNS タブから投稿先を追加してください</div>
              ) : (
                selectedPlatforms.map((pid) => {
                  const p = getPlatform(pid);
                  return (
                    <div key={pid} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{p.icon}</span>
                        <span className="text-xs font-medium">{p.name}</span>
                      </div>
                      {p.enabled ? (
                        <Button
                          onClick={() => void publish(false)}
                          disabled={publishing || draft.trim().length === 0 || overflow}
                          size="sm"
                          className="h-6 text-[10px] px-2"
                        >
                          投稿
                        </Button>
                      ) : (
                        <Button
                          onClick={async () => {
                            try { await navigator.clipboard.writeText(draft); } catch { /* fallback */ }
                          }}
                          disabled={draft.trim().length === 0}
                          variant="secondary"
                          size="sm"
                          className="h-6 text-[10px] px-2"
                        >
                          📋 コピー
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* 一括アクション */}
            {selectedPlatforms.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-border">
                <Button
                  onClick={() => void publish(false)}
                  disabled={publishing || draft.trim().length === 0}
                  size="sm"
                  className="w-full"
                >
                  {publishing ? "投稿中..." : "🚀 今すぐ投稿"}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full opacity-50 cursor-not-allowed"
                  disabled
                >
                  ⏰ 予約投稿 — Coming Soon
                </Button>
                <Button
                  onClick={() => void publish(true)}
                  disabled={publishing || draft.trim().length === 0}
                  variant="secondary"
                  size="sm"
                  className="w-full"
                >
                  ドライラン
                </Button>
              </div>
            )}

            {error && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive text-xs p-2 font-mono whitespace-pre-wrap">{error}</div>
            )}
            {publishResult && <PublishResultCard result={publishResult} />}
          </>
        )}
      </div>

      {/* Preview modal */}
      {previewExpanded && (
        <PreviewModal device={device} onDeviceChange={setDevice} content={draft} mediaUrls={media.map((m) => m.dataUrl)} onClose={() => setPreviewExpanded(false)} displayName={xAccount?.displayName} username={xAccount?.username} avatarUrl={xAccount?.avatarUrl} platformId={platformId} previewTheme={previewTheme} threadParts={isThreadContent(draft) ? splitThread(draft) : undefined} />
      )}

      {/* Image preview modal */}
      {previewImage && (
        <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />
      )}

      {/* Platform knowledge popup */}
      {showKnowledge && (
        <PlatformKnowledge
          platform={platform}
          onClose={() => setShowKnowledge(false)}
          onAddContext={onAddContext}
        />
      )}
    </div>
  );
}

function PublishResultCard({ result }: { result: PublishResult }) {
  const isSuccess = result.status === "success";
  const isFailed = result.status === "failed";
  const isDryRun = isSuccess && result.url?.startsWith("dry-run://");
  const label = isDryRun ? "ドライラン成功" : isSuccess ? "投稿成功" : isFailed ? "投稿失敗" : result.status;
  const colorClass = isFailed ? "border-destructive/50 bg-destructive/10 text-destructive" : isDryRun ? "border-primary/40 bg-primary/5" : isSuccess ? "border-green-500/50 bg-green-500/10" : "border-border bg-card";

  return (
    <div className={`rounded-lg border p-3 text-xs ${colorClass}`}>
      <div className="font-semibold mb-1">{label}</div>
      {isSuccess && result.url && (
        <div className="font-mono break-all opacity-80">
          {isDryRun ? result.url : <a href={result.url} target="_blank" rel="noreferrer" className="underline">{result.url}</a>}
        </div>
      )}
      {isFailed && result.errorMessage && <div className="whitespace-pre-wrap">{result.errorMessage}</div>}
    </div>
  );
}

function PreviewModal({ device, onDeviceChange, content, mediaUrls, onClose, displayName, username, avatarUrl, platformId, previewTheme: initialTheme = "dark", threadParts }: { device: DeviceType; onDeviceChange: (d: DeviceType) => void; content: string; mediaUrls?: string[]; onClose: () => void; displayName?: string; username?: string; avatarUrl?: string; platformId: string; previewTheme?: PreviewTheme; threadParts?: string[] }) {
  const [theme, setTheme] = useState<PreviewTheme>(initialTheme);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="relative max-h-[90vh] overflow-hidden rounded-xl bg-card border border-border p-4 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-3 shrink-0">
          <DeviceSelector device={device} onChange={onDeviceChange} />
          <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 bg-background">
            <button onClick={() => setTheme("dark")} className={`px-2 py-0.5 text-[10px] rounded transition ${theme === "dark" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>🌙</button>
            <button onClick={() => setTheme("light")} className={`px-2 py-0.5 text-[10px] rounded transition ${theme === "light" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>☀️</button>
          </div>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-muted transition">閉じる</button>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-0 overflow-hidden">
          <DeviceFrame device={device} scaleFactor={1.4} theme={theme}><PreviewRouter platformId={platformId} content={content} displayName={displayName} username={username} avatarUrl={avatarUrl} mediaUrls={mediaUrls} theme={theme} threadParts={threadParts} /></DeviceFrame>
        </div>
      </div>
    </div>
  );
}
