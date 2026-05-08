import type { VideoRenderOptions, RenderResult } from "../types";

/**
 * Render video frame or encode video
 *
 * Phase A: PNG frame thumbnail + frame-strip
 * Phase B: mp4 encode (browser-only, WebCodecs required)
 *
 * @param workState Video work state (serialized)
 * @param options Render options (format, frameAt, range, bitrate, etc.)
 * @returns { width, height, blob, mimeType }
 *
 * Note: mp4 encoding requires browser environment (WebCodecs API).
 *       Node.js environment will throw early.
 */
export async function renderVideoFrame(
  workState: Record<string, unknown>,
  options?: VideoRenderOptions,
): Promise<RenderResult> {
  const format = options?.format ?? "png";

  // ============== WebCodecs boundary check ==============
  // mp4 encode is browser-only (requires WebCodecs API)
  if (format === "mp4" && !isBrowserEnv()) {
    throw new Error(
      "renderVideoFrame: mp4 encoding requires browser environment (WebCodecs API). " +
        "Use format: 'png' or 'frame-strip' for headless rendering.",
    );
  }

  // ============== Headless-friendly formats ==============
  // PNG / frame-strip: supported in Node.js (Canvas2D rendering)
  if (format === "png" || format === "frame-strip") {
    // Phase B Implementation:
    // - akari-video Timeline state を deserialize
    // - frame index (frameAt ms) に対応する canvas snapshot を生成
    // - Design + Timeline overlay composition を合成
    // - PNG に serialize
  }

  const mimeType = {
    png: "image/png",
    "frame-strip": "image/png",
    mp4: "video/mp4",
  }[format] ?? "image/png";

  throw new Error(
    "renderVideoFrame: Phase B implementation pending. awaiting akari-video Timeline renderer integration.",
  );
}

function isBrowserEnv(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
