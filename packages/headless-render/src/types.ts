/** Render result */
export interface RenderResult {
  /** Output width in pixels */
  width: number;
  /** Output height in pixels */
  height: number;
  /** Rendered blob */
  blob: Blob;
  /** MIME type of blob */
  mimeType: string;
}

// ============== Design render types ==============

export type DesignRenderFormat = "png" | "jpeg" | "webp" | "svg" | "pdf";

export interface DesignRenderOptions {
  format?: DesignRenderFormat;
  quality?: number;
  width?: number;
  height?: number;
  scale?: number;
  background?: "transparent" | string;
  timeout?: number;
}

export interface DesignRenderInput {
  app: "design";
  workState: Record<string, unknown>;
  options?: DesignRenderOptions;
}

// ============== Video render types ==============

export type VideoRenderFormat = "png" | "mp4" | "frame-strip";
export type VideoEncoderProfile = "fast" | "quality";
export type VideoAspectRatio = "original" | "youtube" | "tiktok" | "ig_post" | "ig_square";

export interface VideoRenderOptions {
  format?: VideoRenderFormat;
  frameAt?: number; // ms (PNG frame thumb)
  range?: { start: number; end: number }; // ms (mp4 部分書き出し)
  bitrate?: { video: number; audio: number }; // kbps
  encoderProfile?: VideoEncoderProfile;
  aspect?: VideoAspectRatio;
  timeout?: number;
}

export interface VideoRenderInput {
  app: "video";
  workState: Record<string, unknown>;
  options?: VideoRenderOptions;
}

// ============== Unified discriminated union ==============

export type RenderVariantInput = DesignRenderInput | VideoRenderInput;

export type RenderVariantParams = RenderVariantInput; // Alias for backward compat

// ============== Legacy types (for backward compat) ==============

export interface RenderDesignVariantParams {
  workState: Record<string, unknown>;
  options?: DesignRenderOptions;
}

export interface RenderVideoFrameParams {
  workState: Record<string, unknown>;
  frameIndex?: number;
  options?: VideoRenderOptions;
}
