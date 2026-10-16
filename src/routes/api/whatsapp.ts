import { createFileRoute } from "@tanstack/react-router";
import { json, safeEqual } from "@/lib/owner-auth";
import { getStore } from "@/lib/store";
import { parseInboundMessages, readWhatsAppConfig, verifyWebhookSignature } from "@/lib/whatsapp";

/**
 * WhatsApp Cloud API webhook.
 * GET with hub.* params: Meta subscription verification.
 * GET without params: configuration status (never claims "live" without a durable inbox).
 * POST: signed inbound events (X-Hub-Signature-256), stored in `wa_messages`.
 */
export const Route = createFileRoute("/api/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const c = readWhatsAppConfig();
        if (url.searchParams.has("hub.mode")) {
          const ok =
            url.searchParams.get("hub.mode") === "subscribe" &&
            !!c.verifyToken &&
            safeEqual(url.searchParams.get("hub.verify_token") || "", c.verifyToken);
          if (!ok) return new Response("forbidden", { status: 403 });
          return new Response(url.searchParams.get("hub.challenge") || "", {
            headers: { "Content-Type": "text/plain" },
          });
        }
        const store = getStore();
        const lastInbound = await store.get<string>("wa:last-inbound").catch(() => null);
        return json({
          webhook: c.verifyToken && c.appSecret ? "configured" : "not_configured",
          send: c.accessToken && c.phoneNumberId ? "configured" : "not_configured",
          durable: store.durable,
          lastInboundAt: lastInbound,
        });
      },

      POST: async ({ request }) => {
        const c = readWhatsAppConfig();
        if (!c.appSecret) return json({ error: "whatsapp_not_configured" }, 503);
        const raw = await request.text();
        if (!verifyWebhookSignature(raw, request.headers.get("x-hub-signature-256"), c.appSecret))
          return json({ error: "invalid_signature" }, 401);
        let payload: unknown;
        try {
          payload = JSON.parse(raw);
        } catch {
          return json({ error: "invalid_request" }, 400);
        }
        const messages = parseInboundMessages(payload);
        if (messages.length) {
          const store = getStore();
          try {
            // Message id is the primary key, so Meta's webhook retries are idempotent.
            await store
              .table("wa_messages")
              .upsert(messages.map((m) => ({ id: m.id, payload: m })));
            await store.set("wa:last-inbound", new Date().toISOString());
          } catch {
            // Non-2xx makes Meta retry delivery later.
            return json({ error: "store_unavailable" }, 503);
          }
        }
        return json({ ok: true });
      },
    },
  },
});
