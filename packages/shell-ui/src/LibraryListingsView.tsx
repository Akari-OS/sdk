/**
 * LibraryListingsView — AKARI Library の listing を browse する共通 sub-tab content (HUB-079)
 *
 * 用途:
 *   - akari-video / akari-design / akari-writer など複数 app から共通利用される
 *   - Pool を browse する MaterialPanel と並べて配置する想定 (sub-tab content)
 *   - formatId props で filter (例: "common.image.v1" / "video.audio-source.v1")
 *   - card click → bundle download (Rust 側で R2 CORS 回避) → onPickListing callback
 *
 * cloud auth:
 *   - cloud_get_valid_access_token Tauri コマンド経由 (akari-shell が register 済)
 *   - 本 component は akari-shell webview 上で動作する前提
 *
 * 関連:
 *   - spec: akari-os/docs/sdd/specs/spec-library-in-shell-consumer.md (HUB-079)
 *   - cloud API: akari-cloud /api/library/listings (Phase 1 T1.2)
 *   - Tauri command: cloud_library_download_to_cache (Phase 2 / library_install.rs)
 *
 * 変更履歴:
 *   - HUB-079 session 92: akari-video LibrarySourcePanel.tsx として実装 (top-level tab)
 *   - HUB-079 design re-pivot (session 94): akari-video LibraryListingsView.tsx に rename
 *     (sub-tab 化、 formatId props で多 panel 共有)
 *   - HUB-079 Phase 2 (session 95): card click → cloud_library_download_to_cache → onPickListing
 *   - HUB-079 Phase A 移植 (session 95): akari-sdk shell-ui に上げて DRY 化
 *     akari-design / akari-writer も同 component を共有
 */

import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Image as ImageIcon, AlertCircle, Loader2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import type { LibraryListing } from "./types/listing";

export type { LibraryListing } from "./types/listing";

export interface LibraryListingsViewProps {
  /**
   * フィルター対象の format_id。
   * 例: "common.image.v1" (image picker) / "video.audio-source.v1" (audio picker)
   */
  formatId: string;
  /** 将来の Pool install 経路 (将来) で使う想定で受け取る */
  workId?: string;
  /**
   * card click 時に呼ばれる callback (HUB-079 Phase 2)。
   * 引数は Rust 側 cloud_library_download_to_cache が返す local_path (絶対 path) と
   * listing メタデータ。 parent panel は file picker の戻り値と同じく ingest できる。
   * 未指定の場合は card は disabled 表示 (旧 super-mini 互換)。
   */
  onPickListing?: (
    localPath: string,
    listing: LibraryListing,
  ) => void | Promise<void>;
  /**
   * card pointerdown 時に呼ばれる callback (HUB-079 session 96 F3)。
   * 親 (例: akari-video PoolSourcePanel) が D&D 開始処理を wire するために使う。
   * shell-ui 側は app 固有 drag store を直接持たないため、 pointer event を
   * delegate する形で結合点を提供する。
   *
   * 注意: onClick は本 callback とは独立して fire するので、 click + drag の
   * 組み合わせは parent 側で意図的に許容 / 排他制御する。
   */
  onCardPointerDown?: (
    e: ReactPointerEvent<HTMLButtonElement>,
    listing: LibraryListing,
  ) => void;
  searchQuery?: string;
  sortField?: "published_at" | "download_count" | null;
  sortDir?: "asc" | "desc";
  categoryFilter?: string | null;
}

interface DownloadedBundle {
  local_path: string;
  filename: string;
  listing: LibraryListing;
}

const CLOUD_BASE_URL = "https://cloud.akari-oss.app";

const FORMAT_ICONS: Record<string, string> = {
  "common.image.v1": "🎨",
  "design.font.v1": "🔤",
  "design.template.v1": "🖼️",
  "video.effect.v1": "✨",
  "video.transition.v1": "↔️",
  "video.sticker.v1": "🌟",
  "video.text-style.v1": "📝",
  "video.audio-source.v1": "🎵",
  "writer.prompt-template.v1": "💭",
  "writer.style-guide.v1": "📖",
};

function emptyMessage(formatId: string): string {
  if (formatId.startsWith("video.audio-source"))
    return "公開中の音源はまだありません";
  return "公開中のアイテムはまだありません";
}

async function getCloudAccessToken(): Promise<string | null> {
  try {
    const token = await invoke<string>("cloud_get_valid_access_token");
    return token;
  } catch (err) {
    console.warn("[LibraryListingsView] cloud token 取得失敗:", err);
    return null;
  }
}

const containerStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: "8px 4px",
} as const;

const hintStyle = {
  fontSize: 11,
  color: "#888",
  margin: 0,
} as const;

export function LibraryListingsView({
  formatId,
  workId: _workId,
  onPickListing,
  onCardPointerDown,
  searchQuery = "",
  sortField = null,
  sortDir = "desc",
  categoryFilter = null,
}: LibraryListingsViewProps) {
  const [listings, setListings] = useState<LibraryListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setListings([]);
      try {
        const token = await getCloudAccessToken();
        if (!token) {
          throw new Error(
            "cloud auth が未完了です。 akari-shell でログインしてください",
          );
        }
        const params = new URLSearchParams({
          type: "asset_content",
          format_id: formatId,
          limit: "50",
        });
        const res = await fetch(
          `${CLOUD_BASE_URL}/api/library/listings?${params}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Library fetch 失敗: ${res.status} ${body}`);
        }
        const json = (await res.json()) as { listings?: LibraryListing[] };
        if (!cancelled) setListings(json.listings ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [formatId]);

  const displayListings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const category = categoryFilter?.trim() || null;
    let items = listings;

    if (category) {
      items = items.filter((listing) => listing.category === category);
    }

    if (q) {
      items = items.filter((listing) =>
        [
          listing.title,
          listing.description,
          listing.category,
          listing.format_id,
          ...listing.tags,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    if (sortField) {
      const direction = sortDir === "asc" ? 1 : -1;
      items = [...items].sort((a, b) => {
        if (sortField === "published_at") {
          const aTime = Date.parse(a.published_at);
          const bTime = Date.parse(b.published_at);
          const aValue = Number.isNaN(aTime) ? 0 : aTime;
          const bValue = Number.isNaN(bTime) ? 0 : bTime;
          return (aValue - bValue) * direction;
        }
        return (a.download_count - b.download_count) * direction;
      });
    }

    return items;
  }, [categoryFilter, listings, searchQuery, sortDir, sortField]);

  async function handlePick(listing: LibraryListing) {
    if (!onPickListing) return;
    if (pickingId) return;
    setPickingId(listing.id);
    setPickError(null);
    try {
      const r = await invoke<DownloadedBundle>(
        "cloud_library_download_to_cache",
        { listingId: listing.id },
      );
      await onPickListing(r.local_path, listing);
    } catch (err) {
      setPickError(err instanceof Error ? err.message : String(err));
    } finally {
      setPickingId(null);
    }
  }

  if (loading) {
    return (
      <div style={containerStyle}>
        <Loader2 className="animate-spin" size={20} />
        <p style={hintStyle}>Library 読み込み中…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <AlertCircle size={20} color="#eab308" />
        <p style={{ ...hintStyle, color: "#eab308" }}>{error}</p>
      </div>
    );
  }

  if (displayListings.length === 0) {
    return (
      <div style={containerStyle}>
        <ImageIcon size={20} color="#888" />
        <p style={hintStyle}>
          {listings.length === 0 ? emptyMessage(formatId) : "条件に一致するアイテムはありません"}
        </p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <p style={hintStyle}>AKARI Library ({displayListings.length} 件)</p>
      {pickError && (
        <p
          role="alert"
          style={{ fontSize: 11, margin: "4px 0", color: "#f87171" }}
        >
          {pickError}
        </p>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
          gap: 8,
        }}
      >
        {displayListings.map((listing) => {
          const interactive = Boolean(onPickListing);
          const isPicking = pickingId === listing.id;
          const isOtherPicking = pickingId !== null && pickingId !== listing.id;
          return (
            <button
              key={listing.id}
              type="button"
              onClick={() => void handlePick(listing)}
              onPointerDown={(e) => onCardPointerDown?.(e, listing)}
              disabled={!interactive || isPicking || isOtherPicking}
              title={
                interactive
                  ? `${listing.title} — クリックで取り込み / ドラッグで Timeline`
                  : listing.title
              }
              style={{
                all: "unset",
                display: "block",
                padding: 8,
                background: isPicking ? "#0f1f0f" : "#1a1a1a",
                border: `1px solid ${isPicking ? "#22c55e" : "#2a2a2a"}`,
                borderRadius: 6,
                cursor: interactive
                  ? isOtherPicking
                    ? "wait"
                    : "pointer"
                  : "default",
                opacity: isOtherPicking ? 0.5 : 1,
                textAlign: "center",
              }}
            >
              <div
                style={{
                  width: "100%",
                  aspectRatio: "1 / 1",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#0e0e0e",
                  borderRadius: 4,
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                {isPicking ? (
                  <Loader2 className="animate-spin" size={28} />
                ) : listing.preview_url ? (
                  <img
                    src={listing.preview_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    style={{
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
                      display: "block",
                    }}
                    onError={(e) => {
                      // signed URL 失効 / 画像欠落時は icon fallback に倒す
                      const img = e.currentTarget;
                      img.style.display = "none";
                      const sibling = img.nextElementSibling as HTMLElement | null;
                      if (sibling) sibling.style.display = "block";
                    }}
                  />
                ) : null}
                {/* fallback icon (preview_url 失敗時 onError で表示) */}
                <span
                  style={{
                    fontSize: 32,
                    display: listing.preview_url ? "none" : "block",
                  }}
                >
                  {FORMAT_ICONS[listing.format_id] ?? "📦"}
                </span>
              </div>
              <p
                style={{
                  fontSize: 11,
                  color: "#ddd",
                  margin: "4px 0 0 0",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {listing.title}
              </p>
              <p style={{ fontSize: 10, color: "#888", margin: "2px 0 0 0" }}>
                {(listing.bundle_size_bytes / 1024).toFixed(0)} KB
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
