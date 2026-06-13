# Web Scrape — AKARI MCP-Declarative App (HUB-104 reference)

Playwright browser-automation research connector. Sibling of the **web-search**
example: web-search is the API ingestion connector (AKARI-SDK-004); this is the
browser-only connector (AKARI-HUB-104).

> **Spec**: `akari-os/docs/sdd/specs/spec-web-research-scraping-connector.md` (AKARI-HUB-104)
> **Status**: Phase 0 reference implementation (Google search / images / page / Pool save)

## Channel policy (HUB-104 §5-1)

| Platform | Channel | Where |
|---|---|---|
| X (Twitter) | Official API | **web-search / AKARI-SDK-004** — not scraped here |
| Instagram | Scraping (dedicated account + isolation) | Phase 1b — **not in this build** |
| Google / Web / Images / Maps | Scraping | **here** |

## Tools (Phase 0)

| Tool | Purpose |
|---|---|
| `scrape.search` | Google results (title/url/snippet) + optional deep-read of top N |
| `scrape.images` | Collect image refs (src + alt) from a page or image query — all `reference_only` |
| `scrape.page` | Fetch one URL → title + readable body text |
| `scrape.save_to_pool` | Persist results/media to Pool with a `usage_right` flag (HITL) |

## What's real vs stubbed

**Real** (the architectural heart — HUB-104 §6-2 / §7 / §8-5 ゾーン A):
- Interval engine — `exponential` / `lognormal` / `uniform` / `fixed` + jitter + clamp (`core/interval.ts`)
- robots.txt fetch + Crawl-delay (upper rule) + Disallow (`core/robots.ts`)
- PolitenessGovernor — per-domain & global concurrency, cooldown pacing, circuit breaker (`core/governor.ts`)
- BlockDetector — 3-signal anti-bot detection; **no CAPTCHA solving** (`core/block-detector.ts`, §7-1 / §8-5 ゾーン C)
- Minimal stealth init script (`core/browser.ts`, §8-5 ゾーン B)

**Stubbed** (mirrors the web-search example; wire up `@akari-os/sdk` later):
- `poolPut` / `poolPutMedia` / `ampRecord` — log intent, return synthetic IDs
- Media byte download (`storage_mode: copy`) is not yet performed

## Distribution caveat (important)

Unlike web-search, **Playwright cannot be bundled** into a single ESM artifact
(it spawns native browser binaries). `playwright` stays external; this app runs
from its own `node_modules`. One-time browser install:

```bash
pnpm install
npx playwright install chromium
pnpm build      # emits dist/mcp-server/index.js
```

## Config

All `SCRAPE_*` env vars map to HUB-104 §6-2 `[scrape_config]` (see `.env.example`).
Defaults match the spec (3s exponential interval, 10s domain cooldown,
robots.txt honoured, 1 concurrent/domain, circuit breaker at 30%).

## Stealth engine note

HUB-104 §8-5 names **Patchright** as the intended production stealth engine.
This first cut ships vanilla Playwright + a minimal init script;
`SCRAPE_STEALTH_ENGINE=patchright` currently resolves to that path with a TODO
to swap in the Patchright runtime. Per the "minimal stealth" principle, we do
not over-inject for internal low-frequency use.

## Not in this build (see spec §9)

- Google Maps (`gmaps-v1`, Phase 1 T-5)
- Video collection (`video-scrape-v1`, Phase 1 T-6)
- custom-scrape recipe mode (`custom-scrape-v1`, Phase 1 T-7, §8-6)
- Instagram (`ig-scrape-v1`, Phase 1b — needs dedicated account + 3–6mo warming, §5-1-a)
- Real Pool/AMP wiring via `@akari-os/sdk`
