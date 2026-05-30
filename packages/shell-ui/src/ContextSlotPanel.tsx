/**
 * ① ワークプール（旧 ContextSlotPanel、HUB-086）
 *
 * studio-left-panel-modes-2026-05-30.md §2 のワークプール。この Work の素材 + WIP の保管庫。
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
 * Phase 1.x 残（次フェーズ）:
 *   - 「+追加」のソース選択（ローカル OS dialog / Pool・Library 検索パネル）の実装
 *   - 「分析」ボタンの実トリガ（analyzeItem。library 解決 + 進捗 UI が必要）
 *   - 全 17 スロットの分類 UI（現状は session 117 承認の 4 分類チップ）
 *
 * 関連: spec `akari-os/docs/sdd/specs/spec-slot-and-work-context-schema.md` §2 / §9 Phase 1
 *       design `akari-os/docs/design/studio-left-panel-modes-2026-05-30.md` §2
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { Plus, Check, Sparkles, X, Trash2 } from "lucide-react";
import { SLOT_ROLE_LABELS, type SlotRole } from "@akari-os/sdk/slot";
import {
  slotListEntries,
  slotAddEntry,
  slotRemoveEntry,
  slotPromoteEntry,
} from "@akari-os/sdk/pool";

/** Phase 1 の分類チップ（4 つ。データ層は全 17 role 対応）。filter / tag に使う */
const PHASE0_ROLES: SlotRole[] = ["main-track", "bgm", "reference", "misc"];

/** role → 分類タグの色（瞬時に見分けるため） */
const ROLE_BADGE_CLASS: Record<string, string> = {
  "main-track": "bg-blue-500/15 text-blue-700 border-blue-500/30",
  bgm: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  reference: "bg-amber-500/15 text-amber-800 border-amber-500/30",
  misc: "bg-muted text-muted-foreground border-border",
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
}

export function ContextSlotPanel({
  workId,
  variantId,
  library,
  renderPoolPicker,
}: ContextSlotPanelProps) {
  /** 永続モード = Work / Variant が確定しているとき */
  const bound = !!(workId && variantId);
  const lib = library ?? null;

  const [entries, setEntries] = useState<DisplayEntry[]>([]);
  const [filter, setFilter] = useState<SlotRole | "all">("all");
  /** ソース選択パネルの開閉（true = 展開中。モックモード専用） */
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  /** Pool ピッカーのインライン表示（永続モード・renderPoolPicker 注入時） */
  const [poolPickerOpen, setPoolPickerOpen] = useState(false);
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
        })),
      );
      setError(null);
    } catch (e) {
      console.warn("[ワークプール] slot_list_entries 失敗", e);
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
      { id: `e${prev.length + 1}`, label, role, analyzed: false },
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
        console.info("[ワークプール] Pool 素材を D&D してください（label のみは非対応）");
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
        console.warn("[ワークプール] slot_add_entry 失敗", e);
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
        console.warn("[ワークプール] slot_promote_entry 失敗", e);
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
        console.warn("[ワークプール] slot_remove_entry 失敗", e);
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
          },
        ];
      });
    },
    [filter],
  );

  const visible =
    filter === "all" ? entries : entries.filter((e) => e.role === filter);
  const addRole: SlotRole = filter === "all" ? "misc" : filter;

  const closePoolPicker = useCallback(() => {
    setPoolPickerOpen(false);
    void reload();
  }, [reload]);

  // 「Pool から」インライン表示: 一覧の代わりに app 提供のピッカーをパネル内に出す
  // （ポップアップ禁止＝一画面化、RULES §9/§11）。閉じると一覧へ戻り reload。
  if (bound && poolPickerOpen && renderPoolPicker) {
    return (
      <div className="flex flex-col h-full min-h-0 text-xs">
        <div className="flex items-center gap-1.5 p-1.5 border-b border-border shrink-0">
          <button
            type="button"
            className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-primary hover:border-primary transition"
            onClick={closePoolPicker}
          >
            <X className="w-3 h-3" />
            ワークプールへ戻る
          </button>
          <span className="text-[10px] text-muted-foreground">
            Pool から追加（＋でワークプール / D&D でタイムライン）
          </span>
        </div>
        <div className="flex-1 min-h-0 overflow-auto">
          {renderPoolPicker({ onClose: closePoolPicker })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      {/* ヘッダー: ワークプール名 + 件数サマリ */}
      <div className="px-0.5 text-[10px] text-muted-foreground flex items-center justify-between">
        <span>
          ワークプール（{entries.length} 件 / 分析済み {analyzedCount}）
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
        {PHASE0_ROLES.map((role) => (
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

      {/* 追加経路（永続モード）: ＋追加 → ソース選択。「Pool から」はパネル内インライン切替 */}
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
              {renderPoolPicker ? (
                <button
                  type="button"
                  className="flex items-start gap-1.5 rounded px-1.5 py-1 text-left text-[10px] text-muted-foreground hover:bg-muted hover:text-primary transition"
                  onClick={() => {
                    setSourcePickerOpen(false);
                    setPoolPickerOpen(true);
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
            <div
              key={entry.id}
              className="flex items-center gap-1.5 rounded bg-background px-1.5 py-1 border border-border"
            >
              {/* 分類タグ = 色付き select（瞬時に判別 + クリックで変更） */}
              <select
                value={entry.role}
                onChange={(e) => void setRole(entry.id, e.target.value as SlotRole)}
                className={`shrink-0 rounded border px-1 py-0.5 text-[9px] ${ROLE_BADGE_CLASS[entry.role] ?? ROLE_BADGE_CLASS.misc}`}
                title="分類を変更"
              >
                {/* 現在の role が 4 分類外でも選択肢に出す（データ層は全 17 対応） */}
                {(PHASE0_ROLES.includes(entry.role)
                  ? PHASE0_ROLES
                  : [...PHASE0_ROLES, entry.role]
                ).map((r) => (
                  <option key={r} value={r}>
                    {SLOT_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <span className="truncate flex-1" title={entry.label}>
                {entry.label}
              </span>
              {/* 分析状態 / 分析ボタン（永続モードは display-only） */}
              {entry.analyzed ? (
                <span
                  className="shrink-0 flex items-center gap-0.5 text-[9px] text-green-600"
                  title="コンテキスト分析済み"
                >
                  <Check className="w-3 h-3" />
                  分析済み
                </span>
              ) : bound ? (
                <span
                  className="shrink-0 text-[9px] text-muted-foreground/60"
                  title="未分析（分析トリガは Phase 1.x）"
                >
                  未分析
                </span>
              ) : (
                <button
                  type="button"
                  className="shrink-0 flex items-center gap-0.5 rounded border border-border px-1 py-0.5 text-[9px] text-muted-foreground hover:text-primary hover:border-primary transition"
                  title="コンテキストとして分析（モック）"
                  onClick={() => analyzeMock(entry.id)}
                >
                  <Sparkles className="w-3 h-3" />
                  分析
                </button>
              )}
              {/* 削除 */}
              <button
                type="button"
                className="shrink-0 rounded p-0.5 text-muted-foreground/60 hover:text-destructive transition"
                title="ワークプールから外す"
                onClick={() => void removeEntry(entry.id)}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
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
