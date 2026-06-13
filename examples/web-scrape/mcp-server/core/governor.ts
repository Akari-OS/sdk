/**
 * PolitenessGovernor (HUB-104 §6-2 / §7 / §8-5 ゾーン A)
 *
 * Single coordination point for "polite" access:
 *   - per-domain + global concurrency limits (default 1/domain, 5 global)
 *   - per-domain cooldown + interval pacing (honours robots Crawl-delay)
 *   - per-domain circuit breaker (open at >30% failure, half-open after N sec)
 *
 * Connectors wrap each navigation in `governor.run(domain, fn)`. The governor
 * blocks until a slot is free and the cooldown has elapsed, runs `fn`, records
 * success/failure for the breaker, and releases the slot.
 *
 * This is the connector-side of the ADR-117 split: pacing/limits live here;
 * retry/backoff scheduling is the Workflow Engine's job.
 */

import type { ScrapeConfig } from "../types.js";
import { effectiveIntervalMs, sleep } from "./interval.js";

class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];
  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
  }

  release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}

interface DomainState {
  sem: Semaphore;
  lastAccess: number; // epoch ms
  recent: boolean[]; // sliding window of ok/fail
  circuitOpenedAt: number | null;
}

export class CircuitOpenError extends Error {
  constructor(domain: string) {
    super(`circuit breaker open for ${domain}`);
    this.name = "CircuitOpenError";
  }
}

const WINDOW = 20;

export class PolitenessGovernor {
  private readonly globalSem: Semaphore;
  private readonly domains = new Map<string, DomainState>();

  constructor(
    private readonly cfg: ScrapeConfig,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.globalSem = new Semaphore(Math.max(1, cfg.global_max_concurrency));
  }

  private state(domain: string): DomainState {
    let s = this.domains.get(domain);
    if (!s) {
      s = {
        sem: new Semaphore(Math.max(1, this.cfg.max_concurrency_per_domain)),
        lastAccess: 0,
        recent: [],
        circuitOpenedAt: null,
      };
      this.domains.set(domain, s);
    }
    return s;
  }

  isCircuitOpen(domain: string): boolean {
    const s = this.domains.get(domain);
    if (!s || s.circuitOpenedAt == null) return false;
    const elapsed = this.now() - s.circuitOpenedAt;
    if (elapsed >= this.cfg.circuit_breaker_open_sec * 1000) {
      // half-open: allow a probe, reset window
      s.circuitOpenedAt = null;
      s.recent = [];
      return false;
    }
    return true;
  }

  private recordResult(domain: string, ok: boolean): void {
    const s = this.state(domain);
    s.recent.push(ok);
    if (s.recent.length > WINDOW) s.recent.shift();
    if (s.recent.length >= Math.min(WINDOW, 5)) {
      const failRate = s.recent.filter((r) => !r).length / s.recent.length;
      if (failRate > this.cfg.circuit_breaker_threshold) {
        s.circuitOpenedAt = this.now();
      }
    }
  }

  /**
   * Run `fn` under the governor for `domain`. Honours concurrency, cooldown and
   * the circuit breaker. `robotsCrawlDelayMs` (if known) raises the pacing floor.
   */
  async run<T>(
    domain: string,
    fn: () => Promise<T>,
    robotsCrawlDelayMs?: number,
  ): Promise<T> {
    if (this.isCircuitOpen(domain)) throw new CircuitOpenError(domain);

    const s = this.state(domain);
    await this.globalSem.acquire();
    await s.sem.acquire();
    try {
      // Pace: wait until cooldown/interval since last access has elapsed.
      const wait =
        s.lastAccess === 0
          ? 0
          : Math.max(
              0,
              effectiveIntervalMs(this.cfg, robotsCrawlDelayMs) -
                (this.now() - s.lastAccess),
            );
      if (wait > 0) await sleep(wait);

      let ok = false;
      try {
        const result = await fn();
        ok = true;
        return result;
      } finally {
        s.lastAccess = this.now();
        this.recordResult(domain, ok);
      }
    } finally {
      s.sem.release();
      this.globalSem.release();
    }
  }
}

/** Extract a domain key from a URL (host without port). */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
