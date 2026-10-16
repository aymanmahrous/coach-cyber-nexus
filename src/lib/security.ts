export interface OwnerPinCheck {
  ok: boolean;
  status: 200 | 401 | 429 | 503;
  error?: string;
}

interface FailureWindow {
  count: number;
  startedAt: number;
  lockedUntil?: number;
}

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const pinFailures = new Map<string, FailureWindow>();

/** Compare UTF-8 strings without exiting early on the first differing byte. */
export function timingSafeEqualStr(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    mismatch |= (a[i] ?? 0) ^ (b[i] ?? 0);
  }
  return mismatch === 0;
}

/** Use the first proxy-provided client address for throttling only, never authorization. */
export function getClientIp(request: Request): string {
  const direct = request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip");
  if (direct?.trim()) return direct.trim().slice(0, 128);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return forwarded?.slice(0, 128) || "unknown";
}

export function clearPinFailures(): void {
  pinFailures.clear();
}

export function verifyOwnerPin(
  providedPin: string | null | undefined,
  configuredPin: string | null | undefined,
  clientIp = "unknown",
): OwnerPinCheck {
  const expected = configuredPin?.trim() || "";
  if (expected.length < 8) return { ok: false, status: 503, error: "pin_not_configured" };

  const now = Date.now();
  const key = clientIp || "unknown";
  const previous = pinFailures.get(key);
  if (previous?.lockedUntil && previous.lockedUntil > now) {
    return { ok: false, status: 429, error: "too_many_failed_attempts" };
  }
  if (previous && now - previous.startedAt >= WINDOW_MS) pinFailures.delete(key);

  if (typeof providedPin === "string" && timingSafeEqualStr(providedPin.trim(), expected)) {
    pinFailures.delete(key);
    return { ok: true, status: 200 };
  }

  const current = pinFailures.get(key);
  const failure: FailureWindow = current && now - current.startedAt < WINDOW_MS
    ? { ...current, count: current.count + 1 }
    : { count: 1, startedAt: now };
  if (failure.count >= MAX_FAILURES) failure.lockedUntil = now + WINDOW_MS;
  pinFailures.set(key, failure);
  if (failure.lockedUntil) return { ok: false, status: 429, error: "too_many_failed_attempts" };
  return { ok: false, status: 401, error: "invalid_owner_pin" };
}
