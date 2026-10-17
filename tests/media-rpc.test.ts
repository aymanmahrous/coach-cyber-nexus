import { describe, expect, it, vi } from "vitest";
import { getStaffMediaAssets, uploadStaffMediaAsset, linkStaffMediaToContent } from "../src/lib/media-rpc";
import * as backend from "../src/lib/official-backend";

const session = {
  accessToken: "staff-valid-jwt",
  userId: "user-123",
  displayName: "Coach Ayman",
  role: "super_admin",
};

describe("Staff Media Vault & Storage RPCs", () => {
  it("fetches and maps media assets via RPC get_staff_media_assets", async () => {
    vi.spyOn(backend, "callOfficialRpc").mockResolvedValueOnce([
      {
        id: "media-uuid-1",
        name: "breathing-drill-khalifa-city.mp4",
        type: "video/mp4",
        category: "technique",
        ratio: "9:16",
        url: "https://example.supabase.co/storage/v1/object/public/media-assets/drill.mp4",
        created_at: "2026-10-16T12:00:00Z",
        linked_content_item_ids: ["content-item-1"],
      },
    ]);

    const assets = await getStaffMediaAssets(session);
    expect(assets).toHaveLength(1);
    expect(assets[0]?.id).toBe("media-uuid-1");
    expect(assets[0]?.type).toBe("video");
    expect(assets[0]?.category).toBe("technique");
    expect(assets[0]?.ratio).toBe("9:16");
    expect(assets[0]?.linkedContentItemIds).toEqual(["content-item-1"]);
  });

  it("links a media asset to a content item with link_staff_media_to_content_item RPC", async () => {
    const rpcSpy = vi.spyOn(backend, "callOfficialRpc").mockResolvedValueOnce({ success: true });

    const res = await linkStaffMediaToContent(session, "media-1", "content-1");
    expect(rpcSpy).toHaveBeenCalledWith(
      { accessToken: session.accessToken },
      "link_staff_media_to_content_item",
      { p_media_id: "media-1", p_content_item_id: "content-1" },
    );
    expect(res.success).toBe(true);
  });
});
