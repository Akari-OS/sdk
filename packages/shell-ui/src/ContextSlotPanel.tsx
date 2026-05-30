/**
 * ① 制作素材（旧 ContextSlotPanel、HUB-086）
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
import type { DragEvent, PointerEvent, ReactNode } from "react";
import { Plus, Check, Sparkles, X, Trash2, FileImage, Loader2 } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { SLOT_ROLE_LABELS, type SlotRole } from "@akari-os/sdk/slot";
import {
  slotListEntries,
  slotAddEntry,
  slotRemoveEntry,
  slotPromoteEntry,
  getItemThumbnail,
  analyzeItem,
} from "@akari-os/sdk/pool";

/** 全 17 SlotRole（フィルターチップ・分類 select の両方で使用） */
const ALL_SLOT_ROLES: SlotRole[] = [
  "main-track",
  "voice-over",
  "subtitle",
  "tone",
  "bgm",
  "sfx",
  "inset",
  "logo",
  "title-card",
  "lower-third",
  "font-family",
  "text-style",
  "text-fx",
  "color-grade",
  "chapter",
  "reference",
  "misc",
];

/** role → 分類タグの色（色相を散らして瞬時に見分けるため） */
const ROLE_BADGE_CLASS: Record<SlotRole, string> = {
  "main-track":   "bg-blue-500/15 text-blue-700 border-blue-500/30",
  "voice-over":   "bg-cyan-500/15 text-cyan-700 border-cyan-500/30",
  subtitle:       "bg-sky-500/15 text-sky-700 border-sky-500/30",
  tone:           "bg-teal-500/15 text-teal-700 border-teal-500/30",
  bgm:            "bg-purple-500/15 text-purple-700 border-purple-500/30",
  sfx:            "bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-500/30",
  inset:          "bg-pink-500/15 text-pink-700 border-pink-500/30",
  logo:           "bg-rose-500/15 text-rose-700 border-rose-500/30",
  "title-card":   "bg-orange-500/15 text-orange-700 border-orange-500/30",
  "lower-third":  "bg-yellow-500/15 text-yellow-700 border-yellow-500/30",
  "font-family":  "bg-lime-500/15 text-lime-700 border-lime-500/30",
  "text-style":   "bg-green-500/15 text-green-700 border-green-500/30",
  "text-fx":      "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  "color-grade":  "bg-violet-500/15 text-violet-700 border-violet-500/30",
  chapter:        "bg-indigo-500/15 text-indigo-700 border-indigo-500/30",
  reference:      "bg-amber-500/15 text-amber-800 border-amber-500/30",
  misc:           "bg-muted text-muted-foreground border-border",
};

/** ソース選択の 3 種別（モックモード: モックエントリを追加） */
type AddSource = "local" | "pool" | "library";

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
  library: {
    label: "Library から",
    desc: "公開素材を選ぶ",
    prefix: "Library 素材",
  },
};

/** 表示用エントリ（永続 view / モックの共通形） */
interface DisplayEntry {
  /** 永続モード = slot_entries.id / モード = ローカル連番 */
  id: string;
  label: string;
  role: SlotRole;
  /** コンテキスト分析済みか（永続: 参照 Pool item の analyzed_at != null） */
  analyzed: boolean;
  /** 参照 Pool item の ID（永続: slot_entries.asset_id / モック: null） */
  assetId: string | null;
}

const AKARI_POOL_ITEM_MIME = "application/x-akari-pool-item";

export interface ContextSlotPanelProps {
  workId?: string;
  variantId?: string;
  /** 素材が属する Pool 名。未指定なら current Pool に fallback（pool-impl 側） */
  library?: string | null;
  /**
   * 「＋追加 → Pool から」で**パネル内インライン切替**表示する Pool ピッカーを
   * アプリ（video 等）が注入する（studio-left-panel-modes Option A、ポップアップ禁止＝一画面化）。
   * アプリ固有の clip ブラウザ（PoolSourcePanel 等）を渡す。`onClose` で一覧へ戻る。
   * 未指定なら「Pool から」選択肢は出さない。
   */
  renderPoolPicker?: (args: { onClose: () => void }) => ReactNode;
  /**
   * 制作素材一覧の各エントリ行の PointerDown イベントコールバック。
   * タイムラインへの pointer-drag（D&D）起点として video 側が利用する。
   * assetId がある（Pool 参照行）場合のみ呼ばれる。未指定なら pointer-drag は出さない。
   */
  onEntryPointerDown?: (assetId: string, e: PointerEvent<HTMLElement>) => void;
  /**
   * 「＋追加 → ローカルから」クリック時のハンドラ。
   * 呼び出し後に自動で reload する。未指定なら「ローカルから」選択肢は出さない。
   */
  onAddFromLocal?: () => Promise<void>;
  /**
   * 「＋追加 → Library から」で**パネル内インライン切替**表示する Library ピッカーを
   * アプリが注入する（renderPoolPicker と同じ一画面化パターン）。
   * `onClose` で一覧へ戻り reload。未指定なら「Library から」選択肢は出さない。
   */
  renderLibraryPicker?: (args: { onClose: () => void }) => ReactNode;
}

export function ContextSlotPanel({
  workId,
  variantId,
  library,
  renderPoolPicker,
  onEntryPointerDown,
  onAddFromLocal,
  renderLibraryPicker,
}: ContextSlotPanelProps) {
  /** 永続モード = Work / Variant が確定しているとき */
  const bound = !!(workId && variantId);
  const lib = library ?? null;

  const [entries, setEntries] = useState<DisplayEntry[]>([]);
  const [filter, setFilter] = useState<SlotRole | "all">("all");
  /** ソース選択パネルの開閉（true = 展開中） */
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  /**
   * assetId → サムネ URL（convertFileSrc 変換済み）。
   * getItemThumbnail で取得した JPEG パスを convertFileSrc で変換して保持。
   * freeze-safe: 実動画 URL は渡さない（ADR-100 遵守）。
   */
  const [thumbCache, setThumbCache] = useState<Map<string, string>>(new Map());
  /**
   * サムネ取得中の assetId セット（重複リクエスト防止）。
   * useRef で保持し setState を呼ばない（再レンダ不要）。
   */
  const thumbFetchingRef = useRef<Set<string>>(new Set());
  /**
   * 分析中の entryId セット（ボタン busy 表示用）。
   */
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  /**
   * インラインピッカーのモード（'pool' | 'library' | null）。
   * renderPoolPicker / renderLibraryPicker の注入時、ソース選択から切替表示する。
   * null = 一覧表示。旧 poolPickerOpen を一般化。
   */
  const [pickerMode, setPickerMode] = useState<"pool" | "library" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- 永続モード: backend から読み込み ---
  const reload = useCallback(async () => {
    if (!bound) return;
    try {
      const views = await slotListEntries(lib, workId!, variantId!);
      setEntries(
        views.map((v) => ({
          id: v.id,
          label: v.asset_name ?? v.external_url ?? "(無題)",
          role: v.role,
          analyzed: v.asset_analyzed_at != null,
          assetId: v.asset_id,
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

  const counts = useMemo(() => {
    const c: Partial<Record<SlotRole, number>> = {};
    for (const e of entries) c[e.role] = (c[e.role] ?? 0) + 1;
    return c;
  }, [entries]);

  const analyzedCount = useMemo(
    () => entries.filter((e) => e.analyzed).length,
    [entries],
  );

  /** モックモード: in-memory にエントリ追加 */
  const addMockEntry = useCallback((role: SlotRole, label: string) => {
    setEntries((prev) => [
      ...prev,
      { id: `e${prev.length + 1}`, label, role, analyzed: false, assetId: null },
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
      setBusy(true);
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
      } finally {
        setBusy(false);
      }
    },
    [bound, lib, workId, variantId, addMockEntry, reload],
  );

  /** 分類（role）変更（永続 = slot_promote_entry / モック = in-memory） */
  const setRole = useCallback(
    async (id: string, role: SlotRole) => {
      if (!bound) {
        setEntries((prev) =>
          prev.map((e) => (e.id === id ? { ...e, role } : e)),
        );
        return;
      }
      setBusy(true);
      try {
        await slotPromoteEntry(lib, id, role);
        await reload();
      } catch (e) {
        console.warn("[制作素材] slot_promote_entry 失敗", e);
        setError("分類の変更に失敗しました");
      } finally {
        setBusy(false);
      }
    },
    [bound, lib, reload],
  );

  /** エントリ削除（永続 = slot_remove_entry / モック = in-memory） */
  const removeEntry = useCallback(
    async (id: string) => {
      if (!bound) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        return;
      }
      setBusy(true);
      try {
        await slotRemoveEntry(lib, id);
        await reload();
      } catch (e) {
        console.warn("[制作素材] slot_remove_entry 失敗", e);
        setError("素材の削除に失敗しました");
      } finally {
        setBusy(false);
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
    async (assetId: string) => {
      if (thumbCache.has(assetId)) return;
      if (thumbFetchingRef.current.has(assetId)) return;
      thumbFetchingRef.current.add(assetId);
      try {
        // lib が null の場合 pool-impl は current Pool にフォールバックする
        const thumbPath = await getItemThumbnail(lib ?? "akari-uploads", assetId).catch(() => null);
        if (thumbPath) {
          const url = convertFileSrc(thumbPath);
          setThumbCache((prev) => new Map(prev).set(assetId, url));
        }
      } finally {
        thumbFetchingRef.current.delete(assetId);
      }
    },
    [lib, thumbCache],
  );

  /**
   * 永続モードの「分析」ボタンハンドラ。
   * analyzeItem(library, assetId, mode?) を呼び、完了後に reload する。
   * 進捗中はエントリを analyzingIds に追加して busy バッジを表示。
   */
  const analyzeEntry = useCallback(
    async (entryId: string, assetId: string) => {
      setAnalyzingIds((prev) => new Set(prev).add(entryId));
      try {
        await analyzeItem(lib ?? "akari-uploads", assetId);
        await reload();
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
    [lib, reload],
  );

  const handleDrop = useCallback(
    (role: SlotRole, e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      // Pool item（MaterialPanel / VideoMaterialPanel が載せる JSON）優先
      let label = "素材";
      let assetId: string | null = null;
      const raw = e.dataTransfer.getData(AKARI_POOL_ITEM_MIME);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { name?: string; id?: string };
          if (parsed.name) label = parsed.name;
          if (parsed.id) assetId = parsed.id;
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

  /** モックモード: ソース選択から素材を追加 */
  const handleAddFromSource = useCallback(
    (source: AddSource) => {
      const addRole: SlotRole = filter === "all" ? "misc" : filter;
      const { prefix } = ADD_SOURCE_META[source];
      setEntries((prev) => {
        const next = prev.length + 1;
        return [
          ...prev,
          {
            id: `e${next}`,
            label: `${prefix} ${next}`,
            role: addRole,
            analyzed: false,
            assetId: null,
          },
        ];
      });
    },
    [filter],
  );

  const visible =
    filter === "all" ? entries : entries.filter((e) => e.role === filter);
  const addRole: SlotRole = filter === "all" ? "misc" : filter;

  const closePicker = useCallback(() => {
    setPickerMode(null);
    void reload();
  }, [reload]);

  // インラインピッカー表示: Pool / Library のどちらかが選択されているとき
  // 一覧の代わりに app 提供のピッカーをパネル内に出す
  // （ポップアップ禁止＝一画面化、RULES §9/§11）。閉じると一覧へ戻り reload。
  if (bound && pickerMode === "pool" && renderPoolPicker) {
    return (
      <div className="flex flex-col h-full min-h-0 text-xs">
        <div className="flex items-center gap-1.5 p-1.5 border-b border-border shrink-0">
          <button
            type="button"
            className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-primary hover:border-primary transition"
            onClick={closePicker}
          >
            <X className="w-3 h-3" />
            制作素材へ戻る
          </button>
          <span className="text-[10px] text-muted-foreground">
            Pool から追加（＋で制作素材 / D&D でタイムライン）
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {renderPoolPicker({ onClose: closePicker })}
        </div>
      </div>
    );
  }

  if (bound && pickerMode === "library" && renderLibraryPicker) {
    return (
      <div className="flex flex-col h-full min-h-0 text-xs">
        <div className="flex items-center gap-1.5 p-1.5 border-b border-border shrink-0">
          <button
            type="button"
            className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-primary hover:border-primary transition"
            onClick={closePicker}
          >
            <X className="w-3 h-3" />
            制作素材へ戻る
          </button>
          <span className="text-[10px] text-muted-foreground">
            Library から追加
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {renderLibraryPicker({ onClose: closePicker })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      {/* ヘッダー: 制作素材名 + 件数サマリ */}
      <div className="px-0.5 text-[10px] text-muted-foreground flex items-center justify-between">
        <span>
          制作素材（{entries.length} 件 / 分析済み {analyzedCount}）
        </span>
        {busy && <span className="text-[9px] opacity-60">…</span>}
      </div>

      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/10 px-1.5 py-1 text-[9px] text-destructive">
          {error}
        </div>
      )}

      {/* フィルターチップ: すべて + 各分類。チップへの D&D で分類を割り当てて投入 */}
      <div className="flex flex-wrap gap-1">
        <FilterChip
          active={filter === "all"}
          label={`すべて (${entries.length})`}
          onClick={() => setFilter("all")}
          onDrop={(e) => handleDrop("misc", e)}
        />
        {ALL_SLOT_ROLES.map((role) => (
          <FilterChip
            key={role}
            active={filter === role}
            label={`${SLOT_ROLE_LABELS[role]}${counts[role] ? ` (${counts[role]})` : ""}`}
            colorClass={ROLE_BADGE_CLASS[role]}
            onClick={() => setFilter(role)}
            onDrop={(e) => handleDrop(role, e)}
          />
        ))}
      </div>

      {/* 追加経路（永続モード）: ＋追加 → ソース選択。Pool / Library からはパネル内インライン切替 */}
      {bound ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className={`self-start flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition ${
              sourcePickerOpen
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:text-primary hover:border-primary"
            }`}
            onClick={() => setSourcePickerOpen((v) => !v)}
          >
            {sourcePickerOpen ? (
              <X className="w-3 h-3" />
            ) : (
              <Plus className="w-3 h-3" />
            )}
            {sourcePickerOpen ? "閉じる" : "追加"}
          </button>

          {sourcePickerOpen && (
            <div className="flex flex-col gap-0.5 rounded border border-border bg-muted/30 p-1.5">
              {onAddFromLocal ? (
                <button
                  type="button"
                  className="flex items-start gap-1.5 rounded px-1.5 py-1 text-left text-[10px] text-muted-foreground hover:bg-muted hover:text-primary transition"
                  onClick={async () => {
                    setSourcePickerOpen(false);
                    await onAddFromLocal();
                    await reload();
                  }}
                >
                  <Plus className="w-3 h-3 mt-0.5 shrink-0" />
                  <span className="flex flex-col">
                    <span className="font-medium">ローカルから取込</span>
                    <span className="text-[9px] text-muted-foreground/60">
                      ファイルを Pool item 化
                    </span>
                  </span>
                </button>
              ) : null}
              {renderPoolPicker ? (
                <button
                  type="button"
                  className="flex items-start gap-1.5 rounded px-1.5 py-1 text-left text-[10px] text-muted-foreground hover:bg-muted hover:text-primary transition"
                  onClick={() => {
                    setSourcePickerOpen(false);
                    setPickerMode("pool");
                  }}
                >
                  <Plus className="w-3 h-3 mt-0.5 shrink-0" />
                  <span className="flex flex-col">
                    <span className="font-medium">Pool から</span>
                    <span className="text-[9px] text-muted-foreground/60">
                      この場で Pool を開いて素材を選ぶ
                    </span>
                  </span>
                </button>
              ) : null}
              {renderLibraryPicker ? (
                <button
                  type="button"
                  className="flex items-start gap-1.5 rounded px-1.5 py-1 text-left text-[10px] text-muted-foreground hover:bg-muted hover:text-primary transition"
                  onClick={() => {
                    setSourcePickerOpen(false);
                    setPickerMode("library");
                  }}
                >
                  <Plus className="w-3 h-3 mt-0.5 shrink-0" />
                  <span className="flex flex-col">
                    <span className="font-medium">Library から</span>
                    <span className="text-[9px] text-muted-foreground/60">
                      公開素材を選ぶ
                    </span>
                  </span>
                </button>
              ) : null}
              <div className="text-[9px] text-muted-foreground/60 px-1 pt-0.5">
                Pool 素材は下のエリア / チップへ D&D でも追加できます
                {filter !== "all"
                  ? `（${SLOT_ROLE_LABELS[addRole]} に分類）`
                  : ""}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className={`self-start flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition ${
              sourcePickerOpen
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:text-primary hover:border-primary"
            }`}
            onClick={() => setSourcePickerOpen((v) => !v)}
          >
            {sourcePickerOpen ? (
              <X className="w-3 h-3" />
            ) : (
              <Plus className="w-3 h-3" />
            )}
            {sourcePickerOpen ? "閉じる" : "追加"}
            {!sourcePickerOpen && filter !== "all"
              ? `（${SLOT_ROLE_LABELS[addRole]}）`
              : ""}
          </button>

          {sourcePickerOpen && (
            <div className="flex flex-col gap-0.5 rounded border border-border bg-muted/30 p-1.5">
              <div className="text-[9px] text-muted-foreground/70 mb-0.5">
                追加するソースを選択
                {filter !== "all"
                  ? `（${SLOT_ROLE_LABELS[addRole]} に分類）`
                  : ""}
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

      {/* 素材一覧（フラット）。各 item に分類タグ + 分析状態 + 削除 */}
      <div
        className="flex flex-col gap-1 rounded border border-dashed border-border p-1 min-h-[80px]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop(addRole, e)}
      >
        {visible.length === 0 ? (
          <div className="text-[9px] text-muted-foreground/70 text-center py-5">
            ここに素材を D&D
            {filter !== "all" ? `（${SLOT_ROLE_LABELS[filter]} に分類）` : ""}
          </div>
        ) : (
          visible.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              bound={bound}
              thumbUrl={entry.assetId ? (thumbCache.get(entry.assetId) ?? null) : null}
              isAnalyzing={analyzingIds.has(entry.id)}
              onPointerDown={
                onEntryPointerDown && entry.assetId
                  ? (e) => onEntryPointerDown(entry.assetId!, e)
                  : undefined
              }
              onRoleChange={(role) => void setRole(entry.id, role)}
              onAnalyze={
                bound && !entry.analyzed && entry.assetId
                  ? () => void analyzeEntry(entry.id, entry.assetId!)
                  : !bound
                    ? () => analyzeMock(entry.id)
                    : undefined
              }
              onRemove={() => void removeEntry(entry.id)}
              onMount={
                entry.assetId
                  ? () => void fetchThumb(entry.assetId!)
                  : undefined
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * EntryRow — 制作素材内の 1 エントリ行。
 *
 * - サムネ（assetId があれば遅延ロード）: JPEG サムネ or アイコン fallback
 * - 分類タグ（色付き select）
 * - 素材名
 * - 分析状態 / 分析ボタン（永続モード: 実トリガ / モック: フラグトグル）
 * - 削除ボタン
 *
 * freeze-safe: <img> を使い <video> には渡さない（ADR-100）。
 */
function EntryRow({
  entry,
  bound,
  thumbUrl,
  isAnalyzing,
  onPointerDown,
  onRoleChange,
  onAnalyze,
  onRemove,
  onMount,
}: {
  entry: DisplayEntry;
  bound: boolean;
  /** JPEG サムネ URL（convertFileSrc 変換済み）。null = fallback アイコン */
  thumbUrl: string | null;
  /** 分析中フラグ（busy スピナー表示） */
  isAnalyzing: boolean;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onRoleChange: (role: SlotRole) => void;
  /** undefined = 分析ボタン非表示（分析済み or assetId なし） */
  onAnalyze?: () => void;
  onRemove: () => void;
  /** マウント時にサムネ取得を開始するコールバック（assetId がある行のみ） */
  onMount?: () => void;
}) {
  // マウント時にサムネ取得を開始（assetId ごとに 1 回）
  useEffect(() => {
    onMount?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.assetId]);

  return (
    <div
      className={`flex items-center gap-1.5 rounded bg-background px-1.5 py-1 border border-border ${
        onPointerDown && entry.assetId ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      onPointerDown={onPointerDown}
    >
      {/* サムネ（32×32 px、freeze-safe <img>）/ アイコン fallback */}
      <div className="shrink-0 w-8 h-8 rounded border border-border bg-muted/40 overflow-hidden flex items-center justify-center">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <FileImage className="w-3.5 h-3.5 text-muted-foreground/50" />
        )}
      </div>

      {/* 分類タグ = 色付き select（瞬時に判別 + クリックで変更） */}
      <select
        value={entry.role}
        onChange={(e) => onRoleChange(e.target.value as SlotRole)}
        className={`shrink-0 rounded border px-1 py-0.5 text-[9px] ${ROLE_BADGE_CLASS[entry.role] ?? ROLE_BADGE_CLASS.misc}`}
        title="分類を変更"
      >
        {ALL_SLOT_ROLES.map((r) => (
          <option key={r} value={r}>
            {SLOT_ROLE_LABELS[r]}
          </option>
        ))}
      </select>

      <span className="truncate flex-1 text-[10px]" title={entry.label}>
        {entry.label}
      </span>

      {/* 分析状態 / 分析ボタン */}
      {entry.analyzed ? (
        <span
          className="shrink-0 flex items-center gap-0.5 text-[9px] text-green-600"
          title="コンテキスト分析済み"
        >
          <Check className="w-3 h-3" />
          分析済み
        </span>
      ) : isAnalyzing ? (
        <span className="shrink-0 flex items-center gap-0.5 text-[9px] text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          分析中
        </span>
      ) : onAnalyze ? (
        <button
          type="button"
          className="shrink-0 flex items-center gap-0.5 rounded border border-border px-1 py-0.5 text-[9px] text-muted-foreground hover:text-primary hover:border-primary transition"
          title={bound ? "コンテキストとして分析（pool-impl 呼び出し）" : "コンテキストとして分析（モック）"}
          onClick={onAnalyze}
        >
          <Sparkles className="w-3 h-3" />
          分析
        </button>
      ) : null /* assetId なし（external_url のみ）または分析済みは非表示 */}

      {/* 削除 */}
      <button
        type="button"
        className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-destructive transition"
        title="制作素材から外す"
        onClick={onRemove}
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function FilterChip({
  active,
  label,
  colorClass,
  onClick,
  onDrop,
}: {
  active: boolean;
  label: string;
  colorClass?: string;
  onClick: () => void;
  onDrop: (e: DragEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className={`rounded-full border px-2 py-0.5 text-[10px] transition ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : (colorClass ??
            "bg-muted/50 text-muted-foreground border-border hover:border-primary")
      }`}
    >
      {label}
    </button>
  );
}
