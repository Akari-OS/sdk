/**
 * ModelSelector — Partner AI に使うモデルを選ぶコンパクトなドロップダウン。
 *
 * Video 版 (akari-video) の ModelSelector を AkariShell 用に簡略化した移植。
 * - 5 モデルだけなので検索・フィルタは無し
 * - ピル状ボタン + ドロップダウン + Canvas レーダーチャート比較
 * - 選択中モデル（青）とホバー中モデル（オレンジ）を重ねて描画
 *
 * spec: AKARI-HUB-009
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { MODELS, getModelById } from "@akari-os/sdk/models";
import { RadarChart } from "@akari-os/shell-ui/RadarChart";

interface ModelSelectorProps {
  /** 選択中モデル ID */
  value: string;
  /** 変更コールバック */
  onChange: (id: string) => void;
  /** コンパクト表示（ピル状ボタン）。デフォルト true */
  compact?: boolean;
}

/** モデル選択ドロップダウン + レーダーチャート比較 */
export function ModelSelector({ value, onChange, compact = true }: ModelSelectorProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // ドロップダウンの描画位置 (fixed 座標)。portal で body 直下に出すため、
  // trigger ボタンの BoundingClientRect を基準に毎回算出する。
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);

  const currentModel = getModelById(value) ?? MODELS[0];
  const compareModel = hoverId ? getModelById(hoverId) ?? null : null;

  // trigger の位置からドロップダウン座標を計算する
  const updatePosition = useCallback((): void => {
    const trigger = containerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setDropdownPos({
      top: rect.bottom + 4, // mt-1 相当
      right: window.innerWidth - rect.right,
    });
  }, []);

  // open トグル時に初期位置を計算 (useLayoutEffect で描画前に set)
  useLayoutEffect(() => {
    if (open) updatePosition();
  }, [open, updatePosition]);

  // スクロール / リサイズで位置を追従
  useEffect(() => {
    if (!open) return;
    const handle = (): void => updatePosition();
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [open, updatePosition]);

  // 外部クリック / Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent): void => {
      const target = e.target as Node;
      const insideTrigger = containerRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!insideTrigger && !insideDropdown) {
        setOpen(false);
        setHoverId(null);
      }
    };
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        setOpen(false);
        setHoverId(null);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id);
      setOpen(false);
      setHoverId(null);
    },
    [onChange],
  );

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          compact
            ? "flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-border text-[9px] text-muted-foreground hover:text-foreground hover:bg-accent transition"
            : "flex items-center gap-1.5 px-2 py-1 rounded border border-border text-xs text-foreground hover:bg-accent transition"
        }
        title={`モデル: ${currentModel.name}`}
        data-testid="model-selector-trigger"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        <span className="truncate max-w-[96px]">{currentModel.name}</span>
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>

      {open && dropdownPos && createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: "fixed",
            top: dropdownPos.top,
            right: dropdownPos.right,
          }}
          className="w-[320px] max-w-[calc(100vw-1rem)] bg-popover border border-border rounded-lg shadow-xl z-[100] overflow-hidden"
        >
          {/* レーダーチャート */}
          <div className="flex flex-col items-center py-3 border-b border-border bg-muted/30">
            <RadarChart primary={currentModel} secondary={compareModel} size={200} />
            <div className="flex gap-3 mt-1">
              <span className="flex items-center gap-1 text-[9px] text-blue-500">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {currentModel.name}
              </span>
              {compareModel && compareModel.id !== currentModel.id && (
                <span className="flex items-center gap-1 text-[9px] text-orange-500">
                  <span className="w-2 h-2 rounded-full bg-orange-500" />
                  {compareModel.name}
                </span>
              )}
            </div>
          </div>

          {/* モデル一覧 */}
          <div className="max-h-[280px] overflow-y-auto">
            {MODELS.map((model) => {
              const isSelected = model.id === value;
              const isHovered = model.id === hoverId;
              return (
                <div
                  key={model.id}
                  onClick={() => handleSelect(model.id)}
                  onMouseEnter={() => setHoverId(model.id)}
                  onMouseLeave={() => setHoverId(null)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors border-l-2 ${
                    isSelected
                      ? "bg-primary/10 border-primary"
                      : isHovered
                        ? "bg-accent border-orange-400/60"
                        : "border-transparent hover:bg-accent/60"
                  }`}
                  data-testid={`model-option-${model.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-foreground font-medium truncate">
                        {model.name}
                      </span>
                      {model.isFree && (
                        <span className="text-[8px] text-green-600 bg-green-500/15 px-1 rounded">
                          FREE
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-[8px] text-primary bg-primary/15 px-1 rounded">
                          使用中
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[9px] text-muted-foreground">
                        {model.provider}
                      </span>
                      <span className="text-[9px] text-muted-foreground/60">|</span>
                      <span className="text-[9px] text-muted-foreground">
                        {model.isFree
                          ? "無料"
                          : `入力 $${model.costPer1kInput.toFixed(5)}/1K`}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
