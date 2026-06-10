-- reduce_reveal_cooking_duration_to_15s
--
-- Reduces the reveal cooking window from 90 seconds to 15 seconds so the
-- client can surface a tight, ritual countdown ("Le lien s'ouvre. 5… 4… 3…")
-- instead of a generic 90-second wait that reads as a bug.
--
-- Scope
--   - No schema change (no ALTER TABLE, no new column, no new index, no policy).
--   - No data migration (no UPDATE on existing rows).
--   - No behaviour change to the reveal state machine itself.
--   - Preserves coalesce(unlock_at, ...) idempotence: cooking reveals already
--     in progress with an existing unlock_at keep their original value. The
--     new 15-second window only applies to future cooking_reveal transitions.
--   - Function signature, return type, language, security mode, search_path,
--     all guards (auth, UUID assert, participant check, status check, payload
--     completeness check), mutual score/tier computation, and grant are
--     strictly identical to the day12 hardened version (lines 20-94 of
--     supabase/shared_reveal_day12_lifecycle_uuid_guard.sql).
--
-- Only functional change: `interval '90 seconds'` → `interval '15 seconds'`
-- inside the UPDATE statement.

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
    unlock_at = coalesce(unlock_at, now_utc + interval '15 seconds'),
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
