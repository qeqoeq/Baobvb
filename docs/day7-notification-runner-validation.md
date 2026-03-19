## Day 7 Notification Runner Validation

This validates the final-path separation:
- lifecycle trigger enqueues only
- token registration updates token only
- delivery happens only through explicit runner invocation

### 1) Regression checks

Run before and after deployment:

```bash
npm run -s typecheck
set -a && source .env && set +a && npm run -s check:invite-claim-flow
set -a && source .env && set +a && npm run -s check:shared-reveal-flow
```

### 2) Deploy runner and configure secrets

```bash
supabase functions deploy notification-dispatch-runner
supabase secrets set DISPATCH_RUNNER_SECRET="<strong-runner-secret>"
```

Required:
- Day 7 SQL migration applied (including `dispatch_pending_notifications_batch`).
- App build running on a real iPhone (Expo push tokens require a physical device).

### 3) Validate device token registration

1. Sign in with Apple in the app.
2. Accept notification permission.
3. Confirm token row exists:

```sql
select user_id, platform, expo_push_token, is_active, last_seen_at
from public.device_push_tokens
where user_id = '<auth-user-id>'
order by updated_at desc;
```

### 4) Validate outbox enqueue on `reveal_ready`

1. Complete the shared reveal flow until status becomes `reveal_ready`.
2. Confirm enqueue happened (dedup-safe):

```sql
select user_id, kind, relationship_id, dedup_key, status, attempt_count, created_at
from public.notification_outbox
where relationship_id = '<relationship-id>'
order by created_at asc;
```

Expected before runner: `status = 'pending'`.

### 5) Run delivery runner manually

Invoke the Edge Function with a bounded batch:

```bash
curl -sS -X POST \
  "https://<project-ref>.functions.supabase.co/notification-dispatch-runner" \
  -H "Content-Type: application/json" \
  -H "x-dispatch-secret: <DISPATCH_RUNNER_SECRET>" \
  -d '{"limit":100}'
```

### 6) Validate sent status

```sql
select user_id, relationship_id, status, attempt_count, sent_at, last_error
from public.notification_outbox
where relationship_id = '<relationship-id>'
order by created_at asc;
```

Expected after runner:
- `status = 'sent'` for deliverable rows
- `attempt_count >= 1`

### 7) Validate device behavior

1. Confirm the device receives push:
   - Title: `Your link is ready`
   - Body: `Open Baobab to reveal it`
2. Tap the notification.
3. Confirm app deep-links to `/relation/[id]` for the payload `relationId`.
