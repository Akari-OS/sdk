/**
 * MaterialPanel — 全 app 共通の「素材」パネル (左サイド)。
 *
 * pool-impl からの asset 取得、thumbnail 解決、drag&drop、onInsert を担う。
 * 表示は Stage 概念を使わず、取得した Pool item をフラットな素材グリッドとして
 * 直接描画する。
 *
 * 後方互換 (HUB-071 spec §6 / brief 「既存 prop は引き続き受け付ける」):
 *   - すべての既存 props (workId / onInsert / onUpload / uploadAccept /
 *     uploadLabel / extraDragMimes / gridCols / enableScopeTab / enableSearch /
 *     defaultLibrary) は同じ shape で受け付ける
 *   - `enableScopeTab` は互換性のため受け付けるが、現行のフラット表示では使用しない
 *   - `defaultLibrary` 指定時は libraries fetch を skip して当該 1 件だけ扱う
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { Search, Loader2, Upload } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  listWorkspaces,
  listItems,
  searchItems,
  getItem,
  getItemFilePath,
  getItemThumbnail,
  type PoolItemSummary,
  type PoolItemFull,
} from "@akari-os/sdk/pool";

export interface MaterialPick {
  id: string;
  name: string;
  itemType: string;
  url: string;
  /**
   * 素材が属する Pool 名（ADR-103: 旧 `library` フィールドを改名）。
   * design canvas drop 等で必要。
   */
  pool?: string;
}

export type MaterialItemType =
  | "image"
  | "video"
  | "audio"
  | "text"
  | "note"
  | "code"
  | "pdf"
  | "url";

interface MaterialPanelProps {
  /** 互換性のため受け付ける Work id */
  workId?: string;
  /** Click / drop で本文に挿入するときに呼ばれる */
  onInsert: (pick: MaterialPick) => void;
  /**
   * アップロード button を有効化する。Shell 接続時のみ動作（dev mode は noop）。
   * `onUpload` が指定された場合のみ表示される。
   */
  onUpload?: (files: File[]) => void;
  /** アップロード可能な MIME accept (default: "image/*") */
  uploadAccept?: string;
  /** uploads button のラベル文言 (default: "画像をアップロード") */
  uploadLabel?: string;
  /** drag&drop の追加 mime payload。design は AKARI_POOL_ITEM_MIME 互換 mime を要求 */
  extraDragMimes?: { mime: string; payload: string }[];
  /** thumbnail grid の列数 (default 2) */
  gridCols?: 2 | 3;
  /** 互換性のため受け付ける表示オプション。現行のフラット表示では使用しない。 */
  enableScopeTab?: boolean;
  /** 検索バー表示 (default true) */
  enableSearch?: boolean;
  /** 既定 library override */
  defaultLibrary?: string;
  /** 表示対象から外す Pool 名。WorkPool 自身や legacy pool を除外する用途。 */
  excludedLibraries?: readonly string[];
  /**
   * 表示対象の item_type。未指定時は従来通り全種別を表示する。
   * Design など、メディア編集に使わない video/audio を隠したい app 向け。
   */
  allowedItemTypes?: readonly MaterialItemType[];
  /**
   * consumer が外から絶対 path を読めるよう同期する ref。
   * useEffect で pathCacheRef.current = pathCache に反映する。
   */
  pathCacheRef?: React.RefObject<Map<string, string>>;
  /**
   * サムネ解決済み item の pointerdown 時に呼ばれる。
   * true を返すと HTML5 dragstart を抑制し、consumer 側でカスタム drag を担う。
   * false / 未指定なら従来の HTML5 drag をそのまま起動する。
   * url=null (サムネ未解決) の item では呼ばれない。
   */
  onItemPointerDown?: (
    e: React.PointerEvent<HTMLDivElement>,
    item: PoolItemSummary,
    pick: MaterialPick,
    resolvedPath: string | null,
  ) => boolean;
  /**
   * サムネ上に任意の ReactNode をオーバーレイする render-prop。
   * PoolThumbBadge 等を注入する用途。未指定時は何も描画しない。
   */
  renderItemOverlay?: (item: PoolItemSummary) => ReactNode;
}

const POOL_LIBRARIES_FALLBACK = ["akari-uploads", "akari-outputs"];
const AKARI_POOL_ITEM_MIME = "application/x-akari-pool-item";

export function MaterialPanel({
  onInsert,
  onUpload,
  uploadAccept = "image/*",
  uploadLabel = "画像をアップロード",
  extraDragMimes,
  gridCols = 2,
  enableSearch = true,
  defaultLibrary,
  excludedLibraries,
  allowedItemTypes,
  pathCacheRef,
  onItemPointerDown,
  renderItemOverlay,
}: MaterialPanelProps) {
  const [libraries, setLibraries] = useState<string[]>(
    defaultLibrary ? [defaultLibrary] : POOL_LIBRARIES_FALLBACK,
  );
  // PoolItemSummary に紐付く library を逆引き
  const itemLibraryRef = useRef<Map<string, string>>(new Map());
  const [items, setItems] = useState<PoolItemSummary[]>([]);
  const [fullCache, setFullCache] = useState<Map<string, PoolItemFull>>(
    new Map(),
  );
  const [thumbCache, setThumbCache] = useState<Map<string, string>>(new Map());
  // 内部 pathCache: thumbCache が convertFileSrc 後 URL を保持するのに対し、
  // pathCache は getItemFilePath で得た絶対 path を保持する (consumer 向け)。
  const [pathCache, setPathCache] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 中身ベースで memo 化する。consumer が inline 配列 (新参照を毎レンダリング) を
  // 渡しても allowedItemTypeSet → displayItems → renderThumbGrid の useMemo 連鎖が
  // 無効化されないようにする防御 (識別子でなく内容で判定)。
  const allowedItemTypesKey = allowedItemTypes ? allowedItemTypes.join(",") : "";
  const excludedLibrariesKey = excludedLibraries ? excludedLibraries.join(",") : "";
  const excludedLibrarySet = useMemo(
    () => new Set(excludedLibraries ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [excludedLibrariesKey],
  );
  const allowedItemTypeSet = useMemo(
    () => (allowedItemTypes ? new Set<string>(allowedItemTypes) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allowedItemTypesKey],
  );

  // pathCacheRef 同期: consumer が外から絶対 path を読めるよう反映する
  useEffect(() => {
    if (pathCacheRef) {
      (pathCacheRef as React.MutableRefObject<Map<string, string>>).current =
        pathCache;
    }
  }, [pathCache, pathCacheRef]);

  // 検索 debounce 200ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ライブラリ一覧 (akari-uploads / akari-outputs を優先)
  useEffect(() => {
    if (defaultLibrary) {
      setLibraries(
        excludedLibrarySet.has(defaultLibrary) ? [] : [defaultLibrary],
      );
      return;
    }
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
        const known = POOL_LIBRARIES_FALLBACK.filter((n) => names.includes(n));
        const others = names.filter((n) => !POOL_LIBRARIES_FALLBACK.includes(n));
        const fallback = POOL_LIBRARIES_FALLBACK.filter((name) => !excludedLibrarySet.has(name));
        const merged = [...known, ...others].filter((name) => !excludedLibrarySet.has(name));
        setLibraries(merged.length > 0 ? merged : fallback);
      } catch {
        // dev mode は fallback そのまま
        setLibraries(POOL_LIBRARIES_FALLBACK.filter((name) => !excludedLibrarySet.has(name)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [defaultLibrary, excludedLibrarySet]);

  // 素材一覧取得 (全 library を集約)
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all: PoolItemSummary[] = [];
      for (const lib of libraries) {
        try {
          if (debouncedQuery.trim()) {
            const hits = await searchItems(debouncedQuery.trim(), lib, 50);
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
              // 検索 hit の library を記録 (lazy ensureFull の前 fallback)
              if (!itemLibraryRef.current.has(h.item_id)) {
                itemLibraryRef.current.set(h.item_id, lib);
              }
            }
          } else {
            const list = await listItems(lib, {
              sortBy: "updated_at",
              sortOrder: "desc",
              limit: 100,
            });
            // list で取得した item には library を即時記録
            for (const it of list) {
              if (!itemLibraryRef.current.has(it.id)) {
                itemLibraryRef.current.set(it.id, lib);
              }
            }
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

  // full / thumbnail の lazy ロード
  const ensureFull = useCallback(
    async (item: PoolItemSummary): Promise<PoolItemFull | undefined> => {
      const cached = fullCache.get(item.id);
      if (cached) return cached;
      // libraryRef から優先的に試し、ダメなら全 library
      const knownLib = itemLibraryRef.current.get(item.id);
      const tryOrder = knownLib
        ? [knownLib, ...libraries.filter((l) => l !== knownLib)]
        : libraries;
      for (const lib of tryOrder) {
        try {
          const full = await getItem(lib, item.id, { checkHash: false });
          itemLibraryRef.current.set(item.id, lib);
          setFullCache((prev) => new Map(prev).set(item.id, full));
          return full;
        } catch {
          // 別 library の可能性
        }
      }
      return undefined;
    },
    [libraries, fullCache],
  );

  const ensureThumb = useCallback(
    async (item: PoolItemSummary, full: PoolItemFull | undefined) => {
      if (thumbCache.has(item.id) || !full) return;
      const type = (full.item_type ?? "").toLowerCase();
      if (allowedItemTypeSet && !allowedItemTypeSet.has(type)) return;
      if (!["image", "video"].includes(type)) return;
      const knownLib = itemLibraryRef.current.get(item.id);
      const tryOrder = knownLib
        ? [knownLib, ...libraries.filter((l) => l !== knownLib)]
        : libraries;
      for (const lib of tryOrder) {
        try {
          const path = await getItemFilePath(lib, item.id);
          if (path) {
            // 絶対 path も保持 (consumer が pathCacheRef 経由で読む用)
            setPathCache((prev) => new Map(prev).set(item.id, path));
            const thumbPath = await getItemThumbnail(lib, item.id).catch(
              () => null,
            );
            const url = thumbPath != null ? convertFileSrc(thumbPath) : null;
            if (url) {
              setThumbCache((prev) => new Map(prev).set(item.id, url));
            }
            return;
          }
        } catch {
          // 別 library
        }
      }
    },
    [libraries, thumbCache, allowedItemTypeSet],
  );

  const displayItems = useMemo(
    () =>
      items.filter((item) =>
        isAllowedItemType(item, fullCache.get(item.id), allowedItemTypeSet),
      ),
    [items, fullCache, allowedItemTypeSet],
  );

  /* ----- 素材操作 (click / drag) ----- */

  const handleClick = useCallback(
    async (item: PoolItemSummary) => {
      const full = fullCache.get(item.id);
      if (!full) return;
      const poolName = itemLibraryRef.current.get(item.id);
      const resolvedPath = pathCache.get(item.id);
      const url = thumbCache.get(item.id) ?? (resolvedPath ? convertFileSrc(resolvedPath) : "");
      onInsert({
        id: item.id,
        name: item.name,
        itemType: full.item_type,
        url,
        pool: poolName,
      });
    },
    [fullCache, pathCache, thumbCache, onInsert],
  );

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, item: PoolItemSummary) => {
      const url = thumbCache.get(item.id);
      if (!url) return;
      const dragPoolName = itemLibraryRef.current.get(item.id);
      e.dataTransfer.setData(
        AKARI_POOL_ITEM_MIME,
        JSON.stringify({
          source: "shell",
          id: item.id,           // ContextSlotPanel 互換
          itemId: item.id,
          name: item.name,
          pool: dragPoolName,      // ADR-103 新フィールド
          library: dragPoolName,   // @deprecated 後方互換 (ADR-103)
          fallbackUrl: url,
        }),
      );
      if (extraDragMimes) {
        for (const { mime, payload } of extraDragMimes) {
          e.dataTransfer.setData(mime, payload);
        }
      }
      e.dataTransfer.setData("text/uri-list", url);
      e.dataTransfer.effectAllowed = "copy";
    },
    [thumbCache, extraDragMimes],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fl = e.target.files;
      if (!fl || fl.length === 0 || !onUpload) return;
      onUpload(Array.from(fl));
      e.target.value = "";
    },
    [onUpload],
  );

  /* ----- thumbnail grid renderer (region content として使う) ----- */

  const gridClass =
    gridCols === 3 ? "grid grid-cols-3 gap-1.5" : "grid grid-cols-2 gap-1.5";

  const renderThumbGrid = useCallback(
    (subset: PoolItemSummary[], emptyMessage: string) => {
      if (subset.length === 0) {
        return (
          <div className="text-[10px] text-muted-foreground px-1 py-2">
            {emptyMessage}
          </div>
        );
      }
      return (
        <div className={gridClass}>
          {subset.map((item) => (
            <MaterialThumb
              key={item.id}
              item={item}
              fullCache={fullCache}
              thumbCache={thumbCache}
              pathCache={pathCache}
              onMount={async () => {
                // ensureFull は取得した full をそのまま返す。closure 内の
                // stale な fullCache を読むと常に undefined になり ensureThumb が
                // early-return してサムネが永久に出ないため、返り値を直接渡す。
                const f = await ensureFull(item);
                void ensureThumb(item, f);
              }}
              onClick={() => void handleClick(item)}
              onDragStart={(e) => handleDragStart(e, item)}
              onItemPointerDown={
                onItemPointerDown
                  ? (e, resolvedPath) => {
                      const full = fullCache.get(item.id);
                      if (!resolvedPath) return false;
                      const url =
                        thumbCache.get(item.id) ?? convertFileSrc(resolvedPath);
                      const pickPoolName = itemLibraryRef.current.get(item.id);
                      const pick: MaterialPick = {
                        id: item.id,
                        name: item.name,
                        itemType: full?.item_type ?? "",
                        url,
                        pool: pickPoolName,
                      };
                      return onItemPointerDown(e, item, pick, resolvedPath);
                    }
                  : undefined
              }
              renderItemOverlay={renderItemOverlay}
            />
          ))}
        </div>
      );
    },
    [
      gridClass,
      fullCache,
      thumbCache,
      pathCache,
      ensureFull,
      ensureThumb,
      handleClick,
      handleDragStart,
      onItemPointerDown,
      renderItemOverlay,
    ],
  );

  return (
    <div
      className="flex flex-col h-full gap-2 p-2"
      data-component="MaterialPanel"
    >
      {/* upload button (optional) */}
      {onUpload && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded border border-dashed border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary transition shrink-0"
          >
            <Upload className="w-3 h-3" />
            {uploadLabel}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={uploadAccept}
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </>
      )}

      {/* 検索 (optional) */}
      {enableSearch && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-border bg-muted/40 shrink-0">
          <Search className="w-3 h-3 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="素材を検索"
            className="flex-1 bg-transparent text-[11px] focus:outline-none"
          />
          {loading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
        </div>
      )}

      {/* フラットな Pool item グリッド */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {renderThumbGrid(displayItems, "Pool にまだ素材がありません")}
      </div>

      {/* 全体 loading 表示 (initial) */}
      {loading && items.length === 0 && (
        <div className="flex items-center justify-center py-2 text-muted-foreground shrink-0">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}
    </div>
  );
}

const MaterialThumb = memo(function MaterialThumb({
  item,
  fullCache,
  thumbCache,
  pathCache,
  onMount,
  onClick,
  onDragStart,
  onItemPointerDown,
  renderItemOverlay,
}: {
  item: PoolItemSummary;
  fullCache: Map<string, PoolItemFull>;
  thumbCache: Map<string, string>;
  /** 絶対 path キャッシュ (consumer 向け pathCacheRef の元データ) */
  pathCache: Map<string, string>;
  onMount: () => void;
  onClick: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  /**
   * ファイル path 解決済み item の pointerdown 時に呼ばれる。
   * true を返すと HTML5 dragstart を抑制する。
   */
  onItemPointerDown?: (
    e: React.PointerEvent<HTMLDivElement>,
    resolvedPath: string | null,
  ) => boolean;
  /** サムネ上のオーバーレイ ReactNode。未指定は何も描画しない */
  renderItemOverlay?: (item: PoolItemSummary) => ReactNode;
}) {
  // HTML5 dragstart を一時抑制するための state (onItemPointerDown が true を返したとき)
  const [suppressDrag, setSuppressDrag] = useState(false);

  useEffect(() => {
    onMount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const full = fullCache.get(item.id);
  const url = thumbCache.get(item.id);
  const type = (full?.item_type ?? "").toLowerCase();

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onItemPointerDown) return;
      const resolvedPath = pathCache.get(item.id) ?? null;
      // resolvedPath=null (ファイル未解決) のときは consumer DnD を開始できない。
      if (!resolvedPath) return;
      const consumed = onItemPointerDown(e, resolvedPath);
      if (consumed) {
        // HTML5 dragstart の同時発火を防ぐ (リスク2対策)
        e.preventDefault();
        setSuppressDrag(true);
      }
    },
    [onItemPointerDown, pathCache, item.id],
  );

  const handlePointerUp = useCallback(() => {
    if (suppressDrag) setSuppressDrag(false);
  }, [suppressDrag]);

  return (
    <div
      role="button"
      tabIndex={0}
      // draggable: url=null は false。onItemPointerDown が true を返したときも false に
      draggable={!!url && !suppressDrag}
      onDragStart={onDragStart}
      onPointerDown={onItemPointerDown ? handlePointerDown : undefined}
      onPointerUp={onItemPointerDown ? handlePointerUp : undefined}
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
        <img
          src={url}
          alt=""
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-[9px] text-muted-foreground p-1 text-center">
          {item.name.slice(0, 24)}
        </div>
      )}
      {/* オーバーレイ: PoolThumbBadge 等の注入用 (absolute 配置は consumer 側で指定) */}
      {renderItemOverlay && renderItemOverlay(item)}
    </div>
  );
},
// 自分の item の full/thumb/path と overlay が変わったときだけ再レンダする。
// コールバック類 (onMount/onClick/onDragStart/onItemPointerDown) は親 renderThumbGrid
// で毎レンダ新規生成されるため比較から除外する。各サムネは自分のロード完了時
// (= 下記 cache エントリ更新時) に再レンダして最新クロージャを取り込むので stale closure
// は無害。item データはロード後 immutable なので以降の親再レンダは無視してよい。
(prev, next) =>
  prev.item === next.item &&
  prev.fullCache.get(prev.item.id) === next.fullCache.get(next.item.id) &&
  prev.thumbCache.get(prev.item.id) === next.thumbCache.get(next.item.id) &&
  prev.pathCache.get(prev.item.id) === next.pathCache.get(next.item.id) &&
  prev.renderItemOverlay === next.renderItemOverlay,
);

function isAllowedItemType(
  item: PoolItemSummary,
  full: PoolItemFull | undefined,
  allowed: Set<string> | null,
): boolean {
  if (!allowed) return true;
  const type = (full?.item_type || item.item_type || "").toLowerCase();
  if (!type) return true;
  return allowed.has(type);
}
