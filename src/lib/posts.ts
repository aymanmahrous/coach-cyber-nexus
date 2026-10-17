import { useEffect, useState, useCallback } from "react";
import { z } from "zod";
import { callOfficialRpc } from "./official-backend";
import { updateStaffContentItem } from "./content-rpc";
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
  isLocalDraft?: boolean;
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

const STORAGE_KEY_PREFIX = "official_staff_content_cache_";

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

export function mapContentItem(value: unknown): Post | null {
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

export function loadStoredPosts(userId: string): Post[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function persistStoredPosts(userId: string, posts: Post[]): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(posts));
  } catch {
    // Storage quota or private mode resilience
  }
}

export function usePosts(session: OfficialStaffSession) {
  const { accessToken, userId } = session;
  const [posts, setPosts] = useState<Post[]>(() => loadStoredPosts(userId));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    callOfficialRpc<unknown[]>({ accessToken }, "get_staff_content_items", {}, controller.signal)
      .then((payload) => {
        if (!Array.isArray(payload)) throw new Error("INVALID_CONTENT_RESPONSE");
        const remotePosts = payload.map(mapContentItem).filter((item): item is Post => item !== null);
        
        // Merge remote posts with locally persisted modifications/drafts
        const stored = loadStoredPosts(userId);
        const remoteIds = new Set(remotePosts.map((p) => p.id));
        const localOnly = stored.filter((p) => !remoteIds.has(p.id));
        
        // Apply any local edits to remote items if local copy is newer
        const merged = [
          ...localOnly,
          ...remotePosts.map((r) => {
            const local = stored.find((s) => s.id === r.id);
            return local ? { ...r, ...local } : r;
          }),
        ];

        setPosts(merged);
        persistStoredPosts(userId, merged);
      })
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        // On error or offline, fallback to persisted local posts
        const cached = loadStoredPosts(userId);
        setPosts(cached);
        setError(cause instanceof Error ? cause.message : "CONTENT_LOAD_FAILED");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [accessToken, userId]);

  // Saves to React state AND durable local storage so content survives reloads
  const save = useCallback(
    (next: Post[]) => {
      setPosts(next);
      persistStoredPosts(userId, next);
    },
    [userId],
  );

  // Updates a specific post and dispatches RPC if it's a valid remote UUID
  const updatePost = useCallback(
    async (id: string, patch: Partial<Post>) => {
      const updated = posts.map((p) => (p.id === id ? { ...p, ...patch } : p));
      save(updated);

      const target = updated.find((p) => p.id === id);
      if (target && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        try {
          await updateStaffContentItem({ accessToken }, id, {
            topic: target.caption.slice(0, 100),
            hook: target.caption.slice(0, 120),
            caption: target.caption,
            cta: "Inquire via WhatsApp",
            hashtags: [],
            visualPrompt: target.visual,
          });
        } catch {
          // RPC failure does not discard the local edit; it remains preserved in local storage
        }
      }
    },
    [accessToken, posts, save],
  );

  return { posts, save, updatePost, loading, error };
}
