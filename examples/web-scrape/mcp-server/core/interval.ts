/**
 * Interval engine (HUB-104 §6-2 / §8-5 ゾーン A)
 *
 * Produces human-like, jittered wait times between requests. Fixed intervals
 * are a time-series fingerprint and are detectable, so the default is an
 * exponential distribution (ScrapeConfig.interval_mode).
 *
 * Effective interval also honours robots.txt Crawl-delay and a per-domain
 * cooldown via `effectiveIntervalMs()`.
 */

import type { ScrapeConfig } from "../types.js";

type Rng = () => number;

/** Standard-normal sample via Box–Muller. */
function gaussian(rng: Rng): number {
  const u = 1 - rng(); // (0,1]
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Sample a single inter-request delay (ms) per the configured distribution. */
export function sampleDelayMs(cfg: ScrapeConfig, rng: Rng = Math.random): number {
  const base = Math.max(1, cfg.interval_base_ms);
  let t: number;
  switch (cfg.interval_mode) {
    case "fixed":
      t = base;
      break;
    case "uniform":
      t = base + rng() * Math.max(0, cfg.interval_jitter_ms);
      break;
    case "lognormal": {
      const mu = Math.log(base);
      const sigma = 0.5;
      t = Math.exp(mu + sigma * gaussian(rng));
      break;
    }
    case "exponential":
    default: {
      // Mean of the exponential equals `base`. Inverse-CDF sampling.
      t = -Math.log(1 - rng()) * base;
      break;
    }
  }
  return Math.round(clamp(t, cfg.interval_min_ms, cfg.interval_max_ms));
}

/**
 * Effective wait before hitting a domain again:
 *   max( sampled delay, robots Crawl-delay, per-domain cooldown ).
 * robots.txt is the upper rule — we never go faster than the site asked.
 */
export function effectiveIntervalMs(
  cfg: ScrapeConfig,
  robotsCrawlDelayMs: number | undefined,
  rng: Rng = Math.random,
): number {
  return Math.max(
    sampleDelayMs(cfg, rng),
    robotsCrawlDelayMs ?? 0,
    cfg.domain_cooldown_ms,
  );
}

/**
 * Full-jitter exponential backoff for 429/503 (HUB-104 §6-2).
 * `wait = uniform(0, min(cap, base * 2^attempt))`, then floored by Retry-After.
 */
export function backoffMs(
  attempt: number,
  cfg: ScrapeConfig,
  retryAfterMs?: number,
  rng: Rng = Math.random,
): number {
  const capMs = cfg.backoff_cap_sec * 1000;
  const baseMs = cfg.backoff_base_sec * 1000;
  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
  const jittered = rng() * ceiling;
  return Math.round(Math.max(jittered, retryAfterMs ?? 0));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
