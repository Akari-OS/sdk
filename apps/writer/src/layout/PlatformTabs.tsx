/**
 * PlatformTabs — エディタ上部のプラットフォーム切替タブバー。
 *
 * HUB-012: デフォルト全表示ではなく、selectedPlatforms のみ表示。
 * 左パネルの SNS タブからクリックで追加する方式。
 */

import { useState } from "react";
import { FileText } from "lucide-react";
import { getPlatform, SOURCE_PLATFORM_ID } from "@/lib/platforms";
import { PlatformIcon } from "@/components/icons/SnsIcons";

interface PlatformTabsProps {
  active: string;
  onChange: (id: string) => void;
  /** 選択された投稿先プラットフォーム */
  selectedPlatforms: string[];
  /** プラットフォーム削除 */
  onRemove?: (id: string) => void;
  /** ドラッグ&ドロップでプラットフォーム追加 */
  onDrop?: (platformId: string) => void;
  charCounts?: Record<string, number>;
}

export function PlatformTabs({ active, onChange, selectedPlatforms, onRemove, onDrop, charCounts }: PlatformTabsProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    // relatedTarget が子要素の場合は無視
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const platformId = e.dataTransfer.getData("platform-id");
    if (platformId && onDrop) {
      onDrop(platformId);
    }
  }

  const isSourceActive = active === SOURCE_PLATFORM_ID;

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex items-center gap-1 px-3 py-1.5 border-b overflow-x-auto shrink-0 transition-colors ${
        isDragOver
          ? "border-primary bg-primary/5"
          : "border-border"
      }`}
    >
      {/* 原稿タブ（常時表示・削除不可） */}
      <div
        onClick={() => onChange(SOURCE_PLATFORM_ID)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition whitespace-nowrap cursor-pointer ${
          isSourceActive
            ? "bg-primary/15 text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
        }`}
      >
        <FileText className="w-3.5 h-3.5" />
        <span>原稿</span>
      </div>

      {selectedPlatforms.length === 0 && (
        <span className="text-[11px] text-muted-foreground/60 pl-2">
          {isDragOver ? "ここにドロップして追加" : "← SNS タブから投稿先を追加"}
        </span>
      )}

      {selectedPlatforms.map((pid) => {
        const p = getPlatform(pid);
        const isActive = pid === active;
        const count = charCounts?.[pid] ?? 0;
        const isOverLimit = p.maxChars !== null && count > p.maxChars;

        return (
          <div
            key={pid}
            onClick={() => onChange(pid)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition whitespace-nowrap cursor-pointer group ${
              isActive
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
          >
            <PlatformIcon platformId={pid} size={14} />
            <span>{p.name}</span>
            {isActive && p.maxChars !== null && (
              <span className={`text-[9px] font-mono ${isOverLimit ? "text-destructive" : "text-muted-foreground/60"}`}>
                {count}/{p.maxChars}
              </span>
            )}
            {/* × ボタン（アクティブタブのみ表示） */}
            {onRemove && isActive && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(pid); }}
                className="w-4 h-4 flex items-center justify-center rounded-sm text-[11px] text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition ml-1"
                title="この投稿先を削除"
              >
                ×
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
