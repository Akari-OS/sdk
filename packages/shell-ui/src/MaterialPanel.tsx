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
 *
 * 性能設計 (2026-06-06, ワークプール激重 fix / A 案):
 *   ContextSlotPanel と同じ共有サムネキャッシュ (`./lib/pool-thumbnail-cache`,
 *   MAX_CONCURRENT=1 + inflight 集約 + rAF コアレス通知) に載せ替え、旧実装の
 *   「カード mount ごとに getItemThumbnail(ffmpeg) を無制限並列で投げ、完了ごとに
 *   new Map(prev) で thumbCache を作り直してパネル全体を再描画する O(N^2)」を解消した。
 *   さらに `useVisibleMount` (IntersectionObserver) で画面外カードのロードを defer し、
 *   通常 browse では getItem(full) を省いて summary の item_type で表示する。
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
  type PoolItemSummary,
  type PoolItemFull,
} from "@akari-os/sdk/pool";
import { getMaterialType, type MaterialType } from "@akari-os/sdk/material";
import {
  ensureThumb,
  getCachedThumb,
  isThumbGenerating,
  useThumbCacheSubscription,
  useThumbGeneratingSubscription,
  cancelPendingThumbs,
} from "./lib/pool-thumbnail-cache";
import { useVisibleMount } from "./lib/use-visible-mount";

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
   * AKARI-HUB-088 §2-4 (S0-4): 表示対象の material_type（context_json.material_type）。
   * 指定時は素材オーサリングで登録された素材のみを当該カテゴリに絞り込む
   * （例: diagram は ["diagram-part","diagram-template"]）。未指定時は絞り込まない。
   * 判定には PoolItemFull の context_json が必要なため、full ロード前は暫定表示し、
   * ロード後に非該当 item が除外される（既存 allowedItemTypes と同じ lazy 挙動）。
   */
  allowedMaterialTypes?: readonly MaterialType[];
  /**
   * AKARI-HUB-088 §2-4 (S0-4): 素材の右クリック「編集」。指定時のみコンテキストメニューを表示。
   * オーサリングアプリを sourceItem 付きで開く導線（AuthoringEditorProps.sourceItem）。
   */
  onEditMaterial?: (itemId: string, materialType: MaterialType | null, pool: string | undefined) => void;
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

// カードを layout 的に独立させ、サムネ遅延ロード時に兄弟へ reflow を伝播させない。
// ⚠ content-visibility: auto は撤去（毎レンダリング更新ごとに document 全体で relevance 判定が
//    走るグローバルコストがあり、マウント中に無関係なリサイズ/シークまで毎フレーム重くするため。
//    ContextSlotPanel と同方針）。
const MATERIAL_CARD_DEFER_STYLE = {
  contain: "layout style",
} as React.CSSProperties;

export function MaterialPanel({
  workId,
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
  allowedMaterialTypes,
  onEditMaterial,
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
  // 内部 pathCache: getItemFilePath で得た絶対 path を保持する (consumer 向け)。
  // サムネ URL は共有キャッシュ (pool-thumbnail-cache) 側で保持する。
  const [pathCache, setPathCache] = useState<Map<string, string>>(new Map());
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // サムネ共有キャッシュの更新購読。cache / generating の変化はこの 2 本の subscription
  // (rAF コアレス) に集約され、サムネ完了ごとのパネル全体再描画 + Map 全コピー (O(N^2)) を
  // 解消する。ContextSlotPanel と同一思想。
  useThumbCacheSubscription();
  useThumbGeneratingSubscription();
  // タブを離れる (unmount) ときは未開始のサムネ生成ジョブを破棄する。
  useEffect(() => () => cancelPendingThumbs(), []);

  // 中身ベースで memo 化する。consumer が inline 配列 (新参照を毎レンダリング) を
  // 渡しても allowedItemTypeSet → displayItems → grid の useMemo 連鎖が
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
  const allowedMaterialTypesKey = allowedMaterialTypes
    ? allowedMaterialTypes.join(",")
    : "";
  const allowedMaterialTypeSet = useMemo(
    () => (allowedMaterialTypes ? new Set<string>(allowedMaterialTypes) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allowedMaterialTypesKey],
  );
  // consumer が絶対 path を必要とするか (video の DnD / add-to-workpool 用)。
  // 未指定 (design 等) なら getItemFilePath を呼ばず軽量化する。
  const needsPath = !!(pathCacheRef || onItemPointerDown);
  // 右クリック「編集」コンテキストメニュー（onEditMaterial 指定時のみ）。
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    item: PoolItemSummary;
  } | null>(null);

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

  // ライブラリ一覧取得。workId が指定された場合は work-{workId} を必ず含める。
  // これにより他アプリ（Video 等）が同一ワークのプールに追加した素材が Design 側でも見える。
  const fetchLibraries = useCallback(async () => {
    if (defaultLibrary) {
      setLibraries(
        excludedLibrarySet.has(defaultLibrary) ? [] : [defaultLibrary],
      );
      return;
    }
    // workId があれば work プール名を事前計算 (命名規約: "work-{workId}")
    const workLib = workId ? `work-${workId}` : null;
    try {
      const list = await listWorkspaces();
      const names = list
        .map((l) => l.name)
        .filter(
          (n): n is string => typeof n === "string" && n.length > 0,
        );
      const known = POOL_LIBRARIES_FALLBACK.filter((n) => names.includes(n));
      const others = names.filter((n) => !POOL_LIBRARIES_FALLBACK.includes(n));
      const merged = [...known, ...others].filter((name) => !excludedLibrarySet.has(name));
      // workLib が未登録（Video がまだ作成していない場合）でも常にスキャン対象に追加。
      // listItems が空ならサイレントフェイル → 作成後の次回 refresh で自動反映。
      if (workLib && !merged.includes(workLib) && !excludedLibrarySet.has(workLib)) {
        merged.push(workLib);
      }
      const fallback = [
        ...POOL_LIBRARIES_FALLBACK.filter((name) => !excludedLibrarySet.has(name)),
        ...(workLib && !excludedLibrarySet.has(workLib) ? [workLib] : []),
      ];
      setLibraries(merged.length > 0 ? merged : fallback);
    } catch {
      // dev mode は fallback そのまま
      const fallback = [
        ...POOL_LIBRARIES_FALLBACK.filter((name) => !excludedLibrarySet.has(name)),
        ...(workLib && !excludedLibrarySet.has(workLib) ? [workLib] : []),
      ];
      setLibraries(fallback);
    }
  }, [defaultLibrary, excludedLibrarySet, workId]);

  useEffect(() => {
    void fetchLibraries();
  }, [fetchLibraries]);

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

  // 他アプリ（Video 等）が同一ワークのプールに追加した素材を自動反映するための
  // 30 秒ポーリング。タブが背面（hidden）のときは skip して無駄な IPC を抑える。
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      void fetchLibraries().then(() => void refresh());
    }, 30_000);
    return () => clearInterval(id);
  }, [fetchLibraries, refresh]);

  // full の lazy ロード。material_type フィルタ時、または summary に item_type を持たない
  // 検索 hit のときだけ呼ぶ（通常 browse は summary.item_type で済ませ getItem を省く）。
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

  // 絶対 path の lazy ロード (needsPath = video 等のときのみ visible-mount で呼ばれる)。
  const ensurePath = useCallback(
    async (item: PoolItemSummary, knownLibArg?: string) => {
      if (pathCache.has(item.id)) return;
      const knownLib = knownLibArg ?? itemLibraryRef.current.get(item.id);
      const tryOrder = knownLib
        ? [knownLib, ...libraries.filter((l) => l !== knownLib)]
        : libraries;
      for (const lib of tryOrder) {
        try {
          const path = await getItemFilePath(lib, item.id);
          if (path) {
            itemLibraryRef.current.set(item.id, lib);
            setPathCache((prev) => new Map(prev).set(item.id, path));
            return;
          }
        } catch {
          // 別 library
        }
      }
    },
    [libraries, pathCache],
  );

  // カードが viewport に近づいた最初の 1 回だけ呼ばれる (useVisibleMount 経由)。
  // image/video のときだけ共有キャッシュにサムネ生成を依頼し、必要なら path も解決する。
  const handleItemVisible = useCallback(
    (item: PoolItemSummary) => {
      const startThumb = (full?: PoolItemFull) => {
        const type = (full?.item_type ?? item.item_type ?? "").toLowerCase();
        const tlib = itemLibraryRef.current.get(item.id);
        if (!tlib) return;
        if (needsPath && (type === "image" || type === "video")) {
          void ensurePath(item, tlib);
        }
        if (allowedItemTypeSet && type && !allowedItemTypeSet.has(type)) return;
        if (type !== "image" && type !== "video") return;
        void ensureThumb(tlib, item.id);
      };
      // material_type フィルタ時 or summary に item_type が無い検索 hit のみ full を取る。
      const needFull = !!allowedMaterialTypeSet || !item.item_type;
      if (needFull) {
        void ensureFull(item).then((full) => startThumb(full));
      } else {
        startThumb();
      }
    },
    [allowedItemTypeSet, allowedMaterialTypeSet, needsPath, ensureFull, ensurePath],
  );

  const displayItems = useMemo(
    () =>
      items.filter((item) => {
        const full = fullCache.get(item.id);
        if (!isAllowedItemType(item, full, allowedItemTypeSet)) return false;
        if (allowedMaterialTypeSet) {
          // full 未ロードのうちは暫定表示し、ロード後に非該当を除外する
          // （material_type は context_json にのみ存在し summary には無い）。
          if (!full) return true;
          const mt = getMaterialType(full.context_json);
          if (!mt) return false;
          return allowedMaterialTypeSet.has(mt);
        }
        return true;
      }),
    [items, fullCache, allowedItemTypeSet, allowedMaterialTypeSet],
  );

  /* ----- 素材操作 (click / drag) ----- */

  const handleClick = useCallback(
    (item: PoolItemSummary) => {
      const poolName = itemLibraryRef.current.get(item.id);
      const resolvedPath = pathCache.get(item.id);
      const thumbUrl = poolName ? getCachedThumb(poolName, item.id) : undefined;
      const url =
        thumbUrl ?? (resolvedPath ? convertFileSrc(resolvedPath) : "");
      const full = fullCache.get(item.id);
      onInsert({
        id: item.id,
        name: item.name,
        itemType: full?.item_type ?? item.item_type ?? "",
        url,
        pool: poolName,
      });
    },
    [fullCache, pathCache, onInsert],
  );

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, item: PoolItemSummary) => {
      const dragPoolName = itemLibraryRef.current.get(item.id);
      const url = dragPoolName ? getCachedThumb(dragPoolName, item.id) : undefined;
      if (!url) return;
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
    [extraDragMimes],
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

  /* ----- thumbnail grid renderer ----- */

  const gridClass =
    gridCols === 3 ? "grid grid-cols-3 gap-1.5" : "grid grid-cols-2 gap-1.5";

  const renderThumbGrid = (subset: PoolItemSummary[], emptyMessage: string) => {
    if (subset.length === 0) {
      return (
        <div className="text-[10px] text-muted-foreground px-1 py-2">
          {emptyMessage}
        </div>
      );
    }
    return (
      <div className={gridClass}>
        {subset.map((item) => {
          const poolName = itemLibraryRef.current.get(item.id);
          const full = fullCache.get(item.id);
          const effectiveType = (
            full?.item_type ??
            item.item_type ??
            ""
          ).toLowerCase();
          const thumbUrl = poolName
            ? getCachedThumb(poolName, item.id) ?? null
            : null;
          const generating = poolName
            ? isThumbGenerating(poolName, item.id)
            : false;
          const resolvedPath = pathCache.get(item.id) ?? null;
          return (
            <MaterialThumb
              key={item.id}
              item={item}
              thumbUrl={thumbUrl}
              generating={generating}
              effectiveType={effectiveType}
              resolvedPath={resolvedPath}
              onMount={() => handleItemVisible(item)}
              onClick={() => handleClick(item)}
              onDragStart={(e) => handleDragStart(e, item)}
              onItemPointerDown={
                onItemPointerDown
                  ? (e, rp) => {
                      if (!rp) return false;
                      const f = fullCache.get(item.id);
                      const url =
                        (poolName ? getCachedThumb(poolName, item.id) : null) ??
                        convertFileSrc(rp);
                      const pick: MaterialPick = {
                        id: item.id,
                        name: item.name,
                        itemType: f?.item_type ?? item.item_type ?? "",
                        url,
                        pool: poolName,
                      };
                      return onItemPointerDown(e, item, pick, rp);
                    }
                  : undefined
              }
              onContextMenu={
                onEditMaterial
                  ? (e) => {
                      e.preventDefault();
                      setCtxMenu({ x: e.clientX, y: e.clientY, item });
                    }
                  : undefined
              }
              renderItemOverlay={renderItemOverlay}
            />
          );
        })}
      </div>
    );
  };

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

      {/* 右クリック「編集」コンテキストメニュー（モーダルではない、RULES ルール 9/11 準拠） */}
      {ctxMenu && onEditMaterial && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu(null);
            }}
          />
          <div
            className="fixed z-50 min-w-28 overflow-hidden rounded-md border border-border bg-card py-1 shadow-lg"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
            role="menu"
          >
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center px-3 py-1.5 text-left text-xs text-foreground hover:bg-muted/60"
              onClick={() => {
                const item = ctxMenu.item;
                const full = fullCache.get(item.id);
                const mt = getMaterialType(full?.context_json ?? null);
                const pool = itemLibraryRef.current.get(item.id);
                setCtxMenu(null);
                onEditMaterial(item.id, mt, pool);
              }}
            >
              編集
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const MaterialThumb = memo(function MaterialThumb({
  item,
  thumbUrl,
  generating,
  effectiveType,
  resolvedPath,
  onMount,
  onClick,
  onDragStart,
  onItemPointerDown,
  onContextMenu,
  renderItemOverlay,
}: {
  item: PoolItemSummary;
  /** 共有キャッシュ解決済みサムネ URL (null = 生成失敗 / 未解決) */
  thumbUrl: string | null;
  /** サムネ生成中 (共有キャッシュの generating) */
  generating: boolean;
  /** full ?? summary 由来の item_type（小文字） */
  effectiveType: string;
  /** 絶対 path キャッシュ (consumer 向け、needsPath のときだけ埋まる) */
  resolvedPath: string | null;
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
  /** 右クリック時に呼ばれる（未指定なら既定のコンテキストメニュー抑制なし）。 */
  onContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** サムネ上のオーバーレイ ReactNode。未指定は何も描画しない */
  renderItemOverlay?: (item: PoolItemSummary) => ReactNode;
}) {
  // viewport に近づいたとき 1 回だけ onMount (= サムネ/ path ロード) を発火する。
  const mountRef = useVisibleMount(onMount);
  // HTML5 dragstart を一時抑制するための state (onItemPointerDown が true を返したとき)
  const [suppressDrag, setSuppressDrag] = useState(false);
  const isMedia = effectiveType === "image" || effectiveType === "video";

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!onItemPointerDown) return;
      // resolvedPath=null (ファイル未解決) のときは consumer DnD を開始できない。
      if (!resolvedPath) return;
      const consumed = onItemPointerDown(e, resolvedPath);
      if (consumed) {
        // HTML5 dragstart の同時発火を防ぐ
        e.preventDefault();
        setSuppressDrag(true);
      }
    },
    [onItemPointerDown, resolvedPath],
  );

  const handlePointerUp = useCallback(() => {
    if (suppressDrag) setSuppressDrag(false);
  }, [suppressDrag]);

  return (
    <div
      ref={mountRef}
      role="button"
      tabIndex={0}
      // draggable: thumb 未解決は false。onItemPointerDown が true を返したときも false に
      draggable={!!thumbUrl && !suppressDrag}
      onDragStart={onDragStart}
      onPointerDown={onItemPointerDown ? handlePointerDown : undefined}
      onPointerUp={onItemPointerDown ? handlePointerUp : undefined}
      onContextMenu={onContextMenu}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="aspect-square rounded border border-border bg-muted/40 overflow-hidden cursor-pointer hover:border-primary transition relative"
      style={MATERIAL_CARD_DEFER_STYLE}
      title={item.name}
    >
      {/* WKWebView perf: thumb は <img> ではなく CSS background-image で描画する。<img>(replaced
          element) のデコード/ラスタが「ドキュメント全体のフレーム作業」に引き込まれ、無関係な
          パネルリサイズ等の毎フレームで再デコードされてアプリ全体がカクつくため（ContextSlotPanel
          と同方針）。 */}
      {thumbUrl && isMedia ? (
        <span
          aria-hidden="true"
          className="block w-full h-full"
          style={{
            backgroundImage: `url(${JSON.stringify(thumbUrl)})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        />
      ) : generating && isMedia ? (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground/50" />
        </div>
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
// 自分の item の thumb/generating/type/path と overlay が変わったときだけ再レンダする。
// コールバック類 (onMount/onClick/onDragStart/onItemPointerDown) は親 renderThumbGrid
// で毎レンダ新規生成されるため比較から除外する。各サムネは自分の表示値が変わったとき
// だけ再レンダして最新クロージャを取り込むので stale closure は無害。
(prev, next) =>
  prev.item === next.item &&
  prev.thumbUrl === next.thumbUrl &&
  prev.generating === next.generating &&
  prev.effectiveType === next.effectiveType &&
  prev.resolvedPath === next.resolvedPath &&
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
