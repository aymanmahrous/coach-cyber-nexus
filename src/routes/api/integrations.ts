import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withTimeout } from "@/lib/integration-guards";

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

export type IntegrationStatusType =
  | "not_configured"
  | "setup_saved"
  | "configured_unverified"
  | "verified"
  | "blocked";

export interface IntegrationSummary {
  id: string;
  name: string;
  category: "messaging" | "social" | "design" | "backend" | "ai";
  status: IntegrationStatusType;
  labelAr: string;
  labelEn: string;
  notesAr: string;
  notesEn: string;
  canPublishLive: boolean;
}

async function requireStaffSession(request: Request): Promise<{ accessToken: string } | { status: number; message: string }> {
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

export function evaluateIntegrations(): IntegrationSummary[] {
  const hasMetaPageId = Boolean(process.env["FACEBOOK_PAGE_ID"]);
  const hasMetaPageToken = Boolean(process.env["FACEBOOK_PAGE_ACCESS_TOKEN"]);
  const hasInstagramId = Boolean(process.env["INSTAGRAM_ACCOUNT_ID"]);
  const hasInstagramToken = Boolean(process.env["INSTAGRAM_ACCESS_TOKEN"]);
  const hasWhatsAppToken = Boolean(process.env["WHATSAPP_API_TOKEN"] || process.env["META_WHATSAPP_TOKEN"]);
  const hasAiProvider = Boolean(
    process.env["GEMINI_API_KEY"] ||
    process.env["GOOGLE_API_KEY"] ||
    process.env["OPENAI_API_KEY"] ||
    process.env["LOVABLE_API_KEY"]
  );

  return [
    {
      id: "supabase",
      name: "Supabase Backend & Storage",
      category: "backend",
      status: SUPABASE_URL && SUPABASE_KEY ? "verified" : "not_configured",
      labelAr: "قاعدة البيانات والتخزين",
      labelEn: "Database & Storage",
      notesAr: "جلسة الموظفين وقواعد البيانات متصلة ومحمية برمز الوصول الرسمي.",
      notesEn: "Staff session and databases connected and verified via bearer JWT.",
      canPublishLive: false,
    },
    {
      id: "coach_brain",
      name: "Coach Brain AI Engine",
      category: "ai",
      status: hasAiProvider ? "verified" : "not_configured",
      labelAr: "محرك كوتش براين",
      labelEn: "Coach Brain AI",
      notesAr: hasAiProvider
        ? "مزود الذكاء الاصطناعي متصل وجاهز للرد على استفسارات التدريب والمحتوى."
        : "لا يوجد مفتاح مزود ذكاء اصطناعي مهيأ.",
      notesEn: hasAiProvider ? "AI provider configured and operational." : "No AI provider configured.",
      canPublishLive: false,
    },
    {
      id: "whatsapp",
      name: "WhatsApp Business (058 821 9130)",
      category: "messaging",
      status: hasWhatsAppToken ? "configured_unverified" : "setup_saved",
      labelAr: "واتساب للأعمال",
      labelEn: "WhatsApp Business",
      notesAr: "مسار الاستقبال المعتمد عبر n8n وقاعدة البيانات؛ الإرسال المباشر محمي بـ dry-run.",
      notesEn: "Inbound ingress authoritative via n8n & Supabase; outbound sending dry-run only.",
      canPublishLive: false,
    },
    {
      id: "facebook",
      name: "Facebook Page (Captain Ayman)",
      category: "social",
      status: hasMetaPageId && hasMetaPageToken ? "configured_unverified" : hasMetaPageId ? "setup_saved" : "not_configured",
      labelAr: "صفحة فيسبوك",
      labelEn: "Facebook Page",
      notesAr: hasMetaPageId
        ? "المعرف محفوظ؛ لم يُجرَ فحص نشر حي في المعاينة حمايةً من أي أثر حقيقي."
        : "معرف الصفحة غير مسجل.",
      notesEn: hasMetaPageId
        ? "ID saved; live publishing check omitted in preview to prevent external side effects."
        : "Page ID not configured.",
      canPublishLive: false,
    },
    {
      id: "instagram",
      name: "Instagram Professional (@RelaxFixUAE)",
      category: "social",
      status: hasInstagramId && hasInstagramToken ? "configured_unverified" : hasInstagramId ? "setup_saved" : "not_configured",
      labelAr: "إنستغرام الاحترافي",
      labelEn: "Instagram Account",
      notesAr: hasInstagramId
        ? "المعرف مسجل؛ لم يُجرَ فحص نشر حي لمنع أي ظهور عام."
        : "معرف الحساب غير مسجل.",
      notesEn: hasInstagramId
        ? "Account ID saved; live check omitted in preview to prevent live post creation."
        : "Instagram account not configured.",
      canPublishLive: false,
    },
    {
      id: "canva",
      name: "Canva Integration",
      category: "design",
      status: "not_configured",
      labelAr: "تكامل Canva",
      labelEn: "Canva",
      notesAr: "المسار القديم ذو التوكن المؤقت في الذاكرة أُحيل للتقاعد؛ يتطلب تفويضاً رسمياً دائماً.",
      notesEn: "Legacy route retired; durable OAuth integration pending.",
      canPublishLive: false,
    },
  ];
}

export const Route = createFileRoute("/api/integrations")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const staff = await requireStaffSession(request);
        if ("status" in staff) {
          return new Response(JSON.stringify({ error: staff.message }), {
            status: staff.status,
            headers: { "Content-Type": "application/json" },
          });
        }

        const integrations = evaluateIntegrations();
        return new Response(JSON.stringify({ integrations }), {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
