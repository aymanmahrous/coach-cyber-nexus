import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withTimeout } from "@/lib/integration-guards";
import { isOwner, json, unauthorized } from "@/lib/owner-auth";
import { getStore } from "@/lib/store";
import { readWhatsAppConfig, type WaMessage } from "@/lib/whatsapp";

const SendBody = z.object({
  to: z.string().regex(/^\d{8,15}$/),
  text: z.string().trim().min(1).max(4096),
});

/** Owner-only inbox read + manual reply through the WhatsApp Cloud API. */
export const Route = createFileRoute("/api/whatsapp/messages")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isOwner(request)) return unauthorized();
        const store = getStore();
        try {
          const rows = await store.table("wa_messages").list<WaMessage>(300);
          return json({ messages: rows.map((r) => r.payload), durable: store.durable });
        } catch {
          return json({ error: "store_unavailable" }, 503);
        }
      },

      POST: async ({ request }) => {
        if (!isOwner(request)) return unauthorized();
        const parsed = SendBody.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "invalid_request" }, 400);
        const c = readWhatsAppConfig();
        if (!c.accessToken || !c.phoneNumberId)
          return json({ error: "whatsapp_not_configured" }, 503);

        const { to, text } = parsed.data;
        const res = await fetch(
          `https://graph.facebook.com/${c.version}/${c.phoneNumberId}/messages`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${c.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type: "individual",
              to,
              type: "text",
              text: { preview_url: false, body: text },
            }),
            signal: withTimeout(20_000),
          },
        ).catch(() => null);
        if (!res) return json({ error: "whatsapp_send_failed" }, 502);
        const data = (await res.json().catch(() => ({}))) as {
          messages?: { id?: string }[];
          error?: { code?: number };
        };
        if (!res.ok || data.error) {
          console.error(
            `[whatsapp] send failed status=${res.status} code=${data.error?.code ?? "-"}`,
          );
          // 131047: outside the 24h customer service window (template required).
          const err =
            data.error?.code === 131047
              ? "outside_24h_window"
              : res.status === 401 || data.error?.code === 190
                ? "whatsapp_auth_failed"
                : "whatsapp_send_failed";
          return json({ error: err }, 502);
        }
        const id = data.messages?.[0]?.id || `out_${Date.now()}`;
        const msg: WaMessage = {
          id,
          direction: "out",
          contact: to,
          type: "text",
          text,
          timestamp: new Date().toISOString(),
        };
        await getStore()
          .table("wa_messages")
          .upsert([{ id, payload: msg }])
          .catch(() => {});
        return json({ ok: true, id });
      },
    },
  },
});
