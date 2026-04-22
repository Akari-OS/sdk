/**
 * スレッド/コメント連投ユーティリティ
 *
 * テキスト内の `\n---\n` をツイート/コメントの境界として扱う。
 */

/** スレッド区切り文字 */
export const THREAD_SEPARATOR = "\n---\n";

/** テキストをスレッドパートに分割 */
export function splitThread(text: string): string[] {
  if (!text.includes("---")) return [text];
  return text.split(/\n---\n/).map((p) => p.trim()).filter(Boolean);
}

/** テキストがスレッド形式かどうか */
export function isThreadContent(text: string): boolean {
  return splitThread(text).length > 1;
}

/** パートごとの文字数情報 */
export interface ThreadPartInfo {
  index: number;
  text: string;
  count: number;
  limit: number | null;
  over: boolean;
}

/** パートごとの文字数を計算 */
export function threadPartCounts(
  text: string,
  maxChars: number | null,
): ThreadPartInfo[] {
  const parts = splitThread(text);
  return parts.map((t, i) => {
    const count = [...t].length;
    return {
      index: i,
      text: t,
      count,
      limit: maxChars,
      over: maxChars !== null && count > maxChars,
    };
  });
}
