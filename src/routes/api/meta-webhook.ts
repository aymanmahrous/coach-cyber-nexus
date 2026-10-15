import { createFileRoute } from "@tanstack/react-router";

/**
 * Official Meta Webhook verification & ingress endpoint.
 * Supports: Facebook Pages / Messenger, Instagram Direct, and WhatsApp Business Account.
 *
 * GET: Handles Meta Webhook verification handshake (hub.mode, hub.verify_token, hub.challenge)
 *      or returns the in-memory buffered inbox status (?action=inbox).
 * POST: Handles incoming events with strict HMAC SHA-256 signature verification (X-Hub-Signature-256)
 *       Fail-closed: Rejects if META_APP_SECRET is not configured.
 */

export interface InboundMetaMessage {
  id: string;
  platform: "messenger" | "instagram" | "whatsapp" | "unknown";
  senderId: string;
  senderName?: string | undefined;
  text: string;
  timestamp: number;
}

const MAX_BUFFERED_MESSAGES = 30;
export const inboundMessageBuffer: InboundMetaMessage[] = [];

export function clearInboundBuffer(): void {
  inboundMessageBuffer.length = 0;
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const expectedSig = signatureHeader.slice(7);
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

  return timingSafeEqualStr(calculatedHex, expectedSig);
}

export function parseMetaInboundEvents(payload: any): InboundMetaMessage[] {
  const extracted: InboundMetaMessage[] = [];
  if (!payload || !Array.isArray(payload.entry)) return extracted;

  for (const entry of payload.entry) {
    // 1. Messenger / Instagram Messaging format (entry.messaging)
    if (Array.isArray(entry.messaging)) {
      const platform: InboundMetaMessage["platform"] =
        payload.object === "instagram" ? "instagram" : "messenger";

      for (const msg of entry.messaging) {
        if (msg.message && typeof msg.message.text === "string") {
          extracted.push({
            id: msg.message.mid || `mid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            platform,
            senderId: msg.sender?.id || "unknown",
            text: msg.message.text,
            timestamp: typeof msg.timestamp === "number" ? msg.timestamp : Date.now(),
          });
        }
      }
    }

    // 2. WhatsApp Cloud API format (entry.changes[].value.messages)
    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        const val = change.value;
        if (val && Array.isArray(val.messages)) {
          const contactMap = new Map<string, string>();
          if (Array.isArray(val.contacts)) {
            for (const c of val.contacts) {
              if (c.wa_id && c.profile?.name) {
                contactMap.set(c.wa_id, c.profile.name);
              }
            }
          }

          for (const msg of val.messages) {
            const text = msg.text?.body || (msg.type === "text" ? msg.body : "");
            if (text) {
              const fromId = msg.from || "unknown";
              extracted.push({
                id: msg.id || `wamid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                platform: "whatsapp",
                senderId: fromId,
                senderName: contactMap.get(fromId),
                text,
                timestamp: msg.timestamp ? Number(msg.timestamp) * 1000 : Date.now(),
              });
            }
          }
        }
      }
    }
  }

  return extracted;
}

export async function handleMetaWebhookGet(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // If querying in-memory inbox status
  if (url.searchParams.get("action") === "inbox") {
    return new Response(
      JSON.stringify({
        ok: true,
        storage: "ephemeral_memory",
        durable: false,
        notice:
          "No persistent database is configured. Incoming messages are buffered in ephemeral memory only and reset upon server restart.",
        count: inboundMessageBuffer.length,
        messages: inboundMessageBuffer,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }

  // Meta Webhook Handshake
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
}

export async function handleMetaWebhookPost(request: Request): Promise<Response> {
  const appSecret = (process.env["META_APP_SECRET"] || "").trim();

  // Fail-Closed: Strictly require META_APP_SECRET
  if (!appSecret) {
    console.error("[meta-webhook] Rejected: META_APP_SECRET is not configured on the server");
    return new Response(
      JSON.stringify({
        error: "Configuration error: META_APP_SECRET is required to verify incoming events",
      }),
      { status: 500, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }

  const signature = request.headers.get("x-hub-signature-256");
  const rawBody = await request.text();

  const isValid = await verifyMetaSignature(rawBody, signature, appSecret);
  if (!isValid) {
    console.warn("[meta-webhook] Rejected: HMAC SHA-256 signature verification failed");
    return new Response(
      JSON.stringify({ error: "Invalid signature: HMAC SHA-256 verification failed" }),
      { status: 403, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }

  let payload: any = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  // Extract inbound user messages
  const incoming = parseMetaInboundEvents(payload);
  if (incoming.length > 0) {
    for (const msg of incoming) {
      inboundMessageBuffer.unshift(msg);
      if (inboundMessageBuffer.length > MAX_BUFFERED_MESSAGES) {
        inboundMessageBuffer.pop();
      }
    }
    console.log(`[meta-webhook] Buffered ${incoming.length} incoming messages (in-memory)`);
  }

  const objectType = payload?.object || "unknown";
  const entryCount = Array.isArray(payload?.entry) ? payload.entry.length : 0;
  console.log(`[meta-webhook] acknowledged object=${objectType} entries=${entryCount}`);

  return new Response("EVENT_RECEIVED", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const Route = createFileRoute("/api/meta-webhook")({
  server: {
    handlers: {
      GET: ({ request }) => handleMetaWebhookGet(request),
      POST: ({ request }) => handleMetaWebhookPost(request),
    },
  },
});
