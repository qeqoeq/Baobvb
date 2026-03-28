-- shared_reveal_day13_processing_recovery
--
-- Adds stale-processing recovery to dispatch_pending_notifications_for_user.
--
-- Problem (F-3):
--   dispatch_pending_notifications_for_user transitions rows to status='processing'
--   before attempting the HTTP send. If the Postgres process crashes after that
--   transition but before the final UPDATE (sent/pending/failed), the row is stuck
--   at status='processing' indefinitely. The dispatch query filters on status='pending',
--   so stuck rows never retry.
--
-- Fix:
--   At the start of dispatch_pending_notifications_for_user, recover any rows in
--   status='processing' for this user before the main dispatch loop runs.
--   Rows under max_attempts → reset to pending (eligible for immediate retry).
--   Rows at max_attempts → mark failed (terminal).
--
-- Safety:
--   - Per-user advisory lock in dispatch_pending_notifications_batch prevents
--     concurrent execution of this function for the same user. Recovery is
--     therefore race-free within the batch runner.
--   - No schema changes. No impact on the normal (non-crash) code path.
--   - Idempotent: if no rows are in processing, the UPDATE affects 0 rows.

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

  -- Recover stale processing rows left by a previous crash.
  -- These rows were never completed (sent/pending/failed) after being marked processing.
  -- Reset under-limit rows to pending for immediate retry; terminate exhausted rows.
  update public.notification_outbox
  set
    status        = case when attempt_count < max_attempts then 'pending' else 'failed' end,
    next_attempt_at = case when attempt_count < max_attempts then now_utc else null end,
    last_error    = 'Recovered from stale processing state.',
    failure_code  = 'stale_processing'
  where user_id = p_user_id
    and status = 'processing';

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
