-- Day 7: notification foundation (historical baseline).
-- Applied once: enqueue on reveal_ready via trigger, register_device_push_token, dispatch RPCs (service_role).
-- Delivery hardening (retries, next_attempt_at, jsonb batch stats) lives ONLY in shared_reveal_day8_notification_delivery_hardening.sql

create extension if not exists pg_net;

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  expo_push_token text not null unique,
  platform text not null,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint device_push_tokens_platform_check check (platform in ('ios', 'android'))
);

create index if not exists idx_device_push_tokens_user_active
  on public.device_push_tokens (user_id, is_active);

drop trigger if exists trg_device_push_tokens_updated_at on public.device_push_tokens;
create trigger trg_device_push_tokens_updated_at
before update on public.device_push_tokens
for each row
execute function public.set_shared_relationship_reveals_updated_at();

alter table public.device_push_tokens enable row level security;

drop policy if exists device_push_tokens_select_own on public.device_push_tokens;
create policy device_push_tokens_select_own
on public.device_push_tokens
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists device_push_tokens_insert_own on public.device_push_tokens;
create policy device_push_tokens_insert_own
on public.device_push_tokens
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists device_push_tokens_update_own on public.device_push_tokens;
create policy device_push_tokens_update_own
on public.device_push_tokens
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists device_push_tokens_delete_own on public.device_push_tokens;
create policy device_push_tokens_delete_own
on public.device_push_tokens
for delete
to authenticated
using (auth.uid() = user_id);

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id),
  kind text not null,
  relationship_id text not null,
  dedup_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint notification_outbox_kind_check check (kind in ('reveal_ready')),
  constraint notification_outbox_status_check check (status in ('pending', 'processing', 'sent', 'failed')),
  constraint notification_outbox_dedup_key_unique unique (dedup_key)
);

create index if not exists idx_notification_outbox_status_created
  on public.notification_outbox (status, created_at);
create index if not exists idx_notification_outbox_user_status
  on public.notification_outbox (user_id, status);

drop trigger if exists trg_notification_outbox_updated_at on public.notification_outbox;
create trigger trg_notification_outbox_updated_at
before update on public.notification_outbox
for each row
execute function public.set_shared_relationship_reveals_updated_at();

alter table public.notification_outbox enable row level security;

drop policy if exists notification_outbox_select_own on public.notification_outbox;
create policy notification_outbox_select_own
on public.notification_outbox
for select
to authenticated
using (auth.uid() = user_id);

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

create or replace function public.dispatch_pending_notifications_for_user(
  p_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  outbox_row public.notification_outbox;
  token_row public.device_push_tokens;
  request_id bigint;
  sent_count integer := 0;
  pushed boolean;
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  for outbox_row in
    select no.*
    from public.notification_outbox as no
    where no.user_id = p_user_id
      and no.status in ('pending', 'failed')
      and no.kind = 'reveal_ready'
    order by no.created_at asc
  loop
    update public.notification_outbox
    set
      status = 'processing',
      attempt_count = outbox_row.attempt_count + 1,
      last_error = null
    where id = outbox_row.id;

    pushed := false;
    for token_row in
      select dpt.*
      from public.device_push_tokens as dpt
      where dpt.user_id = p_user_id
        and dpt.is_active = true
      order by dpt.updated_at desc
    loop
      begin
        request_id := net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := '{"Content-Type":"application/json"}'::jsonb,
          body := jsonb_build_object(
            'to', token_row.expo_push_token,
            'title', 'Your link is ready',
            'body', 'Open Baobab to reveal it',
            'sound', 'default',
            'data', outbox_row.payload
          )
        );

        pushed := true;
        update public.notification_outbox
        set
          status = 'sent',
          sent_at = timezone('utc', now()),
          last_error = null,
          payload = payload || jsonb_build_object('providerRequestId', request_id)
        where id = outbox_row.id;
      exception
        when others then
          update public.notification_outbox
          set
            status = 'failed',
            last_error = left(SQLERRM, 400)
          where id = outbox_row.id;
      end;
    end loop;

    if not pushed then
      update public.notification_outbox
      set
        status = 'failed',
        last_error = 'No active push token for user.'
      where id = outbox_row.id;
    else
      sent_count := sent_count + 1;
    end if;
  end loop;

  return sent_count;
end;
$$;

create or replace function public.dispatch_pending_notifications_for_relationship(
  p_relationship_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  row_rec record;
  total_sent integer := 0;
begin
  if p_relationship_id is null or btrim(p_relationship_id) = '' then
    raise exception 'relationship_id is required';
  end if;

  for row_rec in
    select distinct no.user_id
    from public.notification_outbox as no
    where no.relationship_id = p_relationship_id
      and no.status in ('pending', 'failed')
  loop
    total_sent := total_sent + public.dispatch_pending_notifications_for_user(row_rec.user_id);
  end loop;

  return total_sent;
end;
$$;

create or replace function public.dispatch_pending_notifications_batch(
  p_limit integer default 100
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  user_row record;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  total_sent integer := 0;
begin
  for user_row in
    with candidate_users as (
      select
        no.user_id,
        min(no.created_at) as first_pending_at
      from public.notification_outbox as no
      where no.status in ('pending', 'failed')
      group by no.user_id
    )
    select cu.user_id
    from candidate_users as cu
    order by cu.first_pending_at asc
    limit safe_limit
  loop
    -- one runner at a time per user to prevent duplicate concurrent sends
    if pg_try_advisory_xact_lock(hashtext(user_row.user_id::text)) then
      total_sent := total_sent + public.dispatch_pending_notifications_for_user(user_row.user_id);
    end if;
  end loop;

  return total_sent;
end;
$$;

create or replace function public.handle_shared_reveal_ready_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'reveal_ready' and old.status is distinct from new.status then
    perform public.enqueue_reveal_ready_notifications_for_relationship(new.relationship_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shared_reveal_ready_notifications
  on public.shared_relationship_reveals;
create trigger trg_shared_reveal_ready_notifications
after update on public.shared_relationship_reveals
for each row
execute function public.handle_shared_reveal_ready_notifications();

create or replace function public.register_device_push_token(
  p_expo_push_token text,
  p_platform text
)
returns public.device_push_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  rec public.device_push_tokens;
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  if p_expo_push_token is null or btrim(p_expo_push_token) = '' then
    raise exception 'expo push token is required';
  end if;

  if p_platform not in ('ios', 'android') then
    raise exception 'invalid platform';
  end if;

  insert into public.device_push_tokens (
    user_id,
    expo_push_token,
    platform,
    is_active,
    last_seen_at
  )
  values (
    caller_id,
    btrim(p_expo_push_token),
    p_platform,
    true,
    timezone('utc', now())
  )
  on conflict (expo_push_token) do update
    set
      user_id = excluded.user_id,
      platform = excluded.platform,
      is_active = true,
      last_seen_at = timezone('utc', now())
  returning * into rec;

  return rec;
end;
$$;

grant execute on function public.register_device_push_token(text, text)
  to authenticated;

revoke execute on function public.dispatch_pending_notifications_for_user(uuid)
  from authenticated;
revoke execute on function public.dispatch_pending_notifications_for_relationship(text)
  from authenticated;
revoke execute on function public.dispatch_pending_notifications_batch(integer)
  from authenticated;

grant execute on function public.dispatch_pending_notifications_for_user(uuid)
  to service_role;
grant execute on function public.dispatch_pending_notifications_for_relationship(text)
  to service_role;
grant execute on function public.dispatch_pending_notifications_batch(integer)
  to service_role;
