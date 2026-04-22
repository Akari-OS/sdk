// スタイル管理 — Work ごとの共通スタイル + プラットフォーム別オーバーライドの2層構造

function uuid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type EmojiUsage = "none" | "少なめ" | "普通" | "多め";

export interface WriterStyle {
  id: string;
  name: string;
  /** 口調 */
  tone: string;
  /** 絵文字の使い方 */
  emojiUsage: EmojiUsage;
  /** ハッシュタグルール */
  hashtagRule: string;
  /** その他のスタイルメモ */
  notes: string;
}

/** PF 別オーバーライド（全フィールド optional） */
export type PlatformStyleOverride = Partial<Omit<WriterStyle, "id" | "name">> & {
  /** X スレッド分割数（1-10） */
  threadSplitCount?: number;
};

/** Work に埋め込むスタイル設定（ベース + PF別オーバーライドの2層） */
export interface WorkStyleConfig {
  base: Omit<WriterStyle, "id">;
  overrides: Record<string, PlatformStyleOverride>;
}

export type TonePreset = "casual" | "formal" | "technical" | "custom";

export interface TonePresetDef {
  id: TonePreset;
  label: string;
  tone: string;
  emoji: EmojiUsage;
  hashtag: string;
  notes: string;
}

// ---------------------------------------------------------------------------
// プリセット定義
// ---------------------------------------------------------------------------

export const TONE_PRESETS: TonePresetDef[] = [
  {
    id: "casual",
    label: "カジュアル",
    tone: "フランクな話し言葉。〜だよね、〜してみて、等",
    emoji: "普通",
    hashtag: "3個以内、日本語中心",
    notes: "",
  },
  {
    id: "formal",
    label: "フォーマル",
    tone: "ですます調。丁寧で落ち着いたトーン",
    emoji: "少なめ",
    hashtag: "2個以内、日本語",
    notes: "",
  },
  {
    id: "technical",
    label: "技術者向け",
    tone: "簡潔で正確。専門用語OK。である調",
    emoji: "none",
    hashtag: "英語タグ中心、3個以内",
    notes: "数字やデータを使って具体性を出す",
  },
  {
    id: "custom",
    label: "カスタム",
    tone: "",
    emoji: "普通",
    hashtag: "",
    notes: "",
  },
];

// ---------------------------------------------------------------------------
// localStorage 永続化
// ---------------------------------------------------------------------------

const STYLES_KEY = "akari.writer.styles";
const ACTIVE_STYLE_KEY = "akari.writer.activeStyleId";

export function loadStyles(): WriterStyle[] {
  try {
    const raw = localStorage.getItem(STYLES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as WriterStyle[];
  } catch {
    return [];
  }
}

export function saveStyles(styles: WriterStyle[]): void {
  localStorage.setItem(STYLES_KEY, JSON.stringify(styles));
}

export function getActiveStyleId(): string | null {
  return localStorage.getItem(ACTIVE_STYLE_KEY);
}

export function setActiveStyleId(id: string | null): void {
  if (id) {
    localStorage.setItem(ACTIVE_STYLE_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_STYLE_KEY);
  }
}

// ---------------------------------------------------------------------------
// ファクトリ
// ---------------------------------------------------------------------------

export function createStyleFromPreset(preset: TonePresetDef): WriterStyle {
  return {
    id: uuid(),
    name: preset.label,
    tone: preset.tone,
    emojiUsage: preset.emoji,
    hashtagRule: preset.hashtag,
    notes: preset.notes,
  };
}

// ---------------------------------------------------------------------------
// プロンプト注入
// ---------------------------------------------------------------------------

/** スタイル情報をプロンプト文字列に変換（エンハンス・Chat コンテキスト用） */
export function styleToPromptContext(style: Pick<WriterStyle, "name" | "tone" | "emojiUsage" | "hashtagRule" | "notes">): string {
  const lines: string[] = [];
  lines.push(`スタイル: ${style.name}`);
  if (style.tone) lines.push(`口調: ${style.tone}`);
  if (style.emojiUsage !== "none") lines.push(`絵文字: ${style.emojiUsage}`);
  if (style.hashtagRule) lines.push(`ハッシュタグ: ${style.hashtagRule}`);
  if (style.notes) lines.push(`補足: ${style.notes}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// WorkStyleConfig 用関数
// ---------------------------------------------------------------------------

/** デフォルトの WorkStyleConfig を作成 */
export function createDefaultWorkStyle(): WorkStyleConfig {
  return {
    base: { name: "カスタム", tone: "", emojiUsage: "普通", hashtagRule: "", notes: "" },
    overrides: {},
  };
}

/** プリセットから WorkStyleConfig を作成 */
export function createWorkStyleFromPreset(preset: TonePresetDef): WorkStyleConfig {
  return {
    base: { name: preset.label, tone: preset.tone, emojiUsage: preset.emoji, hashtagRule: preset.hashtag, notes: preset.notes },
    overrides: {},
  };
}

/** PF 別にマージ済みスタイルを返す */
export function resolveStyleForPlatform(
  config: WorkStyleConfig,
  platformId: string,
): Omit<WriterStyle, "id"> {
  const override = config.overrides[platformId];
  if (!override) return config.base;
  return {
    name: config.base.name,
    tone: override.tone ?? config.base.tone,
    emojiUsage: override.emojiUsage ?? config.base.emojiUsage,
    hashtagRule: override.hashtagRule ?? config.base.hashtagRule,
    notes: override.notes ?? config.base.notes,
  };
}

/** WorkStyleConfig から PF 別プロンプト文字列を生成 */
export function styleConfigToPromptContext(config: WorkStyleConfig, platformId: string): string {
  const resolved = resolveStyleForPlatform(config, platformId);
  return styleToPromptContext(resolved);
}
