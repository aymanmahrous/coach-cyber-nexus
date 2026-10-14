import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";

const CANVA_CLIENT_ID = (process.env["CANVA_CLIENT_ID"] || "").trim();
const CANVA_CLIENT_SECRET = (process.env["CANVA_CLIENT_SECRET"] || "").trim();
const CANVA_BRAND_TEMPLATE_ID = (process.env["CANVA_BRAND_TEMPLATE_ID"] || "").trim();
const CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const CANVA_SCOPES =
  "profile:read design:meta:read design:content:read design:content:write brandtemplate:meta:read brandtemplate:content:read";

const OAUTH_COOKIE_PREFIX = "canva_oauth_";
const OAUTH_STATE_MAX_AGE = 15 * 60;
let savedCanvaTokens: { accessToken: string; refreshToken?: string; expiresAt: number } | null =
  null;

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
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  response.headers.append(
    "Set-Cookie",
    `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/api/canva; Max-Age=${OAUTH_STATE_MAX_AGE}${secure}`,
  );
}

function clearOauthCookie(response: Response, request: Request, state: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(state)) return;
  response.headers.append(
    "Set-Cookie",
    `${oauthCookieName(state)}=; HttpOnly; SameSite=Lax; Path=/api/canva; Max-Age=0${
      new URL(request.url).protocol === "https:" ? "; Secure" : ""
    }`,
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
            const basicAuth = Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString(
              "base64",
            );
            const tokenParams = new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectUri,
              code_verifier: codeVerifier,
            });

            const tokenRes = await fetch(CANVA_TOKEN_URL, {
              method: "POST",
              headers: {
                Authorization: `Basic ${basicAuth}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: tokenParams.toString(),
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

            const tokenData: unknown = await tokenRes.json();
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
            savedCanvaTokens = {
              accessToken: tokenData.access_token,
              ...("refresh_token" in tokenData && typeof tokenData.refresh_token === "string"
                ? { refreshToken: tokenData.refresh_token }
                : {}),
              expiresAt: Date.now() + expiresIn * 1000,
            };

            const response = Response.redirect(`${clientOrigin}/?canva_status=connected`, 302);
            clearOauthCookie(response, request, state);
            return response;
          } catch (e) {
            console.error(`[canva] callback error: ${(e as Error)?.name || "Error"}`);
            const response = Response.redirect(
              `${clientOrigin}/?canva_status=error`,
              302,
            );
            clearOauthCookie(response, request, state);
            return response;
          }
        }

        // Default GET: Return status JSON
        return new Response(
          JSON.stringify({
            configured: Boolean(CANVA_CLIENT_ID && CANVA_CLIENT_SECRET),
            brandTemplateConfigured: Boolean(CANVA_BRAND_TEMPLATE_ID),
            // in-memory only, resets on restart (durable token storage = next phase)
            connectedThisInstance: Boolean(savedCanvaTokens && savedCanvaTokens.expiresAt > Date.now()),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },

      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const redirectUri = getRedirectUri(request);

        if (body["action"] === "get_auth_url") {
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

        return new Response(
          JSON.stringify({
            configured: Boolean(CANVA_CLIENT_ID && CANVA_CLIENT_SECRET),
            brandTemplateConfigured: Boolean(CANVA_BRAND_TEMPLATE_ID),
            // in-memory only, resets on restart (durable token storage = next phase)
            connectedThisInstance: Boolean(savedCanvaTokens && savedCanvaTokens.expiresAt > Date.now()),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
