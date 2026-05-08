import type { RenderDesignVariantParams, RenderResult } from "../types";

/**
 * Render design variant to image (headless)
 * Implementation: akari-design からの切り出し + Fabric.js node-canvas SSR
 * @param workState Design work state
 * @param options Render options
 * @returns Rendered image blob + dimensions
 */
export async function renderDesignVariant(
  workState: Record<string, unknown>,
  options?: Record<string, unknown>,
): Promise<RenderResult> {
  // Phase B Implementation:
  // - akari-design の Fabric canvas state を deserialize
  // - fabric.Canvas をメモリに構築（node-canvas backend）
  // - PNG/JPEG/WebP に serialize

  throw new Error(
    "renderDesignVariant: Phase B implementation pending. awaiting design export flow migration.",
  );
}
