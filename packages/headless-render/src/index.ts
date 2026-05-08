import type {
  RenderResult,
  RenderVariantInput,
} from "./types";

export type {
  RenderResult,
  RenderVariantInput,
  RenderVariantParams,
  DesignRenderFormat,
  DesignRenderOptions,
  DesignRenderInput,
  VideoRenderFormat,
  VideoRenderOptions,
  VideoEncoderProfile,
  VideoAspectRatio,
  VideoRenderInput,
  RenderDesignVariantParams,
  RenderVideoFrameParams,
} from "./types";

export { renderDesignVariant } from "./design/index";
export { renderVideoFrame } from "./video/index";

/**
 * Main unified render API with discriminated union types
 *
 * Usage:
 *   // Design
 *   const result = await renderVariant({
 *     app: 'design',
 *     workState: designState,
 *     options: { format: 'png', scale: 2 }
 *   });
 *
 *   // Video
 *   const result = await renderVariant({
 *     app: 'video',
 *     workState: videoState,
 *     options: { format: 'png', frameAt: 1000 }
 *   });
 */
export async function renderVariant(
  input: RenderVariantInput,
): Promise<RenderResult> {
  if (input.app === "design") {
    const { renderDesignVariant } = await import("./design/index");
    return renderDesignVariant(input.workState, input.options);
  } else if (input.app === "video") {
    const { renderVideoFrame } = await import("./video/index");
    return renderVideoFrame(input.workState, input.options);
  }

  const exhaustive: never = input;
  throw new Error(`Unsupported app: ${exhaustive}`);
}
