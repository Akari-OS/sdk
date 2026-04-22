/**
 * OGP (Open Graph Protocol) メタタグ取得ユーティリティ
 *
 * Tauri の invoke で Rust 側の fetch_ogp コマンドを呼ぶ。
 * CORS なしで任意の URL の OGP 情報を取得できる。
 */

export interface OgpData {
  title: string;
  description: string;
  image: string;
  site_name: string;
  url: string;
}

/** キャッシュ（5分 TTL） */
const cache = new Map<string, { data: OgpData | null; at: number }>();
const CACHE_TTL = 5 * 60 * 1000;

/** テキストから URL を抽出 */
export function extractUrls(text: string): string[] {
  const regex = /https?:\/\/[^\s\u3000)）\]」』】>]+/g;
  const matches = text.match(regex);
  if (!matches) return [];
  // 画像・動画 URL を除外
  const mediaExts = /\.(jpg|jpeg|png|gif|webp|svg|mp4|mov|webm|avi)$/i;
  return [...new Set(matches)].filter((url) => !mediaExts.test(url));
}

/** OGP 情報を取得（Tauri invoke + キャッシュ） */
export async function fetchOgp(url: string): Promise<OgpData | null> {
  // キャッシュ確認
  const cached = cache.get(url);
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return cached.data;
  }

  try {
    // Tauri の invoke を動的インポート（ブラウザ環境でもエラーにならない）
    const { invoke } = await import("@tauri-apps/api/core");
    const data = await invoke<OgpData>("fetch_ogp", { url });
    cache.set(url, { data, at: Date.now() });
    return data;
  } catch {
    cache.set(url, { data: null, at: Date.now() });
    return null;
  }
}
