-- enforce_reveal_ready_score_contract
--
-- Hardens the reveal lifecycle state machine:
-- a shared relationship reveal must never reach reveal_ready or revealed
-- if mutual_score is null.
--
-- Problem:
--   mark_shared_reveal_ready_if_unlocked and the inline cooking→reveal_ready
--   path inside open_shared_reveal both check status and timing, but neither
--   checked mutual_score before promoting the row. A row in cooking_reveal
--   with mutual_score = null (legacy data or direct DB write) could be
--   silently promoted, producing a reveal_ready the front cannot display
--   and a push notification that is a lie.
--
-- Changes in this migration:
--   1. mark_shared_reveal_ready_if_unlocked — guard: mutual_score must not be null.
--   2. open_shared_reveal — two guards:
--        A. inline cooking→reveal_ready path: mutual_score must not be null.
--        B. reveal_ready→revealed path: mutual_score must not be null.
--   3. enqueue_reveal_ready_notifications_for_relationship — guard: no notification
--      if mutual_score is null.
--   4. CHECK constraint on shared_relationship_reveals: enforces the contract at
--      the DB level for reveal_ready and revealed only (not cooking_reveal, which
--      is a transient computation state).
--
-- Deployment note:
--   Before applying this migration in production, verify that no existing rows
--   would violate the new CHECK constraint:
--
--   -- select relationship_id, status, mutual_score, tier,
--   --        (side_a_reading_payload is not null) as has_payload_a,
--   --        (side_b_reading_payload is not null) as has_payload_b
--   -- from public.shared_relationship_reveals
--   -- where status in ('reveal_ready', 'revealed')
--   --   and mutual_score is null;
--
--   If rows are returned, apply the backfill script first (see end of file).
--
-- Baseline: Day 12 function bodies.
-- Behaviour change for valid, normal-path inputs: none.

-- ── 1. mark_shared_reveal_ready_if_unlocked ───────────────────────────────────

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

  -- Guard: refuse to promote if the mutual score has not been computed.
  -- This can only happen for legacy rows or rows written directly via service_role.
  -- The normal path (start_shared_cooking_reveal_if_ready) always writes mutual_score
  -- atomically with the cooking_reveal status.
  if rec.mutual_score is null then
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

-- ── 2. open_shared_reveal ─────────────────────────────────────────────────────

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

  -- Inline cooking → reveal_ready shortcut (timer already elapsed).
  -- Guard A: do not promote if mutual_score is missing.
  if rec.status = 'cooking_reveal' and rec.unlock_at is not null and now_utc >= rec.unlock_at then
    if rec.mutual_score is null then
      return rec;
    end if;

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

  -- Guard B: do not open a reveal_ready row that somehow has no score.
  -- Protects against legacy rows that entered reveal_ready before this migration.
  if rec.mutual_score is null then
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

-- ── 3. enqueue_reveal_ready_notifications_for_relationship ────────────────────

create or replace function public.enqueue_reveal_ready_notifications_for_relationship(
  p_relationship_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.shared_relationship_reveals;
  inserted_count integer := 0;
  dedup_a text;
  dedup_b text;
begin
  if p_relationship_id is null or btrim(p_relationship_id) = '' then
    raise exception 'relationship_id is required';
  end if;

  select sr.*
  into rec
  from public.shared_relationship_reveals as sr
  where sr.relationship_id = p_relationship_id;

  if not found or rec.status <> 'reveal_ready' then
    return 0;
  end if;

  -- Guard: do not notify if the score is not yet computed.
  -- A push notification saying "your link is ready" when mutual_score is null
  -- would be a lie — the front cannot render the reveal.
  if rec.mutual_score is null then
    return 0;
  end if;

  if rec.side_a_user_id is not null then
    dedup_a := format('reveal_ready:%s:%s', p_relationship_id, rec.side_a_user_id);
    insert into public.notification_outbox (
      user_id,
      kind,
      relationship_id,
      dedup_key,
      payload,
      status
    )
    values (
      rec.side_a_user_id,
      'reveal_ready',
      p_relationship_id,
      dedup_a,
      jsonb_build_object('type', 'reveal_ready', 'relationId', p_relationship_id),
      'pending'
    )
    on conflict (dedup_key) do nothing;
    if found then
      inserted_count := inserted_count + 1;
    end if;
  end if;

  if rec.side_b_user_id is not null then
    dedup_b := format('reveal_ready:%s:%s', p_relationship_id, rec.side_b_user_id);
    insert into public.notification_outbox (
      user_id,
      kind,
      relationship_id,
      dedup_key,
      payload,
      status
    )
    values (
      rec.side_b_user_id,
      'reveal_ready',
      p_relationship_id,
      dedup_b,
      jsonb_build_object('type', 'reveal_ready', 'relationId', p_relationship_id),
      'pending'
    )
    on conflict (dedup_key) do nothing;
    if found then
      inserted_count := inserted_count + 1;
    end if;
  end if;

  return inserted_count;
end;
$$;

-- ── 4. CHECK constraint ───────────────────────────────────────────────────────
-- Enforces the contract at the DB level: reveal_ready and revealed rows must
-- always carry a mutual_score. cooking_reveal is excluded — it is a transient
-- state and its score is written atomically by start_shared_cooking_reveal_if_ready,
-- but old rows without a score may legitimately sit there until the timer fires.

alter table public.shared_relationship_reveals
  add constraint shared_relationship_reveals_score_present_when_ready_or_revealed
  check (
    status not in ('reveal_ready', 'revealed')
    or mutual_score is not null
  );

-- ── Backfill reference (do not execute here — run manually if needed) ─────────
--
-- For rows that entered reveal_ready or revealed before this migration and have
-- both reading payloads available, the score can be recomputed:
--
-- update public.shared_relationship_reveals sr
-- set
--   mutual_score = result.final_score,
--   tier = result.tier
-- from public.compute_shared_mutual_result(
--       sr.side_a_reading_payload,
--       sr.side_b_reading_payload
--      ) as result
-- where sr.status in ('reveal_ready', 'revealed')
--   and sr.mutual_score is null
--   and sr.side_a_reading_payload is not null
--   and sr.side_b_reading_payload is not null;
--
-- Rows with status in ('reveal_ready', 'revealed'), mutual_score null, AND
-- missing payloads are unrecoverable and require manual triage (delete or
-- reset to waiting_other_side).
