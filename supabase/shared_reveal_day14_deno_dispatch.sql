-- shared_reveal_day14_deno_dispatch
--
-- Migrates notification HTTP dispatch from pg_net (async, response invisible) to the
-- Deno edge runner (synchronous fetch, response fully parsed).
--
-- Problem (F-1):
--   dispatch_pending_notifications_for_user calls net.http_post(), which enqueues the
--   request in pg_net's background worker and returns a bigint request_id immediately.
--   The PL/pgSQL function never reads the HTTP response, so:
--   - Any Expo 4xx/5xx is silently counted as sent.
--   - DeviceNotRegistered errors never deactivate tokens.
--   - status='sent' means "enqueued in pg_net", not "Expo accepted".
--
-- Fix:
--   Split dispatch into a SQL handshake:
--     1. dequeue_pending_notifications_for_dispatch  — selects jobs, marks processing
--     2. [Deno runner does the real HTTP POST and reads the response]
--     3. ack_notification_dispatch                  — writes the real outcome
--
--   The runner's index.ts is rewritten to use this handshake. The old
--   dispatch_pending_notifications_for_user / dispatch_pending_notifications_batch
--   functions remain in the DB but are no longer called by the runner.
--
-- Schema baseline: Day 7 columns only.
--   notification_outbox: id, user_id, kind, relationship_id, dedup_key, payload,
--                        status, attempt_count, last_error, sent_at, created_at, updated_at
--
-- Safety:
--   - FOR UPDATE SKIP LOCKED in dequeue prevents two concurrent runners from claiming
--     the same row.
--   - Stale processing recovery at the start of dequeue resets rows left by a crashed
--     runner (only unlocked rows — rows held by an active transaction are skipped).
--   - ack is idempotent for the success path (UPDATE by primary key).
--   - No schema changes.

-- ── dequeue_pending_notifications_for_dispatch ────────────────────────────────

create or replace function public.dequeue_pending_notifications_for_dispatch(
  p_limit integer default 50
)
returns table (
  outbox_id       uuid,
  expo_push_token text,
  payload         jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  job_row    record;
begin
  -- Recover stale processing rows from a previous crash.
  -- FOR UPDATE SKIP LOCKED ensures only unlocked (genuinely stale) rows are reset;
  -- rows held by a concurrent runner transaction are left untouched.
  with stale as (
    select id
    from public.notification_outbox
    where status = 'processing'
    for update skip locked
  )
  update public.notification_outbox
  set
    status     = 'pending',
    last_error = 'Recovered from stale processing state.'
  from stale
  where notification_outbox.id = stale.id;

  -- Fail rows for users who have no active push token.
  -- These rows would never be dequeued (the JOIN below would exclude them).
  -- Failing them explicitly prevents silent accumulation.
  update public.notification_outbox
  set
    status     = 'failed',
    last_error = 'No active push token for user.'
  where status in ('pending', 'failed')
    and kind = 'reveal_ready'
    and not exists (
      select 1
      from public.device_push_tokens as dpt
      where dpt.user_id = notification_outbox.user_id
        and dpt.is_active = true
    );

  -- Select and lock eligible jobs.
  -- LATERAL picks the single best (most recently updated) active token per outbox row.
  -- FOR UPDATE OF no SKIP LOCKED: locks the outbox row, skips rows already claimed by
  -- a concurrent runner. The lateral result is a derived table and is not locked.
  for job_row in
    select
      no.id            as outbox_id,
      no.payload,
      no.attempt_count,
      best_token.expo_push_token
    from public.notification_outbox as no
    join lateral (
      select dpt.expo_push_token
      from public.device_push_tokens as dpt
      where dpt.user_id = no.user_id
        and dpt.is_active = true
      order by dpt.updated_at desc
      limit 1
    ) as best_token on true
    where no.status in ('pending', 'failed')
      and no.kind = 'reveal_ready'
    order by no.created_at asc
    limit safe_limit
    for update of no skip locked
  loop
    update public.notification_outbox
    set
      status        = 'processing',
      attempt_count = job_row.attempt_count + 1,
      last_error    = null
    where id = job_row.outbox_id;

    outbox_id       := job_row.outbox_id;
    expo_push_token := job_row.expo_push_token;
    payload         := job_row.payload;
    return next;
  end loop;
end;
$$;

revoke execute on function public.dequeue_pending_notifications_for_dispatch(integer)
  from public, authenticated;
grant execute on function public.dequeue_pending_notifications_for_dispatch(integer)
  to service_role;

-- ── ack_notification_dispatch ─────────────────────────────────────────────────

create or replace function public.ack_notification_dispatch(
  p_outbox_id       uuid,
  p_expo_push_token text,
  p_success         boolean,
  p_error_message   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_outbox_id is null then
    raise exception 'outbox_id is required';
  end if;

  if p_success then
    update public.notification_outbox
    set
      status     = 'sent',
      sent_at    = timezone('utc', now()),
      last_error = null
    where id = p_outbox_id;
  else
    update public.notification_outbox
    set
      status     = 'failed',
      last_error = left(coalesce(p_error_message, 'Push send failed.'), 400)
    where id = p_outbox_id;

    -- Deactivate tokens that Expo has marked as permanently invalid.
    if p_expo_push_token is not null
       and p_error_message ilike '%DeviceNotRegistered%'
    then
      update public.device_push_tokens
      set is_active = false
      where expo_push_token = p_expo_push_token;
    end if;
  end if;
end;
$$;

revoke execute on function public.ack_notification_dispatch(uuid, text, boolean, text)
  from public, authenticated;
grant execute on function public.ack_notification_dispatch(uuid, text, boolean, text)
  to service_role;
