import { callOfficialRpc } from "./official-backend";
import type { OfficialStaffSession } from "./official-auth";

export interface StaffMediaAsset {
  id: string;
  name: string;
  type: "image" | "video";
  category: "brand" | "pool" | "technique";
  ratio: "9:16" | "4:5" | "1:1";
  url: string;
  createdAt: string;
  linkedContentItemIds?: string[];
  isUploaded?: boolean;
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_KEY = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();

function mapMediaType(typeStr: unknown, name: string): "image" | "video" {
  const str = String(typeStr || "").toLowerCase();
  if (str.includes("video") || /\.(mp4|mov|webm)$/i.test(name)) return "video";
  return "image";
}

function mapRatio(ratioStr: unknown): "9:16" | "4:5" | "1:1" {
  const str = String(ratioStr || "").toLowerCase();
  if (str === "9:16" || str === "vertical") return "9:16";
  if (str === "4:5" || str === "portrait") return "4:5";
  return "1:1";
}

function mapCategory(catStr: unknown): "brand" | "pool" | "technique" {
  const str = String(catStr || "").toLowerCase();
  if (str === "brand") return "brand";
  if (str === "technique") return "technique";
  return "pool";
}

export async function getStaffMediaAssets(
  session: OfficialStaffSession,
): Promise<StaffMediaAsset[]> {
  try {
    const raw = await callOfficialRpc<unknown[]>(
      { accessToken: session.accessToken },
      "get_staff_media_assets",
    );
    if (Array.isArray(raw)) {
      return raw.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Record<string, unknown>;
        const id = String(row["id"] || "");
        if (!id) return [];
        const name = String(row["name"] || row["file_name"] || "Media Asset");
        return [
          {
            id,
            name,
            type: mapMediaType(row["type"] || row["mime_type"], name),
            category: mapCategory(row["category"]),
            ratio: mapRatio(row["ratio"]),
            url: String(row["url"] || row["public_url"] || ""),
            createdAt: String(row["created_at"] || new Date().toISOString()),
            linkedContentItemIds: Array.isArray(row["linked_content_item_ids"])
              ? row["linked_content_item_ids"].map(String)
              : [],
          },
        ];
      });
    }
  } catch {
    // If RPC does not exist yet, fallback to REST table select
  }

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/media_assets?select=*&order=created_at.desc`, {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${session.accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      });
      if (res.ok) {
        const rows = (await res.json()) as Array<Record<string, unknown>>;
        if (Array.isArray(rows)) {
          return rows.map((row) => {
            const id = String(row["id"] || "");
            const name = String(row["name"] || row["file_name"] || "Media Asset");
            return {
              id,
              name,
              type: mapMediaType(row["type"] || row["mime_type"], name),
              category: mapCategory(row["category"]),
              ratio: mapRatio(row["ratio"]),
              url: String(row["url"] || row["public_url"] || ""),
              createdAt: String(row["created_at"] || new Date().toISOString()),
            };
          });
        }
      }
    } catch {
      // Return empty array
    }
  }

  return [];
}

export async function uploadStaffMediaAsset(
  session: OfficialStaffSession,
  file: File,
  category: "brand" | "pool" | "technique" = "pool",
  ratio: "9:16" | "4:5" | "1:1" = "4:5",
): Promise<StaffMediaAsset> {
  const ext = file.name.split(".").pop() || "bin";
  const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const isVideo = file.type.startsWith("video/");

  let publicUrl = "";

  if (SUPABASE_URL && SUPABASE_KEY) {
    // Upload object to storage bucket
    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/media-assets/${uniqueName}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });

    if (uploadRes.ok) {
      publicUrl = `${SUPABASE_URL}/storage/v1/object/public/media-assets/${uniqueName}`;
    }
  }

  if (!publicUrl) {
    publicUrl = URL.createObjectURL(file);
  }

  // Register in DB via RPC or REST insert
  let registeredId = `media-${Date.now()}`;
  try {
    const regResult = await callOfficialRpc<{ id?: string }>(
      { accessToken: session.accessToken },
      "register_staff_media_upload",
      {
        p_name: file.name,
        p_url: publicUrl,
        p_type: isVideo ? "video" : "image",
        p_category: category,
        p_ratio: ratio,
      },
    );
    if (regResult?.id) registeredId = regResult.id;
  } catch {
    // Insert fallback via REST
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/media_assets`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${session.accessToken}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            name: file.name,
            url: publicUrl,
            type: isVideo ? "video" : "image",
            category,
            ratio,
          }),
        });
        if (insertRes.ok) {
          const inserted = (await insertRes.json()) as Array<{ id?: string }>;
          if (inserted[0]?.id) registeredId = inserted[0].id;
        }
      } catch {
        // Local representation used
      }
    }
  }

  return {
    id: registeredId,
    name: file.name,
    type: isVideo ? "video" : "image",
    category,
    ratio,
    url: publicUrl,
    createdAt: new Date().toISOString(),
    isUploaded: true,
  };
}

export async function linkStaffMediaToContent(
  session: OfficialStaffSession,
  mediaId: string,
  contentItemId: string,
): Promise<{ success: boolean }> {
  return callOfficialRpc<{ success: boolean }>(
    { accessToken: session.accessToken },
    "link_staff_media_to_content_item",
    { p_media_id: mediaId, p_content_item_id: contentItemId },
  );
}
