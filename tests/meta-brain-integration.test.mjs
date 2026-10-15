import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  handleMetaWebhookGet,
  handleMetaWebhookPost,
  parseMetaInboundEvents,
  verifyMetaSignature,
  inboundMessageBuffer,
  clearInboundBuffer,
} from "../src/routes/api/meta-webhook.ts";
import {
  handleBrainPost,
  checkBrainRateLimit,
  clearRateLimitMap,
} from "../src/routes/api/brain.ts";

function signPayload(body, secret) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body, "utf8");
  return `sha256=${hmac.digest("hex")}`;
}

test("1. Meta Webhook Handshake (GET) - Valid & Invalid tokens", async () => {
  process.env.META_WEBHOOK_VERIFY_TOKEN = "test_super_secret_token_123";

  // Valid Handshake
  const validReq = new Request(
    "https://example.com/api/meta-webhook?hub.mode=subscribe&hub.verify_token=test_super_secret_token_123&hub.challenge=CHALLENGE_ACCEPTED_789",
  );
  const validRes = await handleMetaWebhookGet(validReq);
  assert.equal(validRes.status, 200);
  assert.equal(await validRes.text(), "CHALLENGE_ACCEPTED_789");

  // Invalid Token Handshake
  const invalidReq = new Request(
    "https://example.com/api/meta-webhook?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=FAIL_ME",
  );
  const invalidRes = await handleMetaWebhookGet(invalidReq);
  assert.equal(invalidRes.status, 403);

  // Missing Mode
  const missingModeReq = new Request(
    "https://example.com/api/meta-webhook?hub.verify_token=test_super_secret_token_123&hub.challenge=FAIL_ME",
  );
  const missingModeRes = await handleMetaWebhookGet(missingModeReq);
  assert.equal(missingModeRes.status, 403);
});

test("2. Meta Webhook In-Memory Inbox Query (?action=inbox)", async () => {
  clearInboundBuffer();
  const req = new Request("https://example.com/api/meta-webhook?action=inbox");
  const res = await handleMetaWebhookGet(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(data.storage, "ephemeral_memory");
  assert.equal(data.durable, false);
  assert.equal(Array.isArray(data.messages), true);
});

test("3. Meta Webhook POST - Fail-Closed when META_APP_SECRET is missing", async () => {
  const originalSecret = process.env.META_APP_SECRET;
  delete process.env.META_APP_SECRET;

  const req = new Request("https://example.com/api/meta-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": "sha256=fake",
    },
    body: JSON.stringify({ object: "page", entry: [] }),
  });

  const res = await handleMetaWebhookPost(req);
  assert.equal(res.status, 500, "Must fail-closed with 500 if META_APP_SECRET is not configured");
  const data = await res.json();
  assert.match(data.error, /META_APP_SECRET is required/);

  process.env.META_APP_SECRET = originalSecret || "test_app_secret_abc";
});

test("4. Meta Webhook POST - Signature Validation (Valid, Invalid, Missing)", async () => {
  const secret = "my_meta_app_secret_999";
  process.env.META_APP_SECRET = secret;

  const payloadStr = JSON.stringify({
    object: "page",
    entry: [
      {
        id: "1164107840123575",
        time: 1728000000,
        messaging: [
          {
            sender: { id: "cust_123" },
            recipient: { id: "page_456" },
            timestamp: 1728000000,
            message: { mid: "mid_001", text: "مرحباً، أريد الاستفسار عن حجز السباحة" },
          },
        ],
      },
    ],
  });

  // 4a. Missing signature
  const missingSigReq = new Request("https://example.com/api/meta-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payloadStr,
  });
  const missingSigRes = await handleMetaWebhookPost(missingSigReq);
  assert.equal(missingSigRes.status, 403);

  // 4b. Invalid / Forged signature
  const invalidSigReq = new Request("https://example.com/api/meta-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": "sha256=0000000000000000000000000000000000000000000000000000000000000000",
    },
    body: payloadStr,
  });
  const invalidSigRes = await handleMetaWebhookPost(invalidSigReq);
  assert.equal(invalidSigRes.status, 403);

  // 4c. Valid signature
  clearInboundBuffer();
  const validSig = signPayload(payloadStr, secret);
  const validSigReq = new Request("https://example.com/api/meta-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": validSig,
    },
    body: payloadStr,
  });
  const validSigRes = await handleMetaWebhookPost(validSigReq);
  assert.equal(validSigRes.status, 200);
  assert.equal(await validSigRes.text(), "EVENT_RECEIVED");

  // Verify message was extracted and buffered in memory
  assert.equal(inboundMessageBuffer.length, 1);
  assert.equal(inboundMessageBuffer[0].senderId, "cust_123");
  assert.equal(inboundMessageBuffer[0].platform, "messenger");
  assert.equal(inboundMessageBuffer[0].text, "مرحباً، أريد الاستفسار عن حجز السباحة");
});

test("5. Meta Webhook POST - Invalid JSON body returns 400", async () => {
  const secret = "my_meta_app_secret_999";
  process.env.META_APP_SECRET = secret;

  const raw = "not a valid json string {";
  const sig = signPayload(raw, secret);

  const req = new Request("https://example.com/api/meta-webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": sig,
    },
    body: raw,
  });

  const res = await handleMetaWebhookPost(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /Invalid JSON/);
});

test("6. Inbound Event Parser (parseMetaInboundEvents) - WhatsApp Cloud API format", () => {
  const waPayload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID_777",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: { display_phone_number: "971588219130", phone_number_id: "PNID_888" },
              contacts: [{ profile: { name: "أحمد بن سالم" }, wa_id: "971509998888" }],
              messages: [
                {
                  from: "971509998888",
                  id: "wamid.HBgLM",
                  timestamp: "1728000100",
                  text: { body: "كم سعر مجموعات الأطفال في فرع المشرف؟" },
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

  const parsed = parseMetaInboundEvents(waPayload);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].platform, "whatsapp");
  assert.equal(parsed[0].senderId, "971509998888");
  assert.equal(parsed[0].senderName, "أحمد بن سالم");
  assert.equal(parsed[0].text, "كم سعر مجموعات الأطفال في فرع المشرف؟");
});

test("7. Coach Brain (/api/brain) - Security, CSRF Guard & Rate Limiting", async () => {
  clearRateLimitMap();

  // 7a. CSRF Guard: Cross-site request rejected
  const crossSiteReq = new Request("https://example.com/api/brain", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "sec-fetch-site": "cross-site",
    },
    body: JSON.stringify({ messages: [{ role: "user", content: "hello" }] }),
  });
  const crossSiteRes = await handleBrainPost(crossSiteReq);
  assert.equal(crossSiteRes.status, 403);

  // 7b. Invalid Payload (empty messages)
  const emptyReq = new Request("https://example.com/api/brain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [] }),
  });
  const emptyRes = await handleBrainPost(emptyReq);
  assert.equal(emptyRes.status, 400);

  // 7c. Excessive token length guard (>15,000 chars)
  const hugeReq = new Request("https://example.com/api/brain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "A".repeat(3500) }, { role: "user", content: "B".repeat(3500) }, { role: "user", content: "C".repeat(3500) }, { role: "user", content: "D".repeat(3500) }, { role: "user", content: "E".repeat(3500) }],
    }),
  });
  const hugeRes = await handleBrainPost(hugeReq);
  assert.equal(hugeRes.status, 400);

  // 7d. Rate Limiting enforcement
  const testIp = "192.168.1.100";
  let allowed = 0;
  for (let i = 0; i < 25; i++) {
    const res = checkBrainRateLimit(testIp);
    if (res.allowed) allowed++;
  }
  assert.equal(allowed, 20, "Rate limit must allow exactly 20 requests per minute per IP");
  assert.equal(checkBrainRateLimit(testIp).allowed, false);

  // 7e. No provider configured returns honest 500 error (never fake generated reply)
  const originalGemini = process.env.GEMINI_API_KEY;
  const originalGoogle = process.env.GOOGLE_API_KEY;
  const originalOpenAI = process.env.OPENAI_API_KEY;
  const originalLovable = process.env.LOVABLE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.LOVABLE_API_KEY;

  const validReq = new Request("https://example.com/api/brain", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "مرحبا" }] }),
  });
  const validRes = await handleBrainPost(validReq);
  assert.equal(validRes.status, 500);
  assert.match(await validRes.text(), /Coach Brain is not configured: no AI provider is available/);

  // Restore keys
  if (originalGemini) process.env.GEMINI_API_KEY = originalGemini;
  if (originalGoogle) process.env.GOOGLE_API_KEY = originalGoogle;
  if (originalOpenAI) process.env.OPENAI_API_KEY = originalOpenAI;
  if (originalLovable) process.env.LOVABLE_API_KEY = originalLovable;
});
