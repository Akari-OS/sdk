/**
 * PoolPickerPopup — ChatPanel の入力欄から Pool 素材を追加するポップアップ
 *
 * ターゲットボタン（ポインターモード）と同列のボタンから起動。
 * ワークスペース選択 + 検索 + アイテムクリックで PresetContext を生成し、
 * ChatPanel のコンテキストカードに追加する。
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Check, Loader2, Database } from "lucide-react";
import {
  listWorkspaces,
  listItems,
  searchItems,
  readItemContent,
  getItem,
  type LibraryInfo,
  type PoolItemSummary,
  type PoolSearchResult,
} from "@akari-os/sdk/pool";
import { createPresetContext, type PresetContext } from "@akari-os/sdk/chat-context";

interface PoolPickerPopupProps {
  anchorRect: DOMRect;
  onClose: () => void;
  onAddContext: (ctx: PresetContext) => void;
  /** 既に追加済みの Pool アイテム名セット（重複表示用） */
  addedNames?: Set<string>;
  /** トグルボタンの ref — 外側クリック判定から除外する */
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function PoolPickerPopup({
  anchorRect,
  onClose,
  onAddContext,
  addedNames,
  triggerRef,
}: PoolPickerPopupProps): React.ReactElement {
  const popupRef = useRef<HTMLDivElement>(null);

  // --- State ---
  const [workspaces, setWorkspaces] = useState<LibraryInfo[]>([]);
  const [selectedWs, setSelectedWs] = useState<string | null>(null);
  const [items, setItems] = useState<PoolItemSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PoolSearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [localAdded, setLocalAdded] = useState<Set<string>>(new Set());

  // --- ポップアップ位置（ボタンの上方向に展開） ---
  const [pos, setPos] = useState<{ bottom: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const bottom = window.innerHeight - anchorRect.top + 4;
    const left = Math.max(8, anchorRect.left - 200);
    setPos({ bottom, left });
  }, [anchorRect]);

  // --- 外側クリック / Esc で閉じる ---
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      const insidePopup = popupRef.current?.contains(target) ?? false;
      const insideTrigger = triggerRef?.current?.contains(target) ?? false;
      if (!insidePopup && !insideTrigger) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  // --- ワークスペース一覧を初回ロード ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ws = await listWorkspaces();
        if (cancelled) return;
        setWorkspaces(ws);
        // アイテムがあるワークスペースを優先選択
        const withItems = ws.find((w) => w.item_count > 0);
        if (withItems) setSelectedWs(withItems.name);
        else if (ws.length > 0) setSelectedWs(ws[0].name);
      } catch {
        // Pool 未セットアップの場合は空
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // --- ワークスペース変更時にアイテム一覧を取得 ---
  useEffect(() => {
    if (!selectedWs) return;
    let cancelled = false;
    setLoading(true);
    setSearchQuery("");
    setSearchResults(null);
    (async () => {
      try {
        const result = await listItems(selectedWs);
        if (!cancelled) setItems(result);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedWs]);

  // --- 検索（debounce 300ms）---
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const results = await searchItems(searchQuery, selectedWs ?? undefined);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedWs]);

  // --- アイテム選択 → コンテキスト追加 ---
  const handleSelectItem = useCallback(
    async (itemId: string, itemName: string, workspace: string) => {
      if (loadingItemId) return;
      setLoadingItemId(itemId);
      try {
        const [text, full] = await Promise.all([
          readItemContent(workspace, itemId),
          getItem(workspace, itemId),
        ]);
        const summary = full.ai_summary ? `\n要約: ${full.ai_summary}` : "";
        const tags = full.ai_tags.length > 0 ? `\nタグ: ${full.ai_tags.join(", ")}` : "";
        const ctx = createPresetContext(
          `Pool: ${itemName}`,
          `${text}${summary}${tags}`,
          "Pool素材",
        );
        onAddContext(ctx);
        setLocalAdded((prev) => new Set(prev).add(itemName));
      } catch {
        // テキスト読み込み不可（バイナリ等）→ 無視
      } finally {
        setLoadingItemId(null);
      }
    },
    [loadingItemId, onAddContext],
  );

  const isAdded = (name: string): boolean =>
    localAdded.has(name) || (addedNames?.has(name) ?? false);

  // 表示するアイテムリスト
  const displayItems: Array<{ id: string; name: string; summary: string | null; library: string }> =
    searchResults
      ? searchResults.map((r) => ({
          id: r.item_id,
          name: r.name,
          summary: r.ai_summary,
          library: r.library,
        }))
      : items.map((i) => ({
          id: i.id,
          name: i.name,
          summary: i.ai_summary,
          library: selectedWs!,
        }));

  if (!pos) return <></>;

  return createPortal(
    <div
      ref={popupRef}
      style={{
        position: "fixed",
        bottom: pos.bottom,
        left: pos.left,
      }}
      className="w-[400px] max-h-[480px] bg-popover border border-border rounded-lg shadow-xl z-[100] flex flex-col overflow-hidden"
    >
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <Database className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs font-medium text-foreground">Pool 素材を追加</span>
      </div>

      {/* 検索バー */}
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="検索..."
            className="w-full pl-7 pr-2 py-1 text-xs rounded border border-input bg-transparent placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            autoFocus
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* 左: ワークスペース一覧 */}
        <div className="w-[120px] border-r border-border overflow-y-auto shrink-0">
          {workspaces.map((ws) => (
            <button
              key={ws.name}
              onClick={() => setSelectedWs(ws.name)}
              className={`w-full text-left px-2 py-1.5 text-[10px] truncate transition ${
                selectedWs === ws.name
                  ? "bg-violet-500/15 text-violet-400 font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              title={ws.display_name ?? ws.name}
            >
              {ws.icon ?? "📦"} {ws.display_name ?? ws.name}
              <span className="ml-1 text-muted-foreground/60">({ws.item_count})</span>
            </button>
          ))}
        </div>

        {/* 右: アイテムリスト */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-20">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : displayItems.length === 0 ? (
            <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">
              {searchQuery ? "見つかりません" : "アイテムなし"}
            </div>
          ) : (
            displayItems.map((item) => {
              const added = isAdded(item.name);
              const isLoading = loadingItemId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() =>
                    !added && !isLoading &&
                    handleSelectItem(item.id, item.name, item.library)
                  }
                  disabled={added || isLoading}
                  className={`w-full text-left px-3 py-2 border-b border-border/50 transition ${
                    added
                      ? "opacity-50 cursor-default"
                      : "hover:bg-accent cursor-pointer"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-foreground truncate flex-1">
                      {item.name}
                    </span>
                    {isLoading && (
                      <Loader2 className="w-3 h-3 animate-spin text-violet-400 shrink-0" />
                    )}
                    {added && !isLoading && (
                      <Check className="w-3 h-3 text-green-500 shrink-0" />
                    )}
                  </div>
                  {item.summary && (
                    <p className="text-[9px] text-muted-foreground mt-0.5 line-clamp-2">
                      {item.summary}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
