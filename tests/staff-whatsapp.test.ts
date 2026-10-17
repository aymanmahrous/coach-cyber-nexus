import { describe, expect, it, vi } from "vitest";
import {
  getStaffInbox,
  getStaffConversationMessages,
  takeOverStaffConversation,
  returnStaffConversationToAi,
  sendStaffWhatsAppMessage,
} from "../src/lib/staff-whatsapp";
import * as backend from "../src/lib/official-backend";

const session = {
  accessToken: "staff-valid-jwt",
  userId: "user-123",
  displayName: "Coach Ayman",
  role: "super_admin",
};

describe("Official WhatsApp Inbox & Staff Controls", () => {
  it("fetches and maps staff inbox conversations via RPC get_staff_inbox", async () => {
    vi.spyOn(backend, "callOfficialRpc").mockResolvedValueOnce([
      {
        id: "conv-1",
        channel: "whatsapp",
        leadName: "Fatima Al Mansoori",
        leadId: "lead-99",
        lastMessage: "استفسار عن مواعيد تدريب الأطفال في المشرف",
        updatedAt: "2026-10-16T14:00:00Z",
        mode: "ai_active",
        unread: 1,
        needsAttention: false,
      },
    ]);

    const inbox = await getStaffInbox(session);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.conversationId).toBe("conv-1");
    expect(inbox[0]?.platform).toBe("whatsapp");
    expect(inbox[0]?.senderName).toBe("Fatima Al Mansoori");
    expect(inbox[0]?.mode).toBe("ai_active");
  });

  it("fetches conversation messages via get_staff_conversation_messages RPC", async () => {
    vi.spyOn(backend, "callOfficialRpc").mockResolvedValueOnce([
      {
        id: "msg-1",
        direction: "inbound",
        text: "السلام عليكم، هل يوجد تقييم مجاني هذا الأسبوع؟",
        created_at: "2026-10-16T14:01:00Z",
      },
      {
        id: "msg-2",
        direction: "outbound",
        text: "أهلاً بك! نعم، التقييم الأولي مجاني تماماً بإشراف كابتن أيمن.",
        created_at: "2026-10-16T14:02:00Z",
      },
    ]);

    const messages = await getStaffConversationMessages(session, "conv-1");
    expect(messages).toHaveLength(2);
    expect(messages[0]?.direction).toBe("inbound");
    expect(messages[1]?.direction).toBe("outbound");
  });

  it("handles human takeover with take_over_staff_conversation RPC", async () => {
    const rpcSpy = vi.spyOn(backend, "callOfficialRpc").mockResolvedValueOnce({
      success: true,
      mode: "human_takeover",
    });

    const res = await takeOverStaffConversation(session, "conv-1");
    expect(rpcSpy).toHaveBeenCalledWith(
      { accessToken: session.accessToken },
      "take_over_staff_conversation",
      { p_conversation_id: "conv-1" },
    );
    expect(res.mode).toBe("human_takeover");
  });

  it("returns conversation to AI with return_staff_conversation_to_ai RPC", async () => {
    const rpcSpy = vi.spyOn(backend, "callOfficialRpc").mockResolvedValueOnce({
      success: true,
      mode: "ai_active",
    });

    const res = await returnStaffConversationToAi(session, "conv-1");
    expect(rpcSpy).toHaveBeenCalledWith(
      { accessToken: session.accessToken },
      "return_staff_conversation_to_ai",
      { p_conversation_id: "conv-1" },
    );
    expect(res.mode).toBe("ai_active");
  });

  it("strictly enforces dry-run on outbound messages and forbids live transmission", async () => {
    const res = await sendStaffWhatsAppMessage(session, "conv-1", "Test response");
    expect(res.dryRun).toBe(true);
    expect(res.code).toBe("DRY_RUN_ONLY_ACTIVE");
  });
});
