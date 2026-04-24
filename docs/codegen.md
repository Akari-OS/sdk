# Types codegen — AMP / M2C JSON Schema → TypeScript

上流 spec リポ（`akari-amp` / `akari-m2c`）が配布する `.schema.json` から TypeScript 型を自動生成し、`@akari-os/sdk/generated` で公開する仕組み。手書き TypeScript と spec のドリフトを抑えるのが目的。

## フロー

```
akari-amp/spec/v0.1/*.schema.json  ─┐
akari-m2c/spec/v0.2/*.schema.json  ─┤
                                    │
                       pnpm sync-schemas   (scripts/sync-schemas.mjs)
                                    ▼
                     akari-sdk/schemas/<proto>/<ver>/*.schema.json   (vendored copy)
                                    │
                       pnpm codegen       (scripts/codegen.mjs, quicktype-core)
                                    ▼
           packages/sdk-types/src/generated/<proto>-<ver>.ts   (commit, reviewable)
                                    │
                                    ▼
                      export * from "@akari-os/sdk/generated"
```

## 使い方

```bash
# 上流 spec リポの変更を取り込む（sibling 配置を前提）
pnpm sync-schemas

# 取り込んだ schema から .ts を生成（既存 generated/ は毎回削除して再生成）
pnpm codegen

# 差分をレビューし、問題なければコミット
git add schemas/ packages/sdk-types/src/generated/
git commit -m "[CI] sync AMP/M2C schemas & regenerate types"
```

## 生成される型

| 出力ファイル | 含まれる型（主要） |
|---|---|
| `packages/sdk-types/src/generated/amp-v0-1.ts` | `AMPMemoryRecord` / `AMPErrorResponse` / `AMPMCPToolInputSchemas` + 配下の `AmpEncode` / `AmpRetrieve` 等 |
| `packages/sdk-types/src/generated/m2c-v0-2.ts` | `M2CMediaContext` / `M2CProviderCapabilities` / `M2CConsumerRequest` |
| `packages/sdk-types/src/generated/index.ts` | 上記を re-export |

`@akari-os/sdk` の barrel (`packages/sdk-types/src/index.ts`) からも `export * from "./generated/index.js"` で自動再公開されているので、消費側は次のように使える:

```typescript
import type { AMPMemoryRecord, M2CMediaContext } from "@akari-os/sdk"
// または
import type { AMPMemoryRecord } from "@akari-os/sdk/generated"
```

## ルール

- **`packages/sdk-types/src/generated/` は手で編集しない**。 先頭に AUTO-GENERATED ヘッダを付けている。編集したくなったら上流 `.schema.json` を直す
- **`schemas/` 配下も手で編集しない**。`pnpm sync-schemas` で再取得する。上流を直接更新したい場合は `akari-amp` / `akari-m2c` 側に PR
- **同期タイミング**: 上流の `.schema.json` が変わった PR がマージされたら、本リポで `pnpm sync-schemas && pnpm codegen` → commit
- **upstream-commit 表の更新**: `schemas/README.md` の「各 schema の上流コミット」表を同期時に手で更新する（自動化は codegen Phase 3 で検討）

## 既知の制限

- **`mcp-tools.schema.json` の $ref**: `provenanceInput` / `accessPolicy` / `relationInput` は現状 `additionalProperties: true` の緩い object として $defs に居るだけで、MemoryRecord 本体スキーマとは `$ref` 接続されていない。Phase 3 で修正予定
- **上流 PATCH 版への追従は手動**: version ディレクトリ粒度（`v0.1` / `v0.2`）でしか分けていないので、patch 差分は都度 re-sync が必要
- **codegen 差分の CI 検証は未整備**: `pnpm codegen` の再実行で生成物が変わらないことを CI で検証する仕組みはまだない。Phase 3 候補
