/**
 * 投稿タイミング提案ロジック
 *
 * X アルゴリズム調査（docs/research/x-algorithm-deep-dive-2026.md）の知見に基づく。
 * spec: AKARI-HUB-014 §6
 */

export interface TimingSuggestion {
  /** 推奨投稿時刻（今日 or 明日の Date） */
  suggestedAt: Date;
  /** 理由 */
  reason: string;
  /** 信頼度 (0-1) */
  confidence: number;
}

/** 曜日別の最適時間帯（日本市場） */
const BEST_HOURS: Record<string, number[]> = {
  // 平日
  weekday: [7, 8, 12, 17, 18, 19, 20, 21],
  // 週末
  weekend: [9, 10, 11, 12, 15, 16, 20, 21],
};

/** 曜日の効果スコア（月=1, 日=0） */
const DAY_SCORES: Record<number, number> = {
  0: 0.6,  // 日
  1: 0.8,  // 月
  2: 1.0,  // 火
  3: 1.0,  // 水
  4: 0.95, // 木
  5: 0.75, // 金
  6: 0.65, // 土
};

/** 時間帯のエンゲージメントスコア（日本市場） */
const HOUR_SCORES: Record<number, number> = {
  7: 0.7, 8: 0.8, 9: 0.6, 10: 0.5, 11: 0.5,
  12: 0.95, 13: 0.7, 14: 0.4, 15: 0.5, 16: 0.5,
  17: 0.85, 18: 0.9, 19: 0.95, 20: 1.0, 21: 0.9,
  22: 0.6, 23: 0.3,
};

/** 現在時刻から次の最適投稿タイミングを3つ提案 */
export function suggestTimings(count = 3): TimingSuggestion[] {
  const now = new Date();
  const candidates: { date: Date; score: number; reason: string }[] = [];

  // 今日と明日の全時間帯をスコアリング
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    const dayOfWeek = d.getDay();
    const dayScore = DAY_SCORES[dayOfWeek] ?? 0.5;
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const bestHours = isWeekend ? BEST_HOURS.weekend! : BEST_HOURS.weekday!;

    for (const hour of bestHours) {
      const candidate = new Date(d);
      candidate.setHours(hour, 0, 0, 0);

      // 過去の時刻はスキップ（1時間以内は許容）
      if (candidate.getTime() < now.getTime() - 30 * 60 * 1000) continue;

      const hourScore = HOUR_SCORES[hour] ?? 0.3;
      const score = dayScore * hourScore;

      const dayNames = ["日", "月", "火", "水", "木", "金", "土"];
      const dayName = dayNames[dayOfWeek]!;
      const reason = buildReason(hour, dayName, isWeekend);

      candidates.push({ date: candidate, score, reason });
    }
  }

  // スコア順にソートして上位 N 件
  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, count).map((c) => ({
    suggestedAt: c.date,
    reason: c.reason,
    confidence: Math.min(c.score, 1),
  }));
}

function buildReason(hour: number, dayName: string, isWeekend: boolean): string {
  if (hour >= 12 && hour < 13) return `${dayName}曜 昼休み帯（12-13時）はスマホ利用ピーク`;
  if (hour >= 17 && hour <= 19) return `${dayName}曜 帰宅時間帯（17-19時）はエンゲージメント高`;
  if (hour >= 20 && hour <= 21) return `${dayName}曜 ゴールデンタイム（20-21時）は最もアクティブ`;
  if (hour >= 7 && hour <= 8) return `${dayName}曜 朝の通勤時間帯`;
  if (isWeekend && hour >= 9 && hour <= 11) return `${dayName}曜 週末午前はゆったり閲覧`;
  return `${dayName}曜 ${hour}時台`;
}

/** Date を "今日 20:00" / "明日 12:00" 形式にフォーマット */
export function formatSuggestionTime(date: Date): string {
  const now = new Date();
  const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth();
  const prefix = isToday ? "今日" : "明日";
  const h = date.getHours().toString().padStart(2, "0");
  return `${prefix} ${h}:00`;
}
