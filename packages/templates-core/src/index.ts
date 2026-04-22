/**
 * 投稿テンプレート定義 + 方針データ型
 *
 * spec: AKARI-HUB-014 §3
 */

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export interface TemplateField {
  id: string;
  label: string;
  type: "text" | "textarea" | "date" | "select";
  placeholder?: string;
  required?: boolean;
  /** type: "select" の場合の選択肢 */
  options?: string[];
}

export interface PostTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** 方針に含める入力フィールド */
  fields: TemplateField[];
  /** AI に渡す追加コンテキスト */
  aiContext: string;
  /** 推奨する投稿先 */
  suggestedPlatforms?: string[];
}

/** Work に紐づく方針データ */
export interface PolicyData {
  templateId: string;
  /** テンプレートの各フィールドの入力値 */
  fields: Record<string, string>;
  /** 自由記述メモ（旧 sourceDraft の役割を引き継ぐ） */
  memo: string;
}

// ---------------------------------------------------------------------------
// テンプレート定義（9 種類）
// ---------------------------------------------------------------------------

export const TEMPLATES: PostTemplate[] = [
  {
    id: "free",
    name: "フリー",
    icon: "✏️",
    description: "自由記述。テンプレートなしで自由に書く",
    fields: [],
    aiContext: "ユーザーの自由な投稿。特定のフォーマットにとらわれず、意図を汲み取って最適化してください。",
  },
  {
    id: "event",
    name: "イベント告知",
    icon: "📅",
    description: "イベントの告知・集客用",
    fields: [
      { id: "event_name", label: "イベント名", type: "text", placeholder: "例: AKARI ハンズオン Vol.3", required: true },
      { id: "date", label: "日時", type: "text", placeholder: "例: 2026-04-20 14:00-17:00" },
      { id: "venue", label: "場所", type: "text", placeholder: "例: 渋谷 Startup Hub" },
      { id: "content", label: "内容", type: "textarea", placeholder: "何をするイベントか" },
      { id: "target", label: "ターゲット", type: "text", placeholder: "例: AI ツールに興味ある個人開発者" },
      { id: "url", label: "申込URL", type: "text", placeholder: "https://..." },
    ],
    aiContext: "イベント告知の投稿。日時・場所・内容を明確にし、参加したくなる訴求を作ってください。CTAを忘れずに。",
    suggestedPlatforms: ["x", "threads", "ig_feed", "facebook"],
  },
  {
    id: "product",
    name: "商品/サービス紹介",
    icon: "🛍️",
    description: "商品やサービスの紹介・販促",
    fields: [
      { id: "product_name", label: "名前", type: "text", placeholder: "例: AKARI Video", required: true },
      { id: "features", label: "特徴", type: "textarea", placeholder: "主な特徴・差別化ポイント" },
      { id: "price", label: "価格", type: "text", placeholder: "例: 無料 / ¥980/月" },
      { id: "cta", label: "CTA", type: "text", placeholder: "例: 今すぐ無料で始める" },
      { id: "url", label: "URL", type: "text", placeholder: "https://..." },
    ],
    aiContext: "商品・サービスの紹介投稿。特徴を簡潔に伝え、CTAで行動を促してください。",
    suggestedPlatforms: ["x", "ig_feed", "facebook"],
  },
  {
    id: "release",
    name: "リリース/お知らせ",
    icon: "🚀",
    description: "新機能リリースやお知らせ",
    fields: [
      { id: "what", label: "何が変わったか", type: "textarea", placeholder: "新機能・変更内容", required: true },
      { id: "who", label: "誰に影響", type: "text", placeholder: "例: 全ユーザー / Premium ユーザー" },
      { id: "url", label: "リンク", type: "text", placeholder: "https://..." },
    ],
    aiContext: "リリース告知の投稿。変更点を明確に伝え、ユーザーの期待を高めてください。",
    suggestedPlatforms: ["x", "threads", "note"],
  },
  {
    id: "blog_share",
    name: "ブログ記事シェア",
    icon: "📝",
    description: "ブログ記事や外部コンテンツの共有",
    fields: [
      { id: "title", label: "記事タイトル", type: "text", placeholder: "例: AI時代の個人開発", required: true },
      { id: "url", label: "URL", type: "text", placeholder: "https://..." },
      { id: "summary", label: "要約", type: "textarea", placeholder: "記事の要点" },
      { id: "learning", label: "学び/感想", type: "textarea", placeholder: "自分が感じたこと" },
    ],
    aiContext: "ブログ記事のシェア投稿。記事の価値を伝えつつ、自分の視点を添えてください。Xではリンクペナルティに注意。",
    suggestedPlatforms: ["x", "threads", "facebook"],
  },
  {
    id: "daily",
    name: "日常/感想",
    icon: "💭",
    description: "日常の出来事や感想をシェア",
    fields: [
      { id: "theme", label: "テーマ", type: "text", placeholder: "例: 今日のランチ / 読書感想" },
      { id: "feeling", label: "感情", type: "select", options: ["嬉しい", "驚き", "感動", "考えさせられる", "面白い", "悔しい", "その他"] },
      { id: "learning", label: "学び", type: "textarea", placeholder: "気づいたこと・学んだこと" },
    ],
    aiContext: "日常の感想投稿。親しみやすく、共感を呼ぶトーンで。絵文字は控えめに。",
    suggestedPlatforms: ["x", "threads"],
  },
  {
    id: "quote",
    name: "引用/意見",
    icon: "💬",
    description: "他のコンテンツを引用して意見を述べる",
    fields: [
      { id: "source", label: "元ネタ（URL or テキスト）", type: "textarea", placeholder: "引用元の内容やURL", required: true },
      { id: "opinion", label: "自分の意見", type: "textarea", placeholder: "引用に対する考え" },
    ],
    aiContext: "引用＋意見の投稿。元ネタを簡潔に紹介した上で、独自の視点を加えてください。",
    suggestedPlatforms: ["x", "threads"],
  },
  {
    id: "tips",
    name: "ノウハウ/Tips",
    icon: "💡",
    description: "知識やノウハウをまとめてシェア",
    fields: [
      { id: "topic", label: "トピック", type: "text", placeholder: "例: Rust の便利マクロ", required: true },
      { id: "point_count", label: "要点の数", type: "select", options: ["1", "3", "5", "7"] },
      { id: "target", label: "対象者", type: "text", placeholder: "例: Rust 初心者" },
    ],
    aiContext: "ノウハウ・Tips 投稿。箇条書きで読みやすく、実用的な内容を。番号付きリストが効果的。",
    suggestedPlatforms: ["x", "threads", "note"],
  },
  {
    id: "news",
    name: "ニュース/トレンド",
    icon: "📰",
    description: "最新ニュースやトレンド情報を発信",
    fields: [
      { id: "topic", label: "トピック", type: "text", placeholder: "例: エッジAIの普及", required: true },
      { id: "source", label: "情報源", type: "text", placeholder: "例: TechCrunch, 公式発表" },
      { id: "angle", label: "切り口", type: "text", placeholder: "例: 技術者目線, 一般向け解説" },
    ],
    aiContext: "ニュース・トレンド投稿。最新情報を簡潔にまとめ、読者にとっての意味や影響を伝える。ソースの信頼性を意識。",
    suggestedPlatforms: ["x", "threads", "note"],
  },
  {
    id: "thread",
    name: "スレッド（X 長文）",
    icon: "🧵",
    description: "X のスレッド形式で長文を投稿",
    fields: [
      { id: "theme", label: "テーマ", type: "text", placeholder: "スレッドのメインテーマ", required: true },
      { id: "points", label: "各ツイートの要点", type: "textarea", placeholder: "1. ...\n2. ...\n3. ..." },
    ],
    aiContext: "Xスレッド投稿。各ツイートを「---」（ハイフン3つの行）で区切って出力してください。冒頭でフックを作り、各ツイートが独立して読めつつ全体でストーリーになるように。最後にまとめ＋CTAを。各ツイートは280字以内に収めてください。",
    suggestedPlatforms: ["x"],
  },
];

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

export function getTemplate(id: string): PostTemplate {
  return TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]!;
}

/** PolicyData のデフォルト値を生成 */
export function createDefaultPolicy(templateId = "free"): PolicyData {
  return { templateId, fields: {}, memo: "" };
}

/** sourceDraft（旧形式）から PolicyData にマイグレーション */
export function migrateSourceDraft(sourceDraft: string): PolicyData {
  return { templateId: "free", fields: {}, memo: sourceDraft };
}

/** 方針をプロンプト文字列に変換（エンハンス・Chat コンテキスト用） */
export function policyToPromptContext(policy: PolicyData): string {
  const template = getTemplate(policy.templateId);
  const lines: string[] = [];

  lines.push(`テンプレート: ${template.name}`);

  // 入力済みフィールドを列挙
  for (const field of template.fields) {
    const val = policy.fields[field.id]?.trim();
    if (val) {
      lines.push(`${field.label}: ${val}`);
    }
  }

  if (policy.memo.trim()) {
    lines.push(`\n追加メモ:\n${policy.memo.trim()}`);
  }

  return lines.join("\n");
}
