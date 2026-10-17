import { callOfficialRpc } from "./official-backend";
import type { OfficialStaffSession } from "./official-auth";

export interface StaffMediaAsset {
  id: string;
  name: string;
  type: "image" | "video";
  category: string;
  ratio: string;
  url: string;
  createdAt: string;
  linkedContentItemIds?: string[];
  isUploaded?: boolean;
}

const MEDIA_BUCKET = "relax-fix-media";
const SIGNED_URL_SECONDS = 60 * 60;
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

function getBackendConfig() {
  const env = import.meta.env as Record<string, string | undefined>;
  return {
    url: (env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, ""),
    key: (env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || "").trim(),
  };
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function stringValue(...values: unknown[]): string {
  const value = values.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value.trim() : "";
}

function mapMediaType(
  typeValue: unknown,
  mimeValue: unknown,
  name: string,
): "image" | "video" | null {
  const type = String(typeValue ?? "").toLowerCase();
  const mime = String(mimeValue ?? "").toLowerCase();
  if (type === "video" || mime.startsWith("video/")) return "video";
  if (type === "image" || mime.startsWith("image/")) return "image";
  if (/\.(mp4|mov|webm)$/i.test(name)) return "video";
  if (/\.(png|jpe?g|webp|gif)$/i.test(name)) return "image";
  return null;
}

function safeStoragePath(value: unknown, userId: string): string | null {
  if (typeof value !== "string" || !userId || value.startsWith("/")) return null;
  const segments = value.split("/");
  if (
    segments.length < 2 ||
    segments[0] !== userId ||
    segments.some((part) => !part || part === "." || part === "..")
  ) {
    return null;
  }
  return value;
}

function storageHeaders(accessToken: string, key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function createSignedMediaUrls(
  session: OfficialStaffSession,
  paths: string[],
): Promise<Map<string, string>> {
  if (paths.length === 0) return new Map();
  const { url, key } = getBackendConfig();
  if (!url || !key) throw new Error("SUPABASE_STORAGE_NOT_CONFIGURED");

  const response = await fetch(`${url}/storage/v1/object/sign/${MEDIA_BUCKET}`, {
    method: "POST",
    headers: storageHeaders(session.accessToken, key),
    body: JSON.stringify({ expiresIn: SIGNED_URL_SECONDS, paths }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("MEDIA_SIGNED_URL_FAILED");

  const payload: unknown = await response.json().catch(() => null);
  if (!Array.isArray(payload)) throw new Error("INVALID_MEDIA_SIGNED_URL_RESPONSE");

  const result = new Map<string, string>();
  for (const item of payload) {
    const row = asRecord(item);
    if (!row) continue;
    const path = stringValue(row.path);
    const signed = stringValue(row.signedURL, row.signedUrl);
    if (!path || !signed) continue;
    const fullUrl = /^https?:\/\//i.test(signed)
      ? signed
      : `${url}/storage/v1${signed.startsWith("/") ? signed : `/${signed}`}`;
    result.set(path, fullUrl);
  }
  return result;
}

function mapMediaRow(value: unknown, userId: string) {
  const row = asRecord(value);
  if (!row) return null;
  const metadata = asRecord(row.metadata) ?? {};
  const storagePath = safeStoragePath(row.storagePath ?? row.storage_path, userId);
  const name =
    stringValue(
      metadata.originalName,
      metadata.fileName,
      metadata.filename,
      row.name,
      storagePath?.split("/").at(-1),
    ) || "Media Asset";
  const type = mapMediaType(
    row.assetType ?? row.asset_type,
    metadata.mimeType ?? metadata.mime_type,
    name,
  );
  if (!type || typeof row.id !== "string" || !row.id) return null;

  const linkedId = stringValue(row.contentItemId, row.content_item_id);
  const ratioCandidate = stringValue(metadata.ratio);
  const ratio = ["9:16", "4:5", "1:1"].includes(ratioCandidate) ? ratioCandidate : "—";
  return {
    id: row.id,
    name,
    type,
    category: stringValue(row.category) || "unclassified",
    ratio,
    url: "",
    createdAt: stringValue(row.createdAt, row.created_at) || "",
    linkedContentItemIds: linkedId ? [linkedId] : [],
    storagePath,
  };
}

export async function getStaffMediaAssets(
  session: OfficialStaffSession,
): Promise<StaffMediaAsset[]> {
  const raw = await callOfficialRpc<unknown>(
    { accessToken: session.accessToken },
    "get_staff_media_assets",
  );
  if (!Array.isArray(raw)) throw new Error("INVALID_MEDIA_ASSETS_RESPONSE");

  const mapped = raw
    .map((item) => mapMediaRow(item, session.userId))
    .filter((item): item is NonNullable<typeof item> => item !== null);
  const paths = [
    ...new Set(mapped.flatMap((item) => (item.storagePath ? [item.storagePath] : []))),
  ];
  let signedUrls = new Map<string, string>();
  try {
    signedUrls = await createSignedMediaUrls(session, paths);
  } catch {
    // Keep the authorized asset metadata visible; do not invent a public URL when signing fails.
  }

  return mapped.map(({ storagePath, ...asset }) => ({
    ...asset,
    url: storagePath ? (signedUrls.get(storagePath) ?? "") : "",
  }));
}

export async function uploadStaffMediaAsset(
  session: OfficialStaffSession,
  file: File,
  category: "brand" | "pool" | "technique" = "pool",
  ratio: "9:16" | "4:5" | "1:1" = "4:5",
): Promise<StaffMediaAsset> {
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  if (!isVideo && !isImage) throw new Error("UNSUPPORTED_MEDIA_TYPE");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("MEDIA_FILE_TOO_LARGE");
  if (!session.userId) throw new Error("STAFF_USER_ID_REQUIRED");

  const { url, key } = getBackendConfig();
  if (!url || !key) throw new Error("SUPABASE_STORAGE_NOT_CONFIGURED");

  const extension = (file.name.split(".").pop() ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 10)
    .toLowerCase();
  const objectName = `${globalThis.crypto.randomUUID()}${extension ? `.${extension}` : ""}`;
  const storagePath = `${session.userId}/${objectName}`;
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const uploadResponse = await fetch(`${url}/storage/v1/object/${MEDIA_BUCKET}/${encodedPath}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": file.type,
      "x-upsert": "false",
    },
    body: file,
    cache: "no-store",
  });
  if (!uploadResponse.ok) throw new Error("MEDIA_STORAGE_UPLOAD_FAILED");

  const registration = asRecord(
    await callOfficialRpc<unknown>(
      { accessToken: session.accessToken },
      "register_staff_media_upload",
      {
        p_asset_type: isVideo ? "video" : "image",
        p_storage_path: storagePath,
        p_metadata: {
          originalName: file.name,
          mimeType: file.type,
          requestedCategory: category,
          ratio,
        },
      },
    ),
  );
  const id = stringValue(registration?.mediaAssetId);
  if (registration?.success !== true || !id) {
    throw new Error(stringValue(registration?.code) || "MEDIA_REGISTRATION_FAILED");
  }

  let signedUrl = "";
  try {
    signedUrl = (await createSignedMediaUrls(session, [storagePath])).get(storagePath) ?? "";
  } catch {
    // The storage object and database registration succeeded; omit only the preview URL.
  }

  return {
    id,
    name: file.name,
    type: isVideo ? "video" : "image",
    category: "unclassified",
    ratio,
    url: signedUrl,
    createdAt: new Date().toISOString(),
    isUploaded: true,
  };
}

export async function linkStaffMediaToContent(
  session: OfficialStaffSession,
  mediaId: string,
  contentItemId: string,
): Promise<{ success: boolean }> {
  const result = asRecord(
    await callOfficialRpc<unknown>(
      { accessToken: session.accessToken },
      "link_staff_media_to_content_item",
      { p_content_item_id: contentItemId, p_media_asset_id: mediaId },
    ),
  );
  if (result?.success !== true) {
    throw new Error(stringValue(result?.code) || "MEDIA_LINK_REJECTED");
  }
  return { success: true };
}
