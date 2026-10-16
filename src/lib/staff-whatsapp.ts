export type StaffRole = "super_admin" | "admin" | "reception" | "coach" | "content_manager";

export interface StaffSession {
  accessToken: string;
  userId: string;
  displayName: string;
  role: StaffRole;
}

export interface StaffInboxMessage {
  id: string;
  conversationId: string;
  platform: "whatsapp" | "messenger" | "instagram" | "unknown";
  senderId: string;
  senderName?: string;
  text: string;
  timestamp: number;
  mode: string;
  unread: number;
  needsAttention: boolean;
}

const ALLOWED_ROLES = new Set<StaffRole>([
  "super_admin",
  "admin",
  "reception",
  "coach",
  "content_manager",
]);
const SEND_ROLES = new Set<StaffRole>(["super_admin", "admin", "reception", "content_manager"]);

function config() {
  const url = String(import.meta.env["VITE_SUPABASE_URL"] || "").replace(/\/$/, "");
  const anonKey = String(import.meta.env["VITE_SUPABASE_ANON_KEY"] || "");
  const profileTable = String(import.meta.env["VITE_STAFF_PROFILE_TABLE"] || "staff_profiles");
  if (!/^https:\/\/[^/]+\.supabase\.co$/.test(url) || !anonKey || !/^[A-Za-z0-9_]+$/.test(profileTable)) {
    throw new Error("SUPABASE_STAFF_CONFIG_REQUIRED");
  }
  return { url, anonKey, profileTable };
}

function authHeaders(session: StaffSession, anonKey: string) {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function profileFor(url: string, anonKey: string, profileTable: string, accessToken: string, userId: string): Promise<StaffSession> {
  const response = await fetch(
    `${url}/rest/v1/${encodeURIComponent(profileTable)}?id=eq.${encodeURIComponent(userId)}&select=display_name,role,active&limit=1`,
    { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, Accept: "application/json" }, cache: "no-store" },
  );
  if (response.status === 401) throw new Error("SESSION_EXPIRED");
  if (!response.ok) throw new Error("STAFF_PROFILE_UNAVAILABLE");
  const rows = (await response.json()) as Array<{ display_name?: string; role?: string; active?: boolean }>;
  const row = rows[0];
  if (!row?.active || !row.role || !ALLOWED_ROLES.has(row.role as StaffRole)) throw new Error("STAFF_ACCESS_DENIED");
  return { accessToken, userId, displayName: row.display_name || "Staff", role: row.role as StaffRole };
}

export async function signInStaff(email: string, password: string): Promise<StaffSession> {
  const { url, anonKey, profileTable } = config();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), password }),
  });
  if (response.status === 401 || response.status === 403) throw new Error("INVALID_LOGIN");
  if (!response.ok) throw new Error(`AUTH_FAILED_${response.status}`);
  const auth = (await response.json()) as { access_token?: string; user?: { id?: string } };
  if (!auth.access_token || !auth.user?.id) throw new Error("INVALID_AUTH_RESPONSE");
  return profileFor(url, anonKey, profileTable, auth.access_token, auth.user.id);
}

async function callRpc(session: StaffSession, name: string, body: Record<string, unknown> = {}): Promise<unknown> {
  const { url, anonKey } = config();
  const response = await fetch(`${url}/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: authHeaders(session, anonKey),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (response.status === 401) throw new Error("SESSION_EXPIRED");
  if (response.status === 403) throw new Error("STAFF_ACCESS_DENIED");
  if (!response.ok) throw new Error(`RPC_FAILED_${response.status}`);
  return response.json();
}

function platform(value: unknown): StaffInboxMessage["platform"] {
  return value === "whatsapp" || value === "messenger" || value === "instagram" ? value : "unknown";
}

export async function getStaffInbox(session: StaffSession): Promise<StaffInboxMessage[]> {
  const raw = await callRpc(session, "get_staff_inbox");
  if (!Array.isArray(raw)) throw new Error("INVALID_INBOX_RESPONSE");
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = String(row["id"] || "");
    if (!id) return [];
    const updated = Date.parse(String(row["updatedAt"] || ""));
    return [{
      id,
      conversationId: id,
      platform: platform(row["channel"]),
      senderId: String(row["leadId"] || id),
      senderName: String(row["leadName"] || "Unknown"),
      text: String(row["lastMessage"] || ""),
      timestamp: Number.isFinite(updated) ? updated : Date.now(),
      mode: String(row["mode"] || "ai_active"),
      unread: Number(row["unread"] || 0),
      needsAttention: Boolean(row["needsAttention"]),
    }];
  });
}

export async function getStaffConversationMessages(session: StaffSession, conversationId: string): Promise<unknown[]> {
  const raw = await callRpc(session, "get_staff_conversation_messages", { p_conversation_id: conversationId });
  if (!Array.isArray(raw)) throw new Error("INVALID_MESSAGES_RESPONSE");
  return raw;
}

export async function takeOverStaffConversation(session: StaffSession, conversationId: string): Promise<unknown> {
  return callRpc(session, "take_over_staff_conversation", { p_conversation_id: conversationId });
}

export async function returnStaffConversationToAi(session: StaffSession, conversationId: string): Promise<unknown> {
  return callRpc(session, "return_staff_conversation_to_ai", { p_conversation_id: conversationId });
}

export async function sendStaffWhatsAppMessage(session: StaffSession, conversationId: string, body: string): Promise<{ success: boolean; code?: string; dryRun?: boolean }> {
  if (!SEND_ROLES.has(session.role)) throw new Error("STAFF_SEND_FORBIDDEN");
  const { url, anonKey } = config();
  const response = await fetch(`${url}/functions/v1/send-whatsapp-message`, {
    method: "POST",
    headers: authHeaders(session, anonKey),
    body: JSON.stringify({ conversationId, body: body.trim(), dryRun: true }),
  });
  const result = (await response.json()) as { success?: boolean; code?: string; dryRun?: boolean };
  if (!response.ok || result.success !== true) throw new Error(result.code || `SEND_FAILED_${response.status}`);
  return {
    success: true,
    ...(result.code ? { code: result.code } : {}),
    ...(typeof result.dryRun === "boolean" ? { dryRun: result.dryRun } : {}),
  };
}

export function canSendStaffWhatsApp(session: StaffSession): boolean {
  return SEND_ROLES.has(session.role);
}
