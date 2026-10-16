import crypto from "node:crypto";

/** WhatsApp Cloud API helpers (pure, unit-tested). */

export type WaMessage = {
  id: string;
  direction: "in" | "out";
  contact: string; // customer wa_id (digits)
  name?: string;
  type: string;
  text: string;
  timestamp: string; // ISO
};

/** Verify Meta's X-Hub-Signature-256 header against the raw request body. */
export function verifyWebhookSignature(rawBody: string, header: string | null, appSecret: string) {
  if (!appSecret || !header || !header.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const got = header.slice("sha256=".length);
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got, "utf8"), Buffer.from(expected, "utf8"));
}

type WebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: {
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: {
            button_reply?: { title?: string };
            list_reply?: { title?: string };
          };
          image?: { caption?: string };
          video?: { caption?: string };
          document?: { caption?: string; filename?: string };
        }[];
      };
    }[];
  }[];
};

/** Extract inbound customer messages from a Cloud API webhook payload. */
export function parseInboundMessages(payload: unknown): WaMessage[] {
  const out: WaMessage[] = [];
  const p = (payload ?? {}) as WebhookPayload;
  for (const entry of p.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value ?? {};
      const names = new Map(
        (v.contacts ?? []).map((c) => [c.wa_id ?? "", c.profile?.name ?? ""] as const),
      );
      for (const m of v.messages ?? []) {
        if (!m.id || !m.from) continue;
        const type = m.type || "unknown";
        const text =
          m.text?.body ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          m.image?.caption ??
          m.video?.caption ??
          m.document?.caption ??
          m.document?.filename ??
          `[${type}]`;
        const ts = Number(m.timestamp);
        out.push({
          id: m.id.slice(0, 200),
          direction: "in",
          contact: m.from.replace(/\D/g, "").slice(0, 20),
          ...(names.get(m.from) ? { name: names.get(m.from)!.slice(0, 120) } : {}),
          type,
          text: text.slice(0, 4096),
          timestamp: new Date(Number.isFinite(ts) && ts > 0 ? ts * 1000 : Date.now()).toISOString(),
        });
      }
    }
  }
  return out;
}

export function readWhatsAppConfig() {
  const env = (k: string) => (process.env[k] || "").trim();
  const version = /^v\d+\.\d+$/.test(env("META_GRAPH_VERSION"))
    ? env("META_GRAPH_VERSION")
    : "v21.0";
  return {
    verifyToken: env("WHATSAPP_VERIFY_TOKEN"),
    appSecret: env("WHATSAPP_APP_SECRET"),
    accessToken: env("WHATSAPP_ACCESS_TOKEN"),
    phoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID"),
    version,
  };
}
