/**
 * Web Scrape — runtime config resolution
 *
 * Resolves a ScrapeConfig from env vars over the HUB-104 §6-2 defaults.
 * The Shell injects these via akari.toml [mcp.env]; for local dev they come
 * from a .env file (see .env.example).
 */

import { DEFAULT_CONFIG } from "./types.js";
import type { ScrapeConfig, IntervalMode, StealthEngine } from "./types.js";

function numEnv(key: string, fallback: number): number {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function boolEnv(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  return v === "1" || v.toLowerCase() === "true";
}

function enumEnv<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const v = process.env[key];
  if (v && (allowed as readonly string[]).includes(v)) return v as T;
  return fallback;
}

const INTERVAL_MODES: readonly IntervalMode[] = [
  "exponential",
  "lognormal",
  "uniform",
  "fixed",
];
const STEALTH_ENGINES: readonly StealthEngine[] = ["patchright", "vanilla"];

export function resolveConfig(): ScrapeConfig {
  const d = DEFAULT_CONFIG;
  return {
    respect_robots_txt: boolEnv("SCRAPE_RESPECT_ROBOTS_TXT", d.respect_robots_txt),
    max_pages_per_run: numEnv("SCRAPE_MAX_PAGES_PER_RUN", d.max_pages_per_run),

    interval_mode: enumEnv("SCRAPE_INTERVAL_MODE", INTERVAL_MODES, d.interval_mode),
    interval_base_ms: numEnv("SCRAPE_INTERVAL_BASE_MS", d.interval_base_ms),
    interval_jitter_ms: numEnv("SCRAPE_INTERVAL_JITTER_MS", d.interval_jitter_ms),
    interval_min_ms: numEnv("SCRAPE_INTERVAL_MIN_MS", d.interval_min_ms),
    interval_max_ms: numEnv("SCRAPE_INTERVAL_MAX_MS", d.interval_max_ms),
    domain_cooldown_ms: numEnv("SCRAPE_DOMAIN_COOLDOWN_MS", d.domain_cooldown_ms),

    max_concurrency_per_domain: numEnv(
      "SCRAPE_MAX_CONCURRENCY_PER_DOMAIN",
      d.max_concurrency_per_domain,
    ),
    global_max_concurrency: numEnv("SCRAPE_GLOBAL_MAX_CONCURRENCY", d.global_max_concurrency),
    backoff_base_sec: numEnv("SCRAPE_BACKOFF_BASE_SEC", d.backoff_base_sec),
    backoff_cap_sec: numEnv("SCRAPE_BACKOFF_CAP_SEC", d.backoff_cap_sec),
    backoff_max_retries: numEnv("SCRAPE_BACKOFF_MAX_RETRIES", d.backoff_max_retries),

    circuit_breaker_threshold: numEnv(
      "SCRAPE_CIRCUIT_BREAKER_THRESHOLD",
      d.circuit_breaker_threshold,
    ),
    circuit_breaker_open_sec: numEnv("SCRAPE_CIRCUIT_BREAKER_OPEN_SEC", d.circuit_breaker_open_sec),
    session_action_limit: numEnv("SCRAPE_SESSION_ACTION_LIMIT", d.session_action_limit),

    stealth_engine: enumEnv("SCRAPE_STEALTH_ENGINE", STEALTH_ENGINES, d.stealth_engine),
    user_agent: process.env.SCRAPE_USER_AGENT ?? d.user_agent,
    headless: boolEnv("SCRAPE_HEADLESS", d.headless),
  };
}
