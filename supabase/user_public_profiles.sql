-- user_public_profiles
--
-- Stores the mapping: authenticated user account → stable public profile identity.
--
-- Separation of concerns:
--   user_id          = auth.uid() — the private internal account identity.
--                      Never exposed publicly. Used only as the primary key / FK.
--   public_profile_id = a distinct UUID assigned at first provisioning.
--                      This is the identity exposed in QR cards, scan deduplication,
--                      and future social graph features.
--
-- The two UUIDs are intentionally different values with different semantics.
-- Direct client reads are gated by RLS to the owning user only.
-- All writes go through the get_or_create_public_profile_id() RPC.

create table if not exists public.user_public_profiles (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  public_profile_id uuid not null unique default gen_random_uuid(),
  created_at       timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_public_profiles_public_profile_id
  on public.user_public_profiles (public_profile_id);

alter table public.user_public_profiles enable row level security;

-- A user may only read their own row. No direct insert/update/delete.
drop policy if exists user_public_profiles_select_own on public.user_public_profiles;
create policy user_public_profiles_select_own
  on public.user_public_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

-- ── RPC: get_or_create_public_profile_id ────────────────────────────────────
--
-- Returns the caller's public_profile_id, creating the row if it does not exist.
-- Idempotent: safe to call on every app bootstrap.
-- Takes no client parameters — the user identity is resolved from auth.uid().
-- Returns the UUID as a text value (Supabase JS clients receive it as a string).

create or replace function public.get_or_create_public_profile_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  result_id uuid;
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  -- Upsert: insert if absent, do nothing if the row already exists.
  insert into public.user_public_profiles (user_id)
  values (caller_id)
  on conflict (user_id) do nothing;

  -- Always read back the stored value — covers both the create and the get path.
  select public_profile_id
  into result_id
  from public.user_public_profiles
  where user_id = caller_id;

  return result_id;
end;
$$;

revoke execute on function public.get_or_create_public_profile_id() from public;
grant execute on function public.get_or_create_public_profile_id() to authenticated;

-- ── RPC: lookup_public_profile ───────────────────────────────────────────────
--
-- Checks whether a given public_profile_id belongs to a registered Baobab user.
-- Returns true if found, false if not.
--
-- Security model:
--   - Caller must be authenticated (auth.uid() is validated).
--   - security definer is required to bypass the own-row RLS policy and allow
--     cross-user existence checks on public_profile_id.
--   - Only existence is disclosed — user_id is never returned.
--   - The looked-up UUID is public by design (it appears in QR cards).
--
-- What this does NOT imply:
--   - Any relational connection between caller and the looked-up profile.
--   - Any shared reveal, mutual disclosure, or profile data access.
--   - "Found" means only: this UUID is registered in Baobab.

create or replace function public.lookup_public_profile(lookup_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'authenticated user required';
  end if;

  return exists (
    select 1
    from public.user_public_profiles
    where public_profile_id = lookup_id
  );
end;
$$;

revoke execute on function public.lookup_public_profile(uuid) from public;
grant execute on function public.lookup_public_profile(uuid) to authenticated;
