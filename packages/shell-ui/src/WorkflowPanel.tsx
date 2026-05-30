/**
 * WorkflowPanel — ワークフローモード（studio-left-panel-modes-2026-05-30 §4）。
 *
 * 「① ワークプールで選んだ素材（MaterialPanel）と ② 操作（OperationPanel）が、
 *  ここで手順（レシピ）として生きる」をコンセプトにしたパネル。
 *
 * Phase 0 = in-memory モック。バックエンド配線なし、useState のみで完結。
 * Phase 1 では:
 *   - ステップ一覧 → `workflow_steps` テーブルへ永続化
 *   - `sourceKind` / `sourceLabel` → Pool item / Operation の ID 参照に切替
 *   - 並べ替え → サーバー側の `position` 更新 API へ配線
 * する予定。
 *
 * 関連設計: `akari-os/docs/design/studio-left-panel-modes-2026-05-30.md` §4
 */

import { useCallback, useState } from "react";
import { Plus, ChevronUp, ChevronDown, X } from "lucide-react";

// ─────────────────────────────────────────────
// 型定義
// ─────────────────────────────────────────────

/** ステップの由来種別 */
type SourceKind = "material" | "operation";

/** ワークフローの 1 ステップ */
interface WorkflowStep {
  id: string;
  label: string;
  /** 由来種別（素材由来 or 操作由来） */
  sourceKind: SourceKind;
  /** 由来元の名称（Phase 0: 表示用文字列。Phase 1: Pool item / Operation の ID に変換） */
  sourceLabel: string;
}

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/** 由来種別 → バッジクラス */
const SOURCE_BADGE_CLASS: Record<SourceKind, string> = {
  material: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  operation: "bg-amber-500/15 text-amber-800 border-amber-500/30",
};

/** 由来種別 → 表示ラベル */
const SOURCE_KIND_LABEL: Record<SourceKind, string> = {
  material: "素材",
  operation: "操作",
};

/** Phase 0 の初期モックステップ（レシピのサンプル） */
const INITIAL_STEPS: WorkflowStep[] = [
  {
    id: "s1",
    label: "素材を配置",
    sourceKind: "material",
    sourceLabel: "メイン映像.mp4",
  },
  {
    id: "s2",
    label: "無音カット",
    sourceKind: "operation",
    sourceLabel: "無音検出・カット",
  },
  {
    id: "s3",
    label: "BGM を敷く",
    sourceKind: "material",
    sourceLabel: "bgm-chill.mp3",
  },
  {
    id: "s4",
    label: "自動字幕生成",
    sourceKind: "operation",
    sourceLabel: "Whisper 字幕",
  },
  {
    id: "s5",
    label: "書き出し",
    sourceKind: "operation",
    sourceLabel: "エクスポート設定",
  },
];

// ─────────────────────────────────────────────
// WorkflowPanel
// ─────────────────────────────────────────────

export function WorkflowPanel(props: { workId?: string; variantId?: string }) {
  // Phase 0: props は将来の配線のためのシグネチャ確保。現在は未使用。
  void props;

  const [steps, setSteps] = useState<WorkflowStep[]>(INITIAL_STEPS);
  /** インライン追加フォームの表示フラグ */
  const [adding, setAdding] = useState(false);
  /** 追加フォームの入力値 */
  const [newLabel, setNewLabel] = useState("");
  const [newSourceKind, setNewSourceKind] = useState<SourceKind>("operation");
  const [newSourceLabel, setNewSourceLabel] = useState("");

  // ─── 操作ハンドラ ───

  /** ステップを上に移動 */
  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  /** ステップを下に移動 */
  const moveDown = useCallback((index: number) => {
    setSteps((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  /** ステップを削除 */
  const removeStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /** 追加フォームを確定してステップを追加 */
  const commitAdd = useCallback(() => {
    const label = newLabel.trim();
    if (!label) return;
    setSteps((prev) => [
      ...prev,
      {
        id: `s${Date.now()}`,
        label,
        sourceKind: newSourceKind,
        sourceLabel: newSourceLabel.trim() || newSourceKind === "material" ? newSourceLabel.trim() || "素材" : "操作",
      },
    ]);
    // フォームをリセット
    setNewLabel("");
    setNewSourceLabel("");
    setNewSourceKind("operation");
    setAdding(false);
  }, [newLabel, newSourceKind, newSourceLabel]);

  /** 追加フォームをキャンセル */
  const cancelAdd = useCallback(() => {
    setNewLabel("");
    setNewSourceLabel("");
    setNewSourceKind("operation");
    setAdding(false);
  }, []);

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      {/* ヘッダー: コンセプト説明 */}
      <div className="rounded bg-muted/60 border border-border px-2 py-1.5 text-[10px] text-muted-foreground leading-relaxed">
        <span className="font-medium text-foreground">① ワークプール</span>で選んだ素材と{" "}
        <span className="font-medium text-foreground">② 操作</span>が、ここで手順として生きる
      </div>

      {/* ステップ数サマリ */}
      <div className="px-0.5 text-[10px] text-muted-foreground">
        ワークフロー（{steps.length} ステップ）
      </div>

      {/* ステップリスト */}
      <div className="flex flex-col">
        {steps.length === 0 ? (
          <div className="rounded border border-dashed border-border py-6 text-center text-[10px] text-muted-foreground/70">
            ステップがありません。下の「+ ステップ追加」で追加してください。
          </div>
        ) : (
          steps.map((step, index) => (
            <div key={step.id}>
              {/* ステップ行 */}
              <StepRow
                step={step}
                stepNumber={index + 1}
                isFirst={index === 0}
                isLast={index === steps.length - 1}
                onMoveUp={() => moveUp(index)}
                onMoveDown={() => moveDown(index)}
                onRemove={() => removeStep(step.id)}
              />
              {/* ステップ間のコネクタ（最後のステップの後には表示しない） */}
              {index < steps.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <span className="text-[11px] text-muted-foreground/50 select-none">↓</span>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* インライン追加フォーム */}
      {adding ? (
        <div className="flex flex-col gap-1.5 rounded border border-primary/40 bg-muted/30 p-2">
          <div className="text-[10px] font-medium text-foreground">新しいステップ</div>
          {/* ステップ名 */}
          <input
            type="text"
            placeholder="ステップ名（例: テロップを調整）"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") cancelAdd();
            }}
            autoFocus
            className="w-full rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
          />
          {/* 由来種別 */}
          <div className="flex items-center gap-1.5">
            <span className="shrink-0 text-[10px] text-muted-foreground">由来:</span>
            <select
              value={newSourceKind}
              onChange={(e) => setNewSourceKind(e.target.value as SourceKind)}
              className="flex-1 rounded border border-border bg-background px-1 py-0.5 text-[10px] text-foreground focus:outline-none focus:border-primary"
            >
              <option value="material">素材</option>
              <option value="operation">操作</option>
            </select>
          </div>
          {/* 由来ラベル */}
          <input
            type="text"
            placeholder={newSourceKind === "material" ? "素材名（例: intro.mp4）" : "操作名（例: 色調補正）"}
            value={newSourceLabel}
            onChange={(e) => setNewSourceLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") cancelAdd();
            }}
            className="w-full rounded border border-border bg-background px-1.5 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
          />
          {/* 確定 / キャンセル */}
          <div className="flex gap-1 justify-end">
            <button
              type="button"
              onClick={cancelAdd}
              className="rounded border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-primary hover:border-primary transition"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={commitAdd}
              disabled={!newLabel.trim()}
              className="rounded border border-primary bg-primary/10 px-2 py-0.5 text-[10px] text-primary hover:bg-primary/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              追加
            </button>
          </div>
        </div>
      ) : (
        /* 「+ ステップ追加」ボタン */
        <button
          type="button"
          className="self-start flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-primary hover:border-primary transition"
          onClick={() => setAdding(true)}
        >
          <Plus className="w-3 h-3" />
          ステップ追加
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// StepRow — 個々のステップ行
// ─────────────────────────────────────────────

interface StepRowProps {
  step: WorkflowStep;
  stepNumber: number;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

function StepRow({
  step,
  stepNumber,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
}: StepRowProps) {
  return (
    <div className="flex items-center gap-1.5 rounded bg-background border border-border px-1.5 py-1">
      {/* ステップ番号 */}
      <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
        {stepNumber}
      </span>

      {/* ラベル */}
      <span className="flex-1 truncate text-[11px] text-foreground" title={step.label}>
        {step.label}
      </span>

      {/* 参照ヒント（由来種別 + 由来ラベル） */}
      <span
        className={`shrink-0 rounded border px-1 py-0.5 text-[9px] leading-none ${SOURCE_BADGE_CLASS[step.sourceKind]}`}
        title={`${SOURCE_KIND_LABEL[step.sourceKind]}由来: ${step.sourceLabel}`}
      >
        {SOURCE_KIND_LABEL[step.sourceKind]}: {step.sourceLabel}
      </span>

      {/* 上下並べ替えボタン */}
      <div className="shrink-0 flex flex-col gap-px">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="flex items-center justify-center w-4 h-4 rounded text-muted-foreground hover:text-primary hover:bg-muted transition disabled:opacity-25 disabled:cursor-not-allowed"
          title="上に移動"
        >
          <ChevronUp className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="flex items-center justify-center w-4 h-4 rounded text-muted-foreground hover:text-primary hover:bg-muted transition disabled:opacity-25 disabled:cursor-not-allowed"
          title="下に移動"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* 削除ボタン */}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 flex items-center justify-center w-4 h-4 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition"
        title="ステップを削除"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
