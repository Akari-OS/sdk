/**
 * X Sender — X API response types
 *
 * These are minimal type stubs for the X API v2 responses used by the MCP tools.
 * Expand these as you add more endpoints (e.g. x.thread, x.delete).
 *
 * Official docs: https://developer.twitter.com/en/docs/twitter-api
 */

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

/** X API v2 error object */
export interface XApiError {
  code: number;
  message: string;
}

/** Wrapper for X API v2 error responses */
export interface XApiErrorResponse {
  errors: XApiError[];
  title?: string;
  detail?: string;
  type?: string;
}

// ---------------------------------------------------------------------------
// POST /2/tweets  (x.post, x.schedule)
// ---------------------------------------------------------------------------

export interface XTweetPayload {
  text: string;
  /** Pool-resolved media IDs (X media_id strings after upload). Optional. */
  media?: {
    media_ids: string[];
  };
  /**
   * Scheduled tweet payload.
   * Note: X API v2 scheduled tweets use a separate endpoint in some plans.
   * Adjust to match your plan's endpoint.
   */
  scheduled_at?: string; // ISO 8601 UTC
}

export interface XTweetData {
  id: string;
  text: string;
}

export interface XCreateTweetResponse {
  data: XTweetData;
}

// ---------------------------------------------------------------------------
// GET /2/users/me  (x.get_me)
// ---------------------------------------------------------------------------

export interface XUserData {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
}

export interface XGetMeResponse {
  data: XUserData;
}

// ---------------------------------------------------------------------------
// MCP tool output shapes
// ---------------------------------------------------------------------------

/** Returned by x.post on success (dry_run or real) */
export interface PostResult {
  tweet_id: string | null;
  tweet_url: string | null;
  dry_run: boolean;
  published_at: string;
}

/** Returned by x.schedule on success (dry_run or real) */
export interface ScheduleResult {
  tweet_id: string | null;
  tweet_url: string | null;
  dry_run: boolean;
  publish_at: string;
}

/** Returned by x.draft_save on success */
export interface DraftSaveResult {
  pool_item_id: string;
  saved_at: string;
}

/** Returned by x.get_me on success */
export interface GetMeResult {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
  cached?: boolean;
}
