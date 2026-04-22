/**
 * TimingSuggestions — 投稿タイミング提案 UI
 *
 * spec: AKARI-HUB-014 §6
 */

import { Clock } from "lucide-react";
import { suggestTimings, formatSuggestionTime } from "../lib/timing-suggest";

export function TimingSuggestions() {
  const suggestions = suggestTimings(3);

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          おすすめ投稿時間
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {suggestions.map((s, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5"
          >
            <div className="flex flex-col min-w-0">
              <span className="text-xs font-medium">{formatSuggestionTime(s.suggestedAt)}</span>
              <span className="text-[10px] text-muted-foreground truncate">{s.reason}</span>
            </div>
            <div className="shrink-0 ml-2">
              <div
                className="h-1 rounded-full bg-primary/60"
                style={{ width: `${Math.round(s.confidence * 40)}px` }}
                title={`信頼度: ${Math.round(s.confidence * 100)}%`}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
