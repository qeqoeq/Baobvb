## Day 7 / Day 8 Notification Runner Validation

**Migration truth**

| File | Role |
|------|------|
| `supabase/shared_reveal_day7_notifications.sql` | **Historical Day 7 foundation** already applied on the real project: tables, enqueue-only trigger path, `register_device_push_token`, dispatch RPCs returning **integer** batch counts. **Do not re-apply** on production if Day 7 is already there; use for new clones / docs only. |
| `supabase/shared_reveal_day8_notification_delivery_hardening.sql` | **Additive upgrade**: all delivery hardening (`next_attempt_at`, `failure_code`, `max_attempts`, retry helpers, eligible-pending dispatch, `dispatch_pending_notifications_batch` → **jsonb**). Run this **after** Day 7 on databases that have not yet been hardened. |

This validates the final-path separation:

- lifecycle trigger enqueues only (`enqueue_reveal_ready_notifications_for_relationship`)
- token registration updates tokens only (`register_device_push_token`)
- delivery happens only through explicit runner invocation (`dispatch_pending_notifications_batch` via Edge Function)

**Day 8** adds bounded retries, scheduling (`next_attempt_at`), `failure_code`, and batch JSON stats—without moving logic to the client or recoupling dispatch with triggers or registration.

### 1) Regression checks

Run before and after deployment:

```bash
npm run -s typecheck
set -a && source .env && set +a && npm run -s check:invite-claim-flow
set -a && source .env && set +a && npm run -s check:shared-reveal-flow
```

### 2) Apply SQL

- **Greenfield (no notifications SQL yet)**: run **Day 7** first, then **Day 8**:
  1. `supabase/shared_reveal_day7_notifications.sql`
  2. `supabase/shared_reveal_day8_notification_delivery_hardening.sql`
- **Production already on Day 7 only**: run **Day 8** only (`shared_reveal_day8_notification_delivery_hardening.sql`). Do not re-run Day 7.

Required:

- `pg_net` enabled; `dispatch_pending_notifications_batch` callable only by `service_role`.
- App on a **real iPhone** for valid Expo push tokens (simulator tokens are not end-to-end verifiable).

### 3) Retry semantics (Day 8)

| Concept | Behavior |
|--------|----------|
| **Eligible row** | `status = 'pending'`, `attempt_count < max_attempts` (default **5**), and `next_attempt_at` is null or `<= now()` UTC. |
| **Backoff** | After a failed attempt, `next_attempt_at` is set via `notification_compute_next_attempt_at(attempt_count)` using delays: **60s → 5m → 15m → 1h → 24h** (capped steps). |
| **Terminal `failed`** | After the last allowed attempt, or unrecoverable send exhaustion: `status = 'failed'`, `failure_code` set, `next_attempt_at = null`. |
| **No active token** | Not infinite: retries with `failure_code = 'no_active_token_retry'` until `max_attempts`, then `failed` / `no_active_token`. |
| **Transient send** | Rows return to `pending` with `failure_code = 'transient_send'` and a future `next_attempt_at`. |
| **Idempotence** | Unchanged: `dedup_key` unique; enqueue is still `ON CONFLICT DO NOTHING`. |

**What still cannot be validated without a real device token**

- Actual APNs/Expo delivery and user-visible push.
- Parsing Expo HTTP **response bodies** for invalid tokens: `pg_net.http_post` is enqueue-only in-process; token deactivation via `maybe_deactivate_push_token_from_error` only runs when the SQL layer surfaces an error message matching known patterns (best-effort).

### 4) Inspect queue rows

**Pending / eligible soon**

```sql
select id, user_id, status, attempt_count, max_attempts, next_attempt_at, failure_code, last_error, created_at
from public.notification_outbox
where status = 'pending'
order by next_attempt_at nulls first, created_at asc;
```

**Scheduled (not yet eligible)**

```sql
select id, user_id, next_attempt_at, attempt_count, failure_code, last_error
from public.notification_outbox
where status = 'pending'
  and next_attempt_at > timezone('utc', now());
```

**Terminal failures**

```sql
select id, user_id, status, attempt_count, failure_code, last_error, updated_at
from public.notification_outbox
where status = 'failed'
order by updated_at desc;
```

**Sent**

```sql
select id, user_id, status, sent_at, attempt_count, payload->>'providerRequestId' as provider_request_id
from public.notification_outbox
where status = 'sent'
order by sent_at desc nulls last;
```

### 5) Device tokens

```sql
select user_id, platform, left(expo_push_token, 24) || '…' as token_prefix, is_active, last_seen_at, updated_at
from public.device_push_tokens
where user_id = '<auth-user-id>'
order by updated_at desc;
```

### 6) Deploy runner and secrets

```bash
supabase functions deploy notification-dispatch-runner
supabase secrets set DISPATCH_RUNNER_SECRET="<strong-runner-secret>"
```

### 7) Run delivery runner manually

`dispatch_pending_notifications_batch` returns JSON: `sent`, `usersProcessed`, `usersLockSkipped`, `limit`.

```bash
curl -sS -X POST \
  "https://<project-ref>.functions.supabase.co/notification-dispatch-runner" \
  -H "Content-Type: application/json" \
  -H "x-dispatch-secret: <DISPATCH_RUNNER_SECRET>" \
  -d '{"limit":100}'
```

Example success body:

```json
{
  "ok": true,
  "dispatched": 2,
  "usersProcessed": 2,
  "usersLockSkipped": 0,
  "limit": 100,
  "elapsedMs": 42
}
```

### 8) Validate enqueue on `reveal_ready`

After `reveal_ready`, expect new rows with `status = 'pending'` and `next_attempt_at` set (immediate eligibility unless already scheduled).

```sql
select user_id, kind, relationship_id, dedup_key, status, next_attempt_at, attempt_count, max_attempts, created_at
from public.notification_outbox
where relationship_id = '<relationship-id>'
order by created_at asc;
```

### 9) Validate device behavior

1. Device receives push (title/body as sent by server).
2. Tap notification → app opens `/relation/[id]` from payload `relationId`.
