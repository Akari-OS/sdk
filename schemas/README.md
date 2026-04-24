# schemas/ — Upstream Protocol Schemas (vendored)

本ディレクトリは AKARI プロトコル spec の JSON Schema を **vendored copy**（取り込みコピー）として保持する。`scripts/codegen.mjs` がここを入力として `packages/sdk-types/src/generated/` に TypeScript 型を生成する。

## 構造

```
schemas/
├── amp/v0.1/
│   ├── schema.json              ← MemoryRecord
│   ├── error.schema.json        ← Error Response
│   └── mcp-tools.schema.json    ← 7 MCP tool inputs
└── m2c/v0.2/
    ├── schema.json              ← MediaContext
    ├── capabilities.schema.json ← Provider Capabilities
    └── request.schema.json      ← Consumer Request
```

## 同期方針

- **SSOT は上流リポ**: `akari-amp/spec/v0.1/*.json` と `akari-m2c/spec/v0.2/*.json`
- 本ディレクトリは取り込みコピー。**手で編集しない**。上流が変わったら `scripts/sync-schemas.mjs` で再同期する
- 同期タイミング: 上流の spec 本文（`.md`）や `.schema.json` が変わった PR をマージしたタイミング。`akari-sdk` 側で別 PR を立てる
- 同期時は `version` / `protocolVersion` を見て、SemVer breaking に該当するなら sdk-types 側も major bump する

## 各 schema の上流コミット（初回同期時点）

| schema | 上流 | 同期日 | 上流コミット |
|---|---|---|---|
| amp/v0.1/schema.json | `Akari-OS/amp` `spec/v0.1/schema.json` | 2026-04-24 | b7bf2bd |
| amp/v0.1/error.schema.json | 〃 | 2026-04-24 | b7bf2bd |
| amp/v0.1/mcp-tools.schema.json | 〃 | 2026-04-24 | b7bf2bd |
| m2c/v0.2/schema.json | `Akari-OS/m2c` `spec/v0.2/schema.json` | 2026-04-24 | 6ee2b27 |
| m2c/v0.2/capabilities.schema.json | 〃 | 2026-04-24 | 6ee2b27 |
| m2c/v0.2/request.schema.json | 〃 | 2026-04-24 | 6ee2b27 |

## codegen 出力

生成物は `packages/sdk-types/src/generated/` 配下に置かれる。生成物はコミットしてレビュー可能にする（re-run で差分ゼロになることを CI で検証する方針は Phase 3 で検討）。
