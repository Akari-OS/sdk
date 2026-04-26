# Notion App — AKARI Documents Category

> **このアプリの立ち位置**: Notion を AKARI のドキュメント管理基盤として組み込む。公式 MCP サーバー（`@notionhq/mcp`）を利用し、React コード・独自サーバーなしで実装する MCP-Declarative Tier App の参考実装（HUB-026）。

**扱う範囲**:
- Notion ワークスペースのページ・データベース検索・作成・更新
- Writer からの handoff（下書き → Notion ページ化）
- Research からの handoff（収集結果 → Notion database 流し込み）
- Notion database → Pool 取り込み

**扱わない範囲**:
- AKARI 全体のビジョン・アーキテクチャ・横断研究は Hub（akari-os）に集約
- MCP 仕様・Panel Schema 汎用ルールは akari-sdk/docs に集約

---

## Target Audience

- **AKARI ユーザー**: Notion で既存管理している素材・リサーチ結果を AKARI Writer / Pool から活用したい個人クリエイター
- **AKARI 開発者**: Documents カテゴリのパターン確立。他サービス（Google Workspace / Microsoft 365）への横展開の雛形として参照

---

## Tech Stack

- **MCP Server**: `@notionhq/mcp` (Notion 公式)
- **Tier**: MCP-Declarative（React・Node.js サーバーなし）
- **Auth**: OAuth 2.0 PKCE + Keychain 管理
- **Offline**: Pool キャッシュ + 書き込みキュー

---

## Key References

- **Spec**: `/docs/sdd/specs/spec-app-notion-reference.md` (AKARI-HUB-026)
- **Parent spec**: AKARI-HUB-005 (Declarative Capability Apps, Documents §7.1b)
- **Related**: AKARI-HUB-024 (App SDK, Tier 定義), AKARI-HUB-025 (Panel Schema v0)
- **Structure reference**: AKARI-HUB-007 (X Sender Phase 0)

---

## Development

```bash
# Start local dev (Shell + App together)
pnpm dev

# Type check
pnpm typecheck

# Certify (Automated lint + Contract test by SDK)
akari app certify
```

**Note**: Panel Schema JSON files (`panels/*.schema.json`) are generated separately by Agent 6 (spec T-3a/b/c).

---

## Roadmap

- **Phase 0** (Current): Manifest + Locales scaffold (T-1)
- **Phase 1**: MCP server wrapper + dry-run mode (T-2)
- **Phase 2**: Panel Schema rendering (T-3)
- **Phase 3**: OAuth flow + Certification (T-4/T-5)
- **Phase 4**: Writer / Research / Pool handoff integration (T-6/T-7)
