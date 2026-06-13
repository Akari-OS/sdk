import { useEffect, useRef, useState } from "react";
import { ArrowDownAZ, ArrowUpAZ, ChevronDown, ListFilter, Search } from "lucide-react";

export interface SourceToolbarCategory {
  id: string;
  label: string;
}

export type SourceToolbarSort = "asc" | "desc" | null;

export interface SourceToolbarProps {
  query: string;
  onQueryChange: (q: string) => void;
  sort?: SourceToolbarSort;
  onSortChange?: (s: SourceToolbarSort) => void;
  sortLabel?: string;
  categories?: SourceToolbarCategory[];
  activeCategory?: string | null;
  onCategoryChange?: (id: string | null) => void;
  placeholder?: string;
  resultCount?: number;
}

function nextSortValue(sort: SourceToolbarSort): SourceToolbarSort {
  if (sort === null) return "asc";
  if (sort === "asc") return "desc";
  return null;
}

export function SourceToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
  sortLabel = "並び替え",
  categories,
  activeCategory,
  onCategoryChange,
  placeholder = "検索",
  resultCount,
}: SourceToolbarProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const showSort = sort !== undefined;
  const showCategories = categories !== undefined;
  const selectedCategory = categories?.find((category) => category.id === activeCategory) ?? null;

  useEffect(() => {
    if (!popoverOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (popoverRef.current?.contains(e.target as Node | null)) return;
      setPopoverOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPopoverOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [popoverOpen]);

  function handleSortClick() {
    if (sort === undefined) return;
    onSortChange?.(nextSortValue(sort));
  }

  function handleCategoryChange(id: string | null) {
    onCategoryChange?.(id);
    setPopoverOpen(false);
  }

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-1.5 text-xs">
      <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded border border-border bg-muted/40 px-2 py-1 text-muted-foreground transition focus-within:border-primary/70 focus-within:text-foreground">
        <Search className="h-3.5 w-3.5 shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={placeholder}
          className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/60 outline-none"
        />
      </label>

      {showSort && (
        <button
          type="button"
          onClick={handleSortClick}
          disabled={!onSortChange}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-border bg-muted/30 px-1.5 text-[10px] text-muted-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          title={`${sortLabel}: ${
            sort === "asc" ? "昇順" : sort === "desc" ? "降順" : "デフォルト順"
          }`}
          aria-label={`${sortLabel}を切り替え`}
        >
          {sort === "desc" ? (
            <ArrowDownAZ className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ArrowUpAZ className={`h-3.5 w-3.5 shrink-0 ${sort === null ? "opacity-35" : ""}`} />
          )}
          <span className="hidden max-w-[5rem] truncate sm:inline">{sortLabel}</span>
        </button>
      )}

      {showCategories && (
        <div ref={popoverRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setPopoverOpen((open) => !open)}
            className={`inline-flex h-7 max-w-[9rem] items-center gap-1 rounded border px-1.5 text-[10px] transition ${
              popoverOpen || activeCategory
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-muted/30 text-muted-foreground hover:border-primary hover:text-primary"
            }`}
            title="カテゴリ"
            aria-expanded={popoverOpen}
          >
            <ListFilter className="h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 truncate">{selectedCategory?.label ?? "すべて"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
          </button>

          {popoverOpen && (
            <div className="absolute right-0 top-[calc(100%+4px)] z-[260] w-[min(220px,78vw)] rounded-md border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
              <button
                type="button"
                onClick={() => handleCategoryChange(null)}
                disabled={!onCategoryChange}
                className={`flex w-full items-center rounded px-2 py-1 text-left text-[11px] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  !activeCategory
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                すべて
              </button>
              {categories.map((category) => {
                const selected = category.id === activeCategory;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => handleCategoryChange(category.id)}
                    disabled={!onCategoryChange}
                    className={`mt-0.5 flex w-full items-center rounded px-2 py-1 text-left text-[11px] transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span className="min-w-0 truncate">{category.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {typeof resultCount === "number" && (
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {resultCount} 件
        </span>
      )}
    </div>
  );
}
