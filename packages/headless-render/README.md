# @akari-os/headless-render

AKARI Headless Renderer — canvas-based app (design / video) を画像に出力する SSR 機能。

## 概要

- **Fabric.js canvas** を Node.js 環境でレンダリング（`node-canvas` + Fabric.js SSR）
- **Design / Video Variant** → PNG / JPEG / WebP に変換
- **Pool export** / **Live preview** / **Batch render** に統一 API を提供

## インストール

```bash
pnpm add @akari-os/headless-render
```

## 使い方

### Basic API

```typescript
import { renderVariant } from "@akari-os/headless-render";

const result = await renderVariant({
  app: "design",  // | "video"
  workState: {...},  // serialized Work state (Design / Video)
  options: {
    format: "png",  // "png" | "jpeg" | "webp"
    quality: 85,    // JPEG/WebP quality (0-100)
    width: 1920,
    height: 1080,
  }
});

// result: { width: number, height: number, blob: Blob }
```

### Design export

```typescript
import { renderDesignVariant } from "@akari-os/headless-render/design";

const { blob, width, height } = await renderDesignVariant(designWorkState, {
  format: "png",
  scale: 2,  // 2x DPI
});
```

### Video timeline

```typescript
import { renderVideoFrame } from "@akari-os/headless-render/video";

const frameBlob = await renderVideoFrame(videoWorkState, {
  frameIndex: 30,
  format: "png",
});
```

## License

MIT
