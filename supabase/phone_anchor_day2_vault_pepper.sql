-- phone_anchor_day2_vault_pepper
--
-- Corrects the pepper-reading mechanism in hash_phone_anchor_e164.
--
-- Problem:
--   Day1 read the pepper via current_setting('app.phone_hash_pepper', true), which
--   requires ALTER DATABASE postgres SET "app.phone_hash_pepper" = '...'.
--   On Supabase Cloud, this raises:
--     ERROR 42501: permission denied to set parameter "app.phone_hash_pepper"
--   GUC writes at the database level are reserved for superuser — not available
--   through the Supabase SQL editor.
--
-- Solution:
--   Supabase Vault (extension: supabase_vault) stores secrets encrypted at rest
--   using pgsodium AES-256-GCM. Secrets are readable from SECURITY DEFINER
--   functions running as the secret owner via vault.decrypted_secrets.
--   This replaces the GUC read without requiring any superuser privilege.
--
-- Secret setup (required before first use — choose ONE method):
--
--   A. Supabase Dashboard → project → Vault → Add new secret
--        Name:  baobab_phone_hash_pepper
--        Value: <SECRET_RANDOM_MIN_32_BYTES>
--
--   B. SQL editor (execute once, do not save query):
--        SELECT vault.create_secret('<SECRET_RANDOM_MIN_32_BYTES>', 'baobab_phone_hash_pepper');
--
--   Generate a suitable secret locally (never paste output into a file or commit):
--        openssl rand -hex 32
--
--   The secret value must NEVER appear in any migration, commit, log,
--   client config, or .env file.
--
-- Verification after setup (does not reveal the value):
--   SELECT
--     (SELECT count(*) = 1 FROM vault.decrypted_secrets
--      WHERE name = 'baobab_phone_hash_pepper') AS secret_exists,
--     length((SELECT decrypted_secret FROM vault.decrypted_secrets
--             WHERE name = 'baobab_phone_hash_pepper')) >= 64 AS length_ok;
--   Expected: secret_exists = true, length_ok = true (64 = hex length of 32 bytes).
--
-- Scope:
--   - Replaces public.hash_phone_anchor_e164 only.
--   - register_phone_invite_anchor is unchanged — it already delegates to
--     hash_phone_anchor_e164 and inherits the fix transparently.
--   - No tables, indexes, RLS policies, or other grants are modified.
--   - No TypeScript, store, or UI changes.

-- ── Extension ────────────────────────────────────────────────────────────────
-- supabase_vault is pre-installed on Supabase Cloud projects (Postgres 15+).
-- This call is idempotent.
create extension if not exists supabase_vault;

-- ── hash_phone_anchor_e164 (vault variant) ───────────────────────────────────
-- Replaces the day1 version. Contract is identical; only pepper source changes.
--
-- Security invariants (all preserved from day1):
--   - SECURITY DEFINER: runs as function owner (postgres role), which has
--     read access to vault.decrypted_secrets for secrets it owns.
--   - SET search_path = public: prevents search_path injection.
--     vault.decrypted_secrets is accessed via fully-qualified schema name
--     and is unaffected by this restriction.
--   - Pepper read into a local variable; never returned, never logged.
--   - Raw E.164 never stored, never returned.
--   - Raises explicitly if secret is absent or empty.
--   - REVOKE from public remains in effect (re-asserted below).

create or replace function public.hash_phone_anchor_e164(p_phone_e164 text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  pepper_v text;
begin
  if p_phone_e164 is null or btrim(p_phone_e164) = '' then
    raise exception 'phone_e164 is required';
  end if;

  if p_phone_e164 !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'phone_e164 must be in E.164 format (e.g. +33612345678)';
  end if;

  -- Read pepper from Vault.
  -- vault.decrypted_secrets is fully qualified — search_path restriction does not apply.
  -- The value is never committed to this file or any other source.
  select decrypted_secret
  into pepper_v
  from vault.decrypted_secrets
  where name = 'baobab_phone_hash_pepper'
  limit 1;

  if pepper_v is null or btrim(pepper_v) = '' then
    raise exception
      'Vault secret baobab_phone_hash_pepper is not configured — phone anchor hashing is unavailable. '
      'Create it via Supabase Dashboard → Vault → Add new secret (name: baobab_phone_hash_pepper), '
      'or: SELECT vault.create_secret(''<SECRET>'', ''baobab_phone_hash_pepper'');';
  end if;

  -- HMAC-SHA256(E.164, pepper) → hex.
  -- extensions.hmac: pgcrypto via extensions schema (Supabase convention, established in day1).
  -- The raw E.164 is never written to any table, log, or return value.
  return encode(extensions.hmac(p_phone_e164, pepper_v, 'sha256'), 'hex');
end;
$$;

-- Re-assert: internal helper, not callable by any client role directly.
-- Idempotent with day1 revoke — safe to apply even if day1 revoke is already in effect.
revoke execute on function public.hash_phone_anchor_e164(text) from public;
