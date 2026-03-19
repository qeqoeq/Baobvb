create extension if not exists pgcrypto with schema extensions;

create or replace function public.hash_relationship_invite_token(p_token text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

create or replace function public.create_relationship_invite(
  p_relationship_id text,
  p_inviter_side text,
  p_ttl_minutes integer default 10080
)
returns table(
  relationship_id text,
  invite_token text,
  expires_at timestamptz,
  inviter_side text,
  target_side text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  now_utc timestamptz := timezone('utc', now());
  shared_rec public.shared_relationship_reveals;
  token_raw text;
  token_hash text;
  target_side_value text;
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  if p_relationship_id is null or btrim(p_relationship_id) = '' then
    raise exception 'relationship_id is required';
  end if;

  if p_inviter_side not in ('sideA', 'sideB') then
    raise exception 'invalid inviter side, expected sideA or sideB';
  end if;

  if p_ttl_minutes is null or p_ttl_minutes <= 0 then
    raise exception 'invite ttl must be positive minutes';
  end if;

  target_side_value := case when p_inviter_side = 'sideA' then 'sideB' else 'sideA' end;

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

  token_raw := encode(extensions.gen_random_bytes(24), 'hex');
  token_hash := public.hash_relationship_invite_token(token_raw);
  expires_at := now_utc + make_interval(mins => p_ttl_minutes);

  insert into public.relationship_invites (
    token_hash,
    relationship_id,
    inviter_user_id,
    inviter_side,
    target_side,
    expires_at
  ) values (
    token_hash,
    p_relationship_id,
    caller_id,
    p_inviter_side,
    target_side_value,
    expires_at
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

grant execute on function public.create_relationship_invite(text, text, integer)
  to authenticated;

create or replace function public.claim_relationship_invite(
  p_invite_token text
)
returns table(
  relationship_id text,
  claimed_side text,
  shared_record public.shared_relationship_reveals
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

  return query
  select
    invite_rec.relationship_id,
    invite_rec.target_side,
    shared_rec;
end;
$$;

grant execute on function public.claim_relationship_invite(text)
  to authenticated;

create or replace function public.attach_shared_private_reading_reference(
  p_relationship_id text,
  p_side text,
  p_reading_id text,
  p_reading_payload jsonb
)
returns public.shared_relationship_reveals
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  rec public.shared_relationship_reveals;
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  if p_side not in ('sideA', 'sideB') then
    raise exception 'invalid side, expected sideA or sideB';
  end if;

  if p_relationship_id is null or btrim(p_relationship_id) = '' then
    raise exception 'relationship_id is required';
  end if;

  if p_reading_id is null or btrim(p_reading_id) = '' then
    raise exception 'reading_id is required';
  end if;

  perform public.assert_valid_shared_reading_payload(p_reading_payload);

  select sr.*
  into rec
  from public.shared_relationship_reveals as sr
  where sr.relationship_id = p_relationship_id
  for update;

  if not found then
    raise exception 'shared relationship does not exist yet for this invite';
  end if;

  if p_side = 'sideA' then
    if rec.side_a_user_id is null or rec.side_a_user_id <> caller_id then
      raise exception 'caller is not the claimed sideA participant';
    end if;

    if rec.side_a_reading_id is not null and rec.side_a_reading_id <> p_reading_id then
      raise exception 'side A reading id is already frozen';
    end if;

    if rec.side_a_reading_payload is not null and rec.side_a_reading_payload <> p_reading_payload then
      raise exception 'side A reading payload is already frozen';
    end if;

    perform set_config('baobab.allow_lifecycle_update', '1', true);

    update public.shared_relationship_reveals as sr
    set
      side_a_reading_id = coalesce(side_a_reading_id, p_reading_id),
      side_a_reading_payload = coalesce(side_a_reading_payload, p_reading_payload)
    where sr.relationship_id = p_relationship_id
    returning * into rec;
  else
    if rec.side_b_user_id is null or rec.side_b_user_id <> caller_id then
      raise exception 'caller is not the claimed sideB participant';
    end if;

    if rec.side_b_reading_id is not null and rec.side_b_reading_id <> p_reading_id then
      raise exception 'side B reading id is already frozen';
    end if;

    if rec.side_b_reading_payload is not null and rec.side_b_reading_payload <> p_reading_payload then
      raise exception 'side B reading payload is already frozen';
    end if;

    perform set_config('baobab.allow_lifecycle_update', '1', true);

    update public.shared_relationship_reveals as sr
    set
      side_b_reading_id = coalesce(side_b_reading_id, p_reading_id),
      side_b_reading_payload = coalesce(side_b_reading_payload, p_reading_payload)
    where sr.relationship_id = p_relationship_id
    returning * into rec;
  end if;

  return rec;
end;
$$;

grant execute on function public.attach_shared_private_reading_reference(text, text, text, jsonb)
  to authenticated;