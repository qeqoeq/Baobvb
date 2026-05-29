-- claim_invite_bootstrap_shared_reveal
--
-- Reinforces claim_relationship_invite() as the authoritative bootstrap point
-- for shared_relationship_reveals. Claiming a valid invite must leave behind a
-- durable shared row bound to inviter + claimer, without relying on the client
-- to create that row later through attach_shared_private_reading_reference().

-- DROP required before CREATE OR REPLACE: the return type changes from the Day 6
-- signature (returns table with a shared_record composite column) to an explicit
-- column list that includes counterpart_public_profile_id. Postgres refuses
-- CREATE OR REPLACE when the return type differs; DROP + recreate is the only path.
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
  relationship_name_revealed    boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  now_utc timestamptz := timezone('utc', now());
  invite_rec public.relationship_invites;
  shared_rec public.shared_relationship_reveals;
  counterpart_ppid uuid;
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
    shared_rec.relationship_name_revealed;
end;
$$;

grant execute on function public.claim_relationship_invite(text)
  to authenticated;
