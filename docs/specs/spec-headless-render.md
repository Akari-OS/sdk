---
spec-id: AKARI-SDK-005
version: 0.1.1
status: implemented
created: 2026-05-08
updated: 2026-05-08
related-specs: ["AKARI-HUB-031", "AKARI-HUB-032", "AKARI-DESIGN-009", "AKARI-VIDEO-001", "AKARI-WRITER-006"]
related-adrs: [ADR-085]
ai-context: claude-code
---

# spec-headless-render — Unified Headless Renderer for Canvas Apps

##概要

AKARI の canvas-based app（design / video）を Node.js 環境でヘッドレスレンダリングする統一 API を提供する package。

- **目的**: Pool export / Live preview / Batch render に統一インターフェース
- **Phase A (MVP)**: API 骨組み + Type 定義（本 commit）
- **Phase B**: Design/Video renderer 実装（Design は Fabric.js SSR、Video は Timeline snapshot）

## Scope

### 対象

- `@akari-os/headless-render` package（akari-sdk/packages/headless-render）
- Design / Video app の export + preview 経路統一
- Pool → Output image の rendering pipeline

### 非対象（Phase B 以降）

- Live preview の UI 統合（akari-design / akari-video に依存）
- Batch export job scheduler（cloud domain）
- Caching / optimization（Phase C）

## 設計

### Public API

```typescript
// Main entry
export async function renderVariant({
  app: "design" | "video",
  workState: Record<string, unknown>,
  options?: RenderOptions
}): Promise<{ width: number; height: number; blob: Blob }>

// Sub-entry
export async function renderDesignVariant(
  workState: Record<string, unknown>,
  options?: RenderOptions
): Promise<RenderResult>

export async function renderVideoFrame(
  workState: Record<string, unknown>,
  frameIndex: number,
  options?: RenderOptions
): Promise<RenderResult>
```

### RenderOptions

```typescript
interface RenderOptions {
  format?: "png" | "jpeg" | "webp";  // default: png
  quality?: number;                   // 0-100 (JPEG/WebP)
  width?: number;                     // output width
  height?: number;                    // output height
  scale?: number;                     // DPI scale (default: 1)
  timeout?: number;                   // ms (default: 30000)
}
```

### Package Structure

```
packages/headless-render/
├── src/
│   ├── index.ts          — main API
│   ├── types.ts          — type definitions
│   ├── design/
│   │   └── index.ts      — Design-specific renderer
│   └── video/
│       └── index.ts      — Video-specific renderer
├── package.json          — MIT license, @akari-os/sdk dependency
├── tsconfig.json
└── README.md
```

### Dependencies

- **Required**: `@akari-os/sdk` (workspace)
- **Optional** (Phase B): `fabric`, `node-canvas`
- **Dev**: TypeScript 5.7+

## Compatibility

### Design export

- Existing `akari-design/src/lib/export-image.ts` → wrapper として headless-render を call
- `exportCanvasToImage()` behavior は変わらず（互換性保持）
- Internal で headless-render に委譲（コード重複排除）

### Video timeline

- akari-video 独自の timeline renderer を headless-render に統合
- Live preview → snapshot image via `renderVideoFrame()`

## 認定基準（Phase A）

- [ ] `@akari-os/headless-render` package 作成 + publish 可能
- [ ] TypeScript build + typecheck 通過
- [ ] `renderVariant()` / `renderDesignVariant()` / `renderVideoFrame()` stub 実装
- [ ] MIT license + repository フィールド
- [ ] Design/Video wrapper API 型定義完成
- [ ] doc/api-reference に entry 追加

## 認定基準（Phase B）

- [ ] Design Fabric.js SSR 実装（node-canvas backend）
- [ ] Video timeline frame renderer 実装
- [ ] akari-design export-image.ts 統合 (互換性保持)
- [ ] akari-video Timeline renderer 統合
- [ ] Integration test （design export button / video preview）

## References

- AKARI-HUB-031 §7 (Design export spec)
- akari-design export-image.ts (existing raster export)
- akari-sdk monorepo structure
