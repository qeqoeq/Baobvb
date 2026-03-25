-- shared_reveal_day9_relationship_id_uuid_guard
--
-- Adds a strict UUID validation guard to every function that writes a new
-- relationship_id into shared_relationship_reveals or relationship_invites.
--
-- Context:
--   relationship_id columns are TEXT (not yet migrated to UUID type).
--   From this point forward, only valid UUID values may be written.
--   Legacy rows with r-{timestamp} IDs are preserved and not affected.
--   The text→uuid column migration is a separate stage.
--
-- Functions hardened:
--   1. create_relationship_invite   — primary client entry point
--   2. attach_shared_private_reading_reference — secondary write path
--
-- Guard mechanism:
--   p_relationship_id::uuid — uses PostgreSQL's own UUID parser.
--   Any non-UUID string raises 'invalid_text_representation', caught and
--   re-raised as a clear application-level exception.

-- ── Helper: assert_uuid_format ───────────────────────────────────────────────

create or replace function public.assert_uuid_format(p_value text, p_field_name text)
returns void
language plpgsql
as $$
begin
  begin
    perform p_value::uuid;
  exception when invalid_text_representation then
    raise exception '% must be a valid UUID, got: %', p_field_name, p_value;
  end;
end;
$$;

-- Internal helper only — not callable by clients directly.
revoke execute on function public.assert_uuid_format(text, text) from public;

-- ── create_relationship_invite — hardened ────────────────────────────────────

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

  -- UUID guard: reject any non-UUID relationship_id before any write.
  perform public.assert_uuid_format(p_relationship_id, 'relationship_id');

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

-- ── attach_shared_private_reading_reference — hardened ───────────────────────

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
  now_utc timestamptz := timezone('utc', now());
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

  -- UUID guard: reject any non-UUID relationship_id before any write.
  perform public.assert_uuid_format(p_relationship_id, 'relationship_id');

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
