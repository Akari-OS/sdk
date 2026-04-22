/**
 * PlatformDiffView — マルチプラットフォーム差分表示。
 *
 * 複数 SNS 用にリライトされた結果をタブ切替で表示し、
 * 元テキストとの差分をシンプルな before/after で見せる。
 * OK ボタンで特定プラットフォームのテキストを下書きに採用。
 */

import { useState } from "react";
import { Check } from "lucide-react";

export interface PlatformResult {
  platform: string;
  text: string;
  note?: string;
}

interface PlatformDiffViewProps {
  results: PlatformResult[];
  originalText: string;
  onApply: (text: string) => void;
}

/** 簡易 diff: 変更箇所をハイライトするのではなく before/after を並べる */
export function PlatformDiffView({ results, originalText, onApply }: PlatformDiffViewProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [applied, setApplied] = useState<Set<number>>(new Set());

  const current = results[activeTab];
  if (!current) return null;

  function handleApply(index: number) {
    const r = results[index];
    if (!r) return;
    onApply(r.text);
    setApplied((prev) => new Set(prev).add(index));
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* タブ */}
      <div className="flex border-b border-border bg-card">
        {results.map((r, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`flex-1 text-[10px] px-2 py-1.5 transition font-medium flex items-center justify-center gap-1 ${
              i === activeTab
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {r.platform}
            {applied.has(i) && <Check className="w-3 h-3 text-green-500" />}
          </button>
        ))}
      </div>

      {/* コンテンツ */}
      <div className="p-3 space-y-2">
        {/* 変更メモ */}
        {current.note && (
          <div className="text-[10px] text-muted-foreground italic">
            {current.note}
          </div>
        )}

        {/* Before / After */}
        <div className="grid grid-cols-2 gap-2">
          {/* Before */}
          <div>
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Before</div>
            <div className="text-[11px] leading-relaxed whitespace-pre-wrap p-2 rounded bg-muted/50 border border-border/50 max-h-[150px] overflow-y-auto">
              {originalText || <span className="text-muted-foreground italic">（下書きなし）</span>}
            </div>
          </div>
          {/* After */}
          <div>
            <div className="text-[9px] uppercase tracking-wider text-primary font-semibold mb-1">After</div>
            <div className="text-[11px] leading-relaxed whitespace-pre-wrap p-2 rounded bg-primary/5 border border-primary/20 max-h-[150px] overflow-y-auto">
              {current.text}
            </div>
          </div>
        </div>

        {/* 採用ボタン */}
        <button
          onClick={() => handleApply(activeTab)}
          disabled={applied.has(activeTab)}
          className={`w-full text-[11px] py-1.5 rounded-md border transition font-medium ${
            applied.has(activeTab)
              ? "border-green-500/30 bg-green-500/10 text-green-500"
              : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          {applied.has(activeTab) ? "✓ 採用済み" : `${current.platform} のテキストを下書きに採用`}
        </button>
      </div>
    </div>
  );
}
