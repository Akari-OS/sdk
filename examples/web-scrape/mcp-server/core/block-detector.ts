/**
 * BlockDetector (HUB-104 §7-1)
 *
 * Three signals judged in parallel; any one true ⇒ blocked:
 *   1. HTTP status   403 / 429 / 503
 *   2. Challenge page title/markers ("Just a moment", cf-challenge, Turnstile…)
 *   3. Response-size anomaly (body < 1 KB — challenge pages are lighter than content)
 *
 * On block we stop safely and never call a CAPTCHA-solving service (§8-5 ゾーン C).
 */

const BLOCK_STATUSES = new Set([403, 429, 503]);

const CHALLENGE_TITLE_MARKERS = [
  "just a moment",
  "access denied",
  "checking your browser",
  "attention required",
  "verify you are human",
];

const CHALLENGE_DOM_MARKERS = [
  "#challenge-form",
  "cf-challenge",
  "cf-turnstile",
  "g-recaptcha",
  "h-captcha",
  "px-captcha",
  "datadome",
];

const MIN_BODY_BYTES = 1024;

export interface BlockInput {
  status?: number;
  title?: string;
  html?: string;
  bodyBytes?: number;
}

export interface BlockResult {
  blocked: boolean;
  reason?: string;
}

export function detectBlock(input: BlockInput): BlockResult {
  if (input.status != null && BLOCK_STATUSES.has(input.status)) {
    return { blocked: true, reason: `http_${input.status}` };
  }

  const title = (input.title ?? "").toLowerCase();
  for (const marker of CHALLENGE_TITLE_MARKERS) {
    if (title.includes(marker)) return { blocked: true, reason: `challenge_title:${marker}` };
  }

  const html = (input.html ?? "").toLowerCase();
  for (const marker of CHALLENGE_DOM_MARKERS) {
    if (html.includes(marker)) return { blocked: true, reason: `challenge_dom:${marker}` };
  }

  if (input.bodyBytes != null && input.bodyBytes > 0 && input.bodyBytes < MIN_BODY_BYTES) {
    return { blocked: true, reason: `body_too_small:${input.bodyBytes}b` };
  }

  return { blocked: false };
}

/** Thrown by connectors when BlockDetector trips. Surfaces to the Workflow Engine (ADR-117). */
export class BlockedError extends Error {
  constructor(public readonly reason: string) {
    super(`scrape blocked: ${reason}`);
    this.name = "BlockedError";
  }
}
