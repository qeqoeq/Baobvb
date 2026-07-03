-- day11_apply.sql
-- Date     : 2026-07-03
-- Objet    : Enrichit my_shared_relationships() avec counterpart_public_profile_id
--            (UUID du profil public de l'autre participant, résolu server-side).
--            claim_relationship_invite() est déjà à la bonne version — voir note ci-dessous.
--
-- Contexte :
--   my_shared_relationships() (day10) renvoie 12 colonnes — pas de counterpart_public_profile_id.
--   Le champ est null côté client pour toutes les relations bootstrap (confirmé par dump).
--   claim_relationship_invite() intègre déjà counterpart_public_profile_id depuis la migration
--   20260523 + correctif #variable_conflict use_column (migration 20260530) — NE PAS réécrire.
--
-- Risque connu :
--   Supabase réintroduit parfois un GRANT EXECUTE TO anon après recréation de fonction.
--   Le REVOKE from anon ci-dessous est donc EXPLICIT et séparé du REVOKE from public.
--
-- Vérification post-apply (coller dans le SQL Editor après exécution) :
--
--   -- 1. Signature my_shared_relationships : doit lister 13 colonnes dont counterpart_public_profile_id
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name = 'my_shared_relationships'
--   order by ordinal_position;
--
--   -- 2. Grants : aucun grant PUBLIC ni ANON sur les deux fonctions
--   select grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_schema = 'public'
--     and routine_name in ('my_shared_relationships', 'claim_relationship_invite')
--   order by routine_name, grantee;
--
--   -- 3. Valeur réelle retournée (nécessite un utilisateur authentifié)
--   select relationship_id, counterpart_public_profile_id
--   from my_shared_relationships()
--   limit 5;

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. my_shared_relationships — DROP obligatoire (type de retour change : 12 → 13 colonnes)
-- ════════════════════════════════════════════════════════════════════════════════

drop function if exists public.my_shared_relationships();

create or replace function public.my_shared_relationships()
returns table(
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
  counterpart_public_profile_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  return query
  select
    sr.relationship_id,
    sr.status,
    case when sr.side_a_user_id = caller_id then 'sideA' else 'sideB' end as my_side,
    (sr.side_a_user_id is not null) as side_a_present,
    (sr.side_b_user_id is not null) as side_b_present,
    sr.side_a_reading_id,
    sr.side_b_reading_id,
    sr.cooking_started_at,
    sr.unlock_at,
    sr.ready_at,
    sr.revealed_at,
    sr.relationship_name_revealed,
    -- Résolu server-side : jamais d'auth.uid() de l'autre participant exposé au client.
    -- Null si l'autre participant n'a pas encore provisionné de profil public,
    -- ou si son slot n'est pas encore rempli (waiting_other_side).
    (
      select upp.public_profile_id
      from public.user_public_profiles upp
      where upp.user_id = case
        when sr.side_a_user_id = caller_id then sr.side_b_user_id
        else sr.side_a_user_id
      end
    ) as counterpart_public_profile_id
  from public.shared_relationship_reveals sr
  where
    (sr.side_a_user_id = caller_id or sr.side_b_user_id = caller_id)
    -- Exclure les IDs legacy r-{timestamp}. Seuls les UUIDs canoniques sont retournés.
    and sr.relationship_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
end;
$$;

-- Grants my_shared_relationships
revoke all on function public.my_shared_relationships() from public;
revoke all on function public.my_shared_relationships() from anon;
grant execute on function public.my_shared_relationships() to authenticated;

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. claim_relationship_invite — AUCUNE ACTION
-- ════════════════════════════════════════════════════════════════════════════════
--
-- claim_relationship_invite(text) est déjà à la version correcte :
--   • Migration 20260523 : bootstrappe shared_relationship_reveals + retourne counterpart_public_profile_id
--   • Migration 20260530 : ajoute #variable_conflict use_column (correctif "invite link is invalid")
--
-- Le fichier day11 contient une version antérieure de cette fonction (logique day6, sans
-- #variable_conflict use_column). L'appliquer casserait le claim flow. NE PAS exécuter.
--
-- Grants à ré-appliquer si Supabase les a effacés après recréation précédente :
--   revoke all on function public.claim_relationship_invite(text) from public;
--   revoke all on function public.claim_relationship_invite(text) from anon;
--   grant execute on function public.claim_relationship_invite(text) to authenticated;
