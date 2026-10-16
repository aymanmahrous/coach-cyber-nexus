import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";
import { isOwner, unauthorized } from "@/lib/owner-auth";
import { getStore } from "@/lib/store";

const CANVA_CLIENT_ID = (process.env["CANVA_CLIENT_ID"] || "").trim();
const CANVA_CLIENT_SECRET = (process.env["CANVA_CLIENT_SECRET"] || "").trim();
const CANVA_BRAND_TEMPLATE_ID = (process.env["CANVA_BRAND_TEMPLATE_ID"] || "").trim();
const CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const CANVA_SCOPES =
  "profile:read design:meta:read design:content:read design:content:write brandtemplate:meta:read brandtemplate:content:read";

const OAUTH_COOKIE_PREFIX = "canva_oauth_";
const OAUTH_STATE_MAX_AGE = 15 * 60;
const TOKENS_KEY = "canva:tokens";
const REFRESH_LOCK_KEY = "canva:refresh-lock";
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const VERIFY_CACHE_KEY = "canva:verified";
const VERIFY_CACHE_MS = 10 * 60 * 1000;

type CanvaTokens = { accessToken: string; refreshToken?: string; expiresAt: number };

function parseTokenResponse(tokenData: unknown, previousRefresh?: string): CanvaTokens {
  if (
    !tokenData ||
    typeof tokenData !== "object" ||
    !("access_token" in tokenData) ||
    typeof tokenData.access_token !== "string" ||
    !tokenData.access_token
  ) {
    throw new Error("Canva returned an invalid token response");
  }
  const expiresIn =
    "expires_in" in tokenData &&
    typeof tokenData.expires_in === "number" &&
    Number.isFinite(tokenData.expires_in) &&
    tokenData.expires_in > 0
      ? tokenData.expires_in
      : 14400;
  const refreshToken =
    "refresh_token" in tokenData && typeof tokenData.refresh_token === "string"
      ? tokenData.refresh_token
      : previousRefresh;
  return {
    accessToken: tokenData.access_token,
    ...(refreshToken ? { refreshToken } : {}),
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

function basicAuthHeader() {
  return `Basic ${Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString("base64")}`;
}

/**
 * Returns a usable access token, refreshing it first when it is close to expiry.
 * Canva refresh tokens are single-use, so refresh runs under a short store lock
 * and the rotated refresh token is persisted immediately.
 */
async function getValidCanvaToken(): Promise<string | null> {
  const store = getStore();
  const tokens = await store.get<CanvaTokens>(TOKENS_KEY);
  if (!tokens) return null;
  if (tokens.expiresAt - Date.now() > REFRESH_MARGIN_MS) return tokens.accessToken;
  if (!tokens.refreshToken || !CANVA_CLIENT_ID || !CANVA_CLIENT_SECRET) {
    return tokens.expiresAt > Date.now() ? tokens.accessToken : null;
  }
  if (!(await store.claim(REFRESH_LOCK_KEY, 1, 30_000))) {
    await new Promise((r) => setTimeout(r, 1500));
    const latest = await store.get<CanvaTokens>(TOKENS_KEY);
    return latest && latest.expiresAt > Date.now() ? latest.accessToken : null;
  }
  try {
    const res = await fetch(CANVA_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: basicAuthHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
      }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      console.error(`[canva] token refresh failed status=${res.status}`);
      if (res.status === 400 || res.status === 401) await store.delete(TOKENS_KEY);
      return null;
    }
    const next = parseTokenResponse(await res.json(), tokens.refreshToken);
    await store.set(TOKENS_KEY, next);
    return next.accessToken;
  } finally {
    await store.delete(REFRESH_LOCK_KEY).catch(() => {});
  }
}

/** Confirms the token works against the Canva API (cached briefly). */
async function verifyCanvaConnection(): Promise<{ connected: boolean; verified: boolean }> {
  const store = getStore();
  const token = await getValidCanvaToken();
  if (!token) return { connected: false, verified: false };
  if (await store.get<boolean>(VERIFY_CACHE_KEY)) return { connected: true, verified: true };
  const res = await fetch("https://api.canva.com/rest/v1/users/me", {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  await res?.body?.cancel().catch(() => {});
  const verified = Boolean(res?.ok);
  if (verified) await store.set(VERIFY_CACHE_KEY, true, VERIFY_CACHE_MS);
  return { connected: true, verified };
}

async function statusResponse() {
  const store = getStore();
  const configured = Boolean(CANVA_CLIENT_ID && CANVA_CLIENT_SECRET);
  const conn = configured
    ? await verifyCanvaConnection().catch(() => ({ connected: false, verified: false }))
    : { connected: false, verified: false };
  return Response.json(
    {
      configured,
      brandTemplateConfigured: Boolean(CANVA_BRAND_TEMPLATE_ID),
      brandTemplateId: CANVA_BRAND_TEMPLATE_ID, // non-secret design template ID
      connected: conn.connected,
      verified: conn.verified,
      durable: store.durable,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generatePkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function getRedirectUri(request: Request): string {
  const envUri = process.env["CANVA_REDIRECT_URI"];
  if (envUri && envUri.trim()) return envUri.trim();
  const url = new URL(request.url);
  return `${url.origin}/api/canva?action=callback`;
}

function oauthCookieName(state: string): string {
  return `${OAUTH_COOKIE_PREFIX}${state}`;
}

function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return undefined;
}

function appendOauthCookie(response: Response, request: Request, name: string, value: string) {
  void request;
  response.headers.append(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/api/canva; Max-Age=${OAUTH_STATE_MAX_AGE}`,
  );
}

function clearOauthCookie(response: Response, request: Request, state: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(state)) return;
  response.headers.append(
    "Set-Cookie",
    `${oauthCookieName(state)}=; HttpOnly; Secure; SameSite=Lax; Path=/api/canva; Max-Age=0`,
  );
}

export const Route = createFileRoute("/api/canva")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action") || "";

        // 1. Authorize: Redirect user to Canva OAuth consent screen
        if (action === "auth") {
          if (!isOwner(request)) {
            return Response.redirect(`${url.origin}/?canva_status=owner_session_required`, 302);
          }
          if (!CANVA_CLIENT_ID || !CANVA_CLIENT_SECRET) {
            return Response.redirect(`${url.origin}/?canva_status=not_configured`, 302);
          }
          const redirectUri = getRedirectUri(request);
          const state = base64url(crypto.randomBytes(16));
          const { verifier, challenge } = generatePkce();

          const authUrl = new URL(CANVA_AUTH_URL);
          authUrl.searchParams.set("response_type", "code");
          authUrl.searchParams.set("client_id", CANVA_CLIENT_ID);
          authUrl.searchParams.set("redirect_uri", redirectUri);
          authUrl.searchParams.set("scope", CANVA_SCOPES);
          authUrl.searchParams.set("code_challenge", challenge);
          authUrl.searchParams.set("code_challenge_method", "S256");
          authUrl.searchParams.set("state", state);

          const response = Response.redirect(authUrl.toString(), 302);
          appendOauthCookie(response, request, oauthCookieName(state), verifier);
          return response;
        }

        // 2. Callback: Handle redirect back from Canva
        if (action === "callback") {
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state") || "";
          const error = url.searchParams.get("error");

          const clientOrigin = url.origin;

          if (error) {
            const response = Response.redirect(
              `${clientOrigin}/?canva_status=${error === "access_denied" ? "denied" : "error"}`,
              302,
            );
            if (state) clearOauthCookie(response, request, state);
            return response;
          }

          if (!code) {
            const response = Response.redirect(`${clientOrigin}/?canva_status=missing_code`, 302);
            if (state) clearOauthCookie(response, request, state);
            return response;
          }

          // The owner session must still be valid when the flow completes.
          if (!isOwner(request)) {
            const response = Response.redirect(
              `${clientOrigin}/?canva_status=owner_session_required`,
              302,
            );
            if (state) clearOauthCookie(response, request, state);
            return response;
          }

          const codeVerifier = /^[A-Za-z0-9_-]{20,64}$/.test(state)
            ? readCookie(request, oauthCookieName(state))
            : undefined;
          if (!codeVerifier || !CANVA_CLIENT_SECRET) {
            const response = Response.redirect(`${clientOrigin}/?canva_status=invalid_state`, 302);
            if (state) clearOauthCookie(response, request, state);
            return response;
          }
          const redirectUri = getRedirectUri(request);

          try {
            const tokenParams = new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectUri,
              code_verifier: codeVerifier,
            });

            const tokenRes = await fetch(CANVA_TOKEN_URL, {
              method: "POST",
              headers: {
                Authorization: basicAuthHeader(),
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: tokenParams.toString(),
              signal: AbortSignal.timeout(15_000),
            });

            if (!tokenRes.ok) {
              await tokenRes.body?.cancel().catch(() => {});
              console.error(`[canva] token exchange failed status=${tokenRes.status}`);
              const response = Response.redirect(
                `${clientOrigin}/?canva_status=exchange_failed`,
                302,
              );
              clearOauthCookie(response, request, state);
              return response;
            }

            const store = getStore();
            await store.set(TOKENS_KEY, parseTokenResponse(await tokenRes.json()));
            await store.delete(VERIFY_CACHE_KEY);

            const response = Response.redirect(`${clientOrigin}/?canva_status=connected`, 302);
            clearOauthCookie(response, request, state);
            return response;
          } catch (e) {
            console.error(`[canva] callback error: ${(e as Error)?.name || "Error"}`);
            const response = Response.redirect(`${clientOrigin}/?canva_status=error`, 302);
            clearOauthCookie(response, request, state);
            return response;
          }
        }

        // Default GET: status (connection is verified against the Canva API)
        return statusResponse();
      },

      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const redirectUri = getRedirectUri(request);

        if (body["action"] === "get_auth_url") {
          if (!isOwner(request)) return unauthorized();
          if (!CANVA_CLIENT_ID || !CANVA_CLIENT_SECRET) {
            return Response.json({ error: "canva_not_configured" }, { status: 503 });
          }
          const state = base64url(crypto.randomBytes(16));
          const { verifier, challenge } = generatePkce();

          const authUrl = new URL(CANVA_AUTH_URL);
          authUrl.searchParams.set("response_type", "code");
          authUrl.searchParams.set("client_id", CANVA_CLIENT_ID);
          authUrl.searchParams.set("redirect_uri", redirectUri);
          authUrl.searchParams.set("scope", CANVA_SCOPES);
          authUrl.searchParams.set("code_challenge", challenge);
          authUrl.searchParams.set("code_challenge_method", "S256");
          authUrl.searchParams.set("state", state);

          const response = new Response(
            JSON.stringify({
              success: true,
              authUrl: authUrl.toString(),
              redirectUri,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
          appendOauthCookie(response, request, oauthCookieName(state), verifier);
          return response;
        }

        return statusResponse();
      },
    },
  },
});
