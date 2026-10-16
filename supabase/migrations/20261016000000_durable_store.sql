-- Durable storage for Coach Ayman's Command Center.
-- Accessed only server-side with the service role key: RLS is enabled with
-- no policies, so the anon/public key cannot read or write these tables.

create table if not exists public.kv_store (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz
);
create index if not exists kv_store_expires_at_idx on public.kv_store (expires_at);

create table if not exists public.posts (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists posts_created_at_idx on public.posts (created_at desc);

create table if not exists public.wa_messages (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists wa_messages_created_at_idx on public.wa_messages (created_at desc);

alter table public.kv_store enable row level security;
alter table public.posts enable row level security;
alter table public.wa_messages enable row level security;

-- Atomically claim a key: succeeds if absent or expired. Returns true when claimed.
create or replace function public.kv_claim(p_key text, p_value jsonb, p_ttl_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed text;
begin
  insert into kv_store as k (key, value, expires_at)
  values (p_key, p_value, now() + make_interval(secs => p_ttl_seconds))
  on conflict (key) do update
    set value = excluded.value, expires_at = excluded.expires_at
    where k.expires_at is not null and k.expires_at <= now()
  returning k.key into claimed;
  return claimed is not null;
end;
$$;

-- Atomic fixed-window counter. Returns the count after incrementing.
create or replace function public.kv_incr(p_key text, p_window_seconds integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  result integer;
begin
  insert into kv_store as k (key, value, expires_at)
  values (p_key, to_jsonb(1), now() + make_interval(secs => p_window_seconds))
  on conflict (key) do update
    set value = case
          when k.expires_at is not null and k.expires_at <= now() then to_jsonb(1)
          else to_jsonb(coalesce((k.value #>> '{}')::integer, 0) + 1)
        end,
        expires_at = case
          when k.expires_at is not null and k.expires_at <= now()
            then now() + make_interval(secs => p_window_seconds)
          else k.expires_at
        end
  returning (k.value #>> '{}')::integer into result;
  return result;
end;
$$;

revoke all on function public.kv_claim(text, jsonb, integer) from public, anon, authenticated;
revoke all on function public.kv_incr(text, integer) from public, anon, authenticated;
grant execute on function public.kv_claim(text, jsonb, integer) to service_role;
grant execute on function public.kv_incr(text, integer) to service_role;
