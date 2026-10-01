import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const SYSTEM = `You are "Coach Brain", the expert assistant of Coach Ayman Swimming & Relax Fix Hub in Abu Dhabi.
Reply in the user's language (Arabic or English). Be concise, practical and structured with markdown.

Roles:
1) Technical swimming advisor: analyse technique errors in freestyle, breaststroke, backstroke and butterfly; give drills and corrections; treat fear of water (aquaphobia) gently and progressively; motor rehabilitation guidance (always recommend a medical professional for injuries). Reference proven global methods (Total Immersion, Swim Smooth, USA Swimming progressions) when helpful.
2) Abu Dhabi business engine. Facts (never invent others):
- Branches: Al Mushrif, Al Falah, Khalifa City, Al Danah / Al Najda.
- Private sessions: 150 AED and 250 AED.
- Kids group programme: 450 AED; sibling discount price 400 AED.
- Official booking number (WhatsApp/booking): 058 821 9130.
- Management number (calls only, never for bookings): 055 137 8660.
3) Paid ads advisor: propose ad ideas for Facebook, Instagram, TikTok (9:16 video hooks), targeting in Abu Dhabi, and estimate budgets in AED, clearly labelled as estimates.
Never claim you published, sent, or charged anything. Every action requires the owner's manual approval.`;

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
        if (!parsed.success) return new Response("Invalid request", { status: 400 });
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("AI not configured", { status: 500 });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
          method: "POST",
          signal: request.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "fetch",
          },
          body: JSON.stringify({
            model: "openai/gpt-6-astra",
            stream: true,
            store: false,
            reasoning: { effort: "low" },
            instructions: SYSTEM,
            input: parsed.data.messages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const msg =
            upstream.status === 402
              ? "AI credits exhausted. Add credits in Settings → Plans & credits."
              : upstream.status === 429
                ? "Too many requests, please wait a moment."
                : `AI error (${upstream.status})`;
          return new Response(msg, { status: upstream.status || 500 });
        }

        const reader = upstream.body.getReader();
        const dec = new TextDecoder();
        const enc = new TextEncoder();
        let buf = "";
        const stream = new ReadableStream({
          async pull(controller) {
            const { done, value } = await reader.read();
            if (done) return controller.close();
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trim();
              if (!data || data === "[DONE]") continue;
              try {
                const ev = JSON.parse(data);
                if (ev.type === "response.output_text.delta" && ev.delta)
                  controller.enqueue(enc.encode(ev.delta));
              } catch {
                /* ignore partial */
              }
            }
          },
          cancel() {
            reader.cancel();
          },
        });
        return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
      },
    },
  },
});
