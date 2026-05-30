/**
 * WorkPanel — Studio 左パネルの 3 面コンテナ（studio-left-panel-modes / AKARI-HUB-086）。
 *
 * 「左パネル = 人間にも AI にも共通の入口」として、VS Code Activity Bar 風の
 * 3 モード切替で **① ワークプール / ② 操作 / ③ ワークフロー** を切り替える。
 *   - ① ワークプール: 何を使うか（素材 + WIP の保管庫）= ContextSlotPanel
 *   - ② 操作        : 何ができるか（操作カタログ・人間 click / AI drag）= OperationsPanel
 *   - ③ ワークフロー: どの順でやるか（手順 / レシピ）= WorkflowPanel
 *
 * 関連: design `akari-os/docs/design/studio-left-panel-modes-2026-05-30.md`
 */

import { useState, type PointerEvent, type ReactNode } from "react";
import { Package, Wrench, ListOrdered } from "lucide-react";
import { ContextSlotPanel } from "./ContextSlotPanel";
import { OperationsPanel } from "./OperationsPanel";
import { WorkflowPanel } from "./WorkflowPanel";

export type WorkMode = "workpool" | "operations" | "workflow";

const MODES: { id: WorkMode; label: string; icon: ReactNode }[] = [
  { id: "workpool", label: "ワークプール", icon: <Package className="w-3.5 h-3.5" /> },
  { id: "operations", label: "操作", icon: <Wrench className="w-3.5 h-3.5" /> },
  { id: "workflow", label: "ワークフロー", icon: <ListOrdered className="w-3.5 h-3.5" /> },
];

export interface WorkPanelProps {
  workId?: string;
  variantId?: string;
  /** 素材が属する Pool 名。未指定なら current Pool に fallback */
  library?: string | null;
  /** OperationsPanel の「実行」クリック → アプリ側のアクションハンドラ */
  onRunOperation?: (id: string) => void;
  /** ワークプールの「Pool から」インライン Pool ピッカー（ContextSlotPanel へ pass-through） */
  renderPoolPicker?: (args: { onClose: () => void }) => ReactNode;
  /**
   * ワークプール一覧行の PointerDown コールバック（ContextSlotPanel へ pass-through）。
   * タイムラインへの pointer-drag 起点として video 側が利用する。
   */
  onEntryPointerDown?: (assetId: string, e: PointerEvent<HTMLElement>) => void;
  /** 「ローカルから取込」ハンドラ（ContextSlotPanel へ pass-through） */
  onAddFromLocal?: () => Promise<void>;
  /** 「Library から」インライン Library ピッカー（ContextSlotPanel へ pass-through） */
  renderLibraryPicker?: (args: { onClose: () => void }) => ReactNode;
  /**
   * controlled モード。指定すると内蔵モード切替バーを隠し、そのモードに固定する。
   * SubPanel が 4 面を最上位タブ（横）として並べる際に各タブで mode を固定するために使う
   * （studio-left-panel-modes Option A）。未指定なら従来どおり内蔵 3 モード切替。
   */
  mode?: WorkMode;
}

export function WorkPanel({
  workId,
  variantId,
  library,
  onRunOperation,
  renderPoolPicker,
  onEntryPointerDown,
  onAddFromLocal,
  renderLibraryPicker,
  mode: controlledMode,
}: WorkPanelProps) {
  const [internalMode, setMode] = useState<WorkMode>("workpool");
  const mode = controlledMode ?? internalMode;
  const showSwitcher = controlledMode == null;

  return (
    <div className="flex flex-col h-full">
      {/* 3 モード切替（VS Code Activity Bar 風）。controlled 時は隠す */}
      {showSwitcher && (
        <div className="flex gap-1 p-1 border-b border-border shrink-0">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`flex-1 flex items-center justify-center gap-1 rounded px-1.5 py-1 text-[10px] transition ${
                mode === m.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-primary hover:bg-muted"
              }`}
              title={m.label}
            >
              {m.icon}
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* アクティブモードの中身 */}
      <div className="flex-1 overflow-auto min-h-0">
        {mode === "workpool" && (
          <ContextSlotPanel
            workId={workId}
            variantId={variantId}
            library={library}
            renderPoolPicker={renderPoolPicker}
            onEntryPointerDown={onEntryPointerDown}
            onAddFromLocal={onAddFromLocal}
            renderLibraryPicker={renderLibraryPicker}
          />
        )}
        {mode === "operations" && (
          <OperationsPanel
            workId={workId}
            variantId={variantId}
            onRunOperation={onRunOperation}
          />
        )}
        {mode === "workflow" && (
          <WorkflowPanel workId={workId} variantId={variantId} />
        )}
      </div>
    </div>
  );
}
