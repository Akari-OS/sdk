/**
 * @file LibraryBrowser.tsx
 * AKARI-HUB-079 Phase 1 T2.2 — Library Marketplace ブラウザ component。
 *
 * 役割:
 *   - 左: type filter chips (All / asset_content / app / poolpack / methodology_pack)
 *         + listing grid (3-4 col responsive)
 *   - 右: 選択した listing の詳細パネル + 「Install to Work」ボタン
 *   - install 完了後: onInstalled callback を呼ぶ（toast / Pool 開くは外側に委譲）
 *
 * 設計指針:
 *   - 全操作が 1 画面で完結（モーダル / 画面遷移禁止 — RULES.md ルール 9 / 11）
 *   - filter UI は inline chips（dropdown / popover 不使用）
 *   - Tailwind dark theme を既存 component (StylePanel / WorkflowEditor) と統一
 *   - preview_assets が空の場合は format_id ベースの汎用 icon を大きく表示
 *
 * 関連 spec / ADR:
 *   - spec: docs/sdd/specs/spec-library-in-shell-consumer.md (HUB-079 §4.4)
 *   - types: ./types/listing.ts
 *   - hooks: ./use-library.ts
 */

import * as React from "react";
import { useState, useCallback } from "react";
import { Loader2, Download } from "lucide-react";
import { cn } from "./lib/cn";
import { useLibrary, useLibraryInstall } from "./use-library";
import type {
  LibraryBrowserBackend,
  LibraryInstallResult,
  LibraryListing,
  LibraryListingType,
} from "./types/listing";

// ─── 定数 ──────────────────────────────────────────────────────────────────

/** type filter chips の表示順 */
const TYPE_FILTER_ORDER: readonly (LibraryListingType | "all")[] = [
  "all",
  "asset_content",
  "app",
  "poolpack",
  "methodology_pack",
] as const;

/** UI ラベル（日本語） */
const TYPE_LABEL: Record<LibraryListingType | "all", string> = {
  all: "All",
  asset_content: "素材",
  app: "App",
  poolpack: "Pool Pack",
  methodology_pack: "手法",
};

/** type 別の badge 色（StylePanel の domain badge と同じ流儀） */
const TYPE_COLORS: Record<LibraryListingType, string> = {
  asset_content: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  app: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  poolpack: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  methodology_pack: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

/**
 * format_id ベースの汎用 icon（preview_assets が空のとき表示）。
 * emoji を使い、外部リソースへの依存なし。
 */
function formatIcon(formatId: string): string {
  if (formatId.startsWith("common.image")) return "🎨";
  if (formatId.startsWith("design.font")) return "🔤";
  if (formatId.startsWith("video.effect")) return "✨";
  if (formatId.startsWith("writer.prompt-template")) return "📝";
  if (formatId.startsWith("app.")) return "📦";
  if (formatId.startsWith("poolpack.")) return "🗂";
  if (formatId.startsWith("methodology_pack.")) return "📚";
  return "📄";
}

/** bytes → 人間可読 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** ISO 8601 → 日付文字列（YYYY-MM-DD） */
function formatDate(iso: string): string {
  try {
    return iso.slice(0, 10);
  } catch {
    return iso;
  }
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface LibraryBrowserProps {
  backend: LibraryBrowserBackend;
  /** install 完了後に呼ばれる（toast 表示 / Pool 側更新 / 「Pool で開く」等は外側に委譲） */
  onInstalled?: (result: LibraryInstallResult) => void;
  className?: string;
}

// ─── 内部 component ────────────────────────────────────────────────────────

/** type filter chips バー */
function TypeFilterBar({
  active,
  onChange,
  counts,
}: {
  active: LibraryListingType | "all";
  onChange: (t: LibraryListingType | "all") => void;
  counts: Record<LibraryListingType | "all", number>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Library type filter"
      className="flex flex-wrap gap-1.5 shrink-0"
    >
      {TYPE_FILTER_ORDER.map((t) => {
        const isActive = t === active;
        const color =
          t === "all"
            ? "border-border bg-muted/40 text-foreground/80"
            : TYPE_COLORS[t];
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition active:scale-95",
              color,
              isActive
                ? "ring-1 ring-primary/60 bg-opacity-100"
                : "opacity-60 hover:opacity-100",
            )}
          >
            <span>{TYPE_LABEL[t]}</span>
            <span
              className="rounded-full bg-background/40 px-1 text-[9px] tabular-nums leading-none"
              aria-hidden="true"
            >
              {counts[t]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** type badge（listing card + 詳細パネルで再利用） */
function TypeBadge({ type }: { type: LibraryListingType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-medium leading-none whitespace-nowrap select-none",
        TYPE_COLORS[type],
      )}
    >
      {TYPE_LABEL[type]}
    </span>
  );
}

/** listing grid card */
function ListingCard({
  listing,
  isSelected,
  onClick,
}: {
  listing: LibraryListing;
  isSelected: boolean;
  onClick: () => void;
}) {
  const icon = formatIcon(listing.format_id);

  return (
    <div
      role="option"
      aria-selected={isSelected}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={0}
      className={cn(
        "group flex flex-col gap-1.5 rounded-lg border p-2.5 cursor-pointer transition focus:outline-none focus:ring-1 focus:ring-ring",
        isSelected
          ? "border-primary/60 bg-primary/10"
          : "border-border bg-card/30 hover:bg-accent/40",
      )}
      title={listing.title}
    >
      {/* preview area */}
      <div className="flex items-center justify-center rounded bg-muted/40 aspect-square text-3xl select-none">
        {icon}
      </div>

      {/* title */}
      <p className="truncate text-[11px] font-medium text-foreground leading-snug">
        {listing.title}
      </p>

      {/* metadata badges */}
      <div className="flex flex-wrap items-center gap-1">
        <TypeBadge type={listing.type} />
        <code className="rounded bg-muted/50 px-1 text-[8px] font-mono text-foreground/60 leading-none">
          {listing.format_id}
        </code>
      </div>

      {/* size + DL count */}
      <div className="flex items-center gap-2 text-[9px] text-muted-foreground">
        <span>{formatBytes(listing.bundle_size_bytes)}</span>
        <span>·</span>
        <span className="flex items-center gap-0.5">
          <Download className="w-2.5 h-2.5" />
          {listing.download_count.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

/** 右側の詳細パネル */
function DetailPanel({
  listing,
  installing,
  installError,
  onInstall,
}: {
  listing: LibraryListing | null;
  installing: boolean;
  installError: string | null;
  onInstall: (listing: LibraryListing) => void;
}) {
  if (!listing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground text-[11px] p-6 text-center">
        <span className="text-4xl">📦</span>
        <p>左の一覧から Listing を選択してください</p>
      </div>
    );
  }

  const icon = formatIcon(listing.format_id);

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto p-4">
      {/* header */}
      <div className="flex items-start gap-3">
        <div className="text-4xl select-none shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold text-foreground leading-snug break-all">
            {listing.title}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <TypeBadge type={listing.type} />
            <code className="rounded bg-muted/50 px-1.5 py-0.5 text-[9px] font-mono text-foreground/60 leading-none">
              {listing.format_id}@{listing.format_version}
            </code>
          </div>
        </div>
      </div>

      {/* description */}
      <p className="text-[11px] text-foreground/80 leading-relaxed whitespace-pre-wrap">
        {listing.description || "説明なし"}
      </p>

      {/* metadata table */}
      <div className="rounded-md border border-border overflow-hidden text-[10px]">
        <table className="w-full">
          <tbody>
            {[
              ["カテゴリ", listing.category],
              ["format_id", listing.format_id],
              ["format_version", listing.format_version],
              ["サイズ", formatBytes(listing.bundle_size_bytes)],
              ["DL 数", listing.download_count.toLocaleString()],
              ["公開日", formatDate(listing.published_at)],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-border last:border-0">
                <td className="py-1.5 px-2.5 font-medium text-muted-foreground bg-muted/20 w-[90px] shrink-0">
                  {label}
                </td>
                <td className="py-1.5 px-2.5 text-foreground/90 font-mono break-all">
                  {value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* tags */}
      {listing.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {listing.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[9px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* install error */}
      {installError && (
        <p
          role="alert"
          className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[10px] text-rose-300"
        >
          {installError}
        </p>
      )}

      {/* install button (sticky bottom) */}
      <div className="mt-auto pt-2">
        <button
          type="button"
          disabled={installing}
          onClick={() => onInstall(listing)}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-[12px] font-medium transition",
            installing
              ? "bg-primary/40 text-primary-foreground/60 cursor-not-allowed"
              : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]",
          )}
        >
          {installing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Install 中...</span>
            </>
          ) : (
            <>
              <Download className="w-3.5 h-3.5" />
              <span>使う / Install to Work</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── LibraryBrowser (main) ──────────────────────────────────────────────────

/**
 * Library Marketplace ブラウザ（AKARI-HUB-079 §4.4）。
 *
 * 2 column layout:
 *   - 左: type filter chips + listing grid
 *   - 右: 詳細パネル + Install ボタン
 *
 * インストール後の toast / Pool 側更新 / 「Pool で開く」は onInstalled で外側に委譲。
 */
export function LibraryBrowser({
  backend,
  onInstalled,
  className,
}: LibraryBrowserProps): React.ReactElement {
  const [typeFilter, setTypeFilter] = useState<LibraryListingType | "all">(
    "all",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { listings, loading, error } = useLibrary(backend, {
    type: typeFilter === "all" ? undefined : typeFilter,
    limit: 50,
  });

  const { install, installing, error: installError } = useLibraryInstall(backend);

  // type filter counts
  const counts = React.useMemo(() => {
    const acc: Record<LibraryListingType | "all", number> = {
      all: listings.length,
      asset_content: 0,
      app: 0,
      poolpack: 0,
      methodology_pack: 0,
    };
    for (const l of listings) acc[l.type] += 1;
    return acc;
  }, [listings]);

  const selectedListing = React.useMemo(
    () => listings.find((l) => l.id === selectedId) ?? null,
    [listings, selectedId],
  );

  const handleInstall = useCallback(
    async (listing: LibraryListing) => {
      try {
        const result = await install(listing);
        onInstalled?.(result);
      } catch {
        // error は useLibraryInstall が管理
      }
    },
    [install, onInstalled],
  );

  return (
    <div
      className={cn(
        "flex h-full gap-0 bg-neutral-900 text-neutral-200",
        className,
      )}
      data-component="LibraryBrowser"
    >
      {/* 左: filter + grid */}
      <div className="flex flex-col gap-3 w-[55%] min-w-0 border-r border-neutral-800 p-3 overflow-hidden">
        <TypeFilterBar
          active={typeFilter}
          onChange={setTypeFilter}
          counts={counts}
        />

        {/* loading / error / grid */}
        {loading && listings.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <p
            role="alert"
            className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[10px] text-rose-300"
          >
            {error}
          </p>
        ) : listings.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground">
            {typeFilter === "all"
              ? "Listing がまだありません"
              : `${TYPE_LABEL[typeFilter]} の Listing はまだありません`}
          </p>
        ) : (
          <div
            role="listbox"
            aria-label="Library listings"
            className="grid grid-cols-3 gap-2 overflow-y-auto flex-1"
          >
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                isSelected={listing.id === selectedId}
                onClick={() =>
                  setSelectedId((prev) =>
                    prev === listing.id ? null : listing.id,
                  )
                }
              />
            ))}
          </div>
        )}

        {/* loading overlay (refetch) */}
        {loading && listings.length > 0 && (
          <div className="flex items-center justify-center py-1 shrink-0">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* 右: 詳細パネル */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <DetailPanel
          listing={selectedListing}
          installing={installing}
          installError={installError}
          onInstall={handleInstall}
        />
      </div>
    </div>
  );
}
