/**
 * ContextSlotPanel — Context-First Panel の Context モード（AKARI-HUB-086 Phase 0 skeleton）。
 *
 * 役割を持ったスロット（main-track / bgm / reference / misc 等）を VS Code Explorer 風の
 * コラプス可能ツリーで表示する skeleton。Phase 0 ではスロット定義をモックで持ち、
 * Pool item の drop（または「+ 追加」）で in-memory にエントリを足せることを確認する。
 *
 * Phase 1 で work_states / works.context_json への永続化、pool_get_work_context /
 * slot_add_entry 等の Tauri command 配線、全 17 スロット表示へ拡張する。
 *
 * 関連: spec `akari-os/docs/sdd/specs/spec-slot-and-work-context-schema.md` §2 / §9 Phase 0
 */

import { useCallback, useState } from "react";
import type { DragEvent } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import {
  SLOT_ROLE_LABELS,
  type SlotDefinition,
  type SlotRole,
} from "@akari-os/sdk/slot";

/** Phase 0 表示対象の 4 スロット（spec §9 Phase 0） */
const PHASE0_SLOTS: SlotDefinition[] = [
  {
    role: "main-track",
    accepted_asset_types: ["video", "image"],
    cardinality: "1+",
    label_ja: SLOT_ROLE_LABELS["main-track"],
    enabled: true,
  },
  {
    role: "bgm",
    accepted_asset_types: ["audio"],
    cardinality: "0..n",
    label_ja: SLOT_ROLE_LABELS.bgm,
    enabled: true,
  },
  {
    role: "reference",
    accepted_asset_types: ["video", "audio", "image", "text", "url"],
    cardinality: "0..n",
    label_ja: SLOT_ROLE_LABELS.reference,
    enabled: true,
  },
  {
    role: "misc",
    accepted_asset_types: ["any"],
    cardinality: "0..n",
    label_ja: SLOT_ROLE_LABELS.misc,
    enabled: true,
  },
];

/** スロットに入った素材のモックエントリ（Phase 0 in-memory） */
interface MockEntry {
  id: string;
  label: string;
}

/** MaterialPanel / VideoMaterialPanel が dragstart で載せる Pool item の MIME */
const AKARI_POOL_ITEM_MIME = "application/x-akari-pool-item";

export interface ContextSlotPanelProps {
  /** Phase 1 で work / variant に紐づけて永続化する。Phase 0 skeleton では未使用 */
  workId?: string;
  variantId?: string;
}

export function ContextSlotPanel(_props: ContextSlotPanelProps) {
  const [entries, setEntries] = useState<Partial<Record<SlotRole, MockEntry[]>>>(
    {},
  );
  const [collapsed, setCollapsed] = useState<Partial<Record<SlotRole, boolean>>>(
    {},
  );

  const addEntry = useCallback((role: SlotRole, label: string) => {
    setEntries((prev) => {
      const list = prev[role] ?? [];
      const id = `${role}-${list.length + 1}`;
      return { ...prev, [role]: [...list, { id, label }] };
    });
  }, []);

  const toggle = useCallback((role: SlotRole) => {
    setCollapsed((prev) => ({ ...prev, [role]: !prev[role] }));
  }, []);

  const handleDrop = useCallback(
    (role: SlotRole, e: DragEvent<HTMLDivElement>) => {
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

  return (
    <div className="flex flex-col gap-1 p-2 text-xs">
      <div className="px-1 pb-1 text-[10px] text-muted-foreground">
        Context モード（HUB-086 Phase 0 skeleton）— スロットに素材を D&D / 追加
      </div>
      {PHASE0_SLOTS.map((slot) => {
        const list = entries[slot.role] ?? [];
        const isCollapsed = collapsed[slot.role] ?? false;
        return (
          <div
            key={slot.role}
            className="rounded border border-border bg-muted/30"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(slot.role, e)}
          >
            {/* スロットヘッダー（コラプス toggle + ラベル + 件数 + 追加） */}
            <div className="flex items-center gap-1 px-1.5 py-1">
              <button
                type="button"
                className="flex items-center gap-1 flex-1 text-left hover:text-primary transition"
                onClick={() => toggle(slot.role)}
                title={`${slot.role} (${slot.cardinality})`}
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3 shrink-0" />
                ) : (
                  <ChevronDown className="w-3 h-3 shrink-0" />
                )}
                <span className="font-medium">{slot.label_ja}</span>
                <span className="text-[9px] text-muted-foreground">
                  {list.length > 0 ? `(${list.length})` : ""}
                </span>
              </button>
              <button
                type="button"
                className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-primary transition"
                title="素材を追加（Phase 0: モック）"
                onClick={() => addEntry(slot.role, `素材 ${list.length + 1}`)}
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
            {/* スロット本体（エントリ一覧 / 空のドロップヒント） */}
            {!isCollapsed && (
              <div className="px-1.5 pb-1.5 flex flex-col gap-0.5">
                {list.length === 0 ? (
                  <div className="text-[9px] text-muted-foreground/70 border border-dashed border-border rounded px-1.5 py-2 text-center">
                    ここに D&D（{slot.accepted_asset_types.join(" / ")}）
                  </div>
                ) : (
                  list.map((entry) => (
                    <div
                      key={entry.id}
                      className="truncate rounded bg-background px-1.5 py-1 border border-border"
                      title={entry.label}
                    >
                      {entry.label}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
