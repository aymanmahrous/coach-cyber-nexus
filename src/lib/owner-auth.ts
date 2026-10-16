import crypto from "node:crypto";
import { getStore, type Store } from "@/lib/store";

/**
 * Owner authorization shared by server routes.
 * - PIN check with a durable, atomic attempt limiter (store.incr per client).
 * - Owner session: stateless HMAC-signed HttpOnly cookie keyed from the PIN,
 *   so changing OWNER_PUBLISH_PIN invalidates every existing session.
 */

export const MIN_PIN_LENGTH = 8;
export const FAIL_DELAY_MS = 1200;
export const MAX_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const SESSION_COOKIE = "owner_session";
export const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;

export type PinCheck =
  "ok" | "wrong_pin" | "too_many_attempts" | "publish_pin_not_configured" | "publish_pin_too_weak";

export function safeEqual(a: string, b: string) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ownerPin = () => (process.env["OWNER_PUBLISH_PIN"] || "").trim();

export function clientKey(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function pinConfigState(pin = ownerPin()) {
  return pin ? (pin.length >= MIN_PIN_LENGTH ? "configured" : "too_short") : "not_configured";
}

/**
 * Every attempt is counted atomically; success resets the counter. Concurrent
 * guesses therefore cannot slip past the limit.
 */
export async function checkPin(
  request: Request,
  pin: string,
  opts: { store?: Store; expected?: string; delayMs?: number } = {},
): Promise<PinCheck> {
  const expected = opts.expected ?? ownerPin();
  const store = opts.store ?? getStore();
  const delayMs = opts.delayMs ?? FAIL_DELAY_MS;
  if (!expected) return "publish_pin_not_configured";
  if (expected.length < MIN_PIN_LENGTH) return "publish_pin_too_weak";

  const key = `pin-attempts:${clientKey(request)}`;
  const attempts = await store.incr(key, ATTEMPT_WINDOW_MS);
  if (attempts > MAX_ATTEMPTS) {
    await sleep(delayMs);
    return "too_many_attempts";
  }
  if (!safeEqual(pin, expected)) {
    await sleep(delayMs);
    return "wrong_pin";
  }
  await store.delete(key);
  return "ok";
}

function sessionKey(pin: string) {
  return crypto.createHash("sha256").update(`owner-session:${pin}`).digest();
}

function sign(exp: number, pin: string) {
  return crypto.createHmac("sha256", sessionKey(pin)).update(String(exp)).digest("base64url");
}

export function createSessionValue(pin = ownerPin(), now = Date.now()) {
  const exp = now + SESSION_MAX_AGE_S * 1000;
  return `${exp}.${sign(exp, pin)}`;
}

export function verifySessionValue(value: string | undefined, pin = ownerPin(), now = Date.now()) {
  if (!value || pin.length < MIN_PIN_LENGTH) return false;
  const [expRaw, sig] = value.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= now || !sig) return false;
  return safeEqual(sig, sign(exp, pin));
}

export function readCookie(request: Request, name: string): string | undefined {
  const cookie = request.headers.get("cookie");
  if (!cookie) return undefined;
  for (const part of cookie.split(";")) {
    const i = part.indexOf("=");
    if (i < 0 || part.slice(0, i).trim() !== name) continue;
    return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

export function isOwner(request: Request) {
  return verifySessionValue(readCookie(request, SESSION_COOKIE));
}

export function sessionCookieHeader(request: Request, value: string | null) {
  void request;
  // Lax (not Strict) so the cookie reaches the Canva OAuth callback; all mutations are non-GET.
  return `${SESSION_COOKIE}=${value ?? ""}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${
    value ? SESSION_MAX_AGE_S : 0
  }`;
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const unauthorized = () => json({ error: "owner_session_required" }, 401);
