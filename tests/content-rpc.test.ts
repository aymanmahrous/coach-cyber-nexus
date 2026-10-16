import { describe, expect, it, vi } from "vitest";
import {
  approveAndScheduleStaffContentItem,
  ContentRpcError,
  transitionStaffContentItem,
  updateStaffContentItem,
} from "../src/lib/content-rpc";

const session = { accessToken: "staff-jwt" };
const contentItemId = "123e4567-e89b-42d3-a456-426614174000";

describe("official staff content RPC adapter", () => {
  it("sends controlled edits only through update_staff_content_item", async () => {
    const rpc = vi.fn().mockResolvedValue({ success: true, contentItemId, status: "needs_review" });
    await updateStaffContentItem(
      session,
      contentItemId,
      {
        topic: "Breathing",
        hook: "Start gently",
        caption: "A concise caption",
        cta: "Ask for an assessment",
        hashtags: ["swimming", "coaching"],
        visualPrompt: "Navy and aqua, vertical format",
      },
      rpc,
    );

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith(session, "update_staff_content_item", {
      p_content_item_id: contentItemId,
      p_topic: "Breathing",
      p_hook: "Start gently",
      p_caption: "A concise caption",
      p_cta: "Ask for an assessment",
      p_hashtags: ["swimming", "coaching"],
      p_visual_prompt: "Navy and aqua, vertical format",
    });
  });

  it("uses the allowlisted transition RPC payload", async () => {
    const rpc = vi.fn().mockResolvedValue({ success: true, contentItemId, status: "approved" });
    await transitionStaffContentItem(session, contentItemId, "approve", null, rpc);
    expect(rpc).toHaveBeenCalledWith(session, "transition_staff_content_item", {
      p_content_item_id: contentItemId,
      p_action: "approve",
      p_scheduled_for: null,
    });
  });

  it("keeps atomic approve-and-schedule in a separate explicit RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      success: true,
      contentItemId,
      status: "scheduled",
      scheduledFor: "2026-10-18T10:00:00Z",
      publishJobId: "123e4567-e89b-42d3-a456-426614174001",
    });
    await approveAndScheduleStaffContentItem(session, contentItemId, "2026-10-18T10:00:00Z", rpc);
    expect(rpc).toHaveBeenCalledWith(session, "approve_and_schedule_staff_content_item", {
      p_content_item_id: contentItemId,
      p_scheduled_for: "2026-10-18T10:00:00Z",
    });
  });

  it("rejects malformed IDs/actions/timestamps before making any RPC call", async () => {
    const rpc = vi.fn();
    await expect(
      transitionStaffContentItem(session, "not-a-uuid", "approve", null, rpc),
    ).rejects.toThrow();
    await expect(
      transitionStaffContentItem(session, contentItemId, "publish" as never, null, rpc),
    ).rejects.toThrow();
    await expect(
      approveAndScheduleStaffContentItem(session, contentItemId, "tomorrow", rpc),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces backend RPC rejections instead of mutating local state", async () => {
    const rpc = vi.fn().mockResolvedValue({ success: false, code: "APPROVAL_REQUIRED" });
    await expect(
      transitionStaffContentItem(session, contentItemId, "schedule", "2026-10-18T10:00:00Z", rpc),
    ).rejects.toEqual(new ContentRpcError("APPROVAL_REQUIRED"));
  });
});
