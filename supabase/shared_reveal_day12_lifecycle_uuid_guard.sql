-- shared_reveal_day12_lifecycle_uuid_guard
--
-- Adds assert_uuid_format to the three reveal lifecycle RPCs that were missing
-- the UUID guard introduced in Day 9 for create_relationship_invite and
-- attach_shared_private_reading_reference.
--
-- Context:
--   Day 9 hardened the two primary write-path RPCs (invite creation + reading
--   attachment) against non-UUID relationship_ids. The three lifecycle RPCs
--   (start cooking, mark ready, open reveal) were left without the guard because
--   they are participant-gated — only users already bound to a row can call them.
--   The guard is added here for consistency and defence-in-depth: a participant
--   bound to a legacy r-{timestamp} row cannot trigger lifecycle transitions.
--
-- No behaviour change for valid UUID inputs.
-- Functions are otherwise identical to their Day 3 bodies.

-- ── start_shared_cooking_reveal_if_ready ─────────────────────────────────────

create or replace function public.start_shared_cooking_reveal_if_ready(
  p_relationship_id text
)
returns public.shared_relationship_reveals
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  rec public.shared_relationship_reveals;
  computed_final_score integer;
  computed_tier text;
  now_utc timestamptz := timezone('utc', now());
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  perform public.assert_uuid_format(p_relationship_id, 'relationship_id');

  select *
  into rec
  from public.shared_relationship_reveals
  where relationship_id = p_relationship_id
  for update;

  if not found then
    return null;
  end if;

  if caller_id <> rec.side_a_user_id and caller_id <> rec.side_b_user_id then
    raise exception 'only participants can start shared cooking reveal';
  end if;

  if rec.status in ('cooking_reveal', 'reveal_ready', 'revealed') then
    return rec;
  end if;

  if rec.side_a_user_id is null
     or rec.side_b_user_id is null
     or rec.side_a_reading_id is null
     or rec.side_b_reading_id is null
     or rec.side_a_reading_payload is null
     or rec.side_b_reading_payload is null then
    return rec;
  end if;

  select result.final_score, result.tier
  into computed_final_score, computed_tier
  from public.compute_shared_mutual_result(
    rec.side_a_reading_payload,
    rec.side_b_reading_payload
  ) as result;

  perform set_config('baobab.allow_lifecycle_update', '1', true);

  update public.shared_relationship_reveals
  set
    status = 'cooking_reveal',
    cooking_started_at = coalesce(cooking_started_at, now_utc),
    unlock_at = coalesce(unlock_at, now_utc + interval '90 seconds'),
    mutual_score = computed_final_score,
    tier = computed_tier,
    relationship_name_revealed = false,
    finalized_version = coalesce(finalized_version, 1) + 1
  where relationship_id = p_relationship_id
  returning * into rec;

  return rec;
end;
$$;

grant execute on function public.start_shared_cooking_reveal_if_ready(text)
  to authenticated;

-- ── mark_shared_reveal_ready_if_unlocked ─────────────────────────────────────

create or replace function public.mark_shared_reveal_ready_if_unlocked(
  p_relationship_id text
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

  perform public.assert_uuid_format(p_relationship_id, 'relationship_id');

  select *
  into rec
  from public.shared_relationship_reveals
  where relationship_id = p_relationship_id
  for update;

  if not found then
    return null;
  end if;

  if caller_id <> rec.side_a_user_id and caller_id <> rec.side_b_user_id then
    raise exception 'only participants can mark shared reveal ready';
  end if;

  if rec.status <> 'cooking_reveal' then
    return rec;
  end if;
  if rec.unlock_at is null or now_utc < rec.unlock_at then
    return rec;
  end if;

  perform set_config('baobab.allow_lifecycle_update', '1', true);

  update public.shared_relationship_reveals
  set
    status = 'reveal_ready',
    ready_at = coalesce(ready_at, now_utc)
  where relationship_id = p_relationship_id
  returning * into rec;

  return rec;
end;
$$;

grant execute on function public.mark_shared_reveal_ready_if_unlocked(text)
  to authenticated;

-- ── open_shared_reveal ────────────────────────────────────────────────────────

create or replace function public.open_shared_reveal(
  p_relationship_id text
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

  perform public.assert_uuid_format(p_relationship_id, 'relationship_id');

  select *
  into rec
  from public.shared_relationship_reveals
  where relationship_id = p_relationship_id
  for update;

  if not found then
    return null;
  end if;

  if caller_id <> rec.side_a_user_id and caller_id <> rec.side_b_user_id then
    raise exception 'only participants can open shared reveal';
  end if;

  if rec.status = 'revealed' then
    return rec;
  end if;

  if rec.status = 'cooking_reveal' and rec.unlock_at is not null and now_utc >= rec.unlock_at then
    perform set_config('baobab.allow_lifecycle_update', '1', true);
    update public.shared_relationship_reveals
    set
      status = 'reveal_ready',
      ready_at = coalesce(ready_at, now_utc)
    where relationship_id = p_relationship_id
    returning * into rec;
  end if;

  if rec.status <> 'reveal_ready' then
    return rec;
  end if;

  perform set_config('baobab.allow_lifecycle_update', '1', true);

  update public.shared_relationship_reveals
  set
    status = 'revealed',
    relationship_name_revealed = true,
    first_viewed_at = coalesce(first_viewed_at, now_utc),
    revealed_at = now_utc
  where relationship_id = p_relationship_id
  returning * into rec;

  return rec;
end;
$$;

grant execute on function public.open_shared_reveal(text)
  to authenticated;
