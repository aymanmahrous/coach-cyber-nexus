import { callOfficialRpc } from "./official-backend";
import type { OfficialStaffSession } from "./official-auth";

export interface StaffInboxMessage {
  id: string;
  conversationId: string;
  platform: "whatsapp" | "messenger" | "instagram" | "unknown";
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
  mode: "ai_active" | "human_takeover" | string;
  unread: number;
  needsAttention: boolean;
}

export interface StaffConversationMessage {
  id: string;
  conversationId: string;
  direction: "inbound" | "outbound";
  text: string;
  senderName: string;
  timestamp: number;
  status?: string;
}

const ALLOWED_SEND_ROLES = new Set(["super_admin", "admin", "reception", "coach"]);

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function mapPlatform(raw: unknown): StaffInboxMessage["platform"] {
  const str = String(raw || "").toLowerCase();
  if (str === "whatsapp" || str === "messenger" || str === "instagram") return str;
  return "unknown";
}

function messageTime(...values: unknown[]): number {
  const raw = values.find((value) => typeof value === "string" && value);
  const timestamp = typeof raw === "string" ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function requireRpcSuccess(
  result: unknown,
  fallbackCode: string,
): { success?: boolean; mode?: string; code?: string } {
  const row = asRecord(result);
  if (row?.success !== true) {
    const code = typeof row?.code === "string" ? row.code : fallbackCode;
    throw new Error(code);
  }
  return row as { success?: boolean; mode?: string; code?: string };
}

export async function getStaffInbox(session: OfficialStaffSession): Promise<StaffInboxMessage[]> {
  const raw = await callOfficialRpc<unknown[]>(
    { accessToken: session.accessToken },
    "get_staff_inbox",
  );
  if (!Array.isArray(raw)) throw new Error("INVALID_STAFF_INBOX_RESPONSE");
  return raw.flatMap((item) => {
    const row = asRecord(item);
    if (!row) return [];
    const id = String(row.id || "");
    if (!id) return [];
    return [
      {
        id,
        conversationId: id,
        platform: mapPlatform(row.channel),
        senderId: String(row.leadId || ""),
        senderName: String(row.leadName || "Client"),
        text: String(row.lastMessage || ""),
        timestamp: messageTime(row.updatedAt),
        mode: String(row.mode || "ai_active"),
        unread: Number(row.unread || 0),
        needsAttention: Boolean(row.needsAttention),
      },
    ];
  });
}

export async function getStaffConversationMessages(
  session: OfficialStaffSession,
  conversationId: string,
): Promise<StaffConversationMessage[]> {
  const raw = await callOfficialRpc<unknown[]>(
    { accessToken: session.accessToken },
    "get_staff_conversation_messages",
    { p_conversation_id: conversationId },
  );
  if (!Array.isArray(raw)) throw new Error("INVALID_CONVERSATION_MESSAGES_RESPONSE");
  return raw.flatMap((item) => {
    const row = asRecord(item);
    const id = typeof row?.id === "string" ? row.id : "";
    if (!row || !id) return [];
    const direction = row.direction === "outbound" ? "outbound" : "inbound";
    const authorType = String(row.authorType || "").toLowerCase();
    const senderName =
      authorType === "staff" || authorType === "human"
        ? "Staff"
        : authorType === "ai" || authorType === "ai_draft"
          ? "AI"
          : direction === "outbound"
            ? "Staff"
            : "Client";
    return [
      {
        id,
        conversationId: String(row.conversationId || conversationId),
        direction,
        text: String(row.body || ""),
        senderName,
        timestamp: messageTime(row.createdAt),
      },
    ];
  });
}

export async function takeOverStaffConversation(
  session: OfficialStaffSession,
  conversationId: string,
): Promise<{ success: boolean; mode?: string }> {
  const result = requireRpcSuccess(
    await callOfficialRpc<unknown>(
      { accessToken: session.accessToken },
      "take_over_staff_conversation",
      { p_conversation_id: conversationId },
    ),
    "CONVERSATION_TAKEOVER_REJECTED",
  );
  return { success: true, mode: result.mode || "human_takeover" };
}

export async function returnStaffConversationToAi(
  session: OfficialStaffSession,
  conversationId: string,
): Promise<{ success: boolean; mode?: string }> {
  const result = requireRpcSuccess(
    await callOfficialRpc<unknown>(
      { accessToken: session.accessToken },
      "return_staff_conversation_to_ai",
      { p_conversation_id: conversationId },
    ),
    "CONVERSATION_RETURN_REJECTED",
  );
  return { success: true, mode: result.mode || "ai_active" };
}

export async function sendStaffWhatsAppMessage(
  session: OfficialStaffSession,
  _conversationId: string,
  _body: string,
): Promise<{ success: boolean; dryRun: boolean; code?: string }> {
  if (!ALLOWED_SEND_ROLES.has(session.role)) {
    throw new Error("STAFF_SEND_FORBIDDEN");
  }
  // Safety rule: strictly dry-run only. Never send live external WhatsApp messages!
  return {
    success: true,
    dryRun: true,
    code: "DRY_RUN_ONLY_ACTIVE",
  };
}
