/**
 * WorkPool 素材パネル（旧 ContextSlotPanel、HUB-086）
 *
 * studio-left-panel-modes-2026-05-30.md §2 の制作素材。この Work の素材 + WIP の保管庫。
 *
 * 2 モード:
 *   - **永続モード**（workId && variantId が揃う）: pool-impl の slot_entries に読み書き。
 *     D&D で Pool 素材を投入 → `slot_add_entry` / 分類変更 → `slot_promote_entry` /
 *     削除 → `slot_remove_entry` / 読込 → `slot_list_entries`（view = name/analyzed 同梱）。
 *     素材名・分析状態は freeze-safe な JOIN view から取得（getItem を通さない）。
 *   - **モックモード**（workId / variantId 未指定）: 従来の in-memory 挙動。skeleton 確認用。
 *
 * Phase 1 配線済み（AKARI-HUB-086 §9 Phase 1）:
 *   - role 割当 / 分類変更 → `slot_entries.role`（misc 由来は promoted_from 記録）
 *   - 分析状態          → 参照 Pool item の `analyzed_at`（view の asset_analyzed_at）
 *   - 素材名            → 参照 Pool item の `name`（view の asset_name）
 *
 * Phase 1.x 実装済み（2026-05-30）:
 *   - JPEG サムネ遅延ロード（getItemThumbnail → convertFileSrc、freeze-safe ADR-100 準拠）
 *   - 「分析」ボタンの実トリガ（analyzeItem 呼び出し + 進捗 busy 表示 + 完了後 reload）
 *
 * Phase 2 残:
 *   - 「+追加」のソース選択（ローカル OS dialog / Pool・Library 検索パネル）の実装
 *
 * 関連: spec `akari-os/docs/sdd/specs/spec-slot-and-work-context-schema.md` §2 / §9 Phase 1
 *       design `akari-os/docs/design/studio-left-panel-modes-2026-05-30.md` §2
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, MouseEvent as ReactMouseEvent, PointerEvent, ReactNode } from "react";
import {
  Plus,
  Sparkles,
  X,
  Trash2,
  FileImage,
  Loader2,
  ListFilter,
  LayoutGrid,
  List,
  Grid3x3,
  ChevronDown,
  ChevronRight,
  Music,
} from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { SLOT_ROLE_LABELS, ALL_SLOT_ROLES, type SlotRole } from "@akari-os/sdk/slot";
import {
  listItems,
  slotListEntries,
  slotAddEntry,
  slotRemoveEntry,
  getItemThumbnail,
  analyzeItem,
  type PoolItemSummary,
} from "@akari-os/sdk/pool";

// ADR-108 Wave2: 全 SlotRole は @akari-os/sdk/slot の ALL_SLOT_ROLES が SSOT（手動再列挙を廃止）。

function inferDefaultSlotRole(item: PoolItemSummary): SlotRole {
  const type = (item.item_type ?? "").toLowerCase();
  if (type === "video" || type === "image") return "main-track";
  if (type === "audio") return "bgm";
  if (type === "text" || type === "note" || type === "url" || type === "pdf") {
    return "reference";
  }
  return "misc";
}

/** ソース選択の 2 種別（モックモード: モックエントリを追加） */
type AddSource = "local" | "pool";

/** ソース別のラベル・説明 */
const ADD_SOURCE_META: Record<
  AddSource,
  { label: string; desc: string; prefix: string }
> = {
  local: {
    label: "ローカルから取込",
    desc: "ファイルを Pool item 化",
    prefix: "ローカル素材",
  },
  pool: {
    label: "Pool から",
    desc: "自分の既存素材を選ぶ",
    prefix: "Pool 素材",
  },
};

/** 表示用エントリ（永続 view / モックの共通形） */
interface DisplayEntry {
  /** 永続モード = slot_entries.id / モード = ローカル連番 */
  id: string;
  label: string;
  role: SlotRole;
  itemType: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  position: number;
  /** コンテキスト分析済みか（永続: 参照 Pool item の analyzed_at != null） */
  analyzed: boolean;
  /** 参照 Pool item の ID（永続: slot_entries.asset_id / モック: null） */
  assetId: string | null;
  /** 表示元 Pool。未指定なら WorkPool 自身。 */
  sourceLibrary?: string | null;
  /** 表示元セクション名。親元ドメインなど、WorkPool 外の素材に使う。 */
  sourceLabel?: string;
  /** true の場合は WorkPool slot からの削除を出さない。 */
  readonly?: boolean;
}

const AKARI_POOL_ITEM_MIME = "application/x-akari-pool-item";
const FALLBACK_POOL_LIBRARY = "akari-uploads";

type MaterialStatusFilter = "all" | "analyzed" | "unanalyzed";
type MaterialSortMode = "added-desc" | "added-asc" | "name-asc" | "analysis";
type MaterialViewMode = "grid" | "compact" | "list";
type AnalyzeMode = "api" | "local" | "markitdown";

interface EntryContextMenuState {
  x: number;
  y: number;
  entry: DisplayEntry;
}

export interface RelatedPoolSection {
  library: string;
  label: string;
  kind?: "domain" | "brand" | "related";
}

function relatedSectionTitle(section: RelatedPoolSection): string {
  if (section.kind === "brand") return `親元ブランド: ${section.label}`;
  if (section.kind === "domain") return `親元ドメイン: ${section.label}`;
  return section.label;
}

function formatItemType(type: string | null): string {
  if (!type) return "素材";
  if (type === "image") return "画像";
  if (type === "video") return "動画";
  if (type === "audio") return "音声";
  if (type === "pdf") return "PDF";
  if (type === "text") return "テキスト";
  if (type === "note") return "ノート";
  if (type === "url") return "URL";
  return type;
}

function displayNameWithoutPath(name: string): string {
  return name.split(/[\\/]/).pop() ?? name;
}

function entryLibrary(entry: DisplayEntry, fallbackLibrary: string | null): string {
  return entry.sourceLibrary ?? fallbackLibrary ?? FALLBACK_POOL_LIBRARY;
}

function entryKey(entry: DisplayEntry, fallbackLibrary: string | null): string {
  return `${entryLibrary(entry, fallbackLibrary)}:${entry.assetId ?? entry.id}`;
}

function thumbCacheKey(library: string, assetId: string): string {
  return `${library}:${assetId}`;
}

function filterLabel(
  statusFilter: MaterialStatusFilter,
  roleFilter: SlotRole | null,
  typeFilter: string | null,
  sortMode: MaterialSortMode,
): string {
  const parts = [
    statusFilter === "all"
      ? null
      : statusFilter === "analyzed"
        ? "分析済み"
        : "未分析",
    roleFilter ? SLOT_ROLE_LABELS[roleFilter] : null,
    typeFilter ? formatItemType(typeFilter === "unknown" ? null : typeFilter) : null,
  ].filter(Boolean);
  const base = parts.length > 0 ? parts.join(" + ") : "すべて";
  const sort =
    sortMode === "added-desc"
      ? "追加順↓"
      : sortMode === "added-asc"
        ? "追加順↑"
        : sortMode === "name-asc"
          ? "名前順"
          : "分析順";
  return `${base} / ${sort}`;
}

export interface ContextSlotPanelProps {
  workId?: string;
  variantId?: string;
  /** 素材が属する Pool 名。未指定なら current Pool に fallback（pool-impl 側） */
  library?: string | null;
  /**
   * 「＋追加 → Pool から」で表示する Pool ピッカーをアプリ（video 等）が注入する。
   * ここでは単一素材選択のモーダル内コンテンツとして描画する。
   * 未指定なら「Pool から」選択肢は出さない。
   */
  renderPoolPicker?: (args: { onClose: () => void; defaultRole: SlotRole }) => ReactNode;
  /**
   * 制作素材一覧の各エントリ行の PointerDown イベントコールバック。
   * タイムラインへの pointer-drag（D&D）起点として video 側が利用する。
   * assetId がある（Pool 参照行）場合のみ呼ばれる。未指定なら pointer-drag は出さない。
   */
  onEntryPointerDown?: (
    assetId: string,
    e: PointerEvent<HTMLElement>,
    library?: string | null,
  ) => void;
  /** 制作素材カードのクリック選択。Preview / Inspector の source 切替に使う。 */
  onEntryClick?: (assetId: string, library?: string | null) => void;
  /**
   * 制作素材の分析リクエスト。
   * 指定された場合は内蔵の簡易分析ダイアログを出さず、親アプリ側に処理を委譲する。
   */
  onRequestEntryAnalyze?: (assetId: string, library?: string | null) => void;
  /**
   * 「＋追加 → ローカルから」クリック時のハンドラ。
   * 呼び出し後に自動で reload する。未指定なら「ローカルから」選択肢は出さない。
   */
  onAddFromLocal?: (role: SlotRole) => Promise<void>;
  /**
   * 表示する分類フィルター。未指定時は全 SlotRole を出す。
   * Video など app ごとの既定 slot だけを見せる用途。
   */
  visibleRoles?: readonly SlotRole[];
  /** WorkPool 本体とは別枠で表示する関連 Pool。例: 親元ドメイン Pool。 */
  relatedPoolSections?: readonly RelatedPoolSection[];
}

export function ContextSlotPanel({
  workId,
  variantId,
  library,
  renderPoolPicker,
  onEntryPointerDown,
  onEntryClick,
  onRequestEntryAnalyze,
  onAddFromLocal,
  visibleRoles,
  relatedPoolSections,
}: ContextSlotPanelProps) {
  /** 永続モード = Work / Variant が確定しているとき */
  const bound = !!(workId && variantId);
  const lib = library ?? null;

  const [entries, setEntries] = useState<DisplayEntry[]>([]);
  const [relatedEntries, setRelatedEntries] = useState<DisplayEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<MaterialStatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<SlotRole | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<MaterialSortMode>("added-desc");
  const [viewMode, setViewMode] = useState<MaterialViewMode>("grid");
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(() => new Set());
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  const [entryContextMenu, setEntryContextMenu] = useState<EntryContextMenuState | null>(null);
  const [analysisDialogEntry, setAnalysisDialogEntry] = useState<DisplayEntry | null>(null);
  /** ソース選択パネルの開閉（true = 展開中） */
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  /**
   * `${library}:${assetId}` → サムネ URL（convertFileSrc 変換済み）。
   * getItemThumbnail で取得した JPEG パスを convertFileSrc で変換して保持。
   * freeze-safe: 実動画 URL は渡さない（ADR-100 遵守）。
   */
  const [thumbCache, setThumbCache] = useState<Map<string, string>>(new Map());
  /**
   * サムネ取得中の `${library}:${assetId}` セット（重複リクエスト防止）。
   * useRef で保持し setState を呼ばない（再レンダ不要）。
   */
  const thumbFetchingRef = useRef<Set<string>>(new Set());
  /**
   * 分析中の entryId セット（ボタン busy 表示用）。
   */
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  /**
   * Pool ピッカーのモーダル開閉。null = 一覧表示。
   */
  const [pickerMode, setPickerMode] = useState<"pool" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const filterPopoverRef = useRef<HTMLDivElement | null>(null);
  const roleFilterOptions = useMemo(
    () => (visibleRoles && visibleRoles.length > 0 ? [...visibleRoles] : ALL_SLOT_ROLES),
    [visibleRoles],
  );
  const normalizedRelatedSections = useMemo(() => {
    const seen = new Set<string>();
    const sections: RelatedPoolSection[] = [];
    for (const section of relatedPoolSections ?? []) {
      if (!section.library || section.library === lib || seen.has(section.library)) continue;
      seen.add(section.library);
      sections.push({
        library: section.library,
        label: section.label || section.library,
        kind: section.kind ?? "related",
      });
    }
    return sections;
  }, [relatedPoolSections, lib]);

  useEffect(() => {
    if (roleFilter && !roleFilterOptions.includes(roleFilter)) {
      setRoleFilter(null);
    }
  }, [roleFilter, roleFilterOptions]);

  useEffect(() => {
    if (!entryContextMenu) return;
    const onClick = () => setEntryContextMenu(null);
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setEntryContextMenu(null);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [entryContextMenu]);

  useEffect(() => {
    if (!filterPopoverOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (filterPopoverRef.current?.contains(e.target as Node | null)) return;
      setFilterPopoverOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFilterPopoverOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [filterPopoverOpen]);

  useEffect(() => {
    if (!selectedEntryKey) return;
    const allEntries = [...entries, ...relatedEntries];
    if (!allEntries.some((entry) => entryKey(entry, lib) === selectedEntryKey)) {
      setSelectedEntryKey(null);
    }
  }, [entries, relatedEntries, lib, selectedEntryKey]);

  // --- 永続モード: backend から読み込み ---
  const reload = useCallback(async () => {
    if (!bound) return;
    try {
      let views = await slotListEntries(lib, workId!, variantId!);
      let poolItemMap = new Map<string, PoolItemSummary>();
      if (lib) {
        const existingAssetIds = new Set(
          views.map((v) => v.asset_id).filter((id): id is string => Boolean(id)),
        );
        const poolItems = await listItems(lib, {
          sortBy: "updated_at",
          sortOrder: "desc",
          limit: 500,
        }).catch((e) => {
          console.warn("[制作素材] pool item auto-sync 失敗", e);
          return [] as PoolItemSummary[];
        });
        poolItemMap = new Map(poolItems.map((item) => [item.id, item]));
        const missing = poolItems.filter(
          (item) => !item.archived_at && !existingAssetIds.has(item.id),
        );
        if (missing.length > 0) {
          for (const item of missing) {
            try {
              await slotAddEntry(lib, {
                workId: workId!,
                variantId: variantId!,
                role: inferDefaultSlotRole(item),
                assetId: item.id,
              });
            } catch (e) {
              console.warn("[制作素材] pool item auto-slot 失敗", item.id, e);
            }
          }
          views = await slotListEntries(lib, workId!, variantId!);
        }
      }
      setEntries(
        views.map((v) => ({
          id: v.id,
          label: v.asset_name ?? v.external_url ?? "(無題)",
          role: v.role,
          itemType: v.asset_id ? (poolItemMap.get(v.asset_id)?.item_type ?? null) : null,
          createdAt: v.created_at ?? null,
          updatedAt: v.updated_at ?? null,
          position: v.position,
          analyzed: v.asset_analyzed_at != null,
          assetId: v.asset_id,
          sourceLibrary: lib,
        })),
      );
      setError(null);
    } catch (e) {
      console.warn("[制作素材] slot_list_entries 失敗", e);
      setError("素材の読み込みに失敗しました");
    }
  }, [bound, lib, workId, variantId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const reloadRelated = useCallback(async () => {
    if (normalizedRelatedSections.length === 0) {
      setRelatedEntries([]);
      return;
    }
    try {
      const groups = await Promise.all(
        normalizedRelatedSections.map(async (section) => {
          const items = await listItems(section.library, {
            sortBy: "updated_at",
            sortOrder: "desc",
            limit: 500,
          });
          return items
            .filter((item) => !item.archived_at)
            .map((item, index): DisplayEntry => ({
              id: `${section.library}:${item.id}`,
              label: item.name ?? "(無題)",
              role: inferDefaultSlotRole(item),
              itemType: item.item_type ?? null,
              createdAt: item.created_at ?? null,
              updatedAt: item.updated_at ?? null,
              position: index,
              analyzed: item.analyzed_at != null,
              assetId: item.id,
              sourceLibrary: section.library,
              sourceLabel: section.label,
              readonly: true,
            }));
        }),
      );
      setRelatedEntries(groups.flat());
    } catch (e) {
      console.warn("[制作素材] related pool load 失敗", e);
    }
  }, [normalizedRelatedSections]);

  useEffect(() => {
    void reloadRelated();
  }, [reloadRelated]);

  useEffect(() => {
    if (!bound) return;
    const onAnalyzeComplete = (event: Event) => {
      const detail = (event as CustomEvent<{ library?: string | null; itemId?: string | null }>).detail;
      const mainLibrary = lib ?? FALLBACK_POOL_LIBRARY;
      if (detail?.library && detail.library === mainLibrary) {
        void reload();
        return;
      }
      if (
        detail?.library &&
        normalizedRelatedSections.some((section) => section.library === detail.library)
      ) {
        void reloadRelated();
        return;
      }
      if (!detail?.library) {
        void reload();
        void reloadRelated();
      }
    };
    window.addEventListener("akari:pool-analyze-complete", onAnalyzeComplete);
    return () => window.removeEventListener("akari:pool-analyze-complete", onAnalyzeComplete);
  }, [bound, lib, normalizedRelatedSections, reload, reloadRelated]);

  /** モックモード: in-memory にエントリ追加 */
  const addMockEntry = useCallback((role: SlotRole, label: string) => {
    setEntries((prev) => [
      ...prev,
      {
        id: `e${prev.length + 1}`,
        label,
        role,
        itemType: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        position: prev.length,
        analyzed: false,
        assetId: null,
      },
    ]);
  }, []);

  /** D&D / 追加経路で素材を投入（永続 = slot_add_entry / モック = in-memory） */
  const addAsset = useCallback(
    async (role: SlotRole, label: string, assetId: string | null) => {
      if (!bound) {
        addMockEntry(role, label);
        return;
      }
      // 永続モードは asset 参照が必須（label だけのエントリは持たない）
      if (!assetId) {
        console.info("[制作素材] Pool 素材を D&D してください（label のみは非対応）");
        return;
      }
      try {
        await slotAddEntry(lib, {
          workId: workId!,
          variantId: variantId!,
          role,
          assetId,
        });
        await reload();
      } catch (e) {
        console.warn("[制作素材] slot_add_entry 失敗", e);
        setError("素材の追加に失敗しました");
      }
    },
    [bound, lib, workId, variantId, addMockEntry, reload],
  );

  /** エントリ削除（永続 = slot_remove_entry / モック = in-memory） */
  const removeEntry = useCallback(
    async (id: string) => {
      if (!bound) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        return;
      }
      try {
        await slotRemoveEntry(lib, id);
        await reload();
      } catch (e) {
        console.warn("[制作素材] slot_remove_entry 失敗", e);
        setError("素材の削除に失敗しました");
      }
    },
    [bound, lib, reload],
  );

  /** モックモード: 分析済みフラグをトグル（永続モードでは display-only） */
  const analyzeMock = useCallback((id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, analyzed: true } : e)),
    );
  }, []);

  /**
   * assetId に対して JPEG サムネを遅延取得してキャッシュ。
   * freeze-safe: getItemThumbnail → convertFileSrc を使い、実動画 URL は渡さない（ADR-100）。
   * assetId が null / 既にキャッシュ済み / 取得中 の場合は即 return。
   * library が未確定なら lib を null として pool-impl 側の current Pool fallback に委ねる。
   */
  const fetchThumb = useCallback(
    async (assetId: string, sourceLibrary?: string | null) => {
      const targetLibrary = sourceLibrary ?? lib ?? FALLBACK_POOL_LIBRARY;
      const cacheKey = thumbCacheKey(targetLibrary, assetId);
      if (thumbCache.has(cacheKey)) return;
      if (thumbFetchingRef.current.has(cacheKey)) return;
      thumbFetchingRef.current.add(cacheKey);
      try {
        // lib が null の場合 pool-impl は current Pool にフォールバックする
        const thumbPath = await getItemThumbnail(targetLibrary, assetId).catch(() => null);
        if (thumbPath) {
          const url = convertFileSrc(thumbPath);
          setThumbCache((prev) => new Map(prev).set(cacheKey, url));
        }
      } finally {
        thumbFetchingRef.current.delete(cacheKey);
      }
    },
    [lib, thumbCache],
  );

  const analyzeEntry = useCallback(
    async (
      entryId: string,
      assetId: string,
      mode?: AnalyzeMode,
      sourceLibrary?: string | null,
    ) => {
      setAnalyzingIds((prev) => new Set(prev).add(entryId));
      try {
        await analyzeItem(sourceLibrary ?? lib ?? FALLBACK_POOL_LIBRARY, assetId, mode);
        await reload();
        await reloadRelated();
      } catch (e) {
        console.warn("[制作素材] analyzeItem 失敗", e);
        setError("分析に失敗しました");
      } finally {
        setAnalyzingIds((prev) => {
          const next = new Set(prev);
          next.delete(entryId);
          return next;
        });
      }
    },
    [lib, reload, reloadRelated],
  );

  const handleDrop = useCallback(
    (role: SlotRole, e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      setDropActive(false);
      // Pool item（MaterialPanel / VideoMaterialPanel が載せる JSON）優先
      let label = "素材";
      let assetId: string | null = null;
      const raw = e.dataTransfer.getData(AKARI_POOL_ITEM_MIME);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as {
            name?: string;
            id?: string;
            itemId?: string;
            assetId?: string;
          };
          if (parsed.name) label = parsed.name;
          assetId = parsed.id ?? parsed.itemId ?? parsed.assetId ?? null;
        } catch {
          /* noop: 不正 JSON は default */
        }
      } else {
        const text = e.dataTransfer.getData("text/plain");
        if (text) label = text;
      }
      void addAsset(role, label, assetId);
    },
    [addAsset],
  );

  const handleShelfDragOver = useCallback((e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDropActive(true);
  }, []);

  const handleShelfDragLeave = useCallback((e: DragEvent<HTMLElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDropActive(false);
  }, []);

  const handleCardContextMenu = useCallback(
    (entry: DisplayEntry, e: ReactMouseEvent<HTMLElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setEntryContextMenu({ x: e.clientX, y: e.clientY, entry });
    },
    [],
  );

  const requestAnalyze = useCallback(
    (entry: DisplayEntry) => {
      if (entry.assetId && onRequestEntryAnalyze) {
        onRequestEntryAnalyze(entry.assetId, entryLibrary(entry, lib));
        return;
      }
      setAnalysisDialogEntry(entry);
    },
    [lib, onRequestEntryAnalyze],
  );

  /** モックモード: ソース選択から素材を追加 */
  const handleAddFromSource = useCallback(
    (source: AddSource) => {
      const addRole: SlotRole = roleFilter ?? "misc";
      const { prefix } = ADD_SOURCE_META[source];
      setEntries((prev) => {
        const next = prev.length + 1;
        return [
          ...prev,
          {
            id: `e${next}`,
            label: `${prefix} ${next}`,
            role: addRole,
            itemType: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            position: prev.length,
            analyzed: false,
            assetId: null,
          },
        ];
      });
    },
    [roleFilter],
  );

  const typeFilterOptions = useMemo(() => {
    const types = new Set<string>();
    for (const e of [...entries, ...relatedEntries]) types.add(e.itemType ?? "unknown");
    return Array.from(types);
  }, [entries, relatedEntries]);

  const filterAndSortEntries = useCallback(
    (sourceEntries: DisplayEntry[]) => {
      const filtered = sourceEntries.filter((entry) => {
        if (statusFilter === "analyzed" && !entry.analyzed) return false;
        if (statusFilter === "unanalyzed" && entry.analyzed) return false;
        if (roleFilter && entry.role !== roleFilter) return false;
        if (typeFilter && (entry.itemType ?? "unknown") !== typeFilter) return false;
        return true;
      });
      return [...filtered].sort((a, b) => {
        if (sortMode === "name-asc") {
          return a.label.localeCompare(b.label, "ja");
        }
        if (sortMode === "analysis") {
          if (a.analyzed !== b.analyzed) return a.analyzed ? -1 : 1;
        }
        const aTime = Date.parse(a.createdAt ?? "") || a.position;
        const bTime = Date.parse(b.createdAt ?? "") || b.position;
        return sortMode === "added-asc" ? aTime - bTime : bTime - aTime;
      });
    },
    [roleFilter, sortMode, statusFilter, typeFilter],
  );

  const visibleWorkEntries = useMemo(
    () => filterAndSortEntries(entries),
    [entries, filterAndSortEntries],
  );
  const visibleRelatedSections = useMemo(
    () =>
      normalizedRelatedSections.map((section) => ({
        ...section,
        entries: filterAndSortEntries(
          relatedEntries.filter((entry) => entry.sourceLibrary === section.library),
        ),
      })),
    [filterAndSortEntries, normalizedRelatedSections, relatedEntries],
  );

  const addRole: SlotRole = roleFilter ?? "misc";
  const addRoleLabel = SLOT_ROLE_LABELS[addRole];
  const hasRoleFilter = roleFilter != null;
  const activeFilterLabel = filterLabel(statusFilter, roleFilter, typeFilter, sortMode);

  const closePicker = useCallback(() => {
    setPickerMode(null);
    void reload();
  }, [reload]);

  const toggleSectionCollapsed = useCallback((sectionId: string) => {
    setCollapsedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const renderMaterialSection = ({
    sectionId,
    title,
    entries: sectionEntries,
    totalCount,
    readonly,
  }: {
    sectionId: string;
    title: string;
    entries: DisplayEntry[];
    totalCount: number;
    readonly?: boolean;
  }) => {
    const empty = sectionEntries.length === 0;
    const collapsed = collapsedSectionIds.has(sectionId);
    return (
      <section className="flex flex-col gap-1">
        <button
          type="button"
          className="flex min-w-0 items-center justify-between gap-1 rounded px-0.5 py-0.5 text-left hover:bg-muted/50"
          onClick={() => toggleSectionCollapsed(sectionId)}
          title={collapsed ? `${title} を開く` : `${title} を閉じる`}
        >
          <div className="flex min-w-0 items-center gap-1">
            {collapsed ? (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <div className="truncate text-[10px] font-medium text-foreground" title={title}>
              {title}
            </div>
          </div>
          <div className="shrink-0 text-[9px] text-muted-foreground">
            {sectionEntries.length}/{totalCount}
          </div>
        </button>
        {!collapsed && (
          <div
            className={`min-h-[80px] rounded p-1 transition ${
              !readonly && dropActive
                ? "border border-dashed border-primary/60 bg-primary/5"
                : empty
                  ? "border border-dashed border-border"
                  : "border border-transparent"
            }`}
            onDragOver={readonly ? undefined : handleShelfDragOver}
            onDragLeave={readonly ? undefined : handleShelfDragLeave}
            onDrop={readonly ? undefined : (e) => handleDrop(addRole, e)}
          >
            {empty ? (
              <div className="text-center py-5 text-[9px] text-muted-foreground/70">
                {readonly
                  ? "該当する素材はありません"
                  : `ここに素材を D&D${hasRoleFilter ? `（${addRoleLabel} に分類）` : ""}`}
              </div>
            ) : (
              <div
                className={
                  viewMode === "grid"
                    ? "grid grid-cols-3 gap-1"
                    : viewMode === "compact"
                      ? "grid justify-items-center gap-x-1.5 gap-y-2"
                      : "flex flex-col gap-1"
                }
                style={
                  viewMode === "compact"
                    ? { gridTemplateColumns: "repeat(auto-fill, minmax(3.75rem, 1fr))" }
                    : undefined
                }
              >
                {sectionEntries.map((entry) => {
                  const sourceLibrary = entryLibrary(entry, lib);
                  const selectedKey = entryKey(entry, lib);
                  const commonProps = {
                    entry,
                    thumbUrl: entry.assetId
                      ? (thumbCache.get(thumbCacheKey(sourceLibrary, entry.assetId)) ?? null)
                      : null,
                    isAnalyzing: analyzingIds.has(entry.id),
                    selected: selectedKey === selectedEntryKey,
                    onPointerDown:
                      onEntryPointerDown && entry.assetId
                        ? (e: PointerEvent<HTMLElement>) =>
                            onEntryPointerDown(entry.assetId!, e, sourceLibrary)
                        : undefined,
                    onClick: entry.assetId
                      ? () => {
                          setSelectedEntryKey(selectedKey);
                          onEntryClick?.(entry.assetId!, sourceLibrary);
                        }
                      : undefined,
                    onContextMenu: (e: ReactMouseEvent<HTMLElement>) =>
                      handleCardContextMenu(entry, e),
                    onMount: entry.assetId
                      ? () => void fetchThumb(entry.assetId!, sourceLibrary)
                      : undefined,
                  };
                  if (viewMode === "grid") return <MaterialCard key={entry.id} {...commonProps} />;
                  if (viewMode === "compact") {
                    return <MaterialCompactIcon key={entry.id} {...commonProps} />;
                  }
                  return <MaterialListRow key={entry.id} {...commonProps} />;
                })}
              </div>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-1 text-[9px] text-destructive">
          {error}
        </div>
      )}

      <div
        className="flex items-center gap-1.5"
        onDragOver={handleShelfDragOver}
        onDragLeave={handleShelfDragLeave}
        onDrop={(e) => handleDrop(addRole, e)}
      >
        <div ref={filterPopoverRef} className="relative min-w-0 flex-1">
          <button
            type="button"
            className={`flex w-full min-w-0 items-center gap-1 rounded border px-1.5 py-1 text-left text-[10px] transition ${
              filterPopoverOpen
                ? "border-primary bg-primary/5 text-primary"
                : "border-border bg-muted/30 text-muted-foreground hover:border-primary hover:text-primary"
            }`}
            onClick={() => setFilterPopoverOpen((v) => !v)}
            title="表示条件"
          >
            <ListFilter className="h-3 w-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{activeFilterLabel}</span>
          </button>

          {filterPopoverOpen && (
            <div className="absolute left-0 top-[calc(100%+4px)] z-[260] w-[min(360px,78vw)] rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-[11px] font-medium">表示条件</div>
                <button
                  type="button"
                  className="rounded px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    setStatusFilter("all");
                    setRoleFilter(null);
                    setTypeFilter(null);
                    setSortMode("added-desc");
                  }}
                >
                  リセット
                </button>
              </div>

              <div className="space-y-2">
                <FilterGroup label="状態">
                  {(
                    [
                      ["all", "すべて"],
                      ["unanalyzed", "未分析"],
                      ["analyzed", "分析済み"],
                    ] as const
                  ).map(([value, label]) => (
                    <FilterChip
                      key={value}
                      active={statusFilter === value}
                      label={label}
                      onClick={() => setStatusFilter(value)}
                    />
                  ))}
                </FilterGroup>

                <FilterGroup label="分類">
                  <FilterChip
                    active={roleFilter == null}
                    label="すべて"
                    onClick={() => setRoleFilter(null)}
                  />
                  {roleFilterOptions.map((role) => (
                    <FilterChip
                      key={role}
                      active={roleFilter === role}
                      label={SLOT_ROLE_LABELS[role]}
                      onClick={() => setRoleFilter(role)}
                    />
                  ))}
                </FilterGroup>

                <FilterGroup label="種別">
                  <FilterChip
                    active={typeFilter == null}
                    label="すべて"
                    onClick={() => setTypeFilter(null)}
                  />
                  {typeFilterOptions.map((type) => (
                    <FilterChip
                      key={type}
                      active={typeFilter === type}
                      label={formatItemType(type === "unknown" ? null : type)}
                      onClick={() => setTypeFilter(type)}
                    />
                  ))}
                </FilterGroup>

                <FilterGroup label="並び順">
                  {(
                    [
                      ["added-desc", "追加順↓"],
                      ["added-asc", "追加順↑"],
                      ["name-asc", "名前順"],
                      ["analysis", "分析順"],
                    ] as const
                  ).map(([value, label]) => (
                    <FilterChip
                      key={value}
                      active={sortMode === value}
                      label={label}
                      onClick={() => setSortMode(value)}
                    />
                  ))}
                </FilterGroup>
              </div>
            </div>
          )}
        </div>
        <div className="flex shrink-0 overflow-hidden rounded border border-border bg-muted/20">
          <button
            type="button"
            className={`flex h-6 w-6 items-center justify-center transition ${
              viewMode === "grid"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="カード表示"
            aria-label="カード表示"
            onClick={() => setViewMode("grid")}
          >
            <LayoutGrid className="h-3 w-3" />
          </button>
          <button
            type="button"
            className={`flex h-6 w-6 items-center justify-center border-l border-border transition ${
              viewMode === "compact"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="コンパクト表示"
            aria-label="コンパクト表示"
            onClick={() => setViewMode("compact")}
          >
            <Grid3x3 className="h-3 w-3" />
          </button>
          <button
            type="button"
            className={`flex h-6 w-6 items-center justify-center border-l border-border transition ${
              viewMode === "list"
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="リスト表示"
            aria-label="リスト表示"
            onClick={() => setViewMode("list")}
          >
            <List className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* 追加経路（永続モード）: ＋追加 → ローカル取込 / Pool から選択 */}
      {bound ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className={`self-end flex h-6 w-6 items-center justify-center rounded-full border text-[10px] shadow-sm transition ${
              sourcePickerOpen
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:text-primary hover:border-primary"
            }`}
            title={sourcePickerOpen ? "閉じる" : "追加"}
            aria-label={sourcePickerOpen ? "閉じる" : "追加"}
            onClick={() => setSourcePickerOpen((v) => !v)}
          >
            {sourcePickerOpen ? (
              <X className="w-3 h-3" />
            ) : (
              <Plus className="w-3 h-3" />
            )}
          </button>

          {sourcePickerOpen && (
            <div className="flex flex-col gap-0.5 rounded border border-border bg-muted/30 p-1.5">
              {onAddFromLocal ? (
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-[10px] text-muted-foreground hover:bg-muted hover:text-primary transition"
                  onClick={async () => {
                    setSourcePickerOpen(false);
                    await onAddFromLocal(addRole);
                    await reload();
                  }}
                >
                  <Plus className="w-3 h-3 shrink-0" />
                  <span className="font-medium">ローカルから取込</span>
                </button>
              ) : null}
              {renderPoolPicker ? (
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded px-1.5 py-1 text-left text-[10px] text-muted-foreground hover:bg-muted hover:text-primary transition"
                  onClick={() => {
                    setSourcePickerOpen(false);
                    setPickerMode("pool");
                  }}
                >
                  <Plus className="w-3 h-3 shrink-0" />
                  <span className="font-medium">Pool から</span>
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className={`self-end flex h-6 w-6 items-center justify-center rounded-full border text-[10px] shadow-sm transition ${
              sourcePickerOpen
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:text-primary hover:border-primary"
            }`}
            title={sourcePickerOpen ? "閉じる" : "追加"}
            aria-label={sourcePickerOpen ? "閉じる" : "追加"}
            onClick={() => setSourcePickerOpen((v) => !v)}
          >
            {sourcePickerOpen ? (
              <X className="w-3 h-3" />
            ) : (
              <Plus className="w-3 h-3" />
            )}
          </button>

          {sourcePickerOpen && (
            <div className="flex flex-col gap-0.5 rounded border border-border bg-muted/30 p-1.5">
              <div className="text-[9px] text-muted-foreground/70 mb-0.5">
                追加するソースを選択
                {hasRoleFilter ? `（${addRoleLabel} に分類）` : ""}
              </div>
              {(
                Object.entries(ADD_SOURCE_META) as [
                  AddSource,
                  (typeof ADD_SOURCE_META)[AddSource],
                ][]
              ).map(([source, meta]) => (
                <button
                  key={source}
                  type="button"
                  className="flex items-start gap-1.5 rounded px-1.5 py-1 text-left text-[10px] text-muted-foreground hover:bg-muted hover:text-primary transition"
                  onClick={() => handleAddFromSource(source)}
                >
                  <Plus className="w-3 h-3 mt-0.5 shrink-0" />
                  <span className="flex flex-col">
                    <span className="font-medium">{meta.label}</span>
                    <span className="text-[9px] text-muted-foreground/60">
                      {meta.desc}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 素材棚: WorkPool を優先表示し、関連 Pool は別セクションで続ける。 */}
      <div className="flex flex-col gap-2">
        {renderMaterialSection({
          sectionId: "workpool",
          title: "ワークプール",
          entries: visibleWorkEntries,
          totalCount: entries.length,
        })}
        {visibleRelatedSections.map((section) => (
          <div key={section.library} className="border-t border-border/70 pt-2">
            {renderMaterialSection({
              sectionId: `related:${section.library}`,
              title: relatedSectionTitle(section),
              entries: section.entries,
              totalCount: relatedEntries.filter(
                (entry) => entry.sourceLibrary === section.library,
              ).length,
              readonly: true,
            })}
          </div>
        ))}
      </div>

      {entryContextMenu && (
        <MaterialContextMenu
          state={entryContextMenu}
          analyzing={analyzingIds.has(entryContextMenu.entry.id)}
          onAnalyze={() => {
            requestAnalyze(entryContextMenu.entry);
            setEntryContextMenu(null);
          }}
          onRemove={() => {
            void removeEntry(entryContextMenu.entry.id);
            setEntryContextMenu(null);
          }}
          removable={!entryContextMenu.entry.readonly}
          onClose={() => setEntryContextMenu(null)}
        />
      )}

      {analysisDialogEntry && (
        <AnalysisConfirmDialog
          entry={analysisDialogEntry}
          analyzing={analyzingIds.has(analysisDialogEntry.id)}
          onRun={(mode) => {
            if (analysisDialogEntry.assetId) {
              void analyzeEntry(
                analysisDialogEntry.id,
                analysisDialogEntry.assetId,
                mode,
                entryLibrary(analysisDialogEntry, lib),
              );
            } else {
              analyzeMock(analysisDialogEntry.id);
            }
            setAnalysisDialogEntry(null);
          }}
          onClose={() => setAnalysisDialogEntry(null)}
        />
      )}

      {bound && pickerMode === "pool" && renderPoolPicker && (
        <PoolPickerModal onClose={closePicker}>
          {renderPoolPicker({ onClose: closePicker, defaultRole: addRole })}
        </PoolPickerModal>
      )}
    </div>
  );
}

function PoolPickerModal({
  children,
  onClose,
}: {
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[290] flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="flex h-[82vh] w-[min(980px,92vw)] min-h-0 flex-col overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
          <div className="text-xs font-medium">Pool から追加</div>
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="閉じる"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] font-medium text-muted-foreground">{label}</div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rounded border px-1.5 py-0.5 text-[9px] transition ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-background text-muted-foreground hover:border-primary/60 hover:text-foreground"
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function MaterialCard({
  entry,
  thumbUrl,
  isAnalyzing,
  selected,
  onPointerDown,
  onClick,
  onContextMenu,
  onMount,
}: {
  entry: DisplayEntry;
  thumbUrl: string | null;
  isAnalyzing: boolean;
  selected: boolean;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onClick?: () => void;
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
  onMount?: () => void;
}) {
  useEffect(() => {
    onMount?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.assetId]);

  const name = displayNameWithoutPath(entry.label);
  const typeLabel = formatItemType(entry.itemType);
  const title = `${name}\n${typeLabel} / ${SLOT_ROLE_LABELS[entry.role]}${
    entry.analyzed ? "\n分析済み" : "\n未分析"
  }`;

  return (
    <button
      type="button"
      className={`group relative min-w-0 overflow-hidden rounded border bg-background text-left transition hover:border-primary/50 hover:bg-muted/30 ${
        selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border"
      } ${
        onPointerDown && entry.assetId ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      title={title}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-muted/40">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileImage className="h-5 w-5 text-muted-foreground/50" />
          </div>
        )}
        {entry.analyzed ? (
          <span
            className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full border border-background bg-emerald-500 shadow"
            title="分析済み"
          />
        ) : isAnalyzing ? (
          <span
            className="absolute right-1 top-1 flex h-3 w-3 items-center justify-center rounded-full bg-background/80 text-muted-foreground"
            title="分析中"
          >
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          </span>
        ) : null}
        <span className="absolute left-1 top-1 max-w-[calc(100%-1.75rem)] truncate rounded bg-background/80 px-1 py-0 text-[8px] text-muted-foreground opacity-0 transition group-hover:opacity-100">
          {typeLabel}
        </span>
      </div>
      <div className="min-w-0 px-1 py-0.5">
        <div className="truncate text-[9px] leading-tight text-foreground">
          {name}
        </div>
      </div>
    </button>
  );
}

function MaterialListRow({
  entry,
  thumbUrl,
  isAnalyzing,
  selected,
  onPointerDown,
  onClick,
  onContextMenu,
  onMount,
}: {
  entry: DisplayEntry;
  thumbUrl: string | null;
  isAnalyzing: boolean;
  selected: boolean;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onClick?: () => void;
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
  onMount?: () => void;
}) {
  useEffect(() => {
    onMount?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.assetId]);

  const name = displayNameWithoutPath(entry.label);
  const typeLabel = formatItemType(entry.itemType);
  const title = `${name}\n${typeLabel} / ${SLOT_ROLE_LABELS[entry.role]}${
    entry.analyzed ? "\n分析済み" : "\n未分析"
  }`;

  return (
    <button
      type="button"
      className={`group flex min-w-0 items-center gap-2 rounded border bg-background px-1.5 py-1 text-left transition hover:border-primary/50 hover:bg-muted/30 ${
        selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border"
      } ${
        onPointerDown && entry.assetId ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      title={title}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded border border-border bg-muted/40">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <FileImage className="h-3.5 w-3.5 text-muted-foreground/50" />
          </div>
        )}
        {entry.analyzed ? (
          <span
            className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full border border-background bg-emerald-500"
            title="分析済み"
          />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10px] leading-tight text-foreground">
          {name}
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[8px] text-muted-foreground">
          <span className="shrink-0">{typeLabel}</span>
          <span className="shrink-0">/</span>
          <span className="min-w-0 truncate">{SLOT_ROLE_LABELS[entry.role]}</span>
        </div>
      </div>
      {isAnalyzing ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
      ) : entry.analyzed ? (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" title="分析済み" />
      ) : (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-border" title="未分析" />
      )}
    </button>
  );
}

function MaterialCompactIcon({
  entry,
  thumbUrl,
  isAnalyzing,
  selected,
  onPointerDown,
  onClick,
  onContextMenu,
  onMount,
}: {
  entry: DisplayEntry;
  thumbUrl: string | null;
  isAnalyzing: boolean;
  selected: boolean;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onClick?: () => void;
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
  onMount?: () => void;
}) {
  useEffect(() => {
    onMount?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.assetId]);

  const name = displayNameWithoutPath(entry.label);
  const typeLabel = formatItemType(entry.itemType);
  const title = `${name}\n${typeLabel} / ${SLOT_ROLE_LABELS[entry.role]}${
    entry.analyzed ? "\n分析済み" : "\n未分析"
  }`;
  const isAudio = (entry.itemType ?? "").toLowerCase() === "audio";

  return (
    <button
      type="button"
      className={`group flex w-full max-w-[4.5rem] min-w-0 flex-col items-center gap-0.5 rounded px-0.5 py-1 text-center transition hover:bg-muted/40 ${
        selected ? "bg-primary/10 ring-1 ring-primary/30" : ""
      } ${
        onPointerDown && entry.assetId ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      title={title}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <div className="relative h-12 w-12 overflow-hidden rounded border border-border bg-muted/40 shadow-sm">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className="h-full w-full object-contain"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-background/80">
            {isAudio ? (
              <Music className="h-5 w-5 text-muted-foreground/50" />
            ) : (
              <FileImage className="h-4 w-4 text-muted-foreground/50" />
            )}
          </div>
        )}
        {entry.analyzed ? (
          <span
            className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full border border-background bg-emerald-500"
            title="分析済み"
          />
        ) : isAnalyzing ? (
          <span
            className="absolute right-0.5 top-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-background/80 text-muted-foreground"
            title="分析中"
          >
            <Loader2 className="h-2 w-2 animate-spin" />
          </span>
        ) : null}
      </div>
      <div className="line-clamp-2 min-h-[18px] w-full overflow-hidden break-words text-[9px] leading-tight text-foreground">
        {name}
      </div>
    </button>
  );
}

function MaterialContextMenu({
  state,
  analyzing,
  onAnalyze,
  onRemove,
  removable,
  onClose,
}: {
  state: EntryContextMenuState;
  analyzing: boolean;
  onAnalyze: () => void;
  onRemove: () => void;
  removable: boolean;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed z-[300] min-w-[150px] rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-xl"
      style={{ left: state.x, top: state.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent"
        onClick={onAnalyze}
        disabled={analyzing}
      >
        <Sparkles className="h-3 w-3" />
        {state.entry.analyzed ? "再分析" : "分析"}
      </button>
      {removable && (
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
          削除
        </button>
      )}
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
        onClick={onClose}
      >
        閉じる
      </button>
    </div>
  );
}

function AnalysisConfirmDialog({
  entry,
  analyzing,
  onRun,
  onClose,
}: {
  entry: DisplayEntry;
  analyzing: boolean;
  onRun: (mode?: AnalyzeMode) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[310] flex items-center justify-center bg-background/45">
      <div className="w-[280px] rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-2xl">
        <div className="mb-2">
          <div className="text-xs font-medium">{entry.analyzed ? "再分析" : "分析"}</div>
          <div className="mt-1 truncate text-[10px] text-muted-foreground" title={entry.label}>
            {displayNameWithoutPath(entry.label)}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-[10px] hover:border-primary hover:text-primary"
            disabled={analyzing}
            onClick={() => onRun("local")}
          >
            ローカル
          </button>
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-[10px] hover:border-primary hover:text-primary"
            disabled={analyzing}
            onClick={() => onRun("api")}
          >
            API
          </button>
          <button
            type="button"
            className="rounded border border-border px-2 py-1 text-[10px] hover:border-primary hover:text-primary"
            disabled={analyzing}
            onClick={() => onRun(undefined)}
          >
            既定
          </button>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted"
            onClick={onClose}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
