/**
 * MaterialPanel — 全 app 共通の「素材」パネル（左サイド）。
 *
 * ADR-085 D-7「全 app 左パネルに『素材』タブ」+ D-8「この Work / 全 Pool は
 * filter view」を共通 component として実装。writer / design / 将来の app から
 * 利用される。
 *
 * 機能:
 *   - listItems / searchItems を `@akari-os/sdk/pool` 経由で叩いて素材一覧
 *   - scope tab: 「この Work」 = attached_to_work === workId || source_work_id === workId
 *   - 検索 (debounce 200ms)
 *   - thumbnail grid + click で `onInsert` callback（本文挿入 / canvas 配置）
 *   - drag start で `application/x-akari-pool-item` mime を書き出し（design 等の
 *     drop target と整合）
 *
 * 各 app は `onInsert` で受け取った `MaterialPick` を自前の挿入経路にマップする。
 * Tauri 環境前提（`@tauri-apps/api/core::convertFileSrc` を使用）。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Search, Loader2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  listWorkspaces,
  listItems,
  searchItems,
  getItem,
  getItemFilePath,
  type PoolItemSummary,
  type PoolItemFull,
} from "@akari-os/sdk/pool";

export interface MaterialPick {
  id: string;
  name: string;
  itemType: string;
  url: string;
}

interface MaterialPanelProps {
  /** ADR-085 D-8: scope tab の「この Work」 で filter する Work id */
  workId?: string;
  /** Click / drop で本文に挿入するときに呼ばれる */
  onInsert: (pick: MaterialPick) => void;
}

const POOL_LIBRARIES_FALLBACK = ["akari-uploads", "akari-outputs"];
const AKARI_POOL_ITEM_MIME = "application/x-akari-pool-item";

type Scope = "this-work" | "all";

export function MaterialPanel({ workId, onInsert }: MaterialPanelProps) {
  const [libraries, setLibraries] = useState<string[]>(POOL_LIBRARIES_FALLBACK);
  const [scope, setScope] = useState<Scope>(workId ? "this-work" : "all");
  const [items, setItems] = useState<PoolItemSummary[]>([]);
  const [fullCache, setFullCache] = useState<Map<string, PoolItemFull>>(new Map());
  const [thumbCache, setThumbCache] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // workId が後から付くケース（Work 切替）に対応
  useEffect(() => {
    setScope(workId ? "this-work" : "all");
  }, [workId]);

  // 検索 debounce 200ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ライブラリ一覧（akari-uploads / akari-outputs を優先表示、その他もある分は集約）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listWorkspaces();
        if (cancelled) return;
        const names = list
          .map((l) => l.name)
          .filter(
            (n): n is string => typeof n === "string" && n.length > 0,
          );
        // 既知 library 優先 + その他
        const known = POOL_LIBRARIES_FALLBACK.filter((n) => names.includes(n));
        const others = names.filter((n) => !POOL_LIBRARIES_FALLBACK.includes(n));
        const merged = [...known, ...others];
        setLibraries(merged.length > 0 ? merged : POOL_LIBRARIES_FALLBACK);
      } catch {
        // dev mode (Shell 未接続) は fallback そのまま
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 素材一覧取得（全 library を集約）
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all: PoolItemSummary[] = [];
      for (const lib of libraries) {
        try {
          if (debouncedQuery.trim()) {
            const hits = await searchItems(debouncedQuery.trim(), lib, 50);
            // SearchHit を Summary 形に揃える
            for (const h of hits) {
              all.push({
                id: h.item_id,
                name: h.name,
                item_type: "",
                ai_summary: h.ai_summary,
                ai_tags: [],
                size_bytes: null,
                analyzed_at: null,
                created_at: new Date(0).toISOString(),
                updated_at: new Date(0).toISOString(),
                is_referenced: false,
              });
            }
          } else {
            const list = await listItems(lib, {
              sortBy: "updated_at",
              sortOrder: "desc",
              limit: 100,
            });
            all.push(...list);
          }
        } catch (err) {
          console.warn("[MaterialPanel] listItems failed for", lib, err);
        }
      }
      setItems(all);
    } finally {
      setLoading(false);
    }
  }, [libraries, debouncedQuery]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // scope filter（item は context_json を持たないので full を引きに行く lazy ロード）
  const ensureFull = useCallback(
    async (item: PoolItemSummary) => {
      if (fullCache.has(item.id)) return;
      // 各 item の library を特定する必要がある — 単純化のため全 library を順に試す
      for (const lib of libraries) {
        try {
          const full = await getItem(lib, item.id);
          setFullCache((prev) => new Map(prev).set(item.id, full));
          return;
        } catch {
          // 別 library の可能性
        }
      }
    },
    [libraries, fullCache],
  );

  // thumbnail / file URL の取得（image / video のみ）
  const ensureThumb = useCallback(
    async (item: PoolItemSummary, full: PoolItemFull | undefined) => {
      if (thumbCache.has(item.id) || !full) return;
      const type = (full.item_type ?? "").toLowerCase();
      if (!["image", "video"].includes(type)) return;
      // 各 library を試す（full から library を逆引きできないため）
      for (const lib of libraries) {
        try {
          const path = await getItemFilePath(lib, item.id);
          if (path) {
            const url = convertFileSrc(path);
            setThumbCache((prev) => new Map(prev).set(item.id, url));
            return;
          }
        } catch {
          // 別 library
        }
      }
    },
    [libraries, thumbCache],
  );

  const filteredItems = useMemo(() => {
    if (scope === "all" || !workId) return items;
    return items.filter((i) => {
      const full = fullCache.get(i.id);
      const ctx = (full?.context_json ?? null) as
        | Record<string, unknown>
        | null;
      if (!ctx) return false;
      return (
        ctx.attached_to_work === workId || ctx.source_work_id === workId
      );
    });
  }, [items, scope, workId, fullCache]);

  // 素材を本文に挿入（click）
  const handleClick = useCallback(
    async (item: PoolItemSummary) => {
      const full = fullCache.get(item.id);
      const url = thumbCache.get(item.id);
      if (!full || !url) return;
      onInsert({
        id: item.id,
        name: item.name,
        itemType: full.item_type,
        url,
      });
    },
    [fullCache, thumbCache, onInsert],
  );

  // drag start (design / shell の mime と整合)
  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, item: PoolItemSummary) => {
      const url = thumbCache.get(item.id);
      if (!url) return;
      e.dataTransfer.setData(
        AKARI_POOL_ITEM_MIME,
        JSON.stringify({
          source: "shell",
          itemId: item.id,
          fallbackUrl: url,
        }),
      );
      e.dataTransfer.setData("text/uri-list", url);
      e.dataTransfer.effectAllowed = "copy";
    },
    [thumbCache],
  );

  return (
    <div className="flex flex-col h-full gap-2 p-2">
      {/* scope tab */}
      <div className="flex items-center gap-1 text-[11px]">
        <button
          type="button"
          onClick={() => setScope("this-work")}
          disabled={!workId}
          className={`flex-1 px-2 py-1 rounded border ${
            scope === "this-work"
              ? "bg-primary/10 border-primary text-primary font-medium"
              : "border-border text-muted-foreground hover:text-foreground"
          } ${!workId ? "opacity-50 cursor-not-allowed" : ""}`}
          title={
            workId
              ? "この Work に紐付いた素材"
              : "Work を選択すると有効になります"
          }
        >
          この Work の素材
        </button>
        <button
          type="button"
          onClick={() => setScope("all")}
          className={`flex-1 px-2 py-1 rounded border ${
            scope === "all"
              ? "bg-primary/10 border-primary text-primary font-medium"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          全 Pool
        </button>
      </div>

      {/* 検索 */}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-muted/40">
        <Search className="w-3 h-3 text-muted-foreground shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="素材を検索"
          className="flex-1 bg-transparent text-[11px] focus:outline-none"
        />
      </div>

      {/* 一覧 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-[10px] text-muted-foreground px-1 py-2">
            {scope === "this-work"
              ? "この Work に紐付いた素材はまだありません。「全 Pool」タブで他の素材を探すか、画像をアップロードしてください。"
              : "Pool に素材がありません。"}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {filteredItems.map((item) => (
              <MaterialThumb
                key={item.id}
                item={item}
                fullCache={fullCache}
                thumbCache={thumbCache}
                onMount={async () => {
                  await ensureFull(item);
                  const f = fullCache.get(item.id);
                  void ensureThumb(item, f);
                }}
                onClick={() => void handleClick(item)}
                onDragStart={(e) => handleDragStart(e, item)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MaterialThumb({
  item,
  fullCache,
  thumbCache,
  onMount,
  onClick,
  onDragStart,
}: {
  item: PoolItemSummary;
  fullCache: Map<string, PoolItemFull>;
  thumbCache: Map<string, string>;
  onMount: () => void;
  onClick: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
}) {
  useEffect(() => {
    onMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const full = fullCache.get(item.id);
  const url = thumbCache.get(item.id);
  const type = (full?.item_type ?? "").toLowerCase();

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!!url}
      onDragStart={onDragStart}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="aspect-square rounded border border-border bg-muted/40 overflow-hidden cursor-pointer hover:border-primary transition relative"
      title={item.name}
    >
      {url && (type === "image" || type === "video") ? (
        type === "image" ? (
          <img
            src={url}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <video
            src={url}
            muted
            playsInline
            className="w-full h-full object-cover"
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[9px] text-muted-foreground p-1 text-center">
          {item.name.slice(0, 24)}
        </div>
      )}
    </div>
  );
}
