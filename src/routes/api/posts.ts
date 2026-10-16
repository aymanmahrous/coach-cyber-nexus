import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isOwner, json, unauthorized } from "@/lib/owner-auth";
import { getStore } from "@/lib/store";

const PostSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    platform: z.enum(["facebook", "instagram", "tiktok"]),
    caption: z.string().max(5000),
    visual: z.string().max(10000),
    status: z.enum(["Needs Review", "Scheduled", "Claimed", "Published"]),
    createdAt: z.string().max(64),
  })
  .passthrough();

const UpsertBody = z.object({ posts: z.array(PostSchema).min(1).max(200) });
const PutBody = z.object({ post: PostSchema });
const IdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

const storeError = () => json({ error: "store_unavailable" }, 503);

export const Route = createFileRoute("/api/posts")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isOwner(request)) return unauthorized();
        const store = getStore();
        try {
          const rows = await store.table("posts").list(500);
          return json({ posts: rows.map((r) => r.payload), durable: store.durable });
        } catch {
          return storeError();
        }
      },

      // Bulk upsert
      POST: async ({ request }) => {
        if (!isOwner(request)) return unauthorized();
        const parsed = UpsertBody.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "invalid_request" }, 400);
        try {
          await getStore()
            .table("posts")
            .upsert(parsed.data.posts.map((p) => ({ id: p.id, payload: p })));
          return json({ ok: true });
        } catch {
          return storeError();
        }
      },

      PUT: async ({ request }) => {
        if (!isOwner(request)) return unauthorized();
        const parsed = PutBody.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "invalid_request" }, 400);
        try {
          const { post } = parsed.data;
          await getStore()
            .table("posts")
            .upsert([{ id: post.id, payload: post }]);
          return json({ ok: true });
        } catch {
          return storeError();
        }
      },

      // DELETE /api/posts?id=a&id=b
      DELETE: async ({ request }) => {
        if (!isOwner(request)) return unauthorized();
        const ids = new URL(request.url).searchParams.getAll("id");
        if (!ids.length || ids.length > 200 || !ids.every((i) => IdSchema.safeParse(i).success))
          return json({ error: "invalid_request" }, 400);
        try {
          await getStore().table("posts").remove(ids);
          return json({ ok: true });
        } catch {
          return storeError();
        }
      },
    },
  },
});
