/**
 * OperationsPanel — 操作モード（studio 左パネル §3 操作カタログ）。
 *
 * 「このアプリが"する"ことのカタログ」。素材を持たない純粋なアクション（カット / 字幕生成 /
 * 書き出し / 分析 など）を二重入口で提供する:
 *   - 人間: クリックで `onRunOperation?.(id)` を呼ぶ（直接発動）
 *   - AI  : エージェントチャットへドラッグして発動
 *         → dataTransfer に "application/x-akari-operation" = op.id をセット
 *
 * Phase 0: in-memory のみ（useState 完結）。
 * Phase 1 で:
 *   - onRunOperation → pool-impl / akari-ace へのコマンド送信
 *   - ドラッグ → AI チャットの DropZone が "application/x-akari-operation" を受け取り実行
 *   - ピン状態  → user preferences API に永続化
 *
 * 関連: design doc `akari-os/docs/design/studio-left-panel-modes-2026-05-30.md` §4
 */

import { useCallback, useMemo, useState } from "react";
import type { DragEvent } from "react";
import {
  GripVertical,
  Star,
  Search,
  Scissors,
  Captions,
  Volume2,
  Download,
  Scan,
  Sparkles,
  Wand2,
  Play,
  Type,
} from "lucide-react";

// ---------------------------------------------------------------------------
// 公開型定義
// ---------------------------------------------------------------------------

/**
 * 操作定義（外部から渡す際の型。operations prop で使用）。
 *
 * ADR-140 D-2「操作 = MCP ツール + UI メタデータ」に向けた拡張フィールドを追加。
 * すべて optional のため、既存の呼び出し元（DEFAULT_OPERATIONS 等）は変更不要。
 */
export interface OperationDef {
  id: string;
  label: string;
  category: string;
  description?: string;
  /**
   * 対応する MCP ツール名（ACD `contract.ts` の TOOL 定数に対応）。
   * レジストリ駆動化（P1）で ACD 側と紐付けるための識別子。
   */
  toolName?: string;
  /**
   * 実装済みかどうか。`false` の操作は一覧に描画しない
   * （「偽の実行をしない」方針の維持。ADR-140 D-2）。
   * undefined の場合は従来どおり表示する。
   */
  available?: boolean;
  /**
   * 操作の種別。`"tool"` = MCP ハンドラ経由（ACD 実行）、
   * `"ui"` = ダイアログ起動等の UI 専用操作。省略時は `"tool"` 扱い。
   */
  kind?: "tool" | "ui";
}

// ---------------------------------------------------------------------------
// 内部型定義
// ---------------------------------------------------------------------------

/** 内部拡張操作定義（アイコンなどを付加） */
interface OperationEntry extends OperationDef {
  /** lucide-react アイコンコンポーネント */
  icon: React.ComponentType<{ className?: string }>;
}

// ---------------------------------------------------------------------------
// デフォルト操作カタログ
// ---------------------------------------------------------------------------

/** MIME タイプ（AI チャット DropZone が受け取る） */
const OPERATION_MIME = "application/x-akari-operation";

/** デフォルトの操作定義（動画編集向け） */
const DEFAULT_OPERATIONS: OperationDef[] = [
  // 編集
  { id: "cut",          category: "編集",       label: "カット",           description: "選択範囲をカット・削除する" },
  { id: "silence-cut",  category: "編集",       label: "無音カット",        description: "無音区間を自動検出してカットする" },
  { id: "scene-detect", category: "編集",       label: "シーン検出",        description: "シーン境界を自動検出してマーカーを打つ" },
  // 字幕・テキスト
  { id: "sub-generate", category: "字幕・テキスト", label: "字幕生成",       description: "音声を認識して字幕トラックを自動生成する" },
  { id: "sub-fix",      category: "字幕・テキスト", label: "字幕修正",       description: "既存字幕の誤字・タイミングを一括修正する" },
  // オーディオ
  { id: "vol-adjust",   category: "オーディオ", label: "音量調整",          description: "全体の音量を均一に正規化する" },
  { id: "bgm-ducking",  category: "オーディオ", label: "BGM 自動ダッキング", description: "音声トラックに合わせて BGM を自動的に下げる" },
  // カラー
  { id: "color-grade",  category: "カラー",     label: "カラーグレード",    description: "全クリップにカラーグレーディングを適用する" },
  // 書き出し
  { id: "export",       category: "書き出し",   label: "書き出し",          description: "動画ファイルを指定フォーマットで書き出す" },
  // 分析
  { id: "ctx-analyze",  category: "分析",       label: "コンテキスト分析",  description: "素材全体を AI が分析して文脈を把握する" },
  { id: "highlight",    category: "分析",       label: "ハイライト抽出",    description: "印象的な場面を AI が自動抽出する" },
];

/** カテゴリ → アイコンのマッピング（デフォルト操作用） */
const DEFAULT_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  cut:          Scissors,
  "silence-cut": Scissors,
  "scene-detect": Scan,
  "sub-generate": Captions,
  "sub-fix":    Type,
  "vol-adjust": Volume2,
  "bgm-ducking": Volume2,
  "color-grade": Wand2,
  export:       Download,
  "ctx-analyze": Sparkles,
  highlight:    Play,
};

/** カテゴリ → バッジスタイル */
const CATEGORY_BADGE: Record<string, string> = {
  "編集":         "bg-red-500/15 text-red-700 border-red-500/30",
  "字幕・テキスト": "bg-amber-500/15 text-amber-800 border-amber-500/30",
  "オーディオ":    "bg-green-500/15 text-green-700 border-green-500/30",
  "カラー":       "bg-violet-500/15 text-violet-700 border-violet-500/30",
  "書き出し":     "bg-blue-500/15 text-blue-700 border-blue-500/30",
  "分析":         "bg-sky-500/15 text-sky-700 border-sky-500/30",
};

/** カテゴリ表示順 */
const CATEGORY_ORDER = ["編集", "字幕・テキスト", "オーディオ", "カラー", "書き出し", "分析"];

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/** OperationDef を内部 OperationEntry に変換（アイコン解決） */
function toEntry(op: OperationDef): OperationEntry {
  return {
    ...op,
    icon: DEFAULT_ICON_MAP[op.id] ?? GripVertical,
  };
}

// ---------------------------------------------------------------------------
// コンポーネント
// ---------------------------------------------------------------------------

export function OperationsPanel(props: {
  workId?: string;
  variantId?: string;
  operations?: OperationDef[];
  onRunOperation?: (id: string) => void;
}) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { workId: _workId, variantId: _variantId, operations, onRunOperation } = props;

  /** 検索文字列 */
  const [searchQuery, setSearchQuery] = useState("");

  /** ピン済み操作 ID セット（よく使う → 最上部に浮上） */
  const [pinned, setPinned] = useState<Set<string>>(new Set());

  /**
   * 使用するエントリ一覧（prop 指定があればそちら、なければデフォルト）。
   * `available === false` の操作は「偽の実行をしない」方針により非表示にする
   * （ADR-140 D-2）。undefined は従来どおり表示する。
   */
  const allEntries = useMemo<OperationEntry[]>(() => {
    const source = operations ?? DEFAULT_OPERATIONS;
    return source.filter((op) => op.available !== false).map(toEntry);
  }, [operations]);

  // ピントグル
  const togglePin = useCallback((id: string) => {
    setPinned((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // 操作クリック → onRunOperation を呼ぶ
  const handleRun = useCallback(
    (id: string) => {
      onRunOperation?.(id);
    },
    [onRunOperation],
  );

  // ドラッグ開始（AI チャット DropZone 向けに操作 id をセット）
  const handleDragStart = useCallback(
    (op: OperationEntry, e: DragEvent<HTMLDivElement>) => {
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData(OPERATION_MIME, op.id);
      // フォールバック: テキスト対応 drop target にも届くように
      e.dataTransfer.setData("text/plain", op.label);
    },
    [],
  );

  /** 検索フィルター後のエントリ */
  const filtered = useMemo<OperationEntry[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allEntries;
    return allEntries.filter(
      (op) =>
        op.label.toLowerCase().includes(q) ||
        (op.description?.toLowerCase().includes(q) ?? false),
    );
  }, [allEntries, searchQuery]);

  /** よく使う（ピン済み）— フィルター問わず常に表示 */
  const pinnedEntries = useMemo<OperationEntry[]>(
    () => allEntries.filter((op) => pinned.has(op.id)),
    [allEntries, pinned],
  );

  /** フィルター後の表示カテゴリ（定義順） */
  const visibleCategories = useMemo<string[]>(() => {
    const cats = new Set(filtered.map((op) => op.category));
    const ordered = CATEGORY_ORDER.filter((c) => cats.has(c));
    // CATEGORY_ORDER に含まれない未知のカテゴリはアルファベット順で末尾に追加
    const extras = [...cats].filter((c) => !CATEGORY_ORDER.includes(c)).sort();
    return [...ordered, ...extras];
  }, [filtered]);

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      {/* ヘッダー */}
      <div className="flex flex-col gap-0.5 px-0.5">
        <span className="text-[10px] text-muted-foreground">
          操作カタログ（{allEntries.length} 件）
        </span>
        <span className="text-[9px] text-muted-foreground/70 leading-tight">
          クリックで発動 / AI チャットへドラッグして発動
        </span>
      </div>

      {/* インライン検索 */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50 pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="操作を検索…"
          className="w-full rounded border border-border bg-background pl-6 pr-2 py-1 text-xs placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 transition"
        />
      </div>

      {/* 検索ヒット数（検索中のみ） */}
      {searchQuery.trim() && (
        <span className="text-[10px] text-muted-foreground/70 px-0.5">
          {filtered.length} 件ヒット
        </span>
      )}

      {/* よく使うセクション（ピン済みがあり、かつ検索中でない場合のみ） */}
      {pinnedEntries.length > 0 && !searchQuery.trim() && (
        <section className="flex flex-col gap-1">
          <SectionHeader label="よく使う" />
          {pinnedEntries.map((op) => (
            <OperationRow
              key={`pinned-${op.id}`}
              op={op}
              pinned={true}
              onRun={handleRun}
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
              label={cat}
              colorClass={CATEGORY_BADGE[cat]}
            />
            {ops.map((op) => (
              <OperationRow
                key={op.id}
                op={op}
                pinned={pinned.has(op.id)}
                onRun={handleRun}
                onTogglePin={togglePin}
                onDragStart={handleDragStart}
              />
            ))}
          </section>
        );
      })}

      {/* 検索ゼロヒット時のフォールバック */}
      {searchQuery.trim() && filtered.length === 0 && (
        <div className="px-1 py-4 text-center text-[10px] text-muted-foreground/60">
          「{searchQuery}」に一致する操作が見つかりません
        </div>
      )}
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
  pinned,
  onRun,
  onTogglePin,
  onDragStart,
}: {
  op: OperationEntry;
  pinned: boolean;
  onRun: (id: string) => void;
  onTogglePin: (id: string) => void;
  onDragStart: (op: OperationEntry, e: DragEvent<HTMLDivElement>) => void;
}) {
  const Icon = op.icon;

  return (
    <div
      className="group flex items-center gap-1.5 rounded border border-border bg-background px-1.5 py-1 transition hover:border-primary/50 hover:bg-muted/30"
    >
      {/* ドラッグハンドル（「AI チャットにドラッグして発動」用） */}
      <div
        draggable
        onDragStart={(e) => onDragStart(op, e)}
        className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition"
        title="AI チャットにドラッグして発動"
      >
        <GripVertical className="w-3 h-3" />
      </div>

      {/* カテゴリアイコン */}
      <Icon className="shrink-0 w-3 h-3 text-muted-foreground" />

      {/* 操作名 + 説明 */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span
          className="truncate leading-tight text-foreground"
          title={op.label}
        >
          {op.label}
        </span>
        {op.description && (
          <span className="text-[9px] leading-tight text-muted-foreground/60 truncate" title={op.description}>
            {op.description}
          </span>
        )}
      </div>

      {/* [実行]ボタン — クリックで onRunOperation を呼ぶ */}
      <button
        type="button"
        onClick={() => onRun(op.id)}
        className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground transition hover:text-primary hover:border-primary opacity-0 group-hover:opacity-100"
        title={`${op.label} を実行`}
      >
        実行
      </button>

      {/* ピン/★トグル（よく使う） */}
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
        <Star className={`w-3 h-3 ${pinned ? "fill-amber-500" : ""}`} />
      </button>
    </div>
  );
}
