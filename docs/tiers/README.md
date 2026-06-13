---
title: Tiers — Full / MCP-Declarative 詳細ガイド
created: 2026-06-13
updated: 2026-06-13
---

# Tiers — Full / MCP-Declarative

AKARI App SDK には 2 つの実装 Tier がある。

| Tier | 一言 | 典型例 |
|---|---|---|
| **Full** | 自由度最大。React Panel + Agent + Skill を自前実装 | Writer / Video / Pool Picker |
| **MCP-Declarative** | 手軽に始まる。MCP サーバー + `panel.schema.json` だけで完結 | X Sender / Notion / web-search |

迷ったら **MCP-Declarative から始める**ことを推奨。Full への昇格は後からできるが、逆（Full → MCP-Declarative）は原則不可。

## ドキュメント

- [Full Tier ガイド](./full-tier.md) — React Panel / Agent / Skill / Tauri native の完全リファレンス
- [MCP-Declarative Tier ガイド](./mcp-declarative-tier.md) — MCP サーバー + Panel Schema だけで完結する最短実装

Tier 間の比較表・選び方フローチャートは [concepts/tier-comparison.md](../concepts/tier-comparison.md) を参照。
