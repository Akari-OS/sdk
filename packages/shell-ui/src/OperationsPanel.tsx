/**
 * OperationsPanel — 操作モード（studio 左パネル § 操作カタログ、Phase 0 skeleton）。
 *
 * 「このアプリでできる操作のカタログ」。人間はクリックで適用、AI はチャットへのドラッグで発動。
 * 同じ操作を 2 つの入口から呼べることを UI 上で明示する。
 *
 * Phase 0 は in-memory モック。全状態を useState で完結させ、バックエンド配線なし。
 * Phase 1 で:
 *   - [適用]ボタン → pool-impl / akari-ace へのコマンド送信
 *   - ドラッグ → AI チャットの DropZone が "application/x-akari-operation" を受け取り実行
 *   - ピン状態  → user preferences API に永続化
 * へ配線する。
 *
 * 関連: design doc `akari-os/docs/design/studio-left-panel-modes-2026-05-30.md` §3
 */

import { useCallback, useMemo, useState } from "react";
import type { DragEvent } from "react";
import {
  GripVertical,
  Star,
  Blend,
  Grid2x2,
  SunMedium,
  Layers,
  Scissors,
  Captions,
  Volume2,
  Check,
} from "lucide-react";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

/** 操作カテゴリ */
type OperationCategory =
  | "effect"
  | "transition"
  | "cut"
  | "subtitle"
  | "audio";

/** 適用状態ヒント */
type StatusHint =
  | "adjustable"   // 「インスペクターで調整」
  | "ordered"      // 「順番が要る」
  | "applied"      // 「適用済み」
  | null;

/** 操作定義 */
interface Operation {
  id: string;
  category: OperationCategory;
  label: string;
  /** lucide-react アイコンコンポーネント */
  icon: React.ComponentType<{ className?: string }>;
  hint: StatusHint;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** カテゴリ表示名 */
const CATEGORY_LABELS: Record<OperationCategory, string> = {
  effect: "エフェクト",
  transition: "トランジション",
  cut: "カット",
  subtitle: "字幕",
  audio: "オーディオ",
};

/** カテゴリ → アクセントカラー（フィルターチップ / セクションヘッダー） */
const CATEGORY_BADGE_CLASS: Record<OperationCategory, string> = {
  effect: "bg-violet-500/15 text-violet-700 border-violet-500/30",
  transition: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  cut: "bg-red-500/15 text-red-700 border-red-500/30",
  subtitle: "bg-amber-500/15 text-amber-800 border-amber-500/30",
  audio: "bg-green-500/15 text-green-700 border-green-500/30",
};

/** ステータスヒントのラベル */
const HINT_LABEL: Record<NonNullable<StatusHint>, string> = {
  adjustable: "インスペクターで調整",
  ordered: "順番が要る",
  applied: "適用済み",
};

/** MIME タイプ（AI チャット DropZone が受け取る） */
const OPERATION_MIME = "application/x-akari-operation";

/** Phase 0 モック操作カタログ */
const ALL_OPERATIONS: Operation[] = [
  // エフェクト
  { id: "op-blur",       category: "effect",     label: "ぼかし",       icon: Blend,    hint: "adjustable" },
  { id: "op-mosaic",     category: "effect",     label: "モザイク",     icon: Grid2x2,  hint: "adjustable" },
  { id: "op-color",      category: "effect",     label: "色補正",       icon: SunMedium, hint: "adjustable" },
  // トランジション
  { id: "op-fade",       category: "transition", label: "フェード",     icon: Layers,   hint: "ordered" },
  { id: "op-wipe",       category: "transition", label: "ワイプ",       icon: Layers,   hint: "ordered" },
  // カット
  { id: "op-silence-cut", category: "cut",       label: "無音カット",   icon: Scissors, hint: null },
  { id: "op-filler-cut", category: "cut",        label: "フィラーカット", icon: Scissors, hint: null },
  // 字幕
  { id: "op-auto-sub",   category: "subtitle",   label: "自動字幕生成", icon: Captions, hint: null },
  { id: "op-sub-style",  category: "subtitle",   label: "字幕スタイル", icon: Captions, hint: "adjustable" },
  // オーディオ
  { id: "op-normalize",  category: "audio",      label: "音量正規化",   icon: Volume2,  hint: null },
  { id: "op-ducking",    category: "audio",      label: "BGMダッキング", icon: Volume2,  hint: null },
];

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function OperationsPanel(props: { workId?: string; variantId?: string }) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { workId: _workId, variantId: _variantId } = props;

  /** 適用済みの操作 ID セット（Phase 0: toggle で疑似適用） */
  const [applied, setApplied] = useState<Set<string>>(new Set());

  /** ピン済み操作 ID セット（お気に入り → 最上部「よく使う」に浮上） */
  const [pinned, setPinned] = useState<Set<string>>(new Set());

  /** フィルター中のカテゴリ（null = すべて） */
  const [filter, setFilter] = useState<OperationCategory | null>(null);

  // 適用トグル（Phase 0: in-memory。Phase 1 で pool-impl コマンドに差し替え）
  const toggleApply = useCallback((id: string) => {
    setApplied((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ピントグル
  const togglePin = useCallback((id: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // ドラッグ開始（AI チャット DropZone 向けに操作 id をセット）
  const handleDragStart = useCallback(
    (op: Operation, e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.effectAllowed = "copy";
      // AI チャットが受け取るカスタム MIME（操作 id + ラベルを JSON で載せる）
      e.dataTransfer.setData(
        OPERATION_MIME,
        JSON.stringify({ id: op.id, label: op.label, category: op.category }),
      );
      // フォールバック: テキスト対応 drop target にも届くように
      e.dataTransfer.setData("text/plain", op.label);
    },
    [],
  );

  /** フィルター後の操作一覧 */
  const filtered = useMemo(
    () =>
      filter
        ? ALL_OPERATIONS.filter((op) => op.category === filter)
        : ALL_OPERATIONS,
    [filter],
  );

  /** ピン済み操作（フィルター問わず常に「よく使う」に表示） */
  const pinnedOps = useMemo(
    () => ALL_OPERATIONS.filter((op) => pinned.has(op.id)),
    [pinned],
  );

  /** フィルター後のカテゴリ一覧（表示順を維持） */
  const visibleCategories = useMemo<OperationCategory[]>(() => {
    const cats = new Set(filtered.map((op) => op.category));
    return (
      ["effect", "transition", "cut", "subtitle", "audio"] as OperationCategory[]
    ).filter((c) => cats.has(c));
  }, [filtered]);

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      {/* ヘッダー */}
      <div className="flex flex-col gap-0.5 px-0.5">
        <span className="text-[10px] text-muted-foreground">
          操作カタログ（{ALL_OPERATIONS.length} 件）
        </span>
        {/* 2 入口の説明 */}
        <span className="text-[9px] text-muted-foreground/70 leading-tight">
          人間はクリック、AI はドラッグ — 同じ操作の 2 つの入口
        </span>
      </div>

      {/* カテゴリフィルターチップ */}
      <div className="flex flex-wrap gap-1">
        <FilterChip
          active={filter === null}
          label={`すべて (${ALL_OPERATIONS.length})`}
          onClick={() => setFilter(null)}
        />
        {(
          ["effect", "transition", "cut", "subtitle", "audio"] as OperationCategory[]
        ).map((cat) => (
          <FilterChip
            key={cat}
            active={filter === cat}
            label={CATEGORY_LABELS[cat]}
            colorClass={CATEGORY_BADGE_CLASS[cat]}
            onClick={() => setFilter((prev) => (prev === cat ? null : cat))}
          />
        ))}
      </div>

      {/* よく使うセクション（ピン済みがある場合のみ表示） */}
      {pinnedOps.length > 0 && (
        <section className="flex flex-col gap-1">
          <SectionHeader label="よく使う" />
          {pinnedOps.map((op) => (
            <OperationRow
              key={`pinned-${op.id}`}
              op={op}
              applied={applied.has(op.id)}
              pinned={true}
              onToggleApply={toggleApply}
              onTogglePin={togglePin}
              onDragStart={handleDragStart}
            />
          ))}
        </section>
      )}

      {/* カテゴリ別セクション */}
      {visibleCategories.map((cat) => {
        const ops = filtered.filter((op) => op.category === cat);
        return (
          <section key={cat} className="flex flex-col gap-1">
            <SectionHeader
              label={CATEGORY_LABELS[cat]}
              colorClass={CATEGORY_BADGE_CLASS[cat]}
            />
            {ops.map((op) => (
              <OperationRow
                key={op.id}
                op={op}
                applied={applied.has(op.id)}
                pinned={pinned.has(op.id)}
                onToggleApply={toggleApply}
                onTogglePin={togglePin}
                onDragStart={handleDragStart}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 子コンポーネント
// ---------------------------------------------------------------------------

/** セクションヘッダー */
function SectionHeader({
  label,
  colorClass,
}: {
  label: string;
  colorClass?: string;
}) {
  return (
    <div
      className={`px-1 py-0.5 rounded text-[9px] font-semibold border ${
        colorClass ?? "bg-muted/60 text-muted-foreground border-border"
      }`}
    >
      {label}
    </div>
  );
}

/** 1 操作行 */
function OperationRow({
  op,
  applied,
  pinned,
  onToggleApply,
  onTogglePin,
  onDragStart,
}: {
  op: Operation;
  applied: boolean;
  pinned: boolean;
  onToggleApply: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDragStart: (op: Operation, e: DragEvent<HTMLDivElement>) => void;
}) {
  const Icon = op.icon;

  return (
    <div
      className={`group flex items-center gap-1.5 rounded border px-1.5 py-1 transition ${
        applied
          ? "bg-primary/5 border-primary/30"
          : "bg-background border-border hover:border-primary/50"
      }`}
    >
      {/* ドラッグハンドル（「AI チャットにドラッグして発動」用） */}
      <div
        draggable
        onDragStart={(e) => onDragStart(op, e)}
        className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground transition"
        title="AI チャットにドラッグして発動"
      >
        <GripVertical className="w-3 h-3" />
      </div>

      {/* カテゴリアイコン */}
      <Icon className="shrink-0 w-3 h-3 text-muted-foreground" />

      {/* 操作名 + ヒントラベル */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span
          className={`truncate leading-tight ${applied ? "text-primary font-medium" : "text-foreground"}`}
          title={op.label}
        >
          {op.label}
        </span>
        {/* ステータスヒント（一部操作のみ） */}
        {op.hint && (
          <span
            className={`text-[9px] leading-tight ${
              op.hint === "applied"
                ? "text-primary"
                : "text-muted-foreground/70"
            }`}
          >
            {HINT_LABEL[op.hint]}
          </span>
        )}
      </div>

      {/* [適用]ボタン（Phase 0: toggle で疑似適用） */}
      <button
        type="button"
        onClick={() => onToggleApply(op.id)}
        className={`shrink-0 flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-[9px] transition ${
          applied
            ? "bg-primary text-primary-foreground border-primary"
            : "border-border text-muted-foreground hover:text-primary hover:border-primary"
        }`}
        title={applied ? "適用解除" : "適用する"}
      >
        {applied && <Check className="w-2.5 h-2.5" />}
        {applied ? "適用済み" : "適用"}
      </button>

      {/* ピン/★トグル（お気に入り） */}
      <button
        type="button"
        onClick={() => onTogglePin(op.id)}
        className={`shrink-0 transition ${
          pinned
            ? "text-amber-500 hover:text-amber-400"
            : "text-muted-foreground/30 hover:text-amber-500 opacity-0 group-hover:opacity-100"
        }`}
        title={pinned ? "ピン解除" : "よく使うに追加"}
      >
        <Star
          className={`w-3 h-3 ${pinned ? "fill-amber-500" : ""}`}
        />
      </button>
    </div>
  );
}

/** フィルターチップ */
function FilterChip({
  active,
  label,
  colorClass,
  onClick,
}: {
  active: boolean;
  label: string;
  colorClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
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
