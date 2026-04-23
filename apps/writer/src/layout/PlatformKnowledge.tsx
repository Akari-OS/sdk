/**
 * PlatformKnowledge — プラットフォームのノウハウをカテゴリ別アコーディオンで表示するポップアップ。
 * お気に入り・既読管理付き。各ノウハウはクリックで AI コンテキストに追加可能。
 */

import { useState, useCallback, useMemo } from "react";
import { X, BookOpen, Heart, ChevronDown, ChevronRight, CheckCircle2 } from "lucide-react";
import { KNOWHOW_CATEGORIES, type KnowhowEntry, type PlatformConfig } from "../lib/platforms";
import { createPresetContext } from "@akari-os/sdk/chat-context";
import type { ContextItem } from "@akari-os/sdk/chat-context";
import { PlatformIcon } from "../components/icons/SnsIcons";

// --- localStorage 永続化ヘルパー ---

const FAVORITES_KEY = "akari.knowhow.favorites";
const READ_KEY = "akari.knowhow.read";

/** ノウハウの一意識別子を生成（platformId + category + text先頭30字） */
function knowhowId(platformId: string, entry: KnowhowEntry): string {
  return `${platformId}:${entry.category}:${entry.text.slice(0, 30)}`;
}

function loadStringSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveStringSet(key: string, set: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...set]));
}

// --- コンポーネント ---

interface PlatformKnowledgeProps {
  platform: PlatformConfig;
  onClose: () => void;
  onAddContext?: (ctx: ContextItem) => void;
}

export function PlatformKnowledge({ platform, onClose, onAddContext }: PlatformKnowledgeProps) {
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [favorites, setFavorites] = useState<Set<string>>(() => loadStringSet(FAVORITES_KEY));
  const [readItems, setReadItems] = useState<Set<string>>(() => loadStringSet(READ_KEY));
  // アコーディオンの開閉状態（カテゴリキー → 開閉）
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    // 初期状態: すべて開いている
    const cats = new Set(platform.knowhow.map((k) => k.category));
    // お気に入りがあれば "favorites" セクションも追加
    return new Set([...cats, "favorites"]);
  });

  // カテゴリ一覧（出現順を維持）
  const categories = useMemo(
    () => Array.from(new Set(platform.knowhow.map((k) => k.category))),
    [platform.knowhow],
  );

  // お気に入りのノウハウ一覧
  const favoriteEntries = useMemo(
    () => platform.knowhow.filter((e) => favorites.has(knowhowId(platform.id, e))),
    [platform.knowhow, platform.id, favorites],
  );

  // 既読数
  const readCount = useMemo(
    () => platform.knowhow.filter((e) => readItems.has(knowhowId(platform.id, e))).length,
    [platform.knowhow, platform.id, readItems],
  );
  const totalCount = platform.knowhow.length;
  const progressPercent = totalCount > 0 ? Math.round((readCount / totalCount) * 100) : 0;

  // お気に入りトグル
  const toggleFavorite = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveStringSet(FAVORITES_KEY, next);
      return next;
    });
  }, []);

  // 既読マーク + AIコンテキスト追加
  const handleAdd = useCallback((entry: KnowhowEntry, globalIndex: number) => {
    onAddContext?.(createPresetContext(
      entry.text.slice(0, 20) + (entry.text.length > 20 ? "..." : ""),
      entry.text,
      platform.name,
    ));
    setAddedIds((prev) => new Set(prev).add(globalIndex));
    // 既読にする
    const id = knowhowId(platform.id, entry);
    setReadItems((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveStringSet(READ_KEY, next);
      return next;
    });
  }, [onAddContext, platform.name, platform.id]);

  // セクション開閉トグル
  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ノウハウカード1件分のレンダリング
  function renderEntry(entry: KnowhowEntry, globalIndex: number) {
    const id = knowhowId(platform.id, entry);
    const isAdded = addedIds.has(globalIndex);
    const isFav = favorites.has(id);
    const isRead = readItems.has(id);
    const catInfo = KNOWHOW_CATEGORIES[entry.category];

    return (
      <div key={id} className="flex items-start gap-1">
        {/* お気に入りボタン */}
        <button
          onClick={(e) => toggleFavorite(id, e)}
          className={`shrink-0 p-1 rounded transition mt-1.5 ${
            isFav
              ? "text-rose-400 hover:text-rose-300"
              : "text-muted-foreground/30 hover:text-rose-400"
          }`}
          aria-label={isFav ? "お気に入り解除" : "お気に入りに追加"}
        >
          <Heart className="w-3 h-3" fill={isFav ? "currentColor" : "none"} />
        </button>

        {/* ノウハウ本体 */}
        <button
          onClick={() => handleAdd(entry, globalIndex)}
          disabled={isAdded}
          className={`flex-1 text-left rounded-lg border px-3 py-2 transition group ${
            isAdded
              ? "border-primary/30 bg-primary/5 opacity-60"
              : isRead
                ? "border-border/50 bg-muted/20 hover:border-primary/40 hover:bg-muted/50"
                : "border-border hover:border-primary/40 hover:bg-muted/50"
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="text-[10px] shrink-0 mt-0.5">{catInfo.icon}</span>
            <div className="flex-1 min-w-0">
              <div className={`text-xs leading-relaxed ${isRead ? "text-muted-foreground" : ""}`}>
                {entry.text}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] text-muted-foreground/50">{catInfo.label}</span>
                {isRead && !isAdded && (
                  <span className="text-[9px] text-muted-foreground/40 flex items-center gap-0.5">
                    <CheckCircle2 className="w-2.5 h-2.5" /> 読了
                  </span>
                )}
                {isAdded ? (
                  <span className="text-[9px] text-primary">追加済み</span>
                ) : (
                  <span className="text-[9px] text-primary/0 group-hover:text-primary/60 transition">
                    クリックで AI コンテキストに追加
                  </span>
                )}
              </div>
            </div>
          </div>
        </button>
      </div>
    );
  }

  // アコーディオンセクションのレンダリング
  function renderSection(key: string, label: string, icon: string, entries: KnowhowEntry[]) {
    if (entries.length === 0) return null;
    const isOpen = openSections.has(key);
    const sectionReadCount = entries.filter((e) => readItems.has(knowhowId(platform.id, e))).length;

    return (
      <div key={key}>
        <button
          onClick={() => toggleSection(key)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 transition text-left"
        >
          {isOpen
            ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
            : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
          }
          <span className="text-[10px]">{icon}</span>
          <span className="text-[11px] font-medium">{label}</span>
          <span className="text-[9px] text-muted-foreground/50 ml-auto">
            {sectionReadCount}/{entries.length}
          </span>
        </button>
        {isOpen && (
          <div className="ml-2 mt-1 space-y-1.5">
            {entries.map((entry) => {
              const globalIndex = platform.knowhow.indexOf(entry);
              return renderEntry(entry, globalIndex);
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-12 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <PlatformIcon platformId={platform.id} size={18} />
            <h2 className="text-sm font-semibold">{platform.name} ノウハウ</h2>
            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {totalCount} 件
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted transition text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 進捗バー */}
        <div className="px-4 py-2 border-b border-border shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">
              学習進捗
            </span>
            <span className="text-[10px] font-medium text-primary">
              {readCount}/{totalCount} 読了 ({progressPercent}%)
            </span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* ノウハウ一覧（アコーディオン） */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* お気に入りセクション */}
          {favoriteEntries.length > 0 && renderSection(
            "favorites",
            "お気に入り",
            "\u2764\uFE0F",
            favoriteEntries,
          )}

          {/* カテゴリ別セクション */}
          {categories.map((cat) => {
            const info = KNOWHOW_CATEGORIES[cat];
            const entries = platform.knowhow.filter((k) => k.category === cat);
            return renderSection(cat, info.label, info.icon, entries);
          })}
        </div>

        {/* フッター */}
        <div className="px-4 py-2 border-t border-border shrink-0">
          <p className="text-[9px] text-muted-foreground/50 text-center">
            クリックで AI コンテキストに追加 / ハートでお気に入り保存
          </p>
        </div>
      </div>
    </div>
  );
}

/** InspectorPanel 内に配置するノウハウ起動ボタン */
export function KnowledgeButton({ onClick, count }: { onClick: () => void; count: number }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/50 transition group"
    >
      <BookOpen className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition" />
      <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition">
        ノウハウ
      </span>
      <span className="text-[9px] text-muted-foreground/50 ml-auto">{count} 件</span>
    </button>
  );
}
