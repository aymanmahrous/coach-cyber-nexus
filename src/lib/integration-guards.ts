/** Shared, pure guards for integration endpoints (unit-tested). */

/** Public https URL only: no credentials, localhost, internal hosts, IPv4 or IPv6 literals. */
export function isSafeImageUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".internal") ||
    h.endsWith(".local") ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(h) ||
    h.includes(":") ||
    h.startsWith("[")
  )
    return false;
  return true;
}

export type IntegrationStatus =
  | "verified"
  | "configured_unverified"
  | "needs_setup"
  | "blocked"
  | "limited";

/** Canva: a token held only in one worker's memory is "limited", never "verified". */
export function canvaStatus(data: unknown): IntegrationStatus {
  if (!data || typeof data !== "object") return "blocked";
  const d = data as { configured?: unknown; connectedThisInstance?: unknown };
  if (d.configured !== true) return "needs_setup";
  return d.connectedThisInstance === true ? "limited" : "configured_unverified";
}

/** Timeout signal combined with an optional caller signal. */
export function withTimeout(ms: number, signal?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, t]) : t;
}
