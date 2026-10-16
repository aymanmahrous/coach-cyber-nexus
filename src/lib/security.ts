/**
 * Shared security utilities for Coach Cyber Nexus.
 * Covers constant-time comparisons, trusted IP extraction, and Owner PIN verification.
 */

const MIN_PIN_LENGTH = 8;
const FAIL_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES = 5;

interface FailureRecord {
  count: number;
  firstFailedAt: number;
}

const pinFailures = new Map<string, FailureRecord>();

/**
 * Constant-time string comparison to prevent timing attacks.
 */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Resolves an edge-provided client IP only. The proxy must overwrite these
 * headers; we deliberately do NOT fall back to raw X-Forwarded-For because a
 * direct client can forge that header. When no trusted edge header exists,
 * all such requests share the "unknown-client" rate-limit bucket.
 */
export function getClientIp(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown-client";
}

/**
 * Verifies Owner PIN against configured environment PIN with brute-force defense.
 */
export function verifyOwnerPin(
  providedPin: string | null | undefined,
  configuredPin: string | undefined,
  clientIdentifier = "unknown",
): { ok: boolean; status: number; error?: string } {
  const pin = (configuredPin || "").trim();

  if (!pin || pin.length < MIN_PIN_LENGTH) {
    return {
      ok: false,
      status: 503,
      error: "owner_pin_not_configured",
    };
  }

  // Brute-force lockout check
  const now = Date.now();
  const failRecord = pinFailures.get(clientIdentifier);
  if (
    failRecord &&
    now - failRecord.firstFailedAt < FAIL_WINDOW_MS &&
    failRecord.count >= MAX_FAILURES
  ) {
    return {
      ok: false,
      status: 429,
      error: "too_many_failed_attempts",
    };
  }

  if (!providedPin || !timingSafeEqualStr(providedPin.trim(), pin)) {
    const nextCount =
      failRecord && now - failRecord.firstFailedAt < FAIL_WINDOW_MS
        ? failRecord.count + 1
        : 1;
    const firstAt =
      failRecord && now - failRecord.firstFailedAt < FAIL_WINDOW_MS
        ? failRecord.firstFailedAt
        : now;

    pinFailures.set(clientIdentifier, { count: nextCount, firstFailedAt: firstAt });
    return {
      ok: false,
      status: 401,
      error: "invalid_owner_pin",
    };
  }

  // Successful auth clears failure count
  pinFailures.delete(clientIdentifier);
  return { ok: true, status: 200 };
}

export function clearPinFailures(): void {
  pinFailures.clear();
}
