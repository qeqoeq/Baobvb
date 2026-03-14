create table if not exists public.shared_relationship_reveals (
  relationship_id text primary key,
  status text not null default 'waiting_other_side',
  side_a_reading_id text,
  side_b_reading_id text,
  cooking_started_at timestamptz,
  unlock_at timestamptz,
  ready_at timestamptz,
  first_viewed_at timestamptz,
  revealed_at timestamptz,
  mutual_score numeric(5,2),
  tier text,
  relationship_name_revealed boolean not null default false,
  finalized_version integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint shared_relationship_reveals_status_check check (
    status in ('waiting_other_side', 'cooking_reveal', 'reveal_ready', 'revealed')
  ),
  constraint shared_relationship_reveals_tier_check check (
    tier is null or tier in ('Ghost', 'Spark', 'Thrill', 'Vibrant', 'Anchor', 'Legend')
  )
);

create or replace function public.set_shared_relationship_reveals_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_shared_relationship_reveals_updated_at on public.shared_relationship_reveals;
create trigger trg_shared_relationship_reveals_updated_at
before update on public.shared_relationship_reveals
for each row
execute function public.set_shared_relationship_reveals_updated_at();

alter table public.shared_relationship_reveals enable row level security;
-- Day 1 foundation: no permissive policies are created here.
-- Auth-bound policies must be added before enabling production client writes.
