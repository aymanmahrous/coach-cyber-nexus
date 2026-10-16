import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");
const adapter = read("../src/lib/staff-whatsapp.ts");
const component = read("../src/components/WhatsAppHub.tsx");
const ingress = read("../src/routes/api/meta-webhook.ts");
const channels = read("../src/lib/meta-channels.ts");

test("Staff access uses Supabase Auth and browser-safe anon configuration only", () => {
  assert.match(adapter, /auth\/v1\/token\?grant_type=password/);
  assert.match(adapter, /VITE_SUPABASE_ANON_KEY/);
  assert.match(adapter, /Authorization: `Bearer \$\{session\.accessToken\}`/);
  assert.doesNotMatch(adapter, /SERVICE_ROLE|SUPABASE_SERVICE_ROLE|OWNER_PUBLISH_PIN|owner-pin/);
  assert.doesNotMatch(component, /owner-pin|x-owner-pin|OWNER_PUBLISH_PIN/);
});

test("Inbox reads, message history, takeover, and AI return use existing Staff RPCs", () => {
  for (const rpc of [
    "get_staff_inbox",
    "get_staff_conversation_messages",
    "take_over_staff_conversation",
    "return_staff_conversation_to_ai",
  ]) assert.ok(adapter.includes(rpc), `missing RPC ${rpc}`);
  assert.match(component, /getStaffConversationMessages/);
  assert.match(component, /handleTakeover/);
  assert.match(component, /handleReturnToAi/);
});

test("Outbound reply path is role-gated and reports dry-run status", () => {
  assert.match(adapter, /SEND_ROLES/);
  assert.match(adapter, /functions\/v1\/send-whatsapp-message/);
  assert.match(adapter, /dryRun: true/);
  assert.match(adapter, /dryRun/);
  assert.match(component, /canSendStaffWhatsApp/);
  assert.match(component, /Send via existing function \(dry-run\)/);
});

test("n8n remains authoritative and Meta ingress filters duplicate events", () => {
  assert.match(ingress, /META_WEBHOOK_INGRESS_MODE[\s\S]{0,100}n8n/);
  assert.match(ingress, /n8n_is_authoritative/);
  assert.match(channels, /isDuplicateMessage/);
  assert.match(channels, /markMessageProcessed/);
});
