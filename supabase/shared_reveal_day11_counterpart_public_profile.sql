-- shared_reveal_day11_counterpart_public_profile
--
-- Enriches my_shared_relationships() and claim_relationship_invite() with
-- counterpart_public_profile_id: the public profile UUID of the other participant.
--
-- Security rationale:
--   - public_profile_id is already the shareable public identity (appears in QR cards).
--   - Both participants have given mutual consent (invite created + claimed).
--   - Both RPCs are security definer — the JOIN to user_public_profiles is evaluated
--     server-side; no auth.uid() of the counterpart is ever returned to the client.
--   - This replaces / improves on the existing claim response which currently returns the
--     full shared_relationship_reveals row including side_a_user_id / side_b_user_id
--     (internal auth UIDs — strictly more sensitive than a public_profile_id).
--
-- What counterpart_public_profile_id IS:
--   - The publicProfileId of the other participant in this shared relation.
--   - Null when the other participant has not yet provisioned a public profile.
--   - Null when the other participant slot is not yet filled (waiting_other_side).
--
-- What counterpart_public_profile_id is NOT:
--   - A unique relation key. One person can participate in many shared relations.
--   - A replacement for canonicalRelationId as the relation join key.
--   - Authorization to auto-merge with an existing local draft.
--
-- Usage:
--   The client stores this signal on the local Relation object. It enables a future
--   UI-assisted reconciliation suggestion: "this shared relation may correspond to
--   this scan draft (same sourcePublicProfileId)." No automatic merge.

-- ── my_shared_relationships (enriched) ──────────────────────────────────────

create or replace function public.my_shared_relationships()
returns table(
  relationship_id            text,
  status                     text,
  my_side                    text,
  side_a_present             boolean,
  side_b_present             boolean,
  side_a_reading_id          text,
  side_b_reading_id          text,
  cooking_started_at         timestamptz,
  unlock_at                  timestamptz,
  ready_at                   timestamptz,
  revealed_at                timestamptz,
  relationship_name_revealed boolean,
  counterpart_public_profile_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  return query
  select
    sr.relationship_id,
    sr.status,
    case when sr.side_a_user_id = caller_id then 'sideA' else 'sideB' end as my_side,
    (sr.side_a_user_id is not null) as side_a_present,
    (sr.side_b_user_id is not null) as side_b_present,
    sr.side_a_reading_id,
    sr.side_b_reading_id,
    sr.cooking_started_at,
    sr.unlock_at,
    sr.ready_at,
    sr.revealed_at,
    sr.relationship_name_revealed,
    -- Resolve the counterpart's public_profile_id server-side.
    -- Never exposes the counterpart's auth.uid() (user_id) — only their public identity.
    -- Null when the counterpart has not provisioned a public profile, or when their
    -- participant slot is not yet filled.
    (
      select upp.public_profile_id
      from public.user_public_profiles upp
      where upp.user_id = case
        when sr.side_a_user_id = caller_id then sr.side_b_user_id
        else sr.side_a_user_id
      end
    ) as counterpart_public_profile_id
  from public.shared_relationship_reveals sr
  where
    (sr.side_a_user_id = caller_id or sr.side_b_user_id = caller_id)
    -- Exclude legacy r-{timestamp} IDs. Only canonical UUID relationship_ids are returned.
    and sr.relationship_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
end;
$$;

revoke execute on function public.my_shared_relationships() from public;
grant execute on function public.my_shared_relationships() to authenticated;

-- ── claim_relationship_invite (enriched) ────────────────────────────────────

create or replace function public.claim_relationship_invite(
  p_invite_token text
)
returns table(
  relationship_id               text,
  claimed_side                  text,
  counterpart_public_profile_id uuid,
  -- Sanitized shared state — no auth UIDs, no reading payloads, no internal row metadata.
  -- side_a_present / side_b_present are boolean presence signals derived server-side
  -- so the client never needs to inspect auth UIDs to determine participant binding.
  status                        text,
  side_a_present                boolean,
  side_b_present                boolean,
  side_a_reading_id             text,
  side_b_reading_id             text,
  cooking_started_at            timestamptz,
  unlock_at                     timestamptz,
  ready_at                      timestamptz,
  revealed_at                   timestamptz,
  relationship_name_revealed    boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id      uuid := auth.uid();
  now_utc        timestamptz := timezone('utc', now());
  invite_rec     public.relationship_invites;
  shared_rec     public.shared_relationship_reveals;
  counterpart_ppid uuid;
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

  select sr.*
  into shared_rec
  from public.shared_relationship_reveals as sr
  where sr.relationship_id = invite_rec.relationship_id
  for update;

  if not found then
    if invite_rec.inviter_side = 'sideA' then
      insert into public.shared_relationship_reveals (
        relationship_id,
        side_a_user_id,
        side_b_user_id
      ) values (
        invite_rec.relationship_id,
        invite_rec.inviter_user_id,
        caller_id
      )
      returning * into shared_rec;
    else
      insert into public.shared_relationship_reveals (
        relationship_id,
        side_a_user_id,
        side_b_user_id
      ) values (
        invite_rec.relationship_id,
        caller_id,
        invite_rec.inviter_user_id
      )
      returning * into shared_rec;
    end if;
  else
    if invite_rec.target_side = 'sideA' then
      if shared_rec.side_b_user_id = caller_id then
        raise exception 'cannot claim both sides in the same shared reveal record';
      end if;

      if shared_rec.side_a_user_id is not null and shared_rec.side_a_user_id <> caller_id then
        raise exception 'target side already belongs to another participant';
      end if;

      if shared_rec.side_a_user_id is null then
        perform set_config('baobab.allow_lifecycle_update', '1', true);

        update public.shared_relationship_reveals as sr
        set side_a_user_id = caller_id
        where sr.relationship_id = invite_rec.relationship_id
        returning * into shared_rec;
      end if;
    else
      if shared_rec.side_a_user_id = caller_id then
        raise exception 'cannot claim both sides in the same shared reveal record';
      end if;

      if shared_rec.side_b_user_id is not null and shared_rec.side_b_user_id <> caller_id then
        raise exception 'target side already belongs to another participant';
      end if;

      if shared_rec.side_b_user_id is null then
        perform set_config('baobab.allow_lifecycle_update', '1', true);

        update public.shared_relationship_reveals as sr
        set side_b_user_id = caller_id
        where sr.relationship_id = invite_rec.relationship_id
        returning * into shared_rec;
      end if;
    end if;
  end if;

  -- Resolve the inviter's public_profile_id as the counterpart signal.
  -- invite_rec.inviter_user_id is always the other participant (they created the invite,
  -- the caller claimed it). This avoids comparing sides manually.
  -- Null if the inviter has not yet provisioned a public profile.
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
    shared_rec.relationship_name_revealed;
end;
$$;

grant execute on function public.claim_relationship_invite(text)
  to authenticated;
