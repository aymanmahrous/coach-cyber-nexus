/**
 * Meta Omnichannel Integration Module for Coach Cyber Nexus.
 * Covers:
 * 1. Safe channel status evaluation (distinguishing needs_setup, configured_unverified, verified, blocked)
 * 2. Inbound event parsing, filtering (ignoring echoes and statuses), and deduplication
 * 3. Official outbound dispatchers for WhatsApp Cloud API, Messenger, and Instagram Direct
 * 4. Integration with Coach Brain for AI replies
 */

import { timingSafeEqualStr } from "./security";

export type MetaChannel = "whatsapp" | "messenger" | "instagram" | "facebook_page";

export type ChannelStatus = "needs_setup" | "configured_unverified" | "verified" | "blocked";

export interface ChannelDiagnostic {
  channel: MetaChannel;
  status: ChannelStatus;
  configured: boolean;
  missingConfig: string[];
  verifiedLive: boolean;
  lastVerifiedAt?: number | undefined;
  lastErrorSummary?: string | undefined;
}

export interface InboundMetaMessage {
  id: string;
  platform: "whatsapp" | "messenger" | "instagram" | "unknown";
  senderId: string;
  senderName?: string | undefined;
  text: string;
  timestamp: number;
}

export interface ChannelVerificationState {
  whatsapp?: { verifiedAt: number; success: boolean; error?: string } | undefined;
  messenger?: { verifiedAt: number; success: boolean; error?: string } | undefined;
  instagram?: { verifiedAt: number; success: boolean; error?: string } | undefined;
  facebook_page?: { verifiedAt: number; success: boolean; error?: string } | undefined;
}

// In-memory verification state (instance level)
export const channelVerificationStore: ChannelVerificationState = {};

// In-memory message deduplication set (TTL 2 hours)
const PROCESSED_TTL_MS = 2 * 60 * 60 * 1000;
const processedMessages = new Map<string, number>();

export function isDuplicateMessage(messageId: string): boolean {
  if (!messageId) return false;
  const now = Date.now();
  const seenAt = processedMessages.get(messageId);
  if (seenAt && now - seenAt < PROCESSED_TTL_MS) {
    return true;
  }
  return false;
}

export function markMessageProcessed(messageId: string): void {
  if (!messageId) return;
  const now = Date.now();
  processedMessages.set(messageId, now);

  // Evict old entries periodically
  if (processedMessages.size > 2000) {
    for (const [id, time] of processedMessages) {
      if (now - time > PROCESSED_TTL_MS) {
        processedMessages.delete(id);
      }
    }
  }
}

export function clearProcessedMessages(): void {
  processedMessages.clear();
}

/**
 * Strips access tokens and secrets from strings before logging.
 */
export function redactSecret(str: string): string {
  return str
    .replace(/(access_token=)[^&\s"]+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]")
    .replace(/EAA[A-Za-z0-9]{15,}/g, "[redacted]")
    .slice(0, 300);
}

/**
 * Evaluates the status of all four Meta channels safely without exposing secret values.
 */
export function evaluateMetaChannels(
  env: Record<string, string | undefined> = process.env,
  verificationState: ChannelVerificationState = channelVerificationStore,
): Record<MetaChannel, ChannelDiagnostic> {
  const get = (k: string) => (env[k] || "").trim();

  // 1. WhatsApp Cloud API
  const waPhoneId = get("WHATSAPP_PHONE_NUMBER_ID");
  const waToken =
    get("WHATSAPP_CLOUD_ACCESS_TOKEN") ||
    get("WHATSAPP_ACCESS_TOKEN") ||
    get("META_ACCESS_TOKEN");
  const waMissing: string[] = [];
  if (!waPhoneId) waMissing.push("WHATSAPP_PHONE_NUMBER_ID");
  if (!waToken) waMissing.push("WHATSAPP_CLOUD_ACCESS_TOKEN");

  const waVerified = Boolean(verificationState.whatsapp?.success);
  const waError = verificationState.whatsapp?.error;
  let waStatus: ChannelStatus = "needs_setup";
  if (waMissing.length === 0) {
    if (waError && !waVerified) waStatus = "blocked";
    else if (waVerified) waStatus = "verified";
    else waStatus = "configured_unverified";
  }

  // 2. Facebook Messenger
  const fbPageId = get("MESSENGER_PAGE_ID") || get("FACEBOOK_PAGE_ID");
  const fbToken =
    get("MESSENGER_PAGE_ACCESS_TOKEN") ||
    get("FACEBOOK_PAGE_ACCESS_TOKEN") ||
    get("META_ACCESS_TOKEN");
  const msgrMissing: string[] = [];
  if (!fbPageId) msgrMissing.push("FACEBOOK_PAGE_ID");
  if (!fbToken) msgrMissing.push("MESSENGER_PAGE_ACCESS_TOKEN");

  const msgrVerified = Boolean(verificationState.messenger?.success);
  const msgrError = verificationState.messenger?.error;
  let msgrStatus: ChannelStatus = "needs_setup";
  if (msgrMissing.length === 0) {
    if (msgrError && !msgrVerified) msgrStatus = "blocked";
    else if (msgrVerified) msgrStatus = "verified";
    else msgrStatus = "configured_unverified";
  }

  // 3. Instagram Direct
  const igAccountId = get("INSTAGRAM_ACCOUNT_ID");
  const igToken =
    get("INSTAGRAM_MESSAGING_ACCESS_TOKEN") ||
    get("INSTAGRAM_ACCESS_TOKEN") ||
    fbToken;
  const igMissing: string[] = [];
  if (!igAccountId) igMissing.push("INSTAGRAM_ACCOUNT_ID");
  if (!igToken) igMissing.push("INSTAGRAM_MESSAGING_ACCESS_TOKEN");

  const igVerified = Boolean(verificationState.instagram?.success);
  const igError = verificationState.instagram?.error;
  let igStatus: ChannelStatus = "needs_setup";
  if (igMissing.length === 0) {
    if (igError && !igVerified) igStatus = "blocked";
    else if (igVerified) igStatus = "verified";
    else igStatus = "configured_unverified";
  }

  // 4. Facebook Page Publishing
  const fbPageMissing: string[] = [];
  if (!get("FACEBOOK_PAGE_ID")) fbPageMissing.push("FACEBOOK_PAGE_ID");
  if (!get("FACEBOOK_PAGE_ACCESS_TOKEN")) fbPageMissing.push("FACEBOOK_PAGE_ACCESS_TOKEN");

  const fbPageVerified = Boolean(verificationState.facebook_page?.success);
  const fbPageError = verificationState.facebook_page?.error;
  let fbPageStatus: ChannelStatus = "needs_setup";
  if (fbPageMissing.length === 0) {
    if (fbPageError && !fbPageVerified) fbPageStatus = "blocked";
    else if (fbPageVerified) fbPageStatus = "verified";
    else fbPageStatus = "configured_unverified";
  }

  return {
    whatsapp: {
      channel: "whatsapp",
      status: waStatus,
      configured: waMissing.length === 0,
      missingConfig: waMissing,
      verifiedLive: waVerified,
      lastVerifiedAt: verificationState.whatsapp?.verifiedAt,
      lastErrorSummary: waError,
    },
    messenger: {
      channel: "messenger",
      status: msgrStatus,
      configured: msgrMissing.length === 0,
      missingConfig: msgrMissing,
      verifiedLive: msgrVerified,
      lastVerifiedAt: verificationState.messenger?.verifiedAt,
      lastErrorSummary: msgrError,
    },
    instagram: {
      channel: "instagram",
      status: igStatus,
      configured: igMissing.length === 0,
      missingConfig: igMissing,
      verifiedLive: igVerified,
      lastVerifiedAt: verificationState.instagram?.verifiedAt,
      lastErrorSummary: igError,
    },
    facebook_page: {
      channel: "facebook_page",
      status: fbPageStatus,
      configured: fbPageMissing.length === 0,
      missingConfig: fbPageMissing,
      verifiedLive: fbPageVerified,
      lastVerifiedAt: verificationState.facebook_page?.verifiedAt,
      lastErrorSummary: fbPageError,
    },
  };
}

/**
 * Parses and filters Meta Webhook payloads.
 * Strips out:
 * - echo events (is_echo === true)
 * - non-text message types
 * - delivery / read status receipts
 * - duplicate messages already received
 */
export function parseAndFilterMetaInbound(payload: any): InboundMetaMessage[] {
  const extracted: InboundMetaMessage[] = [];
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.entry)) {
    return extracted;
  }

  for (const entry of payload.entry) {
    // 1. Messenger or Instagram Messaging (entry.messaging)
    if (Array.isArray(entry.messaging)) {
      const isInstagram = payload.object === "instagram";
      const platform: InboundMetaMessage["platform"] = isInstagram ? "instagram" : "messenger";

      for (const item of entry.messaging) {
        // Ignore read / delivery receipts
        if (item.read || item.delivery) continue;

        const msg = item.message;
        if (!msg) continue;

        // Ignore echo messages (outgoing messages sent by the Page / Bot)
        if (msg.is_echo === true) continue;

        // Require non-empty text
        const text = typeof msg.text === "string" ? msg.text.trim() : "";
        if (!text) continue;

        const id = msg.mid || `mid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const senderId = item.sender?.id;
        if (!senderId) continue;

        // Deduplication check
        if (isDuplicateMessage(id)) {
          continue;
        }
        markMessageProcessed(id);

        extracted.push({
          id,
          platform,
          senderId,
          text,
          timestamp: typeof item.timestamp === "number" ? item.timestamp : Date.now(),
        });
      }
    }

    // 2. WhatsApp Cloud API (entry.changes[].value.messages)
    if (Array.isArray(entry.changes)) {
      for (const change of entry.changes) {
        const val = change.value;
        if (!val || typeof val !== "object") continue;

        // Ignore status updates (sent, delivered, read)
        if (Array.isArray(val.statuses) && (!val.messages || val.messages.length === 0)) {
          continue;
        }

        if (Array.isArray(val.messages)) {
          const contactMap = new Map<string, string>();
          if (Array.isArray(val.contacts)) {
            for (const c of val.contacts) {
              if (c.wa_id && c.profile?.name) {
                contactMap.set(c.wa_id, c.profile.name);
              }
            }
          }

          for (const msg of val.messages) {
            // Only process text messages
            let text = "";
            if (msg.type === "text" && msg.text?.body) {
              text = msg.text.body.trim();
            } else if (typeof msg.body === "string") {
              text = msg.body.trim();
            }

            if (!text) continue;

            const fromId = msg.from;
            if (!fromId) continue;

            const id = msg.id || `wamid_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

            // Deduplication check
            if (isDuplicateMessage(id)) {
              continue;
            }
            markMessageProcessed(id);

            extracted.push({
              id,
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

  return extracted;
}

/**
 * Validates HMAC SHA-256 signature for Meta Webhooks.
 */
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

/**
 * Formats official outbound Meta API requests.
 */
export function formatMetaOutboundPayload(
  channel: "whatsapp" | "messenger" | "instagram",
  recipientId: string,
  text: string,
): { url: string; headers: Record<string, string>; body: string } | null {
  const env = (k: string) => (process.env[k] || "").trim();
  const version = /^v\d+\.\d+$/.test(env("META_GRAPH_VERSION"))
    ? env("META_GRAPH_VERSION")
    : "v21.0";

  if (channel === "whatsapp") {
    const phoneId = env("WHATSAPP_PHONE_NUMBER_ID");
    const token =
      env("WHATSAPP_CLOUD_ACCESS_TOKEN") ||
      env("WHATSAPP_ACCESS_TOKEN") ||
      env("META_ACCESS_TOKEN");
    if (!phoneId || !token) return null;

    return {
      url: `https://graph.facebook.com/${version}/${phoneId}/messages`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipientId,
        type: "text",
        text: { body: text },
      }),
    };
  }

  if (channel === "messenger") {
    const pageToken =
      env("MESSENGER_PAGE_ACCESS_TOKEN") ||
      env("FACEBOOK_PAGE_ACCESS_TOKEN") ||
      env("META_ACCESS_TOKEN");
    if (!pageToken) return null;

    return {
      url: `https://graph.facebook.com/${version}/me/messages`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pageToken}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text },
      }),
    };
  }

  if (channel === "instagram") {
    const token =
      env("INSTAGRAM_MESSAGING_ACCESS_TOKEN") ||
      env("INSTAGRAM_ACCESS_TOKEN") ||
      env("FACEBOOK_PAGE_ACCESS_TOKEN") ||
      env("META_ACCESS_TOKEN");
    if (!token) return null;

    return {
      url: `https://graph.facebook.com/${version}/me/messages`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    };
  }

  return null;
}

/**
 * Dispatches an automated reply through the official Meta Graph API.
 * Returns { ok: true, id?: string } on success, or { ok: false, error: string } on failure.
 */
export async function dispatchMetaReply(
  channel: "whatsapp" | "messenger" | "instagram",
  recipientId: string,
  replyText: string,
  customFetch: typeof fetch = fetch,
): Promise<{ ok: boolean; id?: string | undefined; error?: string | undefined }> {
  const requestConfig = formatMetaOutboundPayload(channel, recipientId, replyText);
  if (!requestConfig) {
    return { ok: false, error: "channel_credentials_missing" };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    const res = await customFetch(requestConfig.url, {
      method: "POST",
      headers: requestConfig.headers,
      body: requestConfig.body,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      const errCode = data.error?.code;
      const errMsg = data.error?.message || `HTTP ${res.status}`;
      console.error(
        `[meta-dispatch] ${channel} reply failed: code=${errCode} msg=${redactSecret(errMsg)}`,
      );

      // Record failure in verification store
      channelVerificationStore[channel] = {
        verifiedAt: Date.now(),
        success: false,
        error: `Meta error: ${errCode || res.status} - ${errMsg.slice(0, 80)}`,
      };

      return { ok: false, error: "meta_send_failed" };
    }

    const messageId =
      data.messages?.[0]?.id || data.message_id || data.recipient_id || "sent";

    // Record verified status upon successful live transmission
    channelVerificationStore[channel] = {
      verifiedAt: Date.now(),
      success: true,
    };

    return { ok: true, id: String(messageId) };
  } catch (err) {
    const errName = (err as Error)?.name || "Error";
    console.error(`[meta-dispatch] ${channel} network failure: ${errName}`);
    return { ok: false, error: "network_error" };
  }
}
