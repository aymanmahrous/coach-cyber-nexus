import { timingSafeEqualStr, getClientIp } from "../../lib/security.ts";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Owner-approved publishing to Meta (Facebook Page / Instagram Business).
 *
 * Known limits (no durable store in this project yet):
 * - Duplicate protection is best-effort: an in-memory key set per worker
 *   instance plus the client marking the post Published. It is NOT a
 *   guaranteed idempotency mechanism across instances/restarts.
 * - PIN guessing protection: enforced minimum PIN length, a fixed delay on
 *   every failed attempt, and a best-effort per-client in-memory limiter.
 *   A durable rate limiter needs persistent storage (next phase).
 */

const MIN_PIN_LENGTH = 8;
const FAIL_DELAY_MS = 1200;
const MAX_FAILS = 5;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

const failures = new Map<string, { count: number; first: number }>();
const recentPublishes = new Map<string, number>();

function isSafeImageUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".local") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(h) ||
    h.includes(":")
  )
    return false;
  return true;
}

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

function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function clientKey(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

function readConfig() {
  const env = (k: string) => (process.env[k] || "").trim();
  const fbToken = env("FACEBOOK_PAGE_ACCESS_TOKEN");
  const fbPage = env("FACEBOOK_PAGE_ID");
  const igToken = env("INSTAGRAM_ACCESS_TOKEN");
  const igAccount = env("INSTAGRAM_ACCOUNT_ID");
  const webhookToken = env("META_WEBHOOK_VERIFY_TOKEN");
  const pin = env("OWNER_PUBLISH_PIN");
  const version = /^v\d+\.\d+$/.test(env("META_GRAPH_VERSION"))
    ? env("META_GRAPH_VERSION")
    : "v21.0";
  return {
    pin,
    pinValid: pin.length >= MIN_PIN_LENGTH,
    version,
    facebook: fbToken && fbPage ? { token: fbToken, id: fbPage } : null,
    instagram: igToken && igAccount ? { token: igToken, id: igAccount } : null,
    webhook: Boolean(webhookToken && env("META_APP_SECRET")),
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
          ownerPin: c.pin ? (c.pinValid ? "configured" : "too_short") : "not_configured",
          facebook: st(!!c.facebook),
          instagram: st(!!c.instagram),
          webhook: st(c.webhook),
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

        if (!c.pin) return json({ error: "publish_pin_not_configured" }, 503);
        if (!c.pinValid) return json({ error: "publish_pin_too_weak" }, 503);

        // Best-effort lockout (per worker instance) + fixed delay on failure.
        const who = getClientIp(request);
        const now = Date.now();
        const f = failures.get(who);
        if (f && now - f.first < FAIL_WINDOW_MS && f.count >= MAX_FAILS) {
          await sleep(FAIL_DELAY_MS);
          return json({ error: "too_many_attempts" }, 429);
        }
        if (!timingSafeEqualStr(pin, c.pin)) {
          const next =
            f && now - f.first < FAIL_WINDOW_MS
              ? { count: f.count + 1, first: f.first }
              : { count: 1, first: now };
          failures.set(who, next);
          await sleep(FAIL_DELAY_MS);
          return json({ error: "wrong_pin" }, 401);
        }
        failures.delete(who);

        const target = platform === "facebook" ? c.facebook : c.instagram;
        if (!target) return json({ error: `${platform}_not_configured` }, 503);

        if (platform === "instagram" && !imageUrl)
          return json({ error: "instagram_needs_image" }, 400);

        // Best-effort duplicate guard (not durable).
        for (const [k, t] of recentPublishes)
          if (now - t > DEDUPE_TTL_MS) recentPublishes.delete(k);
        const dedupeKey = idempotencyKey ? `${platform}:${idempotencyKey}` : null;
        if (dedupeKey && recentPublishes.has(dedupeKey))
          return json({ error: "duplicate_request" }, 409);
        if (dedupeKey) recentPublishes.set(dedupeKey, now);

        const G = `https://graph.facebook.com/${c.version}`;
        const call = async (path: string, params: Record<string, string>) => {
          const res = await fetch(`${G}/${path}`, {
            method: "POST",
            signal: AbortSignal.timeout(15_000),
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ ...params, access_token: target.token }),
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
            return json({ ok: true, id, url: id ? `https://www.facebook.com/${id}` : null });
          }
          const container = await call(`${target.id}/media`, { image_url: imageUrl, caption });
          const pub = await call(`${target.id}/media_publish`, {
            creation_id: String(container["id"]),
          });
          return json({ ok: true, id: String(pub["id"] || ""), url: null });
        } catch (e) {
          if (dedupeKey) recentPublishes.delete(dedupeKey); // allow a deliberate retry after a failure
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
