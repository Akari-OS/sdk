/** Render output format */
export type RenderFormat = "png" | "jpeg" | "webp";

/** App type (canvas-based only) */
export type AppType = "design" | "video";

/** Render result */
export interface RenderResult {
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Rendered image blob */
  blob: Blob;
}

/** Common render options */
export interface RenderOptions {
  /** Output format */
  format?: RenderFormat;
  /** JPEG/WebP quality (0-100) */
  quality?: number;
  /** Output width */
  width?: number;
  /** Output height */
  height?: number;
  /** DPI scale factor */
  scale?: number;
  /** Timeout in milliseconds */
  timeout?: number;
}

/** Main render API params */
export interface RenderVariantParams {
  /** App type */
  app: AppType;
  /** Serialized work state (JSON) */
  workState: Record<string, unknown>;
  /** Render options */
  options?: RenderOptions;
}

/** Design-specific render params */
export interface RenderDesignVariantParams {
  /** Work state */
  workState: Record<string, unknown>;
  /** Options */
  options?: RenderOptions;
}

/** Video-specific frame render params */
export interface RenderVideoFrameParams {
  /** Work state */
  workState: Record<string, unknown>;
  /** Frame index (0-based) */
  frameIndex: number;
  /** Options */
  options?: RenderOptions;
}
