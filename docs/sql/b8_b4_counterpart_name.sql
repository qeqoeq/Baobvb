-- b8_b4_counterpart_name.sql
-- Date     : 2026-07-08
-- Objet    : (a) B8 préventif  — contrainte UNIQUE(relationship_id) sur
--                shared_relationship_reveals (base saine, 110/110 distinct, 0 doublon)
--            (b) B4 — colonnes display_name/handle sur user_public_profiles,
--                     upsert_user_handle étendu (p_display_name DEFAULT NULL),
--                     my_shared_relationships() enrichie avec counterpart_display_name
--                     et counterpart_handle (13 → 15 colonnes)
--
-- STOP : appliquer dans le SQL Editor Supabase. Ne pas exécuter via CLI.
--
-- Pré-condition B8  : diagnostic 2026-07-08 → 0 doublon (110 rows / 110 distinct).
-- Pré-condition B4  : user_public_profiles existe (user_public_profiles.sql appliqué).
--                     upsert_user_handle(text) existe (user_handles.sql appliqué).
--
-- Ordre d'application : BLOCS 1 → 2 → 3 → 4, chacun en transaction séparée.
-- Risque REVOKE anon : Supabase réintroduit parfois anon après DROP+CREATE.
-- Le REVOKE from anon est explicite sur chaque nouvelle fonction (cf. SUPABASE-REGISTRY).
--
-- Vérifications post-apply : voir section VÉRIFICATIONS en fin de fichier.

-- ════════════════════════════════════════════════════════════════════════════════
-- BLOC 1 — B8 préventif : UNIQUE(relationship_id)
-- ════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.shared_relationship_reveals
  ADD CONSTRAINT shared_relationship_reveals_relationship_id_unique
  UNIQUE (relationship_id);

-- ════════════════════════════════════════════════════════════════════════════════
-- BLOC 2 — B4a : colonnes display_name et handle sur user_public_profiles
-- ADD COLUMN IF NOT EXISTS → idempotent, sans perte de données.
-- ════════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_public_profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS handle       text;

-- ════════════════════════════════════════════════════════════════════════════════
-- BLOC 3 — B4b : upsert_user_handle étendu
--
-- Changement de signature : (text) → (text, text DEFAULT NULL)
-- DROP obligatoire : CREATE OR REPLACE ne remplace pas si la signature change.
-- COALESCE sur display_name : les appels legacy (sans p_display_name) ne
-- écrasent pas une valeur déjà stockée.
-- ════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.upsert_user_handle(text);

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
  caller_id uuid        := auth.uid();
  now_utc   timestamptz := timezone('utc', now());
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
-- BLOC 4 — B4c : my_shared_relationships() — 13 → 15 colonnes
--
-- DROP obligatoire : le type de retour change, CREATE OR REPLACE seul échouerait.
-- Remplace la double sous-requête (day11) par un LEFT JOIN unique pour les 3
-- champs counterpart (public_profile_id, display_name, handle) : un seul accès
-- à user_public_profiles au lieu de deux.
-- Comportement NULL identique à day11 : si le counterpart n'a pas de profil public,
-- les 3 champs sont NULL (LEFT JOIN → ligne absente).
-- ════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.my_shared_relationships();

CREATE OR REPLACE FUNCTION public.my_shared_relationships()
RETURNS TABLE(
  relationship_id               text,
  status                        text,
  my_side                       text,
  side_a_present                boolean,
  side_b_present                boolean,
  side_a_reading_id             text,
  side_b_reading_id             text,
  cooking_started_at            timestamptz,
  unlock_at                     timestamptz,
  ready_at                      timestamptz,
  revealed_at                   timestamptz,
  relationship_name_revealed    boolean,
  counterpart_public_profile_id uuid,
  counterpart_display_name      text,
  counterpart_handle            text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'authenticated user required';
  END IF;

  RETURN QUERY
  SELECT
    sr.relationship_id,
    sr.status,
    CASE WHEN sr.side_a_user_id = caller_id THEN 'sideA' ELSE 'sideB' END AS my_side,
    (sr.side_a_user_id IS NOT NULL)  AS side_a_present,
    (sr.side_b_user_id IS NOT NULL)  AS side_b_present,
    sr.side_a_reading_id,
    sr.side_b_reading_id,
    sr.cooking_started_at,
    sr.unlock_at,
    sr.ready_at,
    sr.revealed_at,
    sr.relationship_name_revealed,
    -- Résolu server-side : auth.uid() du counterpart n'est jamais exposé au client.
    c_upp.public_profile_id  AS counterpart_public_profile_id,
    c_upp.display_name       AS counterpart_display_name,
    c_upp.handle             AS counterpart_handle
  FROM public.shared_relationship_reveals sr
  LEFT JOIN public.user_public_profiles c_upp
    ON c_upp.user_id = CASE
         WHEN sr.side_a_user_id = caller_id THEN sr.side_b_user_id
         ELSE sr.side_a_user_id
       END
  WHERE
    (sr.side_a_user_id = caller_id OR sr.side_b_user_id = caller_id)
    -- Exclure les IDs legacy r-{timestamp}. Seuls les UUIDs canoniques sont retournés.
    AND sr.relationship_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
END;
$$;

REVOKE ALL ON FUNCTION public.my_shared_relationships() FROM public;
REVOKE ALL ON FUNCTION public.my_shared_relationships() FROM anon;
GRANT EXECUTE ON FUNCTION public.my_shared_relationships() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════════
-- VÉRIFICATIONS POST-APPLY
-- (coller dans le SQL Editor après exécution des 4 blocs)
-- ════════════════════════════════════════════════════════════════════════════════

-- V1. Contrainte B8 présente
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND table_name   = 'shared_relationship_reveals'
  AND constraint_name = 'shared_relationship_reveals_relationship_id_unique';
-- Attendu : 1 ligne, constraint_type = 'UNIQUE'

-- V2. Colonnes B4a présentes sur user_public_profiles
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'user_public_profiles'
  AND column_name IN ('display_name', 'handle')
ORDER BY column_name;
-- Attendu : 2 lignes (display_name text YES, handle text YES)

-- V3. Signature upsert_user_handle — 2 paramètres
SELECT pg_get_function_arguments(oid) AS args
FROM pg_proc
WHERE proname = 'upsert_user_handle'
  AND pronamespace = 'public'::regnamespace;
-- Attendu : "p_handle text, p_display_name text DEFAULT NULL::text"

-- V4. Type de retour my_shared_relationships — 15 colonnes
SELECT pg_get_function_result('public.my_shared_relationships()'::regprocedure);
-- Attendu (verbatim) :
-- TABLE(relationship_id text, status text, my_side text, side_a_present boolean,
--   side_b_present boolean, side_a_reading_id text, side_b_reading_id text,
--   cooking_started_at timestamp with time zone, unlock_at timestamp with time zone,
--   ready_at timestamp with time zone, revealed_at timestamp with time zone,
--   relationship_name_revealed boolean, counterpart_public_profile_id uuid,
--   counterpart_display_name text, counterpart_handle text)

-- V5. Grants — anon absent sur les deux fonctions modifiées
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('upsert_user_handle', 'my_shared_relationships')
ORDER BY routine_name, grantee;
-- Attendu : aucune ligne grantee = 'anon' ni 'public'.
--           authenticated EXECUTE présent.
--           postgres et service_role peuvent apparaître (owner + clé serveur — normal).
