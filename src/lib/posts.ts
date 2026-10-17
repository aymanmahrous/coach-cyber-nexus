import { useEffect, useState } from "react";
import { z } from "zod";
import { callOfficialRpc } from "./official-backend";
import type { OfficialStaffSession } from "./official-auth";

export type Platform = "facebook" | "instagram" | "tiktok";
export type PostStatus = "Needs Review" | "Scheduled" | "Claimed" | "Published";
export type Post = {
  id: string;
  platform: Platform;
  caption: string;
  visual: string;
  status: PostStatus;
  scheduledAt?: string;
  createdAt: string;
  templateType?: "drill" | "carousel" | "transformation" | "branch_promo" | "quiz";
  publishedExternalId?: string;
  publishedExternalUrl?: string;
};

type JsonRecord = Record<string, unknown>;
const ContentItemSchema = z
  .object({
    id: z.string().uuid(),
    platform: z.string(),
    caption: z.string().default(""),
    visualPrompt: z.string().default(""),
    status: z.string(),
    scheduledFor: z.string().nullable().optional(),
    plannedFor: z.string().nullable().optional(),
    createdAt: z.string(),
    contentType: z.string().nullable().optional(),
    receipts: z.array(z.record(z.unknown())).optional(),
  })
  .passthrough();

function mapPlatform(value: string): Platform {
  const normalized = value.toLowerCase();
  return normalized === "facebook" || normalized === "instagram" || normalized === "tiktok"
    ? normalized
    : "instagram";
}

function mapStatus(value: string): PostStatus {
  switch (value.toLowerCase()) {
    case "scheduled":
      return "Scheduled";
    case "published":
      return "Published";
    case "approved":
    case "claimed":
      return "Claimed";
    default:
      return "Needs Review";
  }
}

function mapTemplate(value: string | null | undefined): Post["templateType"] {
  const allowed = new Set<Post["templateType"]>([
    "drill",
    "carousel",
    "transformation",
    "branch_promo",
    "quiz",
  ]);
  return value && allowed.has(value as Post["templateType"])
    ? (value as Post["templateType"])
    : undefined;
}

function receiptLink(receipts: JsonRecord[] | undefined, platform: string) {
  const receipt = receipts?.find(
    (item) =>
      String(item.platform ?? "").toLowerCase() === platform.toLowerCase() &&
      item.status === "published",
  );
  const externalId =
    typeof receipt?.externalPostId === "string" ? receipt.externalPostId : undefined;
  if (!externalId) return {};
  if (platform.toLowerCase() === "instagram") {
    return {
      publishedExternalId: externalId,
      publishedExternalUrl: `https://www.instagram.com/p/${externalId}/`,
    };
  }
  return {
    publishedExternalId: externalId,
    publishedExternalUrl: `https://www.facebook.com/${externalId}`,
  };
}

function mapContentItem(value: unknown): Post | null {
  const parsed = ContentItemSchema.safeParse(value);
  if (!parsed.success) return null;
  const item = parsed.data;
  const platform = mapPlatform(item.platform);
  return {
    id: item.id,
    platform,
    caption: item.caption,
    visual: item.visualPrompt,
    status: mapStatus(item.status),
    ...(item.scheduledFor || item.plannedFor
      ? { scheduledAt: item.scheduledFor ?? item.plannedFor ?? undefined }
      : {}),
    createdAt: item.createdAt,
    templateType: mapTemplate(item.contentType),
    ...receiptLink(item.receipts, platform),
  };
}

export function usePosts(session: OfficialStaffSession) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { accessToken, userId } = session;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    callOfficialRpc<unknown[]>({ accessToken }, "get_staff_content_items", {}, controller.signal)
      .then((payload) => {
        if (!Array.isArray(payload)) throw new Error("INVALID_CONTENT_RESPONSE");
        setPosts(payload.map(mapContentItem).filter((item): item is Post => item !== null));
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setPosts([]);
        setError(cause instanceof Error ? cause.message : "CONTENT_LOAD_FAILED");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [accessToken, userId]);

  // Kept temporarily so the existing factory remains render-compatible. It only
  // updates this in-memory view; Supabase remains the source of truth for reads.
  const save = (next: Post[]) => setPosts(next);
  return { posts, save, loading, error };
}
