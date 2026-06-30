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

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  ComponentType,
  CSSProperties,
  DragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent,
  ReactNode,
} from "react";
import { createPortal } from "react-dom";
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
  Search,
  Check,
  Package,
  Globe,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { SLOT_ROLE_LABELS, ALL_SLOT_ROLES, type SlotRole } from "@akari-os/sdk/slot";
import { useWorkContext } from "./hooks/useWorkContext";
import { invoke } from "@tauri-apps/api/core";
import {
  listItems,
  slotListEntries,
  slotAddEntry,
  slotRemoveEntry,
  archiveItem,
  analyzeItem,
  type PoolItemSummary,
} from "@akari-os/sdk/pool";
import {
  ensureThumb,
  getCachedThumb,
  isThumbGenerating,
  useThumbCacheSubscription,
  useThumbGeneratingSubscription,
  cancelPendingThumbs,
  usePreviewPlaybackActive,
} from "./lib/pool-thumbnail-cache";

// ADR-108 Wave2: 全 SlotRole は @akari-os/sdk/slot の ALL_SLOT_ROLES が SSOT（手動再列挙を廃止）。

/**
 * §3.3 層3: Pool 指示ブロック（enabled のみ）の最小表現。
 * pool_list_instructions の戻り値のサブセット。
 */
interface InstructionBlockDisplay {
  id: string;
  title: string;
  body_md: string;
  enabled: boolean;
}

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
  /** ADR-110: true = 他アプリの作業状態（is_work_state）。素材とは別セクションで表示する。 */
  workState?: boolean;
  /** 作業状態の出力元 app（"stage" / "design" 等、context_json.source_app）。 */
  sourceApp?: string | null;
}

/**
 * onEntryPointerDown へ渡す追加メタ。作業状態エントリ（workState=true）の D&D を
 * アプリ側（video 等）が素材エントリと区別して扱うために使う。
 */
export interface EntryPointerMeta {
  workState?: boolean;
  sourceApp?: string | null;
}

/** "stage" → "Stage" のような表示用 app 名。 */
function appDisplayName(app: string | null | undefined): string {
  if (!app) return "App";
  return app.charAt(0).toUpperCase() + app.slice(1);
}

/** updatedAt の相対表示（同期の鮮度をひと目で見せる用）。 */
function relativeTimeLabel(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diffSec = Math.max(0, (Date.now() - t) / 1000);
  if (diffSec < 60) return "たった今";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}時間前`;
  return `${Math.floor(diffSec / 86400)}日前`;
}

const AKARI_POOL_ITEM_MIME = "application/x-akari-pool-item";
/** @deprecated workId がある場合は lib で "work-{workId}" が導出される。モックモード専用。 */
const FALLBACK_POOL_LIBRARY = "akari-uploads";
const WORKPOOL_LEGACY_SYNC_LIMIT = 80;
const RELATED_POOL_LOAD_LIMIT = 60;
const WORKPOOL_RENDER_BATCH = 36;
const RELATED_POOL_RENDER_BATCH = 24;
/** §3.3 層1: media として前面に出す item_type 一覧。それ以外は層2（参照データ）扱い。 */
const MEDIA_TYPES = new Set(["video", "image", "audio"]);
const MATERIAL_CARD_DEFER_STYLE: CSSProperties = {
  // 各カードを layout 的に独立させ、サムネ遅延ロード時に兄弟カードへ reflow が
  // 伝播しないようにするだけの軽い contain。
  //
  // ⚠ 以前は content-visibility: auto を使っていたが撤去した。これは
  // 「ページの毎レンダリング更新ごとに document 全体で各カードの relevance（表示判定）が
  // 走る」グローバルコストを持ち、ワークプールをマウントしている間は無関係なパネルリサイズや
  // タイムラインのシークまで毎フレームもたつく原因になっていた（カードを固定サイズ化したので
  // 遅延描画の必要も無い）。大量カード時のスクロール最適化が必要になったら、content-visibility
  // ではなく明示的な仮想スクロールで対処する。
  contain: "layout style",
};
const WORKPOOL_PANEL_CONTAIN_STYLE: CSSProperties = {
  // paint を含めると contain がクリップ境界を作り、フィルター「表示条件」ポップオーバー
  // (絶対配置) が下のリストに被って欠けて見える。layout/style だけ残してクリップは外す。
  contain: "layout style",
};

type VisibleCallback = () => void;
const visibleCallbacks = new WeakMap<Element, VisibleCallback>();
let visibleObserver: IntersectionObserver | null = null;

function getVisibleObserver(): IntersectionObserver | null {
  if (typeof IntersectionObserver === "undefined") return null;
  if (!visibleObserver) {
    visibleObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const cb = visibleCallbacks.get(entry.target);
          if (!cb) continue;
          visibleObserver?.unobserve(entry.target);
          visibleCallbacks.delete(entry.target);
          cb();
        }
      },
      { root: null, rootMargin: "320px", threshold: 0.01 },
    );
  }
  return visibleObserver;
}

function useVisibleMount(onMount?: () => void) {
  const nodeRef = useRef<HTMLElement | null>(null);
  const ranRef = useRef(false);
  const run = useCallback(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    onMount?.();
  }, [onMount]);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      const prev = nodeRef.current;
      if (prev && prev !== node) {
        visibleObserver?.unobserve(prev);
        visibleCallbacks.delete(prev);
      }
      nodeRef.current = node;
      if (!node || !onMount || ranRef.current) return;
      const observer = getVisibleObserver();
      if (!observer) {
        run();
        return;
      }
      visibleCallbacks.set(node, run);
      observer.observe(node);
    },
    [onMount, run],
  );

  useEffect(
    () => () => {
      const node = nodeRef.current;
      if (!node) return;
      visibleObserver?.unobserve(node);
      visibleCallbacks.delete(node);
    },
    [],
  );

  return ref;
}

type MaterialStatusFilter = "all" | "analyzed" | "unanalyzed";
type MaterialSortMode = "added-desc" | "added-asc" | "name-asc" | "analysis";
type MaterialViewMode = "grid" | "compact" | "list";
type AnalyzeMode = "api" | "local" | "markitdown";
/** 左サブタブの分類軸。ワークプール / ドメイン / ブランド + アプリ注入の extraScopeTabs id。 */
type MaterialScope = "workpool" | "domain" | "brand" | (string & {});

/** 表示切替（カード / コンパクト / リスト）の定義。1 ボタン → ポップオーバーで切替する。 */
const VIEW_MODES: {
  id: MaterialViewMode;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "grid", label: "カード表示", icon: LayoutGrid },
  { id: "compact", label: "コンパクト表示", icon: Grid3x3 },
  { id: "list", label: "リスト表示", icon: List },
];

interface EntryContextMenuState {
  x: number;
  y: number;
  entry: DisplayEntry;
}

/** 範囲選択（marquee / ラバーバンド）の矩形。client 座標で保持する。 */
interface MarqueeRect {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

export interface RelatedPoolSection {
  library: string;
  label: string;
  kind?: "domain" | "brand" | "related";
}

function relatedSectionTitle(section: RelatedPoolSection): string {
  // brand は parent チェーンに関係なく常時表示されるため「親元」表記はしない
  if (section.kind === "brand") return `ブランド: ${section.label}`;
  if (section.kind === "domain") return `ドメイン: ${section.label}`;
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
   * アプリが注入する追加の scope サブタブ（左レール）。既存の
   * ワークプール/ドメイン/ブランドの後ろに並ぶ。選択時は render() を全面描画する
   * （例: video が「全素材」= 全 Work 横断の素材再利用パネルを差し込む）。
   */
  extraScopeTabs?: ReadonlyArray<{
    id: string;
    label: string;
    icon: LucideIcon;
    render: () => ReactNode;
  }>;
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
    meta?: EntryPointerMeta,
  ) => void;
  /** 制作素材カードのクリック選択。Preview / Inspector の source 切替に使う。 */
  onEntryClick?: (assetId: string, library?: string | null) => void;
  /** 制作素材カードのダブルクリック。insert / import の確定に使う。 */
  onEntryDoubleClick?: (assetId: string, library?: string | null) => void;
  /** true の場合、制作素材カードは HTML5 drag payload も載せる。 */
  enableEntryHtmlDrag?: boolean;
  /**
   * 制作素材の分析リクエスト。
   * 指定された場合は内蔵の簡易分析ダイアログを出さず、親アプリ側に処理を委譲する。
   */
  onRequestEntryAnalyze?: (assetId: string, library?: string | null) => void;
  /**
   * 複数素材の一括分析リクエスト（範囲選択 / ⌘+クリックで複数選択した素材）。
   * 指定された場合、選択バー・右クリックメニューから「N件を分析」を一度の dispatch で委譲する。
   * 未指定なら onRequestEntryAnalyze を 1 件ずつ fallback 呼び出しする。
   */
  onRequestEntriesAnalyze?: (
    targets: ReadonlyArray<{ assetId: string; library?: string | null; itemType?: string | null }>,
  ) => void;
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
  /**
   * 内蔵の「＋追加」ボタン（ローカル取込 / Pool から）を表示するか。
   * 既定 false（非表示）。video など外部に独自の追加 FAB を持つアプリでは不要なので
   * 既定で隠す。必要なアプリだけ true を渡す。
   */
  showInlineAdd?: boolean;
}

export const ContextSlotPanel = memo(function ContextSlotPanel({
  workId,
  variantId,
  library,
  renderPoolPicker,
  extraScopeTabs,
  onEntryPointerDown,
  onEntryClick,
  onEntryDoubleClick,
  enableEntryHtmlDrag,
  onRequestEntryAnalyze,
  onRequestEntriesAnalyze,
  onAddFromLocal,
  visibleRoles,
  relatedPoolSections,
  showInlineAdd = false,
}: ContextSlotPanelProps) {
  /** 永続モード = Work / Variant が確定しているとき */
  const bound = !!(workId && variantId);
  // library 未指定時は workId から "work-{workId}" を導出する（akari-uploads フォールバック廃止）
  const lib = library ?? (workId ? `work-${workId}` : null);

  const [entries, setEntries] = useState<DisplayEntry[]>([]);
  // ADR-110: 他アプリの作業状態（is_work_state）。素材（import/書き出し）と混ぜず別セクションで出す。
  const [workStateEntries, setWorkStateEntries] = useState<DisplayEntry[]>([]);
  const [relatedEntries, setRelatedEntries] = useState<DisplayEntry[]>([]);
  const [statusFilter, setStatusFilter] = useState<MaterialStatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<SlotRole | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<MaterialSortMode>("added-desc");
  const [viewMode, setViewMode] = useState<MaterialViewMode>("grid");
  /** 左サブタブの選択（ワークプール / ドメイン / ブランド）。 */
  const [materialScope, setMaterialScope] = useState<MaterialScope>("workpool");
  // 'data' セクション（参照データ）と 'context' セクション（Work 文脈）は既定で折りたたむ（§3.3 プログレッシブ・ディスクロージャ）。
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(() => new Set(["data", "context"]));
  /** 素材名のフリーワード検索クエリ。 */
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [viewPopoverOpen, setViewPopoverOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [selectedEntryKey, setSelectedEntryKey] = useState<string | null>(null);
  // 複数選択 (⌘/Ctrl+クリックでトグル)。一括削除に使う。単一クリックは preview 用の
  // selectedEntryKey と連動し、ここを {key} にリセットする。
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [entryContextMenu, setEntryContextMenu] = useState<EntryContextMenuState | null>(null);
  // 範囲選択（marquee）: 表示用矩形 + 起点 / 開始時の選択（additive 用）/ 移動フラグ。
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const marqueeContainerRef = useRef<HTMLDivElement | null>(null);
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null);
  const marqueeBaseRef = useRef<Set<string>>(new Set());
  const marqueeMovedRef = useRef(false);
  const [analysisDialogEntry, setAnalysisDialogEntry] = useState<DisplayEntry | null>(null);
  /** ソース選択パネルの開閉（true = 展開中） */
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  // サムネは共有キャッシュ（低並列 + dedupe + rAF バッチ通知）経由で取得する。
  // cache 更新時の再描画はこの subscription 1 本に集約され、サムネ完了ごとの
  // パネル全体再描画 + Map 全コピー（O(N^2)）を解消する（freeze-safe / ADR-100 準拠）。
  useThumbCacheSubscription();
  useThumbGeneratingSubscription();
  const previewPlaying = usePreviewPlaybackActive();
  useEffect(() => () => cancelPendingThumbs(), []);
  /**
   * 分析中の entryId セット（ボタン busy 表示用）。
   */
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  /**
   * Pool ピッカーのモーダル開閉。null = 一覧表示。
   */
  const [pickerMode, setPickerMode] = useState<"pool" | null>(null);
  const [sectionRenderLimits, setSectionRenderLimits] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  // キャプチャ等の保存待ち中に出す仮プレースホルダ（「ここに入るよ」スピナー）。
  const [pendingItems, setPendingItems] = useState<
    { id: string; library: string | null; label: string }[]
  >([]);
  const filterBtnRef = useRef<HTMLButtonElement | null>(null);
  const viewBtnRef = useRef<HTMLButtonElement | null>(null);
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

  // §3.3 層3: Work 文脈（purpose / tone / strategy.memo）を取得。失敗しても素材パネルは壊さない。
  const workCtx = useWorkContext({
    library: lib,
    workId: workId ?? null,
    variantId: variantId ?? null,
  });

  // §3.3 層3: Pool 指示（akari.md 相当の指示ブロック）の enabled なブロック一覧を開示用に取得。
  // sdk に helper が無いため Tauri コマンドを直 invoke する。失敗は握ってパネルを壊さない。
  const [instructionBlocks, setInstructionBlocks] = useState<InstructionBlockDisplay[]>([]);
  /** クリックで展開中の指示 id */
  const [expandedInstructionId, setExpandedInstructionId] = useState<string | null>(null);
  /** インライン編集中の指示 id */
  const [editingInstructionId, setEditingInstructionId] = useState<string | null>(null);
  /** 編集中の body_md の下書き */
  const [editingBodyDraft, setEditingBodyDraft] = useState<string>("");
  /** 保存リクエスト中の指示 id */
  const [savingInstructionId, setSavingInstructionId] = useState<string | null>(null);

  /** Pool 指示を再取得して instructionBlocks を更新する。失敗は握る。 */
  const reloadInstructions = useCallback(async () => {
    if (!lib) {
      setInstructionBlocks([]);
      return;
    }
    try {
      const raw = await invoke("pool_list_instructions", { library: lib });
      const blocks = Array.isArray(raw)
        ? (raw as Array<{ id?: string; title?: string; body_md?: string; enabled?: boolean }>)
            .filter((b) => b?.enabled && b?.id)
            .map((b): InstructionBlockDisplay => ({
              id: b.id!,
              title: b.title ?? "",
              body_md: b.body_md ?? "",
              enabled: b.enabled ?? true,
            }))
        : [];
      setInstructionBlocks(blocks);
    } catch {
      setInstructionBlocks([]);
    }
  }, [lib]);

  useEffect(() => {
    let cancelled = false;
    void reloadInstructions().then(() => {
      // キャンセルされていた場合は state 更新が既に無視されている
      void cancelled;
    });
    return () => {
      cancelled = true;
    };
  }, [reloadInstructions]);

  /** 指示 body_md のインライン保存。失敗はコンソール警告のみ（パネルを壊さない）。 */
  const handleSaveInstruction = useCallback(
    async (block: InstructionBlockDisplay) => {
      if (!lib) return;
      setSavingInstructionId(block.id);
      try {
        await invoke("pool_upsert_instruction", {
          library: lib,
          block: { id: block.id, title: block.title, body_md: editingBodyDraft, enabled: block.enabled },
        });
        await reloadInstructions();
        setEditingInstructionId(null);
      } catch (e) {
        console.warn("[Pool 指示] upsert 失敗", e);
      } finally {
        setSavingInstructionId(null);
      }
    },
    [lib, editingBodyDraft, reloadInstructions],
  );

  // §3.3 層3: brand pool の事業正典（Brand→Domain 継承込み compile）を先頭数行で開示。
  // normalizedRelatedSections から kind==='brand' の最初のエントリを使う。
  // 失敗・空文字・brand なしは握って非表示（パネルを壊さない）。
  const brandLibrary = useMemo(
    () => normalizedRelatedSections.find((s) => s.kind === "brand")?.library ?? null,
    [normalizedRelatedSections],
  );
  const [canonMarkdown, setCanonMarkdown] = useState<string>("");
  useEffect(() => {
    if (!brandLibrary) {
      setCanonMarkdown("");
      return;
    }
    let cancelled = false;
    void invoke<string>("pool_compile_context_inherited", {
      library: brandLibrary,
      appId: null,
      keywords: null,
      inherit: true,
    })
      .then((text) => {
        if (cancelled) return;
        setCanonMarkdown(typeof text === "string" ? text.trim() : "");
      })
      .catch(() => {
        if (!cancelled) setCanonMarkdown("");
      });
    return () => {
      cancelled = true;
    };
  }, [brandLibrary]);

  useEffect(() => {
    if (roleFilter && !roleFilterOptions.includes(roleFilter)) {
      setRoleFilter(null);
    }
  }, [roleFilter, roleFilterOptions]);

  useEffect(() => {
    setSectionRenderLimits({});
  }, [workId, variantId, lib, statusFilter, roleFilter, typeFilter, sortMode, searchQuery]);

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
    const allEntries = [...entries, ...relatedEntries];
    const validKeys = new Set(allEntries.map((entry) => entryKey(entry, lib)));
    if (selectedEntryKey && !validKeys.has(selectedEntryKey)) {
      setSelectedEntryKey(null);
    }
    // reload 等で消えたエントリの選択を取り除く
    setSelectedKeys((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Set<string>();
      for (const key of prev) {
        if (validKeys.has(key)) next.add(key);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [entries, relatedEntries, lib, selectedEntryKey]);

  // --- 永続モード: backend から読み込み ---
  // 同時に複数の reload が走ると auto-sync が重複 slot_entry を作る競合状態を防ぐ
  const reloadRunningRef = useRef(false);
  const reload = useCallback(async () => {
    if (!bound) return;
    if (reloadRunningRef.current) return;
    reloadRunningRef.current = true;
    try {
      let views = await slotListEntries(lib, workId!, variantId!);
      let poolItemMap = new Map<string, PoolItemSummary>();
      // library = workpool（自動同期）: Work 専用ライブラリ `work-<id>` の素材を毎回
      // ワークプールへ取り込む。以前は views.length === 0（空のとき限定）だったため、
      // Pool ビューア等で後から足した素材がワークプールに反映されなかった。
      // 「外す」操作は removeEntry で library からも archive するので resurrection しない。
      if (lib) {
        const existingAssetIds = new Set(
          views.map((v) => v.asset_id).filter((id): id is string => Boolean(id)),
        );
        const poolItems = await listItems(lib, {
          sortBy: "updated_at",
          sortOrder: "desc",
          limit: WORKPOOL_LEGACY_SYNC_LIMIT,
        }).catch((e) => {
          console.warn("[制作素材] pool item auto-sync 失敗", e);
          return [] as PoolItemSummary[];
        });
        poolItemMap = new Map(poolItems.map((item) => [item.id, item]));
        // ADR-110: working-state は素材セクションには出さないが、「作業状態」
        // セクションとして別枠表示する（import 素材との区別がつくように）。
        setWorkStateEntries(
          poolItems
            .filter((item) => !item.archived_at && item.is_work_state)
            .sort(
              (a, b) => (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0),
            )
            .map((item, index): DisplayEntry => ({
              id: `state:${item.id}`,
              label: item.name ?? "(無題)",
              role: "misc",
              itemType: item.item_type ?? null,
              createdAt: item.created_at ?? null,
              updatedAt: item.updated_at ?? null,
              position: index,
              analyzed: false,
              assetId: item.id,
              sourceLibrary: lib,
              readonly: true,
              workState: true,
              sourceApp: item.source_app ?? null,
            })),
        );
        const missing = poolItems.filter(
          (item) =>
            !item.archived_at &&
            // ADR-110 D-2: app 私的 working-state（[<app> state]）は素材でないので
            // WorkPool に auto-slot しない。これを入れないと stage 等の状態が混入する。
            !item.is_work_state &&
            !existingAssetIds.has(item.id),
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
        views
          // ADR-110 D-2: 既に slot 化済みの working-state（[<app> state]）も
          // 素材ビューから隠す。slot_entry は残すが表示・カウントには出さない。
          .filter((v) => !(v.asset_id && poolItemMap.get(v.asset_id)?.is_work_state))
          .map((v) => ({
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
      // pool が未作成（初回 Work open）は空リストとして扱う（ユーザーにエラー表示しない）
      const msg = String(e);
      if (msg.includes("ライブラリが見つからない") || msg.includes("LibraryNotFound")) {
        setEntries([]);
        setWorkStateEntries([]);
        setError(null);
      } else {
        console.warn("[制作素材] slot_list_entries 失敗", e);
        setError("素材の読み込みに失敗しました");
      }
    } finally {
      reloadRunningRef.current = false;
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
            limit: RELATED_POOL_LOAD_LIMIT,
          });
          return items
            // ADR-110 D-2: 関連 Pool でも working-state は素材として出さない
            .filter((item) => !item.archived_at && !item.is_work_state)
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

  // Pool ビューア等で素材が追加/変更されたら、対象ライブラリのワークプールを即 reload。
  // （library=workpool 自動同期。同一 webview 内の CustomEvent で他 view からの追加を拾う）
  useEffect(() => {
    if (!bound) return;
    const onItemsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ library?: string | null }>).detail;
      const mainLibrary = lib ?? FALLBACK_POOL_LIBRARY;
      if (!detail?.library || detail.library === mainLibrary) {
        void reload();
      }
      if (
        detail?.library &&
        normalizedRelatedSections.some((section) => section.library === detail.library)
      ) {
        void reloadRelated();
      }
    };
    window.addEventListener("akari:pool-items-changed", onItemsChanged);
    return () => window.removeEventListener("akari:pool-items-changed", onItemsChanged);
  }, [bound, lib, normalizedRelatedSections, reload, reloadRelated]);

  // 仮プレースホルダ（「ここに入るよ」スピナー）の購読。
  //  - pending-item: 追加（対象 library が自分 = lib のときだけ）
  //  - pending-item-resolved: id で削除
  //  - items-changed: 実アイテムが reload されるので該当 library の仮カードは一掃
  // さらに 30s の安全タイムアウトで取り残しを自動消去する。
  useEffect(() => {
    const mainLibrary = lib ?? FALLBACK_POOL_LIBRARY;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const clearTimer = (id: string) => {
      const t = timers.get(id);
      if (t) {
        clearTimeout(t);
        timers.delete(id);
      }
    };
    const remove = (id: string) => {
      clearTimer(id);
      setPendingItems((prev) => prev.filter((p) => p.id !== id));
    };
    const onPending = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; library?: string | null; label?: string }>).detail;
      if (!detail?.id) return;
      const itemLib = detail.library ?? null;
      if (itemLib && itemLib !== mainLibrary) return; // 別 library 宛ては無視
      setPendingItems((prev) =>
        prev.some((p) => p.id === detail.id)
          ? prev
          : [...prev, { id: detail.id!, library: itemLib, label: detail.label ?? "保存中" }],
      );
      timers.set(detail.id, setTimeout(() => remove(detail.id!), 30_000));
    };
    const onResolved = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id) remove(detail.id);
    };
    const onItemsChangedClear = (event: Event) => {
      const detail = (event as CustomEvent<{ library?: string | null }>).detail;
      if (detail?.library && detail.library !== mainLibrary) return;
      setPendingItems((prev) => {
        prev.forEach((p) => clearTimer(p.id));
        return [];
      });
    };
    window.addEventListener("akari:pool-pending-item", onPending);
    window.addEventListener("akari:pool-pending-item-resolved", onResolved);
    window.addEventListener("akari:pool-items-changed", onItemsChangedClear);
    return () => {
      window.removeEventListener("akari:pool-pending-item", onPending);
      window.removeEventListener("akari:pool-pending-item-resolved", onResolved);
      window.removeEventListener("akari:pool-items-changed", onItemsChangedClear);
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, [lib]);

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

  /** エントリ削除。
   *  library=workpool 自動同期方針のため、自 Work ライブラリ（lib）由来の素材は
   *  slot_entry だけでなく library 実体も archive する（archive しないと次回 reload の
   *  自動同期で復活してしまう）。他ライブラリ参照（cross-pool ref）は slot_entry のみ外す
   *  （他 Work / 共有 pool の実体を巻き込んで消さない）。 */
  const removeEntry = useCallback(
    async (entry: DisplayEntry) => {
      if (!bound) {
        setEntries((prev) => prev.filter((e) => e.id !== entry.id));
        return;
      }
      try {
        await slotRemoveEntry(lib, entry.id);
        if (entry.assetId && entry.sourceLibrary && entry.sourceLibrary === lib) {
          try {
            await archiveItem(lib, entry.assetId);
          } catch (e) {
            console.warn("[制作素材] library archive 失敗", entry.assetId, e);
          }
        }
        await reload();
      } catch (e) {
        console.warn("[制作素材] slot_remove_entry 失敗", e);
        setError("素材の削除に失敗しました");
      }
    },
    [bound, lib, reload],
  );

  /** 複数選択した素材を一括削除（workpool の削除可能エントリのみ対象）。
   *  個別 removeEntry を都度 reload せず、まとめて外して最後に一度だけ reload する。 */
  const removeSelectedEntries = useCallback(async () => {
    const targets = entries.filter((e) => selectedKeys.has(entryKey(e, lib)));
    if (targets.length === 0) return;
    if (!bound) {
      const ids = new Set(targets.map((e) => e.id));
      setEntries((prev) => prev.filter((e) => !ids.has(e.id)));
      setSelectedKeys(new Set());
      return;
    }
    try {
      for (const entry of targets) {
        await slotRemoveEntry(lib, entry.id);
        if (entry.assetId && entry.sourceLibrary && entry.sourceLibrary === lib) {
          try {
            await archiveItem(lib, entry.assetId);
          } catch (e) {
            console.warn("[制作素材] library archive 失敗", entry.assetId, e);
          }
        }
      }
      setSelectedKeys(new Set());
      await reload();
    } catch (e) {
      console.warn("[制作素材] 一括削除失敗", e);
      setError("素材の一括削除に失敗しました");
    }
  }, [bound, entries, lib, reload, selectedKeys]);

  /** 指定キー集合（既定: 現在の複数選択）の素材をまとめて分析リクエストする。 */
  const analyzeEntriesByKeys = useCallback(
    (keys: Set<string>) => {
      const targets = entries.filter(
        (e) => e.assetId && keys.has(entryKey(e, lib)),
      );
      if (targets.length === 0) return;
      if (onRequestEntriesAnalyze) {
        onRequestEntriesAnalyze(
          targets.map((e) => ({
            assetId: e.assetId!,
            library: entryLibrary(e, lib),
            itemType: e.itemType,
          })),
        );
      } else if (onRequestEntryAnalyze) {
        // 一括委譲先がなければ 1 件ずつ fallback
        for (const e of targets) onRequestEntryAnalyze(e.assetId!, entryLibrary(e, lib));
      } else {
        // 親に委譲が無ければ内蔵ダイアログで先頭のみ
        setAnalysisDialogEntry(targets[0]);
      }
    },
    [entries, lib, onRequestEntriesAnalyze, onRequestEntryAnalyze],
  );

  const analyzeSelectedEntries = useCallback(() => {
    analyzeEntriesByKeys(selectedKeys);
  }, [analyzeEntriesByKeys, selectedKeys]);

  // ─ 範囲選択（marquee / ラバーバンド）─────────────────────────────────
  // 余白からのドラッグで矩形を描き、交差したカードを選択する（Finder 風）。
  // カードは pointerdown を D&D 起点に使うため、marquee は「カード以外の余白」でのみ開始する。
  const handleMarqueePointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (
        target.closest(
          "button, a, input, select, textarea, [role='button'], [data-entry-key], [data-no-marquee]",
        )
      ) {
        return;
      }
      const container = marqueeContainerRef.current;
      if (!container) return;
      marqueeStartRef.current = { x: e.clientX, y: e.clientY };
      marqueeBaseRef.current =
        e.shiftKey || e.metaKey || e.ctrlKey ? new Set(selectedKeys) : new Set();
      marqueeMovedRef.current = false;
      // ドラッグで下のカード文字が範囲選択され青ハイライトが出るのを抑止（select-none と併用）。
      e.preventDefault();
      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        // capture 失敗は無視（move/up は通常どおり発火する）
      }
      setMarquee({ startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY });
    },
    [selectedKeys],
  );

  const handleMarqueePointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const start = marqueeStartRef.current;
    const container = marqueeContainerRef.current;
    if (!start || !container) return;
    const curX = e.clientX;
    const curY = e.clientY;
    if (Math.abs(curX - start.x) > 3 || Math.abs(curY - start.y) > 3) {
      marqueeMovedRef.current = true;
    }
    setMarquee({ startX: start.x, startY: start.y, curX, curY });
    const x1 = Math.min(start.x, curX);
    const x2 = Math.max(start.x, curX);
    const y1 = Math.min(start.y, curY);
    const y2 = Math.max(start.y, curY);
    const hit = new Set(marqueeBaseRef.current);
    container.querySelectorAll<HTMLElement>("[data-entry-key]").forEach((el) => {
      const key = el.dataset.entryKey;
      if (!key) return;
      const r = el.getBoundingClientRect();
      if (r.left < x2 && r.right > x1 && r.top < y2 && r.bottom > y1) hit.add(key);
    });
    setSelectedKeys(hit);
  }, []);

  const endMarquee = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (!marqueeStartRef.current) return;
    try {
      marqueeContainerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // noop
    }
    const moved = marqueeMovedRef.current;
    marqueeStartRef.current = null;
    setMarquee(null);
    // ドラッグせず余白をクリックしただけなら選択解除（Finder 風）。
    if (!moved) {
      setSelectedKeys(new Set());
      setSelectedEntryKey(null);
    }
  }, []);

  /** モックモード: 分析済みフラグをトグル（永続モードでは display-only） */
  const analyzeMock = useCallback((id: string) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, analyzed: true } : e)),
    );
  }, []);

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
      const query = searchQuery.trim().toLowerCase();
      const filtered = sourceEntries.filter((entry) => {
        if (statusFilter === "analyzed" && !entry.analyzed) return false;
        if (statusFilter === "unanalyzed" && entry.analyzed) return false;
        if (roleFilter && entry.role !== roleFilter) return false;
        if (typeFilter && (entry.itemType ?? "unknown") !== typeFilter) return false;
        if (query && !displayNameWithoutPath(entry.label).toLowerCase().includes(query)) {
          return false;
        }
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
    [roleFilter, sortMode, statusFilter, typeFilter, searchQuery],
  );

  // 検索・フィルタを先に全 entries に適用してから media / data に分割する。
  // これにより検索は §3.3 設計原則 2 どおり両セクションを横断して効く。
  const visibleWorkEntries = useMemo(
    () => filterAndSortEntries(entries),
    [entries, filterAndSortEntries],
  );
  /** §3.3 層1: 画像 / 動画 / 音声。前面・大きく表示（既定展開）。 */
  const mediaWorkEntries = useMemo(
    () => visibleWorkEntries.filter((e) => MEDIA_TYPES.has((e.itemType ?? "").toLowerCase())),
    [visibleWorkEntries],
  );
  /** §3.3 層2: PDF / ドキュメント / テキスト / URL 等、item_type 未設定も含む。既定折りたたみ。 */
  const dataWorkEntries = useMemo(
    () => visibleWorkEntries.filter((e) => !MEDIA_TYPES.has((e.itemType ?? "").toLowerCase())),
    [visibleWorkEntries],
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

  // 左サブタブ用に関連 Pool を kind で振り分ける。
  // ドメインタブ = domain / related（関わりがあるもの全般）、ブランドタブ = brand。
  const domainSections = useMemo(
    () => visibleRelatedSections.filter((s) => s.kind !== "brand"),
    [visibleRelatedSections],
  );
  const brandSections = useMemo(
    () => visibleRelatedSections.filter((s) => s.kind === "brand"),
    [visibleRelatedSections],
  );
  const hasDomain = domainSections.length > 0;
  const hasBrand = brandSections.length > 0;
  // 表示するサブタブ。データが無い軸は出さない（= ワークプールのみなら rail 非表示）。
  const scopeTabs = useMemo(
    () => [
      { id: "workpool" as string, label: "ワークプール", icon: Package as LucideIcon },
      ...(hasDomain ? [{ id: "domain", label: "ドメイン", icon: Globe as LucideIcon }] : []),
      ...(hasBrand ? [{ id: "brand", label: "ブランド", icon: Tag as LucideIcon }] : []),
      ...(extraScopeTabs ?? []).map((t) => ({ id: t.id, label: t.label, icon: t.icon })),
    ],
    [hasDomain, hasBrand, extraScopeTabs],
  );
  const showScopeRail = scopeTabs.length > 1;
  // extraScopeTabs（例: 全素材）が選択中なら、その render() を素材棚の代わりに描画する。
  const activeExtraTab = extraScopeTabs?.find((t) => t.id === materialScope) ?? null;

  // 選択中のタブのデータが無くなったらワークプールへ戻す。
  useEffect(() => {
    if (materialScope === "domain" && !hasDomain) setMaterialScope("workpool");
    else if (materialScope === "brand" && !hasBrand) setMaterialScope("workpool");
  }, [materialScope, hasDomain, hasBrand]);

  const addRole: SlotRole = roleFilter ?? "misc";
  const addRoleLabel = SLOT_ROLE_LABELS[addRole];
  const hasRoleFilter = roleFilter != null;
  const activeFilterLabel = filterLabel(statusFilter, roleFilter, typeFilter, sortMode);
  // フィルター（状態/分類/種別）のいずれかが効いているか。アイコンボタンに小バッジを出す。
  const filtersActive =
    statusFilter !== "all" || roleFilter != null || typeFilter != null;
  const CurrentViewIcon =
    VIEW_MODES.find((v) => v.id === viewMode)?.icon ?? LayoutGrid;

  const handleEntryDragStart = useCallback(
    (
      e: DragEvent<HTMLElement>,
      entry: DisplayEntry,
      sourceLibrary?: string | null,
    ) => {
      if (!entry.assetId) return;
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData(
        AKARI_POOL_ITEM_MIME,
        JSON.stringify({
          source: "shell",
          itemId: entry.assetId,
          library: sourceLibrary ?? undefined,
        }),
      );
      e.dataTransfer.setData("text/plain", displayNameWithoutPath(entry.label));
    },
    [],
  );

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

  const showMoreInSection = useCallback(
    (sectionId: string, batchSize: number, total: number) => {
      setSectionRenderLimits((prev) => {
        const current = prev[sectionId] ?? batchSize;
        return {
          ...prev,
          [sectionId]: Math.min(total, current + batchSize),
        };
      });
    },
    [],
  );

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
    const batchSize = readonly ? RELATED_POOL_RENDER_BATCH : WORKPOOL_RENDER_BATCH;
    const renderLimit = sectionRenderLimits[sectionId] ?? batchSize;
    const renderedEntries = sectionEntries.slice(0, renderLimit);
    const hiddenCount = Math.max(0, sectionEntries.length - renderedEntries.length);
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
              <>
                <div
                  className={
                    viewMode === "grid"
                      ? "grid gap-1"
                      : viewMode === "compact"
                        ? "grid justify-items-center gap-x-1.5 gap-y-2"
                        : "flex flex-col gap-1"
                  }
                  style={
                    // カードは可変幅。auto-fill + minmax(基準, 1fr) で 1 行をすき間なく
                    // 埋める。列が入り切らない余白は各カードをわずかに伸縮させて吸収するので、
                    // 旧実装（固定幅 + justify-content: space-between）で出ていた列間の
                    // 大きなすき間（特に中央）が出なくなる。すき間は gap のみ。
                    viewMode === "grid"
                      ? { gridTemplateColumns: "repeat(auto-fill, minmax(5rem, 1fr))" }
                      : viewMode === "compact"
                        ? { gridTemplateColumns: "repeat(auto-fill, minmax(3.75rem, 1fr))" }
                        : undefined
                  }
                >
                  {renderedEntries.map((entry) => {
                    const sourceLibrary = entryLibrary(entry, lib);
                    const selectedKey = entryKey(entry, lib);
                    const commonProps = {
                      entry,
                      dataKey: selectedKey,
                      thumbUrl:
                        !previewPlaying && entry.assetId
                          ? (getCachedThumb(sourceLibrary, entry.assetId) ?? null)
                          : null,
                      thumbGenerating:
                        entry.assetId ? isThumbGenerating(sourceLibrary, entry.assetId) : false,
                      isAnalyzing: analyzingIds.has(entry.id),
                      selected:
                        selectedKey === selectedEntryKey ||
                        selectedKeys.has(selectedKey),
                      onPointerDown:
                        onEntryPointerDown && entry.assetId
                          ? (e: PointerEvent<HTMLElement>) =>
                              onEntryPointerDown(entry.assetId!, e, sourceLibrary)
                          : undefined,
                      onClick: entry.assetId
                        ? (e: ReactMouseEvent<HTMLElement>) => {
                            // ⌘/Ctrl+クリック: 複数選択トグル (preview は変えない)。
                            if (e.metaKey || e.ctrlKey) {
                              setSelectedKeys((prev) => {
                                const next = new Set(prev);
                                if (next.has(selectedKey)) next.delete(selectedKey);
                                else next.add(selectedKey);
                                return next;
                              });
                              return;
                            }
                            // 通常クリック: 単一選択 + preview。複数選択もこの 1 件にリセット。
                            setSelectedEntryKey(selectedKey);
                            setSelectedKeys(new Set([selectedKey]));
                            onEntryClick?.(entry.assetId!, sourceLibrary);
                          }
                        : undefined,
                      onDoubleClick: entry.assetId
                        ? () => {
                            setSelectedEntryKey(selectedKey);
                            onEntryDoubleClick?.(entry.assetId!, sourceLibrary);
                          }
                        : undefined,
                      draggable: Boolean(enableEntryHtmlDrag && entry.assetId),
                      onDragStart:
                        enableEntryHtmlDrag && entry.assetId
                          ? (e: DragEvent<HTMLElement>) =>
                              handleEntryDragStart(e, entry, sourceLibrary)
                          : undefined,
                      onContextMenu: (e: ReactMouseEvent<HTMLElement>) =>
                        handleCardContextMenu(entry, e),
                      onMount:
                        !previewPlaying && entry.assetId
                          ? () => void ensureThumb(sourceLibrary, entry.assetId!)
                          : undefined,
                    };
                    if (viewMode === "grid") return <MaterialCard key={entry.id} {...commonProps} />;
                    if (viewMode === "compact") {
                      return <MaterialCompactIcon key={entry.id} {...commonProps} />;
                    }
                    return <MaterialListRow key={entry.id} {...commonProps} />;
                  })}
                </div>
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-[10px] text-muted-foreground hover:border-primary/60 hover:text-primary"
                    onClick={() => showMoreInSection(sectionId, batchSize, sectionEntries.length)}
                  >
                    さらに表示 {Math.min(batchSize, hiddenCount)} / {hiddenCount}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </section>
    );
  };

  /**
   * 作業状態セクション（ADR-110）。他アプリ（stage / design 等）が live sync している
   * 編集状態を、import / 書き出し素材と区別できる別枠で表示する。
   * D&D は onEntryPointerDown に meta.workState=true を付けてアプリ側へ委譲する
   * （video 側は最新書き出しをプロキシに配置し、以後の変更を追跡する）。
   */
  const renderWorkStateSection = () => {
    const sectionId = "workstate";
    const collapsed = collapsedSectionIds.has(sectionId);
    const title = "作業状態（他アプリ・同期）";
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
            {workStateEntries.length}
          </div>
        </button>
        {!collapsed && (
          <div className="flex flex-col gap-1 rounded border border-dashed border-primary/40 bg-primary/5 p-1">
            {workStateEntries.map((entry) => (
              <div
                key={entry.id}
                className={`flex items-center gap-1.5 rounded border border-border bg-background px-1.5 py-1 select-none ${
                  onEntryPointerDown ? "cursor-grab hover:border-primary/60" : ""
                }`}
                onPointerDown={
                  onEntryPointerDown && entry.assetId
                    ? (e: PointerEvent<HTMLElement>) =>
                        onEntryPointerDown(entry.assetId!, e, entryLibrary(entry, lib), {
                          workState: true,
                          sourceApp: entry.sourceApp ?? null,
                        })
                    : undefined
                }
                title={`${appDisplayName(entry.sourceApp)} の現在の編集状態（自動同期）。タイムラインへドラッグすると最新の書き出しで配置され、以後の変更を追跡します`}
              >
                <span className="relative flex h-1.5 w-1.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                <span className="shrink-0 rounded bg-primary/15 px-1 py-px text-[9px] font-medium text-primary">
                  {appDisplayName(entry.sourceApp)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[10px] text-foreground">
                  作業状態（同期中）
                </span>
                <span className="shrink-0 text-[9px] text-muted-foreground">
                  {relativeTimeLabel(entry.updatedAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    );
  };

  /**
   * §3.3 層3: コンテキスト折りたたみセクション。Work 文脈（purpose / tone / strategy.memo）を開示する。
   * 検索フィルタ（searchQuery）の対象外。失敗しても素材パネルを壊さない。
   */
  const renderContextSection = () => {
    const sectionId = "context";
    const collapsed = collapsedSectionIds.has(sectionId);
    const title = "コンテキスト";
    const ctx = workCtx.context;
    const hasInstructions = instructionBlocks.length > 0;
    const hasCanon = canonMarkdown.length > 0;
    const hasAny = !!(ctx?.purpose || ctx?.tone || ctx?.strategy?.memo) || hasInstructions || hasCanon;
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
          {workCtx.loading && (
            <Loader2 className="h-2.5 w-2.5 shrink-0 animate-spin text-muted-foreground" />
          )}
        </button>
        {!collapsed && (
          <div className="flex flex-col gap-1.5 rounded border border-border/60 bg-muted/20 p-1.5">
            {workCtx.loading ? (
              <div className="text-[9px] text-muted-foreground/60">読み込み中…</div>
            ) : !hasAny ? (
              <div className="text-[9px] text-muted-foreground/60">
                コンテキストが設定されていません
              </div>
            ) : (
              <>
                {ctx?.purpose && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-medium text-muted-foreground">目的</span>
                    <span className="overflow-hidden text-[10px] leading-snug text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                      {ctx.purpose}
                    </span>
                  </div>
                )}
                {ctx?.tone && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-medium text-muted-foreground">トーン</span>
                    <span className="overflow-hidden text-[10px] leading-snug text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]">
                      {ctx.tone}
                    </span>
                  </div>
                )}
                {ctx?.strategy?.memo && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-medium text-muted-foreground">方針メモ</span>
                    <span className="overflow-hidden text-[10px] leading-snug text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]">
                      {ctx.strategy.memo}
                    </span>
                  </div>
                )}
                {hasInstructions && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-medium text-muted-foreground">Pool の指示</span>
                    <div className="flex flex-col gap-0.5">
                      {instructionBlocks.map((block) => {
                        const isExpanded = expandedInstructionId === block.id;
                        const isEditing = editingInstructionId === block.id;
                        const isSaving = savingInstructionId === block.id;
                        return (
                          <div
                            key={block.id}
                            className="flex flex-col rounded border border-border/50 bg-background/50"
                          >
                            {/* タイトル行（クリックで body_md を展開） */}
                            <button
                              type="button"
                              className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted/50"
                              onClick={() => {
                                const opening = expandedInstructionId !== block.id;
                                setExpandedInstructionId(opening ? block.id : null);
                                if (!opening) setEditingInstructionId(null);
                              }}
                              title={isExpanded ? `${block.title} を閉じる` : `${block.title} を展開`}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                              )}
                              <span className="min-w-0 flex-1 truncate text-[10px] leading-snug text-foreground">
                                {block.title}
                              </span>
                            </button>
                            {/* 展開時: body_md 表示 + インライン編集 */}
                            {isExpanded && (
                              <div className="flex flex-col gap-1 px-1 pb-1">
                                {isEditing ? (
                                  <>
                                    <textarea
                                      className="w-full resize-y rounded border border-border bg-background px-1.5 py-1 text-[10px] leading-snug text-foreground focus:border-primary focus:outline-none"
                                      style={{ minHeight: "5rem" }}
                                      value={editingBodyDraft}
                                      onChange={(e) => setEditingBodyDraft(e.target.value)}
                                      disabled={isSaving}
                                    />
                                    <div className="flex justify-end gap-1">
                                      <button
                                        type="button"
                                        className="rounded px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                                        onClick={() => setEditingInstructionId(null)}
                                        disabled={isSaving}
                                      >
                                        キャンセル
                                      </button>
                                      <button
                                        type="button"
                                        className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary hover:bg-primary/20 disabled:opacity-50"
                                        onClick={() => void handleSaveInstruction(block)}
                                        disabled={isSaving}
                                      >
                                        {isSaving ? "保存中…" : "保存"}
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <pre className="whitespace-pre-wrap break-words font-sans text-[10px] leading-snug text-foreground/80">
                                      {block.body_md || "(本文なし)"}
                                    </pre>
                                    <button
                                      type="button"
                                      className="self-end rounded px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-muted hover:text-foreground"
                                      onClick={() => {
                                        setEditingInstructionId(block.id);
                                        setEditingBodyDraft(block.body_md);
                                      }}
                                    >
                                      編集
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {hasCanon && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-medium text-muted-foreground">
                      事業正典（継承）
                    </span>
                    <span className="overflow-hidden text-[10px] leading-snug text-foreground [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4]">
                      {canonMarkdown}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="flex h-full min-h-0 text-xs" style={WORKPOOL_PANEL_CONTAIN_STYLE}>
      {/* 左サブタブ rail（ワークプール / ドメイン / ブランド）。1 軸しか無ければ非表示。 */}
      {showScopeRail && (
        <nav
          className="flex shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-muted/20 p-1"
          aria-label="素材の分類"
        >
          {scopeTabs.map(({ id, label, icon: Icon }) => {
            const active = materialScope === id;
            return (
              <button
                key={id}
                type="button"
                className={`flex w-12 flex-col items-center gap-0.5 rounded border px-1 py-1.5 text-[9px] leading-tight transition ${
                  active
                    ? "border-primary/45 bg-primary/10 text-primary"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                onClick={() => setMaterialScope(id)}
                title={label}
                aria-pressed={active}
              >
                <Icon className="h-4 w-4" />
                <span className="max-w-full truncate">{label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto p-2">
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
        {/* 検索ボックス（素材名のフリーワード絞り込み） */}
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="素材を検索"
            aria-label="素材を検索"
            className="h-6 w-full rounded border border-border bg-muted/30 pl-6 pr-6 text-[10px] text-foreground placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              className="absolute right-1 top-1/2 flex h-3.5 w-3.5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition hover:text-foreground"
              onClick={() => setSearchQuery("")}
              aria-label="検索をクリア"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        {/* フィルター（アイコンのみ・コンパクト）。中身は body へ portal するポップオーバー。 */}
        <button
          ref={filterBtnRef}
          type="button"
          className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded border transition ${
            filterPopoverOpen || filtersActive
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-muted/20 text-muted-foreground hover:border-primary hover:text-primary"
          }`}
          onClick={() => {
            setViewPopoverOpen(false);
            setFilterPopoverOpen((v) => !v);
          }}
          title={`表示条件: ${activeFilterLabel}`}
          aria-label="表示条件"
        >
          <ListFilter className="h-3.5 w-3.5" />
          {filtersActive && (
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary ring-1 ring-background" />
          )}
        </button>

        {/* 表示切替（1 ボタン → ポップオーバーで カード / コンパクト / リスト を切替） */}
        <button
          ref={viewBtnRef}
          type="button"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border transition ${
            viewPopoverOpen
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-muted/20 text-muted-foreground hover:border-primary hover:text-primary"
          }`}
          onClick={() => {
            setFilterPopoverOpen(false);
            setViewPopoverOpen((v) => !v);
          }}
          title={`表示: ${VIEW_MODES.find((v) => v.id === viewMode)?.label ?? ""}`}
          aria-label="表示切替"
        >
          <CurrentViewIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* フィルター ポップオーバー（portal + fixed で確実に最前面） */}
      <AnchoredPopover
        anchorRef={filterBtnRef}
        open={filterPopoverOpen}
        onClose={() => setFilterPopoverOpen(false)}
        align="right"
        width={Math.min(320, typeof window !== "undefined" ? window.innerWidth - 16 : 320)}
      >
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
      </AnchoredPopover>

      {/* 表示切替 ポップオーバー */}
      <AnchoredPopover
        anchorRef={viewBtnRef}
        open={viewPopoverOpen}
        onClose={() => setViewPopoverOpen(false)}
        align="right"
        width={160}
      >
        <div className="flex flex-col gap-0.5">
          {VIEW_MODES.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] transition ${
                viewMode === id
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-muted"
              }`}
              onClick={() => {
                setViewMode(id);
                setViewPopoverOpen(false);
              }}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {viewMode === id && <Check className="h-3 w-3 shrink-0" />}
            </button>
          ))}
        </div>
      </AnchoredPopover>

      {/* 追加経路（永続モード）: ＋追加 → ローカル取込 / Pool から選択。
          既定 false。video 等は外部の追加 FAB を持つため内蔵ボタンは隠す。 */}
      {showInlineAdd && (bound ? (
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
      ))}

      {/* 複数選択（範囲選択 / ⌘/Ctrl+クリック）中の一括操作バー。 */}
      {selectedKeys.size >= 2 && (
        <div
          data-no-marquee
          className="flex items-center justify-between gap-2 rounded border border-primary/40 bg-primary/5 px-2 py-1 text-[10px]"
        >
          <span className="font-medium text-primary">{selectedKeys.size}件選択中</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              onClick={() => setSelectedKeys(new Set())}
            >
              選択解除
            </button>
            <button
              type="button"
              className="flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 font-medium text-primary-foreground transition hover:bg-primary/90"
              onClick={analyzeSelectedEntries}
            >
              <Sparkles className="h-3 w-3" />
              分析
            </button>
            <button
              type="button"
              className="flex items-center gap-1 rounded bg-destructive/90 px-1.5 py-0.5 font-medium text-destructive-foreground transition hover:bg-destructive"
              onClick={() => void removeSelectedEntries()}
            >
              <Trash2 className="h-3 w-3" />
              削除
            </button>
          </div>
        </div>
      )}

      {/* §3.3 層3: コンテキストセクション（Work 文脈の開示。既定折りたたみ / 検索対象外）。 */}
      {renderContextSection()}

      {/* 素材棚: 選択中の左サブタブ（ワークプール / ドメイン / ブランド）の素材を表示。
          余白からのドラッグで範囲選択（marquee）できる（カード上では D&D を尊重）。 */}
      {activeExtraTab ? (
        <div className="relative flex min-h-0 flex-1 flex-col">{activeExtraTab.render()}</div>
      ) : (
      <div
        ref={marqueeContainerRef}
        className={`relative flex min-h-0 flex-1 flex-col gap-2 ${marquee ? "select-none" : ""}`}
        onPointerDown={handleMarqueePointerDown}
        onPointerMove={handleMarqueePointerMove}
        onPointerUp={endMarquee}
        onPointerCancel={endMarquee}
      >
        {materialScope === "workpool" && (
          <>
            {pendingItems.length > 0 && (
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(5rem, 1fr))" }}
              >
                {pendingItems.map((p) => (
                  <div
                    key={p.id}
                    className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-primary/60 bg-primary/5 text-center text-[8px] font-medium text-primary"
                    title="保存中…ここに入ります"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>ここに入るよ</span>
                  </div>
                ))}
              </div>
            )}
            {/* §3.3 層1: 素材（画像/動画/音声）— 既定展開 */}
            {mediaWorkEntries.length > 0 && renderMaterialSection({
              sectionId: "media",
              title: "素材",
              entries: mediaWorkEntries,
              totalCount: entries.filter(
                (e) => MEDIA_TYPES.has((e.itemType ?? "").toLowerCase()),
              ).length,
            })}
            {/* §3.3 層2: 参照データ（PDF/ドキュメント/テキスト/URL 等）— 既定折りたたみ・空でも常時表示 */}
            <div className={mediaWorkEntries.length > 0 ? "border-t border-border/70 pt-2" : ""}>
              {renderMaterialSection({
                sectionId: "data",
                title: `参照データ (${dataWorkEntries.length})`,
                entries: dataWorkEntries,
                totalCount: entries.filter(
                  (e) => !MEDIA_TYPES.has((e.itemType ?? "").toLowerCase()),
                ).length,
              })}
            </div>
            {/* 両セクションとも空の場合は D&D ヒントを表示する。 */}
            {mediaWorkEntries.length === 0 && dataWorkEntries.length === 0 && (
              <div
                className={`min-h-[80px] rounded border border-dashed border-border p-1 transition ${
                  dropActive ? "border-primary/60 bg-primary/5" : ""
                }`}
                onDragOver={handleShelfDragOver}
                onDragLeave={handleShelfDragLeave}
                onDrop={(e) => handleDrop(addRole, e)}
              >
                <div className="text-center py-5 text-[9px] text-muted-foreground/70">
                  {`ここに素材を D&D${hasRoleFilter ? `（${addRoleLabel} に分類）` : ""}`}
                </div>
              </div>
            )}
            {workStateEntries.length > 0 && (
              <div className="border-t border-border/70 pt-2">{renderWorkStateSection()}</div>
            )}
          </>
        )}
        {materialScope === "domain" &&
          domainSections.map((section) => (
            <div
              key={section.library}
              className="border-t border-border/70 pt-2 first:border-t-0 first:pt-0"
            >
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
        {materialScope === "brand" &&
          brandSections.map((section) => (
            <div
              key={section.library}
              className="border-t border-border/70 pt-2 first:border-t-0 first:pt-0"
            >
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

        {/* 範囲選択中の矩形（client 座標 → コンテナ相対へ変換）。 */}
        {marquee &&
          marqueeContainerRef.current &&
          (() => {
            const rect = marqueeContainerRef.current.getBoundingClientRect();
            const left = Math.min(marquee.startX, marquee.curX) - rect.left;
            const top = Math.min(marquee.startY, marquee.curY) - rect.top;
            const width = Math.abs(marquee.curX - marquee.startX);
            const height = Math.abs(marquee.curY - marquee.startY);
            return (
              <div
                aria-hidden
                className="pointer-events-none absolute z-20 rounded-sm border border-primary/70 bg-primary/15"
                style={{ left, top, width, height }}
              />
            );
          })()}
      </div>
      )}

      {entryContextMenu && (() => {
        // 右クリックした素材が複数選択に含まれていれば、その選択全体を対象にする。
        const inSelection =
          selectedKeys.size >= 2 &&
          selectedKeys.has(entryKey(entryContextMenu.entry, lib));
        const analyzeCount = inSelection ? selectedKeys.size : 1;
        return (
          <MaterialContextMenu
            state={entryContextMenu}
            analyzing={analyzingIds.has(entryContextMenu.entry.id)}
            analyzeCount={analyzeCount}
            onAnalyze={() => {
              if (inSelection) analyzeEntriesByKeys(selectedKeys);
              else requestAnalyze(entryContextMenu.entry);
              setEntryContextMenu(null);
            }}
            onRemove={() => {
              if (inSelection) void removeSelectedEntries();
              else void removeEntry(entryContextMenu.entry);
              setEntryContextMenu(null);
            }}
            removable={!entryContextMenu.entry.readonly}
            onClose={() => setEntryContextMenu(null)}
          />
        );
      })()}

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
    </div>
  );
});

/**
 * アンカー要素（ボタン）の直下に出すポップオーバー。
 * `document.body` への portal + `position:fixed` で描画するため、祖先の
 * `overflow` / `contain` / stacking context に影響されず、必ず最前面（z-9999）に出る。
 * 旧実装は絶対配置のため下のカードに潜り込んで欠けて見えていた（レイヤー不具合）ので置換。
 * 画面外クリック / Esc / スクロール / リサイズで閉じる。
 */
function AnchoredPopover({
  anchorRef,
  open,
  onClose,
  children,
  align = "left",
  width = 260,
}: {
  anchorRef: { current: HTMLElement | null };
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "left" | "right";
  width?: number;
}) {
  const popRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    let left = align === "right" ? rect.right - width : rect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
    const top = Math.min(rect.bottom + 4, window.innerHeight - margin);
    setPos({ top, left });
  }, [open, align, width, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (popRef.current?.contains(target)) return;
      // アンカー（トグルボタン）上のクリックはボタン側 onClick に委ねる
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onReflow = (e: Event) => {
      // ポップオーバー内部のスクロールでは閉じない
      if (popRef.current?.contains(e.target as Node | null)) return;
      onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("resize", onReflow, true);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("resize", onReflow, true);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={popRef}
      className="rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-xl"
      style={{ position: "fixed", top: pos.top, left: pos.left, width, zIndex: 9999 }}
    >
      {children}
    </div>,
    document.body,
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

const MaterialCard = memo(function MaterialCard({
  entry,
  dataKey,
  thumbUrl,
  thumbGenerating,
  isAnalyzing,
  selected,
  onPointerDown,
  onClick,
  onDoubleClick,
  draggable,
  onDragStart,
  onContextMenu,
  onMount,
}: {
  entry: DisplayEntry;
  dataKey?: string;
  thumbUrl: string | null;
  thumbGenerating: boolean;
  isAnalyzing: boolean;
  selected: boolean;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onClick?: (e: ReactMouseEvent<HTMLElement>) => void;
  onDoubleClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
  onMount?: () => void;
}) {
  const mountRef = useVisibleMount(onMount);
  const name = displayNameWithoutPath(entry.label);
  const typeLabel = formatItemType(entry.itemType);
  const isAudio = (entry.itemType ?? "").toLowerCase() === "audio";
  const title = `${name}\n${typeLabel} / ${SLOT_ROLE_LABELS[entry.role]}${
    entry.analyzed ? "\n分析済み" : "\n未分析"
  }`;

  return (
    <button
      ref={mountRef}
      type="button"
      data-entry-key={dataKey}
      className={`group relative min-w-0 overflow-hidden rounded border bg-background text-left transition hover:border-primary/50 hover:bg-muted/30 ${
        selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border"
      } ${
        onPointerDown && entry.assetId ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        draggable ? "hover:border-dashed" : ""
      }`}
      style={MATERIAL_CARD_DEFER_STYLE}
      title={title}
      draggable={draggable}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onDragStart={onDragStart}
      onContextMenu={onContextMenu}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted/40">
        {/* WKWebView perf: thumb は <img> ではなく CSS background-image で描画する。<img>(replaced
            element) はデコード/ラスタが「ドキュメント全体のフレーム作業」に引き込まれ、無関係な
            パネルリサイズ / タイムラインシークの毎フレームで再デコードされてアプリ全体がカクつく
            （素材0件＝軽い / 画像1枚＝重い、の正体）。background-image は別パスで layout 変化でも
            再デコードされない。 */}
        {thumbUrl ? (
          <span
            aria-hidden="true"
            className="block h-full w-full"
            style={{
              backgroundImage: `url(${JSON.stringify(thumbUrl)})`,
              backgroundSize: "contain",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          />
        ) : thumbGenerating ? (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {isAudio ? (
              <Music className="h-5 w-5 text-muted-foreground/50" />
            ) : (
              <FileImage className="h-5 w-5 text-muted-foreground/50" />
            )}
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
}, areMaterialEntryPropsEqual);

const MaterialListRow = memo(function MaterialListRow({
  entry,
  dataKey,
  thumbUrl,
  thumbGenerating,
  isAnalyzing,
  selected,
  onPointerDown,
  onClick,
  onDoubleClick,
  draggable,
  onDragStart,
  onContextMenu,
  onMount,
}: {
  entry: DisplayEntry;
  dataKey?: string;
  thumbUrl: string | null;
  thumbGenerating: boolean;
  isAnalyzing: boolean;
  selected: boolean;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onClick?: (e: ReactMouseEvent<HTMLElement>) => void;
  onDoubleClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
  onMount?: () => void;
}) {
  const mountRef = useVisibleMount(onMount);
  const name = displayNameWithoutPath(entry.label);
  const typeLabel = formatItemType(entry.itemType);
  const isAudio = (entry.itemType ?? "").toLowerCase() === "audio";
  const title = `${name}\n${typeLabel} / ${SLOT_ROLE_LABELS[entry.role]}${
    entry.analyzed ? "\n分析済み" : "\n未分析"
  }`;

  return (
    <button
      ref={mountRef}
      type="button"
      data-entry-key={dataKey}
      className={`group flex min-w-0 items-center gap-2 rounded border bg-background px-1.5 py-1 text-left transition hover:border-primary/50 hover:bg-muted/30 ${
        selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border"
      } ${
        onPointerDown && entry.assetId ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        draggable ? "hover:border-dashed" : ""
      }`}
      style={MATERIAL_CARD_DEFER_STYLE}
      title={title}
      draggable={draggable}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onDragStart={onDragStart}
      onContextMenu={onContextMenu}
    >
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded border border-border bg-muted/40">
        {thumbUrl ? (
          <span
            aria-hidden="true"
            className="block h-full w-full"
            style={{
              backgroundImage: `url(${JSON.stringify(thumbUrl)})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          />
        ) : thumbGenerating ? (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground/50" />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {isAudio ? (
              <Music className="h-3.5 w-3.5 text-muted-foreground/50" />
            ) : (
              <FileImage className="h-3.5 w-3.5 text-muted-foreground/50" />
            )}
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
}, areMaterialEntryPropsEqual);

const MaterialCompactIcon = memo(function MaterialCompactIcon({
  entry,
  dataKey,
  thumbUrl,
  thumbGenerating,
  isAnalyzing,
  selected,
  onPointerDown,
  onClick,
  onDoubleClick,
  draggable,
  onDragStart,
  onContextMenu,
  onMount,
}: {
  entry: DisplayEntry;
  dataKey?: string;
  thumbUrl: string | null;
  thumbGenerating: boolean;
  isAnalyzing: boolean;
  selected: boolean;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onClick?: (e: ReactMouseEvent<HTMLElement>) => void;
  onDoubleClick?: () => void;
  draggable?: boolean;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void;
  onMount?: () => void;
}) {
  const mountRef = useVisibleMount(onMount);
  const name = displayNameWithoutPath(entry.label);
  const typeLabel = formatItemType(entry.itemType);
  const title = `${name}\n${typeLabel} / ${SLOT_ROLE_LABELS[entry.role]}${
    entry.analyzed ? "\n分析済み" : "\n未分析"
  }`;
  const isAudio = (entry.itemType ?? "").toLowerCase() === "audio";

  return (
    <button
      ref={mountRef}
      type="button"
      data-entry-key={dataKey}
      className={`group flex w-full max-w-[4.5rem] min-w-0 flex-col items-center gap-0.5 rounded px-0.5 py-1 text-center transition hover:bg-muted/40 ${
        selected ? "bg-primary/10 ring-1 ring-primary/30" : ""
      } ${
        onPointerDown && entry.assetId ? "cursor-grab active:cursor-grabbing" : ""
      } ${
        draggable ? "outline outline-1 outline-transparent hover:outline-dashed hover:outline-primary/40" : ""
      }`}
      style={MATERIAL_CARD_DEFER_STYLE}
      title={title}
      draggable={draggable}
      onPointerDown={onPointerDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onDragStart={onDragStart}
      onContextMenu={onContextMenu}
    >
      <div className="relative h-12 w-12 overflow-hidden rounded border border-border bg-muted/40 shadow-sm">
        {thumbUrl ? (
          <span
            aria-hidden="true"
            className="block h-full w-full"
            style={{
              backgroundImage: `url(${JSON.stringify(thumbUrl)})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
            }}
          />
        ) : thumbGenerating ? (
          <div className="flex h-full w-full items-center justify-center bg-background/80">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground/50" />
          </div>
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
}, areMaterialEntryPropsEqual);

function areMaterialEntryPropsEqual(
  prev: {
    entry: DisplayEntry;
    thumbUrl: string | null;
    thumbGenerating: boolean;
    isAnalyzing: boolean;
    selected: boolean;
  },
  next: {
    entry: DisplayEntry;
    thumbUrl: string | null;
    thumbGenerating: boolean;
    isAnalyzing: boolean;
    selected: boolean;
  },
): boolean {
  return (
    prev.entry === next.entry &&
    prev.thumbUrl === next.thumbUrl &&
    prev.thumbGenerating === next.thumbGenerating &&
    prev.isAnalyzing === next.isAnalyzing &&
    prev.selected === next.selected
  );
}

function MaterialContextMenu({
  state,
  analyzing,
  analyzeCount,
  onAnalyze,
  onRemove,
  removable,
  onClose,
}: {
  state: EntryContextMenuState;
  analyzing: boolean;
  /** 分析・削除の対象件数（複数選択中はその件数。単体なら 1）。 */
  analyzeCount: number;
  onAnalyze: () => void;
  onRemove: () => void;
  removable: boolean;
  onClose: () => void;
}) {
  const multi = analyzeCount >= 2;
  const analyzeLabel = multi
    ? `${analyzeCount}件を分析`
    : state.entry.analyzed
      ? "再分析"
      : "分析";
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
        {analyzeLabel}
      </button>
      {removable && (
        <button
          type="button"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
          {multi ? `${analyzeCount}件を削除` : "削除"}
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
