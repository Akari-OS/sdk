/**
 * Writer View — エディタ本体 (中央カラム)。
 *
 * プラットフォームタブ + tiptap WYSIWYG エディタ + 画像添付エリア。
 * spec: AKARI-HUB-009 §7, §10
 */

import { useState, useRef, useEffect } from "react";
import { ImagePlus, X, MessageCircle, ChevronUp, ChevronDown, AlertCircle, Scissors } from "lucide-react";
import { ImagePreviewModal } from "@akari-os/shell-ui/ImagePreview";
import { PlatformTabs } from "./layout/PlatformTabs";
import { getPlatform, SOURCE_PLATFORM_ID } from "./lib/platforms";
import { createImageContext, type ContextItem } from "@akari-os/sdk/chat-context";
import { TiptapEditor } from "./TiptapEditor";
import { isThreadContent, threadPartCounts, THREAD_SEPARATOR } from "./lib/thread-utils";
import { extractUrls, fetchOgp, type OgpData } from "./lib/ogp-fetch";
import { LinkPreviewCard } from "./components/LinkPreviewCard";
import type { MediaAttachment } from "./lib/media";

export type { MediaAttachment };

function countChars(text: string): number {
  return [...text].length;
}

interface WriterViewProps {
  draft: string;
  onDraftChange: (text: string) => void;
  platformId: string;
  onPlatformChange: (id: string) => void;
  /** 選択された投稿先プラットフォーム */
  selectedPlatforms?: string[];
  /** 投稿先削除 */
  onRemovePlatform?: (id: string) => void;
  media: MediaAttachment[];
  onMediaAdd: (file: File) => void;
  onMediaRemove: (id: string) => void;
  /** D&D でプラットフォーム追加 */
  onAddPlatform?: (id: string) => void;
  /** テキスト選択・画像 → Chat コンテキスト */
  onSendContext?: (ctx: ContextItem) => void;
  /** 全プラットフォームのテキスト（タブ別文字数表示用） */
  allContents?: Record<string, { text: string }>;
}

export function WriterView({
  draft,
  onDraftChange,
  platformId,
  onPlatformChange,
  selectedPlatforms,
  onRemovePlatform,
  onAddPlatform,
  media,
  onMediaAdd,
  onMediaRemove,
  onSendContext,
  allContents,
}: WriterViewProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [mediaAreaOpen, setMediaAreaOpen] = useState(true);
  const [ogpCards, setOgpCards] = useState<OgpData[]>([]);

  // URL 検出 → OGP 取得（デバウンス 500ms）
  useEffect(() => {
    const timer = setTimeout(async () => {
      const urls = extractUrls(draft).slice(0, 3);
      if (urls.length === 0) {
        setOgpCards([]);
        return;
      }
      const results = await Promise.all(urls.map(fetchOgp));
      setOgpCards(results.filter((r): r is OgpData => r !== null));
    }, 500);
    return () => clearTimeout(timer);
  }, [draft]);

  const platform = getPlatform(platformId);
  const isSource = platformId === SOURCE_PLATFORM_ID;
  const mediaConfig = platform.media;
  const count = countChars(draft);
  const limit = platform.maxChars;
  const overflow = limit !== null && count > limit;
  const nearLimit = limit !== null && !overflow && limit - count <= 20;

  // 現在のプラットフォーム用の画像をフィルタ（platformId 一致 or 共通）
  const platformMedia = media.filter(
    (m) => !m.platformId || m.platformId === platformId,
  );
  const canAddMore = platformMedia.length < mediaConfig.maxImages;

  function handleFileSelect() {
    if (!canAddMore) return;
    fileInputRef.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      onMediaAdd(file);
      e.target.value = "";
    }
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* プラットフォームタブ */}
      <PlatformTabs
        active={platformId}
        onChange={onPlatformChange}
        selectedPlatforms={selectedPlatforms ?? [platformId]}
        onRemove={onRemovePlatform}
        onDrop={onAddPlatform}
        charCounts={allContents
          ? Object.fromEntries(Object.entries(allContents).map(([pid, c]) => [pid, countChars(c.text)]))
          : { [platformId]: count }
        }
      />

      {/* サムネイル画像エリア（上部 — サムネイル対応プラットフォームのみ、原稿タブ除外） */}
      {platformId && (<>

      {!isSource && mediaConfig.thumbnail && (
      <div className="border-b border-border px-6 shrink-0">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={() => setMediaAreaOpen((v) => !v)}
            className="w-full flex items-center justify-between py-2 text-xs text-muted-foreground hover:text-foreground transition"
          >
            <div className="flex items-center gap-2">
              <ImagePlus className="w-3.5 h-3.5" />
              <span>サムネイル</span>
            </div>
            {mediaAreaOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {/* サムネイル画像 */}
          {mediaAreaOpen && (
            <div className="pb-3">
              {platformMedia.length > 0 ? (
                <div
                  className="relative group w-full h-32 rounded-lg border border-border overflow-hidden cursor-pointer hover:border-primary/40 transition"
                  onClick={() => setPreviewImage(platformMedia[0]!.dataUrl)}
                >
                  <img src={platformMedia[0]!.dataUrl} alt={platformMedia[0]!.name} className="w-full h-full object-cover" />
                  <button
                    onClick={(e) => { e.stopPropagation(); onMediaRemove(platformMedia[0]!.id); }}
                    className="absolute top-1 right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleFileSelect}
                  className="w-full h-32 rounded-lg border-2 border-dashed border-border hover:border-primary/40 flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground transition"
                >
                  <ImagePlus className="w-6 h-6" />
                  <span className="text-xs">サムネイル画像を追加</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* エディタ */}
      <div className="flex-1 flex flex-col px-6 py-4 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col">
          <div
            className={`flex-1 rounded-lg border bg-card p-4 transition ${
              overflow
                ? "border-destructive/60"
                : nearLimit
                  ? "border-primary/60"
                  : "border-border"
            }`}
          >
            {/* tiptap WYSIWYG エディター */}
            <TiptapEditor
              key={`${platformId}-${platform.editor.markdown}`}
              draft={draft}
              onDraftChange={onDraftChange}
              isMarkdownMode={platform.editor.markdown}
              placeholder={isSource ? "ここに大元の文章を書く..." : `${platform.name} 向けのテキストを書く...`}
              onSendContext={onSendContext}
            />
          </div>

          {/* 文字数 + スレッド区切りボタン */}
          <div className="flex items-center justify-between mt-2 px-1 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                {platform.icon} {platform.name}
              </span>
              {/* スレッド区切りボタン（テキスト系PFのみ） */}
              {limit !== null && (
                <button
                  type="button"
                  onClick={() => onDraftChange(draft + THREAD_SEPARATOR)}
                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted rounded transition shrink-0"
                  title="スレッド区切りを挿入"
                >
                  <Scissors className="w-3 h-3" />
                  <span>区切り</span>
                </button>
              )}
            </div>

            {/* 文字数カウンター */}
            {limit !== null && (
              isThreadContent(draft) ? (
                /* パート別文字数 */
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {threadPartCounts(draft, limit).map((p) => (
                    <span
                      key={p.index}
                      className={`text-[10px] font-mono ${
                        p.over ? "text-destructive font-semibold" : "text-muted-foreground"
                      }`}
                    >
                      {p.index + 1}: {p.count}/{limit}
                    </span>
                  ))}
                </div>
              ) : (
                <span
                  className={`text-xs font-mono shrink-0 ${
                    overflow
                      ? "text-destructive font-semibold"
                      : nearLimit
                        ? "text-primary"
                        : "text-muted-foreground"
                  }`}
                >
                  {count} / {limit}
                </span>
              )
            )}
          </div>

          {/* OGP リンクプレビューカード */}
          {ogpCards.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {ogpCards.map((ogp) => (
                <LinkPreviewCard
                  key={ogp.url}
                  ogp={ogp}
                  onRemove={() => setOgpCards((prev) => prev.filter((c) => c.url !== ogp.url))}
                />
              ))}
            </div>
          )}

          {/* 画像グリッド（エディタ下部 — 非サムネイルプラットフォーム用、原稿タブ除外） */}
          {!isSource && !mediaConfig.thumbnail && (
            <div className="mt-3 rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ImagePlus className="w-3.5 h-3.5" />
                  <span>画像 ({platformMedia.length}/{mediaConfig.maxImages})</span>
                  {mediaConfig.required && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-destructive/10 text-destructive rounded">
                      <AlertCircle className="w-3 h-3" />必須
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {platformMedia.map((m) => (
                  <div
                    key={m.id}
                    className="relative group shrink-0 w-16 h-16 rounded-lg border border-border overflow-hidden cursor-pointer hover:border-primary/40 transition"
                    onClick={() => setPreviewImage(m.dataUrl)}
                  >
                    <img src={m.dataUrl} alt={m.name} className="w-full h-full object-cover" />
                    <button
                      onClick={(e) => { e.stopPropagation(); onMediaRemove(m.id); }}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                    {onSendContext && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSendContext(createImageContext(m.dataUrl, m.name));
                        }}
                        className="absolute -bottom-1 -right-1 w-4 h-4 bg-primary text-primary-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                        title="AI に送る"
                      >
                        <MessageCircle className="w-2.5 h-2.5" />
                      </button>
                    )}
                  </div>
                ))}
                {canAddMore && (
                  <button
                    onClick={handleFileSelect}
                    className="shrink-0 w-16 h-16 rounded-lg border-2 border-dashed border-border hover:border-primary/40 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition"
                  >
                    <ImagePlus className="w-4 h-4" />
                    <span className="text-[9px]">追加</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      </>)}

      {/* Image preview modal */}
      {previewImage && (
        <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />
      )}
    </div>
  );
}
