import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getStaffMediaAssets,
  uploadStaffMediaAsset,
  linkStaffMediaToContent,
} from "../src/lib/media-rpc";
import * as backend from "../src/lib/official-backend";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const session = {
  accessToken: "staff-valid-jwt",
  userId,
  displayName: "Coach Ayman",
  role: "super_admin",
};

function configureBackend() {
  vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Staff Media Vault & Storage RPCs", () => {
  it("maps the deployed media JSON keys and signs only owner-scoped storage paths", async () => {
    configureBackend();
    const storagePath = `${userId}/drill.mp4`;
    const foreignStoragePath = "523e4567-e89b-42d3-a456-426614174000/other.png";
    vi.spyOn(backend, "callOfficialRpc").mockResolvedValueOnce([
      {
        id: "223e4567-e89b-42d3-a456-426614174000",
        assetType: "video",
        source: "upload",
        storagePath,
        metadata: { originalName: "breathing-drill.mp4", mimeType: "video/mp4", ratio: "9:16" },
        category: "unclassified",
        contentItemId: "323e4567-e89b-42d3-a456-426614174000",
        createdAt: "2026-10-16T12:00:00Z",
      },
      {
        id: "623e4567-e89b-42d3-a456-426614174000",
        assetType: "image",
        storagePath: foreignStoragePath,
        metadata: { originalName: "other.png", mimeType: "image/png" },
        category: "unclassified",
        createdAt: "2026-10-16T12:01:00Z",
      },
    ]);
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            path: storagePath,
            signedURL: `/object/sign/relax-fix-media/${storagePath}?token=short-lived`,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const assets = await getStaffMediaAssets(session);
    expect(assets).toHaveLength(2);
    expect(assets[0]).toMatchObject({
      id: "223e4567-e89b-42d3-a456-426614174000",
      name: "breathing-drill.mp4",
      type: "video",
      category: "unclassified",
      ratio: "9:16",
      linkedContentItemIds: ["323e4567-e89b-42d3-a456-426614174000"],
      createdAt: "2026-10-16T12:00:00Z",
    });
    expect(assets[0]?.url).toBe(
      `https://project.supabase.co/storage/v1/object/sign/relax-fix-media/${storagePath}?token=short-lived`,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://project.supabase.co/storage/v1/object/sign/relax-fix-media",
      expect.objectContaining({ method: "POST" }),
    );
    const signedRequest = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(signedRequest?.body)).paths).toEqual([storagePath]);
    expect(assets[1]?.url).toBe("");
  });

  it("uploads to the owner folder and registers using the deployed RPC arguments", async () => {
    configureBackend();
    const assetId = "423e4567-e89b-42d3-a456-426614174000";
    const rpcSpy = vi
      .spyOn(backend, "callOfficialRpc")
      .mockResolvedValueOnce({ success: true, mediaAssetId: assetId, category: "unclassified" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["image-bytes"], "pool-photo.jpg", { type: "image/jpeg" });

    const asset = await uploadStaffMediaAsset(session, file, "pool", "4:5");
    expect(asset).toMatchObject({
      id: assetId,
      name: "pool-photo.jpg",
      type: "image",
      category: "unclassified",
      ratio: "4:5",
      isUploaded: true,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/project\.supabase\.co\/storage\/v1\/object\/relax-fix-media\/[0-9a-f-]+\//,
    );
    expect(rpcSpy).toHaveBeenCalledWith(
      { accessToken: session.accessToken },
      "register_staff_media_upload",
      expect.objectContaining({
        p_asset_type: "image",
        p_storage_path: expect.stringMatching(new RegExp(`^${userId}/`)),
        p_metadata: expect.objectContaining({
          originalName: "pool-photo.jpg",
          mimeType: "image/jpeg",
          requestedCategory: "pool",
          ratio: "4:5",
        }),
      }),
    );
  });

  it("does not call registration or report success when the Storage upload fails", async () => {
    configureBackend();
    const rpcSpy = vi.spyOn(backend, "callOfficialRpc");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 403 })));
    const file = new File(["image-bytes"], "pool-photo.jpg", { type: "image/jpeg" });

    await expect(uploadStaffMediaAsset(session, file)).rejects.toThrow(
      "MEDIA_STORAGE_UPLOAD_FAILED",
    );
    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it("links using the live p_media_asset_id name and refuses a rejected link", async () => {
    const rpcSpy = vi.spyOn(backend, "callOfficialRpc").mockResolvedValueOnce({ success: true });
    const result = await linkStaffMediaToContent(
      session,
      "523e4567-e89b-42d3-a456-426614174000",
      "623e4567-e89b-42d3-a456-426614174000",
    );
    expect(rpcSpy).toHaveBeenCalledWith(
      { accessToken: session.accessToken },
      "link_staff_media_to_content_item",
      {
        p_content_item_id: "623e4567-e89b-42d3-a456-426614174000",
        p_media_asset_id: "523e4567-e89b-42d3-a456-426614174000",
      },
    );
    expect(result.success).toBe(true);

    vi.spyOn(backend, "callOfficialRpc").mockResolvedValueOnce({
      success: false,
      code: "MEDIA_ASSET_NOT_PUBLISHABLE",
    });
    await expect(
      linkStaffMediaToContent(
        session,
        "523e4567-e89b-42d3-a456-426614174000",
        "623e4567-e89b-42d3-a456-426614174000",
      ),
    ).rejects.toThrow("MEDIA_ASSET_NOT_PUBLISHABLE");
  });
});
