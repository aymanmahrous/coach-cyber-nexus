/**
 * Durable server-side storage.
 *
 * Backed by Supabase (PostgREST over fetch, service role key, server only) when
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set; otherwise falls back to
 * per-process memory, which is NOT durable and must be reported as such.
 * Schema: supabase/migrations/*_durable_store.sql
 */

export type Doc<T = unknown> = { id: string; payload: T; created_at: string };

export interface DocTable {
  list<T>(limit?: number, offset?: number): Promise<Doc<T>[]>;
  upsert<T>(rows: { id: string; payload: T }[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
}

export interface Store {
  readonly durable: boolean;
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  /** Atomically create `key` if absent or expired. Returns true if this call claimed it. */
  claim(key: string, value: unknown, ttlMs: number): Promise<boolean>;
  /** Atomic fixed-window counter. Returns the count after incrementing. */
  incr(key: string, windowMs: number): Promise<number>;
  table(name: "posts" | "wa_messages"): DocTable;
}

const STORE_TIMEOUT_MS = 8_000;

export class StoreError extends Error {
  constructor(public status: number) {
    super("store_error");
  }
}

export function createMemoryStore(now: () => number = Date.now): Store {
  const kv = new Map<string, { value: unknown; expiresAt: number | null }>();
  const tables = new Map<string, Map<string, Doc>>();
  const live = (key: string) => {
    const e = kv.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && e.expiresAt <= now()) {
      kv.delete(key);
      return null;
    }
    return e;
  };
  return {
    durable: false,
    async get<T>(key: string) {
      return (live(key)?.value as T) ?? null;
    },
    async set(key, value, ttlMs) {
      kv.set(key, { value, expiresAt: ttlMs ? now() + ttlMs : null });
    },
    async delete(key) {
      kv.delete(key);
    },
    async claim(key, value, ttlMs) {
      if (live(key)) return false;
      kv.set(key, { value, expiresAt: now() + ttlMs });
      return true;
    },
    async incr(key, windowMs) {
      const e = live(key);
      const count = e ? Number(e.value) + 1 : 1;
      kv.set(key, { value: count, expiresAt: e ? e.expiresAt : now() + windowMs });
      return count;
    },
    table(name) {
      let t = tables.get(name);
      if (!t) tables.set(name, (t = new Map()));
      const rows = t;
      return {
        async list<T>(limit = 500, offset = 0) {
          return [...rows.values()]
            .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
            .slice(offset, offset + limit) as Doc<T>[];
        },
        async upsert(items) {
          for (const r of items) {
            const created_at = rows.get(r.id)?.created_at ?? new Date(now()).toISOString();
            rows.set(r.id, { id: r.id, payload: r.payload, created_at });
          }
        },
        async remove(ids) {
          for (const id of ids) rows.delete(id);
        },
      };
    },
  };
}

export function createSupabaseStore(
  url: string,
  serviceKey: string,
  fetchImpl: typeof fetch = fetch,
): Store {
  const base = `${url.replace(/\/+$/, "")}/rest/v1`;
  const call = async (path: string, init: RequestInit & { prefer?: string } = {}) => {
    const res = await fetchImpl(`${base}/${path}`, {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        ...(init.prefer ? { Prefer: init.prefer } : {}),
      },
      signal: AbortSignal.timeout(STORE_TIMEOUT_MS),
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      console.error(
        `[store] ${init.method || "GET"} ${path.split("?")[0]} failed status=${res.status}`,
      );
      throw new StoreError(res.status);
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? (JSON.parse(text) as unknown) : null;
  };
  const enc = encodeURIComponent;
  const expiresAt = (ttlMs?: number) => (ttlMs ? new Date(Date.now() + ttlMs).toISOString() : null);
  const ttlSeconds = (ms: number) => Math.max(1, Math.ceil(ms / 1000));
  const inList = (ids: string[]) =>
    `(${ids.map((id) => `"${id.replace(/["\\]/g, "")}"`).join(",")})`;

  return {
    durable: true,
    async get<T>(key: string) {
      const rows = (await call(`kv_store?key=eq.${enc(key)}&select=value,expires_at&limit=1`)) as {
        value: T;
        expires_at: string | null;
      }[];
      const row = rows?.[0];
      if (!row) return null;
      if (row.expires_at && Date.parse(row.expires_at) <= Date.now()) return null;
      return row.value;
    },
    async set(key, value, ttlMs) {
      await call("kv_store?on_conflict=key", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: JSON.stringify({ key, value, expires_at: expiresAt(ttlMs) }),
      });
    },
    async delete(key) {
      await call(`kv_store?key=eq.${enc(key)}`, { method: "DELETE", prefer: "return=minimal" });
    },
    async claim(key, value, ttlMs) {
      const r = await call("rpc/kv_claim", {
        method: "POST",
        body: JSON.stringify({ p_key: key, p_value: value, p_ttl_seconds: ttlSeconds(ttlMs) }),
      });
      return r === true;
    },
    async incr(key, windowMs) {
      const r = await call("rpc/kv_incr", {
        method: "POST",
        body: JSON.stringify({ p_key: key, p_window_seconds: ttlSeconds(windowMs) }),
      });
      return Number(r);
    },
    table(name) {
      return {
        async list<T>(limit = 500, offset = 0) {
          return ((await call(
            `${name}?select=id,payload,created_at&order=created_at.desc,id.asc&limit=${limit}&offset=${offset}`,
          )) ?? []) as Doc<T>[];
        },
        async upsert(rows) {
          if (!rows.length) return;
          await call(`${name}?on_conflict=id`, {
            method: "POST",
            prefer: "resolution=merge-duplicates,return=minimal",
            body: JSON.stringify(rows.map((r) => ({ id: r.id, payload: r.payload }))),
          });
        },
        async remove(ids) {
          if (!ids.length) return;
          await call(`${name}?id=in.${enc(inList(ids))}`, {
            method: "DELETE",
            prefer: "return=minimal",
          });
        },
      };
    },
  };
}

let instance: Store | null = null;

export function getStore(): Store {
  if (instance) return instance;
  const url = (process.env["SUPABASE_URL"] || "").trim();
  const key = (process.env["SUPABASE_SERVICE_ROLE_KEY"] || "").trim();
  instance = /^https:\/\//.test(url) && key ? createSupabaseStore(url, key) : createMemoryStore();
  return instance;
}
