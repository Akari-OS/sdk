/**
 * Web Scrape — shared types
 *
 * Implements the Pool-storage shape and runtime config defined in
 * AKARI-HUB-104 (Web Research & Scraping Connector) §6-2 / §6-3.
 *
 * Channel policy (HUB-104 §5-1): this connector handles browser-only sources
 * (Google search / web / images / Google Maps / Instagram). X is API-only
 * (HUB-099) and is NOT scraped here.
 */

// ---------------------------------------------------------------------------
// Pool-storage shapes (HUB-104 §6-3 — extends HUB-099 IngestedItem)
// ---------------------------------------------------------------------------

/** Rights flag — every collected item carries one. Default reference_only (AC-4). */
export type UsageRight = "reference_only" | "own" | "licensed" | "public_domain";

export type ScrapeKind = "scrape_result" | "place_info" | "media_asset";

/** A single textual scrape result (search hit / article / post). */
export interface ScrapeResultItem {
  title?: string;
  url: string;
  snippet?: string;
  /** Full body text when a deep read populated it. */
  body_text?: string;
  author?: string;
  /** alt / caption / surrounding text for media context. */
  caption?: string;
  tags?: string[];
}

/** A single media asset (image / video). Bytes are persisted to Pool on save. */
export interface MediaAsset {
  type: "image" | "video";
  /** Source URL of the media file. */
  src: string;
  /** Page the media was found on. */
  page_url: string;
  width?: number;
  height?: number;
  alt?: string;
  caption?: string;
}

/** Unified scrape response (one connector run). */
export interface ScrapeResponse {
  kind: ScrapeKind;
  source_connector: string; // "google-search-v1" | "image-scrape-v1" | "page-v1"
  query?: string;
  source_url?: string;
  fetched_at: string; // ISO 8601
  usage_right: UsageRight;
  results?: ScrapeResultItem[];
  media?: MediaAsset[];
  /** Set when BlockDetector tripped mid-run. */
  blocked?: { reason: string };
}

// ---------------------------------------------------------------------------
// Runtime config (HUB-104 §6-2 [scrape_config])
// ---------------------------------------------------------------------------

export type IntervalMode = "exponential" | "lognormal" | "uniform" | "fixed";
export type StealthEngine = "patchright" | "vanilla";

export interface ScrapeConfig {
  respect_robots_txt: boolean;
  max_pages_per_run: number;

  interval_mode: IntervalMode;
  interval_base_ms: number;
  interval_jitter_ms: number;
  interval_min_ms: number;
  interval_max_ms: number;
  domain_cooldown_ms: number;

  max_concurrency_per_domain: number;
  global_max_concurrency: number;
  backoff_base_sec: number;
  backoff_cap_sec: number;
  backoff_max_retries: number;

  circuit_breaker_threshold: number;
  circuit_breaker_open_sec: number;
  session_action_limit: number;

  stealth_engine: StealthEngine;
  /** Transparent-ish UA. Real-browser UA is set by Playwright; this overrides if non-empty. */
  user_agent: string;

  /** Headful mode (needed for high-detection sites). */
  headless: boolean;
}

/** Defaults mirror HUB-104 §6-2. Env vars override (see config.ts). */
export const DEFAULT_CONFIG: ScrapeConfig = {
  respect_robots_txt: true,
  max_pages_per_run: 50,

  interval_mode: "exponential",
  interval_base_ms: 3000,
  interval_jitter_ms: 1500,
  interval_min_ms: 1000,
  interval_max_ms: 30000,
  domain_cooldown_ms: 10000,

  max_concurrency_per_domain: 1,
  global_max_concurrency: 5,
  backoff_base_sec: 2,
  backoff_cap_sec: 120,
  backoff_max_retries: 5,

  circuit_breaker_threshold: 0.3,
  circuit_breaker_open_sec: 300,
  session_action_limit: 50,

  stealth_engine: "patchright",
  user_agent: "",
  headless: true,
};

// ---------------------------------------------------------------------------
// MCP tool output shapes
// ---------------------------------------------------------------------------

export interface SaveToPoolResult {
  pool_ids: string[];
  saved_at: string;
  count: number;
}
