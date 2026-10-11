import { createFileRoute } from "@tanstack/react-router";
import crypto from "node:crypto";

const CANVA_CLIENT_ID = (process.env.CANVA_CLIENT_ID || "OC-AaCRfP-VVcyS").trim();
const CANVA_CLIENT_SECRET = (process.env.CANVA_CLIENT_SECRET || "").trim();
const CANVA_BRAND_TEMPLATE_ID = (process.env.CANVA_BRAND_TEMPLATE_ID || "EAHVAAahmjU").trim();
const CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const CANVA_SCOPES = "profile:read design:meta:read design:content:read design:content:write brandtemplate:meta:read brandtemplate:content:read";

// In-memory session store for PKCE verifiers & tokens
const oauthStates = new Map<string, { verifier: string; createdAt: number; redirectUri: string }>();
let savedCanvaTokens: { accessToken: string; refreshToken?: string; expiresAt: number } | null = null;

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generatePkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function getRedirectUri(request: Request): string {
  const envUri = process.env.CANVA_REDIRECT_URI;
  if (envUri && envUri.trim()) return envUri.trim();
  const url = new URL(request.url);
  return `${url.origin}/api/canva?action=callback`;
}

export const Route = createFileRoute("/api/canva")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const action = url.searchParams.get("action") || "";

        // 1. Authorize: Redirect user to Canva OAuth consent screen
        if (action === "auth") {
          const redirectUri = getRedirectUri(request);
          const state = base64url(crypto.randomBytes(16));
          const { verifier, challenge } = generatePkce();

          oauthStates.set(state, { verifier, createdAt: Date.now(), redirectUri });

          // Cleanup states older than 15 mins
          const cutoff = Date.now() - 15 * 60 * 1000;
          for (const [k, v] of oauthStates.entries()) {
            if (v.createdAt < cutoff) oauthStates.delete(k);
          }

          const authUrl = new URL(CANVA_AUTH_URL);
          authUrl.searchParams.set("response_type", "code");
          authUrl.searchParams.set("client_id", CANVA_CLIENT_ID);
          authUrl.searchParams.set("redirect_uri", redirectUri);
          authUrl.searchParams.set("scope", CANVA_SCOPES);
          authUrl.searchParams.set("code_challenge", challenge);
          authUrl.searchParams.set("code_challenge_method", "S256");
          authUrl.searchParams.set("state", state);

          return Response.redirect(authUrl.toString(), 302);
        }

        // 2. Callback: Handle redirect back from Canva
        if (action === "callback") {
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state") || "";
          const error = url.searchParams.get("error");
          const errorDesc = url.searchParams.get("error_description");

          const clientOrigin = url.origin;

          if (error) {
            return Response.redirect(
              `${clientOrigin}/?canva_status=error&message=${encodeURIComponent(errorDesc || error)}`,
              302
            );
          }

          if (!code) {
            return Response.redirect(`${clientOrigin}/?canva_status=missing_code`, 302);
          }

          const stored = oauthStates.get(state);
          const codeVerifier = stored?.verifier || "";
          const redirectUri = stored?.redirectUri || getRedirectUri(request);

          try {
            const basicAuth = Buffer.from(`${CANVA_CLIENT_ID}:${CANVA_CLIENT_SECRET}`).toString("base64");
            const tokenParams = new URLSearchParams({
              grant_type: "authorization_code",
              code,
              redirect_uri: redirectUri,
              ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
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
              const errBody = await tokenRes.text();
              console.error("Canva token exchange failed:", tokenRes.status, errBody);
              return Response.redirect(
                `${clientOrigin}/?canva_status=exchange_failed&detail=${encodeURIComponent(errBody.slice(0, 100))}`,
                302
              );
            }

            const tokenData = await tokenRes.json();
            savedCanvaTokens = {
              accessToken: tokenData.access_token,
              refreshToken: tokenData.refresh_token,
              expiresAt: Date.now() + (tokenData.expires_in || 14400) * 1000,
            };

            oauthStates.delete(state);

            return Response.redirect(`${clientOrigin}/?canva_status=connected`, 302);
          } catch (e) {
            console.error("Canva callback error:", e);
            return Response.redirect(
              `${clientOrigin}/?canva_status=error&message=${encodeURIComponent((e as Error).message)}`,
              302
            );
          }
        }

        // Default GET: Return status JSON
        return new Response(
          JSON.stringify({
            configured: Boolean(CANVA_CLIENT_ID && CANVA_CLIENT_SECRET),
            clientId: CANVA_CLIENT_ID,
            brandTemplateId: CANVA_BRAND_TEMPLATE_ID,
            connected: Boolean(savedCanvaTokens && savedCanvaTokens.expiresAt > Date.now()),
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      },

      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, any>;
        const redirectUri = getRedirectUri(request);

        if (body.action === "get_auth_url") {
          const state = base64url(crypto.randomBytes(16));
          const { verifier, challenge } = generatePkce();

          oauthStates.set(state, { verifier, createdAt: Date.now(), redirectUri });

          const authUrl = new URL(CANVA_AUTH_URL);
          authUrl.searchParams.set("response_type", "code");
          authUrl.searchParams.set("client_id", CANVA_CLIENT_ID);
          authUrl.searchParams.set("redirect_uri", redirectUri);
          authUrl.searchParams.set("scope", CANVA_SCOPES);
          authUrl.searchParams.set("code_challenge", challenge);
          authUrl.searchParams.set("code_challenge_method", "S256");
          authUrl.searchParams.set("state", state);

          return new Response(
            JSON.stringify({
              success: true,
              authUrl: authUrl.toString(),
              redirectUri,
            }),
            { headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            configured: Boolean(CANVA_CLIENT_ID && CANVA_CLIENT_SECRET),
            clientId: CANVA_CLIENT_ID,
            brandTemplateId: CANVA_BRAND_TEMPLATE_ID,
            connected: Boolean(savedCanvaTokens && savedCanvaTokens.expiresAt > Date.now()),
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      },
    },
  },
});
