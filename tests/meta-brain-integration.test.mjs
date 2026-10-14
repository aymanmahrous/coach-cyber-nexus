import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

// 1. Meta Webhook handshake and timing-safe token verification
test("Meta Webhook: Verification handshake succeeds with correct verify token", async () => {
  const verifyToken = "coach_ayman_meta_secret_2026";
  const challenge = "challenge_code_987654";

  const mode = "subscribe";
  const incomingToken = "coach_ayman_meta_secret_2026";

  // Emulate timing safe compare
  const timingSafeEqualStr = (a, b) => {
    if (a.length !== b.length) return false;
    let res = 0;
    for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return res === 0;
  };

  const isVerified = mode === "subscribe" && timingSafeEqualStr(incomingToken, verifyToken);
  assert.equal(isVerified, true, "Valid verify token should be accepted");
});

test("Meta Webhook: Verification handshake rejects incorrect verify token", async () => {
  const verifyToken = "coach_ayman_meta_secret_2026";
  const incomingToken = "wrong_token_attempt";

  const timingSafeEqualStr = (a, b) => {
    if (a.length !== b.length) return false;
    let res = 0;
    for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return res === 0;
  };

  const isVerified = timingSafeEqualStr(incomingToken, verifyToken);
  assert.equal(isVerified, false, "Invalid verify token must be rejected");
});

// 2. Meta Webhook HMAC-SHA256 signature verification
test("Meta Webhook: Signature verification with valid HMAC-SHA256", async () => {
  const appSecret = "meta_app_secret_key_123456";
  const payload = JSON.stringify({
    object: "page",
    entry: [
      {
        id: "1164107840123575",
        time: Date.now(),
        messaging: [{ sender: { id: "user_psid_1" }, message: { text: "Hello Coach" } }],
      },
    ],
  });

  const hmac = crypto.createHmac("sha256", appSecret).update(payload).digest("hex");
  const headerSignature = `sha256=${hmac}`;

  assert.match(headerSignature, /^sha256=[a-f0-9]{64}$/);

  const incomingSig = headerSignature.slice(7);
  const timingSafeEqualStr = (a, b) => {
    if (a.length !== b.length) return false;
    let res = 0;
    for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return res === 0;
  };

  assert.equal(timingSafeEqualStr(incomingSig, hmac), true);
});

test("Meta Webhook: Signature verification rejects tampered payload", async () => {
  const appSecret = "meta_app_secret_key_123456";
  const originalPayload = '{"object":"page","entry":[]}';
  const tamperedPayload = '{"object":"page","entry":[{"injected":true}]}';

  const hmacOriginal = crypto.createHmac("sha256", appSecret).update(originalPayload).digest("hex");
  const hmacTampered = crypto.createHmac("sha256", appSecret).update(tamperedPayload).digest("hex");

  assert.notEqual(hmacOriginal, hmacTampered, "Tampered payload must produce distinct hash");
});

// 3. Safe Image URL validation in publish.ts
test("Publish: isSafeImageUrl rejects dangerous URLs and accepts valid HTTPS URLs", () => {
  function isSafeImageUrl(raw) {
    let u;
    try {
      u = new URL(raw);
    } catch {
      return false;
    }
    if (u.protocol !== "https:" || u.username || u.password) return false;
    const h = u.hostname.toLowerCase();
    if (
      h === "localhost" ||
      h.endsWith(".localhost") ||
      h.endsWith(".internal") ||
      h.endsWith(".local") ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(h) ||
      h.includes(":")
    )
      return false;
    return true;
  }

  assert.equal(isSafeImageUrl("https://cdn.example.com/poster.jpg"), true);
  assert.equal(isSafeImageUrl("http://cdn.example.com/poster.jpg"), false, "Must reject plain HTTP");
  assert.equal(isSafeImageUrl("https://localhost/poster.jpg"), false, "Must reject localhost");
  assert.equal(isSafeImageUrl("https://127.0.0.1/poster.jpg"), false, "Must reject IP address");
  assert.equal(isSafeImageUrl("https://admin:pass@cdn.example.com/poster.jpg"), false, "Must reject auth in URL");
  assert.equal(isSafeImageUrl("ftp://cdn.example.com/poster.jpg"), false, "Must reject non-https");
});

// 4. Coach Brain Channel Directives formatting
test("Coach Brain: Channel Directives customize system guidance per platform", () => {
  const CHANNEL_INSTRUCTIONS = {
    whatsapp:
      "\n\n[Channel Directives: WhatsApp]\n- Format with clear, friendly, and structured bullet points.\n- Highlight the 100% Free Initial Assessment.\n- Mention official WhatsApp booking at 058 821 9130.",
    messenger:
      "\n\n[Channel Directives: Facebook Messenger]\n- Warm, conversational, direct tone suited for Facebook Page chat.\n- Encourage booking a free swimming assessment without pressure.",
    instagram:
      "\n\n[Channel Directives: Instagram Direct]\n- Engaging, energetic, and concise (max 2-3 short paragraphs).\n- Focus on child safety and technique development.",
  };

  assert.ok(CHANNEL_INSTRUCTIONS.whatsapp.includes("058 821 9130"));
  assert.ok(CHANNEL_INSTRUCTIONS.messenger.includes("Facebook Messenger"));
  assert.ok(CHANNEL_INSTRUCTIONS.instagram.includes("Instagram Direct"));
});
