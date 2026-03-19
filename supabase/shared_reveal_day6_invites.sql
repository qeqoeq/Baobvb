create extension if not exists pgcrypto;

create table if not exists public.relationship_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  relationship_id text not null,
  inviter_user_id uuid not null references auth.users (id),
  inviter_side text not null,
  target_side text not null,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  claimed_by_user_id uuid references auth.users (id),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint relationship_invites_side_check check (inviter_side in ('sideA', 'sideB')),
  constraint relationship_invites_target_side_check check (target_side in ('sideA', 'sideB')),
  constraint relationship_invites_distinct_sides_check check (inviter_side <> target_side),
  constraint relationship_invites_claim_pair_check check (
    (claimed_at is null and claimed_by_user_id is null)
    or (claimed_at is not null and claimed_by_user_id is not null)
  )
);

create index if not exists idx_relationship_invites_relationship_id
  on public.relationship_invites (relationship_id);
create index if not exists idx_relationship_invites_inviter_user_id
  on public.relationship_invites (inviter_user_id);
create index if not exists idx_relationship_invites_claimed_by_user_id
  on public.relationship_invites (claimed_by_user_id);
create index if not exists idx_relationship_invites_expires_at
  on public.relationship_invites (expires_at);

drop trigger if exists trg_relationship_invites_updated_at on public.relationship_invites;
create trigger trg_relationship_invites_updated_at
before update on public.relationship_invites
for each row
execute function public.set_shared_relationship_reveals_updated_at();

alter table public.relationship_invites enable row level security;

drop policy if exists relationship_invites_select_participants_only
  on public.relationship_invites;
create policy relationship_invites_select_participants_only
on public.relationship_invites
for select
to authenticated
using (
  auth.uid() = inviter_user_id
  or auth.uid() = claimed_by_user_id
);

-- Direct insert/update/delete is intentionally blocked.
-- Invite creation and claim are server-controlled through security definer RPCs.
