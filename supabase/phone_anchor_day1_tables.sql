-- phone_anchor_day1_tables
--
-- Introduces the pending phone anchor infrastructure for multi-invite deduplication.
--
-- A phone anchor clusters shared relationship invites that target the same phone
-- number. When the owner of that number later joins Baobab and verifies their
-- number via OTP (future sprint), the server can match their anchor and notify
-- the inviting users without ever revealing scores, readings, or invite counts.
--
-- Privacy model:
--   The raw phone number (E.164) is NEVER stored anywhere in this schema.
--   phone_hash = HMAC-SHA256(E.164, pepper), hex-encoded.
--   The pepper is a server-side secret configured as 'app.phone_hash_pepper'.
--   It must NOT appear in any migration, client config, commit, or log.
--
-- Why HMAC and not plain SHA-256:
--   Phone numbers are a small, brute-forceable space (~10 billion globally).
--   A precomputed SHA-256 table of all E.164 numbers is feasible and publicly
--   constructable from any number list. If the database is compromised, plain
--   sha256(E.164) hashes could be reversed to recover phone numbers.
--   HMAC with an opaque server pepper eliminates this class of attack: the
--   hashes are worthless without the pepper, even with full DB access.
--
-- What these tables do NOT contain:
--   - Any phone number, raw or normalized.
--   - Any reading payload, score, or tier.
--   - Any private label or identity data.
--   - Any invitation count or inviter list.
--
-- What these tables do NOT do:
--   - They do not constitute proof of identity.
--   - They do not trigger any reveal or merge.
--   - They do not expose any data to any client.
--   - Mutual reveal remains the sole gate for score/tier/reading visibility.
--
-- Pepper configuration:
--   In Supabase, set via:
--     ALTER DATABASE postgres SET "app.phone_hash_pepper" = '<secret>';
--   Or via Supabase Vault / a secrets manager injected at connection time.
--   The secret must never appear in this file or any client-accessible source.
--
-- Out of scope in this migration (future sprints):
--   - phone_anchor_claims table
--   - resolve_phone_anchor_for_current_user RPC (post-OTP resolution)
--   - notification_outbox integration
--   - TTL purge job

-- ── Extensions ───────────────────────────────────────────────────────────────
-- pgcrypto provides extensions.hmac and extensions.digest.
-- Already enabled in shared_reveal_day6_invites.sql — this call is idempotent.
create extension if not exists pgcrypto;

-- ── hash_phone_anchor_e164 ───────────────────────────────────────────────────
-- Internal helper: HMAC-SHA256(E.164, pepper) → hex.
--
-- Security rules:
--   - Not callable by any client (revoked from public below).
--   - Called only from register_phone_invite_anchor (security definer).
--   - Reads the pepper via current_setting — raises if absent or empty.
--   - Validates E.164 format before hashing.
--   - Never stores or returns the raw phone number.
--   - Never returns the pepper.

create or replace function public.hash_phone_anchor_e164(p_phone_e164 text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  pepper_v text;
begin
  if p_phone_e164 is null or btrim(p_phone_e164) = '' then
    raise exception 'phone_e164 is required';
  end if;

  -- E.164 format guard. The client-side normalizePhoneForAnchor is the primary
  -- path; this is defence-in-depth against rogue or buggy callers.
  if p_phone_e164 !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'phone_e164 must be in E.164 format (e.g. +33612345678)';
  end if;

  -- Read the pepper. missing_ok=true so we can provide a clear exception message.
  pepper_v := current_setting('app.phone_hash_pepper', true);

  if pepper_v is null or btrim(pepper_v) = '' then
    raise exception
      'app.phone_hash_pepper is not configured — phone anchor hashing is unavailable. '
      'Set it via: ALTER DATABASE postgres SET "app.phone_hash_pepper" = ''<secret>'';';
  end if;

  -- HMAC-SHA256(E.164, pepper) → hex.
  -- extensions.hmac follows the same schema convention as extensions.digest (pgcrypto).
  -- The raw E.164 is never written to any table, log, or returned value.
  return encode(extensions.hmac(p_phone_e164, pepper_v, 'sha256'), 'hex');
end;
$$;

-- Internal helper only. Revoke from public so no client role can call it directly.
-- register_phone_invite_anchor (security definer, runs as owner) calls it internally.
revoke execute on function public.hash_phone_anchor_e164(text) from public;

-- ── pending_phone_anchors ────────────────────────────────────────────────────
-- One row per unique HMAC-hashed phone number.
-- phone_hash is the only phone-derived data stored — the raw E.164 is never present.
-- hash_version tracks the algorithm to allow future migration (e.g. HMAC-SHA256 v2
-- with a rotated pepper) without silently mixing hash generations.

create table if not exists public.pending_phone_anchors (
  id           uuid        not null default gen_random_uuid() primary key,
  phone_hash   text        not null,
  hash_version text        not null default 'hmac_sha256_v1',
  created_at   timestamptz not null default timezone('utc', now()),

  constraint pending_phone_anchors_hash_version_check
    check (hash_version in ('hmac_sha256_v1'))
);

-- Unique index on phone_hash — the deduplication key for multi-invite clustering.
create unique index if not exists pending_phone_anchors_phone_hash_unique
  on public.pending_phone_anchors (phone_hash);

-- Index on created_at for future TTL purge queries (stale unclaimed anchors).
create index if not exists idx_pending_phone_anchors_created_at
  on public.pending_phone_anchors (created_at);

alter table public.pending_phone_anchors enable row level security;
-- No SELECT policy for clients. All access is through security definer RPCs.
-- phone_hash must never be returned to any client under any policy.

-- ── phone_anchor_members ─────────────────────────────────────────────────────
-- Binds a relationship_id (one specific inviter → one specific invite) to a
-- phone anchor. Multiple inviters targeting the same E.164 produce multiple
-- rows sharing the same anchor_id — this is the multi-invite dedup link.
--
-- Contains: which anchor, which relationship, who invited.
-- Does NOT contain: any phone number, reading, score, private label, or identity.

create table if not exists public.phone_anchor_members (
  anchor_id       uuid        not null
    references public.pending_phone_anchors(id) on delete cascade,
  relationship_id text        not null,
  inviter_user_id uuid        not null
    references auth.users(id) on delete cascade,
  registered_at   timestamptz not null default timezone('utc', now()),

  primary key (anchor_id, relationship_id)
);

-- anchor_id is the leading key of the PK index — no additional index needed.

create index if not exists idx_phone_anchor_members_inviter_user_id
  on public.phone_anchor_members (inviter_user_id);

create index if not exists idx_phone_anchor_members_relationship_id
  on public.phone_anchor_members (relationship_id);

alter table public.phone_anchor_members enable row level security;
-- No SELECT policy for clients. All access is through security definer RPCs.

-- ── register_phone_invite_anchor ─────────────────────────────────────────────
-- Client-facing RPC. Associates a phone number with a relationship the caller
-- has already created via create_relationship_invite.
--
-- This call is ADDITIVE. Clients must handle errors silently and never block
-- the invite flow on failure. If app.phone_hash_pepper is not configured, the
-- function raises; clients should catch and continue.
--
-- Security invariants:
--   1. Caller must be authenticated.
--   2. p_relationship_id must be a valid UUID (assert_uuid_format from day9).
--   3. p_phone_e164 must match ^\+[1-9][0-9]{6,14}$.
--   4. Caller must be the inviter_user_id for this relationship_id in
--      relationship_invites. This prevents attaching anchors to relationships
--      the caller did not create.
--   5. The HMAC is computed server-side only (hash_phone_anchor_e164).
--   6. Neither the hash nor any phone data is returned to the caller.
--   7. Idempotent: repeated calls with the same inputs are no-ops.
--
-- Ownership guard:
--   Checks relationship_invites.inviter_user_id = caller_id for this
--   relationship_id. Invite expiry is NOT checked — anchor registration is a
--   metadata operation decoupled from invite validity. If multiple invite rows
--   exist for the same relationship_id and caller, any matching row suffices.

create or replace function public.register_phone_invite_anchor(
  p_relationship_id text,
  p_phone_e164      text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id    uuid := auth.uid();
  phone_hash_v text;
  anchor_id_v  uuid;
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  -- UUID guard: reuses assert_uuid_format introduced in shared_reveal_day9.
  perform public.assert_uuid_format(p_relationship_id, 'relationship_id');

  if p_phone_e164 is null or btrim(p_phone_e164) = '' then
    raise exception 'phone_e164 is required';
  end if;

  if p_phone_e164 !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'phone_e164 must be in E.164 format (e.g. +33612345678)';
  end if;

  -- Ownership guard: caller must be the inviter for this relationship_id.
  if not exists (
    select 1
    from public.relationship_invites ri
    where ri.relationship_id = p_relationship_id
      and ri.inviter_user_id = caller_id
  ) then
    raise exception 'relationship_id not found or caller is not the inviter';
  end if;

  -- Compute HMAC server-side. The raw E.164 is never written to any table.
  -- Raises if app.phone_hash_pepper is not configured.
  phone_hash_v := public.hash_phone_anchor_e164(p_phone_e164);

  -- Upsert the anchor (idempotent: same E.164 → same HMAC → same anchor row).
  insert into public.pending_phone_anchors (phone_hash)
  values (phone_hash_v)
  on conflict (phone_hash) do nothing;

  select id
  into anchor_id_v
  from public.pending_phone_anchors
  where phone_hash = phone_hash_v;

  -- Insert the member (idempotent: same anchor_id + relationship_id → no-op).
  insert into public.phone_anchor_members (anchor_id, relationship_id, inviter_user_id)
  values (anchor_id_v, p_relationship_id, caller_id)
  on conflict (anchor_id, relationship_id) do nothing;

  -- Returns void.
  -- No hash, no anchor_id, no count, no inviter list is ever surfaced.
end;
$$;

revoke execute on function public.register_phone_invite_anchor(text, text) from public;
grant execute on function public.register_phone_invite_anchor(text, text) to authenticated;
