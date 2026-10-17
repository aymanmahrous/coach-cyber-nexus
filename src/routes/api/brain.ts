import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withTimeout } from "@/lib/integration-guards";

const PROVIDER_TIMEOUT_MS = 30_000;
const GATEWAY_TIMEOUT_MS = 60_000;
const SUPABASE_URL = (process.env["VITE_SUPABASE_URL"] || "").trim().replace(/\/$/, "");
const SUPABASE_KEY = (
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  process.env["VITE_SUPABASE_ANON_KEY"] ||
  ""
).trim();
const STAFF_TABLE = (process.env["VITE_STAFF_PROFILE_TABLE"] || "staff_profiles").trim();

const SYSTEM = `You are "Coach Brain", the expert AI advisor, head swimming coach, and operating sales engine for Coach Ayman Swimming & Relax Fix Hub in Abu Dhabi.
Reply in the user's language (Arabic by default, or English if asked). Be concise, practical, authoritative, and structured with markdown.

Core Identity & Knowledge:
1) Technical Swimming & Aquaphobia Mastery:
   - Deep expertise in freestyle, breaststroke, backstroke, and butterfly.
   - Gentle, progressive treatment for fear of water (aquaphobia) for children and adults.
   - Motor rehabilitation swimming guidance (advise consulting doctors for severe clinical injuries).
   - Proven methods referenced: Total Immersion, Swim Smooth, USA Swimming fundamentals.
2) Client Psychology & Sales Inquiries (Strict Academy Methodology):
   - When a parent asks about fear of water (رهبة الماء) or child training:
     a) Reassure & Empathize First: Water fear is completely natural and common. Reassure the parent that Coach Ayman is a specialist in gentle, stress-free psychological acclimation.
     b) Present the 2 Available Options:
        * Private Training (VIP / 1-on-1): Full dedicated focus to build comfort, breathing control, and trust gradually.
        * Small Group Training: STRICTLY capped at a maximum of 4 children per group to ensure utmost safety, vigilant supervision, and personalized attention.
     c) Coach Ayman Decides via Free Assessment: State clearly that Coach Ayman personally evaluates the swimmer and decides the best path (private vs group) during a 100% Free Initial Assessment session at the nearest pool with zero commitment.
     d) Pricing Transparency (Mention gently after assessment CTA): Free Assessment first; Kids Group package (max 4 kids): 450 AED/month (Sibling discount: 400 AED); Private 1-on-1 sessions: 150 AED & 250 AED.
3) Abu Dhabi Academy Business Realities (Strict Facts — never fabricate alternatives):
   - Active Branches: Al Mushrif (المشرف), Al Falah (الفلاح), Khalifa City (مدينة خليفة), Al Danah / Al Najda (الدانة / النجدة).
   - Official WhatsApp & Booking Contact: 058 821 9130 (+971588219130).
   - Management phone (phone calls only, never booking messages): 055 137 8660 (+971551378660).
4) Content Production, Social Ads & Visual Design:
   - ZERO PRICING IN PUBLIC ADS: Absolutely NEVER include numerical prices (AED) in public social media posts, reels, or ads. Prices are strictly reserved for qualified leads in private chat (WhatsApp / Messenger).
   - Visual Previews & Image Generation: When asked for an image or visual concept, generate a detailed visual design prompt optimized for Canva and Google Gemini AI (detailing color palette: Deep Navy #0B192C, Cyan/Aqua #00ADB5, aspect ratios 1:1 or 9:16 or 4:5, athlete posture, lighting, and Arabic typography).
5) Safety & Honesty Rule:
   - Never claim you published or charged money without the owner's manual approval. Zero fake actions.
   - Never invent customer testimonials, results, schedules, limited availability, facility/safety claims, or connected integrations. If a detail is unknown, say so and ask the owner to confirm it.`;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) }))
    .min(1)
    .max(40),
});

async function requireStaffSession(request: Request): Promise<Response | null> {
  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!SUPABASE_URL || !SUPABASE_KEY || !accessToken) {
    return new Response("Staff authentication required", { status: 401 });
  }
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers,
    cache: "no-store",
  }).catch(() => null);
  if (!userResponse?.ok) return new Response("Session expired", { status: 401 });
  const user = (await userResponse.json().catch(() => null)) as { id?: unknown } | null;
  if (!user || typeof user.id !== "string") return new Response("Session expired", { status: 401 });
  const profileResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/${encodeURIComponent(STAFF_TABLE)}?id=eq.${encodeURIComponent(user.id)}&select=active&limit=1`,
    { headers, cache: "no-store" },
  ).catch(() => null);
  if (!profileResponse?.ok) return new Response("Staff authorization unavailable", { status: 503 });
  const profiles = (await profileResponse.json().catch(() => [])) as Array<{ active?: unknown }>;
  if (profiles.length !== 1 || profiles[0]?.active !== true)
    return new Response("Staff access denied", { status: 403 });
  return null;
}

export const Route = createFileRoute("/api/brain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await requireStaffSession(request);
        if (authFailure) return authFailure;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Invalid request payload", { status: 400 });

        const messages = parsed.data.messages;

        const geminiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"];
        const openaiKey = process.env["OPENAI_API_KEY"];
        const lovableKey = process.env["LOVABLE_API_KEY"];

        // 1. Google Gemini Provider
        if (geminiKey) {
          try {
            const contents = messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }],
            }));

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;
            const upstream = await fetch(url, {
              method: "POST",
              signal: withTimeout(PROVIDER_TIMEOUT_MS, request.signal),
              headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM }] },
                contents,
                generationConfig: {
                  temperature: 0.7,
                  maxOutputTokens: 2048,
                },
              }),
            });

            if (!upstream.ok) console.error(`[brain] provider responded status=${upstream.status}`);
            if (upstream.ok) {
              const data = await upstream.json();
              const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
              if (reply) {
                return new Response(reply, {
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                });
              }
            }
          } catch (e) {
            console.error(`[brain] Gemini call failed: ${(e as Error)?.name || "Error"}`);
          }
        }

        // 2. OpenAI Provider
        if (openaiKey) {
          try {
            const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              signal: withTimeout(PROVIDER_TIMEOUT_MS, request.signal),
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${openaiKey}`,
              },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                  { role: "system", content: SYSTEM },
                  ...messages.map((m) => ({ role: m.role, content: m.content })),
                ],
                temperature: 0.7,
              }),
            });

            if (!upstream.ok) console.error(`[brain] provider responded status=${upstream.status}`);
            if (upstream.ok) {
              const data = await upstream.json();
              const reply = data.choices?.[0]?.message?.content;
              if (reply) {
                return new Response(reply, {
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                });
              }
            }
          } catch (e) {
            console.error(`[brain] OpenAI call failed: ${(e as Error)?.name || "Error"}`);
          }
        }

        // 3. Lovable Gateway Fallback
        if (lovableKey) {
          try {
            const upstream = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
              method: "POST",
              signal: withTimeout(GATEWAY_TIMEOUT_MS, request.signal),
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${lovableKey}`,
                "Lovable-API-Key": lovableKey,
                "X-Lovable-AIG-SDK": "fetch",
              },
              body: JSON.stringify({
                model: "openai/gpt-6-astra",
                stream: true,
                store: false,
                reasoning: { effort: "low" },
                instructions: SYSTEM,
                input: messages.map((m) => ({ role: m.role, content: m.content })),
              }),
            });
            if (!upstream.ok) console.error(`[brain] provider responded status=${upstream.status}`);
            if (upstream.ok && upstream.body) {
              // Consume the SSE stream server-side and return the final text.
              const reader = upstream.body.getReader();
              const dec = new TextDecoder();
              let buf = "";
              let reply = "";
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buf += dec.decode(value, { stream: true });
                const lines = buf.split("\n");
                buf = lines.pop() ?? "";
                for (const line of lines) {
                  if (!line.startsWith("data:")) continue;
                  try {
                    const ev = JSON.parse(line.slice(5).trim());
                    if (ev.type === "response.output_text.delta" && ev.delta) reply += ev.delta;
                  } catch {
                    /* ignore keep-alive / partial lines */
                  }
                }
              }
              if (reply) {
                return new Response(reply, {
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                });
              }
            }
          } catch (e) {
            console.error(`[brain] Lovable Gateway call failed: ${(e as Error)?.name || "Error"}`);
          }
        }

        // All configured providers failed (or none configured): return an honest error,
        // never a canned answer presented as generated output.
        const anyProvider = Boolean(geminiKey || openaiKey || lovableKey);
        return new Response(
          anyProvider
            ? "Coach Brain is temporarily unavailable: the AI providers did not return an answer. Please try again shortly."
            : "Coach Brain is not configured: no AI provider is available.",
          {
            status: anyProvider ? 503 : 500,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          },
        );
      },
    },
  },
});
