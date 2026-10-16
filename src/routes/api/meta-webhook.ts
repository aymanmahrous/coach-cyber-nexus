import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqualStr, getClientIp, verifyOwnerPin } from "../../lib/security";
import {
  evaluateMetaChannels,
  parseAndFilterMetaInbound,
  verifyMetaSignature,
  dispatchMetaReply,
  channelVerificationStore,
  type InboundMetaMessage,
} from "../../lib/meta-channels";
import { generateCoachBrainResponse } from "../../lib/coach-brain";

/**
 * Official Meta Webhook verification & ingress endpoint.
 * Supports: WhatsApp Cloud API, Facebook Messenger, and Instagram Direct.
 *
 * GET:
 *  - Handshake (hub.mode, hub.verify_token, hub.challenge)
 *  - Channel Status (?action=status) - Safe diagnostic, no secrets leaked
 *  - Authenticated Inbox (?action=inbox) - Strictly protected by Owner PIN in headers only
 *
 * POST:
 *  - Inbound webhook receiver with HMAC SHA-256 signature enforcement (Fail-Closed)
 *  - Filters echo and delivery statuses, prevents duplicate processing
 *  - Generates AI response via Coach Brain and dispatches via official Meta Graph API
 */

const MAX_BUFFERED_MESSAGES = 50;

// The live production ingress remains n8n -> Supabase. This route is a
// prepared cutover target only and must be explicitly enabled before Meta is
// pointed at this application.
function standaloneIngressEnabled(): boolean {
  return (process.env["META_WEBHOOK_INGRESS_MODE"] || "n8n").trim().toLowerCase() === "standalone";
}

function ingressDisabledResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: "n8n_is_authoritative",
      message: "The production webhook is owned by n8n; standalone ingress is disabled.",
    }),
    { status: 503, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
export const inboundMessageBuffer: InboundMetaMessage[] = [];

export function clearInboundBuffer(): void {
  inboundMessageBuffer.length = 0;
}

export async function handleMetaWebhookGet(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // 1. Channel Diagnostic Status (Exposes NO secrets)
  if (action === "status") {
    const diagnostics = evaluateMetaChannels(process.env, channelVerificationStore);
    return new Response(JSON.stringify({ ok: true, channels: diagnostics }), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  // 2. Protected Inbox: Strictly requires Owner PIN via Header only
  if (action === "inbox") {
    if (!standaloneIngressEnabled()) return ingressDisabledResponse();
    // Explicit security check: PIN in query string is strictly forbidden
    if (url.searchParams.has("pin")) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "pin_in_query_forbidden",
          message:
            "Security violation: Owner PIN must never be transmitted in query parameters. Use 'x-owner-pin' header or 'Authorization: Bearer <pin>'.",
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const authHeader = request.headers.get("authorization") || "";
    const bearerPin = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    const headerPin = request.headers.get("x-owner-pin");
    const providedPin = headerPin || bearerPin;

    const configuredPin = process.env["OWNER_PUBLISH_PIN"] || process.env["OWNER_PIN"];
    const clientIp = getClientIp(request);

    const authCheck = verifyOwnerPin(providedPin, configuredPin, clientIp);
    if (!authCheck.ok) {
      const isUnconfigured = authCheck.status === 503;
      return new Response(
        JSON.stringify({
          ok: false,
          error: authCheck.error,
          message: isUnconfigured
            ? "Inbox access is temporarily disabled because OWNER_PUBLISH_PIN is not configured."
            : "Unauthorized: Valid Owner PIN is required to read customer messages.",
          storage: "protected",
        }),
        {
          status: authCheck.status,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    // Authenticated owner access granted
    return new Response(
      JSON.stringify({
        ok: true,
        storage: "ephemeral_memory",
        durable: false,
        notice:
          "No persistent database is configured in this repository. Inbound messages are held in ephemeral server memory only and reset upon server restart.",
        count: inboundMessageBuffer.length,
        messages: inboundMessageBuffer,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  // 3. Meta Webhook Handshake
  if (!standaloneIngressEnabled()) return ingressDisabledResponse();

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
  if (!standaloneIngressEnabled()) return ingressDisabledResponse();

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

  // Extract, filter (ignore echoes, statuses), and deduplicate inbound messages
  const incoming = parseAndFilterMetaInbound(payload);

  const replyPromises = incoming.map(async (msg) => {
    // Buffer for owner inspection in the inbox
    inboundMessageBuffer.unshift(msg);
    if (inboundMessageBuffer.length > MAX_BUFFERED_MESSAGES) {
      inboundMessageBuffer.pop();
    }

    // Auto-reply pipeline (only for supported channels with valid text)
    if (msg.platform === "whatsapp" || msg.platform === "messenger" || msg.platform === "instagram") {
      try {
        const channelContext =
          msg.platform === "messenger"
            ? "المنصة المستهدفة: فيسبوك مسنجر (Facebook Messenger)."
            : msg.platform === "instagram"
              ? "المنصة المستهدفة: إنستغرام دايركت (Instagram Direct)."
              : "المنصة المستهدفة: واتساب (WhatsApp).";

        const reply = await generateCoachBrainResponse(
          [{ role: "user", content: msg.text }],
          channelContext,
        );

        if (reply && reply.trim()) {
          await dispatchMetaReply(msg.platform as any, msg.senderId, reply);
        } else {
          console.warn(`[meta-webhook] Coach Brain produced no reply for ${msg.id}`);
        }
      } catch (e) {
        console.error(`[meta-webhook] Auto-reply error for ${msg.id}: ${(e as Error)?.message}`);
      }
    }
  });

  await Promise.allSettled(replyPromises);

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
