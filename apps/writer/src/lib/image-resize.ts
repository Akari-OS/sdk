/**
 * 画像リサイズユーティリティ。
 *
 * X API の画像上限 (5MB) に収まるよう、投稿前に canvas で縮小する。
 * base64 data URL → リサイズ → base64 data URL の流れ。
 */

/** リサイズ後の最大辺 (px) */
const MAX_DIMENSION = 2048;
/** 目標ファイルサイズ (bytes) — 4MB に収める (base64 膨張分を考慮して余裕を持たせる) */
const TARGET_SIZE = 4 * 1024 * 1024;
/** JPEG 品質の初期値 */
const INITIAL_QUALITY = 0.9;
/** JPEG 品質の最低値 */
const MIN_QUALITY = 0.5;
/** 品質の刻み */
const QUALITY_STEP = 0.1;

/**
 * data URL を受け取り、必要に応じてリサイズ + 品質調整して返す。
 *
 * 1. 画像の長辺が MAX_DIMENSION を超えていたら縮小
 * 2. JPEG に変換して TARGET_SIZE に収まるまで品質を下げる
 * 3. 元が小さければそのまま返す
 */
export async function resizeImage(dataUrl: string): Promise<{
  dataUrl: string;
  mimeType: string;
  originalSize: number;
  resizedSize: number;
}> {
  const img = await loadImage(dataUrl);
  const originalSize = estimateBase64Size(dataUrl);

  // リサイズ不要なら早期リターン (5MB 未満 & 2048px 以下)
  if (originalSize < TARGET_SIZE && img.width <= MAX_DIMENSION && img.height <= MAX_DIMENSION) {
    return {
      dataUrl,
      mimeType: guessMimeType(dataUrl),
      originalSize,
      resizedSize: originalSize,
    };
  }

  // canvas でリサイズ
  const { width, height } = fitDimensions(img.width, img.height, MAX_DIMENSION);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, width, height);

  // 品質を下げながら TARGET_SIZE に収める
  let quality = INITIAL_QUALITY;
  let result: string;
  do {
    result = canvas.toDataURL("image/jpeg", quality);
    quality -= QUALITY_STEP;
  } while (estimateBase64Size(result) > TARGET_SIZE && quality >= MIN_QUALITY);

  return {
    dataUrl: result,
    mimeType: "image/jpeg",
    originalSize,
    resizedSize: estimateBase64Size(result),
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fitDimensions(
  w: number,
  h: number,
  max: number,
): { width: number; height: number } {
  if (w <= max && h <= max) return { width: w, height: h };
  const ratio = Math.min(max / w, max / h);
  return {
    width: Math.round(w * ratio),
    height: Math.round(h * ratio),
  };
}

function estimateBase64Size(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? dataUrl;
  return Math.ceil(base64.length * 0.75);
}

function guessMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);/);
  return match?.[1] ?? "image/jpeg";
}
