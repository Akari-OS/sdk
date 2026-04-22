/**
 * LinkPreviewCard — OGP カード UI
 *
 * URL から取得した OGP 情報をカード形式で表示。
 */

import { X } from "lucide-react";
import type { OgpData } from "../lib/ogp-fetch";

interface LinkPreviewCardProps {
  ogp: OgpData;
  onRemove?: () => void;
}

export function LinkPreviewCard({ ogp, onRemove }: LinkPreviewCardProps) {
  if (!ogp.title && !ogp.description) return null;

  // ドメイン名を抽出
  let domain = "";
  try {
    domain = new URL(ogp.url).hostname.replace(/^www\./, "");
  } catch {
    domain = ogp.site_name || "";
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-2.5 group relative">
      {/* OGP 画像 */}
      {ogp.image && (
        <img
          src={ogp.image}
          alt=""
          loading="lazy"
          className="w-16 h-16 rounded-md object-cover shrink-0"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}

      {/* テキスト情報 */}
      <div className="flex-1 min-w-0">
        {ogp.title && (
          <div className="text-xs font-medium truncate">{ogp.title}</div>
        )}
        {ogp.description && (
          <div className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed mt-0.5">
            {ogp.description}
          </div>
        )}
        <div className="text-[9px] text-muted-foreground/60 mt-1 truncate">
          {domain}
        </div>
      </div>

      {/* 削除ボタン */}
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-muted text-muted-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}
