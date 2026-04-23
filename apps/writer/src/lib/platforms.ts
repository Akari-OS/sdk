/**
 * プラットフォーム定義。spec: AKARI-HUB-009 §7
 *
 * Phase 0: X のみ投稿可能。他は UI だけ表示して投稿は Phase 1+。
 */

/** ノウハウのカテゴリ */
export interface KnowhowEntry {
  category: "writing" | "image" | "video" | "algorithm" | "general";
  text: string;
}

/** カテゴリの表示名 */
export const KNOWHOW_CATEGORIES: Record<KnowhowEntry["category"], { label: string; icon: string }> = {
  writing: { label: "ライティング", icon: "✍️" },
  image: { label: "画像", icon: "🖼️" },
  video: { label: "動画", icon: "🎬" },
  algorithm: { label: "アルゴリズム", icon: "📊" },
  general: { label: "一般", icon: "💡" },
};

export interface PlatformConfig {
  id: string;
  name: string;
  icon: string;
  maxChars: number | null;
  description: string;
  /** Phase 0 で投稿可能か */
  enabled: boolean;
  /** プラットフォームの事実スペック（文字数制限、画像・動画サイズ等） */
  facts: string[];
  /** カテゴリ別ノウハウ（ポップアップで表示、AI コンテキストに注入可能） */
  knowhow: KnowhowEntry[];
  /** エディター設定 */
  editor: {
    /** Markdown 対応 */
    markdown: boolean;
    /** リッチテキスト要素 */
    features: string[];
  };
  /** 画像設定 */
  media: {
    /** サムネイル（アイキャッチ）が必要か */
    thumbnail: boolean;
    /** 最大添付画像数 */
    maxImages: number;
    /** 画像が必須か */
    required: boolean;
    /** 本文内に画像挿入可能か */
    inlineImages: boolean;
    /** 説明 */
    description: string;
  };
  /** プラン別オーバーライド（X 等） */
  plans?: PlanOverride[];
}

/** プラン切替定義 */
export interface PlanOverride {
  id: string;
  label: string;
  overrides: Partial<Pick<PlatformConfig, "maxChars" | "facts" | "media">>;
}

/** X プラン */
export type XPlan = "free" | "premium" | "premium_plus";

/** グローバル設定キー */
const X_PLAN_KEY = "akari.settings.xPlan";

export function getXPlan(): XPlan {
  return (localStorage.getItem(X_PLAN_KEY) as XPlan) ?? "free";
}

export function setXPlan(plan: XPlan): void {
  localStorage.setItem(X_PLAN_KEY, plan);
}

/** プラットフォームのカテゴリ */
export type PlatformCategory = "text" | "image" | "video" | "article";

/**
 * 原稿（大元の文章）タブの仮想プラットフォーム ID。
 * SNS ではなくエンハンス元のソース文章を保持する。
 */
export const SOURCE_PLATFORM_ID = "__source__";

/** 原稿タブの synthetic 設定 */
const SOURCE_PLATFORM: PlatformConfig = {
  id: SOURCE_PLATFORM_ID,
  name: "原稿",
  icon: "📝",
  maxChars: null,
  description: "エンハンス元になる大元の文章",
  enabled: false,
  facts: [],
  knowhow: [],
  editor: { markdown: false, features: [] },
  media: { thumbnail: false, maxImages: 0, required: false, inlineImages: false, description: "" },
};

export const PLATFORMS: PlatformConfig[] = [
  // === テキスト系 ===
  {
    id: "x", name: "X", icon: "𝕏", maxChars: 280, description: "短文投稿 280字", enabled: true,
    facts: [
      "280字制限（Free プラン）",
      "リンクは23字にカウント",
      "画像: 最大4枚 / 1200×675px推奨 (16:9) / 最大5MB / PNG,JPEG",
      "動画: 最大140秒 / 512MB / MP4,MOV",
    ],
    knowhow: [
      // ライティング
      { category: "writing", text: "冒頭1行がフック — TLで最初の一文だけ見える。そこで止まらせる" },
      { category: "writing", text: "1ツイート1メッセージ。詰め込むと読まれない" },
      { category: "writing", text: "ハッシュタグは1-2個が最適（+55%エンゲージメント）。5個以上で-17%" },
      { category: "writing", text: "ハッシュタグは文中に自然に組み込む方が末尾まとめより+23%効果的" },
      { category: "writing", text: "ソフトCTA（「あなたの経験は？」）はリプライ誘発でアルゴリズム有利" },
      { category: "writing", text: "好奇心ギャップ（結論を匂わせて明かさない）で+30%エンゲージメント" },
      { category: "writing", text: "逆張り（Contrarian Take）は即座に緊張を生み、スクロールを止める" },
      { category: "writing", text: "引用RTは通常ツイートの約2倍のエンゲージメント率（3.7%）。週3-4回が目安" },
      // 画像・動画
      { category: "image", text: "16:9（1200×675px）がTLで最も見やすい。縦長は上下が見切れる" },
      { category: "image", text: "中央80%にコンテンツを収める。端はプロフ画像で隠れる場合あり" },
      { category: "image", text: "GIFは全メディアで最強 — エンゲージメント×6（中央値6.5インタラクション）" },
      { category: "image", text: "ネイティブ動画はYouTubeリンクの3倍のエンゲージメント" },
      // アルゴリズム
      { category: "algorithm", text: "最初の30分が勝負 — 初期エンゲージメントが指数関数的に到達範囲を決定" },
      { category: "algorithm", text: "リプライ(×13.5) > ブックマーク(×10) > いいね(×1)。リプライを誘発する設計が最強" },
      { category: "algorithm", text: "返信への返信は×75の最高重み。会話の連鎖を生む投稿が最も拡散する" },
      { category: "algorithm", text: "外部リンクは-30〜50%リーチ減少。Freeアカウントはほぼ不可視（2025年3月〜）" },
      { category: "algorithm", text: "ブックマーク(×10)は保存価値のあるコンテンツが有利。リスト・フレームワーク形式" },
      { category: "algorithm", text: "Grok AI感情分析: ポジティブ/建設的→配信拡大、攻撃的→高エンゲージでも抑制" },
      { category: "algorithm", text: "Premium: フォロワー向け×4、非フォロワー向け×2のブースト" },
      { category: "algorithm", text: "投稿後6時間で可視性50%減衰。鮮度が重要" },
      // 一般
      { category: "general", text: "最適投稿時間: 火〜木の9-11時・12-18時。日本は12-13時・17-19時" },
      { category: "general", text: "頻度は2-3投稿/日が品質重視の最適値。高頻度自体はペナルティにならない" },
      { category: "general", text: "日本語は英語の2.5倍の情報密度 — 280字で大量の情報を詰められる" },
      { category: "general", text: "シャドウバン回避: 大量フォロー/アンフォロー・連続いいね・同一投稿反復を避ける" },
    ],
    editor: { markdown: false, features: [] },
    media: { thumbnail: false, maxImages: 4, required: false, inlineImages: false, description: "画像4枚まで" },
    plans: [
      { id: "free", label: "Free", overrides: { maxChars: 280 } },
      { id: "premium", label: "Premium", overrides: { maxChars: 25000, facts: [
        "25000字まで（Premium）",
        "リンクは23字にカウント",
        "画像: 最大4枚 / 1200×675px推奨 / 最大5MB",
        "動画: 最大140秒 / 512MB / MP4,MOV",
        "投稿スケジュール機能",
      ] } },
      { id: "premium_plus", label: "Premium+", overrides: { maxChars: 25000, facts: [
        "25000字まで（Premium+）",
        "リンクは23字にカウント",
        "画像: 最大4枚 / 1200×675px推奨 / 最大5MB",
        "動画: 最大4時間 / 1080p / 15GB / MP4,MOV",
        "投稿スケジュール機能",
      ] } },
    ],
  },
  {
    id: "x_long", name: "X 長文", icon: "𝕏+", maxChars: 25000, description: "長文ポスト", enabled: false,
    facts: [
      "最大25000字（Premium 以上）",
      "Markdown風書式対応",
      "画像: 文中挿入可 / 最大10枚",
    ],
    knowhow: [
      { category: "writing", text: "冒頭が折りたたみプレビューになるので、最初の2-3行で読む理由を作る" },
      { category: "writing", text: "見出し(##)で構造化すると長文でもスキャンしやすい" },
      { category: "image", text: "本文中に画像を挿入できる。図解を挟むと読了率が上がる" },
    ],
    editor: { markdown: true, features: ["見出し", "太字", "リスト", "画像挿入"] },
    media: { thumbnail: true, maxImages: 10, required: false, inlineImages: true, description: "サムネイル + 本文内画像" },
  },
  {
    id: "threads", name: "Threads", icon: "🧵", maxChars: 500, description: "カジュアル短文 500字", enabled: false,
    facts: [
      "500字制限",
      "画像: 最大10枚 / 1080×1350px推奨 (4:5) / PNG,JPEG",
      "動画: 最大5分 / 500MB / 1080×1920px (9:16) / MP4",
    ],
    knowhow: [
      { category: "writing", text: "カジュアルなトーンが好まれる。硬すぎると浮く" },
      { category: "writing", text: "ハッシュタグは控えめに（0-3個）" },
      { category: "algorithm", text: "動画は90秒以内がエンゲージメント高い" },
      { category: "image", text: "元の比率がそのまま表示される。強制クロップなし" },
    ],
    editor: { markdown: false, features: [] },
    media: { thumbnail: false, maxImages: 10, required: false, inlineImages: false, description: "画像10枚まで" },
  },

  {
    id: "facebook", name: "Facebook", icon: "📘", maxChars: 63206, description: "Facebook 投稿", enabled: false,
    facts: [
      "最大63,206字（実質無制限）",
      "画像: 最大10枚 / 1200×630px推奨 (1.91:1) / PNG,JPEG",
      "動画: 最大240分 / 10GB / MP4,MOV",
      "リンクプレビュー: OGP 画像自動取得",
    ],
    knowhow: [
      { category: "writing", text: "最初の3行がプレビュー表示。「もっと見る」を押させるフックが重要" },
      { category: "writing", text: "長文でも読まれやすい。ストーリーテリング形式が効果的" },
      { category: "image", text: "1.91:1（1200×630px）がリンクシェアの最適比率" },
      { category: "image", text: "正方形・縦長画像も可。複数枚はグリッド表示" },
      { category: "algorithm", text: "コメントの長さと会話の深さがリーチに影響" },
      { category: "algorithm", text: "シェアが最も重みのあるエンゲージメント" },
      { category: "algorithm", text: "外部リンクはリーチ減少傾向。画像/動画ネイティブ投稿が有利" },
      { category: "general", text: "グループ投稿はページ投稿より高エンゲージメント" },
    ],
    editor: { markdown: false, features: [] },
    media: { thumbnail: false, maxImages: 10, required: false, inlineImages: false, description: "画像10枚まで" },
  },

  // === 画像系 ===
  {
    id: "ig_feed", name: "IG フィード", icon: "📷", maxChars: 2200, description: "写真/カルーセル投稿", enabled: false,
    facts: [
      "キャプション2200字",
      "画像: 必須 / 最大10枚 / 1080×1080px (1:1) or 1080×1350px (4:5)",
      "動画: 最大15分 / 1080×1920px (9:16) / MP4 (H.264+AAC)",
    ],
    knowhow: [
      { category: "writing", text: "ハッシュタグが重要（5-30個）。ニッチタグと人気タグを混ぜる" },
      { category: "writing", text: "絵文字を活用して段落を区切ると読みやすい" },
      { category: "image", text: "4:5 縦長がフィードで最も面積を取れる（1:1 より30%大きい）" },
      { category: "image", text: "カルーセル1枚目でスワイプしたくなる構成を。2枚目以降が本編" },
      { category: "algorithm", text: "保存数がアルゴリズムで重視される。保存したくなる情報を入れる" },
    ],
    editor: { markdown: false, features: ["絵文字"] },
    media: { thumbnail: false, maxImages: 10, required: true, inlineImages: false, description: "画像必須、10枚まで" },
  },
  {
    id: "ig_story", name: "IG ストーリー", icon: "📱", maxChars: null, description: "24時間限定ストーリー", enabled: false,
    facts: [
      "24時間で消える",
      "縦型フルスクリーン: 1080×1920px (9:16)",
      "セーフゾーン: 中央 1080×1610px（上下155pxは端末で見切れ）",
      "画像/動画1枚必須",
    ],
    knowhow: [
      { category: "writing", text: "テキストは短く大きく。スクロール速度が速いので瞬読できる量" },
      { category: "general", text: "スタンプ・GIF・投票・クイズ等のインタラクティブ要素でエンゲージ" },
      { category: "image", text: "上下155pxにはテキストを置かない（端末UI で隠れる）" },
      { category: "algorithm", text: "視聴完了率が重要。冒頭で離脱されない工夫を" },
    ],
    editor: { markdown: false, features: ["テキストオーバーレイ"] },
    media: { thumbnail: false, maxImages: 1, required: true, inlineImages: false, description: "画像/動画1枚必須" },
  },
  {
    id: "ig_reel", name: "IG リール", icon: "🎬", maxChars: 2200, description: "ショート動画 (最大3分)", enabled: false,
    facts: [
      "最大3分（旧90秒から拡大）",
      "縦型: 1080×1920px (9:16)",
      "キャプション2200字",
      "動画: MP4 (H.264+AAC)",
    ],
    knowhow: [
      { category: "video", text: "21-34秒がアルゴリズム的に最もパフォーマンスが高い" },
      { category: "video", text: "音楽・エフェクトの活用で Explore 掲載率が上がる" },
      { category: "writing", text: "キャプションに CTA を入れる（保存・シェア促し）" },
      { category: "algorithm", text: "リプレイ率が高い動画が優遇される。ループする構成が有利" },
    ],
    editor: { markdown: false, features: ["絵文字"] },
    media: { thumbnail: false, maxImages: 1, required: true, inlineImages: false, description: "動画必須" },
  },

  // === 動画系 ===
  {
    id: "tiktok", name: "TikTok", icon: "🎵", maxChars: 4000, description: "ショート動画", enabled: false,
    facts: [
      "ショート動画メイン（アプリ内最大10分）",
      "キャプション4000字",
      "動画: 1080×1920px (9:16) / 最大1GB / MP4,MOV",
      "カルーセル: 2-35枚の画像スライドショー",
    ],
    knowhow: [
      { category: "writing", text: "短く刺さるフレーズ重視。最初の文で「自分ごと化」させる" },
      { category: "writing", text: "ハッシュタグがリーチに直結（3-5個が目安）" },
      { category: "video", text: "21-34秒がアルゴリズム最適。冒頭3秒が勝負" },
      { category: "algorithm", text: "完全視聴率 > いいね数。最後まで見させる構成が最優先" },
      { category: "algorithm", text: "トレンドサウンドを使うと For You ページに載りやすい" },
    ],
    editor: { markdown: false, features: [] },
    media: { thumbnail: false, maxImages: 1, required: true, inlineImages: false, description: "動画必須" },
  },
  {
    id: "youtube", name: "YouTube", icon: "▶️", maxChars: 5000, description: "通常動画", enabled: false,
    facts: [
      "説明欄5000字",
      "サムネイル: 1280×720px (16:9) / 最大2MB / JPEG,PNG",
      "動画: 最大12時間 or 256GB / 1080p-4K推奨 / MP4 (H.264+AAC)",
    ],
    knowhow: [
      { category: "writing", text: "タイトルがSEOに超重要。検索キーワードを自然に含める" },
      { category: "writing", text: "チャプター（タイムスタンプ）を説明欄に入れると視聴維持率UP" },
      { category: "image", text: "サムネイルがCTR を左右する。文字は大きく、コントラスト強く" },
      { category: "video", text: "最初の30秒で視聴継続を決める。結論ファーストが有効" },
      { category: "algorithm", text: "視聴維持率 > 再生回数。50%以上の維持率を目指す" },
    ],
    editor: { markdown: false, features: ["タイムスタンプ", "リンク"] },
    media: { thumbnail: true, maxImages: 1, required: true, inlineImages: false, description: "サムネイル + 動画必須" },
  },
  {
    id: "youtube_short", name: "YT ショート", icon: "▶️", maxChars: 100, description: "ショート動画 (60秒)", enabled: false,
    facts: [
      "最大60秒の縦型動画（Shorts シェルフは60秒以内のみ）",
      "タイトル100字",
      "概要欄なし（タイトルのみ）",
      "動画: 1080×1920px (9:16) / MP4 (H.264+AAC)",
    ],
    knowhow: [
      { category: "writing", text: "タイトルに#Shorts は不要（自動判定）。キーワードを優先" },
      { category: "video", text: "最初の3秒で掴む。テンポの速い編集が有利" },
      { category: "algorithm", text: "ループ再生される構成が再生回数を伸ばす" },
      { category: "general", text: "ハッシュタグ推奨（2-3個）" },
    ],
    editor: { markdown: false, features: [] },
    media: { thumbnail: false, maxImages: 1, required: true, inlineImages: false, description: "縦型動画必須" },
  },

  // === 記事系 ===
  {
    id: "note", name: "Note", icon: "📝", maxChars: null, description: "note.com 記事", enabled: false,
    facts: [
      "文字数制限なし",
      "Markdown対応 / 目次自動生成",
      "画像: 埋め込み形式 / 動画は YouTube/Vimeo 埋め込みのみ",
      "音声: 直接アップロード可（最大100MB）",
    ],
    knowhow: [
      { category: "writing", text: "SEOを意識したタイトルが重要。検索流入がメイン" },
      { category: "writing", text: "見出し(h2/h3)で構造化すると目次に反映される" },
      { category: "image", text: "画像・埋め込みを豊富に使うと読みやすく、離脱が減る" },
      { category: "general", text: "有料記事にする場合、無料部分で価値を見せてから壁を作る" },
    ],
    editor: { markdown: true, features: ["見出し", "太字", "引用", "リスト", "画像", "埋め込み"] },
    media: { thumbnail: true, maxImages: 30, required: false, inlineImages: true, description: "サムネイル + 本文内画像" },
  },
  {
    id: "blog", name: "ブログ", icon: "✍️", maxChars: null, description: "ブログ記事", enabled: false,
    facts: [
      "文字数制限なし",
      "Markdown / HTML 対応",
      "画像: 1200×800px以上推奨 / 1MB以下に最適化",
    ],
    knowhow: [
      { category: "writing", text: "SEO三要素: タイトル・メタディスクリプション・見出し構造 (h1→h2→h3)" },
      { category: "writing", text: "内部リンク・外部リンクを活用してサイト回遊を促す" },
      { category: "image", text: "アイキャッチ画像で記事の印象が決まる。OGP にも反映される" },
      { category: "algorithm", text: "検索意図に合致した構成が上位表示の鍵。結論を先に書く" },
    ],
    editor: { markdown: true, features: ["見出し", "太字", "引用", "リスト", "コード", "画像", "テーブル"] },
    media: { thumbnail: true, maxImages: 50, required: false, inlineImages: true, description: "アイキャッチ + 本文内画像" },
  },
];

export type PlatformId = (typeof PLATFORMS)[number]["id"];

export function getPlatform(id: string): PlatformConfig {
  if (id === SOURCE_PLATFORM_ID) return SOURCE_PLATFORM;
  const base = PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0]!;
  // X プランオーバーライドを適用
  if (base.id === "x" && base.plans) {
    const plan = getXPlan();
    const override = base.plans.find((p) => p.id === plan);
    if (override) {
      return {
        ...base,
        ...override.overrides,
        facts: override.overrides.facts ?? base.facts,
        media: override.overrides.media ? { ...base.media, ...override.overrides.media } : base.media,
      };
    }
  }
  return base;
}

/** プランオーバーライドを適用しない素の定義を返す */
export function getRawPlatform(id: string): PlatformConfig {
  if (id === SOURCE_PLATFORM_ID) return SOURCE_PLATFORM;
  return PLATFORMS.find((p) => p.id === id) ?? PLATFORMS[0]!;
}

/** トーンプリセット。spec: AKARI-HUB-009 §8 */
export const TONE_PRESETS = [
  { id: "casual", label: "カジュアル", emoji: "😊" },
  { id: "formal", label: "フォーマル", emoji: "👔" },
  { id: "provocative", label: "煽り", emoji: "🔥" },
  { id: "informative", label: "情報", emoji: "📚" },
  { id: "emotional", label: "共感", emoji: "💭" },
  { id: "humorous", label: "ユーモア", emoji: "😂" },
] as const;

export type ToneId = (typeof TONE_PRESETS)[number]["id"];

/** 文章の長さプリセット */
export const LENGTH_PRESETS = [
  { id: "short", label: "短め" },
  { id: "standard", label: "標準" },
  { id: "long", label: "長め" },
] as const;

export type LengthId = (typeof LENGTH_PRESETS)[number]["id"];

/** AI ライティング設定 (Video の PlatformSettings 参考) */
export interface WritingOptions {
  tone: ToneId | null;
  length: LengthId;
  keywords: string;
  /** 冒頭1行のインパクト強化 */
  hookFirst: boolean;
  /** 句点を省略 */
  noPeriod: boolean;
  /** 短文志向 */
  shortSentences: boolean;
}

export const DEFAULT_WRITING_OPTIONS: WritingOptions = {
  tone: null,
  length: "standard",
  keywords: "",
  hookFirst: true,
  noPeriod: true,
  shortSentences: true,
};

/** WritingOptions から AI 向けプロンプトを組み立てる */
export function buildWritingPrompt(
  platformName: string,
  maxChars: number | null,
  opts: WritingOptions,
  existingDraft?: string,
): string {
  const parts: string[] = [];

  if (existingDraft && existingDraft.trim()) {
    parts.push(`以下の下書きを元に、${platformName} 向けの投稿を改善してください。`);
    parts.push(`\n[下書き]\n${existingDraft}\n`);
  } else {
    parts.push(`${platformName} 向けの投稿を作成してください。`);
  }

  parts.push(`\n[条件]`);
  if (maxChars) parts.push(`- ${maxChars} 文字以内`);

  const tone = TONE_PRESETS.find((t) => t.id === opts.tone);
  if (tone) parts.push(`- トーン: ${tone.label}`);

  if (opts.length === "short") parts.push("- できるだけ短く簡潔に");
  if (opts.length === "long") parts.push("- 詳しく丁寧に");

  if (opts.keywords.trim()) {
    parts.push(`- 以下のキーワードを含める: ${opts.keywords.trim()}`);
  }
  if (opts.hookFirst) parts.push("- 冒頭1行はインパクトのあるフックにする");
  if (opts.noPeriod) parts.push("- 文末の句点（。）は省略する");
  if (opts.shortSentences) parts.push("- 一文を短く、テンポよく");

  parts.push("\n投稿文面だけを返してください（説明不要）。");

  return parts.join("\n");
}

