import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Official Meta Webhook verification & ingress endpoint.
 * Supports: Facebook Pages / Messenger, Instagram Direct, and WhatsApp Business Account.
 *
 * GET: Handles Meta Webhook verification handshake (hub.mode, hub.verify_token, hub.challenge)
 * POST: Handles incoming events with HMAC SHA-256 signature verification (X-Hub-Signature-256)
 */

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export const Route = createFileRoute("/api/meta-webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        const expectedToken = (process.env["META_WEBHOOK_VERIFY_TOKEN"] || "").trim();

        if (mode === "subscribe" && token && expectedToken && timingSafeEqualStr(token, expectedToken)) {
          return new Response(challenge || "", {
            status: 200,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }

        return new Response("Forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const signature = request.headers.get("x-hub-signature-256") || "";
        const appSecret = (process.env["META_APP_SECRET"] || "").trim();

        const rawBody = await request.text();

        // If appSecret is configured, verify HMAC SHA-256 signature
        if (appSecret) {
          if (!signature.startsWith("sha256=")) {
            return new Response("Missing or invalid signature format", { status: 401 });
          }
          const expectedSig = signature.slice(7);
          const encoder = new TextEncoder();
          const key = await crypto.subtle.importKey(
            "raw",
            encoder.encode(appSecret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
          );
          const sigBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
          const calculatedHex = Array.from(new Uint8Array(sigBuf))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

          if (!timingSafeEqualStr(calculatedHex, expectedSig)) {
            return new Response("Signature verification failed", { status: 403 });
          }
        }

        let payload: any = null;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        // Meta expects quick 200 OK to acknowledge receipt
        // Log entry structure without leaking sensitive message bodies
        const objectType = payload?.object || "unknown";
        const entryCount = Array.isArray(payload?.entry) ? payload.entry.length : 0;
        console.log(`[meta-webhook] received object=${objectType} entries=${entryCount}`);

        return new Response("EVENT_RECEIVED", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      },
    },
  },
});
