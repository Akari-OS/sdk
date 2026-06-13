/**
 * Browser session management (HUB-104 §6-5 / §8-5 ゾーン B)
 *
 * Wraps Playwright launch with:
 *   - persistent context (storage state reuse — avoids re-login churn)
 *   - minimal stealth init script (navigator.webdriver removal etc.)
 *   - headful toggle, UA override, optional proxy
 *
 * NOTE on the stealth engine: HUB-104 §8-5 names **Patchright** as the intended
 * production engine. To keep dependencies vetted for this first cut we ship
 * vanilla Playwright + a lightweight init-script. `stealth_engine: "patchright"`
 * currently resolves to the same path with a TODO to swap in the Patchright
 * runtime. The "minimal stealth" principle (§8-5) discourages over-injection.
 *
 * Distribution note: unlike the web-search example, Playwright cannot be bundled
 * into a single ESM artifact (it spawns native browser binaries). This app runs
 * from its own node_modules and requires `npx playwright install chromium`.
 */

import { chromium } from "playwright";
import type { BrowserContext, Page } from "playwright";
import type { ScrapeConfig } from "../types.js";

const STEALTH_INIT = `
  // Hide the automation flag.
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  // Plausible plugins / languages so headless looks less bare.
  if (!navigator.languages || navigator.languages.length === 0) {
    Object.defineProperty(navigator, 'languages', { get: () => ['ja-JP', 'ja', 'en-US', 'en'] });
  }
  // chrome runtime stub (absent in headless Chromium).
  // @ts-ignore
  window.chrome = window.chrome || { runtime: {} };
`;

export interface LaunchOptions {
  /** Persistent profile dir. Instagram MUST use an isolated dir (§6-5 / §5-1-a). */
  userDataDir: string;
  proxyUrl?: string;
}

export interface ScrapeSession {
  context: BrowserContext;
  newPage(): Promise<Page>;
  close(): Promise<void>;
}

export async function launchSession(
  cfg: ScrapeConfig,
  opts: LaunchOptions,
): Promise<ScrapeSession> {
  const context = await chromium.launchPersistentContext(opts.userDataDir, {
    headless: cfg.headless,
    ...(cfg.user_agent ? { userAgent: cfg.user_agent } : {}),
    ...(opts.proxyUrl ? { proxy: { server: opts.proxyUrl } } : {}),
    locale: "ja-JP",
    viewport: { width: 1280, height: 800 },
  });

  if (cfg.stealth_engine !== "vanilla") {
    // TODO(HUB-104 §8-5): swap to the Patchright runtime for stronger CDP-leak
    // and fingerprint coverage. For now apply a minimal init script.
    await context.addInitScript(STEALTH_INIT);
  }

  return {
    context,
    async newPage() {
      return context.newPage();
    },
    async close() {
      await context.close();
    },
  };
}

/**
 * Warm up a session (§6-5): visit the site root, build cookies, brief dwell.
 * Avoids the cold-start fingerprint of jumping straight to a deep URL.
 */
export async function warmup(page: Page, origin: string, dwellMs = 2500): Promise<void> {
  try {
    await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.waitForTimeout(dwellMs);
  } catch {
    // Warmup is best-effort; a failure here should not abort the run.
  }
}
