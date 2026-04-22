/**
 * PublishModal — 投稿確認モーダル。
 * 左: チェックボックス付き PF 一覧、右: 選択中 PF のプレビュー。
 * 下部: 今すぐ投稿 / 予約投稿。
 */

import { useState } from "react";
import { X, Send, Copy, Check, Loader2, Clock, Eye, ZoomIn, ZoomOut } from "lucide-react";
import { getPlatform } from "@/lib/platforms";
import { PlatformIcon } from "@/components/icons/SnsIcons";
import { callToolJson } from "@/lib/api";
import type { PublishResult } from "@/lib/types";
import type { PlatformContent } from "@/lib/works";
import { PreviewRouter, type PreviewTheme } from "@/components/preview/PreviewRouter";
import { splitThread, isThreadContent } from "../lib/thread-utils";
import { DeviceFrame, DeviceSelector, type DeviceType } from "@/components/preview/DeviceFrame";
import { getSnsAccount } from "../lib/account-store";

function countChars(text: string): number {
  return [...text].length;
}

interface PublishModalProps {
  contents: Record<string, PlatformContent>;
  selectedPlatforms: string[];
  onClose: () => void;
}

type PlatformStatus = "idle" | "publishing" | "success" | "failed" | "copied";

export function PublishModal({ contents, selectedPlatforms, onClose }: PublishModalProps) {
  const [statuses, setStatuses] = useState<Record<string, PlatformStatus>>({});
  const [results, setResults] = useState<Record<string, PublishResult>>({});
  const [publishing, setPublishing] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(selectedPlatforms));
  const [previewPid, setPreviewPid] = useState<string>(selectedPlatforms[0] ?? "");
  const [device, setDevice] = useState<DeviceType>("phone");
  const [previewTheme, setPreviewTheme] = useState<PreviewTheme>("dark");
  const [scaleFactor, setScaleFactor] = useState(1.0);

  const platforms = selectedPlatforms
    .map((pid) => ({
      id: pid,
      config: getPlatform(pid),
      content: contents[pid],
    }))
    .filter((p) => p.content && p.content.text.trim());

  function toggleCheck(pid: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(pid)) next.delete(pid); else next.add(pid);
      return next;
    });
  }

  function toggleAll() {
    if (checked.size === platforms.length) {
      setChecked(new Set());
    } else {
      setChecked(new Set(platforms.map((p) => p.id)));
    }
  }

  async function publishOne(pid: string) {
    const content = contents[pid];
    if (!content?.text.trim()) return;
    setStatuses((prev) => ({ ...prev, [pid]: "publishing" }));
    try {
      const pf = getPlatform(pid);
      if (pf.enabled) {
        const mediaPayload = content.media.length > 0
          ? content.media.map((m) => ({ base64: m.dataUrl, mimeType: "image/jpeg" }))
          : undefined;
        const threadParts = isThreadContent(content.text) ? splitThread(content.text) : undefined;
        const result = await callToolJson<PublishResult>("operator_publish", {
          target: pid,
          text: threadParts ? threadParts[0] : content.text,
          media: mediaPayload,
          ...(threadParts ? { threadParts } : {}),
        });
        setResults((prev) => ({ ...prev, [pid]: result }));
        setStatuses((prev) => ({ ...prev, [pid]: result.status === "success" ? "success" : "failed" }));
      } else {
        await navigator.clipboard.writeText(content.text);
        setStatuses((prev) => ({ ...prev, [pid]: "copied" }));
      }
    } catch {
      setStatuses((prev) => ({ ...prev, [pid]: "failed" }));
    }
  }

  async function publishSelected() {
    setPublishing(true);
    const targets = platforms.filter((p) => checked.has(p.id));
    await Promise.allSettled(targets.map((p) => publishOne(p.id)));
    setPublishing(false);
  }

  const checkedCount = platforms.filter((p) => checked.has(p.id)).length;
  const xAccount = getSnsAccount("x");

  // プレビュー用データ
  const previewPlatform = previewPid ? getPlatform(previewPid) : null;
  const previewContent = previewPid ? contents[previewPid] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">投稿</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: 左右分割 */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* 左: PF一覧 */}
          <div className="w-[280px] border-r border-border flex flex-col shrink-0">
            {/* 全選択ヘッダー */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
              <button onClick={toggleAll} className="flex items-center gap-1.5 text-[10px] text-muted-foreground hover:text-foreground transition">
                <CheckBox checked={checked.size === platforms.length && platforms.length > 0} />
                <span>すべて選択</span>
              </button>
              <span className="text-[10px] text-muted-foreground ml-auto">{checkedCount}/{platforms.length}</span>
            </div>

            {/* PF リスト */}
            <div className="flex-1 overflow-y-auto">
              {platforms.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground/60">
                  <p className="text-[11px]">投稿するコンテンツがありません</p>
                </div>
              ) : (
                platforms.map((p) => {
                  const status = statuses[p.id] ?? "idle";
                  const pf = p.config;
                  const text = p.content!.text;
                  const charCount = countChars(text);
                  const isOverLimit = pf.maxChars !== null && charCount > pf.maxChars;
                  const isSelected = previewPid === p.id;

                  return (
                    <div
                      key={p.id}
                      className={`flex items-start gap-2 px-3 py-2.5 border-b border-border/30 cursor-pointer transition ${
                        isSelected ? "bg-primary/5" : "hover:bg-muted/50"
                      }`}
                      onClick={() => setPreviewPid(p.id)}
                    >
                      {/* チェックボックス */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleCheck(p.id); }}
                        className="mt-0.5 shrink-0"
                      >
                        <CheckBox checked={checked.has(p.id)} />
                      </button>

                      {/* PF 情報 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <PlatformIcon platformId={p.id} size={14} />
                          <span className="text-xs font-medium">{pf.name}</span>
                          {pf.maxChars !== null && (
                            <span className={`text-[9px] font-mono ml-auto ${isOverLimit ? "text-destructive" : "text-muted-foreground/60"}`}>
                              {charCount}/{pf.maxChars}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">{text}</p>
                        {p.content!.media.length > 0 && (
                          <div className="flex gap-0.5 mt-1">
                            {p.content!.media.slice(0, 3).map((m) => (
                              <img key={m.id} src={m.dataUrl} alt="" className="w-5 h-5 rounded object-cover" />
                            ))}
                            {p.content!.media.length > 3 && (
                              <span className="text-[9px] text-muted-foreground/60">+{p.content!.media.length - 3}</span>
                            )}
                          </div>
                        )}
                        {/* ステータス */}
                        {status !== "idle" && (
                          <div className="mt-1">
                            <StatusBadge status={status} />
                            {status === "success" && results[p.id]?.url && (
                              <a href={results[p.id]!.url} target="_blank" rel="noreferrer" className="text-[9px] text-primary hover:underline break-all block mt-0.5">
                                {results[p.id]!.url}
                              </a>
                            )}
                            {status === "failed" && results[p.id]?.errorMessage && (
                              <p className="text-[9px] text-destructive mt-0.5">{results[p.id]!.errorMessage}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 右: プレビュー */}
          <div className="flex-1 flex flex-col items-center p-2 bg-background/50 overflow-hidden">
            {previewPlatform && previewContent ? (
              <>
                {/* コントロールバー */}
                <div className="flex items-center gap-2 mb-1 shrink-0 w-full justify-center flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">
                      {previewPlatform.name}
                    </span>
                  </div>
                  <DeviceSelector device={device} onChange={setDevice} />
                  <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 bg-background">
                    <button onClick={() => setPreviewTheme("dark")} className={`px-2 py-0.5 text-[10px] rounded transition ${previewTheme === "dark" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>🌙</button>
                    <button onClick={() => setPreviewTheme("light")} className={`px-2 py-0.5 text-[10px] rounded transition ${previewTheme === "light" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>☀️</button>
                  </div>
                  <div className="flex items-center gap-0.5 rounded-md border border-border p-0.5 bg-background">
                    <button onClick={() => setScaleFactor((s) => Math.max(0.7, s - 0.15))} className="px-1 py-0.5 text-muted-foreground hover:text-foreground rounded transition"><ZoomOut className="w-3 h-3" /></button>
                    <span className="text-[9px] text-muted-foreground w-7 text-center">{Math.round(scaleFactor * 100)}%</span>
                    <button onClick={() => setScaleFactor((s) => Math.min(1.5, s + 0.15))} className="px-1 py-0.5 text-muted-foreground hover:text-foreground rounded transition"><ZoomIn className="w-3 h-3" /></button>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center min-h-0 overflow-auto w-full">
                  <DeviceFrame device={device} scaleFactor={scaleFactor} theme={previewTheme}>
                    <PreviewRouter
                      platformId={previewPid}
                      content={previewContent.text}
                      displayName={xAccount?.displayName}
                      username={xAccount?.username}
                      avatarUrl={xAccount?.avatarUrl}
                      mediaUrls={previewContent.media.map((m) => m.dataUrl)}
                      theme={previewTheme}
                      threadParts={isThreadContent(previewContent.text) ? splitThread(previewContent.text) : undefined}
                    />
                  </DeviceFrame>
                </div>
              </>
            ) : (
              <div className="text-center text-muted-foreground/40 my-auto">
                <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-[11px]">左からプラットフォームを選択</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border shrink-0">
          <div className="flex gap-2">
            {/* 今すぐ投稿 */}
            <button
              onClick={() => void publishSelected()}
              disabled={publishing || checkedCount === 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-40 text-sm font-medium"
            >
              {publishing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  投稿中...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  今すぐ投稿 ({checkedCount})
                </>
              )}
            </button>

            {/* 予約投稿 */}
            <button
              disabled
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border text-muted-foreground text-sm opacity-50 cursor-not-allowed"
              title="Coming Soon"
            >
              <Clock className="w-4 h-4" />
              予約
            </button>
          </div>
          <p className="text-[9px] text-muted-foreground/50 text-center mt-1.5">
            未対応プラットフォームはクリップボードにコピーされます
          </p>
        </div>
      </div>
    </div>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition ${
      checked ? "border-primary bg-primary" : "border-muted-foreground/40"
    }`}>
      {checked && <Check className="w-3 h-3 text-primary-foreground" />}
    </div>
  );
}

function StatusBadge({ status }: { status: PlatformStatus }) {
  switch (status) {
    case "idle":
      return null;
    case "publishing":
      return <span className="flex items-center gap-1 text-[9px] text-primary"><Loader2 className="w-2.5 h-2.5 animate-spin" />投稿中</span>;
    case "success":
      return <span className="flex items-center gap-1 text-[9px] text-emerald-400"><Check className="w-2.5 h-2.5" />投稿済み</span>;
    case "copied":
      return <span className="flex items-center gap-1 text-[9px] text-blue-400"><Copy className="w-2.5 h-2.5" />コピー済み</span>;
    case "failed":
      return <span className="text-[9px] text-destructive">失敗</span>;
  }
}
