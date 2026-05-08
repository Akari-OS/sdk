import type { DesignRenderOptions, RenderResult } from "../types";

/**
 * Render design variant to image
 *
 * Phase A (Browser): Fabric.js canvas.toDataURL() via akari-design
 * Phase B (Node.js): node-canvas SSR backend
 *
 * @param workState Design work state (serialized)
 * @param options Render options (format, scale, background, etc.)
 * @returns { width, height, blob, mimeType }
 */
export async function renderDesignVariant(
  workState: Record<string, unknown>,
  options?: DesignRenderOptions,
): Promise<RenderResult> {
  // Phase B Implementation:
  // - akari-design の Fabric canvas state を deserialize
  // - fabric.Canvas をメモリに構築（node-canvas backend）
  // - PNG/JPEG/WebP/SVG/PDF に serialize
  //
  // Boundary check: node-canvas 無しの環境では throw

  const format = options?.format ?? "png";
  const mimeType = {
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    pdf: "application/pdf",
  }[format] ?? "image/png";

  throw new Error(
    "renderDesignVariant: Phase B implementation pending. awaiting Fabric.js node-canvas SSR setup.",
  );
}
