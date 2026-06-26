/**
 * PoolItemDetail — 右カラム。選択アイテムの詳細 + 分析ボタン + コンテンツプレビュー。
 * context_json をモダリティ別にリッチ表示する。
 *
 * shell-ui 共有版（akari-video / akari-shell 等から import して使う）。
 * shell 固有の重い依存（重量プレビューコンポーネント / useToast / revealItemInDir 等）は
 * 注入 props でオプション化しており、呼び出し側が必要に応じて差し込む。
 */

import { useState, useEffect, useCallback, useRef, type ReactNode, type Ref, type ComponentType } from "react";
import {
  ChevronDown,
  ChevronRight,
  Tag,
  Sparkles,
  Loader2,
  FileText,
  Video,
  Music,
  Image,
  FileCode,
  FileType,
  BookOpen,
  Info,
  Trash2,
  Archive,
  RotateCcw,
  AlertTriangle,
  Maximize2,
  X,
  Pencil,
  Check,
  FolderOpen,
  Search,
  Network,
  Clock,
  Minus,
  Plus,
  History,
} from "lucide-react";
import {
  analyzeItem,
  readItemContent,
  getItemFilePath,
  archiveItem,
  restoreItem,
  updateItem,
  checkAssetDeletion,
  searchItems,
  entityGraph,
  listEntities,
  type AssetDeleteCheck,
  type Entity,
  type EntityRelation,
  type PoolItemFull,
  type PoolItemSummary,
  type PoolRelation,
  type PoolSearchResult,
} from "@akari-os/sdk/pool";
import { useThumb } from "./lib/pool-thumbnail-cache";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  pushRevision,
  getRevisions,
  type ItemRevision,
} from "./lib/item-revision-history";

// ===== AnalysisWorkflowContext (外部依存を避けるため inline 定義) =====
interface AnalysisWorkflowStepDisplay {
  id: string; kind: string; label: string; shortLabel: string;
  provider: string; model?: string; costLabel?: string;
}
interface AnalysisWorkflowCostDisplay { usd: number; jpy: number; label: string; }
interface AnalysisWorkflowContext {
  mode: string;
  workflow_label: string;
  estimated_cost?: AnalysisWorkflowCostDisplay;
  steps: AnalysisWorkflowStepDisplay[];
  updated_at: string;
}

// ===== 注入用 トースト API =====
interface ToastApi {
  show: (message: string, type?: "success" | "error" | "info", emoji?: string) => void;
  showAction: (options: {
    message: string; actionLabel: string; onAction: () => void | Promise<void>;
    timeoutMs?: number; type?: "success" | "error" | "info"; emoji?: string;
  }) => void;
}

const NOOP_TOAST: ToastApi = { show: () => {}, showAction: () => {} };

// ===== 注入用 AudioPlayerHandle =====
/** 音声波形プレイヤーへの命令 API。audioPlayerRef 経由で使う。 */
export interface AudioPlayerHandle {
  seekTo: (sec: number, autoplay?: boolean) => void;
  togglePlay: () => void;
}

// ===== context_json の型定義 =====

interface ContextBase {
  modality?: string;
  L0_tags?: string[];
  L1_summary?: string;
  _analysis_workflow?: AnalysisWorkflowContext;
}

type TranscriptionSegment = { id: number; start: number; end: number; text: string };
type TranscriptionWord = { word: string; start: number; end: number };
type KeyframeResult = { index?: number; time_sec?: number | null; description: string };

const SEEK_OFFSET_STORAGE_KEY = "akari.pool.transcriptionSeekOffsetMs";
const SEEK_OFFSET_STEP_MS = 50;
const SEEK_OFFSET_MIN_MS = -1000;
const SEEK_OFFSET_MAX_MS = 1000;

function clampSeekOffsetMs(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(SEEK_OFFSET_MIN_MS, Math.min(SEEK_OFFSET_MAX_MS, Math.round(value)));
}

function formatSignedMs(ms: number) {
  if (ms === 0) return "0ms";
  return `${ms > 0 ? "+" : ""}${ms}ms`;
}

interface VideoContext extends ContextBase {
  modality: "video";
  duration_sec?: number;
  width?: number;
  height?: number;
  video_codec?: string;
  audio_codec?: string;
  title?: string;
  comment?: string;
  chapters?: { start_sec: number; end_sec: number; title: string }[];
  subtitle_text?: string;
  transcription?: string;
  transcription_error?: string;
  keyframe_descriptions?: string[];
  keyframes?: KeyframeResult[];
  // HUB-055: Groq Whisper 由来の segments + 提供元情報
  transcription_segments?: TranscriptionSegment[];
  transcription_words?: TranscriptionWord[];
  transcription_language?: string;
  transcription_provider?: string;
  transcription_model?: string;
}

interface AudioContext extends ContextBase {
  modality: "audio";
  duration_sec?: number;
  sample_rate?: number;
  channels?: number;
  codec?: string;
  metadata?: { title?: string; artist?: string; album?: string };
  // 音声にも文字起こしを紐づけられる (Whisper 等)
  transcription?: string;
  transcription_error?: string;
  transcription_segments?: TranscriptionSegment[];
  transcription_words?: TranscriptionWord[];
}

interface ImageContext extends ContextBase {
  modality: "image";
  width?: number;
  height?: number;
  format?: string;
  exif?: Record<string, unknown>;
}

interface PdfContext extends ContextBase {
  modality: "pdf";
  page_count?: number;
  word_count?: number;
  L3_full_text?: string;
}

interface CodeContext extends ContextBase {
  modality: "code";
  language?: string;
  line_count?: number;
  L3_full_text?: string;
}

interface ArticleContext extends ContextBase {
  modality: "article";
  format?: string;
  word_count?: number;
  L2_outline?: string;
  L3_full_text?: string;
}

type ContextJson = VideoContext | AudioContext | ImageContext | PdfContext | CodeContext | ArticleContext | ContextBase;

// _meta の型定義
interface AnalysisMeta {
  analyzer_name?: string;
  analyzer_version?: string;
  analysis_mode?: string;
  model?: string;
  tools_used?: string[];
  duration_ms?: number;
  timestamp?: string;
}

// ===== アコーディオンコンポーネント =====

function Accordion({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border/50 pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 w-full text-[10px] font-medium text-muted-foreground hover:text-foreground transition"
      >
        {open ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
        {icon}
        <span className="truncate">{title}</span>
      </button>
      {open && <div className="mt-1.5 ml-4">{children}</div>}
    </div>
  );
}

// ===== 折りたたみテキスト（長文用） =====

function CollapsibleText({ text, maxLines = 3 }: { text: string; maxLines?: number }) {
  const [expanded, setExpanded] = useState(false);
  const lines = text.split("\n");
  const needsCollapse = lines.length > maxLines;
  const displayText = expanded || !needsCollapse ? text : lines.slice(0, maxLines).join("\n") + "…";

  return (
    <div className="select-text">
      <pre className="whitespace-pre-wrap text-[10px] text-muted-foreground leading-relaxed font-sans">
        {displayText}
      </pre>
      {needsCollapse && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-[9px] text-primary hover:text-primary/80 mt-0.5"
        >
          {expanded ? "折りたたむ" : "全文を表示"}
        </button>
      )}
    </div>
  );
}

const TIMELINE_WORD_CHAR_RE = /[\p{L}\p{N}]/u;
const TIMELINE_WORD_RE = /[\p{L}\p{N}_]+/gu;
const CJK_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

function normalizeTimelineText(text: string) {
  return Array.from(text.normalize("NFKC").toLowerCase())
    .filter((char) => TIMELINE_WORD_CHAR_RE.test(char))
    .join("");
}

function isTimelineWordText(text: string) {
  return normalizeTimelineText(text).length > 0;
}

function splitTimelineWords(text: string) {
  const intlWithSegmenter = Intl as typeof Intl & {
    Segmenter?: new (
      locale: string,
      options: { granularity: "word" },
    ) => { segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }> };
  };
  const segmenter = intlWithSegmenter.Segmenter
    ? new intlWithSegmenter.Segmenter("ja", { granularity: "word" })
    : null;
  if (segmenter) {
    return Array.from(segmenter.segment(text))
      .filter((part) => part.isWordLike !== false && isTimelineWordText(part.segment))
      .map((part) => part.segment.trim())
      .filter(Boolean);
  }
  return Array.from(text.matchAll(TIMELINE_WORD_RE))
    .map((match) => match[0].trim())
    .filter(Boolean);
}

function estimateTimelineWordsFromSegment(seg: TranscriptionSegment): TranscriptionWord[] {
  const tokens = splitTimelineWords(seg.text);
  if (tokens.length === 0) return [];
  const duration = Math.max(0.001, seg.end - seg.start);
  const weights = tokens.map((token) => Math.max(1, Array.from(normalizeTimelineText(token)).length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || tokens.length;
  let cursor = 0;
  return tokens.map((token, index) => {
    const start = seg.start + duration * (cursor / totalWeight);
    cursor += weights[index] ?? 1;
    const end = seg.start + duration * (cursor / totalWeight);
    return { word: token, start, end };
  });
}

function wordsCoverSegmentText(segmentText: string, words: TranscriptionWord[]) {
  const target = normalizeTimelineText(segmentText);
  if (!target) return true;
  const actual = normalizeTimelineText(words.map((word) => word.word).join(""));
  return actual === target;
}

function alignSegmentedWordsToRaw(
  seg: TranscriptionSegment,
  rawWords: TranscriptionWord[],
): TranscriptionWord[] {
  const tokens = splitTimelineWords(seg.text);
  if (tokens.length === 0) return [];

  const estimated = estimateTimelineWordsFromSegment(seg);
  const stream: { char: string; start: number; end: number }[] = [];
  for (const raw of rawWords) {
    for (const char of normalizeTimelineText(raw.word)) {
      stream.push({ char, start: raw.start, end: raw.end });
    }
  }
  if (stream.length === 0) return estimated;

  let cursor = 0;
  return tokens.map((token, index) => {
    const target = normalizeTimelineText(token);
    let first = -1;
    let last = -1;
    let pos = cursor;
    for (const char of target) {
      let found = -1;
      for (let i = pos; i < stream.length; i++) {
        if (stream[i].char === char) {
          found = i;
          break;
        }
      }
      if (found === -1) {
        first = -1;
        break;
      }
      if (first === -1) first = found;
      last = found;
      pos = found + 1;
    }
    if (first === -1 || last === -1) {
      return estimated[index] ?? { word: token, start: seg.start, end: seg.end };
    }
    cursor = last + 1;
    return {
      word: token,
      start: stream[first].start,
      end: stream[last].end,
    };
  });
}

function getSegmentTimelineWords(seg: TranscriptionSegment, words?: TranscriptionWord[]) {
  const rawSegmentWords =
    words?.filter((word) => {
      const text = word.word.trim();
      return (
        text.length > 0 &&
        !text.includes("\uFFFD") &&
        !text.includes("�") &&
        Number.isFinite(word.start) &&
        Number.isFinite(word.end) &&
        word.end >= seg.start &&
        word.start < seg.end &&
        isTimelineWordText(text)
      );
    }) ?? [];

  if (CJK_RE.test(seg.text)) {
    return rawSegmentWords.length > 0
      ? alignSegmentedWordsToRaw(seg, rawSegmentWords)
      : estimateTimelineWordsFromSegment(seg);
  }
  if (rawSegmentWords.length > 0 && wordsCoverSegmentText(seg.text, rawSegmentWords)) {
    return rawSegmentWords;
  }
  return [];
}

function seekVideoElement(video: HTMLVideoElement, sec: number, autoplay: boolean) {
  const target = Math.max(0, sec);
  if (autoplay) video.pause();

  let done = false;
  let timeoutId: number | null = null;
  let rafId: number | null = null;

  const finish = () => {
    if (done) return;
    done = true;
    video.removeEventListener("seeked", finish);
    if (timeoutId != null) window.clearTimeout(timeoutId);
    if (rafId != null) window.cancelAnimationFrame(rafId);
    if (autoplay) void video.play();
  };

  video.addEventListener("seeked", finish, { once: true });

  try {
    video.currentTime = target;
  } catch {
    video.removeEventListener("seeked", finish);
    if (video.readyState === HTMLMediaElement.HAVE_NOTHING) {
      video.addEventListener("loadedmetadata", () => seekVideoElement(video, target, autoplay), { once: true });
      video.load();
      return;
    }
    finish();
    return;
  }

  timeoutId = window.setTimeout(finish, 700);
  rafId = window.requestAnimationFrame(() => {
    if (!video.seeking && Math.abs(video.currentTime - target) < 0.02) finish();
  });
}

function TranscriptionTimeline({
  segments,
  words,
  durationSec,
  maxHeightClass = "max-h-64",
  seekOffsetMs = 0,
  onSeekOffsetChange,
  onSeek,
}: {
  segments: TranscriptionSegment[];
  words?: TranscriptionWord[];
  durationSec?: number;
  maxHeightClass?: string;
  seekOffsetMs?: number;
  onSeekOffsetChange?: (nextMs: number) => void;
  onSeek?: (sec: number) => void;
}) {
  const total = Math.max(
    durationSec ?? 0,
    ...segments.map((s) => s.end || s.start || 0),
    ...(words ?? []).map((w) => w.end || w.start || 0),
    1,
  );
  const safeSegments = segments.filter((seg) => Number.isFinite(seg.start) && Number.isFinite(seg.end));
  const segmentWordGroups = safeSegments.map((seg) => getSegmentTimelineWords(seg, words));
  const displayWordCount = segmentWordGroups.reduce((sum, group) => sum + group.length, 0);
  if (safeSegments.length === 0) return null;
  const effectiveSeekOffsetMs = clampSeekOffsetMs(seekOffsetMs);
  const offsetLabel = formatSignedMs(effectiveSeekOffsetMs);
  const applySeekOffset = (sec: number) => Math.max(0, sec + effectiveSeekOffsetMs / 1000);
  const seekTitle = (sec: number) =>
    `${formatTime(applySeekOffset(sec))} へ移動${effectiveSeekOffsetMs === 0 ? "" : ` (補正 ${offsetLabel})`}`;
  const updateOffset = (deltaMs: number) => {
    onSeekOffsetChange?.(clampSeekOffsetMs(effectiveSeekOffsetMs + deltaMs));
  };

  return (
    <div
      data-transcription-timeline="true"
      className={`overflow-y-auto rounded border border-border bg-background/50 ${maxHeightClass}`}
    >
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/95 px-2 py-1.5">
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3" />
            {safeSegments.length} segments
            {displayWordCount > 0 ? ` / ${displayWordCount} words` : ""}
          </span>
          <span className="font-mono tabular-nums">{formatTime(total)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
          <span className="font-mono tabular-nums">補正 {offsetLabel}</span>
          {onSeekOffsetChange && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateOffset(-SEEK_OFFSET_STEP_MS)}
                disabled={effectiveSeekOffsetMs <= SEEK_OFFSET_MIN_MS}
                className="grid size-5 place-items-center rounded border border-border/70 bg-muted/25 text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:opacity-35"
                title={`${SEEK_OFFSET_STEP_MS}ms 早くする`}
              >
                <Minus className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => onSeekOffsetChange(0)}
                className="h-5 rounded border border-border/70 bg-muted/25 px-1.5 font-mono tabular-nums text-muted-foreground hover:border-primary/50 hover:text-foreground"
                title="補正をリセット"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => updateOffset(SEEK_OFFSET_STEP_MS)}
                disabled={effectiveSeekOffsetMs >= SEEK_OFFSET_MAX_MS}
                className="grid size-5 place-items-center rounded border border-border/70 bg-muted/25 text-muted-foreground hover:border-primary/50 hover:text-foreground disabled:opacity-35"
                title={`${SEEK_OFFSET_STEP_MS}ms 遅くする`}
              >
                <Plus className="size-3" />
              </button>
            </div>
          )}
        </div>
        <div className="mt-1 h-1 rounded-full bg-muted/70">
          <div className="h-full rounded-full bg-primary/35" style={{ width: "100%" }} />
        </div>
      </div>

      <div className="divide-y divide-border/45">
        {safeSegments.map((seg, segIndex) => {
          const startPct = Math.max(0, Math.min(100, (seg.start / total) * 100));
          const widthPct = Math.max(0.8, Math.min(100 - startPct, ((seg.end - seg.start) / total) * 100));
          const segmentWords = segmentWordGroups[segIndex] ?? [];

          return (
            <div key={seg.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 px-2 py-2">
              <button
                type="button"
                onClick={() => onSeek?.(applySeekOffset(seg.start))}
                className="text-left font-mono text-[10px] tabular-nums text-primary/75 leading-5 hover:text-primary"
                title={seekTitle(seg.start)}
              >
                <div>{formatTime(seg.start)}</div>
                <div className="text-muted-foreground/55">{formatTime(seg.end)}</div>
              </button>
              <div className="min-w-0">
                <button
                  type="button"
                  onClick={() => onSeek?.(applySeekOffset(seg.start))}
                  className="block w-full text-left rounded-sm focus:outline-none focus:ring-1 focus:ring-primary/50"
                  title={seekTitle(seg.start)}
                >
                  <div className="relative h-4 rounded bg-muted/45">
                    <div
                      className="absolute top-0.5 h-3 rounded bg-primary/45"
                      style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-foreground/85 select-text">
                    {seg.text.trim()}
                  </p>
                </button>
                {segmentWords.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1 select-text">
                    {segmentWords.map((word, index) => (
                      <button
                        type="button"
                        key={`${seg.id}-${word.start}-${index}`}
                        onClick={() => onSeek?.(applySeekOffset(word.start))}
                        title={`${formatTime(word.start)} - ${formatTime(word.end)} / seek ${formatTime(applySeekOffset(word.start))}${effectiveSeekOffsetMs === 0 ? "" : ` (${offsetLabel})`}`}
                        className="rounded border border-border/70 bg-muted/35 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground hover:border-primary/50 hover:text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                      >
                        {word.word}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ===== メタデータ行 =====

function MetaRow({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-2 text-[10px]">
      <span className="text-muted-foreground/70 shrink-0">{label}</span>
      <span className="text-muted-foreground text-right truncate">{value}</span>
    </div>
  );
}

// ===== 秒数のフォーマット =====

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ===== タブ定義 =====

type TabId = "overview" | "details" | "relations" | "ai" | "history" | "similar" | "raw";

const TAB_LABELS: Record<TabId, string> = {
  overview: "概要",
  details: "詳細",
  relations: "関連",
  ai: "AI",
  history: "履歴",
  similar: "類似",
  raw: "Raw",
};

const TAB_ORDER: TabId[] = ["overview", "details", "relations", "ai", "history", "similar", "raw"];

// ===== EXIF の整形ヘルパ =====

/**
 * EXIF キーを優先度順に取り出すための定義。
 * 一致するキーは大文字小文字を無視して探索する。
 */
const EXIF_PRIMARY: { keys: string[]; label: string; fmt?: (v: unknown) => string }[] = [
  { keys: ["DateTimeOriginal", "DateTime", "CreateDate"], label: "撮影日時" },
  { keys: ["Make"], label: "メーカー" },
  { keys: ["Model"], label: "機種" },
  { keys: ["LensModel", "Lens"], label: "レンズ" },
  {
    keys: ["FNumber", "Aperture"],
    label: "絞り",
    fmt: (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? `f/${n.toFixed(1)}` : String(v);
    },
  },
  {
    keys: ["ExposureTime", "ShutterSpeed"],
    label: "シャッター",
    fmt: (v) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) return String(v);
      return n >= 1 ? `${n.toFixed(1)}s` : `1/${Math.round(1 / n)}s`;
    },
  },
  { keys: ["ISO", "ISOSpeedRatings", "PhotographicSensitivity"], label: "ISO" },
  {
    keys: ["FocalLength"],
    label: "焦点距離",
    fmt: (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? `${n.toFixed(0)}mm` : String(v);
    },
  },
  { keys: ["FocalLengthIn35mmFilm"], label: "35mm 換算", fmt: (v) => `${v}mm` },
  { keys: ["WhiteBalance"], label: "WB" },
  { keys: ["Flash"], label: "フラッシュ" },
];

function findExifValue(exif: Record<string, unknown>, keys: string[]): unknown {
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(exif)) lower[k.toLowerCase()] = v;
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v != null && v !== "") return v;
  }
  return undefined;
}

function exifGps(exif: Record<string, unknown>): { lat: number; lon: number } | null {
  const lat = Number(findExifValue(exif, ["GPSLatitude", "GPSLat"]));
  const lon = Number(findExifValue(exif, ["GPSLongitude", "GPSLon"]));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat === 0 && lon === 0) return null;
  return { lat, lon };
}

// ===== L0_tags / L1_summary の共通ヘッダ =====

function ContextHeader({ ctx }: { ctx: ContextJson }) {
  const tags = ctx.L0_tags ?? [];
  const summary = ctx.L1_summary?.trim();
  if (!summary && tags.length === 0) return null;
  return (
    <div className="space-y-1.5 pb-1">
      {summary && (
        <p className="text-[11px] text-foreground/85 leading-relaxed select-text">
          {summary}
        </p>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-muted/60 text-muted-foreground/80 font-mono"
              title="アナライザ抽出タグ (L0)"
            >
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== モダリティ別リッチ表示 =====

function keyframeRows(video: VideoContext | null | undefined): KeyframeResult[] {
  if (!video) return [];
  const structured = video.keyframes
    ?.map((frame, idx) => ({
      index: frame.index ?? idx + 1,
      time_sec: typeof frame.time_sec === "number" && Number.isFinite(frame.time_sec) ? frame.time_sec : null,
      description: frame.description?.trim() || "代表フレーム",
    }))
    ?? [];
  if (structured.length > 0) return structured;

  const descriptions = video.keyframe_descriptions?.map((desc) => desc.trim()).filter(Boolean) ?? [];
  const duration = typeof video.duration_sec === "number" && Number.isFinite(video.duration_sec) ? video.duration_sec : null;
  return descriptions.map((description, idx) => ({
    index: idx + 1,
    time_sec: duration && duration > 1 ? duration * ((idx + 1) / (descriptions.length + 1)) : null,
    description,
  }));
}

function KeyframeDescriptionList({
  frames,
  onSeek,
}: {
  frames: KeyframeResult[];
  onSeek?: (sec: number) => void;
}) {
  const rows = frames
    .map((frame, idx) => ({
      ...frame,
      index: frame.index ?? idx + 1,
      description: frame.description.trim() || "代表フレーム",
      time_sec: typeof frame.time_sec === "number" && Number.isFinite(frame.time_sec) ? frame.time_sec : null,
    }))
    .filter((frame) => frame.time_sec != null || frame.description);
  if (rows.length === 0) return null;
  return (
    <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-border bg-background/50 p-2">
      {rows.map((frame) => {
        const canSeek = frame.time_sec != null && onSeek;
        const content = (
          <>
            <span className="mr-1 font-mono text-primary/70">#{frame.index}</span>
            {frame.time_sec != null && (
              <span className="mr-2 inline-flex items-center gap-1 font-mono text-primary">
                <Clock className="size-3" />
                {formatDuration(frame.time_sec)}
              </span>
            )}
            <span className="select-text">{frame.description}</span>
          </>
        );
        return canSeek ? (
          <button
            key={`${frame.index}:${frame.description}`}
            type="button"
            onClick={() => onSeek(frame.time_sec!)}
            className="block w-full rounded px-1 py-0.5 text-left text-[10px] leading-relaxed text-muted-foreground transition hover:bg-accent hover:text-foreground"
            title={`${formatDuration(frame.time_sec!)} に移動`}
          >
            {content}
          </button>
        ) : (
          <div key={`${frame.index}:${frame.description}`} className="px-1 py-0.5 text-[10px] leading-relaxed text-muted-foreground">
            {content}
          </div>
        );
      })}
    </div>
  );
}

function ContextRichView({
  ctx,
  onSeek,
  seekOffsetMs,
  onSeekOffsetChange,
}: {
  ctx: ContextJson;
  onSeek?: (sec: number) => void;
  seekOffsetMs?: number;
  onSeekOffsetChange?: (nextMs: number) => void;
}) {
  const modality = ctx.modality;

  if (modality === "video") {
    const v = ctx as VideoContext;
    const frames = keyframeRows(v);
    return (
      <>
        <Accordion title="メタデータ" icon={<Video className="w-3 h-3 shrink-0" />} defaultOpen>
          <div className="space-y-0.5">
            {v.duration_sec != null && <MetaRow label="再生時間" value={formatDuration(v.duration_sec)} />}
            {v.width != null && v.height != null && <MetaRow label="解像度" value={`${v.width}×${v.height}`} />}
            <MetaRow label="映像" value={v.video_codec} />
            <MetaRow label="音声" value={v.audio_codec} />
            <MetaRow label="タイトル" value={v.title} />
          </div>
        </Accordion>

        {(v.transcription_segments?.length ?? 0) > 0 ? (
          <Accordion title="文字起こしタイムライン" defaultOpen>
            <TranscriptionTimeline
              segments={v.transcription_segments!}
              words={v.transcription_words}
              durationSec={v.duration_sec}
              maxHeightClass="max-h-72"
              seekOffsetMs={seekOffsetMs}
              onSeekOffsetChange={onSeekOffsetChange}
              onSeek={onSeek}
            />
          </Accordion>
        ) : (
          v.transcription && (
            <Accordion title="文字起こし">
              <CollapsibleText text={v.transcription} />
            </Accordion>
          )
        )}

        {v.transcription_error && (
          <div className="rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200">
            <div className="mb-0.5 flex items-center gap-1 font-medium">
              <AlertTriangle className="size-3" />
              文字起こしエラー
            </div>
            <div className="select-text whitespace-pre-wrap text-amber-100/90">{v.transcription_error}</div>
          </div>
        )}

        {frames.length > 0 && (
          <Accordion title="代表フレーム結果">
            <KeyframeDescriptionList frames={frames} onSeek={onSeek} />
          </Accordion>
        )}

        {v.subtitle_text && (
          <Accordion title="字幕">
            <CollapsibleText text={v.subtitle_text} />
          </Accordion>
        )}

        {v.chapters && v.chapters.length > 0 && (
          <Accordion title="チャプター">
            <div className="space-y-0.5">
              {v.chapters.map((ch, i) => (
                <div key={i} className="flex gap-2 text-[10px]">
                  <span className="text-primary/70 shrink-0 font-mono">{formatDuration(ch.start_sec)}</span>
                  <span className="text-muted-foreground truncate">{ch.title}</span>
                </div>
              ))}
            </div>
          </Accordion>
        )}
      </>
    );
  }

  if (modality === "audio") {
    const a = ctx as AudioContext;
    return (
      <>
        <Accordion title="メタデータ" icon={<Music className="w-3 h-3 shrink-0" />} defaultOpen>
          <div className="space-y-0.5">
            {a.duration_sec != null && <MetaRow label="再生時間" value={formatDuration(a.duration_sec)} />}
            <MetaRow label="サンプルレート" value={a.sample_rate != null ? `${a.sample_rate} Hz` : undefined} />
            <MetaRow label="チャンネル" value={a.channels} />
            <MetaRow label="コーデック" value={a.codec} />
          </div>
        </Accordion>

        {a.metadata && (a.metadata.title || a.metadata.artist || a.metadata.album) && (
          <Accordion title="タグ情報" defaultOpen>
            <div className="space-y-0.5">
              <MetaRow label="タイトル" value={a.metadata.title} />
              <MetaRow label="アーティスト" value={a.metadata.artist} />
              <MetaRow label="アルバム" value={a.metadata.album} />
            </div>
          </Accordion>
        )}

        {(a.transcription_segments?.length ?? 0) > 0 ? (
          <Accordion title="文字起こしタイムライン" defaultOpen>
            <TranscriptionTimeline
              segments={a.transcription_segments!}
              words={a.transcription_words}
              durationSec={a.duration_sec}
              maxHeightClass="max-h-72"
              seekOffsetMs={seekOffsetMs}
              onSeekOffsetChange={onSeekOffsetChange}
              onSeek={onSeek}
            />
          </Accordion>
        ) : (
          a.transcription && (
            <Accordion title="文字起こし">
              <CollapsibleText text={a.transcription} />
            </Accordion>
          )
        )}

        {a.transcription_error && (
          <div className="rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200">
            <div className="mb-0.5 flex items-center gap-1 font-medium">
              <AlertTriangle className="size-3" />
              文字起こしエラー
            </div>
            <div className="select-text whitespace-pre-wrap text-amber-100/90">{a.transcription_error}</div>
          </div>
        )}
      </>
    );
  }

  if (modality === "image") {
    const img = ctx as ImageContext;
    const exif = img.exif ?? {};
    const exifKeys = Object.keys(exif);
    const gps = exifKeys.length > 0 ? exifGps(exif as Record<string, unknown>) : null;
    // 整形対象 EXIF キー (大文字小文字無視) を抽出。残りは「その他」accordion に流す
    const consumedKeys = new Set<string>();
    const primaryRows: { label: string; value: string }[] = [];
    for (const def of EXIF_PRIMARY) {
      const v = findExifValue(exif as Record<string, unknown>, def.keys);
      if (v == null || v === "") continue;
      const formatted = def.fmt ? def.fmt(v) : String(v);
      if (formatted) primaryRows.push({ label: def.label, value: formatted });
      // 消費したキーを記録 (大文字小文字無視)
      for (const k of exifKeys) {
        if (def.keys.some((dk) => dk.toLowerCase() === k.toLowerCase())) consumedKeys.add(k);
      }
    }
    const restEntries = exifKeys
      .filter((k) => !consumedKeys.has(k) && !["GPSLatitude", "GPSLongitude", "GPSLat", "GPSLon"].includes(k))
      .sort();

    return (
      <>
        <Accordion title="メタデータ" icon={<Image className="w-3 h-3 shrink-0" />} defaultOpen>
          <div className="space-y-0.5">
            {img.width != null && img.height != null && <MetaRow label="寸法" value={`${img.width}×${img.height}`} />}
            <MetaRow label="フォーマット" value={img.format} />
            {img.width != null && img.height != null && (
              <MetaRow label="アスペクト比" value={`${(img.width / img.height).toFixed(2)} : 1`} />
            )}
          </div>
        </Accordion>

        {primaryRows.length > 0 && (
          <Accordion title="撮影情報" defaultOpen>
            <div className="space-y-0.5">
              {primaryRows.map((r) => (
                <MetaRow key={r.label} label={r.label} value={r.value} />
              ))}
            </div>
          </Accordion>
        )}

        {gps && (
          <Accordion title="位置情報">
            <div className="space-y-1">
              <MetaRow label="緯度" value={gps.lat.toFixed(6)} />
              <MetaRow label="経度" value={gps.lon.toFixed(6)} />
              <a
                href={`https://www.openstreetmap.org/?mlat=${gps.lat}&mlon=${gps.lon}#map=15/${gps.lat}/${gps.lon}`}
                target="_blank"
                rel="noreferrer noopener"
                className="text-[10px] text-primary hover:underline"
              >
                OpenStreetMap で開く →
              </a>
            </div>
          </Accordion>
        )}

        {restEntries.length > 0 && (
          <Accordion title={`EXIF (その他 ${restEntries.length})`}>
            <div className="space-y-0.5">
              {restEntries.map((key) => (
                <MetaRow key={key} label={key} value={String((exif as Record<string, unknown>)[key])} />
              ))}
            </div>
          </Accordion>
        )}
      </>
    );
  }

  if (modality === "pdf") {
    const p = ctx as PdfContext;
    return (
      <>
        <Accordion title="メタデータ" icon={<FileType className="w-3 h-3 shrink-0" />} defaultOpen>
          <div className="space-y-0.5">
            <MetaRow label="ページ数" value={p.page_count} />
            <MetaRow label="単語数" value={p.word_count?.toLocaleString()} />
            {p.page_count != null && p.word_count != null && p.page_count > 0 && (
              <MetaRow
                label="平均語数 / ページ"
                value={Math.round(p.word_count / p.page_count).toLocaleString()}
              />
            )}
            {p.word_count != null && (
              <MetaRow label="読了目安" value={`${Math.max(1, Math.round(p.word_count / 250))}分`} />
            )}
          </div>
        </Accordion>

        {p.L3_full_text && (
          <Accordion title="本文（先頭抜粋）">
            <CollapsibleText text={p.L3_full_text} maxLines={8} />
          </Accordion>
        )}
      </>
    );
  }

  if (modality === "code") {
    const c = ctx as CodeContext;
    return (
      <>
        <Accordion title="メタデータ" icon={<FileCode className="w-3 h-3 shrink-0" />} defaultOpen>
          <div className="space-y-0.5">
            <MetaRow label="言語" value={c.language} />
            <MetaRow label="行数" value={c.line_count?.toLocaleString()} />
            {c.line_count != null && (
              <MetaRow label="規模" value={c.line_count < 50 ? "小" : c.line_count < 300 ? "中" : c.line_count < 1000 ? "大" : "特大"} />
            )}
          </div>
        </Accordion>

        {c.L3_full_text && (
          <Accordion title="ソース（先頭抜粋）">
            <pre className="max-h-56 overflow-auto rounded bg-muted/40 p-2 text-[10px] leading-relaxed font-mono select-text">
              {c.L3_full_text.split("\n").slice(0, 50).join("\n")}
              {c.L3_full_text.split("\n").length > 50 && "\n…"}
            </pre>
          </Accordion>
        )}
      </>
    );
  }

  if (modality === "article") {
    const a = ctx as ArticleContext;
    return (
      <>
        <Accordion title="メタデータ" icon={<BookOpen className="w-3 h-3 shrink-0" />} defaultOpen>
          <div className="space-y-0.5">
            <MetaRow label="フォーマット" value={a.format} />
            <MetaRow label="単語数" value={a.word_count?.toLocaleString()} />
            {a.word_count != null && (
              <MetaRow label="読了目安" value={`${Math.max(1, Math.round(a.word_count / 250))}分`} />
            )}
          </div>
        </Accordion>

        {a.L2_outline && (
          <Accordion title="アウトライン" defaultOpen>
            <CollapsibleText text={a.L2_outline} maxLines={5} />
          </Accordion>
        )}

        {a.L3_full_text && (
          <Accordion title="本文（先頭抜粋）">
            <CollapsibleText text={a.L3_full_text} maxLines={8} />
          </Accordion>
        )}
      </>
    );
  }

  // 未知のモダリティ: JSON をそのまま表示
  return null;
}

// ===== 分析メタデータ表示 =====

function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}秒`;
}

function AnalysisMetaSection({ meta }: { meta: AnalysisMeta }) {
  // 抽出ツールと LLM を分離して表示
  const tools = meta.tools_used ?? [];
  const extractionTools = tools.filter((t: string) => !t.includes("/"));  // "deepseek/..." はLLM
  const llmModel = meta.model ?? "不明";
  const modeLabel = meta.analysis_mode === "api" ? "API"
    : meta.analysis_mode === "cloud" ? "Akari Cloud"
      : meta.analysis_mode === "cloud-transcribe" ? "Cloud Transcribe"
        : meta.analysis_mode === "markitdown" ? "MarkItDown"
          : meta.analysis_mode === "local" ? "ローカル"
            : "—";

  return (
    <Accordion title="分析情報" icon={<Info className="w-3 h-3 shrink-0" />}>
      <div className="space-y-0.5">
        {extractionTools.length > 0 && (
          <MetaRow label="抽出" value={extractionTools.join(", ")} />
        )}
        <MetaRow label="LLM" value={llmModel} />
        <MetaRow label="モード" value={modeLabel} />
        {meta.duration_ms != null && (
          <MetaRow label="所要時間" value={formatDurationMs(meta.duration_ms)} />
        )}
        {meta.timestamp && (
          <MetaRow label="分析日時" value={formatDate(meta.timestamp)} />
        )}
        {meta.analyzer_version && (
          <MetaRow label="バージョン" value={`${meta.analyzer_name ?? ""}@${meta.analyzer_version}`} />
        )}
      </div>
    </Accordion>
  );
}

function analysisWorkflowModeLabel(mode: AnalysisWorkflowContext["mode"]): string {
  switch (mode) {
    case "api":
      return "API";
    case "cloud":
      return "Akari Cloud";
    case "cloud-transcribe":
      return "Cloud Transcribe";
    case "markitdown":
      return "MarkItDown";
    case "local":
      return "ローカル";
    default:
      return mode;
  }
}

function analysisWorkflowProviderLabel(provider: string) {
  switch (provider) {
    case "api":
      return "API";
    case "cloud":
      return "Akari Cloud";
    case "local":
      return "ローカル";
    default:
      return provider;
  }
}

function AnalysisWorkflowSection({ workflow }: { workflow: AnalysisWorkflowContext }) {
  return (
    <Accordion title="分析ワークフロー" icon={<Sparkles className="w-3 h-3 shrink-0" />} defaultOpen>
      <div className="space-y-2">
        <div className="space-y-0.5">
          <MetaRow label="実行モード" value={analysisWorkflowModeLabel(workflow.mode)} />
          <MetaRow label="見積もり" value={workflow.estimated_cost?.label} />
          <MetaRow label="更新" value={workflow.updated_at ? formatDate(workflow.updated_at) : undefined} />
        </div>
        {workflow.steps.length > 0 && (
          <div className="space-y-1">
            {workflow.steps.map((step, index) => (
              <div
                key={`${step.id}-${index}`}
                className="rounded border border-border/50 bg-background/45 px-2 py-1.5"
              >
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-medium text-primary">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">
                    {step.label}
                  </span>
                  {step.costLabel && (
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {step.costLabel}
                    </span>
                  )}
                </div>
                <div className="mt-1 ml-6 flex min-w-0 items-center gap-1.5 text-[9px] text-muted-foreground">
                  <span className="rounded bg-muted px-1 py-0.5 font-mono text-[8px] text-muted-foreground">
                    {step.shortLabel}
                  </span>
                  <span>{analysisWorkflowProviderLabel(step.provider)}</span>
                  {step.model && (
                    <>
                      <span className="text-muted-foreground/50">/</span>
                      <span className="min-w-0 truncate">{step.model}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Accordion>
  );
}

// ===== メインコンポーネント =====

export interface PoolItemDetailProps {
  item: PoolItemFull | null;
  workspace: string | null;
  onItemUpdated?: (item: PoolItemFull) => void;
  onRequestAnalyze?: (itemId: string) => void;
  onItemDeleted?: () => void;
  onRestore?: () => Promise<void> | void;
  onPurge?: () => Promise<void> | void;
  /** Pool グラフへ切替 (PoolBrowserView から viewMode='graph' をトリガ) */
  onJumpToGraph?: (itemId: string) => void;
  /** タグでフィルタ検索 (PoolBrowserView 側で検索クエリに反映) */
  onSearchByTag?: (tag: string) => void;
  /** 別アイテムへジャンプ (Relations / Similar タブで使用) */
  onSelectItem?: (itemId: string) => void;
  /** エンティティへジャンプ (Relations タブの関連エンティティで使用) */
  onSelectEntity?: (entityId: string) => void;
  /** workspace 内の全アイテム (Relations タブで相手アイテム名解決に使う) */
  items?: PoolItemSummary[];
  /** workspace 内の全リレーション (Relations タブのソース) */
  relations?: PoolRelation[];
  /** エンティティ inspector などへの埋め込み時は編集 / 分析 / 削除系操作を隠す */
  readOnly?: boolean;

  // ===== 注入 props（shell 固有の重い依存を外側から渡す） =====
  /** トースト通知 API。未指定は noop。 */
  toast?: ToastApi;
  /** Finder / Explorer でファイルを開く。未指定はボタン非表示。 */
  onRevealInDir?: (id: string, filePath: string) => void;
  /** PDF プレビュー（filePath を渡す）。未指定はフォールバック表示。 */
  renderPdfPreview?: (filePath: string) => ReactNode;
  /** 音声波形プレイヤー。未指定は native `<audio>` にフォールバック。 */
  renderAudioPlayer?: (p: {
    url: string;
    segments?: TranscriptionSegment[];
    audioPlayerRef: Ref<AudioPlayerHandle>;
  }) => ReactNode;
  /** Excel プレビュー（convertFileSrc 済み URL を渡す）。未指定はフォールバック表示。 */
  renderXlsxPreview?: (url: string) => ReactNode;
  /** DOCX プレビュー（convertFileSrc 済み URL を渡す）。未指定はフォールバック表示。 */
  renderDocxPreview?: (url: string) => ReactNode;
  /** Markdown テキストレンダラー。未指定は `<pre>` にフォールバック。 */
  renderMarkdown?: (text: string) => ReactNode;
  /** コードハイライトレンダラー。未指定は `<pre>` にフォールバック。 */
  renderCode?: (p: { code: string; filePath?: string | null; mime?: string | null; itemType: string }) => ReactNode;
  /** CSV / TSV / JSONL テーブルレンダラー。未指定は `<pre>` にフォールバック。 */
  renderCsv?: (p: { text: string; format: "csv" | "tsv" | "jsonl"; filePath?: string | null; mime?: string | null }) => ReactNode;
  /**
   * モーダルコンポーネント（テキストプレビュー / メディアポップアップ / 履歴表示に使う）。
   * 未指定の場合、各ポップアップ表示は省略される（ボタンを非表示またはプレーンフォールバック）。
   */
  PreviewModalComponent?: ComponentType<{
    title: string; subtitle?: string; onClose: () => void;
    size?: "sm" | "md" | "lg" | "xl" | "full"; children?: ReactNode;
  }>;
  /**
   * 「AI」タブの中身を注入する（素材から AI 生成/加工を起動するランチャー等）。
   * 指定された場合のみ AI タブが表示される。akari-video が AiClipTab を差し込む用途。
   * shell-ui は AI 実装に非依存（注入のみ）。
   */
  renderAiTab?: () => ReactNode;
  /** 表示するタブを制限（例: ["overview","details","relations","ai"]）。未指定 = 全タブ表示。 */
  tabs?: TabId[];
  /** アクションボタン（編集 / 分析 / アーカイブ / 削除等）を表示するか。default true。 */
  showActions?: boolean;
  /**
   * ヘッダのインラインメディアプレビュー（動画/画像/音声プレイヤー）を表示するか。default true。
   * ホスト側に素材プレイヤーがある場合（akari-video の中央ソースプレビュー等）は false にして
   * 二重表示を避ける。
   */
  showMediaPreview?: boolean;
  /**
   * 文字起こし / キーフレームのタイムスタンプ click 時の seek をホストに委譲する。
   * 指定時はインラインプレイヤーではなくこのコールバックを呼ぶ（中央プレビューへジャンプ等）。
   * 未指定時は従来どおりインラインプレイヤーを seek する。
   */
  onSeekToTime?: (seconds: number) => void;
}

export function PoolItemDetail({
  item,
  workspace,
  onItemUpdated,
  onRequestAnalyze,
  onItemDeleted,
  onRestore,
  onPurge,
  onJumpToGraph,
  onSearchByTag,
  onSelectItem,
  onSelectEntity,
  items,
  relations,
  readOnly = false,
  toast: toastProp,
  onRevealInDir,
  renderPdfPreview,
  renderAudioPlayer,
  renderXlsxPreview,
  renderDocxPreview,
  renderMarkdown,
  renderCode,
  renderCsv,
  PreviewModalComponent,
  renderAiTab,
  tabs: tabsProp,
  showActions = true,
  showMediaPreview = true,
  onSeekToTime,
}: PoolItemDetailProps) {
  const toast = toastProp ?? NOOP_TOAST;
  const [rawJsonOpen, setRawJsonOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mediaPopupOpen, setMediaPopupOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 共有 thumbnail cache（ItemList と同じ entry を参照、IPC 重複排除）
  // useThumb は string | null | undefined を返す: undefined=未取得, null=取得失敗 / 該当なし
  const thumbnail = useThumb(workspace, item?.id ?? null);
  const thumbnailLoading = thumbnail === undefined && (item?.item_type?.toLowerCase() === "image" || item?.item_type?.toLowerCase() === "video");
  const [filePath, setFilePath] = useState<string | null>(null);
  // "ai" タブは renderAiTab が注入された時のみ表示する（未注入なら順序からも除外）。
  const effectiveTabs = (tabsProp ? TAB_ORDER.filter((t) => tabsProp.includes(t)) : TAB_ORDER).filter(
    (t) => t !== "ai" || !!renderAiTab,
  );
  const [activeTab, setActiveTab] = useState<TabId>(() =>
    tabsProp && tabsProp.length > 0 && !tabsProp.includes("overview")
      ? tabsProp[0]
      : "overview"
  );
  // tabsProp が変わった時に activeTab を有効な値に戻す
  useEffect(() => {
    if (tabsProp && !tabsProp.includes(activeTab)) {
      setActiveTab(tabsProp[0] ?? "overview");
    }
  }, [tabsProp, activeTab]);
  const [historyOpen, setHistoryOpen] = useState(false);
  /**
   * task #6: アーカイブ前のリネージチェック結果。
   * null=未チェック / safe=true=即削除可 / safe=false=インライン警告表示中。
   */
  const [archiveCheck, setArchiveCheck] = useState<AssetDeleteCheck | null>(null);
  const [archiveChecking, setArchiveChecking] = useState(false);
  /** task #6: 完全削除の 2 段階インライン確認 (purge は元に戻せないため) */
  const [purgeConfirm, setPurgeConfirm] = useState(false);
  /** Phase 0 task: アイテム編集モード (name / ai_summary / ai_tags をインラインで編集) */
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftSummary, setDraftSummary] = useState("");
  const [draftTagsText, setDraftTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const inlineVideoRef = useRef<HTMLVideoElement>(null);
  const audioPlayerRef = useRef<AudioPlayerHandle>(null);
  const [pendingMediaSeek, setPendingMediaSeek] = useState<{ sec: number; autoplay: boolean } | null>(null);
  const [timelineSeekOffsetMs, setTimelineSeekOffsetMs] = useState(() => {
    if (typeof window === "undefined") return 0;
    const saved = Number(window.localStorage.getItem(SEEK_OFFSET_STORAGE_KEY));
    return clampSeekOffsetMs(saved);
  });
  const updateTimelineSeekOffset = useCallback((nextMs: number) => {
    const clamped = clampSeekOffsetMs(nextMs);
    setTimelineSeekOffsetMs(clamped);
    try {
      window.localStorage.setItem(SEEK_OFFSET_STORAGE_KEY, String(clamped));
    } catch {
      // ignore persistence errors
    }
  }, []);

  // アイテムが変わったらリセット + ファイルパス取得（thumbnail は useThumb が共有キャッシュから取る）
  // 性能対策（perf fix 2026-05-08）: video の filePath は **再生されるまで取得しない**。
  // image / pdf / xlsx / docx は preview に絶対 path が要るので即取得、video は thumbnail を
  // poster にして preload="none" にし、ユーザが play クリックした時点で path を解決する。
  useEffect(() => {
    setContent(null);
    setPreviewOpen(false);
    setMediaPopupOpen(false);
    setRawJsonOpen(false);
    setError(null);
    setFilePath(null);
    setArchiveCheck(null);
    setPurgeConfirm(false);
    setEditing(false);
    setHistoryOpen(false);

    if (!item || !workspace) return;
    const type = item.item_type.toLowerCase();

    // メディアファイルのパス取得（image preview / PDF / XLSX / DOCX は即必要、video / audio は遅延）
    const path = item.file_path?.toLowerCase() ?? "";
    const needsEagerPath =
      ["image", "audio", "pdf"].includes(type) ||
      /\.(pdf|xlsx|xls|ods|docx)$/i.test(path);
    if (needsEagerPath) {
      getItemFilePath(workspace, item.id)
        .then((p) => setFilePath(p))
        .catch(() => {});
    }
  }, [item?.id, workspace]);

  /**
   * 動画再生のクリック発火型ローダー。
   * preload="none" 中はメタを読まず poster だけ表示。play / クリックで初めて path を解決する。
   */
  const ensureVideoPath = useCallback(async () => {
    if (filePath || !item || !workspace) return;
    try {
      const p = await getItemFilePath(workspace, item.id);
      setFilePath(p);
    } catch {
      // noop
    }
  }, [filePath, item?.id, workspace]);

  const seekInlineMedia = useCallback((sec: number, autoplay = true) => {
    if (!item) return;
    const type = item.item_type.toLowerCase();
    if (type === "video") {
      if (!filePath) {
        setPendingMediaSeek({ sec, autoplay });
        void ensureVideoPath();
        return;
      }
      const video = inlineVideoRef.current;
      if (!video) {
        setPendingMediaSeek({ sec, autoplay });
        return;
      }
      seekVideoElement(video, sec, autoplay);
      return;
    }
    if (type === "audio") {
      audioPlayerRef.current?.seekTo(sec, autoplay);
    }
  }, [ensureVideoPath, filePath, item]);

  // タイムスタンプ click の seek。onSeekToTime 指定時はホスト（中央プレビュー等）へ委譲し、
  // 無ければインラインプレイヤーを seek する。showMediaPreview=false のときはインライン player が
  // 無いので onSeekToTime を渡す前提。
  const handleSeek = useCallback(
    (sec: number, autoplay = true) => {
      if (onSeekToTime) {
        onSeekToTime(sec);
        return;
      }
      seekInlineMedia(sec, autoplay);
    },
    [onSeekToTime, seekInlineMedia],
  );

  const toggleInlineMedia = useCallback(() => {
    if (!item) return;
    const type = item.item_type.toLowerCase();
    if (type === "video") {
      const video = inlineVideoRef.current;
      if (!video) return;
      if (video.paused) {
        void video.play();
      } else {
        video.pause();
      }
      return;
    }
    if (type === "audio") {
      audioPlayerRef.current?.togglePlay();
    }
  }, [item]);

  useEffect(() => {
    if (!pendingMediaSeek || !item) return;
    const type = item.item_type.toLowerCase();
    if (type === "video" && inlineVideoRef.current) {
      seekVideoElement(inlineVideoRef.current, pendingMediaSeek.sec, pendingMediaSeek.autoplay);
      setPendingMediaSeek(null);
    } else if (type === "audio" && audioPlayerRef.current) {
      audioPlayerRef.current.seekTo(pendingMediaSeek.sec, pendingMediaSeek.autoplay);
      setPendingMediaSeek(null);
    }
  }, [filePath, item, pendingMediaSeek]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (!item || !["video", "audio"].includes(item.item_type.toLowerCase())) return;

      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName.toLowerCase();
        if (target.isContentEditable || ["input", "textarea", "select"].includes(tag)) {
          return;
        }
        if (tag === "button" && !target.closest('[data-transcription-timeline="true"]')) {
          return;
        }
      }

      event.preventDefault();
      toggleInlineMedia();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [item, toggleInlineMedia]);

  /**
   * task #6: 即アーカイブ + Undo Toast (5-8s) パターン。
   * モダル confirm() 廃止 (ルール 9/11 一画面化)。
   *
   * 1. checkAssetDeletion で referenced_by を確認
   * 2. blockers がある → インライン警告バナーを表示し、ユーザーが「それでも削除」を押すまで待つ
   * 3. 安全 or 強制削除 → archiveItem 即実行 + Undo Toast
   */
  const handleArchive = useCallback(async () => {
    if (!item || !workspace) return;
    setError(null);
    setArchiveChecking(true);
    try {
      const check = await checkAssetDeletion(workspace, item.id);
      if (!check.safe) {
        // インライン警告を出して、ユーザーの確認ボタンを待つ
        setArchiveCheck(check);
        return;
      }
      // safe → 即アーカイブ + Undo Toast
      await performArchive();
    } catch (e) {
      setError(String(e));
    } finally {
      setArchiveChecking(false);
    }
    // performArchive は下でクロージャ内に展開
    async function performArchive() {
      if (!item || !workspace) return;
      const itemId = item.id;
      const itemName = item.name;
      try {
        await archiveItem(workspace, itemId);
        // 元に戻すコールバック (Undo)
        toast.showAction({
          message: `「${itemName}」をアーカイブしました`,
          actionLabel: "元に戻す",
          onAction: async () => {
            try {
              await restoreItem(workspace, itemId);
              toast.show("復元しました", "success", "↺");
            } catch (err) {
              toast.show(`復元に失敗: ${String(err)}`, "error");
            }
          },
          timeoutMs: 7000,
          emoji: "🗑",
        });
        onItemDeleted?.();
      } catch (err) {
        setError(String(err));
      }
    }
  }, [item, workspace, onItemDeleted, toast]);

  /**
   * task #6: blockers ありの状態でユーザーが「それでも削除」を押したときの強制削除。
   * インライン警告バナーから呼ばれる。
   */
  const handleForceArchive = useCallback(async () => {
    if (!item || !workspace) return;
    const itemId = item.id;
    const itemName = item.name;
    setArchiveCheck(null);
    setError(null);
    try {
      await archiveItem(workspace, itemId);
      toast.showAction({
        message: `「${itemName}」をアーカイブしました（依存あり）`,
        actionLabel: "元に戻す",
        onAction: async () => {
          try {
            await restoreItem(workspace, itemId);
            toast.show("復元しました", "success", "↺");
          } catch (err) {
            toast.show(`復元に失敗: ${String(err)}`, "error");
          }
        },
        timeoutMs: 8000,
        emoji: "⚠️",
      });
      onItemDeleted?.();
    } catch (err) {
      setError(String(err));
    }
  }, [item, workspace, onItemDeleted, toast]);

  const handleStartEdit = useCallback(() => {
    if (!item) return;
    setDraftName(item.name);
    setDraftSummary(item.ai_summary ?? "");
    setDraftTagsText(item.ai_tags.join(", "));
    setEditing(true);
  }, [item]);

  const handleCancelEdit = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!item || !workspace) return;
    const trimmedName = draftName.trim();
    if (!trimmedName) {
      setError("タイトルは空にできません");
      return;
    }
    const tags = draftTagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setSaving(true);
    setError(null);
    try {
      const nameChanged = trimmedName !== item.name;
      const summaryChanged = draftSummary !== (item.ai_summary ?? "");
      const tagsChanged = JSON.stringify(tags) !== JSON.stringify(item.ai_tags);
      // 編集前 snapshot を履歴に push (変更があった場合のみ)
      if (nameChanged || summaryChanged || tagsChanged) {
        pushRevision(workspace, item.id, {
          name: item.name,
          ai_summary: item.ai_summary ?? null,
          ai_tags: [...item.ai_tags],
          source: "manual",
        });
      }
      const updated = await updateItem(workspace, item.id, {
        name: nameChanged ? trimmedName : undefined,
        ai_summary: summaryChanged ? draftSummary : undefined,
        ai_tags: tagsChanged ? tags : undefined,
      });
      onItemUpdated?.(updated);
      setEditing(false);
      toast.show("保存しました", "success", "✏️");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }, [item, workspace, draftName, draftSummary, draftTagsText, onItemUpdated, toast]);

  const handleAnalyze = useCallback(async () => {
    if (!item || !workspace) return;
    setAnalyzing(true);
    setError(null);
    // 再分析の場合は AI が生成済みの値を上書きするので、直前の値を履歴に残す
    if (item.analyzed_at) {
      pushRevision(workspace, item.id, {
        name: item.name,
        ai_summary: item.ai_summary ?? null,
        ai_tags: [...item.ai_tags],
        source: "ai-analysis",
      });
    }
    try {
      const updated = await analyzeItem(workspace, item.id);
      onItemUpdated?.(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setAnalyzing(false);
    }
  }, [item, workspace, onItemUpdated]);

  const handleRestoreRevision = useCallback(
    async (rev: ItemRevision) => {
      if (!workspace || !item) return;
      try {
        // 現在の値を履歴に push してから復元
        pushRevision(workspace, item.id, {
          name: item.name,
          ai_summary: item.ai_summary ?? null,
          ai_tags: [...item.ai_tags],
          source: "manual",
        });
        const updated = await updateItem(workspace, item.id, {
          name: rev.name,
          ai_summary: rev.ai_summary ?? "",
          ai_tags: rev.ai_tags,
        });
        onItemUpdated?.(updated);
        setHistoryOpen(false);
        toast.show("この時点に戻しました", "success", "↺");
      } catch (e) {
        setError(String(e));
      }
    },
    [item, workspace, onItemUpdated, toast],
  );

  const handleOpenPreview = useCallback(async () => {
    if (!item || !workspace) return;
    // バイナリオフィスドキュメントは text 読込スキップ (コンポーネント側で URL fetch)
    const path = item.file_path?.toLowerCase() ?? "";
    const isBinaryOffice = /\.(xlsx|xls|ods|docx)$/i.test(path);
    if (isBinaryOffice) {
      setPreviewOpen(true);
      return;
    }
    if (content !== null) {
      setPreviewOpen(true);
      return;
    }
    setContentLoading(true);
    try {
      const text = await readItemContent(workspace, item.id);
      setContent(text);
      setPreviewOpen(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setContentLoading(false);
    }
  }, [item, workspace, content]);

  if (!item) {
    return (
      <div className="h-full flex items-center justify-center bg-card/30">
        <p className="text-xs text-muted-foreground">
          アイテムを選択してください
        </p>
      </div>
    );
  }

  // task #7: text Asset 判定の拡張 — item_type が text 系 (Article/Note/Code/Url) なら "内容を見る" を出す。
  const itemTypeLower = item.item_type.toLowerCase();
  const isTextFile =
    item.mime_type?.startsWith("text/") ||
    item.mime_type === "application/json" ||
    item.mime_type === "application/x-yaml" ||
    item.mime_type === "application/javascript" ||
    item.mime_type === "application/x-ndjson" ||
    /\.(md|txt|ts|tsx|js|jsx|mjs|cjs|rs|py|rb|go|java|kt|swift|c|h|cpp|hpp|cs|php|sh|bash|json|jsonc|ya?ml|toml|xml|html|css|scss|sql|graphql|vue|svelte|lua|r|scala|ex|exs|hs|clj|ml|dart|zig|csv|tsv|jsonl|ndjson)$/i.test(
      item.file_path ?? "",
    ) ||
    ["article", "note", "code", "url"].includes(itemTypeLower);
  // データテーブル系判定 (csv/tsv/jsonl)
  const dataFormat: "csv" | "tsv" | "jsonl" | null = (() => {
    const path = (item.file_path ?? "").toLowerCase();
    if (path.endsWith(".csv")) return "csv";
    if (path.endsWith(".tsv")) return "tsv";
    if (path.endsWith(".jsonl") || path.endsWith(".ndjson")) return "jsonl";
    if (item.mime_type === "text/csv") return "csv";
    if (item.mime_type === "text/tab-separated-values") return "tsv";
    if (item.mime_type === "application/x-ndjson") return "jsonl";
    return null;
  })();
  // PDF: item_type / mime / 拡張子のいずれかで判定
  const isPdfFile =
    itemTypeLower === "pdf" ||
    item.mime_type === "application/pdf" ||
    item.file_path?.toLowerCase().endsWith(".pdf");
  // バイナリオフィスドキュメント (xlsx/docx) — text content 読込はスキップ
  const officeKind: "xlsx" | "docx" | null = (() => {
    const p = (item.file_path ?? "").toLowerCase();
    if (/\.(xlsx|xls|ods)$/i.test(p)) return "xlsx";
    if (p.endsWith(".docx")) return "docx";
    if (
      item.mime_type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      item.mime_type === "application/vnd.ms-excel"
    )
      return "xlsx";
    if (
      item.mime_type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
      return "docx";
    return null;
  })();
  const ctxJson = item.context_json as ContextJson | null;
  const hasRichView = ctxJson?.modality && ["video", "audio", "image", "pdf", "code", "article"].includes(ctxJson.modality);

  // 動画の字幕 / 文字起こし (タイムスタンプ無しのプレーンテキスト)
  const videoCtx = ctxJson?.modality === "video" ? (ctxJson as VideoContext) : null;
  const subtitleText = videoCtx?.subtitle_text?.trim() || undefined;
  const transcriptionText = videoCtx?.transcription?.trim() || undefined;
  const videoTranscriptionError = videoCtx?.transcription_error?.trim() || undefined;
  // HUB-055 Phase 4: Groq Whisper 由来の segments (時刻ジャンプに使う)
  const transcriptionSegments = videoCtx?.transcription_segments ?? undefined;
  const transcriptionWords = videoCtx?.transcription_words ?? undefined;
  const detailKeyframes = keyframeRows(videoCtx);
  // 音声の文字起こし segments (audio modality 用)
  const audioCtx = ctxJson?.modality === "audio" ? (ctxJson as AudioContext) : null;
  const audioTranscriptionText = audioCtx?.transcription?.trim() || undefined;
  const audioTranscriptionError = audioCtx?.transcription_error?.trim() || undefined;
  const audioSegments = audioCtx?.transcription_segments ?? undefined;
  const audioWords = audioCtx?.transcription_words ?? undefined;
  const detailTranscriptionText = transcriptionText ?? audioTranscriptionText;
  const detailTranscriptionError = videoTranscriptionError ?? audioTranscriptionError;
  const detailTranscriptionSegments = (transcriptionSegments?.length ?? 0) > 0
    ? transcriptionSegments
    : (audioSegments?.length ?? 0) > 0
      ? audioSegments
      : undefined;
  const detailTranscriptionWords = (transcriptionSegments?.length ?? 0) > 0
    ? transcriptionWords
    : (audioSegments?.length ?? 0) > 0
      ? audioWords
      : undefined;
  const detailTranscriptionDuration = videoCtx?.duration_sec ?? audioCtx?.duration_sec;

  return (
    <div className="h-full flex flex-col bg-card/30">
      {/* ヘッダー (常時表示) */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        {editing ? (
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            disabled={saving}
            className="w-full text-sm font-semibold bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
            placeholder="タイトル"
          />
        ) : (
          <h3 className="text-sm font-semibold break-words">{item.name}</h3>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
            {item.item_type}
          </span>
          {item.mime_type && (
            <span className="text-[10px] text-muted-foreground">
              {item.mime_type}
            </span>
          )}
        </div>

        {/* メディアプレビュー（ホストに素材プレイヤーがある場合 showMediaPreview=false で抑制） */}
        {showMediaPreview && thumbnailLoading && (
          <div className="mt-2 h-40 bg-muted/30 rounded flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {/*
          動画プレーヤー (インスペクタ内)。
          性能対策（perf fix 2026-05-08）: preload="none" + 初回 play でメタ読込（filePath 解決も lazy）。
          - filePath 未解決のうちは poster image のみの軽量プレビュー（クリックで読込）
          - filePath 解決済なら <video preload="none">、ユーザが play した時のみブラウザがメタを読む
          - フルスクリーン / ポップアップ再生ボタンを overlay で添える
        */}
        {showMediaPreview && filePath && item.item_type.toLowerCase() === "video" && (
          <div className="mt-2 rounded overflow-hidden border border-border relative group bg-black">
            <video
              ref={inlineVideoRef}
              src={convertFileSrc(filePath)}
              controls
              poster={thumbnail ?? undefined}
              preload="none"
              className="w-full max-h-72 bg-black"
            />
            <button
              onClick={() => setMediaPopupOpen(true)}
              className="absolute top-1.5 right-1.5 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition hover:bg-black/80"
              title="フルスクリーン / 大きく表示"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* filePath 未解決の動画: poster のみの軽量カード。クリックで filePath 解決 → <video> 切替 */}
        {showMediaPreview && !filePath && item.item_type.toLowerCase() === "video" && (
          <button
            onClick={() => {
              ensureVideoPath();
              setMediaPopupOpen(true);
            }}
            onMouseEnter={() => ensureVideoPath()}
            className="mt-2 rounded overflow-hidden border border-border relative group w-full bg-black"
          >
            {thumbnail ? (
              <img src={thumbnail} alt={item.name} className="w-full h-auto max-h-48 object-contain bg-black/20" />
            ) : (
              <div className="w-full h-40 flex items-center justify-center text-muted-foreground text-xs">
                {thumbnailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "プレビューなし"}
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition">
              <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center">
                <span className="ml-0.5 text-black text-lg">▶</span>
              </div>
            </div>
          </button>
        )}

        {/* 画像プレビュー（file:// で高解像度表示） */}
        {showMediaPreview && !thumbnailLoading && item.item_type.toLowerCase() === "image" && (
          <button
            onClick={() => setMediaPopupOpen(true)}
            className="mt-2 rounded overflow-hidden border border-border block w-full relative group"
            title="クリックで拡大"
          >
            <img
              src={filePath ? convertFileSrc(filePath) : thumbnail ?? ""}
              alt={item.name}
              className="w-full h-auto max-h-72 object-contain bg-black/20"
            />
            <div className="absolute top-1.5 right-1.5 p-1 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition">
              <Maximize2 className="w-3.5 h-3.5" />
            </div>
          </button>
        )}

        {/* 音声プレーヤー（波形 + segments クリックジャンプ） */}
        {showMediaPreview && filePath && item.item_type.toLowerCase() === "audio" && (
          <div className="mt-2">
            {renderAudioPlayer ? (
              renderAudioPlayer({
                url: convertFileSrc(filePath),
                segments: audioSegments,
                audioPlayerRef,
              })
            ) : (
              <audio src={convertFileSrc(filePath)} controls className="w-full h-8" />
            )}
          </div>
        )}

        {/* アクションボタン */}
        {showActions && <div className="flex gap-1.5 mt-2 flex-wrap">
          {!readOnly && editing ? (
            <>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-primary/40 bg-primary text-primary-foreground hover:bg-primary/90 transition disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                保存
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border bg-muted/50 text-muted-foreground hover:text-foreground transition disabled:opacity-50"
              >
                <X className="w-3 h-3" />
                取消
              </button>
            </>
          ) : !readOnly ? (
            <>
              {!item.archived_at && (
                <button
                  onClick={handleStartEdit}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border bg-muted/50 text-muted-foreground hover:text-foreground transition"
                  title="名前 / 要約 / タグを編集"
                >
                  <Pencil className="w-3 h-3" />
                  編集
                </button>
              )}
              <button
                onClick={() => onRequestAnalyze && item ? onRequestAnalyze(item.id) : handleAnalyze()}
                disabled={analyzing}
                className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition disabled:opacity-50"
              >
                {analyzing ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {analyzing ? "分析中..." : item.analyzed_at ? "再分析" : "AI 分析"}
              </button>
              {workspace && getRevisions(workspace, item.id).length > 0 && (
                <button
                  onClick={() => setHistoryOpen(true)}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border bg-muted/50 text-muted-foreground hover:text-foreground transition"
                  title="編集 / 再分析の履歴を見る"
                >
                  <History className="w-3 h-3" />
                  履歴
                </button>
              )}
            </>
          ) : null}
          {(isTextFile || officeKind) && (
            <button
              onClick={handleOpenPreview}
              disabled={contentLoading}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border bg-muted/50 text-muted-foreground hover:text-foreground transition disabled:opacity-50"
            >
              {contentLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
              プレビュー
            </button>
          )}
          {isPdfFile && filePath && (
            <button
              onClick={() => setMediaPopupOpen(true)}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border bg-muted/50 text-muted-foreground hover:text-foreground transition"
              title="PDF を開く"
            >
              <FileType className="w-3 h-3" />
              PDF を開く
            </button>
          )}
          <div className="flex-1" />
          {!readOnly && item.archived_at ? (
            <>
              {onRestore && (
                <button
                  onClick={() => onRestore()}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition"
                  title="復元"
                >
                  <RotateCcw className="w-3 h-3" />
                  復元
                </button>
              )}
              {onPurge && (
                /*
                 * task #6: 完全削除は 2 段階インライン確認 (Undo 不可 = native confirm 不可)。
                 * 1 回目クリック → ボタンが「本当に？」に変化、5s で revert
                 * 2 回目クリック → 即 purge 実行 (toast で通知)
                 */
                <button
                  onClick={() => {
                    if (!purgeConfirm) {
                      setPurgeConfirm(true);
                      // 5 秒後に自動で確認状態を解除
                      setTimeout(() => setPurgeConfirm(false), 5000);
                      return;
                    }
                    setPurgeConfirm(false);
                    void onPurge();
                  }}
                  className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition ${
                    purgeConfirm
                      ? "border-destructive bg-destructive text-destructive-foreground animate-pulse"
                      : "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10"
                  }`}
                  title={purgeConfirm ? "もう一度クリックで完全削除" : "完全削除（取り消せません）"}
                >
                  <Trash2 className="w-3 h-3" />
                  {purgeConfirm ? "本当に？" : "完全削除"}
                </button>
              )}
            </>
          ) : !readOnly ? (
            <button
              onClick={handleArchive}
              disabled={archiveChecking}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10 transition disabled:opacity-50"
              title="アーカイブ（30日後に自動削除、Undo 可）"
            >
              {archiveChecking ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Archive className="w-3 h-3" />
              )}
              アーカイブ
            </button>
          ) : null}
        </div>}
      </div>

      {/*
        task #6: アーカイブ前のリネージ警告バナー (インライン、モダル禁止)。
        referenced_by[] (variant からの ref) がある場合のみ表示。
        ユーザーが内容を見て「それでも削除する」を押すと強制削除。
      */}
      {archiveCheck && !archiveCheck.safe && (
        <div className="mx-4 mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-semibold text-amber-100">
                この素材は他から参照されています
              </div>
              {archiveCheck.warnings.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {archiveCheck.warnings.map((w, i) => (
                    <li key={i} className="text-[10px] text-amber-100/80">
                      ・{w}
                    </li>
                  ))}
                </ul>
              )}
              {archiveCheck.blockers.length > 0 && (
                <details className="mt-1.5">
                  <summary className="text-[10px] text-amber-100/70 cursor-pointer">
                    依存先 {archiveCheck.blockers.length} 件
                  </summary>
                  <ul className="mt-1 ml-2 space-y-0.5">
                    {archiveCheck.blockers.slice(0, 8).map((b, i) => (
                      <li key={i} className="text-[10px] text-amber-100/60 break-all">
                        ・{b}
                      </li>
                    ))}
                    {archiveCheck.blockers.length > 8 && (
                      <li className="text-[10px] text-amber-100/60">
                        ・他 {archiveCheck.blockers.length - 8} 件
                      </li>
                    )}
                  </ul>
                </details>
              )}
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  onClick={handleForceArchive}
                  className="text-[10px] px-2 py-0.5 rounded border border-destructive/40 bg-destructive/20 text-destructive-foreground hover:bg-destructive/30 transition"
                >
                  それでも削除
                </button>
                <button
                  onClick={() => setArchiveCheck(null)}
                  className="text-[10px] px-2 py-0.5 rounded text-muted-foreground hover:text-foreground transition"
                >
                  キャンセル
                </button>
              </div>
            </div>
            <button
              onClick={() => setArchiveCheck(null)}
              className="text-amber-100/60 hover:text-amber-100 shrink-0"
              title="閉じる"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* エラー */}
      {error && (
        <div className="mx-4 mt-2 p-2 rounded bg-destructive/10 text-destructive text-[10px]">
          {error}
        </div>
      )}

      {/* タブナビ */}
      <div className="flex border-b border-border shrink-0 px-2 bg-card/40 overflow-x-auto" role="tablist">
        {effectiveTabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 px-3 py-1.5 text-[11px] border-b-2 transition ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* タブコンテンツ (スクロール) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 text-xs">
        {activeTab === "overview" && (
          <>
            {/* AI Summary */}
            {editing ? (
              <Field label="AI Summary（要約）">
                <textarea
                  value={draftSummary}
                  onChange={(e) => setDraftSummary(e.target.value)}
                  disabled={saving}
                  rows={4}
                  placeholder="アイテムの要約（空のままでも保存可）"
                  className="w-full text-[11px] bg-background border border-border rounded p-1.5 leading-relaxed focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </Field>
            ) : (
              item.ai_summary && (
                <Field label="AI Summary">
                  <p className="text-muted-foreground leading-relaxed">
                    {item.ai_summary}
                  </p>
                </Field>
              )
            )}

            {/* Tags */}
            {editing ? (
              <Field label="Tags（カンマ区切り）">
                <input
                  type="text"
                  value={draftTagsText}
                  onChange={(e) => setDraftTagsText(e.target.value)}
                  disabled={saving}
                  placeholder="例: research, draft, idea"
                  className="w-full text-[11px] bg-background border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </Field>
            ) : (
              Array.isArray(item.ai_tags) && item.ai_tags.length > 0 && (
                <Field label="Tags">
                  <div className="flex flex-wrap gap-1">
                    {(item.ai_tags as string[]).map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {tag}
                      </span>
                    ))}
                  </div>
                </Field>
              )
            )}

            {/* 動画の字幕 / 文字起こし
               HUB-055: segments があれば時刻付きリスト、なければ plain text */}
            {(detailTranscriptionSegments?.length ?? 0) > 0 ? (
              <Field label={subtitleText ? "字幕タイムライン (Whisper)" : "文字起こしタイムライン (Whisper)"}>
                <TranscriptionTimeline
                  segments={detailTranscriptionSegments!}
                  words={detailTranscriptionWords}
                  durationSec={detailTranscriptionDuration}
                  maxHeightClass="max-h-80"
                  seekOffsetMs={timelineSeekOffsetMs}
                  onSeekOffsetChange={updateTimelineSeekOffset}
                  onSeek={handleSeek}
                />
              </Field>
            ) : (
              (subtitleText || detailTranscriptionText) && (
                <Field label={subtitleText && detailTranscriptionText ? "字幕 / 文字起こし" : subtitleText ? "字幕" : "文字起こし"}>
                  <div className="max-h-48 overflow-y-auto rounded border border-border bg-background/50 p-2 select-text">
                    <pre className="whitespace-pre-wrap text-[11px] text-muted-foreground leading-relaxed font-sans">
                      {subtitleText ?? detailTranscriptionText}
                    </pre>
                  </div>
                </Field>
              )
            )}

            {detailTranscriptionError && (
              <Field label="文字起こしエラー">
                <div className="rounded border border-amber-500/25 bg-amber-500/10 px-2 py-1.5 text-[10px] text-amber-200 select-text whitespace-pre-wrap">
                  {detailTranscriptionError}
                </div>
              </Field>
            )}

            {detailKeyframes.length > 0 && (
              <Field label="代表フレーム結果">
                <KeyframeDescriptionList frames={detailKeyframes} onSeek={handleSeek} />
              </Field>
            )}

            {/* 主要メタ (作成 / 更新 / サイズ) */}
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
              {item.size_bytes != null && (
                <Field label="サイズ">
                  <span className="text-muted-foreground">{formatBytes(item.size_bytes)}</span>
                </Field>
              )}
              <Field label="作成日">
                <span className="text-muted-foreground">{formatDate(item.created_at)}</span>
              </Field>
              {item.analyzed_at && (
                <Field label="分析日">
                  <span className="text-muted-foreground">{formatDate(item.analyzed_at)}</span>
                </Field>
              )}
            </div>
          </>
        )}

        {activeTab === "details" && (
          <>
            {/* L1 要約 + L0_tags (モダリティ非依存) */}
            {ctxJson && <ContextHeader ctx={ctxJson} />}

            {/* モダリティ別リッチ表示 */}
            {ctxJson && hasRichView ? (
              <div className="space-y-1">
                <ContextRichView
                  ctx={ctxJson}
                  onSeek={handleSeek}
                  seekOffsetMs={timelineSeekOffsetMs}
                  onSeekOffsetChange={updateTimelineSeekOffset}
                />
              </div>
            ) : (
              !ctxJson?.L1_summary && (
                <p className="text-muted-foreground text-[11px]">
                  詳細な分析情報はありません。「AI 分析」を実行してください。
                </p>
              )
            )}

            {/* 分析ワークフロー */}
            {ctxJson?._analysis_workflow && (
              <AnalysisWorkflowSection workflow={ctxJson._analysis_workflow} />
            )}

            {/* 分析メタデータ */}
            {ctxJson && !!(ctxJson as Record<string, unknown>)._meta && (
              <AnalysisMetaSection meta={(ctxJson as Record<string, unknown>)._meta as AnalysisMeta} />
            )}

            {/* 分析の鮮度 */}
            <AnalysisFreshness analyzedAt={item.analyzed_at} />

            <div className="pt-2 border-t border-border/50 space-y-2">
              {item.file_path && (
                <Field label="ファイル">
                  <FilePathDisplay path={item.file_path} />
                </Field>
              )}
              {item.source_path && (
                <Field label="元ファイル">
                  <FilePathDisplay path={item.source_path} />
                </Field>
              )}
              {item.role && (
                <Field label="Role">
                  <span className="text-muted-foreground">{item.role}</span>
                </Field>
              )}
              {item.layer && (
                <Field label="Layer">
                  <span className="text-muted-foreground">{item.layer}</span>
                </Field>
              )}
              <Field label="更新日">
                <span className="text-muted-foreground">{formatDate(item.updated_at)}</span>
              </Field>
            </div>

            {/* 編集履歴 (最新 3 件、インライン) */}
            {workspace && (
              <InlineRevisions workspace={workspace} itemId={item.id} onOpenAll={() => setHistoryOpen(true)} />
            )}

            {/* アクションバー (詳細タブ末尾) */}
            <DetailActions
              item={item}
              workspace={workspace}
              onJumpToGraph={onJumpToGraph}
              onSearchByTag={onSearchByTag}
              onAnalyze={() =>
                onRequestAnalyze ? onRequestAnalyze(item.id) : void handleAnalyze()
              }
              analyzing={analyzing}
              toast={toast}
              onRevealInDir={onRevealInDir}
            />
          </>
        )}

        {activeTab === "relations" && (
          <RelationsTab
            item={item}
            workspace={workspace}
            items={items ?? []}
            relations={relations ?? []}
            onSelectItem={onSelectItem}
            onSelectEntity={onSelectEntity}
          />
        )}

        {activeTab === "ai" && renderAiTab && renderAiTab()}

        {activeTab === "history" && workspace && (
          <HistoryTab
            workspace={workspace}
            itemId={item.id}
            onRestore={handleRestoreRevision}
          />
        )}

        {activeTab === "similar" && workspace && (
          <SimilarTab
            item={item}
            workspace={workspace}
            onSelectItem={onSelectItem}
          />
        )}

        {activeTab === "raw" && (
          <>
            <Field label="ID">
              <code className="text-[10px] text-muted-foreground break-all select-all">
                {item.id}
              </code>
            </Field>
            {item.context_json != null ? (
              <div>
                <button
                  onClick={() => setRawJsonOpen((v) => !v)}
                  className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition"
                >
                  {rawJsonOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  context_json
                </button>
                {rawJsonOpen && (
                  <pre className="mt-1 p-2 rounded bg-muted text-[9px] text-muted-foreground overflow-x-auto max-h-[60vh] select-text">
                    {JSON.stringify(item.context_json, null, 2)}
                  </pre>
                )}
                {!rawJsonOpen && (
                  <p className="mt-1 text-[10px] text-muted-foreground/70">
                    クリックで JSON を展開
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground">context_json はまだありません。</p>
            )}
          </>
        )}
      </div>

      {/* 内容プレビューポップアップ
         - md / コード / CSV: text content をフェッチ済みで表示
         - xlsx / docx: filePath から URL を渡してコンポーネント内で fetch */}
      {previewOpen && PreviewModalComponent && (officeKind ? filePath : content !== null) && (
        <PreviewModalComponent
          title={item.name}
          subtitle={item.mime_type ?? item.item_type}
          onClose={() => setPreviewOpen(false)}
          size="xl"
        >
          <div className="px-6 py-5">
            {officeKind === "xlsx" && filePath ? (
              renderXlsxPreview ? (
                renderXlsxPreview(convertFileSrc(filePath))
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">Excel プレビュー非対応</p>
              )
            ) : officeKind === "docx" && filePath ? (
              renderDocxPreview ? (
                renderDocxPreview(convertFileSrc(filePath))
              ) : (
                <p className="text-xs text-muted-foreground py-6 text-center">Word プレビュー非対応</p>
              )
            ) : dataFormat && content !== null ? (
              renderCsv ? (
                renderCsv({ text: content, format: dataFormat, filePath: item.file_path, mime: item.mime_type })
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap select-text overflow-x-auto">{content}</pre>
              )
            ) : isMarkdownLike(item) && content !== null ? (
              renderMarkdown ? (
                renderMarkdown(content)
              ) : (
                <pre className="text-xs whitespace-pre-wrap select-text">{content}</pre>
              )
            ) : content !== null ? (
              renderCode ? (
                renderCode({ code: content, filePath: item.file_path, mime: item.mime_type, itemType: item.item_type })
              ) : (
                <pre className="text-xs font-mono whitespace-pre-wrap select-text overflow-x-auto">{content}</pre>
              )
            ) : null}
          </div>
        </PreviewModalComponent>
      )}

      {/* メディアポップアップ (動画 / 画像のフルサイズ表示)
         動画は字幕 / 文字起こしを右に並置。
         HUB-055 Phase 4: segments があればクリックで時刻ジャンプ + 同期ハイライト */}
      {mediaPopupOpen && filePath && PreviewModalComponent && (
        <PreviewModalComponent
          title={item.name}
          subtitle={item.mime_type ?? item.item_type}
          onClose={() => setMediaPopupOpen(false)}
          size="full"
        >
          {item.item_type.toLowerCase() === "video" ? (
            <VideoPopupBody
              filePath={filePath}
              segments={transcriptionSegments}
              subtitleText={subtitleText}
              transcriptionText={transcriptionText}
            />
          ) : isPdfFile ? (
            renderPdfPreview ? (
              renderPdfPreview(filePath)
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground text-[12px]">
                PDF プレビュー非対応
              </div>
            )
          ) : (
            <div className="flex h-full bg-black items-center justify-center p-2">
              {item.item_type.toLowerCase() === "image" ? (
                <img
                  src={convertFileSrc(filePath)}
                  alt={item.name}
                  className="max-h-[80vh] max-w-full object-contain"
                />
              ) : null}
            </div>
          )}
        </PreviewModalComponent>
      )}

      {/* 編集履歴ポップアップ (frontend-only / localStorage) */}
      {historyOpen && workspace && PreviewModalComponent && (
        <PreviewModalComponent
          title="編集履歴"
          subtitle={`${item.name} — このマシンに保存された過去 ${getRevisions(workspace, item.id).length} 件`}
          onClose={() => setHistoryOpen(false)}
          size="lg"
        >
          <RevisionHistoryList
            revisions={getRevisions(workspace, item.id)}
            onRestore={handleRestoreRevision}
          />
        </PreviewModalComponent>
      )}
    </div>
  );
}

/**
 * 動画ポップアップ本体: 動画 + (segments あればクリック可能トランスクリプト / なければ plain text)。
 * segment クリックで `<video>.currentTime` ジャンプ、再生中は current segment を bold ハイライト。
 */
function VideoPopupBody({
  filePath,
  segments,
  subtitleText,
  transcriptionText,
}: {
  filePath: string;
  segments?: { id: number; start: number; end: number; text: string }[];
  subtitleText?: string;
  transcriptionText?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => setCurrentTime(v.currentTime);
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, []);

  // current segment が変わったら自動スクロール
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [Math.floor(currentTime)]);

  const hasSegments = segments && segments.length > 0;
  const fallbackText = subtitleText ?? transcriptionText;
  const showAside = hasSegments || !!fallbackText;

  const jumpTo = (sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = sec;
    void v.play();
  };

  return (
    <div className="flex h-full bg-black">
      <div className="flex-1 flex items-center justify-center p-2">
        <video
          ref={videoRef}
          src={convertFileSrc(filePath)}
          controls
          autoPlay
          className="max-h-[80vh] max-w-full"
        />
      </div>
      {showAside && (
        <aside className="w-96 shrink-0 border-l border-border bg-background overflow-y-auto p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            {hasSegments
              ? "字幕 (クリックでジャンプ)"
              : subtitleText && transcriptionText
                ? "字幕 / 文字起こし"
                : subtitleText
                  ? "字幕"
                  : "文字起こし"}
          </h3>
          {hasSegments ? (
            <div className="space-y-0.5 select-text">
              {segments!.map((seg) => {
                const isActive = currentTime >= seg.start && currentTime < seg.end;
                return (
                  <button
                    key={seg.id}
                    ref={isActive ? activeRef : undefined}
                    onClick={() => jumpTo(seg.start)}
                    className={`w-full text-left px-2 py-1 rounded transition flex gap-2 items-start ${
                      isActive
                        ? "bg-primary/15 text-foreground"
                        : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                    }`}
                  >
                    <span className="shrink-0 text-[10px] tabular-nums text-primary/80 font-mono pt-0.5">
                      {formatTime(seg.start)}
                    </span>
                    <span className={`text-[12px] leading-relaxed ${isActive ? "font-semibold" : ""}`}>
                      {seg.text}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <pre className="whitespace-pre-wrap text-[12px] text-foreground/90 leading-relaxed font-sans select-text">
              {fallbackText}
            </pre>
          )}
        </aside>
      )}
    </div>
  );
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ===== 詳細タブ末尾の追加セクション =====

/**
 * 分析の鮮度: analyzed_at から経過日数を表示。30日以上経過 or 未分析時にヒント表示。
 */
function AnalysisFreshness({ analyzedAt }: { analyzedAt: string | null }) {
  if (!analyzedAt) {
    return (
      <div className="flex items-start gap-1.5 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-[10px] text-amber-100/90">
        <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
        <span>未分析。「AI 分析」を実行すると要約・タグ・モダリティ別メタが付与されます。</span>
      </div>
    );
  }
  const ageMs = Date.now() - new Date(analyzedAt).getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const stale = ageDays >= 30;
  return (
    <div
      className={`flex items-start gap-1.5 rounded border p-2 text-[10px] ${
        stale
          ? "border-amber-500/30 bg-amber-500/5 text-amber-100/90"
          : "border-border/50 bg-muted/20 text-muted-foreground"
      }`}
    >
      <Clock className="w-3 h-3 shrink-0 mt-0.5" />
      <span>
        {ageDays === 0 ? "今日" : `${ageDays}日前`} に分析
        {stale && " — モデルが新しくなっている可能性。再分析推奨"}
      </span>
    </div>
  );
}

/**
 * ファイルパスを home-dir 短縮形 (~/...) で表示。
 * 1 行で長すぎるときはコピー可能な monospace で break-all。
 */
function FilePathDisplay({ path }: { path: string }) {
  // ブラウザ環境では HOME を取れないので "/Users/<who>/" を最低限の正規化対象にする。
  const shortened = path.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
  return (
    <code className="text-[10px] text-muted-foreground break-all font-mono select-all">
      {shortened}
    </code>
  );
}

/**
 * 編集履歴インライン (最新 3 件)。getRevisions は localStorage から同期で読める。
 * 全件はモーダルへ。
 */
function InlineRevisions({
  workspace,
  itemId,
  onOpenAll,
}: {
  workspace: string;
  itemId: string;
  onOpenAll: () => void;
}) {
  const all = getRevisions(workspace, itemId);
  if (all.length === 0) return null;
  const top = all.slice(0, 3);
  return (
    <Accordion title={`編集履歴 (${all.length})`} icon={<History className="w-3 h-3 shrink-0" />}>
      <div className="space-y-1.5">
        {top.map((rev, i) => (
          <div key={`${rev.at}-${i}`} className="rounded border border-border/50 bg-card/30 p-1.5">
            <div className="text-[10px] text-muted-foreground/80 flex items-center gap-1.5">
              <span>{formatDate(rev.at)}</span>
              <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground/80">
                {rev.source === "manual" ? "手動" : rev.source === "ai-analysis" ? "AI" : "—"}
              </span>
            </div>
            {rev.name !== undefined && (
              <div className="text-[10px] text-foreground/80 mt-0.5 truncate">{rev.name}</div>
            )}
            {rev.ai_summary && (
              <div className="text-[9px] text-muted-foreground line-clamp-2 mt-0.5">
                {rev.ai_summary}
              </div>
            )}
          </div>
        ))}
        {all.length > top.length && (
          <button
            onClick={onOpenAll}
            className="text-[10px] text-primary hover:underline"
          >
            全 {all.length} 件を表示 →
          </button>
        )}
      </div>
    </Accordion>
  );
}

/**
 * 詳細タブ末尾のアクションバー: Open in Finder / 再分析 / 同タグ検索 / Pool グラフへ。
 * Open in Finder は plugin-opener の revealItemInDir。
 */
function DetailActions({
  item,
  workspace,
  onJumpToGraph,
  onSearchByTag,
  onAnalyze,
  analyzing,
  toast,
  onRevealInDir: onRevealInDirProp,
}: {
  item: PoolItemFull;
  workspace: string | null;
  onJumpToGraph?: (itemId: string) => void;
  onSearchByTag?: (tag: string) => void;
  onAnalyze: () => void;
  analyzing: boolean;
  toast: ToastApi;
  onRevealInDir?: (id: string, filePath: string) => void;
}) {
  void workspace; // 将来 workspace を活かす拡張（現時点では使わない）
  const handleReveal = async () => {
    if (!item.file_path) return;
    if (!onRevealInDirProp) return;
    try {
      await onRevealInDirProp(item.id, item.file_path);
    } catch (e) {
      toast.show(`Finder で開けませんでした: ${String(e)}`, "error");
    }
  };
  const tagsForSearch = (item.ai_tags ?? []).slice(0, 5);

  return (
    <div className="pt-2 border-t border-border/50 space-y-2">
      <div className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider">
        アクション
      </div>
      <div className="flex flex-wrap gap-1.5">
        {item.file_path && onRevealInDirProp && (
          <button
            onClick={() => void handleReveal()}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border bg-muted/50 text-muted-foreground hover:text-foreground transition"
            title="Finder / Explorer で表示"
          >
            <FolderOpen className="w-3 h-3" />
            Finder で開く
          </button>
        )}
        <button
          onClick={onAnalyze}
          disabled={analyzing}
          className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition disabled:opacity-50"
          title={item.analyzed_at ? "再分析" : "AI 分析"}
        >
          {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {item.analyzed_at ? "再分析" : "AI 分析"}
        </button>
        {onJumpToGraph && (
          <button
            onClick={() => onJumpToGraph(item.id)}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border bg-muted/50 text-muted-foreground hover:text-foreground transition"
            title="Pool グラフでこのアイテムを中心に表示"
          >
            <Network className="w-3 h-3" />
            グラフで見る
          </button>
        )}
      </div>
      {onSearchByTag && tagsForSearch.length > 0 && (
        <div>
          <div className="text-[9px] text-muted-foreground/60 mb-0.5">タグでフィルタ</div>
          <div className="flex flex-wrap gap-1">
            {tagsForSearch.map((tag) => (
              <button
                key={tag}
                onClick={() => onSearchByTag(tag)}
                className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition"
                title={`「${tag}」を含むアイテムを検索`}
              >
                <Search className="w-2.5 h-2.5" />
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ===== Relations タブ =====

/**
 * 選択中アイテムが source または target になっている relations を一覧表示。
 * 相手アイテム名は items リストから解決。クリックで onSelectItem。
 */
function RelationsTab({
  item,
  workspace,
  items,
  relations,
  onSelectItem,
  onSelectEntity,
}: {
  item: PoolItemFull;
  workspace: string | null;
  items: PoolItemSummary[];
  relations: PoolRelation[];
  onSelectItem?: (itemId: string) => void;
  onSelectEntity?: (entityId: string) => void;
}) {
  const [entityState, setEntityState] = useState<{
    library: string | null;
    itemId: string;
    relations: EntityRelation[];
    entities: Entity[];
    loading: boolean;
    error: string | null;
  }>({
    library: null,
    itemId: item.id,
    relations: [],
    entities: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    if (!workspace) {
      setEntityState({
        library: null,
        itemId: item.id,
        relations: [],
        entities: [],
        loading: false,
        error: null,
      });
      return () => {
        cancelled = true;
      };
    }

    setEntityState({
      library: workspace,
      itemId: item.id,
      relations: [],
      entities: [],
      loading: true,
      error: null,
    });

    Promise.all([
      entityGraph(workspace, "item", item.id),
      listEntities(workspace, 500),
    ])
      .then(([entityRelations, entities]) => {
        if (cancelled) return;
        setEntityState({
          library: workspace,
          itemId: item.id,
          relations: entityRelations,
          entities,
          loading: false,
          error: null,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setEntityState({
          library: workspace,
          itemId: item.id,
          relations: [],
          entities: [],
          loading: false,
          error: String(e),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [workspace, item.id]);

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const entityStateMatches =
    entityState.library === workspace && entityState.itemId === item.id;
  const relatedEntityRelations = entityStateMatches ? entityState.relations : [];
  const relatedEntityLoading = entityStateMatches
    ? entityState.loading
    : Boolean(workspace);
  const relatedEntityError = entityStateMatches ? entityState.error : null;
  const entityMap = new Map(
    (entityStateMatches ? entityState.entities : []).map((e) => [e.id, e]),
  );
  // 自分が source = "out"、target = "in"
  const out = relations.filter((r) => r.source_item_id === item.id);
  const incoming = relations.filter((r) => r.target_item_id === item.id);
  const hasItemRelations = out.length > 0 || incoming.length > 0;

  const renderList = (
    title: string,
    list: PoolRelation[],
    direction: "out" | "in",
  ) => {
    if (list.length === 0) return null;
    return (
      <div>
        <div className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5">
          {title} ({list.length})
        </div>
        <div className="space-y-1">
          {list.map((rel) => {
            const otherId = direction === "out" ? rel.target_item_id : rel.source_item_id;
            const other = itemMap.get(otherId);
            return (
              <button
                key={rel.id}
                onClick={() => onSelectItem?.(otherId)}
                disabled={!onSelectItem || !other}
                className="w-full text-left rounded border border-border/50 bg-card/30 hover:bg-card/60 transition p-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-mono">
                    {rel.relation_type}
                  </span>
                  {rel.strength != null && (
                    <span className="text-[9px] text-muted-foreground/70">
                      強度 {rel.strength.toFixed(2)}
                    </span>
                  )}
                  <span className="text-[9px] text-muted-foreground/60 ml-auto">
                    {direction === "out" ? "→" : "←"}
                  </span>
                </div>
                <div className="text-[11px] text-foreground/85 truncate">
                  {other ? other.name : <span className="text-muted-foreground/60 font-mono">{otherId}</span>}
                </div>
                {other && (
                  <div className="text-[9px] text-muted-foreground/70 mt-0.5">
                    {other.item_type}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const formatEntityId = (entityId: string) =>
    entityId.length > 12 ? `${entityId.slice(0, 8)}…${entityId.slice(-4)}` : entityId;

  const renderEntityButton = (entityId: string) => {
    const entity = entityMap.get(entityId);
    return (
      <button
        type="button"
        onClick={() => onSelectEntity?.(entityId)}
        disabled={!onSelectEntity}
        className={`min-w-0 text-left rounded px-1 py-0.5 transition ${
          onSelectEntity ? "hover:bg-accent hover:text-foreground" : "cursor-default"
        }`}
        title={entity?.display_name ?? entityId}
      >
        <div className="text-[11px] text-foreground/85 truncate">
          {entity?.display_name ?? formatEntityId(entityId)}
        </div>
        <div className="text-[9px] text-muted-foreground/70 truncate">
          {entity?.entity_type ?? formatEntityId(entityId)}
        </div>
      </button>
    );
  };

  const renderRelatedEntities = () => {
    return (
      <div>
        <div className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-1.5">
          関連エンティティ
        </div>

        {relatedEntityLoading ? (
          <div className="flex items-center gap-1.5 rounded border border-border/50 bg-card/30 p-2 text-[10px] text-muted-foreground">
            <Loader2 className="w-3 h-3 animate-spin" />
            関連エンティティを読み込み中...
          </div>
        ) : relatedEntityError ? (
          <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-[10px] text-destructive">
            エンティティ取得エラー: {relatedEntityError}
          </div>
        ) : relatedEntityRelations.length === 0 ? (
          <div className="rounded border border-border/50 bg-card/20 p-2 text-[10px] text-muted-foreground">
            関連エンティティはありません
          </div>
        ) : (
          <div className="space-y-1">
            {relatedEntityRelations.map((rel) => (
              <div
                key={rel.id}
                className="rounded border border-border/50 bg-card/30 p-2"
              >
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
                  {renderEntityButton(rel.subject_entity_id)}
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono truncate max-w-[96px]">
                    {rel.predicate}
                  </span>
                  {renderEntityButton(rel.object_entity_id)}
                </div>
                {rel.confidence != null && (
                  <div className="text-[9px] text-muted-foreground/60 mt-1 text-right">
                    信頼度 {rel.confidence.toFixed(2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {hasItemRelations ? (
        <>
          {renderList("派生先 / 参照先", out, "out")}
          {renderList("被参照", incoming, "in")}
        </>
      ) : (
        <div className="rounded border border-border/50 bg-card/20 p-2 text-[10px] text-muted-foreground">
          このアイテムに関連付けられたアイテムリレーションはありません
        </div>
      )}
      {renderRelatedEntities()}
    </div>
  );
}

// ===== History タブ =====

function HistoryTab({
  workspace,
  itemId,
  onRestore,
}: {
  workspace: string;
  itemId: string;
  onRestore: (rev: ItemRevision) => void;
}) {
  const revisions = getRevisions(workspace, itemId);
  if (revisions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-[11px]">
        編集履歴はまだありません
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground/70">
        ⚠ 履歴はこのマシンの localStorage にのみ保存されます
      </p>
      {revisions.map((rev, i) => (
        <div key={`${rev.at}-${i}`} className="rounded border border-border/60 bg-card/40 p-2">
          <div className="flex items-center justify-between mb-1.5">
            <div className="text-[10px] text-muted-foreground/80 flex items-center gap-1.5">
              <span>{formatDate(rev.at)}</span>
              <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground/80">
                {rev.source === "manual" ? "手動編集" : rev.source === "ai-analysis" ? "AI 再分析" : "—"}
              </span>
            </div>
            <button
              onClick={() => onRestore(rev)}
              className="text-[10px] px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition"
            >
              戻す
            </button>
          </div>
          {rev.name !== undefined && (
            <div className="text-[11px] mb-0.5">
              <span className="text-muted-foreground/70">名前: </span>
              <span className="text-foreground/85">{rev.name}</span>
            </div>
          )}
          {rev.ai_summary && (
            <div className="text-[10px] mb-0.5">
              <span className="text-muted-foreground/70">要約: </span>
              <span className="text-foreground/80 whitespace-pre-wrap">{rev.ai_summary}</span>
            </div>
          )}
          {rev.ai_tags && rev.ai_tags.length > 0 && (
            <div className="text-[10px] flex flex-wrap items-center gap-1 mt-0.5">
              <span className="text-muted-foreground/70">タグ: </span>
              {rev.ai_tags.map((t) => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ===== Similar タブ =====

/**
 * item.name + ai_tags をクエリに searchItems を呼んで類似アイテムを表示。
 * activeTab が "similar" になったタイミングで lazy fetch。
 */
function SimilarTab({
  item,
  workspace,
  onSelectItem,
}: {
  item: PoolItemFull;
  workspace: string;
  onSelectItem?: (itemId: string) => void;
}) {
  const [results, setResults] = useState<PoolSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const query = [item.name, ...(item.ai_tags ?? [])].filter(Boolean).join(" ").trim();
    if (!query) {
      setResults([]);
      return;
    }
    setLoading(true);
    setError(null);
    searchItems(query, workspace, 11)
      .then((res) => {
        if (cancelled) return;
        setResults(res.filter((r) => r.item_id !== item.id).slice(0, 10));
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.name, item.ai_tags, workspace]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-[11px]">
        <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
        類似アイテムを検索中...
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded border border-destructive/30 bg-destructive/5 p-2 text-[10px] text-destructive">
        検索エラー: {error}
      </div>
    );
  }
  if (!results || results.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-[11px]">
        類似アイテムは見つかりませんでした
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-muted-foreground/70">
        名前 + タグの類似度で上位 {results.length} 件
      </p>
      {results.map((r) => (
        <button
          key={r.item_id}
          onClick={() => onSelectItem?.(r.item_id)}
          disabled={!onSelectItem}
          className="w-full text-left rounded border border-border/50 bg-card/30 hover:bg-card/60 transition p-2 disabled:opacity-50"
        >
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[9px] px-1 py-0.5 rounded bg-primary/10 text-primary font-mono tabular-nums">
              {r.score.toFixed(2)}
            </span>
            <span className="text-[11px] text-foreground/85 truncate flex-1">{r.name}</span>
          </div>
          {r.ai_summary && (
            <p className="text-[10px] text-muted-foreground/80 line-clamp-2">{r.ai_summary}</p>
          )}
        </button>
      ))}
    </div>
  );
}

function RevisionHistoryList({
  revisions,
  onRestore,
}: {
  revisions: ItemRevision[];
  onRestore: (rev: ItemRevision) => void;
}) {
  if (revisions.length === 0) {
    return (
      <div className="px-6 py-10 text-center text-muted-foreground text-sm">
        履歴がありません
      </div>
    );
  }
  return (
    <div className="px-6 py-5 space-y-3">
      <p className="text-[11px] text-muted-foreground/80">
        ⚠ 履歴はこのマシンの localStorage にのみ保存されます。別マシン / 再インストールでは消えます。
      </p>
      {revisions.map((rev, i) => (
        <div key={`${rev.at}-${i}`} className="rounded border border-border bg-card/30 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] text-muted-foreground">
              {formatDate(rev.at)}
              <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80">
                {rev.source === "manual" ? "手動編集" : rev.source === "ai-analysis" ? "AI 再分析" : "—"}
              </span>
            </div>
            <button
              onClick={() => onRestore(rev)}
              className="text-[10px] px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition"
            >
              この時点に戻す
            </button>
          </div>
          {rev.name !== undefined && (
            <div className="text-[11px] mb-1">
              <span className="text-muted-foreground/70">名前: </span>
              <span className="text-foreground/90">{rev.name}</span>
            </div>
          )}
          {rev.ai_summary && (
            <div className="text-[11px] mb-1">
              <span className="text-muted-foreground/70">要約: </span>
              <span className="text-foreground/90 whitespace-pre-wrap">{rev.ai_summary}</span>
            </div>
          )}
          {rev.ai_tags && rev.ai_tags.length > 0 && (
            <div className="text-[11px] flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground/70">タグ: </span>
              {rev.ai_tags.map((t) => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Markdown としてレンダリングすべきか判定 */
function isMarkdownLike(item: PoolItemFull): boolean {
  if (item.mime_type?.includes("markdown")) return true;
  if (item.file_path?.endsWith(".md") || item.file_path?.endsWith(".mdx")) return true;
  const t = item.item_type.toLowerCase();
  // article は body が markdown であることが多い、note も markdown 想定
  if (t === "article" || t === "note") return true;
  return false;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium text-muted-foreground/70 uppercase tracking-wider mb-0.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
