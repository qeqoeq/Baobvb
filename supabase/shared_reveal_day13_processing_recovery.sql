-- shared_reveal_day13_processing_recovery
--
-- Fixes stale-processing row recovery for dispatch_pending_notifications_for_user
-- and extends dispatch_pending_notifications_batch to include users whose rows
-- are stuck in status='processing'.
--
-- Problem (F-3):
--   dispatch_pending_notifications_for_user marks rows status='processing' before
--   the HTTP send. If the process crashes after that transition but before the final
--   UPDATE (sent/failed), the row is stuck at status='processing' indefinitely.
--   Two compounding issues:
--   1. The per-user function loops only on status in ('pending', 'failed'), so stale
--      processing rows are never retried within a run.
--   2. The batch function selects candidates only where status in ('pending', 'failed'),
--      so users whose ONLY rows are status='processing' are never selected at all —
--      the per-user function is never called for them, and the recovery never fires.
--
-- Fix:
--   dispatch_pending_notifications_for_user: reset any status='processing' rows for
--   this user to status='pending' before the main loop runs.
--   dispatch_pending_notifications_batch: include status='processing' in the candidate
--   user query so users with only stale processing rows are selected.
--
-- Baseline: Day 7 schema and function signatures.
--   Columns in notification_outbox: id, user_id, kind, relationship_id, dedup_key,
--   payload, status, attempt_count, last_error, sent_at, created_at, updated_at.
--   dispatch_pending_notifications_batch returns integer (not jsonb).
--
-- Safety:
--   - Per-user advisory lock in dispatch_pending_notifications_batch prevents
--     concurrent execution for the same user.
--   - No schema changes.
--   - Idempotent: if no rows are in processing, the recovery UPDATE affects 0 rows.

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

  -- Recover stale processing rows left by a previous crash.
  -- Reset unconditionally to pending so they are picked up by the main loop below.
  update public.notification_outbox
  set
    status     = 'pending',
    last_error = 'Recovered from stale processing state.'
  where user_id = p_user_id
    and status = 'processing';

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
      status        = 'processing',
      attempt_count = outbox_row.attempt_count + 1,
      last_error    = null
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
          status     = 'sent',
          sent_at    = timezone('utc', now()),
          last_error = null,
          payload    = payload || jsonb_build_object('providerRequestId', request_id)
        where id = outbox_row.id;
      exception
        when others then
          update public.notification_outbox
          set
            status     = 'failed',
            last_error = left(SQLERRM, 400)
          where id = outbox_row.id;
      end;
    end loop;

    if not pushed then
      update public.notification_outbox
      set
        status     = 'failed',
        last_error = 'No active push token for user.'
      where id = outbox_row.id;
    else
      sent_count := sent_count + 1;
    end if;
  end loop;

  return sent_count;
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
      where no.status in ('pending', 'failed', 'processing')
      group by no.user_id
    )
    select cu.user_id
    from candidate_users as cu
    order by cu.first_pending_at asc
    limit safe_limit
  loop
    if pg_try_advisory_xact_lock(hashtext(user_row.user_id::text)) then
      total_sent := total_sent + public.dispatch_pending_notifications_for_user(user_row.user_id);
    end if;
  end loop;

  return total_sent;
end;
$$;
