import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  pin: z.string().min(1).max(100),
  platform: z.enum(["facebook", "instagram"]),
  caption: z.string().min(1).max(2200),
  imageUrl: z.string().url().max(2000).optional().or(z.literal("")),
});

function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

export const Route = createFileRoute("/api/publish")({
  server: {
    handlers: {
      // Readiness check: which channels are configured (no secrets returned)
      GET: async () =>
        json({
          pin: !!process.env["OWNER_PUBLISH_PIN"],
          facebook: !!process.env["FACEBOOK_PAGE_ACCESS_TOKEN"],
          instagram: !!(process.env["INSTAGRAM_ACCESS_TOKEN"] || process.env["FACEBOOK_PAGE_ACCESS_TOKEN"]),
        }),
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "invalid_request" }, 400);
        const { pin, platform, caption, imageUrl } = parsed.data;

        const ownerPin = process.env["OWNER_PUBLISH_PIN"];
        if (!ownerPin) return json({ error: "publish_pin_not_configured" }, 503);
        if (!safeEqual(pin, ownerPin)) return json({ error: "wrong_pin" }, 401);

        const v = process.env["META_GRAPH_VERSION"] || "v21.0";
        const pageToken = process.env["FACEBOOK_PAGE_ACCESS_TOKEN"];
        const G = `https://graph.facebook.com/${v}`;

        const call = async (path: string, params: Record<string, string>, token: string) => {
          const res = await fetch(`${G}/${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ ...params, access_token: token }),
          });
          const data = (await res.json().catch(() => ({}))) as Record<string, any>;
          if (!res.ok || data["error"]) throw new Error(data["error"]?.message || `Meta error ${res.status}`);
          return data;
        };

        try {
          if (platform === "facebook") {
            if (!pageToken) return json({ error: "facebook_not_configured" }, 503);
            const pageId = process.env["FACEBOOK_PAGE_ID"] || "1164107840123575";
            const r = imageUrl
              ? await call(`${pageId}/photos`, { url: imageUrl, caption }, pageToken)
              : await call(`${pageId}/feed`, { message: caption }, pageToken);
            const id = String(r["post_id"] || r["id"]);
            return json({ ok: true, id, url: `https://www.facebook.com/${id}` });
          }

          const igToken = process.env["INSTAGRAM_ACCESS_TOKEN"] || pageToken;
          if (!igToken) return json({ error: "instagram_not_configured" }, 503);
          if (!imageUrl) return json({ error: "instagram_needs_image" }, 400);
          const igId = process.env["INSTAGRAM_ACCOUNT_ID"] || "17841439747493221";
          const container = await call(`${igId}/media`, { image_url: imageUrl, caption }, igToken);
          const pub = await call(`${igId}/media_publish`, { creation_id: String(container["id"]) }, igToken);
          return json({ ok: true, id: String(pub["id"]), url: "https://www.instagram.com/RelaxFixUAE" });
        } catch (e) {
          return json({ error: "meta_error", message: (e as Error).message }, 502);
        }
      },
    },
  },
});
