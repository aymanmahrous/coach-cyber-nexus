/**
 * Small runtime boundary for the official product.
 *
 * This module intentionally contains no Supabase SDK singleton and no service-role
 * credential. Every call requires the current staff access token and uses only a
 * browser-safe publishable/anon key.
 */

import { isFunctionFailure } from "./integration-responses";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
const SUPABASE_KEY = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  ""
).trim();

export type OfficialSession = {
  accessToken: string;
  userId: string;
  displayName: string;
  role: string;
};

export class OfficialBackendError extends Error {
  constructor(
    message: string,
    readonly code:
      "SETUP_REQUIRED" | "SESSION_EXPIRED" | "FORBIDDEN" | "REQUEST_FAILED" | "INVALID_RESPONSE",
    readonly status?: number,
  ) {
    super(message);
    this.name = "OfficialBackendError";
  }
}

function requireConfig() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new OfficialBackendError("Supabase is not configured", "SETUP_REQUIRED");
  }
}

function headers(session: Pick<OfficialSession, "accessToken">): HeadersInit {
  requireConfig();
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${session.accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 401)
    throw new OfficialBackendError("Session expired", "SESSION_EXPIRED", 401);
  if (response.status === 403)
    throw new OfficialBackendError("Staff access denied", "FORBIDDEN", 403);
  if (!response.ok)
    throw new OfficialBackendError("Backend request failed", "REQUEST_FAILED", response.status);
  return response.json().catch(() => null);
}

export async function callOfficialRpc<T>(
  session: Pick<OfficialSession, "accessToken">,
  name: string,
  body: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: headers(session),
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  return (await parseResponse(response)) as T;
}

export async function callOfficialFunction<T>(
  session: Pick<OfficialSession, "accessToken">,
  name: string,
  body: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: headers(session),
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const payload = await parseResponse(response);
  if (payload === null) {
    throw new OfficialBackendError("Invalid function response", "INVALID_RESPONSE", response.status);
  }
  if (isFunctionFailure(payload)) {
    // Do not expose arbitrary upstream error bodies or mistake HTTP 200 for success.
    throw new OfficialBackendError("Function reported a failure; completion was not confirmed", "REQUEST_FAILED", response.status);
  }
  return payload as T;
}

export function officialBackendConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}
