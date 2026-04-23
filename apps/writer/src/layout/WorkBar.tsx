/**
 * Work Bar — 上部バー。Work タイトル + 戻るボタン + パネルトグル。
 *
 * 旧 Header (AKARI ブランド表示) を置換する。
 * spec: AKARI-HUB-009 §4
 */

import { useState, useCallback } from "react";
import { ArrowLeft, Settings, ZoomIn, ZoomOut, Save, Sparkles, Pencil, Calendar, Hash, Check, Send } from "lucide-react";

/** AI タイトル生成に渡すオプション */
interface TitleOption {
  id: string;
  label: string;
  icon: React.ReactNode;
  prompt: string;
}

const TITLE_OPTIONS: TitleOption[] = [
  {
    id: "date",
    label: "日付プレフィックス",
    icon: <Calendar className="w-3 h-3" />,
    prompt: "タイトルの先頭に今日の日付（YYYY-MM-DD 形式）を付けてください",
  },
  {
    id: "numbering",
    label: "連番 (#N)",
    icon: <Hash className="w-3 h-3" />,
    prompt: "タイトルの先頭に「#1」のような連番を付けてください",
  },
  {
    id: "short",
    label: "短め (10文字以内)",
    icon: <span className="text-[9px] font-bold">10</span>,
    prompt: "タイトルは10文字以内の簡潔なものにしてください",
  },
  {
    id: "emoji",
    label: "絵文字付き",
    icon: <span className="text-[9px]">😊</span>,
    prompt: "タイトルの先頭に内容に合った絵文字を1つ付けてください",
  },
  {
    id: "space",
    label: "スペース区切り",
    icon: <span className="text-[9px] font-mono">A B</span>,
    prompt: "タイトルの単語間はスペースで区切ってください（詰めないで）",
  },
  {
    id: "hyphen",
    label: "ハイフン区切り",
    icon: <span className="text-[9px] font-mono">A-B</span>,
    prompt: "タイトルの単語間はハイフン（-）で区切ってください",
  },
  {
    id: "underscore",
    label: "アンダーバー区切り",
    icon: <span className="text-[9px] font-mono">A_B</span>,
    prompt: "タイトルの単語間はアンダーバー（_）で区切ってください",
  },
];

interface WorkBarProps {
  title: string;
  onTitleChange: (title: string) => void;
  /** AI タイトル生成に使うテキスト */
  draftText?: string;
  /** AI 呼び出し用のモデル ID */
  modelId?: string;
  onBack: () => void;
  /** 投稿ボタン */
  onPublish?: () => void;
  /** 投稿先の数 */
  platformCount?: number;
  /** 設定ボタン */
  onOpenSettings?: () => void;
  /** 自動保存状態 */
  saveStatus?: "saved" | "saving" | "unsaved";
  /** フォントスケール */
  zoomPercentage?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
}

export function WorkBar({
  title,
  onTitleChange,
  draftText,
  modelId,
  onBack,
  onPublish,
  platformCount = 0,
  onOpenSettings,
  saveStatus,
  zoomPercentage,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: WorkBarProps) {
  const [showTitleEditor, setShowTitleEditor] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const [generating, setGenerating] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [activeContexts, setActiveContexts] = useState<Set<string>>(new Set());

  const openEditor = useCallback(() => {
    setEditValue(title);
    setSuggestion(null);
    setShowTitleEditor(true);
  }, [title]);

  function commitEdit() {
    const trimmed = editValue.trim();
    if (trimmed) onTitleChange(trimmed);
    setShowTitleEditor(false);
  }

  function toggleContext(id: string) {
    setActiveContexts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function generateTitle() {
    if (!draftText?.trim() || generating) return;
    setGenerating(true);
    setSuggestion(null);
    try {
      const { callToolJson } = await import("@akari-os/sdk/mcp");
      const conv = await callToolJson<{ conversationId: string }>("partner_new_conversation");

      // オプションコンテキストを組み立て
      const contextLines = TITLE_OPTIONS
        .filter((c) => activeContexts.has(c.id))
        .map((c) => `- ${c.prompt}`);
      const contextBlock = contextLines.length > 0
        ? `\n\n追加条件:\n${contextLines.join("\n")}`
        : "";

      const res = await callToolJson<{ text: string }>("partner_chat", {
        conversationId: conv.conversationId,
        message: `以下の文章に短いタイトルをつけてください（10文字以内、説明不要、タイトルだけ出力）:${contextBlock}\n\n${draftText.slice(0, 500)}`,
        ...(modelId ? { model: modelId } : {}),
      });
      const cleaned = res.text.replace(/[「」『』""]/g, "").trim().slice(0, 30);
      if (cleaned) setSuggestion(cleaned);
    } catch {
      // 失敗時は何もしない
    } finally {
      setGenerating(false);
    }
  }

  function acceptSuggestion() {
    if (suggestion) {
      setEditValue(suggestion);
      setSuggestion(null);
    }
  }

  return (
    <>
    <div className="h-10 border-b border-border px-3 flex items-center gap-2 shrink-0 bg-card">
      {/* 戻るボタン */}
      <button
        onClick={onBack}
        className="text-muted-foreground hover:text-foreground transition p-1 rounded hover:bg-muted"
        title="Works 一覧に戻る"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>

      {/* Work タイトル（クリックでポップアップ編集） */}
      <button
        onClick={openEditor}
        className="flex items-center gap-1.5 max-w-[240px] group"
        title="クリックでタイトルを編集"
      >
        <span className="text-sm font-medium truncate group-hover:text-primary transition">
          {title || "無題の投稿"}
        </span>
        <Pencil className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground transition shrink-0" />
      </button>

      {/* 右側: 保存状態 + ズーム + 設定 */}
      <div className="flex items-center gap-0.5 ml-auto">
        {saveStatus && (
          <div className="flex items-center gap-1 mr-2 text-[10px]">
            <Save className={`w-3 h-3 ${saveStatus === "saved" ? "text-green-500" : saveStatus === "saving" ? "text-primary animate-pulse" : "text-muted-foreground"}`} />
            <span className="text-muted-foreground">
              {saveStatus === "saved" ? "保存済み" : saveStatus === "saving" ? "保存中..." : "未保存"}
            </span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        {zoomPercentage !== undefined && (
          <div className="flex items-center gap-0.5 mr-2 border-r border-border pr-2">
            <button onClick={onZoomOut} className="p-1 text-muted-foreground hover:text-foreground transition rounded hover:bg-muted" title="縮小 (Cmd-)">
              <ZoomOut className="w-3 h-3" />
            </button>
            <button onClick={onZoomReset} className="text-[10px] text-muted-foreground hover:text-foreground transition px-1 font-mono min-w-[36px] text-center" title="リセット (Cmd+0)">
              {zoomPercentage}%
            </button>
            <button onClick={onZoomIn} className="p-1 text-muted-foreground hover:text-foreground transition rounded hover:bg-muted" title="拡大 (Cmd+)">
              <ZoomIn className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
      {onPublish && (
        <button
          onClick={onPublish}
          title="投稿"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition text-xs font-medium"
        >
          <Send className="w-3.5 h-3.5" />
          投稿
          {platformCount > 0 && (
            <span className="text-[9px] bg-primary-foreground/20 px-1 rounded">{platformCount}</span>
          )}
        </button>
      )}
      {onOpenSettings && (
        <button onClick={onOpenSettings} title="Writer 設定" className="p-1.5 rounded transition text-muted-foreground hover:text-foreground hover:bg-muted">
          <Settings className="w-3.5 h-3.5" />
        </button>
      )}
    </div>

    {/* タイトル編集ポップアップ */}
    {showTitleEditor && (
      <div className="fixed inset-0 z-50 flex items-start justify-center pt-14 bg-black/40 backdrop-blur-sm" onClick={() => setShowTitleEditor(false)}>
        <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
          <div className="px-4 py-3 space-y-3">
            {/* タイトル入力 */}
            <div>
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">タイトル</label>
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitEdit();
                  if (e.key === "Escape") setShowTitleEditor(false);
                }}
                placeholder="投稿のタイトルを入力..."
                className="w-full mt-1 text-sm font-medium bg-background border border-border rounded-lg px-3 py-2 focus:border-primary/50 focus:outline-none"
              />
            </div>

            {/* AI タイトル提案 */}
            <div className="rounded-lg border border-border overflow-hidden">
              {/* オプション */}
              <div className="px-3 py-2 bg-muted/30 border-b border-border/50">
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1.5">オプション</div>
                <div className="flex flex-wrap gap-1.5">
                  {TITLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => toggleContext(opt.id)}
                      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition ${
                        activeContexts.has(opt.id)
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                    >
                      {opt.icon}
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 提案ボタン */}
              <div className="px-3 py-2">
                <button
                  onClick={() => void generateTitle()}
                  disabled={generating || !draftText?.trim()}
                  className={`w-full flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border transition ${
                    generating
                      ? "border-primary/30 bg-primary/5 text-primary animate-pulse"
                      : "border-primary/30 text-primary hover:bg-primary/10 disabled:opacity-40 disabled:cursor-not-allowed"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {generating ? "考え中..." : "AI でタイトルを提案"}
                </button>
              </div>

              {/* 提案結果 */}
              {suggestion && (
                <div className="px-3 pb-3">
                  <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="text-sm font-medium flex-1">{suggestion}</span>
                    <button
                      onClick={acceptSuggestion}
                      className="flex items-center gap-1 text-[10px] px-2.5 py-1 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition shrink-0"
                    >
                      <Check className="w-3 h-3" />
                      反映
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* アクション */}
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setShowTitleEditor(false)}
                className="px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition"
              >
                キャンセル
              </button>
              <button
                onClick={commitEdit}
                className="px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

