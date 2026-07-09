-- b15_handle_freeze.sql
-- Date     : 2026-07-10
-- Objet    : B15 / D2 — geler le handle après le premier claim.
--            Défense en profondeur serveur : une fois qu'un handle existe pour
--            un user_id, un handle DIFFÉRENT est rejeté (reason 'handle_frozen').
--            La re-publication à l'IDENTIQUE reste autorisée (idempotence) —
--            requise par reconcileHandleOwnership (bootstrap client, B11 Volet C)
--            et par me/edit post-setup (qui renvoie toujours me.handle inchangé).
--
-- STOP : appliquer dans le SQL Editor Supabase. Ne pas exécuter via CLI.
--
-- Base    : docs/sql/b8_b4_counterpart_name.sql BLOC 3 (upsert_user_handle 2-args).
--           Signature inchangée (text, text DEFAULT NULL) → CREATE OR REPLACE
--           remplace en place, PAS de DROP.
-- Ajouts vs BLOC 3 :
--   (a) variable existing_handle dans le DECLARE principal ;
--   (b) garde 'handle_frozen' insérée APRÈS le format guard et AVANT l'INSERT
--       ON CONFLICT de user_handles.
-- Le reste (format guard, sync user_public_profiles, COALESCE) est identique.
--
-- Risque REVOKE anon : Supabase réintroduit parfois anon après CREATE OR REPLACE.
-- Le REVOKE from anon est explicite ci-dessous (cf. leçon P0.5bis registre).

-- ════════════════════════════════════════════════════════════════════════════════
-- upsert_user_handle — gel handle post-setup
-- ════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.upsert_user_handle(
  p_handle       text,
  p_display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id       uuid        := auth.uid();
  now_utc         timestamptz := timezone('utc', now());
  existing_handle text;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authenticated user required';
  END IF;

  IF p_handle IS NULL OR btrim(p_handle) = '' OR p_handle = '@' THEN
    RAISE EXCEPTION 'handle cannot be empty';
  END IF;

  -- Format guard: server-side defence-in-depth.
  -- Client normalisation (normalizeHandleInput) est la voie principale.
  IF p_handle !~ '^@[a-z0-9._-]+$' THEN
    RAISE EXCEPTION 'invalid handle format: must match ^@[a-z0-9._-]+$';
  END IF;

  -- B15 / D2 : gel du handle après le premier claim.
  -- Autorise la re-publication à l'identique (idempotence — reconcileHandleOwnership
  -- + me/edit post-setup renvoient le handle existant). Rejette tout handle
  -- DIFFÉRENT une fois qu'un handle existe déjà pour ce user_id.
  SELECT handle INTO existing_handle
  FROM public.user_handles
  WHERE user_id = caller_id;

  IF existing_handle IS NOT NULL AND existing_handle <> p_handle THEN
    RETURN jsonb_build_object('success', false, 'reason', 'handle_frozen');
  END IF;

  -- 1. Upsert user_handles (comportement existant, inchangé).
  BEGIN
    INSERT INTO public.user_handles (user_id, handle, updated_at)
    VALUES (caller_id, p_handle, now_utc)
    ON CONFLICT (user_id) DO UPDATE
      SET handle     = EXCLUDED.handle,
          updated_at = EXCLUDED.updated_at
    WHERE user_handles.handle <> EXCLUDED.handle;

  EXCEPTION WHEN unique_violation THEN
    -- Un autre user_id détient déjà ce handle.
    RETURN jsonb_build_object('success', false, 'reason', 'taken');
  END;

  -- 2. Sync display_name + handle vers user_public_profiles.
  --    Crée la ligne si absente (idempotent avec get_or_create_public_profile_id).
  --    COALESCE : si p_display_name est null (appel legacy), conserve la valeur existante.
  INSERT INTO public.user_public_profiles (user_id, handle, display_name)
  VALUES (
    caller_id,
    p_handle,
    CASE WHEN p_display_name IS NOT NULL AND btrim(p_display_name) <> ''
         THEN btrim(p_display_name)
         ELSE NULL
    END
  )
  ON CONFLICT (user_id) DO UPDATE
    SET handle       = EXCLUDED.handle,
        display_name = COALESCE(EXCLUDED.display_name, user_public_profiles.display_name);

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_user_handle(text, text) FROM public;
REVOKE ALL ON FUNCTION public.upsert_user_handle(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.upsert_user_handle(text, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATIONS POST-APPLY
-- La fonction est auth-gatée (auth.uid()). Dans le SQL Editor, auth.uid() est null,
-- on simule donc un utilisateur réel via request.jwt.claims, en transaction ROLLBACK
-- (aucune mutation persistée). Les blocs V1/V2 sont indépendants — exécuter chacun
-- et lire son dernier SELECT.
-- ════════════════════════════════════════════════════════════════════════════════

-- V1. IDEMPOTENCE — re-soumettre le MÊME handle qu'un user existant → success:true
BEGIN;
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', (SELECT user_id FROM public.user_handles LIMIT 1))::text,
    true
  );
  SELECT public.upsert_user_handle(
    (SELECT handle FROM public.user_handles
      WHERE user_id = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid),
    'Verify B15'
  ) AS v1_idempotence;  -- Attendu : {"success": true}
ROLLBACK;

-- V2. GEL — soumettre un handle DIFFÉRENT pour le même user → handle_frozen
BEGIN;
  SELECT set_config(
    'request.jwt.claims',
    json_build_object('sub', (SELECT user_id FROM public.user_handles LIMIT 1))::text,
    true
  );
  SELECT public.upsert_user_handle('@zzz.freeze.test', 'Verify B15') AS v2_frozen;
  -- Attendu : {"success": false, "reason": "handle_frozen"}
ROLLBACK;

-- V3. GRANTS — aucun anon ni public ; authenticated présent
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'upsert_user_handle'
ORDER BY grantee;
-- Attendu : aucune ligne grantee='anon' ni 'public' ;
--           authenticated EXECUTE présent ;
--           postgres / service_role peuvent apparaître (owner + clé serveur — normal).
