import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isSafeImageUrl, withTimeout } from "@/lib/integration-guards";
import { checkPin, json, pinConfigState } from "@/lib/owner-auth";
import { getStore } from "@/lib/store";

/**
 * Owner-approved publishing to Meta (Facebook Page / Instagram Business).
 *
 * - PIN attempts are limited by an atomic counter in the shared store
 *   (durable when Supabase is configured; per-instance memory otherwise).
 * - Duplicate protection: `platform:idempotencyKey` is claimed atomically in
 *   the store for 24h before calling Meta.
 */

const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

const META_TIMEOUT_MS = 20_000;

const Body = z.object({
  pin: z.string().min(1).max(128),
  platform: z.enum(["facebook", "instagram"]),
  caption: z.string().trim().min(1).max(2200),
  imageUrl: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .default("")
    .refine((v) => v === "" || isSafeImageUrl(v), { message: "invalid_image_url" }),
  idempotencyKey: z
    .string()
    .regex(/^[A-Za-z0-9_-]{4,64}$/)
    .optional(),
});

function readConfig() {
  const env = (k: string) => (process.env[k] || "").trim();
  const fbToken = env("FACEBOOK_PAGE_ACCESS_TOKEN");
  const fbPage = env("FACEBOOK_PAGE_ID");
  const igToken = env("INSTAGRAM_ACCESS_TOKEN");
  const igAccount = env("INSTAGRAM_ACCOUNT_ID");
  const version = /^v\d+\.\d+$/.test(env("META_GRAPH_VERSION"))
    ? env("META_GRAPH_VERSION")
    : "v21.0";
  return {
    version,
    facebook: fbToken && fbPage ? { token: fbToken, id: fbPage } : null,
    instagram: igToken && igAccount ? { token: igToken, id: igAccount } : null,
  };
}

/** Strip anything token-like before logging. */
function redact(s: string) {
  return s
    .replace(/(access_token=)[^&\s"]+/gi, "$1[redacted]")
    .replace(/EAA[A-Za-z0-9]{10,}/g, "[redacted]")
    .slice(0, 300);
}

class MetaError extends Error {
  constructor(
    public status: number,
    public metaCode?: number,
  ) {
    super("meta_error");
  }
}

export const Route = createFileRoute("/api/publish")({
  server: {
    handlers: {
      // Configuration status only — never claims a live/verified connection.
      GET: async () => {
        const c = readConfig();
        const st = (ok: boolean) => (ok ? "configured_unverified" : "not_configured");
        return json({
          ownerPin: pinConfigState(),
          durableStore: getStore().durable,
          facebook: st(!!c.facebook),
          instagram: st(!!c.instagram),
        });
      },

      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          const imageIssue = parsed.error.issues.some((i) => i.message === "invalid_image_url");
          return json({ error: imageIssue ? "invalid_image_url" : "invalid_request" }, 400);
        }
        const { pin, platform, caption, imageUrl, idempotencyKey } = parsed.data;
        const c = readConfig();

        const store = getStore();
        let pinResult;
        try {
          pinResult = await checkPin(request, pin, { store });
        } catch {
          return json({ error: "store_unavailable" }, 503);
        }
        if (pinResult !== "ok") {
          const status =
            pinResult === "wrong_pin" ? 401 : pinResult === "too_many_attempts" ? 429 : 503;
          return json({ error: pinResult }, status);
        }

        const target = platform === "facebook" ? c.facebook : c.instagram;
        if (!target) return json({ error: `${platform}_not_configured` }, 503);
        if (platform === "instagram" && !imageUrl)
          return json({ error: "instagram_needs_image" }, 400);

        const dedupeKey = idempotencyKey ? `publish:${platform}:${idempotencyKey}` : null;
        if (dedupeKey) {
          let claimed: boolean;
          try {
            claimed = await store.claim(dedupeKey, { state: "pending" }, DEDUPE_TTL_MS);
          } catch {
            return json({ error: "store_unavailable" }, 503);
          }
          if (!claimed) return json({ error: "duplicate_request" }, 409);
        }
        const releaseKey = () => (dedupeKey ? store.delete(dedupeKey).catch(() => {}) : undefined);

        const G = `https://graph.facebook.com/${c.version}`;
        const call = async (path: string, params: Record<string, string>) => {
          const res = await fetch(`${G}/${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ ...params, access_token: target.token }),
            signal: withTimeout(META_TIMEOUT_MS),
          });
          const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
            error?: { code?: number; type?: string; message?: string };
          };
          if (!res.ok || data.error) {
            console.error(
              `[publish] Meta ${platform} ${path.split("/")[1]} failed status=${res.status} code=${data.error?.code ?? "-"} type=${data.error?.type ?? "-"} msg=${redact(String(data.error?.message ?? ""))}`,
            );
            throw new MetaError(res.status, data.error?.code);
          }
          return data;
        };

        try {
          if (platform === "facebook") {
            const r = imageUrl
              ? await call(`${target.id}/photos`, { url: imageUrl, caption })
              : await call(`${target.id}/feed`, { message: caption });
            const id = String(r["post_id"] || r["id"] || "");
            if (dedupeKey)
              await store.set(dedupeKey, { state: "done", id }, DEDUPE_TTL_MS).catch(() => {});
            return json({ ok: true, id, url: id ? `https://www.facebook.com/${id}` : null });
          }
          const container = await call(`${target.id}/media`, { image_url: imageUrl, caption });
          const pub = await call(`${target.id}/media_publish`, {
            creation_id: String(container["id"]),
          });
          const igId = String(pub["id"] || "");
          if (dedupeKey)
            await store.set(dedupeKey, { state: "done", id: igId }, DEDUPE_TTL_MS).catch(() => {});
          return json({ ok: true, id: igId, url: null });
        } catch (e) {
          // On timeout Meta may still have published: keep the dedupe key so an
          // immediate retry cannot double-post. Other failures allow a deliberate retry.
          const timedOut = (e as Error)?.name === "TimeoutError";
          if (!timedOut) await releaseKey();
          if (e instanceof MetaError) {
            const authProblem =
              e.status === 401 || e.metaCode === 190 || e.metaCode === 10 || e.metaCode === 200;
            return json({ error: authProblem ? "meta_auth_failed" : "meta_publish_failed" }, 502);
          }
          console.error(
            `[publish] unexpected ${platform} error: ${redact(String((e as Error)?.name || "Error"))}`,
          );
          return json({ error: "meta_publish_failed" }, 502);
        }
      },
    },
  },
});
