/**
 * WorkflowPanel — ワークフローモード（studio-left-panel-modes-2026-05-30 §5）。
 *
 * 「① ワークプールで選んだ素材と ② 操作が、ここで手順（レシピ）として生きる」をコンセプトにしたパネル。
 * ① 素材 / ③ 操作 を並べたレシピ / 手順。番号付き手順の追加・並べ替え・削除・完了トグル・インライン編集を提供。
 *
 * Phase 0 = in-memory モック。バックエンド配線なし、useState のみで完結。
 * Phase 1 では:
 *   - ステップ一覧 → `workflow_steps` テーブルへ永続化（HUB-085）
 *   - `initialSteps` → テンプレ / Work テンプレからの注入に置換
 *   - 並べ替え → サーバー側の `position` 更新 API へ配線
 * する予定。
 *
 * 関連設計: `akari-os/docs/design/studio-left-panel-modes-2026-05-30.md` §5
 */

import { useCallback, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";

// ─────────────────────────────────────────────
// 型定義（export して WorkPanel / 外部から参照可能に）
// ─────────────────────────────────────────────

/** ワークフローの 1 ステップ */
export interface WorkflowStep {
  id: string;
  /** 手順タイトル */
  title: string;
  /** 補足メモ（任意） */
  note?: string;
  /** 完了フラグ */
  done: boolean;
}

// ─────────────────────────────────────────────
// 定数
// ─────────────────────────────────────────────

/** デモ用シードデータ（動画編集の例） */
const SEED_STEPS: WorkflowStep[] = [
  { id: "seed-1", title: "素材をワークプールに集める", done: false },
  { id: "seed-2", title: "不要部分をカットする", done: false },
  { id: "seed-3", title: "字幕を生成する", done: false },
  { id: "seed-4", title: "BGM をライブラリから追加", done: false },
  { id: "seed-5", title: "書き出す", done: false },
];

// ─────────────────────────────────────────────
// WorkflowPanel
// ─────────────────────────────────────────────

interface WorkflowPanelProps {
  workId?: string;
  variantId?: string;
  initialSteps?: WorkflowStep[];
}

export function WorkflowPanel({ workId: _workId, variantId: _variantId, initialSteps }: WorkflowPanelProps) {
  // Phase 0: _workId / _variantId は将来の配線のためのシグネチャ確保。現在は未使用。
  const [steps, setSteps] = useState<WorkflowStep[]>(
    initialSteps ?? SEED_STEPS
  );

  // ─── インライン追加フォーム ───
  const [addingTitle, setAddingTitle] = useState("");
  const [isAddingOpen, setIsAddingOpen] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  // ─── 操作ハンドラ ───

  /** 上に移動 */
  const moveUp = useCallback((index: number) => {
    if (index === 0) return;
    setSteps((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  /** 下に移動 */
  const moveDown = useCallback((index: number) => {
    setSteps((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  /** 削除 */
  const removeStep = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /** 完了トグル */
  const toggleDone = useCallback((id: string) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, done: !s.done } : s))
    );
  }, []);

  /** タイトルインライン編集確定 */
  const commitTitle = useCallback((id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return; // 空なら変更を棄却
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: trimmed } : s))
    );
  }, []);

  /** 追加フォームを開く */
  const openAdd = useCallback(() => {
    setIsAddingOpen(true);
    // DOM レンダリング後にフォーカス
    requestAnimationFrame(() => addInputRef.current?.focus());
  }, []);

  /** 追加を確定 */
  const commitAdd = useCallback(() => {
    const title = addingTitle.trim();
    if (!title) return;
    setSteps((prev) => [
      ...prev,
      { id: `step-${Date.now()}`, title, done: false },
    ]);
    setAddingTitle("");
    setIsAddingOpen(false);
  }, [addingTitle]);

  /** 追加をキャンセル */
  const cancelAdd = useCallback(() => {
    setAddingTitle("");
    setIsAddingOpen(false);
  }, []);

  // 完了数サマリ
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="flex flex-col gap-1.5 p-2 text-xs">
      {/* ヘッダー: 手順数サマリ */}
      <div className="flex items-center justify-between px-0.5">
        <span className="text-[10px] text-muted-foreground">
          手順（{steps.length} ステップ）
        </span>
        {steps.length > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {doneCount}/{steps.length} 完了
          </span>
        )}
      </div>

      {/* ステップリスト */}
      <div className="flex flex-col gap-1">
        {steps.length === 0 ? (
          <div className="rounded border border-dashed border-border py-5 text-center text-[10px] text-muted-foreground/70">
            手順がありません。下の「+ 手順を追加」で追加してください。
          </div>
        ) : (
          steps.map((step, index) => (
            <StepRow
              key={step.id}
              step={step}
              stepNumber={index + 1}
              isFirst={index === 0}
              isLast={index === steps.length - 1}
              onMoveUp={() => moveUp(index)}
              onMoveDown={() => moveDown(index)}
              onRemove={() => removeStep(step.id)}
              onToggleDone={() => toggleDone(step.id)}
              onCommitTitle={(newTitle) => commitTitle(step.id, newTitle)}
            />
          ))
        )}
      </div>

      {/* インライン追加フォーム / 追加ボタン */}
      {isAddingOpen ? (
        <div className="flex items-center gap-1 rounded border border-primary/40 bg-muted/30 px-1.5 py-1">
          {/* 番号プレースホルダ */}
          <span className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
            {steps.length + 1}
          </span>
          <input
            ref={addInputRef}
            type="text"
            placeholder="手順タイトルを入力…"
            value={addingTitle}
            onChange={(e) => setAddingTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitAdd();
              if (e.key === "Escape") cancelAdd();
            }}
            className="flex-1 min-w-0 bg-transparent text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          {/* ＋ 確定ボタン */}
          <button
            type="button"
            onClick={commitAdd}
            disabled={!addingTitle.trim()}
            className="shrink-0 flex items-center justify-center w-5 h-5 rounded border border-primary bg-primary/10 text-primary hover:bg-primary/20 transition disabled:opacity-40 disabled:cursor-not-allowed"
            title="追加"
          >
            <Plus className="w-3 h-3" />
          </button>
          {/* キャンセルボタン（× 代わりに Escape テキスト） */}
          <button
            type="button"
            onClick={cancelAdd}
            className="shrink-0 text-[9px] text-muted-foreground hover:text-primary transition px-0.5"
            title="キャンセル（Esc）"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="self-start flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-primary hover:border-primary transition"
          onClick={openAdd}
        >
          <Plus className="w-3 h-3" />
          手順を追加
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
  onToggleDone: () => void;
  onCommitTitle: (newTitle: string) => void;
}

function StepRow({
  step,
  stepNumber,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onRemove,
  onToggleDone,
  onCommitTitle,
}: StepRowProps) {
  // インライン編集の状態
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(step.title);
  const inputRef = useRef<HTMLInputElement>(null);

  /** 編集モードに入る */
  const startEdit = useCallback(() => {
    setEditValue(step.title);
    setEditing(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [step.title]);

  /** 編集を確定 */
  const commitEdit = useCallback(() => {
    onCommitTitle(editValue);
    setEditing(false);
  }, [editValue, onCommitTitle]);

  /** 編集をキャンセル */
  const cancelEdit = useCallback(() => {
    setEditValue(step.title);
    setEditing(false);
  }, [step.title]);

  return (
    <div
      className={`flex items-center gap-1 rounded border px-1.5 py-1 transition ${
        step.done
          ? "border-border/50 bg-muted/30 opacity-60"
          : "border-border bg-background"
      }`}
    >
      {/* D&D ビジュアルヒント（将来の実 D&D のアンカー） */}
      <GripVertical className="w-3 h-3 shrink-0 text-muted-foreground/40 cursor-grab" />

      {/* 完了トグル: 番号バッジ兼ボタン */}
      <button
        type="button"
        onClick={onToggleDone}
        title={step.done ? "未完了に戻す" : "完了にする"}
        className={`shrink-0 flex items-center justify-center w-5 h-5 rounded-full border transition ${
          step.done
            ? "bg-primary border-primary text-primary-foreground"
            : "bg-muted border-border text-muted-foreground hover:border-primary hover:text-primary"
        }`}
      >
        {step.done ? (
          <Check className="w-3 h-3" />
        ) : (
          <span className="text-[9px] font-medium leading-none">{stepNumber}</span>
        )}
      </button>

      {/* タイトル（クリックでインライン編集） */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") cancelEdit();
            }}
            onBlur={commitEdit}
            className="w-full bg-transparent text-[11px] text-foreground focus:outline-none border-b border-primary"
          />
        ) : (
          <span
            role="button"
            tabIndex={0}
            onClick={startEdit}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") startEdit(); }}
            title="クリックして編集"
            className={`block truncate text-[11px] cursor-text select-none ${
              step.done
                ? "line-through text-muted-foreground"
                : "text-foreground hover:text-primary"
            }`}
          >
            {step.title}
          </span>
        )}
        {/* 補足メモ（note がある場合のみ表示） */}
        {!editing && step.note && (
          <span className="block truncate text-[9px] text-muted-foreground/70 mt-0.5">
            {step.note}
          </span>
        )}
      </div>

      {/* 上下移動ボタン */}
      <div className="shrink-0 flex flex-col gap-px">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={isFirst}
          className="flex items-center justify-center w-4 h-4 rounded text-muted-foreground hover:text-primary hover:bg-muted transition disabled:opacity-25 disabled:cursor-not-allowed"
          title="上に移動"
        >
          <ArrowUp className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={isLast}
          className="flex items-center justify-center w-4 h-4 rounded text-muted-foreground hover:text-primary hover:bg-muted transition disabled:opacity-25 disabled:cursor-not-allowed"
          title="下に移動"
        >
          <ArrowDown className="w-3 h-3" />
        </button>
      </div>

      {/* 削除ボタン */}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 flex items-center justify-center w-4 h-4 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition"
        title="ステップを削除"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}
