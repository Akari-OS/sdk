export type {
  RenderFormat,
  AppType,
  RenderResult,
  RenderOptions,
  RenderVariantParams,
  RenderDesignVariantParams,
  RenderVideoFrameParams,
} from "./types";

/** Main unified render API */
export async function renderVariant({
  app,
  workState,
  options = {},
}: {
  app: "design" | "video";
  workState: Record<string, unknown>;
  options?: Record<string, unknown>;
}): Promise<{ width: number; height: number; blob: Blob }> {
  if (app === "design") {
    const { renderDesignVariant } = await import("./design/index");
    return renderDesignVariant(workState, options);
  } else if (app === "video") {
    const { renderVideoFrame } = await import("./video/index");
    return renderVideoFrame(workState, 0, options);
  }

  throw new Error(`Unsupported app: ${app}`);
}
