/**
 * Pool アイテムの編集履歴 (frontend-only)。
 *
 * pool-core (Rust + SQLite) 側の本格的な revision 機能が入るまでの暫定実装。
 * localStorage に保存するため:
 *   - 同じマシン内でのみ有効
 *   - 別マシン / 再インストール時には消える
 *   - max件数を超えたら古いものから削除
 *
 * 保存対象: ai_summary / ai_tags / name の編集前 snapshot。
 */

const STORAGE_KEY = "akari-shell:pool-item-history:v1";
const MAX_REVISIONS_PER_ITEM = 20;

export interface ItemRevision {
  /** ISO timestamp */
  at: string;
  name?: string;
  ai_summary?: string | null;
  ai_tags?: string[];
  /** 編集の出所 (manual / ai-analysis / unknown) */
  source: "manual" | "ai-analysis" | "unknown";
}

type HistoryMap = Record<string, ItemRevision[]>;

function key(workspace: string, itemId: string): string {
  return `${workspace}/${itemId}`;
}

function loadAll(): HistoryMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as HistoryMap;
  } catch {
    return {};
  }
}

function saveAll(map: HistoryMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // quota 超過等
  }
}

/**
 * 編集前の値を履歴に push する。
 * 直近 revision と同じ内容なら no-op (重複削減)。
 */
export function pushRevision(
  workspace: string,
  itemId: string,
  rev: Omit<ItemRevision, "at">,
): void {
  const all = loadAll();
  const k = key(workspace, itemId);
  const list = all[k] ?? [];
  const last = list[0];
  if (
    last &&
    last.name === rev.name &&
    last.ai_summary === rev.ai_summary &&
    JSON.stringify(last.ai_tags ?? []) === JSON.stringify(rev.ai_tags ?? [])
  ) {
    return;
  }
  const next: ItemRevision = { ...rev, at: new Date().toISOString() };
  const trimmed = [next, ...list].slice(0, MAX_REVISIONS_PER_ITEM);
  all[k] = trimmed;
  saveAll(all);
}

export function getRevisions(workspace: string, itemId: string): ItemRevision[] {
  const all = loadAll();
  return all[key(workspace, itemId)] ?? [];
}

export function clearRevisions(workspace: string, itemId: string): void {
  const all = loadAll();
  delete all[key(workspace, itemId)];
  saveAll(all);
}
