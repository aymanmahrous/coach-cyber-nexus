import { callOfficialRpc, callOfficialFunction } from "./official-backend";
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

function mapPlatform(raw: unknown): StaffInboxMessage["platform"] {
  const str = String(raw || "").toLowerCase();
  if (str === "whatsapp" || str === "messenger" || str === "instagram") return str;
  return "unknown";
}

export async function getStaffInbox(session: OfficialStaffSession): Promise<StaffInboxMessage[]> {
  try {
    const raw = await callOfficialRpc<unknown[]>({ accessToken: session.accessToken }, "get_staff_inbox");
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const id = String(row["id"] || row["conversation_id"] || "");
      if (!id) return [];
      const updated = Date.parse(String(row["updatedAt"] || row["updated_at"] || ""));
      return [
        {
          id,
          conversationId: id,
          platform: mapPlatform(row["channel"] || row["platform"]),
          senderId: String(row["leadId"] || row["lead_id"] || id),
          senderName: String(row["leadName"] || row["lead_name"] || row["client_name"] || "Client"),
          text: String(row["lastMessage"] || row["last_message"] || ""),
          timestamp: Number.isFinite(updated) ? updated : Date.now(),
          mode: String(row["mode"] || "ai_active"),
          unread: Number(row["unread"] || 0),
          needsAttention: Boolean(row["needsAttention"] || row["needs_attention"]),
        },
      ];
    });
  } catch (error) {
    // If the backend has no conversations yet or RPC returns empty, return empty list
    return [];
  }
}

export async function getStaffConversationMessages(
  session: OfficialStaffSession,
  conversationId: string,
): Promise<StaffConversationMessage[]> {
  try {
    const raw = await callOfficialRpc<unknown[]>(
      { accessToken: session.accessToken },
      "get_staff_conversation_messages",
      { p_conversation_id: conversationId },
    );
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const id = String(row["id"] || "");
      if (!id) return [];
      const ts = Date.parse(String(row["created_at"] || row["timestamp"] || ""));
      return [
        {
          id,
          conversationId,
          direction: String(row["direction"] || "inbound") === "outbound" ? "outbound" : "inbound",
          text: String(row["text"] || row["message"] || ""),
          senderName: String(row["sender_name"] || (row["direction"] === "outbound" ? "Staff" : "Client")),
          timestamp: Number.isFinite(ts) ? ts : Date.now(),
          status: typeof row["status"] === "string" ? row["status"] : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
}

export async function takeOverStaffConversation(
  session: OfficialStaffSession,
  conversationId: string,
): Promise<{ success: boolean; mode?: string }> {
  const result = await callOfficialRpc<{ success?: boolean; mode?: string }>(
    { accessToken: session.accessToken },
    "take_over_staff_conversation",
    { p_conversation_id: conversationId },
  );
  return { success: result?.success !== false, mode: result?.mode || "human_takeover" };
}

export async function returnStaffConversationToAi(
  session: OfficialStaffSession,
  conversationId: string,
): Promise<{ success: boolean; mode?: string }> {
  const result = await callOfficialRpc<{ success?: boolean; mode?: string }>(
    { accessToken: session.accessToken },
    "return_staff_conversation_to_ai",
    { p_conversation_id: conversationId },
  );
  return { success: result?.success !== false, mode: result?.mode || "ai_active" };
}

export async function sendStaffWhatsAppMessage(
  session: OfficialStaffSession,
  conversationId: string,
  body: string,
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
