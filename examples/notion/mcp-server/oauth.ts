/**
 * OAuth 2.0 + Integration Token authentication for the Notion MCP server.
 *
 * Two auth strategies are supported:
 *
 * 1. OAuth 2.0 Authorization Code + PKCE (recommended)
 *    - Full OAuth flow handled by AKARI Shell / Permission API
 *    - Token stored in Keychain (service: "com.akari.example.notion")
 *    - Notion OAuth does NOT issue refresh tokens; access tokens are long-lived
 *
 * 2. Personal Integration Token (fallback / enterprise)
 *    - User pastes token from https://www.notion.so/my-integrations
 *    - Stored in Keychain (account: "integration_token")
 *    - Simpler but workspace-scoped and lacks user-level attribution
 *
 * In this example the AKARI Shell injects credentials via environment variables
 * (NOTION_ACCESS_TOKEN or NOTION_INTEGRATION_TOKEN) before spawning the MCP
 * server process. Production implementations should use the Permission API
 * Keychain bindings instead of env vars.
 *
 * References:
 *   https://developers.notion.com/docs/authorization
 *   AKARI spec §8 (OAuth flow)
 */

import type { AuthContext } from "./types.js";

// ---------------------------------------------------------------------------
// Resolve credentials from environment (stub for local dev)
// ---------------------------------------------------------------------------

/**
 * Resolve auth context from the process environment.
 *
 * TODO (T-4a): Replace env-var lookup with Keychain API calls via
 *   `akari.permission.keychain.get("com.akari.example.notion", "access_token")`
 *   once the AKARI Shell Keychain binding is available.
 */
export function resolveAuthContext(): AuthContext {
  const access_token = process.env["NOTION_ACCESS_TOKEN"];
  const integration_token = process.env["NOTION_INTEGRATION_TOKEN"];
  const workspace_id = process.env["NOTION_WORKSPACE_ID"];

  if (!access_token && !integration_token) {
    throw new NotionAuthError(
      "No Notion credentials found. " +
        "Set NOTION_ACCESS_TOKEN (OAuth) or NOTION_INTEGRATION_TOKEN (Integration Token) " +
        "in the environment, or complete the OAuth flow via AKARI Shell.",
    );
  }

  return { access_token, integration_token, workspace_id };
}

/**
 * Return the bearer token to use for Notion API requests.
 * OAuth access_token takes priority over integration_token.
 */
export function getBearerToken(ctx: AuthContext): string {
  const token = ctx.access_token ?? ctx.integration_token;
  if (!token) {
    throw new NotionAuthError("Auth context has no usable token.");
  }
  return token;
}

// ---------------------------------------------------------------------------
// OAuth 2.0 PKCE helpers
// ---------------------------------------------------------------------------

/**
 * Generate a PKCE code verifier (random 43-128 char base64url string).
 *
 * TODO (T-4a): Wire into AKARI Permission API OAuth flow.
 *   Call `akari.permission.oauth.startFlow("notion.com", { pkce: true })`
 *   which returns the authorization URL and stores verifier internally.
 */
export function generateCodeVerifier(): string {
  // TODO: use crypto.randomBytes(32) in Node.js ≥18
  // Stub: returns placeholder — replace with real PKCE in production
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

/**
 * Derive PKCE code challenge (SHA-256 of verifier, base64url-encoded).
 *
 * TODO (T-4a): Called internally by Permission API; exposed here for testing.
 */
export async function deriveCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64urlEncode(new Uint8Array(digest));
}

/**
 * Build the Notion OAuth authorization URL.
 *
 * @param clientId   Notion OAuth App Client ID
 * @param redirectUri Callback URL registered in Notion app settings
 * @param state      CSRF state token
 * @param codeChallenge PKCE challenge
 *
 * TODO (T-4a): In production this URL is opened by AKARI Shell browser.
 */
export function buildAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL("https://api.notion.com/v1/oauth/authorize");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

/**
 * Exchange authorization code for an access token.
 *
 * TODO (T-4a): Call this after receiving the OAuth callback.
 *   Then store the token in Keychain via Permission API.
 */
export async function exchangeCodeForToken(params: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{ access_token: string; workspace_id: string; bot_id: string }> {
  const response = await fetch("https://api.notion.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization:
        "Basic " +
        Buffer.from(`${params.clientId}:${params.clientSecret}`).toString(
          "base64",
        ),
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new NotionAuthError(`Token exchange failed: ${err}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (await response.json()) as any;
  return {
    access_token: data.access_token as string,
    workspace_id: data.workspace_id as string,
    bot_id: data.bot_id as string,
  };
}

// ---------------------------------------------------------------------------
// Keychain integration stubs
// ---------------------------------------------------------------------------

/**
 * Persist tokens to AKARI Keychain.
 *
 * TODO (T-4a): Replace stubs with real Keychain calls:
 *   await akari.permission.keychain.set("com.akari.example.notion", "access_token", token)
 *   await akari.permission.keychain.set("com.akari.example.notion", "workspace_id", workspaceId)
 */
export async function saveTokensToKeychain(_ctx: {
  access_token: string;
  workspace_id: string;
}): Promise<void> {
  // TODO (T-4a): implement Keychain write
  console.warn("[oauth] saveTokensToKeychain: stub — tokens not persisted");
}

/**
 * Clear all Notion tokens from Keychain on revoke.
 *
 * TODO (T-4a): implement Keychain delete for all accounts under
 *   service "com.akari.example.notion"
 */
export async function revokeTokens(): Promise<void> {
  // TODO (T-4a): implement Keychain clear
  console.warn("[oauth] revokeTokens: stub — tokens not cleared");
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class NotionAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotionAuthError";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function base64urlEncode(buffer: Uint8Array): string {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}
