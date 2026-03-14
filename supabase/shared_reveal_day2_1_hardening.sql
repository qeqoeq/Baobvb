drop policy if exists shared_relationship_reveals_insert_self_as_single_side
  on public.shared_relationship_reveals;
create policy shared_relationship_reveals_insert_self_as_single_side
on public.shared_relationship_reveals
for insert
to authenticated
with check (
  (
    side_a_user_id = auth.uid()
    and side_b_user_id is null
    and side_b_reading_id is null
  )
  or (
    side_b_user_id = auth.uid()
    and side_a_user_id is null
    and side_a_reading_id is null
  )
)
and status = 'waiting_other_side'
and cooking_started_at is null
and unlock_at is null
and ready_at is null
and first_viewed_at is null
and revealed_at is null
and mutual_score is null
and tier is null
and relationship_name_revealed = false
and finalized_version = 1;

create or replace function public.guard_shared_reveal_participant_updates()
returns trigger
language plpgsql
as $$
declare
  current_user_id uuid := auth.uid();
  is_side_a boolean := old.side_a_user_id = current_user_id;
  is_side_b boolean := old.side_b_user_id = current_user_id;
begin
  if current_user_id is null then
    raise exception 'authenticated user required';
  end if;

  if not (is_side_a or is_side_b) then
    raise exception 'only participants may update shared reveal records';
  end if;

  -- Participant ownership is immutable from client-authenticated updates.
  if new.side_a_user_id is distinct from old.side_a_user_id
     or new.side_b_user_id is distinct from old.side_b_user_id then
    raise exception 'side participant assignment is immutable';
  end if;

  -- Reveal lifecycle and finalized output fields are not directly mutable by participants at Day 2.
  if new.status is distinct from old.status
     or new.cooking_started_at is distinct from old.cooking_started_at
     or new.unlock_at is distinct from old.unlock_at
     or new.ready_at is distinct from old.ready_at
     or new.first_viewed_at is distinct from old.first_viewed_at
     or new.revealed_at is distinct from old.revealed_at
     or new.mutual_score is distinct from old.mutual_score
     or new.tier is distinct from old.tier
     or new.relationship_name_revealed is distinct from old.relationship_name_revealed
     or new.finalized_version is distinct from old.finalized_version then
    raise exception 'lifecycle and result fields are read-only for participant updates';
  end if;

  -- Side A can only set its own reading once (or repeat idempotently).
  if is_side_a then
    if new.side_b_reading_id is distinct from old.side_b_reading_id then
      raise exception 'side A cannot modify side B reading reference';
    end if;
    if old.side_a_reading_id is not null
       and new.side_a_reading_id is distinct from old.side_a_reading_id then
      raise exception 'side A reading reference is immutable once set';
    end if;
  end if;

  -- Side B can only set its own reading once (or repeat idempotently).
  if is_side_b then
    if new.side_a_reading_id is distinct from old.side_a_reading_id then
      raise exception 'side B cannot modify side A reading reference';
    end if;
    if old.side_b_reading_id is not null
       and new.side_b_reading_id is distinct from old.side_b_reading_id then
      raise exception 'side B reading reference is immutable once set';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_shared_reveal_participant_updates
  on public.shared_relationship_reveals;
create trigger trg_guard_shared_reveal_participant_updates
before update on public.shared_relationship_reveals
for each row
execute function public.guard_shared_reveal_participant_updates();
