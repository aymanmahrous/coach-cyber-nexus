import { z } from "zod";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_KEY = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();
const STAFF_TABLE = (import.meta.env.VITE_STAFF_PROFILE_TABLE || "staff_profiles").trim();
const SESSION_KEY = "official-staff-access-token";

const UserSchema = z.object({ id: z.string().uuid() });
const ProfileSchema = z.object({
  display_name: z.string().nullable().optional(),
  role: z.string().min(1),
  active: z.boolean(),
});
const AuthResponseSchema = z.object({
  access_token: z.string().min(1),
  user: UserSchema,
});

export type OfficialStaffSession = {
  accessToken: string;
  userId: string;
  displayName: string;
  role: string;
};

export type AuthErrorCode =
  | "CONFIGURATION_REQUIRED"
  | "INVALID_LOGIN"
  | "STAFF_ACCESS_DENIED"
  | "SESSION_EXPIRED"
  | "SERVICE_UNAVAILABLE"
  | "TOO_MANY_ATTEMPTS";

export class OfficialAuthError extends Error {
  constructor(readonly code: AuthErrorCode) {
    super(code);
    this.name = "OfficialAuthError";
  }
}

function requireConfiguration() {
  if (!SUPABASE_URL || !SUPABASE_KEY || !STAFF_TABLE) {
    throw new OfficialAuthError("CONFIGURATION_REQUIRED");
  }
}

function publicHeaders(accessToken?: string): HeadersInit {
  requireConfiguration();
  return {
    apikey: SUPABASE_KEY,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    Accept: "application/json",
  };
}

async function loadStaffProfile(accessToken: string, userId: string, signal?: AbortSignal) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${encodeURIComponent(STAFF_TABLE)}?id=eq.${encodeURIComponent(userId)}&select=display_name,role,active&limit=1`,
    { headers: publicHeaders(accessToken), cache: "no-store", signal },
  );
  if (response.status === 401) throw new OfficialAuthError("SESSION_EXPIRED");
  if (!response.ok) throw new OfficialAuthError("SERVICE_UNAVAILABLE");
  const rows = z.array(ProfileSchema).parse(await response.json());
  const profile = rows[0];
  if (!profile || !profile.active) throw new OfficialAuthError("STAFF_ACCESS_DENIED");
  return {
    accessToken,
    userId,
    displayName: profile.display_name?.trim() || "Staff",
    role: profile.role,
  } satisfies OfficialStaffSession;
}

export async function signIn(email: string, password: string): Promise<OfficialStaffSession> {
  requireConfiguration();
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { ...publicHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
      cache: "no-store",
    });
  } catch {
    throw new OfficialAuthError("SERVICE_UNAVAILABLE");
  }
  if (response.status === 429) throw new OfficialAuthError("TOO_MANY_ATTEMPTS");
  if (response.status === 401 || response.status === 403 || !response.ok) {
    throw new OfficialAuthError("INVALID_LOGIN");
  }
  const auth = AuthResponseSchema.parse(await response.json());
  return loadStaffProfile(auth.access_token, auth.user.id);
}

export async function requestPasswordReset(email: string): Promise<void> {
  requireConfiguration();
  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
      method: "POST",
      headers: { ...publicHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
      cache: "no-store",
    });
  } catch {
    throw new OfficialAuthError("SERVICE_UNAVAILABLE");
  }
  if (response.status === 429) throw new OfficialAuthError("TOO_MANY_ATTEMPTS");
  if (!response.ok) throw new OfficialAuthError("SERVICE_UNAVAILABLE");
}

export async function restoreSession(
  accessToken: string,
  signal?: AbortSignal,
): Promise<OfficialStaffSession> {
  requireConfiguration();
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: publicHeaders(accessToken),
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new OfficialAuthError("SESSION_EXPIRED");
  const user = UserSchema.parse(await response.json());
  return loadStaffProfile(accessToken, user.id, signal);
}

export function readStoredAccessToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function storeAccessToken(accessToken: string) {
  sessionStorage.setItem(SESSION_KEY, accessToken);
}

export function clearStoredAccessToken() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Storage can be unavailable in hardened/private browser contexts.
  }
}

export function authErrorMessage(code: AuthErrorCode, language: "ar" | "en") {
  const messages = {
    CONFIGURATION_REQUIRED: {
      ar: "إعداد Supabase غير مكتمل. التطبيق مغلق بأمان.",
      en: "Supabase is not configured. The app is securely locked.",
    },
    INVALID_LOGIN: {
      ar: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      en: "The email or password is incorrect.",
    },
    STAFF_ACCESS_DENIED: {
      ar: "هذا الحساب غير مفعّل للوصول إلى التطبيق.",
      en: "This account is not active for the official app.",
    },
    SESSION_EXPIRED: {
      ar: "انتهت الجلسة. سجّل الدخول مرة أخرى.",
      en: "Your session expired. Please sign in again.",
    },
    SERVICE_UNAVAILABLE: {
      ar: "تعذر الاتصال بالخدمة. حاول لاحقًا.",
      en: "The service is unavailable. Please try again later.",
    },
    TOO_MANY_ATTEMPTS: {
      ar: "محاولات كثيرة. حاول بعد قليل.",
      en: "Too many attempts. Please try again shortly.",
    },
  } as const;
  return messages[code][language];
}
