-- Day 8: notification delivery hardening (additive migration after Day 7 is applied).
-- Apply once on a database that already ran shared_reveal_day7_notifications.sql.
-- Idempotent: safe to re-run (IF NOT EXISTS, CREATE OR REPLACE).
--
-- Contains ALL hardening: schema columns, indexes, retry helpers, token hygiene helper,
-- enqueue + dispatch replacements, batch jsonb return + DROP for return-type change.
-- Do not duplicate this logic in Day 7.

alter table public.notification_outbox
  add column if not exists next_attempt_at timestamptz,
  add column if not exists failure_code text,
  add column if not exists max_attempts integer not null default 5;

update public.notification_outbox
set next_attempt_at = timezone('utc', now())
where status = 'pending'
  and next_attempt_at is null;

create index if not exists idx_notification_outbox_pending_eligible
  on public.notification_outbox (status, next_attempt_at)
  where status = 'pending';

create or replace function public.notification_next_attempt_delay_seconds(p_attempt_after_failure integer)
returns integer
language sql
immutable
as $$
  select case
    when p_attempt_after_failure <= 1 then 60
    when p_attempt_after_failure = 2 then 300
    when p_attempt_after_failure = 3 then 900
    when p_attempt_after_failure = 4 then 3600
    else 86400
  end;
$$;

create or replace function public.notification_compute_next_attempt_at(p_attempt_after_failure integer)
returns timestamptz
language sql
stable
as $$
  select timezone('utc', now())
    + make_interval(secs => public.notification_next_attempt_delay_seconds(
      greatest(1, least(coalesce(p_attempt_after_failure, 1), 10))
    ));
$$;

create or replace function public.maybe_deactivate_push_token_from_error(
  p_expo_push_token text,
  p_error_message text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  err text := coalesce(p_error_message, '');
begin
  if p_expo_push_token is null or btrim(p_expo_push_token) = '' then
    return;
  end if;
  -- Expo/APNs invalid-token class signals (best-effort; pg_net may not surface HTTP body).
  if err ~* 'DeviceNotRegistered|InvalidCredentials' then
    update public.device_push_tokens
    set
      is_active = false,
      last_seen_at = timezone('utc', now())
    where expo_push_token = btrim(p_expo_push_token);
  end if;
end;
$$;

revoke all on function public.maybe_deactivate_push_token_from_error(text, text) from public;
grant execute on function public.maybe_deactivate_push_token_from_error(text, text)
  to service_role;

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
  now_utc timestamptz := timezone('utc', now());
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
      status,
      next_attempt_at
    )
    values (
      rec.side_a_user_id,
      'reveal_ready',
      p_relationship_id,
      dedup_a,
      jsonb_build_object('type', 'reveal_ready', 'relationId', p_relationship_id),
      'pending',
      now_utc
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
      status,
      next_attempt_at
    )
    values (
      rec.side_b_user_id,
      'reveal_ready',
      p_relationship_id,
      dedup_b,
      jsonb_build_object('type', 'reveal_ready', 'relationId', p_relationship_id),
      'pending',
      now_utc
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
  err_msg text;
  last_send_err text;
  had_any_token boolean := false;
  now_utc timestamptz := timezone('utc', now());
begin
  if p_user_id is null then
    raise exception 'user_id is required';
  end if;

  for outbox_row in
    select no.*
    from public.notification_outbox as no
    where no.user_id = p_user_id
      and no.status = 'pending'
      and no.kind = 'reveal_ready'
      and no.attempt_count < no.max_attempts
      and (no.next_attempt_at is null or no.next_attempt_at <= now_utc)
    order by no.created_at asc
  loop
    update public.notification_outbox as n
    set
      status = 'processing',
      attempt_count = n.attempt_count + 1,
      last_error = null,
      failure_code = null
    where n.id = outbox_row.id
    returning * into outbox_row;

    pushed := false;
    last_send_err := null;
    had_any_token := false;

    for token_row in
      select dpt.*
      from public.device_push_tokens as dpt
      where dpt.user_id = p_user_id
        and dpt.is_active = true
      order by dpt.updated_at desc
    loop
      had_any_token := true;
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
          sent_at = now_utc,
          last_error = null,
          failure_code = null,
          next_attempt_at = null,
          payload = payload || jsonb_build_object('providerRequestId', request_id)
        where id = outbox_row.id;
      exception
        when others then
          err_msg := SQLERRM;
          last_send_err := err_msg;
          perform public.maybe_deactivate_push_token_from_error(token_row.expo_push_token, err_msg);
      end;

      exit when pushed;
    end loop;

    if pushed then
      sent_count := sent_count + 1;
    elsif not had_any_token then
      if outbox_row.attempt_count >= outbox_row.max_attempts then
        update public.notification_outbox
        set
          status = 'failed',
          last_error = 'No active push token for user.',
          failure_code = 'no_active_token',
          next_attempt_at = null
        where id = outbox_row.id;
      else
        update public.notification_outbox
        set
          status = 'pending',
          last_error = 'No active push token for user.',
          failure_code = 'no_active_token_retry',
          next_attempt_at = public.notification_compute_next_attempt_at(outbox_row.attempt_count)
        where id = outbox_row.id;
      end if;
    else
      if outbox_row.attempt_count >= outbox_row.max_attempts then
        update public.notification_outbox
        set
          status = 'failed',
          last_error = left(coalesce(last_send_err, 'Push send failed for all active tokens.'), 400),
          failure_code = 'send_exception',
          next_attempt_at = null
        where id = outbox_row.id;
      else
        update public.notification_outbox
        set
          status = 'pending',
          last_error = left(coalesce(last_send_err, 'Push send failed for all active tokens.'), 400),
          failure_code = 'transient_send',
          next_attempt_at = public.notification_compute_next_attempt_at(outbox_row.attempt_count)
        where id = outbox_row.id;
      end if;
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
      and no.status = 'pending'
      and no.attempt_count < no.max_attempts
      and (no.next_attempt_at is null or no.next_attempt_at <= timezone('utc', now()))
  loop
    total_sent := total_sent + public.dispatch_pending_notifications_for_user(row_rec.user_id);
  end loop;

  return total_sent;
end;
$$;

drop function if exists public.dispatch_pending_notifications_batch(integer);

create or replace function public.dispatch_pending_notifications_batch(
  p_limit integer default 100
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  user_row record;
  safe_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  total_sent integer := 0;
  users_processed integer := 0;
  users_lock_skipped integer := 0;
  now_utc timestamptz := timezone('utc', now());
begin
  for user_row in
    with candidate_users as (
      select
        no.user_id,
        min(no.next_attempt_at) as first_eligible_at
      from public.notification_outbox as no
      where no.status = 'pending'
        and no.attempt_count < no.max_attempts
        and (no.next_attempt_at is null or no.next_attempt_at <= now_utc)
      group by no.user_id
    )
    select cu.user_id
    from candidate_users as cu
    order by cu.first_eligible_at asc nulls last
    limit safe_limit
  loop
    if pg_try_advisory_xact_lock(hashtext(user_row.user_id::text)) then
      total_sent := total_sent + public.dispatch_pending_notifications_for_user(user_row.user_id);
      users_processed := users_processed + 1;
    else
      users_lock_skipped := users_lock_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'sent', total_sent,
    'usersProcessed', users_processed,
    'usersLockSkipped', users_lock_skipped,
    'limit', safe_limit
  );
end;
$$;

revoke execute on function public.dispatch_pending_notifications_batch(integer)
  from authenticated;
grant execute on function public.dispatch_pending_notifications_batch(integer)
  to service_role;
