import { useCallback, useEffect, useRef, useState } from "react";

export type Platform = "facebook" | "instagram" | "tiktok";
export type PostStatus = "Needs Review" | "Scheduled" | "Claimed" | "Published";
export type Post = {
  id: string;
  platform: Platform;
  caption: string;
  visual: string; // design / video brief
  status: PostStatus;
  scheduledAt?: string;
  createdAt: string;
  templateType?: "drill" | "carousel" | "transformation" | "branch_promo" | "quiz";
  publishedExternalId?: string;
  publishedExternalUrl?: string;
};

/**
 * "cloud": synced with the server's durable store.
 * "memory": server reachable but storage is not durable (no Supabase).
 * "locked": owner session required — posts are kept in the local cache only.
 * "error": server unreachable — local cache only.
 */
export type SyncState = "loading" | "cloud" | "memory" | "locked" | "error";

const KEY = "cockpit-posts";
const EVT = "cockpit-posts-change";
const SYNC_EVT = "cockpit-posts-sync";

function readCache(): Post[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

function writeCache(posts: Post[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(posts));
  } catch {
    // cache is optional
  }
}

const PENDING_KEY = "cockpit-posts-pending";
const MIGRATED_KEY = "cockpit-posts-migrated";

type Pending = { upserts: string[]; deletes: string[] };

function readPending(): Pending {
  try {
    const p = JSON.parse(localStorage.getItem(PENDING_KEY) || "null");
    if (p && Array.isArray(p.upserts) && Array.isArray(p.deletes)) return p;
  } catch {
    // ignore
  }
  return { upserts: [], deletes: [] };
}

function writePending(p: Pending) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

function queue(upserts: string[], deletes: string[]) {
  const p = readPending();
  const del = new Set([...p.deletes.filter((id) => !upserts.includes(id)), ...deletes]);
  const up = new Set([...p.upserts.filter((id) => !del.has(id)), ...upserts]);
  writePending({ upserts: [...up], deletes: [...del] });
}

let syncState: SyncState = "loading";
const setSyncState = (s: SyncState) => {
  syncState = s;
  window.dispatchEvent(new Event(SYNC_EVT));
};

// Flushes and pulls run one at a time so responses can never be applied out of order.
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

/** Send queued local changes. Returns false when the server refused them. */
async function flushNow(): Promise<boolean> {
  const pending = readPending();
  const cache = new Map(readCache().map((p) => [p.id, p]));
  if (!localStorage.getItem(MIGRATED_KEY)) {
    // Until a durable store has confirmed receipt, (re)upload every cached post. This also
    // re-seeds a non-durable memory store after a server restart.
    pending.upserts = [...new Set([...pending.upserts, ...cache.keys()])];
  }
  const upserts = pending.upserts.map((id) => cache.get(id)).filter((p): p is Post => !!p);
  if (!upserts.length && !pending.deletes.length) return true;
  // Snapshot of what is sent: a queued id is only cleared if it was not edited meanwhile.
  const sent = new Map(upserts.map((p) => [p.id, JSON.stringify(p)]));
  const reqs: Promise<Response>[] = [];
  for (let i = 0; i < upserts.length; i += 200)
    reqs.push(
      fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posts: upserts.slice(i, i + 200) }),
      }),
    );
  for (let i = 0; i < pending.deletes.length; i += 200) {
    const q = new URLSearchParams(pending.deletes.slice(i, i + 200).map((id) => ["id", id]));
    reqs.push(fetch(`/api/posts?${q}`, { method: "DELETE" }));
  }
  const results = await Promise.all(reqs);
  if (results.some((r) => r.status === 401)) {
    setSyncState("locked");
    return false;
  }
  if (results.some((r) => !r.ok)) {
    setSyncState("error");
    return false;
  }
  const after = readPending();
  const now = new Map(readCache().map((p) => [p.id, JSON.stringify(p)]));
  writePending({
    upserts: after.upserts.filter((id) => !sent.has(id) || now.get(id) !== sent.get(id)),
    deletes: after.deletes.filter((id) => !pending.deletes.includes(id) || now.has(id)),
  });
  return true;
}

/** Push queued changes, then load the server copy. */
async function pullNow(): Promise<void> {
  try {
    if (!(await flushNow())) return;
    const res = await fetch("/api/posts", { credentials: "same-origin" });
    if (res.status === 401) return setSyncState("locked");
    if (!res.ok) return setSyncState("error");
    const data = (await res.json()) as { posts: Post[]; durable: boolean };
    const server = Array.isArray(data.posts) ? data.posts : [];
    const pending = readPending();
    const pendingUp = new Set(pending.upserts);
    const pendingDel = new Set(pending.deletes);
    // Durable store: it is the source of truth except for unsent local edits.
    // Memory store: it can lose data on restart, so the browser cache stays authoritative.
    const local = data.durable ? readCache().filter((p) => pendingUp.has(p.id)) : readCache();
    const localIds = new Set(local.map((p) => p.id));
    const merged = [
      ...local,
      ...server.filter((p) => !localIds.has(p.id) && !pendingDel.has(p.id)),
    ].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
    writeCache(merged);
    if (data.durable) localStorage.setItem(MIGRATED_KEY, "1");
    setSyncState(data.durable ? "cloud" : "memory");
    window.dispatchEvent(new Event(EVT));
  } catch {
    setSyncState("error");
  }
}

const flush = () => exclusive(flushNow);
const pull = () => exclusive(pullNow);

/** Unlock cloud sync for this browser with the owner PIN (sets an HttpOnly session cookie). */
export async function unlockOwnerSession(pin: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  }).catch(() => null);
  if (!res) return { ok: false, error: "network" };
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) return { ok: false, error: data.error || "error" };
  window.dispatchEvent(new Event("owner-session-change"));
  await pull();
  return { ok: true };
}

export function usePosts() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [sync, setSync] = useState<SyncState>(syncState);
  const current = useRef<Post[]>([]);

  useEffect(() => {
    const fromCache = () => {
      const p = readCache();
      current.current = p;
      setPosts(p);
    };
    const onSync = () => setSync(syncState);
    const onSession = () => void pull();
    fromCache();
    void pull();
    window.addEventListener(EVT, fromCache);
    window.addEventListener("storage", fromCache);
    window.addEventListener(SYNC_EVT, onSync);
    window.addEventListener("owner-session-change", onSession);
    // Retry queued offline edits when connectivity returns, plus a slow periodic retry.
    const retry = () => {
      const p = readPending();
      if (syncState === "error" && (p.upserts.length || p.deletes.length)) void pull();
    };
    const onOnline = () => void pull();
    window.addEventListener("online", onOnline);
    const timer = window.setInterval(retry, 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearInterval(timer);
      window.removeEventListener(EVT, fromCache);
      window.removeEventListener("storage", fromCache);
      window.removeEventListener(SYNC_EVT, onSync);
      window.removeEventListener("owner-session-change", onSession);
    };
  }, []);

  const save = useCallback((next: Post[]) => {
    const prev = current.current;
    const prevById = new Map(prev.map((p) => [p.id, p]));
    const nextIds = new Set(next.map((p) => p.id));
    const upserts = next.filter((p) => JSON.stringify(prevById.get(p.id)) !== JSON.stringify(p));
    const deletes = prev.filter((p) => !nextIds.has(p.id)).map((p) => p.id);
    current.current = next;
    writeCache(next);
    window.dispatchEvent(new Event(EVT));
    if (!upserts.length && !deletes.length) return;
    queue(
      upserts.map((p) => p.id),
      deletes,
    );
    if (syncState !== "locked") void flush().catch(() => setSyncState("error"));
  }, []);

  return { posts, save, sync, refresh: pull };
}
