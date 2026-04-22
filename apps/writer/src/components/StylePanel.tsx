/**
 * StylePanel — スタイル設定パネル（左パネル3番目のタブ）
 *
 * 2層構造: ベーススタイル + プラットフォーム別オーバーライド
 * spec: AKARI-HUB-015 §3.1
 */

import { useState } from "react";
import { Palette } from "lucide-react";
import { getPlatform } from "@/lib/platforms";

import {
  type EmojiUsage,
  type WorkStyleConfig,
  type PlatformStyleOverride,
  TONE_PRESETS,
  createDefaultWorkStyle,
  createWorkStyleFromPreset,
} from "@akari-os/writer-style-core";

export interface StylePanelProps {
  styleConfig: WorkStyleConfig | undefined;
  onStyleConfigChange: (config: WorkStyleConfig) => void;
  activePlatformId: string;
  selectedPlatforms: string[];
}

const EMOJI_OPTIONS: { value: EmojiUsage; label: string }[] = [
  { value: "none", label: "なし" },
  { value: "少なめ", label: "少なめ" },
  { value: "普通", label: "普通" },
  { value: "多め", label: "多め" },
];

export function StylePanel({
  styleConfig,
  onStyleConfigChange,
  activePlatformId,
  selectedPlatforms,
}: StylePanelProps) {
  const config = styleConfig ?? createDefaultWorkStyle();
  const base = config.base;

  // PF別オーバーライドで表示する PF タブ
  const [overrideTab, setOverrideTab] = useState<string>(activePlatformId || selectedPlatforms[0] || "");

  function updateBase(patch: Partial<typeof base>) {
    onStyleConfigChange({ ...config, base: { ...base, ...patch } });
  }

  function updateOverride(pid: string, patch: Partial<PlatformStyleOverride>) {
    const current = config.overrides[pid] ?? {};
    onStyleConfigChange({
      ...config,
      overrides: { ...config.overrides, [pid]: { ...current, ...patch } },
    });
  }

  function toggleOverride(pid: string) {
    if (config.overrides[pid]) {
      // オーバーライド削除
      const next = { ...config.overrides };
      delete next[pid];
      onStyleConfigChange({ ...config, overrides: next });
    } else {
      // オーバーライド有効化（空で開始）
      onStyleConfigChange({
        ...config,
        overrides: { ...config.overrides, [pid]: {} },
      });
    }
  }

  function handlePresetClick(presetId: string) {
    const preset = TONE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const newConfig = createWorkStyleFromPreset(preset);
    // 既存のオーバーライドは保持
    onStyleConfigChange({ ...newConfig, overrides: config.overrides });
  }

  const activeOverride = overrideTab ? config.overrides[overrideTab] : undefined;
  const hasOverride = activeOverride !== undefined;

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* 見出し */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-primary" />
          <h3 className="text-xs font-semibold">スタイル</h3>
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          投稿の口調やトーンを設定。エンハンス時に AI に適用されます。
        </p>
      </div>

      {/* ── ベーススタイル ── */}
      <div className="flex flex-col gap-2">
        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          ベーススタイル
        </div>

        {/* プリセット */}
        <div className="flex flex-wrap gap-1.5">
          {TONE_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handlePresetClick(preset.id)}
              className={`px-2 py-1 rounded-full border text-[10px] transition ${
                base.name === preset.label
                  ? "border-primary/60 bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* ベース編集フォーム */}
        <StyleForm
          tone={base.tone}
          emojiUsage={base.emojiUsage}
          hashtagRule={base.hashtagRule}
          notes={base.notes}
          onToneChange={(v) => updateBase({ tone: v })}
          onEmojiChange={(v) => updateBase({ emojiUsage: v })}
          onHashtagChange={(v) => updateBase({ hashtagRule: v })}
          onNotesChange={(v) => updateBase({ notes: v })}
        />
      </div>

      {/* ── PF別オーバーライド ── */}
      {selectedPlatforms.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            PF別オーバーライド
          </div>
          <p className="text-[9px] text-muted-foreground/70">
            空欄のフィールドはベーススタイルが適用されます
          </p>

          {/* PF タブ */}
          <div className="flex flex-wrap gap-1">
            {selectedPlatforms.map((pid) => {
              const pf = getPlatform(pid);
              const hasOv = !!config.overrides[pid];
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => setOverrideTab(pid)}
                  className={`px-2 py-0.5 rounded text-[10px] border transition ${
                    overrideTab === pid
                      ? "border-violet-400/60 bg-violet-400/10 text-foreground"
                      : hasOv
                        ? "border-violet-400/30 text-muted-foreground hover:bg-muted/30"
                        : "border-border text-muted-foreground hover:bg-muted/30"
                  }`}
                >
                  {pf.icon} {pf.name}
                  {hasOv && <span className="ml-0.5 text-violet-400">*</span>}
                </button>
              );
            })}
          </div>

          {/* オーバーライド編集 */}
          {overrideTab && (
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-1.5 text-[10px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasOverride}
                  onChange={() => toggleOverride(overrideTab)}
                  className="rounded border-border"
                />
                <span className="text-muted-foreground">
                  {getPlatform(overrideTab).name} でオーバーライドする
                </span>
              </label>

              {hasOverride && (
                <>
                  <StyleForm
                    tone={activeOverride?.tone ?? ""}
                    emojiUsage={activeOverride?.emojiUsage ?? undefined}
                    hashtagRule={activeOverride?.hashtagRule ?? ""}
                    notes={activeOverride?.notes ?? ""}
                    placeholderTone={base.tone || "ベースと同じ"}
                    placeholderHashtag={base.hashtagRule || "ベースと同じ"}
                    placeholderNotes={base.notes || "ベースと同じ"}
                    onToneChange={(v) => updateOverride(overrideTab, { tone: v || undefined })}
                    onEmojiChange={(v) => updateOverride(overrideTab, { emojiUsage: v })}
                    onHashtagChange={(v) => updateOverride(overrideTab, { hashtagRule: v || undefined })}
                    onNotesChange={(v) => updateOverride(overrideTab, { notes: v || undefined })}
                  />
                  {/* X 向けスレッド分割数 */}
                  {(overrideTab === "x" || overrideTab === "x_long") && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] text-muted-foreground">スレッド分割数</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={activeOverride?.threadSplitCount ?? 1}
                          onChange={(e) => updateOverride(overrideTab, { threadSplitCount: Number(e.target.value) })}
                          className="flex-1 h-1 accent-primary"
                        />
                        <span className="text-xs text-foreground w-8 text-center">
                          {activeOverride?.threadSplitCount ?? 1}
                        </span>
                      </div>
                      <p className="text-[9px] text-muted-foreground/70">
                        1 = 通常投稿、2以上 = スレッド分割
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 共通スタイルフォーム（ベースとオーバーライドで再利用）
// ---------------------------------------------------------------------------

interface StyleFormProps {
  tone: string;
  emojiUsage?: EmojiUsage;
  hashtagRule: string;
  notes: string;
  placeholderTone?: string;
  placeholderHashtag?: string;
  placeholderNotes?: string;
  onToneChange: (v: string) => void;
  onEmojiChange: (v: EmojiUsage) => void;
  onHashtagChange: (v: string) => void;
  onNotesChange: (v: string) => void;
}

function StyleForm({
  tone,
  emojiUsage,
  hashtagRule,
  notes,
  placeholderTone = "例: フランクな話し言葉",
  placeholderHashtag = "例: 3個以内、日本語中心",
  placeholderNotes = "例: 数字を使って具体性を出す",
  onToneChange,
  onEmojiChange,
  onHashtagChange,
  onNotesChange,
}: StyleFormProps) {
  return (
    <div className="flex flex-col gap-2">
      {/* 口調 */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground">口調</label>
        <input
          type="text"
          value={tone}
          onChange={(e) => onToneChange(e.target.value)}
          placeholder={placeholderTone}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      {/* 絵文字 */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground">絵文字</label>
        <div className="flex gap-1">
          {EMOJI_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onEmojiChange(opt.value)}
              className={`px-2 py-0.5 rounded text-[10px] border transition ${
                emojiUsage === opt.value
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/30"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ハッシュタグ */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground">ハッシュタグルール</label>
        <input
          type="text"
          value={hashtagRule}
          onChange={(e) => onHashtagChange(e.target.value)}
          placeholder={placeholderHashtag}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>

      {/* 補足メモ */}
      <div className="flex flex-col gap-1">
        <label className="text-[10px] text-muted-foreground">補足メモ</label>
        <textarea
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={2}
          placeholder={placeholderNotes}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
      </div>
    </div>
  );
}
