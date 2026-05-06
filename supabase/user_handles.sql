-- user_handles
--
-- Stores the mapping: authenticated user account → their chosen Baobab handle.
--
-- Separation from user_public_profiles:
--   user_public_profiles maps auth.uid() → stable public UUID (system-provisioned).
--   user_handles maps auth.uid() → user-chosen handle (written by user via RPC).
--
-- Handle rules:
--   - @-prefixed, lowercase, [a-z0-9._-] only
--   - globally unique (enforced by unique index)
--   - normalized client-side before calling upsert_user_handle
--   - server rejects empty strings and invalid format as a defence-in-depth guard
--
-- All writes go through the upsert_user_handle() RPC.
-- No direct client insert/update/delete path.

create table if not exists public.user_handles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  handle     text not null,
  updated_at timestamptz not null default timezone('utc', now())
);

-- Unique index: the database-level uniqueness guarantee for handles.
-- This is the actual enforcement mechanism — the RPC traps unique_violation.
create unique index if not exists user_handles_handle_unique
  on public.user_handles (handle);

-- Index for future lookup-by-handle queries (e.g. friend search).
-- Does not duplicate the unique index above — that index is optimised for
-- conflict detection; this one is kept semantically distinct.
create index if not exists idx_user_handles_handle
  on public.user_handles (handle);

alter table public.user_handles enable row level security;

-- A user may only read their own row.
drop policy if exists user_handles_select_own on public.user_handles;
create policy user_handles_select_own
  on public.user_handles
  for select
  to authenticated
  using (auth.uid() = user_id);

-- ── RPC: upsert_user_handle ───────────────────────────────────────────────────
--
-- Claims or updates the caller's handle.
--
-- Idempotent: calling with the same handle the caller already holds is a no-op.
--
-- Return values:
--   { "success": true }                        — handle claimed or unchanged
--   { "success": false, "reason": "taken" }    — another user holds this handle
--
-- Exceptions (not return values):
--   'authenticated user required'              — auth.uid() is null
--   'handle cannot be empty'                   — null, blank, or bare "@"
--   'invalid handle format: ...'               — format guard failed
--
-- Security:
--   security definer — allows cross-user uniqueness check without RLS bypass by client.
--   user_id is never returned. The caller's identity is resolved from auth.uid() only.
--
-- Concurrency:
--   The unique_violation exception handler traps races: if two sessions try to claim
--   the same handle simultaneously, one succeeds and the other gets 'taken' via the
--   exception path — not via a pre-check SELECT that could race.
--
-- Normalisation:
--   Client normalises before calling (lib/identity-format.ts normalizeHandleInput).
--   Server re-validates format as defence-in-depth but does not re-normalise.

create or replace function public.upsert_user_handle(p_handle text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  now_utc   timestamptz := timezone('utc', now());
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  if p_handle is null or btrim(p_handle) = '' or p_handle = '@' then
    raise exception 'handle cannot be empty';
  end if;

  -- Format guard: server-side defence-in-depth.
  -- Client normalisation is the primary UX path; this blocks rogue clients.
  if p_handle !~ '^@[a-z0-9._-]+$' then
    raise exception 'invalid handle format: must match ^@[a-z0-9._-]+$';
  end if;

  begin
    insert into public.user_handles (user_id, handle, updated_at)
    values (caller_id, p_handle, now_utc)
    on conflict (user_id) do update
      set handle     = excluded.handle,
          updated_at = excluded.updated_at
    where user_handles.handle <> excluded.handle;
    -- The WHERE clause makes the UPDATE a no-op when the handle is unchanged,
    -- avoiding a spurious updated_at write and a wasted index update.

  exception when unique_violation then
    -- Another user_id holds this handle. Return a structured result so the
    -- client can surface a friendly "already taken" error without treating
    -- this as a network failure.
    return jsonb_build_object('success', false, 'reason', 'taken');
  end;

  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.upsert_user_handle(text) from public;
grant execute on function public.upsert_user_handle(text) to authenticated;
