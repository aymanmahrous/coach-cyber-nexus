import { describe, expect, it, vi } from "vitest";
import { createMemoryStore, createSupabaseStore } from "./store";
import { checkPin, createSessionValue, verifySessionValue } from "./owner-auth";

describe("memory store", () => {
  it("expires keys after their TTL", async () => {
    let t = 1_000;
    const s = createMemoryStore(() => t);
    await s.set("a", { x: 1 }, 100);
    expect(await s.get("a")).toEqual({ x: 1 });
    t += 100;
    expect(await s.get("a")).toBeNull();
  });

  it("claim succeeds once until the key expires", async () => {
    let t = 0;
    const s = createMemoryStore(() => t);
    expect(await s.claim("k", 1, 50)).toBe(true);
    expect(await s.claim("k", 1, 50)).toBe(false);
    t = 50;
    expect(await s.claim("k", 1, 50)).toBe(true);
  });

  it("incr counts within a fixed window and resets after it", async () => {
    let t = 0;
    const s = createMemoryStore(() => t);
    expect(await s.incr("c", 100)).toBe(1);
    t = 60;
    expect(await s.incr("c", 100)).toBe(2);
    t = 100;
    expect(await s.incr("c", 100)).toBe(1);
  });

  it("tables upsert, list newest first, and remove", async () => {
    let t = Date.parse("2026-01-01T00:00:00Z");
    const s = createMemoryStore(() => t);
    const posts = s.table("posts");
    await posts.upsert([{ id: "a", payload: { v: 1 } }]);
    t += 1000;
    await posts.upsert([{ id: "b", payload: { v: 2 } }]);
    await posts.upsert([{ id: "a", payload: { v: 3 } }]);
    expect((await posts.list()).map((r) => [r.id, r.payload])).toEqual([
      ["b", { v: 2 }],
      ["a", { v: 3 }],
    ]);
    await posts.remove(["a"]);
    expect((await posts.list()).map((r) => r.id)).toEqual(["b"]);
    await posts.upsert([
      { id: "c", payload: 3 },
      { id: "d", payload: 4 },
    ]);
    const page1 = await posts.list(2, 0);
    const page2 = await posts.list(2, 2);
    expect(new Set([...page1, ...page2].map((r) => r.id))).toEqual(new Set(["b", "c", "d"]));
    expect(page1.length + page2.length).toBe(3);
  });
});

describe("supabase store", () => {
  it("sends service-role auth and uses the kv_claim RPC", async () => {
    const fetchMock = vi.fn(async () => new Response("true", { status: 200 }));
    const s = createSupabaseStore("https://x.supabase.co/", "srk", fetchMock as typeof fetch);
    expect(s.durable).toBe(true);
    expect(await s.claim("publish:facebook:abcd", { state: "pending" }, 1500)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://x.supabase.co/rest/v1/rpc/kv_claim");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer srk");
    expect(JSON.parse(String(init.body))).toEqual({
      p_key: "publish:facebook:abcd",
      p_value: { state: "pending" },
      p_ttl_seconds: 2,
    });
  });

  it("treats expired rows as missing", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify([{ value: 1, expires_at: past }]), { status: 200 }),
    );
    const s = createSupabaseStore("https://x.supabase.co", "srk", fetchMock as typeof fetch);
    expect(await s.get("k")).toBeNull();
  });

  it("throws on non-2xx so callers can fail closed", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
    const s = createSupabaseStore("https://x.supabase.co", "srk", fetchMock as typeof fetch);
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(s.incr("k", 1000)).rejects.toThrow("store_error");
  });
});

describe("checkPin (durable limiter)", () => {
  const req = new Request("https://app.example/api/publish", {
    headers: { "cf-connecting-ip": "1.2.3.4" },
  });
  const expected = "correct-horse";

  it("locks out after MAX_ATTEMPTS, even for the right PIN", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < 5; i++)
      expect(await checkPin(req, "wrong-pin", { store, expected, delayMs: 0 })).toBe("wrong_pin");
    expect(await checkPin(req, expected, { store, expected, delayMs: 0 })).toBe(
      "too_many_attempts",
    );
  });

  it("resets the counter on success", async () => {
    const store = createMemoryStore();
    for (let i = 0; i < 4; i++) await checkPin(req, "wrong-pin", { store, expected, delayMs: 0 });
    expect(await checkPin(req, expected, { store, expected, delayMs: 0 })).toBe("ok");
    expect(await store.get("pin-attempts:1.2.3.4")).toBeNull();
  });

  it("refuses weak or missing PIN configuration", async () => {
    const store = createMemoryStore();
    expect(await checkPin(req, "x", { store, expected: "", delayMs: 0 })).toBe(
      "publish_pin_not_configured",
    );
    expect(await checkPin(req, "short", { store, expected: "short", delayMs: 0 })).toBe(
      "publish_pin_too_weak",
    );
  });
});

describe("owner session cookie", () => {
  it("verifies its own signature and rejects tampering, expiry, and PIN change", () => {
    const now = Date.now();
    const v = createSessionValue("correct-horse", now);
    expect(verifySessionValue(v, "correct-horse", now)).toBe(true);
    expect(verifySessionValue(v.replace(/.$/, "x"), "correct-horse", now)).toBe(false);
    expect(verifySessionValue(v, "another-pin-123", now)).toBe(false);
    expect(verifySessionValue(v, "correct-horse", now + 8 * 24 * 3600 * 1000)).toBe(false);
    expect(verifySessionValue(undefined, "correct-horse", now)).toBe(false);
  });
});
