/**
 * robots.txt fetch + parse (HUB-104 §8-5 ゾーン A — 無条件遵守)
 *
 * Minimal, dependency-free Robots Exclusion Protocol reader. We extract the
 * Crawl-delay and Disallow rules for our User-Agent group (falling back to *).
 *
 * Politeness over completeness: on any fetch/parse failure we apply a
 * conservative 5s Crawl-delay and allow access (the caller's interval engine
 * still throttles).
 */

const CONSERVATIVE_CRAWL_DELAY_MS = 5000;

export interface RobotsInfo {
  /** Crawl-delay for our UA group, in ms. Undefined if not declared. */
  crawlDelayMs?: number;
  /** Disallow path prefixes for our UA group. */
  disallow: string[];
  /** True when robots.txt could not be read (conservative defaults applied). */
  degraded: boolean;
}

/** Returns true when `pathname` is allowed by the parsed Disallow rules. */
export function isAllowed(info: RobotsInfo, pathname: string): boolean {
  for (const rule of info.disallow) {
    if (rule === "") continue; // "Disallow:" with empty value allows all
    if (pathname.startsWith(rule)) return false;
  }
  return true;
}

interface RobotsGroup {
  agents: string[];
  disallow: string[];
  crawlDelaySec?: number;
}

function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      if (!lastLineWasAgent || current == null) {
        current = { agents: [], disallow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;
    if (current == null) continue;

    if (field === "disallow") {
      current.disallow.push(value);
    } else if (field === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n)) current.crawlDelaySec = n;
    }
  }
  return groups;
}

/** Pick the most specific matching group for our UA token (else the `*` group). */
function selectGroup(groups: RobotsGroup[], uaToken: string): RobotsGroup | undefined {
  const ua = uaToken.toLowerCase();
  let star: RobotsGroup | undefined;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a === "*") star = star ?? g;
      else if (ua.includes(a)) return g;
    }
  }
  return star;
}

/**
 * Fetch and parse robots.txt for an origin (e.g. "https://example.com").
 * `uaToken` is a short identifier matched against User-Agent groups.
 */
export async function fetchRobots(origin: string, uaToken: string): Promise<RobotsInfo> {
  try {
    const res = await fetch(new URL("/robots.txt", origin).href, {
      headers: { "user-agent": uaToken },
      // Keep this quick; robots fetch should never dominate a run.
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return { disallow: [], degraded: true, crawlDelayMs: CONSERVATIVE_CRAWL_DELAY_MS };
    }
    const text = await res.text();
    const group = selectGroup(parseRobots(text), uaToken);
    if (!group) return { disallow: [], degraded: false };
    return {
      disallow: group.disallow,
      crawlDelayMs:
        group.crawlDelaySec != null ? Math.round(group.crawlDelaySec * 1000) : undefined,
      degraded: false,
    };
  } catch {
    return { disallow: [], degraded: true, crawlDelayMs: CONSERVATIVE_CRAWL_DELAY_MS };
  }
}
