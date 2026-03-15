# Shared Reveal Day 4 Checklist

Use this checklist to validate the current shared reveal lifecycle before notification work.

## Automated script

- Ensure env vars are set:
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Run:
  - `npm run -s check:shared-reveal-flow`
- Expected:
  - PASS for scenario1 (single participant)
  - PASS for scenario2 (both readings -> cooking + frozen result)
  - PASS for scenario3 (unlock -> reveal_ready, idempotent)
  - PASS for scenario4 (open -> revealed, idempotent)
  - PASS for scenario6 (access control + protected field guard)

## Manual precedence check (scenario5)

This validates shared-vs-local precedence behavior in app flows.

1. Create/identify a relation where shared record is present and accessible to current participant.
2. Open relation detail and confirm reveal state follows shared status (not stale local snapshot).
3. Simulate unavailable shared access (e.g. temporary network off) and confirm local fallback state still renders safely.
4. Confirm no reveal leakage before shared status is `revealed`:
   - no premature score/tier/name
   - no premature relationship legend

## Notes

- Script creates namespaced disposable rows using `day4-test-<timestamp>-<case>-<rand>`.
- Rows are intentionally not deleted to keep runs auditable and unambiguous.
