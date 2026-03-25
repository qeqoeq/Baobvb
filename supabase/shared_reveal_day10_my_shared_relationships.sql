-- shared_reveal_day10_my_shared_relationships
--
-- Minimal RPC for shared continuity bootstrap.
-- Returns all canonical shared relationships where the caller is a participant.
--
-- Design constraints:
--   - No user_id parameter from the client. Caller identity derived from auth.uid().
--   - Only UUID-format relationship_ids are returned (legacy r-{timestamp} rows excluded).
--   - my_side is computed server-side — the other participant's user_id is never returned.
--   - Returns only the minimum fields needed for local materialization at bootstrap.
--
-- Fields:
--   relationship_id    — canonical UUID join key
--   status             — shared lifecycle state (waiting_other_side | cooking_reveal | reveal_ready | revealed)
--   my_side            — which side the caller occupies ('sideA' or 'sideB')
--   side_a_present     — true if side_a_user_id is set (participant bound)
--   side_b_present     — true if side_b_user_id is set (participant bound)
--   side_a_reading_id  — non-null means sideA has submitted a reading
--   side_b_reading_id  — non-null means sideB has submitted a reading

create or replace function public.my_shared_relationships()
returns table(
  relationship_id   text,
  status            text,
  my_side           text,
  side_a_present    boolean,
  side_b_present    boolean,
  side_a_reading_id text,
  side_b_reading_id text
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
    sr.side_b_reading_id
  from public.shared_relationship_reveals sr
  where
    (sr.side_a_user_id = caller_id or sr.side_b_user_id = caller_id)
    -- Exclude legacy r-{timestamp} IDs. Only canonical UUID relationship_ids are returned.
    and sr.relationship_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
end;
$$;

revoke execute on function public.my_shared_relationships() from public;
grant execute on function public.my_shared_relationships() to authenticated;
