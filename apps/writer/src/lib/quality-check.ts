/**
 * 品質チェックロジック
 *
 * エンハンス後にクライアントサイドで自動実行。
 * spec: AKARI-HUB-014 §4.3
 */

import type { PlatformContent } from "@/lib/works";
import { getPlatform } from "@/lib/platforms";
import { splitThread, isThreadContent } from "@/lib/thread-utils";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type CheckSeverity = "error" | "warning" | "info";

export interface QualityIssue {
  platformId: string;
  severity: CheckSeverity;
  message: string;
  /** 自動修正が可能か（将来用） */
  fixable?: boolean;
}

export interface QualityReport {
  issues: QualityIssue[];
  checkedAt: number;
}

// ---------------------------------------------------------------------------
// チェック関数
// ---------------------------------------------------------------------------

export function checkQuality(
  contents: Record<string, PlatformContent>,
  selectedPlatforms: string[],
): QualityReport {
  const issues: QualityIssue[] = [];

  for (const pid of selectedPlatforms) {
    const pf = getPlatform(pid);
    const content = contents[pid];
    if (!content) continue;

    const text = content.text;

    // 1. 文字数チェック（スレッドの場合はパート別）
    if (pf.maxChars && isThreadContent(text)) {
      const parts = splitThread(text);
      for (let i = 0; i < parts.length; i++) {
        const partCount = [...parts[i]!].length;
        if (partCount > pf.maxChars) {
          const over = partCount - pf.maxChars;
          issues.push({
            platformId: pid,
            severity: "error",
            message: `${pf.name}: ツイート${i + 1} — ${partCount}字 → ${pf.maxChars}字制限を${over}字超過`,
            fixable: true,
          });
        }
      }
    } else {
      const charCount = [...text].length;
      if (pf.maxChars && charCount > pf.maxChars) {
        const over = charCount - pf.maxChars;
        issues.push({
          platformId: pid,
          severity: "error",
          message: `${pf.name}: ${charCount}字 → ${pf.maxChars}字制限を${over}字超過`,
          fixable: true,
        });
      } else if (pf.maxChars && charCount > pf.maxChars * 0.9) {
        issues.push({
          platformId: pid,
          severity: "info",
          message: `${pf.name}: ${charCount}/${pf.maxChars}字（残り${pf.maxChars - charCount}字）`,
        });
      }
    }

    // 2. テキストが空
    if (text.trim().length === 0) {
      issues.push({
        platformId: pid,
        severity: "warning",
        message: `${pf.name}: テキストが空です`,
      });
    }

    // 3. 画像必須チェック
    if (pf.media.required && content.media.length === 0) {
      issues.push({
        platformId: pid,
        severity: "error",
        message: `${pf.name}: 画像が必須ですが添付されていません`,
      });
    }

    // 4. 画像枚数超過
    if (content.media.length > pf.media.maxImages) {
      issues.push({
        platformId: pid,
        severity: "error",
        message: `${pf.name}: 画像${content.media.length}枚 → 最大${pf.media.maxImages}枚`,
      });
    }

    // 5. X リンクペナルティ警告
    if ((pid === "x" || pid === "x_long") && /https?:\/\//.test(text)) {
      issues.push({
        platformId: pid,
        severity: "warning",
        message: `${pf.name}: 外部リンクはリーチが 30〜50% 減少する可能性があります`,
      });
    }

    // 6. ハッシュタグ数チェック（多すぎる場合）
    const hashtags = text.match(/#\S+/g);
    if (hashtags && hashtags.length > 10) {
      issues.push({
        platformId: pid,
        severity: "warning",
        message: `${pf.name}: ハッシュタグ${hashtags.length}個 → 多すぎるとスパム判定のリスク`,
      });
    }
  }

  return { issues, checkedAt: Date.now() };
}

/** severity の優先度で並べ替え */
export function sortIssues(issues: QualityIssue[]): QualityIssue[] {
  const order: Record<CheckSeverity, number> = { error: 0, warning: 1, info: 2 };
  return [...issues].sort((a, b) => order[a.severity] - order[b.severity]);
}
