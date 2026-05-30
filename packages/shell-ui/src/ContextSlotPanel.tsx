/**
 * ① ワークプール（旧 ContextSlotPanel、HUB-086）
 *
 * studio-left-panel-modes-2026-05-30.md §2 のワークプールへ refine（session 117）。
 * 旧「コンテキスト」→「ワークプール」に改称し、+追加をインラインのソース選択に変更。
 *
 * 変更サマリ:
 *   - ヘッダーを「ワークプール（N 件 / 分析済み M）」に変更
 *   - フィルターチップ + フラット一覧 + 色付き分類タグ(select) + 分析状態/分析ボタン は維持
 *   - 「+追加」→ インラインのソース選択（ローカルから取込 / Pool から / Library から）に変更。
 *     モーダルなし（RULES §9/§11）。再度押すと畳む。
 *
 * Phase 1 配線予定:
 *   - role 割当       → `slot_entries.role`
 *   - 分類フィルタ     → role での絞り込み
 *   - 分析状態        → 参照 Pool item の `analyzed_at`（`PoolItemSummary`）
 *   - 「分析」ボタン   → pool-impl analyzer 呼び出し
 *   - ソース選択      → ローカルは OS dialog / Pool・Library は pool-impl 検索パネル
 *
 * 関連: spec `akari-os/docs/sdd/specs/spec-slot-and-work-context-schema.md` §2 / §9 Phase 0
 *       design `akari-os/docs/design/studio-left-panel-modes-2026-05-30.md` §2
 */

import { useCallback, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { Plus, Check, Sparkles, X } from "lucide-react";
import { SLOT_ROLE_LABELS, type SlotRole } from "@akari-os/sdk/slot";

/** Phase 0 で扱う分類（4 つ）。filter / tag に使う */
const PHASE0_ROLES: SlotRole[] = ["main-track", "bgm", "reference", "misc"];

/** role → 分類タグの色（瞬時に見分けるため） */
const ROLE_BADGE_CLASS: Record<string, string> = {
  "main-track": "bg-blue-500/15 text-blue-700 border-blue-500/30",
  bgm: "bg-purple-500/15 text-purple-700 border-purple-500/30",
  reference: "bg-amber-500/15 text-amber-800 border-amber-500/30",
  misc: "bg-muted text-muted-foreground border-border",
};

/** ソース選択の 3 種別（Phase 0: モックエントリを追加） */
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

/** スロットに入った素材のモックエントリ（Phase 0 in-memory） */
interface MockEntry {
  id: string;
  label: string;
  role: SlotRole;
  /** コンテキスト分析済みか（Phase 1: 参照 Pool item の analyzed_at != null） */
  analyzed: boolean;
}

const AKARI_POOL_ITEM_MIME = "application/x-akari-pool-item";

export interface ContextSlotPanelProps {
  workId?: string;
  variantId?: string;
}

export function ContextSlotPanel(_props: ContextSlotPanelProps) {
  const [entries, setEntries] = useState<MockEntry[]>([]);
  const [filter, setFilter] = useState<SlotRole | "all">("all");
  /** ソース選択パネルの開閉（true = 展開中） */
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);

  const counts = useMemo(() => {
    const c: Partial<Record<SlotRole, number>> = {};
    for (const e of entries) c[e.role] = (c[e.role] ?? 0) + 1;
    return c;
  }, [entries]);

  const analyzedCount = useMemo(
    () => entries.filter((e) => e.analyzed).length,
    [entries],
  );

  const addEntry = useCallback((role: SlotRole, label: string) => {
    setEntries((prev) => [
      ...prev,
      { id: `e${prev.length + 1}`, label, role, analyzed: false },
    ]);
  }, []);

  const setRole = useCallback((id: string, role: SlotRole) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, role } : e)));
  }, []);

  const analyze = useCallback((id: string) => {
    // Phase 0: モックで分析済みに。Phase 1 で pool-impl analyzer を呼んで
    // 参照 Pool item の analyzed_at / ai_summary / ai_tags を更新する。
    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, analyzed: true } : e)),
    );
  }, []);

  const handleDrop = useCallback(
    (role: SlotRole, e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      // Pool item（MaterialPanel / VideoMaterialPanel が載せる JSON）優先、
      // 無ければ text を素材名として扱う。
      let label = "素材";
      const raw = e.dataTransfer.getData(AKARI_POOL_ITEM_MIME);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { name?: string };
          if (parsed.name) label = parsed.name;
        } catch {
          /* noop: 不正 JSON は default label */
        }
      } else {
        const text = e.dataTransfer.getData("text/plain");
        if (text) label = text;
      }
      addEntry(role, label);
    },
    [addEntry],
  );

  /** ソース選択から素材を追加（Phase 0: モックエントリ） */
  const handleAddFromSource = useCallback(
    (source: AddSource) => {
      const addRole: SlotRole = filter === "all" ? "misc" : filter;
      // Phase 1 ではソース種別に応じて OS dialog / pool-impl 検索パネルを開く。
      // Phase 0 はソース名 + 連番のモックエントリを即追加。
      const { prefix } = ADD_SOURCE_META[source];
      setEntries((prev) => {
        const next = prev.length + 1;
        return [
          ...prev,
          { id: `e${next}`, label: `${prefix} ${next}`, role: addRole, analyzed: false },
        ];
      });
      // ソース選択パネルは追加後も開いたまま（複数追加を想定）
    },
    [filter],
  );

  const visible =
    filter === "all" ? entries : entries.filter((e) => e.role === filter);
  const addRole: SlotRole = filter === "all" ? "misc" : filter;

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      {/* ヘッダー: ワークプール名 + 件数サマリ */}
      <div className="px-0.5 text-[10px] text-muted-foreground">
        ワークプール（{entries.length} 件 / 分析済み {analyzedCount}）
      </div>

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

      {/* +追加ボタン → インラインソース選択トグル（モーダルなし、RULES §9/§11） */}
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

        {/* インライン展開: ソース選択 3 ボタン */}
        {sourcePickerOpen && (
          <div className="flex flex-col gap-0.5 rounded border border-border bg-muted/30 p-1.5">
            <div className="text-[9px] text-muted-foreground/70 mb-0.5">
              追加するソースを選択
              {filter !== "all" ? `（${SLOT_ROLE_LABELS[addRole]} に分類）` : ""}
            </div>
            {(Object.entries(ADD_SOURCE_META) as [AddSource, (typeof ADD_SOURCE_META)[AddSource]][]).map(
              ([source, meta]) => (
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
              ),
            )}
          </div>
        )}
      </div>

      {/* 素材一覧（フラット）。各 item に分類タグ + 分析状態 */}
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
                onChange={(e) => setRole(entry.id, e.target.value as SlotRole)}
                className={`shrink-0 rounded border px-1 py-0.5 text-[9px] ${ROLE_BADGE_CLASS[entry.role]}`}
                title="分類を変更"
              >
                {PHASE0_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {SLOT_ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <span className="truncate flex-1" title={entry.label}>
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
              ) : (
                <button
                  type="button"
                  className="shrink-0 flex items-center gap-0.5 rounded border border-border px-1 py-0.5 text-[9px] text-muted-foreground hover:text-primary hover:border-primary transition"
                  title="コンテキストとして分析（Phase 0: モック）"
                  onClick={() => analyze(entry.id)}
                >
                  <Sparkles className="w-3 h-3" />
                  分析
                </button>
              )}
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
