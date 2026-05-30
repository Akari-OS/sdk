/**
 * ContextSlotPanel — Context モード（AKARI-HUB-086 Phase 0 skeleton, v2）。
 *
 * 中島フィードバック（session 117）で当初のスロットツリーから改設計:
 *   - 「すべて」既定 + フィルターチップで分類切替（情報過多を回避）
 *   - 素材はフラット一覧。各素材に**色付き分類タグ**（瞬時に判別 + クリックで分類変更）
 *   - 各素材に**コンテキスト分析の状態**（分析済み / 未分析）+「分析」ボタン
 *
 * これは見せ方のみで、HUB-086 のデータモデル（`SlotEntry.role` / 参照先 Pool item の
 * `analyzed_at`）はそのまま使える。Phase 1 で:
 *   - role 割当       → `slot_entries.role`
 *   - 分類フィルタ     → role での絞り込み
 *   - 分析状態        → 参照 Pool item の `analyzed_at`（`PoolItemSummary`）
 *   - 「分析」ボタン   → pool-impl analyzer 呼び出し
 * へ配線する。
 *
 * 関連: spec `akari-os/docs/sdd/specs/spec-slot-and-work-context-schema.md` §2 / §9 Phase 0
 */

import { useCallback, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { Plus, Check, Sparkles } from "lucide-react";
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

  const visible =
    filter === "all" ? entries : entries.filter((e) => e.role === filter);
  // 「すべて」では未分類で追加し、後でタグ変更。特定分類でフィルタ中はその分類で追加。
  const addRole: SlotRole = filter === "all" ? "misc" : filter;

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      {/* ヘッダー: 分析状況サマリ（分析済みが一目で分かる） */}
      <div className="px-0.5 text-[10px] text-muted-foreground">
        コンテキスト（{entries.length} 件 / 分析済み {analyzedCount}）
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

      {/* 追加 */}
      <button
        type="button"
        className="self-start flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-primary hover:border-primary transition"
        onClick={() => addEntry(addRole, `素材 ${entries.length + 1}`)}
      >
        <Plus className="w-3 h-3" />
        追加{filter !== "all" ? `（${SLOT_ROLE_LABELS[addRole]}）` : ""}
      </button>

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
