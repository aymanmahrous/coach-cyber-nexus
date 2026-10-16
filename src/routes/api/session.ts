import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  checkPin,
  createSessionValue,
  isOwner,
  json,
  pinConfigState,
  sessionCookieHeader,
} from "@/lib/owner-auth";
import { getStore } from "@/lib/store";

const Body = z.object({ pin: z.string().min(1).max(128) });

export const Route = createFileRoute("/api/session")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        json({
          owner: isOwner(request),
          ownerPin: pinConfigState(),
          durableStore: getStore().durable,
        }),

      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "invalid_request" }, 400);
        const result = await checkPin(request, parsed.data.pin).catch(() => "store_unavailable");
        if (result !== "ok") {
          const status = result === "wrong_pin" ? 401 : result === "too_many_attempts" ? 429 : 503;
          return json({ error: result }, status);
        }
        const res = json({ ok: true });
        res.headers.append("Set-Cookie", sessionCookieHeader(request, createSessionValue()));
        return res;
      },

      DELETE: async ({ request }) => {
        const res = json({ ok: true });
        res.headers.append("Set-Cookie", sessionCookieHeader(request, null));
        return res;
      },
    },
  },
});
