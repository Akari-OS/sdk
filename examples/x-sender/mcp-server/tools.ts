/**
 * X Sender — MCP tool implementations
 *
 * Each function here corresponds to one MCP tool declared in:
 *   - akari.toml [mcp].tools
 *   - panel.schema.json actions[].mcp.tool
 *
 * Phase 0 tools (4):
 *   x.post       — Immediate tweet (HITL required)
 *   x.schedule   — Scheduled tweet (HITL required)
 *   x.draft_save — Save draft to Pool (no HITL needed)
 *   x.get_me     — Fetch authenticated user info (no HITL needed)
 *
 * Conventions:
 *   - dry_run: true → log intent, skip all external API calls, return mock result
 *   - All amp.record() calls MUST include goal_ref (AKARI Module SDK §6.6)
 *   - No local DB: all persistence goes through Pool / AMP (@akari-os/sdk)
 *   - Offline: x.post / x.schedule will fail when network is unavailable;
 *              callers should catch and suggest x.draft_save as fallback
 */

import type {
  PostResult,
  ScheduleResult,
  DraftSaveResult,
  GetMeResult,
} from "./types.js";
import { getValidAccessToken } from "./oauth.js";

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/** Build Authorization header for X API v2 requests */
async function buildAuthHeader(): Promise<string> {
  const accessToken = await getValidAccessToken(
    getEnv("X_CLIENT_ID"),
    getEnv("X_CLIENT_SECRET")
  );
  return `Bearer ${accessToken}`;
}

// ---------------------------------------------------------------------------
// Tool: x.post
// ---------------------------------------------------------------------------

export interface XPostInput {
  /** Tweet text (max 280 chars). Required. */
  text: string;
  /** Pool item IDs for media attachments (max 4). Optional. */
  media?: string[];
  /**
   * If true, skip X API call and return a mock response.
   * Useful for E2E testing and dry-run demos.
   * Default: false
   */
  dry_run?: boolean;
}

/**
 * Post a tweet immediately.
 *
 * HITL: Shell shows a custom-markdown preview before calling this tool.
 *       This function trusts that HITL has already been approved.
 *
 * AMP: Records kind="publish-action" on success.
 *
 * Offline: Throws "network_error" if X API is unreachable.
 *          The panel's on_error handler shows a toast; consider calling x.draft_save.
 */
export async function xPost(input: XPostInput): Promise<PostResult> {
  const { text, media, dry_run = false } = input;
  const now = new Date().toISOString();

  // --- dry_run shortcut ---
  if (dry_run) {
    process.stderr.write(
      `[x.post dry_run] Would post: "${text.slice(0, 60)}…" | media: ${media?.length ?? 0} items\n`
    );
    return {
      tweet_id: null,
      tweet_url: null,
      dry_run: true,
      published_at: now,
    };
  }

  // --- real API call (stub — TODO: implement) ---
  // TODO: Resolve Pool item IDs in `media` to X media_ids via Media Upload API.
  //       Each Pool item should be fetched and uploaded to X before creating the tweet.
  //
  // TODO: Uncomment and complete once X API credentials and network are available:
  //
  //   const authHeader = await buildAuthHeader();
  //   const body: XTweetPayload = { text };
  //   if (media?.length) {
  //     // Resolve pool item IDs → X media_ids (requires separate Media Upload API calls)
  //     body.media = { media_ids: await resolvePoolItemsToXMediaIds(media, authHeader) };
  //   }
  //   const resp = await fetch("https://api.twitter.com/2/tweets", {
  //     method: "POST",
  //     headers: { "Content-Type": "application/json", Authorization: authHeader },
  //     body: JSON.stringify(body),
  //   });
  //   if (!resp.ok) {
  //     const err = await resp.json() as XApiErrorResponse;
  //     throw new Error(`x_api_error: ${err.detail ?? JSON.stringify(err)}`);
  //   }
  //   const result = await resp.json() as XCreateTweetResponse;
  //   const tweetId = result.data.id;

  // --- AMP record — publish-action (REQUIRED, goal_ref mandatory) ---
  // TODO: Uncomment once @akari-os/sdk is available:
  //
  //   await amp.record({
  //     kind: "publish-action",
  //     content: `X に投稿しました: https://x.com/i/web/status/${tweetId}`,
  //     goal_ref: process.env["AKARI_GOAL_REF"] ?? "com.akari.example.x-sender",
  //     metadata: {
  //       target: "x",
  //       tweet_id: tweetId,
  //       tweet_url: `https://x.com/i/web/status/${tweetId}`,
  //       published_at: now,
  //       scheduled_at: null,
  //     },
  //   });

  void buildAuthHeader; // suppress unused warning while stub is in place
  throw new Error(
    "xPost: Real API call is not yet implemented. Pass dry_run: true for testing."
  );
}

// ---------------------------------------------------------------------------
// Tool: x.schedule
// ---------------------------------------------------------------------------

export interface XScheduleInput {
  /** Tweet text (max 280 chars). Required. */
  text: string;
  /** ISO 8601 UTC datetime for the scheduled post. Required. */
  publish_at: string;
  /** Pool item IDs for media attachments (max 4). Optional. */
  media?: string[];
}

/**
 * Schedule a tweet for future publication.
 *
 * HITL: Shell shows a schedule-summary preview before calling this tool.
 *
 * Note: X API v2's native scheduled tweet support varies by subscription plan.
 *       AKARI Core's job queue may be used as an alternative (see spec Open Question Q-e).
 *
 * AMP: Records kind="publish-action" with scheduled_at on success.
 */
export async function xSchedule(input: XScheduleInput): Promise<ScheduleResult> {
  const { text, publish_at, media } = input;

  // Validate ISO 8601 UTC
  const scheduledDate = new Date(publish_at);
  if (isNaN(scheduledDate.getTime())) {
    throw new Error(`Invalid publish_at: "${publish_at}". Must be ISO 8601 UTC.`);
  }
  if (scheduledDate <= new Date()) {
    throw new Error("publish_at must be in the future.");
  }

  // TODO: Implement scheduled tweet via X API v2 or AKARI Core job queue.
  //       See spec Open Question Q-e for the architectural decision.
  //
  //   const authHeader = await buildAuthHeader();
  //   // Option A: X API v2 native scheduling (Premium+ plans only)
  //   // Option B: Store in Pool with tag "x-scheduled", AKARI Core dispatcher fires x.post at publish_at
  //
  //   await amp.record({
  //     kind: "publish-action",
  //     content: `X 予約投稿を登録しました (${publish_at})`,
  //     goal_ref: process.env["AKARI_GOAL_REF"] ?? "com.akari.example.x-sender",
  //     metadata: {
  //       target: "x",
  //       tweet_id: null,
  //       published_at: null,
  //       scheduled_at: publish_at,
  //     },
  //   });

  void text; void media; void buildAuthHeader;
  throw new Error(
    "xSchedule: Real API call is not yet implemented."
  );
}

// ---------------------------------------------------------------------------
// Tool: x.draft_save
// ---------------------------------------------------------------------------

export interface XDraftSaveInput {
  /** Draft tweet text (max 280 chars). Required. */
  text: string;
  /** Pool item IDs for media attachments. Optional. */
  media?: string[];
}

/**
 * Save a tweet draft to Pool.
 *
 * No HITL: Pool is an internal memory layer, not an external publication.
 * Fully offline-capable.
 *
 * Pool tags: ["draft", "x-sender"] — used by Shell to restore the draft on next launch.
 *
 * AMP: Records kind="draft-created" on success.
 */
export async function xDraftSave(input: XDraftSaveInput): Promise<DraftSaveResult> {
  const { text, media } = input;
  const savedAt = new Date().toISOString();

  // TODO: Uncomment once @akari-os/sdk is available:
  //
  //   const draftPayload = JSON.stringify({ text, media: media ?? [] });
  //   const poolItemId = await pool.put({
  //     bytes: Buffer.from(draftPayload),
  //     mime: "application/json",
  //     tags: ["draft", "x-sender"],
  //   });
  //
  //   await amp.record({
  //     kind: "draft-created",
  //     content: `X 下書きを Pool に保存しました: ${text.slice(0, 60)}`,
  //     goal_ref: process.env["AKARI_GOAL_REF"] ?? "com.akari.example.x-sender",
  //     metadata: {
  //       pool_item_id: poolItemId,
  //       media_count: media?.length ?? 0,
  //       saved_at: savedAt,
  //     },
  //   });
  //
  //   return { pool_item_id: poolItemId, saved_at: savedAt };

  // Stub return while @akari-os/sdk is not yet wired
  const stubPoolItemId = `stub-pool-${Date.now()}`;
  process.stderr.write(
    `[x.draft_save stub] Saved draft to Pool (stub id: ${stubPoolItemId}): "${text.slice(0, 60)}"\n`
  );
  void media;
  return { pool_item_id: stubPoolItemId, saved_at: savedAt };
}

// ---------------------------------------------------------------------------
// Tool: x.get_me
// ---------------------------------------------------------------------------

/**
 * Fetch the currently authenticated X account's user info.
 *
 * No HITL: read-only, no external publication.
 *
 * Offline: Returns cached result (last known user info) if network is unavailable.
 *          Throws "not_authenticated" if no token is stored at all.
 */
export async function xGetMe(): Promise<GetMeResult> {
  // TODO: Implement real X API call and cache result in Pool or local state.
  //
  //   const authHeader = await buildAuthHeader();
  //   const resp = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url", {
  //     headers: { Authorization: authHeader },
  //   });
  //   if (!resp.ok) {
  //     // Offline or token error — return cached value if available
  //     const cached = await pool.search({ query: "x-sender-user-cache" }).then(r => r[0]);
  //     if (cached) return { ...(cached as XUserData), cached: true };
  //     throw new Error("network_error: Cannot reach X API and no cached user info.");
  //   }
  //   const result = await resp.json() as XGetMeResponse;
  //   // Cache user info in Pool for offline fallback
  //   await pool.put({
  //     bytes: Buffer.from(JSON.stringify(result.data)),
  //     mime: "application/json",
  //     tags: ["x-sender-user-cache"],
  //   });
  //   return result.data;

  void buildAuthHeader;

  // Stub: return placeholder user info
  process.stderr.write("[x.get_me stub] Returning placeholder user info\n");
  return {
    id: "000000000000000000",
    name: "Example User",
    username: "example_user",
    profile_image_url: undefined,
    cached: true,
  };
}
