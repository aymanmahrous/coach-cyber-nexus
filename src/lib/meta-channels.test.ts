import { describe, expect, it, beforeEach } from "vitest";
import {
  evaluateMetaChannels,
  parseAndFilterMetaInbound,
  verifyMetaSignature,
  formatMetaOutboundPayload,
  dispatchMetaReply,
  isDuplicateMessage,
  markMessageProcessed,
  clearProcessedMessages,
  redactSecret,
  type ChannelVerificationState,
} from "./meta-channels";
import { timingSafeEqualStr, verifyOwnerPin, clearPinFailures } from "./security";
import {
  handleMetaWebhookGet,
  handleMetaWebhookPost,
  clearInboundBuffer,
} from "../routes/api/meta-webhook";

describe("Security Utilities (Owner PIN & Timing-Safe)", () => {
  beforeEach(() => {
    clearPinFailures();
  });

  it("timingSafeEqualStr matches equal strings and rejects unequal strings", () => {
    expect(timingSafeEqualStr("secret-1234", "secret-1234")).toBe(true);
    expect(timingSafeEqualStr("secret-1234", "secret-5678")).toBe(false);
    expect(timingSafeEqualStr("secret-1234", "secret-123")).toBe(false);
  });

  it("verifyOwnerPin enforces min 8 characters and returns 503 if unconfigured", () => {
    expect(verifyOwnerPin("any-pin-val", undefined).status).toBe(503);
    expect(verifyOwnerPin("any-pin-val", "short").status).toBe(503);
  });

  it("verifyOwnerPin returns 401 on incorrect PIN", () => {
    const res = verifyOwnerPin("wrong-pass", "valid-owner-pin-1234");
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
  });

  it("verifyOwnerPin returns 200 on matching PIN", () => {
    const res = verifyOwnerPin("valid-owner-pin-1234", "valid-owner-pin-1234");
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  it("verifyOwnerPin locks out after 5 consecutive failures", () => {
    const clientIp = "192.168.1.100";
    for (let i = 0; i < 5; i++) {
      verifyOwnerPin("wrong-pass", "valid-owner-pin-1234", clientIp);
    }
    const locked = verifyOwnerPin("wrong-pass", "valid-owner-pin-1234", clientIp);
    expect(locked.status).toBe(429);
    expect(locked.error).toBe("too_many_failed_attempts");
  });
});

describe("Meta Channels Status Diagnostics (Safe & Honest)", () => {
  it("reports needs_setup when credentials are empty", () => {
    const status = evaluateMetaChannels({}, {});
    expect(status.whatsapp.status).toBe("needs_setup");
    expect(status.whatsapp.configured).toBe(false);
    expect(status.messenger.status).toBe("needs_setup");
    expect(status.instagram.status).toBe("needs_setup");
    expect(status.facebook_page.status).toBe("needs_setup");
  });

  it("reports configured_unverified when keys exist but live test hasn't run", () => {
    const env = {
      WHATSAPP_PHONE_NUMBER_ID: "1000123",
      WHATSAPP_CLOUD_ACCESS_TOKEN: "EAA_test_token_123",
      FACEBOOK_PAGE_ID: "1164107840123575",
      MESSENGER_PAGE_ACCESS_TOKEN: "EAA_fb_token_123",
      INSTAGRAM_ACCOUNT_ID: "17841439747493221",
      INSTAGRAM_MESSAGING_ACCESS_TOKEN: "EAA_ig_token_123",
      FACEBOOK_PAGE_ACCESS_TOKEN: "EAA_page_publish_token",
    };
    const status = evaluateMetaChannels(env, {});
    expect(status.whatsapp.status).toBe("configured_unverified");
    expect(status.whatsapp.configured).toBe(true);
    expect(status.whatsapp.verifiedLive).toBe(false);

    expect(status.messenger.status).toBe("configured_unverified");
    expect(status.instagram.status).toBe("configured_unverified");
    expect(status.facebook_page.status).toBe("configured_unverified");
  });

  it("reports verified ONLY after documented successful live call", () => {
    const env = {
      WHATSAPP_PHONE_NUMBER_ID: "1000123",
      WHATSAPP_CLOUD_ACCESS_TOKEN: "EAA_test_token_123",
    };
    const vStore: ChannelVerificationState = {
      whatsapp: { verifiedAt: Date.now(), success: true },
    };
    const status = evaluateMetaChannels(env, vStore);
    expect(status.whatsapp.status).toBe("verified");
    expect(status.whatsapp.verifiedLive).toBe(true);
  });

  it("reports blocked when live test returned permission/revocation error", () => {
    const env = {
      WHATSAPP_PHONE_NUMBER_ID: "1000123",
      WHATSAPP_CLOUD_ACCESS_TOKEN: "EAA_test_token_123",
    };
    const vStore: ChannelVerificationState = {
      whatsapp: { verifiedAt: Date.now(), success: false, error: "Meta error 190 - Token revoked" },
    };
    const status = evaluateMetaChannels(env, vStore);
    expect(status.whatsapp.status).toBe("blocked");
    expect(status.whatsapp.lastErrorSummary).toContain("Token revoked");
  });

  it("redactSecret scrubs tokens from error messages", () => {
    const raw = "Error calling graph.facebook.com?access_token=EAAB1234567890abcdef and Bearer EAAX999";
    const scrubbed = redactSecret(raw);
    expect(scrubbed).not.toContain("EAAB1234567890abcdef");
    expect(scrubbed).not.toContain("EAAX999");
    expect(scrubbed).toContain("[redacted]");
  });
});

describe("Meta HMAC SHA-256 Webhook Signatures", () => {
  const secret = "test_meta_app_secret_12345";
  const body = JSON.stringify({ object: "page", entry: [] });

  it("validates correct HMAC signature", async () => {
    // Generate valid signature using crypto.subtle
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const buf = await crypto.subtle.sign("HMAC", key, enc.encode(body));
    const hex = Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const isValid = await verifyMetaSignature(body, `sha256=${hex}`, secret);
    expect(isValid).toBe(true);
  });

  it("rejects tampered body or invalid signature", async () => {
    const isValid = await verifyMetaSignature(
      body,
      "sha256=0000000000000000000000000000000000000000000000000000000000000000",
      secret,
    );
    expect(isValid).toBe(false);
  });

  it("rejects signature missing sha256= prefix", async () => {
    const isValid = await verifyMetaSignature(body, "invalid_sig", secret);
    expect(isValid).toBe(false);
  });
});

describe("Inbound Webhook Parsing, Echo Filtering & Deduplication", () => {
  beforeEach(() => {
    clearProcessedMessages();
  });

  it("parses WhatsApp inbound text and filters echo/status", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "1000",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "1000123" },
                contacts: [{ profile: { name: "Ahmed" }, wa_id: "971500000001" }],
                messages: [
                  {
                    from: "971500000001",
                    id: "wamid_123456",
                    timestamp: "1710000000",
                    text: { body: "السلام عليكم، كم سعر حصص الأطفال؟" },
                    type: "text",
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const parsed = parseAndFilterMetaInbound(payload);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.platform).toBe("whatsapp");
    expect(parsed[0]?.senderId).toBe("971500000001");
    expect(parsed[0]?.senderName).toBe("Ahmed");
    expect(parsed[0]?.text).toContain("سعر حصص الأطفال");
  });

  it("parses Messenger inbound text and filters echo and deliveries", () => {
    const payload = {
      object: "page",
      entry: [
        {
          id: "1164107840123575",
          time: 1710000000,
          messaging: [
            // Outbound echo message sent by the bot -> MUST BE IGNORED
            {
              sender: { id: "1164107840123575" },
              recipient: { id: "client_999" },
              message: { mid: "mid_echo_1", is_echo: true, text: "Bot reply" },
            },
            // Delivery receipt -> MUST BE IGNORED
            {
              delivery: { mids: ["mid_echo_1"] },
            },
            // Actual client message
            {
              sender: { id: "client_999" },
              recipient: { id: "1164107840123575" },
              message: { mid: "mid_client_msg_1", text: "أرغب بحجز تقييم مجاني" },
            },
          ],
        },
      ],
    };

    const parsed = parseAndFilterMetaInbound(payload);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.platform).toBe("messenger");
    expect(parsed[0]?.senderId).toBe("client_999");
    expect(parsed[0]?.text).toBe("أرغب بحجز تقييم مجاني");
  });

  it("deduplicates inbound messages on retry", () => {
    const payload = {
      object: "instagram",
      entry: [
        {
          id: "17841439747493221",
          messaging: [
            {
              sender: { id: "ig_user_1" },
              recipient: { id: "17841439747493221" },
              message: { mid: "mid_duplicate_test", text: "استفسار عن فرع الفلاح" },
            },
          ],
        },
      ],
    };

    const firstRun = parseAndFilterMetaInbound(payload);
    expect(firstRun).toHaveLength(1);

    // Meta retries delivery with the same mid
    const secondRun = parseAndFilterMetaInbound(payload);
    expect(secondRun).toHaveLength(0);
  });
});

describe("Official Outbound Dispatchers", () => {
  it("formats WhatsApp Cloud API payload correctly", () => {
    process.env["WHATSAPP_PHONE_NUMBER_ID"] = "1000123";
    process.env["WHATSAPP_CLOUD_ACCESS_TOKEN"] = "token_wa_test";
    process.env["META_GRAPH_VERSION"] = "v21.0";

    const payload = formatMetaOutboundPayload("whatsapp", "971500000001", "أهلاً بك كابتن");
    expect(payload).not.toBeNull();
    expect(payload?.url).toBe("https://graph.facebook.com/v21.0/1000123/messages");
    expect(payload?.headers["Authorization"]).toBe("Bearer token_wa_test");

    const body = JSON.parse(payload!.body);
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("971500000001");
    expect(body.text.body).toBe("أهلاً بك كابتن");
  });

  it("formats Messenger payload correctly", () => {
    process.env["MESSENGER_PAGE_ACCESS_TOKEN"] = "token_msgr_test";
    process.env["META_GRAPH_VERSION"] = "v21.0";

    const payload = formatMetaOutboundPayload("messenger", "client_123", "مرحباً بك");
    expect(payload).not.toBeNull();
    expect(payload?.url).toBe("https://graph.facebook.com/v21.0/me/messages");
    const body = JSON.parse(payload!.body);
    expect(body.recipient.id).toBe("client_123");
    expect(body.message.text).toBe("مرحباً بك");
  });

  it("dispatches reply and records verification on success", async () => {
    process.env["WHATSAPP_PHONE_NUMBER_ID"] = "1000123";
    process.env["WHATSAPP_CLOUD_ACCESS_TOKEN"] = "token_wa_test";
    process.env["WHATSAPP_SEND_DRY_RUN"] = "false";

    const mockFetch = (async () => {
      return new Response(JSON.stringify({ messages: [{ id: "wamid_sent_999" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as any;

    const res = await dispatchMetaReply("whatsapp", "971500000001", "تم الإرسال بنجاح", mockFetch);
    expect(res.ok).toBe(true);
    expect(res.id).toBe("wamid_sent_999");
  });

  it("keeps WhatsApp dispatch in dry-run by default and does not call Meta", async () => {
    process.env["WHATSAPP_PHONE_NUMBER_ID"] = "1000123";
    process.env["WHATSAPP_CLOUD_ACCESS_TOKEN"] = "token_wa_test";
    delete process.env["WHATSAPP_SEND_DRY_RUN"];
    let called = false;
    const mockFetch = (async () => {
      called = true;
      return new Response(JSON.stringify({ messages: [{ id: "should_not_send" }] }), { status: 200 });
    }) as any;

    const res = await dispatchMetaReply("whatsapp", "971500000001", "رسالة اختبار آمنة", mockFetch);
    expect(res).toEqual({ ok: true, id: "dry-run", dryRun: true });
    expect(called).toBe(false);
  });
});

describe("GET /api/meta-webhook Handshake & Protected Inbox", () => {
  beforeEach(() => {
    clearInboundBuffer();
    clearPinFailures();
    process.env["OWNER_PUBLISH_PIN"] = "secure-owner-pin-8888";
    process.env["META_WEBHOOK_VERIFY_TOKEN"] = "my_custom_verify_token_999";
    process.env["META_WEBHOOK_INGRESS_MODE"] = "standalone";
  });

  it("keeps the prepared endpoint disabled while n8n owns production ingress", async () => {
    process.env["META_WEBHOOK_INGRESS_MODE"] = "n8n";
    const req = new Request(
      "https://example.com/api/meta-webhook?hub.mode=subscribe&hub.verify_token=my_custom_verify_token_999&hub.challenge=challenge_123456",
    );
    const res = await handleMetaWebhookGet(req);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("n8n_is_authoritative");
    process.env["META_WEBHOOK_INGRESS_MODE"] = "standalone";
  });

  it("completes Meta Webhook Handshake on matching verify token", async () => {
    const req = new Request(
      "https://example.com/api/meta-webhook?hub.mode=subscribe&hub.verify_token=my_custom_verify_token_999&hub.challenge=challenge_123456",
    );
    const res = await handleMetaWebhookGet(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("challenge_123456");
  });

  it("rejects Meta Webhook Handshake if verify token is wrong", async () => {
    const req = new Request(
      "https://example.com/api/meta-webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=challenge_123456",
    );
    const res = await handleMetaWebhookGet(req);
    expect(res.status).toBe(403);
  });

  it("rejects Owner PIN passed inside query string (strictly enforces header)", async () => {
    const req = new Request(
      "https://example.com/api/meta-webhook?action=inbox&pin=secure-owner-pin-8888",
    );
    const res = await handleMetaWebhookGet(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("pin_in_query_forbidden");
  });

  it("rejects unauthorized access without Owner PIN in headers", async () => {
    const req = new Request("https://example.com/api/meta-webhook?action=inbox");
    const res = await handleMetaWebhookGet(req);
    expect(res.status).toBe(401);
  });

  it("authorizes inbox access when Owner PIN provided in x-owner-pin header", async () => {
    const req = new Request("https://example.com/api/meta-webhook?action=inbox", {
      headers: { "x-owner-pin": "secure-owner-pin-8888" },
    });
    const res = await handleMetaWebhookGet(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.durable).toBe(false);
    expect(data.storage).toBe("ephemeral_memory");
  });

  it("authorizes inbox access when Owner PIN provided in Authorization: Bearer", async () => {
    const req = new Request("https://example.com/api/meta-webhook?action=inbox", {
      headers: { authorization: "Bearer secure-owner-pin-8888" },
    });
    const res = await handleMetaWebhookGet(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
