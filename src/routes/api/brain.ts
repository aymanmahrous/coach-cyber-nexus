import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { generateCoachBrainResponse } from "@/lib/coach-brain";

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
});

export const Route = createFileRoute("/api/brain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request payload", { status: 400 });

        const messages = parsed.data.messages;
        const reply = await generateCoachBrainResponse(messages, undefined, request.signal);
        if (reply) {
          return new Response(reply, {
            headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
          });
        }

        const anyProvider = Boolean(
          process.env["GEMINI_API_KEY"] ||
            process.env["GOOGLE_API_KEY"] ||
            process.env["OPENAI_API_KEY"] ||
            process.env["LOVABLE_API_KEY"],
        );
        return new Response(
          anyProvider
            ? "Coach Brain is temporarily unavailable: the AI providers did not return an answer. Please try again shortly."
            : "Coach Brain is not configured: no AI provider is available.",
          {
            status: anyProvider ? 503 : 500,
            headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
          },
        );
      },
    },
  },
});
