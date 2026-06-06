-- invite_inviter_identity_snapshot
--
-- Adds a minimal, immutable snapshot of the inviter's public identity to
-- relationship_invites so the recipient (B) can identify who invited them
-- before claim, and the local relation created post-claim is no longer
-- generic ("Private link" / "?").
--
-- Doctrine
--   - A chooses to send an invitation from their own profile: exposing their
--     identity in the strict scope of this invite is consented by act of
--     sending.
--   - Snapshot is frozen at create time. If A renames themselves later,
--     pre-existing invites keep the old name (intent at send time).
--   - No auth.uid is ever exposed.
--   - No reading payload, no mutual_score, no tier is ever exposed.
--   - No phone, no email is ever stored.
--   - Token entropy (24 random bytes = 192 bits) is the primary guard against
--     enumeration. No DB-level rate-limit is provided — the client must
--     swallow preview errors silently to never block the invite flow.
--
-- Migration scope
--   1. ALTER public.relationship_invites — add 3 snapshot columns.
--   2. Recreate public.create_relationship_invite with 3 optional snapshot
--      params (back-compat: defaults preserve 3-arg call-sites until they
--      migrate). Function body otherwise preserves day9 hardened logic.
--   3. Create public.preview_relationship_invite — security-definer RPC
--      scoped to a single token, returns ONLY snapshot + lifecycle timestamps.
--      Authenticated only. No JOINs to auth.users, user_handles, or
--      user_public_profiles. relationship_id is not returned (B already
--      knows it from the URL path).
--   4. Recreate public.claim_relationship_invite to include the 3 snapshot
--      columns in its RETURN TABLE so the client can materialize the local
--      relation with inviter identity in a single round-trip.

-- ─────────────────────────────────────────────────────────────
-- 1. Schema: add snapshot columns
-- ─────────────────────────────────────────────────────────────

alter table public.relationship_invites
  add column if not exists inviter_display_name text not null default '',
  add column if not exists inviter_handle       text,
  add column if not exists inviter_avatar_seed  text;

comment on column public.relationship_invites.inviter_display_name is
  'Immutable snapshot of the inviter''s displayName at send time. '
  'Frozen by intent: never updated if A renames themselves later. '
  'Empty string indicates a legacy invite created before this column existed; '
  'the client falls back to "Someone" in that case.';

comment on column public.relationship_invites.inviter_handle is
  'Immutable snapshot of the inviter''s handle at send time. '
  'Null when A had no handle provisioned at the moment of sending.';

comment on column public.relationship_invites.inviter_avatar_seed is
  'Immutable snapshot of the inviter''s avatar seed at send time. '
  'Null when A had no avatarSeed provisioned. Never a phone, email, or PII '
  'fragment — only an opaque seed used to derive an abstract avatar.';

-- ─────────────────────────────────────────────────────────────
-- 2. create_relationship_invite — extended signature
-- ─────────────────────────────────────────────────────────────
--
-- Signature changes (return table unchanged):
--   added p_inviter_display_name text default ''
--   added p_inviter_handle       text default null
--   added p_inviter_avatar_seed  text default null
--
-- DROP without CASCADE: if any unexpected dependents exist they will surface
-- as an explicit migration error rather than be silently dropped.

drop function if exists public.create_relationship_invite(text, text, integer);

create or replace function public.create_relationship_invite(
  p_relationship_id      text,
  p_inviter_side         text,
  p_ttl_minutes          integer default 10080,
  p_inviter_display_name text    default '',
  p_inviter_handle       text    default null,
  p_inviter_avatar_seed  text    default null
)
returns table(
  relationship_id text,
  invite_token    text,
  expires_at      timestamptz,
  inviter_side    text,
  target_side     text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id              uuid := auth.uid();
  now_utc                timestamptz := timezone('utc', now());
  shared_rec             public.shared_relationship_reveals;
  token_raw              text;
  token_hash             text;
  target_side_value      text;
  display_name_snapshot  text;
  handle_snapshot        text;
  avatar_seed_snapshot   text;
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  if p_relationship_id is null or btrim(p_relationship_id) = '' then
    raise exception 'relationship_id is required';
  end if;

  -- UUID guard: reject any non-UUID relationship_id before any write.
  perform public.assert_uuid_format(p_relationship_id, 'relationship_id');

  if p_inviter_side not in ('sideA', 'sideB') then
    raise exception 'invalid inviter side, expected sideA or sideB';
  end if;

  if p_ttl_minutes is null or p_ttl_minutes <= 0 then
    raise exception 'invite ttl must be positive minutes';
  end if;

  -- Snapshot normalization.
  --   display_name: trimmed, empty preserved as '' (matches column default).
  --   handle / avatar_seed: optional — whitespace-only is coerced to null.
  display_name_snapshot := coalesce(btrim(p_inviter_display_name), '');

  if p_inviter_handle is not null and btrim(p_inviter_handle) <> '' then
    handle_snapshot := btrim(p_inviter_handle);
  else
    handle_snapshot := null;
  end if;

  if p_inviter_avatar_seed is not null and btrim(p_inviter_avatar_seed) <> '' then
    avatar_seed_snapshot := btrim(p_inviter_avatar_seed);
  else
    avatar_seed_snapshot := null;
  end if;

  target_side_value := case when p_inviter_side = 'sideA' then 'sideB' else 'sideA' end;

  -- ── bootstrap / lookup shared_relationship_reveals (preserved from day9) ──

  select sr.*
  into shared_rec
  from public.shared_relationship_reveals as sr
  where sr.relationship_id = p_relationship_id
  for update;

  if not found then
    if p_inviter_side = 'sideA' then
      insert into public.shared_relationship_reveals (
        relationship_id,
        side_a_user_id
      ) values (
        p_relationship_id,
        caller_id
      )
      returning * into shared_rec;
    else
      insert into public.shared_relationship_reveals (
        relationship_id,
        side_b_user_id
      ) values (
        p_relationship_id,
        caller_id
      )
      returning * into shared_rec;
    end if;
  else
    if p_inviter_side = 'sideA' then
      if shared_rec.side_b_user_id = caller_id then
        raise exception 'cannot create invite from both sides for same user';
      end if;

      if shared_rec.side_a_user_id is not null and shared_rec.side_a_user_id <> caller_id then
        raise exception 'side A already belongs to another participant';
      end if;

      if shared_rec.side_a_user_id is null then
        perform set_config('baobab.allow_lifecycle_update', '1', true);

        update public.shared_relationship_reveals as sr
        set side_a_user_id = caller_id
        where sr.relationship_id = p_relationship_id
        returning * into shared_rec;
      end if;
    else
      if shared_rec.side_a_user_id = caller_id then
        raise exception 'cannot create invite from both sides for same user';
      end if;

      if shared_rec.side_b_user_id is not null and shared_rec.side_b_user_id <> caller_id then
        raise exception 'side B already belongs to another participant';
      end if;

      if shared_rec.side_b_user_id is null then
        perform set_config('baobab.allow_lifecycle_update', '1', true);

        update public.shared_relationship_reveals as sr
        set side_b_user_id = caller_id
        where sr.relationship_id = p_relationship_id
        returning * into shared_rec;
      end if;
    end if;
  end if;

  token_raw  := encode(extensions.gen_random_bytes(24), 'hex');
  token_hash := public.hash_relationship_invite_token(token_raw);
  expires_at := now_utc + make_interval(mins => p_ttl_minutes);

  insert into public.relationship_invites (
    token_hash,
    relationship_id,
    inviter_user_id,
    inviter_side,
    target_side,
    expires_at,
    inviter_display_name,
    inviter_handle,
    inviter_avatar_seed
  ) values (
    token_hash,
    p_relationship_id,
    caller_id,
    p_inviter_side,
    target_side_value,
    expires_at,
    display_name_snapshot,
    handle_snapshot,
    avatar_seed_snapshot
  );

  return query
  select
    p_relationship_id,
    token_raw,
    now_utc + make_interval(mins => p_ttl_minutes),
    p_inviter_side,
    target_side_value;
end;
$$;

grant execute on function public.create_relationship_invite(
  text, text, integer, text, text, text
) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3. preview_relationship_invite — new RPC
-- ─────────────────────────────────────────────────────────────
--
-- Returns only the inviter snapshot + lifecycle timestamps for a given
-- invite token. Used by InviteArrivalScreen before claim to render
-- "Alice (@alice) opened a private space with you" instead of "Someone".
--
-- Privacy contract:
--   - Does NOT return: relationship_id (already in URL), inviter_user_id,
--     claimed_by_user_id, token_hash, inviter_side, target_side, created_at,
--     updated_at, or any reading / score / tier / reveal data.
--   - Does NOT join: auth.users, user_handles, user_public_profiles, or
--     shared_relationship_reveals.
--   - Refuses: null/empty token, invalid token, expired token, already
--     claimed token.
--   - Authenticated only — anon role is intentionally not granted.
--
-- Token entropy: 24 random bytes (192 bits) is the sole guard against
-- enumeration. Acceptable: brute force search space exceeds any practical
-- attacker. Client must treat ALL errors as opaque ("preview unavailable")
-- and never let preview failure block the invite flow.

create or replace function public.preview_relationship_invite(
  p_invite_token text
)
returns table(
  inviter_display_name text,
  inviter_handle       text,
  inviter_avatar_seed  text,
  expires_at           timestamptz,
  claimed_at           timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  caller_id  uuid := auth.uid();
  now_utc    timestamptz := timezone('utc', now());
  invite_rec public.relationship_invites;
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  if p_invite_token is null or btrim(p_invite_token) = '' then
    raise exception 'invite token is required';
  end if;

  select ri.*
  into invite_rec
  from public.relationship_invites as ri
  where ri.token_hash = public.hash_relationship_invite_token(p_invite_token);

  if not found then
    raise exception 'invite token is invalid';
  end if;

  if invite_rec.expires_at <= now_utc then
    raise exception 'invite token has expired';
  end if;

  if invite_rec.claimed_at is not null then
    raise exception 'invite has already been used';
  end if;

  return query
  select
    invite_rec.inviter_display_name,
    invite_rec.inviter_handle,
    invite_rec.inviter_avatar_seed,
    invite_rec.expires_at,
    invite_rec.claimed_at;
end;
$$;

revoke execute on function public.preview_relationship_invite(text) from public;
grant  execute on function public.preview_relationship_invite(text) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- 4. claim_relationship_invite — extended return with snapshot
-- ─────────────────────────────────────────────────────────────
--
-- All claim semantics preserved from migration 20260530230041
-- (fix_claim_invite_ambiguous_relationship_id). Only the RETURN TABLE shape
-- is extended with the 3 snapshot columns so the client can materialize the
-- local relation with the inviter's identity in a single round-trip rather
-- than chaining preview_relationship_invite + claim_relationship_invite.
--
-- DROP required: return table shape changes. No CASCADE — any unexpected
-- dependents surface as a migration error.
--
-- Invariants preserved
--   - SECURITY DEFINER + search_path = public
--   - auth.uid() required
--   - Token hashing via hash_relationship_invite_token
--   - Expired invite check
--   - Already-claimed-by-different-user check
--   - Self-claim guard (expected_side_a_user_id = expected_side_b_user_id)
--   - INSERT ... ON CONFLICT bootstrap of shared_relationship_reveals
--   - target_side / inviter_side consistency checks
--   - counterpart_public_profile_id resolution
--   - #variable_conflict use_column pragma (resolves OUT/column ambiguity)
--   - No auth UIDs in return, no reading payloads, no internal metadata

drop function if exists public.claim_relationship_invite(text);

create or replace function public.claim_relationship_invite(
  p_invite_token text
)
returns table(
  relationship_id               text,
  claimed_side                  text,
  counterpart_public_profile_id uuid,
  status                        text,
  side_a_present                boolean,
  side_b_present                boolean,
  side_a_reading_id             text,
  side_b_reading_id             text,
  cooking_started_at            timestamptz,
  unlock_at                     timestamptz,
  ready_at                      timestamptz,
  revealed_at                   timestamptz,
  relationship_name_revealed    boolean,
  inviter_display_name          text,
  inviter_handle                text,
  inviter_avatar_seed           text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  caller_id               uuid := auth.uid();
  now_utc                 timestamptz := timezone('utc', now());
  invite_rec              public.relationship_invites;
  shared_rec              public.shared_relationship_reveals;
  counterpart_ppid        uuid;
  expected_side_a_user_id uuid;
  expected_side_b_user_id uuid;
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  if p_invite_token is null or btrim(p_invite_token) = '' then
    raise exception 'invite token is required';
  end if;

  select ri.*
  into invite_rec
  from public.relationship_invites as ri
  where ri.token_hash = public.hash_relationship_invite_token(p_invite_token)
  for update;

  if not found then
    raise exception 'invite token is invalid';
  end if;

  if invite_rec.expires_at <= now_utc then
    raise exception 'invite token has expired';
  end if;

  if invite_rec.claimed_by_user_id is not null and invite_rec.claimed_by_user_id <> caller_id then
    raise exception 'invite token already claimed';
  end if;

  if invite_rec.claimed_by_user_id is null then
    update public.relationship_invites as ri
    set
      claimed_at = now_utc,
      claimed_by_user_id = caller_id
    where ri.id = invite_rec.id
    returning * into invite_rec;
  end if;

  perform public.assert_uuid_format(invite_rec.relationship_id, 'relationship_id');

  expected_side_a_user_id := case
    when invite_rec.inviter_side = 'sideA' then invite_rec.inviter_user_id
    else caller_id
  end;
  expected_side_b_user_id := case
    when invite_rec.inviter_side = 'sideA' then caller_id
    else invite_rec.inviter_user_id
  end;

  if expected_side_a_user_id = expected_side_b_user_id then
    raise exception 'cannot claim both sides in the same shared reveal record';
  end if;

  perform set_config('baobab.allow_lifecycle_update', '1', true);

  insert into public.shared_relationship_reveals (
    relationship_id,
    side_a_user_id,
    side_b_user_id,
    status,
    relationship_name_revealed,
    finalized_version
  ) values (
    invite_rec.relationship_id,
    expected_side_a_user_id,
    expected_side_b_user_id,
    'waiting_other_side',
    false,
    1
  )
  on conflict (relationship_id) do update
  set
    side_a_user_id = coalesce(public.shared_relationship_reveals.side_a_user_id, excluded.side_a_user_id),
    side_b_user_id = coalesce(public.shared_relationship_reveals.side_b_user_id, excluded.side_b_user_id)
  where
    (
      public.shared_relationship_reveals.side_a_user_id is null
      or public.shared_relationship_reveals.side_a_user_id = excluded.side_a_user_id
    )
    and (
      public.shared_relationship_reveals.side_b_user_id is null
      or public.shared_relationship_reveals.side_b_user_id = excluded.side_b_user_id
    )
  returning * into shared_rec;

  if not found then
    select sr.*
    into shared_rec
    from public.shared_relationship_reveals as sr
    where sr.relationship_id = invite_rec.relationship_id;

    if shared_rec.side_a_user_id is not null and shared_rec.side_a_user_id <> expected_side_a_user_id then
      raise exception 'side A already belongs to another participant';
    end if;

    if shared_rec.side_b_user_id is not null and shared_rec.side_b_user_id <> expected_side_b_user_id then
      raise exception 'side B already belongs to another participant';
    end if;

    raise exception 'shared reveal claim could not be bootstrapped';
  end if;

  if invite_rec.target_side = 'sideA' then
    if shared_rec.side_a_user_id is distinct from caller_id then
      raise exception 'target side already belongs to another participant';
    end if;
    if shared_rec.side_b_user_id is distinct from invite_rec.inviter_user_id then
      raise exception 'inviter side does not match existing participant';
    end if;
  else
    if shared_rec.side_b_user_id is distinct from caller_id then
      raise exception 'target side already belongs to another participant';
    end if;
    if shared_rec.side_a_user_id is distinct from invite_rec.inviter_user_id then
      raise exception 'inviter side does not match existing participant';
    end if;
  end if;

  select upp.public_profile_id
  into counterpart_ppid
  from public.user_public_profiles upp
  where upp.user_id = invite_rec.inviter_user_id;

  return query
  select
    invite_rec.relationship_id,
    invite_rec.target_side,
    counterpart_ppid,
    shared_rec.status,
    (shared_rec.side_a_user_id is not null),
    (shared_rec.side_b_user_id is not null),
    shared_rec.side_a_reading_id,
    shared_rec.side_b_reading_id,
    shared_rec.cooking_started_at,
    shared_rec.unlock_at,
    shared_rec.ready_at,
    shared_rec.revealed_at,
    shared_rec.relationship_name_revealed,
    invite_rec.inviter_display_name,
    invite_rec.inviter_handle,
    invite_rec.inviter_avatar_seed;
end;
$$;

grant execute on function public.claim_relationship_invite(text)
  to authenticated;
