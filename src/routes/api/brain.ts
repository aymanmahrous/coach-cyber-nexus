import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { buildCoachBrainSystem, fetchStaffKnowledgeContext } from "@/lib/coach-brain-context";
import { withTimeout } from "@/lib/integration-guards";

const PROVIDER_TIMEOUT_MS = 30_000;
const GATEWAY_TIMEOUT_MS = 60_000;
const KNOWLEDGE_TIMEOUT_MS = 10_000;
const SUPABASE_URL = (process.env["VITE_SUPABASE_URL"] || "").trim().replace(/\/$/, "");
const SUPABASE_KEY = (
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  process.env["VITE_SUPABASE_ANON_KEY"] ||
  ""
).trim();
const STAFF_TABLE = (process.env["VITE_STAFF_PROFILE_TABLE"] || "staff_profiles").trim();
const ALLOWED_ROLES = new Set(["super_admin", "admin", "coach", "reception"]);
const AuthUserSchema = z.object({ id: z.string().uuid() });
const StaffProfileSchema = z.object({ role: z.string(), active: z.boolean() });
const Body = z
  .object({
    messages: z
      .array(
        z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string().trim().min(1).max(8_000),
        }),
      )
      .min(1)
      .max(20),
  })
  .superRefine((body, context) => {
    if (body.messages.reduce((total, message) => total + message.content.length, 0) > 30_000) {
      context.addIssue({ code: "custom", message: "MESSAGE_HISTORY_TOO_LARGE" });
    }
  });

type StaffAuth = { accessToken: string };
type AuthFailure = { status: number; message: string };

async function requireStaffSession(request: Request): Promise<StaffAuth | AuthFailure> {
  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!SUPABASE_URL || !SUPABASE_KEY || !STAFF_TABLE || !accessToken) {
    return { status: 401, message: "Staff authentication required" };
  }

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  let userResponse: Response;
  try {
    userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers,
      cache: "no-store",
      signal: withTimeout(KNOWLEDGE_TIMEOUT_MS, request.signal),
    });
  } catch {
    return { status: 503, message: "Staff authentication service unavailable" };
  }
  if (userResponse.status === 401 || userResponse.status === 403) {
    return { status: 401, message: "Session expired" };
  }
  if (!userResponse.ok) return { status: 503, message: "Staff authentication service unavailable" };
  const parsedUser = AuthUserSchema.safeParse(await userResponse.json().catch(() => null));
  if (!parsedUser.success) return { status: 401, message: "Session expired" };

  let profileResponse: Response;
  try {
    profileResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/${encodeURIComponent(STAFF_TABLE)}?id=eq.${encodeURIComponent(parsedUser.data.id)}&select=role,active&limit=1`,
      { headers, cache: "no-store", signal: withTimeout(KNOWLEDGE_TIMEOUT_MS, request.signal) },
    );
  } catch {
    return { status: 503, message: "Staff authorization unavailable" };
  }
  if (!profileResponse.ok) return { status: 503, message: "Staff authorization unavailable" };
  const profiles = z
    .array(StaffProfileSchema)
    .safeParse(await profileResponse.json().catch(() => null));
  const profile = profiles.success && profiles.data.length === 1 ? profiles.data[0] : null;
  if (!profile?.active || !ALLOWED_ROLES.has(profile.role)) {
    return { status: 403, message: "Staff access denied" };
  }
  return { accessToken };
}

function textResponse(text: string, status = 200) {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export const Route = createFileRoute("/api/brain")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const staff = await requireStaffSession(request);
        if ("status" in staff) return textResponse(staff.message, staff.status);
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return textResponse("Invalid request payload", 400);

        let knowledgeContext: string;
        try {
          knowledgeContext = await fetchStaffKnowledgeContext({
            supabaseUrl: SUPABASE_URL,
            publishableKey: SUPABASE_KEY,
            accessToken: staff.accessToken,
            signal: withTimeout(KNOWLEDGE_TIMEOUT_MS, request.signal),
          });
        } catch (error) {
          const errorName = error instanceof Error ? error.message : "KNOWLEDGE_CONTEXT_FAILED";
          console.error(
            `[brain] protected knowledge context unavailable code=${errorName.slice(0, 80)}`,
          );
          return textResponse(
            "Coach Brain cannot answer because protected Academy Knowledge is unavailable. Please try again later.",
            503,
          );
        }

        const messages = parsed.data.messages;
        const system = buildCoachBrainSystem(knowledgeContext);
        const geminiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"];
        const openaiKey = process.env["OPENAI_API_KEY"];
        const lovableKey = process.env["LOVABLE_API_KEY"];

        if (geminiKey) {
          try {
            const upstream = await fetch(
              "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
              {
                method: "POST",
                signal: withTimeout(PROVIDER_TIMEOUT_MS, request.signal),
                headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
                body: JSON.stringify({
                  systemInstruction: { parts: [{ text: system }] },
                  contents: messages.map((message) => ({
                    role: message.role === "assistant" ? "model" : "user",
                    parts: [{ text: message.content }],
                  })),
                  generationConfig: { temperature: 0.5, maxOutputTokens: 2_048 },
                }),
              },
            );
            if (upstream.ok) {
              const data = (await upstream.json().catch(() => null)) as {
                candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
              } | null;
              const reply = data?.candidates?.[0]?.content?.parts?.find(
                (part) => typeof part.text === "string" && part.text.trim(),
              )?.text;
              if (typeof reply === "string" && reply.trim()) return textResponse(reply);
            } else {
              console.error(`[brain] Gemini provider status=${upstream.status}`);
            }
          } catch (error) {
            console.error(
              `[brain] Gemini call failed name=${error instanceof Error ? error.name : "Error"}`,
            );
          }
        }

        if (openaiKey) {
          try {
            const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              signal: withTimeout(PROVIDER_TIMEOUT_MS, request.signal),
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
              body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                  { role: "system", content: system },
                  ...messages.map((message) => ({ role: message.role, content: message.content })),
                ],
                temperature: 0.5,
                max_tokens: 2_048,
              }),
            });
            if (upstream.ok) {
              const data = (await upstream.json().catch(() => null)) as {
                choices?: Array<{ message?: { content?: unknown } }>;
              } | null;
              const reply = data?.choices?.[0]?.message?.content;
              if (typeof reply === "string" && reply.trim()) return textResponse(reply);
            } else {
              console.error(`[brain] OpenAI provider status=${upstream.status}`);
            }
          } catch (error) {
            console.error(
              `[brain] OpenAI call failed name=${error instanceof Error ? error.name : "Error"}`,
            );
          }
        }

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
                instructions: system,
                input: messages,
              }),
            });
            if (upstream.ok && upstream.body) {
              const reader = upstream.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              let reply = "";
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                  if (!line.startsWith("data:")) continue;
                  try {
                    const event = JSON.parse(line.slice(5).trim()) as {
                      type?: unknown;
                      delta?: unknown;
                    };
                    if (
                      event.type === "response.output_text.delta" &&
                      typeof event.delta === "string"
                    ) {
                      reply += event.delta;
                      if (reply.length > 16_000) return textResponse(reply.slice(0, 16_000));
                    }
                  } catch {
                    // Ignore partial or non-JSON SSE lines.
                  }
                }
              }
              if (reply.trim()) return textResponse(reply);
            } else if (!upstream.ok) {
              console.error(`[brain] gateway provider status=${upstream.status}`);
            }
          } catch (error) {
            console.error(
              `[brain] gateway call failed name=${error instanceof Error ? error.name : "Error"}`,
            );
          }
        }

        const anyProvider = Boolean(geminiKey || openaiKey || lovableKey);
        return textResponse(
          anyProvider
            ? "Coach Brain is temporarily unavailable: the AI providers did not return an answer. Please try again shortly."
            : "Coach Brain is not configured: no AI provider is available.",
          anyProvider ? 503 : 500,
        );
      },
    },
  },
});
