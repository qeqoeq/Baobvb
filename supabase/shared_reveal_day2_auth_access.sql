alter table public.shared_relationship_reveals
  add column if not exists side_a_user_id uuid references auth.users (id),
  add column if not exists side_b_user_id uuid references auth.users (id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shared_relationship_reveals_distinct_participants_check'
  ) then
    alter table public.shared_relationship_reveals
      add constraint shared_relationship_reveals_distinct_participants_check
      check (
        side_a_user_id is null
        or side_b_user_id is null
        or side_a_user_id <> side_b_user_id
      );
  end if;
end
$$;

create index if not exists idx_shared_relationship_reveals_side_a_user_id
  on public.shared_relationship_reveals (side_a_user_id);
create index if not exists idx_shared_relationship_reveals_side_b_user_id
  on public.shared_relationship_reveals (side_b_user_id);

create or replace function public.prevent_shared_reveal_participant_reassignment()
returns trigger
language plpgsql
as $$
begin
  if new.side_a_user_id is distinct from old.side_a_user_id
     or new.side_b_user_id is distinct from old.side_b_user_id then
    raise exception 'side participant assignment is immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_shared_reveal_participant_reassignment
  on public.shared_relationship_reveals;
create trigger trg_prevent_shared_reveal_participant_reassignment
before update on public.shared_relationship_reveals
for each row
execute function public.prevent_shared_reveal_participant_reassignment();

drop policy if exists shared_relationship_reveals_select_participants_only
  on public.shared_relationship_reveals;
create policy shared_relationship_reveals_select_participants_only
on public.shared_relationship_reveals
for select
to authenticated
using (
  auth.uid() = side_a_user_id
  or auth.uid() = side_b_user_id
);

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
  )
  or (
    side_b_user_id = auth.uid()
    and side_a_user_id is null
  )
);

drop policy if exists shared_relationship_reveals_update_participants_only
  on public.shared_relationship_reveals;
create policy shared_relationship_reveals_update_participants_only
on public.shared_relationship_reveals
for update
to authenticated
using (
  auth.uid() = side_a_user_id
  or auth.uid() = side_b_user_id
)
with check (
  auth.uid() = side_a_user_id
  or auth.uid() = side_b_user_id
);

-- Day 2 boundary:
-- - RLS now enforces participant-only row access via auth.uid().
-- - Participant binding lifecycle and invite-driven side linking remain deferred.
