/**
 * MaterialPanel — 全 app 共通の「素材」パネル (左サイド)。
 *
 * AKARI-HUB-071 Phase 1 (T-5) で 3 領域 (Personal Pool / Work Pool / Pool)
 * layout に再構成。内部 layout は `PoolBrowserView` (T-4) に委譲し、本ファイルは
 * pool-impl からの asset 取得 + 分類 + thumbnail / drag&drop / onInsert といった
 * picker 責務だけを担う。
 *
 * 後方互換 (HUB-071 spec §6 / brief 「既存 prop は引き続き受け付ける」):
 *   - すべての既存 props (workId / onInsert / onUpload / uploadAccept /
 *     uploadLabel / extraDragMimes / gridCols / enableScopeTab / enableSearch /
 *     defaultLibrary) は同じ shape で受け付ける
 *   - `enableScopeTab=false` のときは Personal / Work 領域を非表示にして
 *     旧来の単一 grid 風 UI に近づける (Cross-Work 領域だけが残る)
 *   - `defaultLibrary` 指定時は libraries fetch を skip して当該 1 件だけ扱う
 *
 * 振る舞い (新):
 *   - 上段 Personal Pool: ctx.scope === 'personal' な item を picker thumb で表示
 *     - ADR-085 D-4 で導入された Personal Pool 昇格 (`updateItemContext` で
 *       scope=personal 化) と整合。未分類の item は Cross-Work に残る
 *   - 中段 Work Pool: workId が指定されたとき表示。Upload/WorkState/Output の
 *     固定 3 段 stage で picker thumb を grouping
 *     - Upload: ctx.attached_to_work === workId
 *     - WorkState: 現状空 (HUB-074 schema migration で work_states 確立後に拡張)
 *     - Output: ctx.source_work_id === workId
 *   - 下段 Cross-Work Pool: library ごとに 1 entry。先頭 2 件を pinned 扱いと
 *     して常時表示、それ以外は recent。pin 上限 (10) 超過時は警告 banner
 *
 * Lazy classification:
 *   - context_json は PoolItemFull にしか含まれず list 取得時には来ないため、
 *     fullCache 未ロードの item は Cross-Work / first library に default 振り分け。
 *     thumbnail mount で `ensureFull` が走り context_json が読めた時点で
 *     Personal / Work 領域に再分類される (UI が小さく jitter する余地はあるが、
 *     pool-impl 側の summary 拡張までは MVP として許容)
 *
 * 関連 spec / ADR:
 *   - spec-pool-ui-redesign-stage-context-pane (AKARI-HUB-071) §6
 *   - ADR-085 D-4 / D-7 / D-8 (Personal Pool 昇格 / 全 app 左パネル素材 / scope filter)
 *   - ADR-094 (6 概念モデル) / ADR-079 (Pool 統合)
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { Search, Loader2, Upload } from "lucide-react";
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
import { PoolBrowserView } from "./PoolBrowserView";
import type { PoolDisplay, StageDisplay, StageKind } from "./types/pool";

export interface MaterialPick {
  id: string;
  name: string;
  itemType: string;
  url: string;
  /** Pool 由来の library 名 (design canvas drop 等で必要) */
  library?: string;
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
  /** ADR-085 D-8: Work Pool 領域の filter 対象となる Work id */
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
  /**
   * 旧 scope tab を表示するか (default true)。
   * HUB-071 で 3 領域 layout に変わったため、true は「Personal / Work 領域を表示」
   * の意味になり、false は「Cross-Work 領域のみ」を表示する。
   */
  enableScopeTab?: boolean;
  /** 検索バー表示 (default true) */
  enableSearch?: boolean;
  /** 既定 library override */
  defaultLibrary?: string;
  /**
   * 表示対象の item_type。未指定時は従来通り全種別を表示する。
   * Design など、メディア編集に使わない video/audio を隠したい app 向け。
   */
  allowedItemTypes?: readonly MaterialItemType[];
}

const POOL_LIBRARIES_FALLBACK = ["akari-uploads", "akari-outputs"];
const AKARI_POOL_ITEM_MIME = "application/x-akari-pool-item";

export function MaterialPanel({
  workId,
  onInsert,
  onUpload,
  uploadAccept = "image/*",
  uploadLabel = "画像をアップロード",
  extraDragMimes,
  gridCols = 2,
  enableScopeTab = true,
  enableSearch = true,
  defaultLibrary,
  allowedItemTypes,
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
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cross-Work 領域での選択 pool (library 名が ID)
  const [selectedCrossWorkPool, setSelectedCrossWorkPool] = useState<
    string | null
  >(null);
  // 現在開いている Stage (default Upload)
  const [selectedStage, setSelectedStage] = useState<StageKind>("upload");
  const allowedItemTypeSet = useMemo(
    () => (allowedItemTypes ? new Set<string>(allowedItemTypes) : null),
    [allowedItemTypes],
  );

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
    if (defaultLibrary) return;
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
        const merged = [...known, ...others];
        setLibraries(merged.length > 0 ? merged : POOL_LIBRARIES_FALLBACK);
      } catch {
        // dev mode は fallback そのまま
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [defaultLibrary]);

  // 初期 selectedCrossWorkPool の同期 (libraries の 1 件目を default)
  useEffect(() => {
    if (selectedCrossWorkPool == null && libraries.length > 0) {
      setSelectedCrossWorkPool(libraries[0]);
    }
  }, [libraries, selectedCrossWorkPool]);

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
    async (item: PoolItemSummary) => {
      if (fullCache.has(item.id)) return;
      // libraryRef から優先的に試し、ダメなら全 library
      const knownLib = itemLibraryRef.current.get(item.id);
      const tryOrder = knownLib
        ? [knownLib, ...libraries.filter((l) => l !== knownLib)]
        : libraries;
      for (const lib of tryOrder) {
        try {
          const full = await getItem(lib, item.id);
          itemLibraryRef.current.set(item.id, lib);
          setFullCache((prev) => new Map(prev).set(item.id, full));
          return;
        } catch {
          // 別 library の可能性
        }
      }
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
            const url = convertFileSrc(path);
            setThumbCache((prev) => new Map(prev).set(item.id, url));
            return;
          }
        } catch {
          // 別 library
        }
      }
    },
    [libraries, thumbCache, allowedItemTypeSet],
  );

  /* ----- 分類 (lazy classification, fullCache に依存) ----- */

  const ctxOf = useCallback(
    (item: PoolItemSummary): Record<string, unknown> | null => {
      const f = fullCache.get(item.id);
      const ctx = f?.context_json;
      return ctx && typeof ctx === "object"
        ? (ctx as Record<string, unknown>)
        : null;
    },
    [fullCache],
  );

  const displayItems = useMemo(
    () =>
      items.filter((item) =>
        isAllowedItemType(item, fullCache.get(item.id), allowedItemTypeSet),
      ),
    [items, fullCache, allowedItemTypeSet],
  );

  const personalItems = useMemo(
    () => displayItems.filter((i) => ctxOf(i)?.scope === "personal"),
    [displayItems, ctxOf],
  );

  const workUploadItems = useMemo(() => {
    if (!workId) return [];
    return displayItems.filter((i) => {
      const ctx = ctxOf(i);
      return ctx?.attached_to_work === workId;
    });
  }, [displayItems, ctxOf, workId]);

  const workOutputItems = useMemo(() => {
    if (!workId) return [];
    return displayItems.filter((i) => {
      const ctx = ctxOf(i);
      return ctx?.source_work_id === workId;
    });
  }, [displayItems, ctxOf, workId]);

  /**
   * Cross-Work 領域は「分類済を除いた残り」を library ごとに振り分け。
   * これにより同じ item が Personal / Work / Cross-Work に重複表示されない。
   */
  const crossWorkItemsByLib = useMemo(() => {
    const m = new Map<string, PoolItemSummary[]>();
    libraries.forEach((lib) => m.set(lib, []));
    const claimed = new Set<string>([
      ...personalItems.map((i) => i.id),
      ...workUploadItems.map((i) => i.id),
      ...workOutputItems.map((i) => i.id),
    ]);
    for (const item of displayItems) {
      if (claimed.has(item.id)) continue;
      const lib =
        itemLibraryRef.current.get(item.id) ?? libraries[0] ?? "default";
      if (!m.has(lib)) m.set(lib, []);
      m.get(lib)!.push(item);
    }
    return m;
  }, [displayItems, libraries, personalItems, workUploadItems, workOutputItems]);

  /* ----- PoolDisplay synthesis ----- */

  const nowIso = useMemo(() => new Date().toISOString(), []);

  const personalPool: PoolDisplay = useMemo(
    () => ({
      id: "personal",
      kind: "personal",
      name: "Personal Pool",
      is_system: true,
      is_pinned: false,
      is_archived: false,
      // ADR-075: Personal Pool は ambient で常時 attach
      is_active: true,
      last_activity: nowIso,
    }),
    [nowIso],
  );

  const workPool = useMemo(() => {
    if (!workId) return null;
    const stages: Partial<Record<StageKind, StageDisplay>> = {
      upload: {
        kind: "upload",
        is_active: true,
        asset_refs: workUploadItems.map((i) => i.id),
      },
      workstate: {
        kind: "workstate",
        is_active: false,
        asset_refs: [],
      },
      output: {
        kind: "output",
        is_active: workOutputItems.length > 0,
        asset_refs: workOutputItems.map((i) => i.id),
      },
    };
    return {
      pool: {
        id: `work:${workId}`,
        kind: "work" as const,
        name: "この Work",
        is_system: true,
        is_pinned: false,
        is_archived: false,
        is_active: true,
        last_activity: nowIso,
      },
      stages,
    };
  }, [workId, workUploadItems, workOutputItems, nowIso]);

  const crossWorkPools: PoolDisplay[] = useMemo(() => {
    return libraries.map((lib, idx) => ({
      id: lib,
      kind: "cross-work",
      name: lib,
      is_system: false,
      // 既知 library (akari-uploads / akari-outputs) は pinned として扱う
      is_pinned: idx < POOL_LIBRARIES_FALLBACK.length,
      is_archived: false,
      is_active: false,
      last_activity: nowIso,
    }));
  }, [libraries, nowIso]);

  /* ----- 素材操作 (click / drag) ----- */

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
        library: itemLibraryRef.current.get(item.id),
      });
    },
    [fullCache, thumbCache, onInsert],
  );

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, item: PoolItemSummary) => {
      const url = thumbCache.get(item.id);
      if (!url) return;
      e.dataTransfer.setData(
        AKARI_POOL_ITEM_MIME,
        JSON.stringify({
          source: "shell",
          itemId: item.id,
          library: itemLibraryRef.current.get(item.id),
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
      );
    },
    [
      gridClass,
      fullCache,
      thumbCache,
      ensureFull,
      ensureThumb,
      handleClick,
      handleDragStart,
    ],
  );

  /* ----- PoolBrowserView の render-prop ----- */

  const renderStageContent = useCallback(
    (stage: StageKind, _display: StageDisplay) => {
      if (stage === "upload") {
        return renderThumbGrid(
          workUploadItems,
          "この Work に紐付いた Upload はまだありません",
        );
      }
      if (stage === "output") {
        return renderThumbGrid(
          workOutputItems,
          "この Work からの Output はまだありません",
        );
      }
      // workstate: HUB-074 schema migration 後に有効化予定
      return (
        <div className="text-[10px] text-muted-foreground px-1 py-2">
          WorkState は HUB-074 schema migration 後に有効化予定
        </div>
      );
    },
    [renderThumbGrid, workUploadItems, workOutputItems],
  );

  const renderPoolContent = useCallback(
    (pool: PoolDisplay) => {
      if (pool.kind === "personal") {
        return renderThumbGrid(
          personalItems,
          "Personal Pool にまだ素材がありません。素材を「📌 Personal Pool に昇格」で追加できます。",
        );
      }
      if (pool.kind === "cross-work") {
        const subset = crossWorkItemsByLib.get(pool.id) ?? [];
        return renderThumbGrid(subset, `${pool.name} は空です`);
      }
      return null;
    },
    [renderThumbGrid, personalItems, crossWorkItemsByLib],
  );

  const handlePoolClick = useCallback(
    (pool: PoolDisplay) => {
      if (pool.kind === "cross-work") {
        setSelectedCrossWorkPool((prev) =>
          prev === pool.id ? prev : pool.id,
        );
      }
      // Personal / Work pool クリックは現状 no-op (将来 toggle attach 等へ)
    },
    [],
  );

  const showPersonalAndWork = enableScopeTab;

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

      {/* 3 領域 layout (PoolBrowserView) */}
      <div className="flex-1 min-h-0">
        <PoolBrowserView
          personalPool={showPersonalAndWork ? personalPool : null}
          workPool={showPersonalAndWork ? workPool : null}
          crossWorkPools={crossWorkPools}
          selectedPoolId={selectedCrossWorkPool}
          selectedStage={selectedStage}
          onSelectStage={setSelectedStage}
          onPoolClick={handlePoolClick}
          renderStageContent={renderStageContent}
          renderPoolContent={renderPoolContent}
          stageLayout="tabs"
        />
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
