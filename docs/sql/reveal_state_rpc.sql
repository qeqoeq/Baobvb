-- reveal_state_rpc.sql
-- Date     : 2026-07-03
-- Objet    : get_my_reveal_state(p_relationship_id uuid)
--            Remplace le .select() client sur shared_relationship_reveals.
--            Retourne l'état du reveal SANS aucun auth.uid() (side_a_user_id / side_b_user_id
--            ne sont jamais retournés). my_side est calculé server-side via auth.uid().
--            Aucune ligne retournée si le caller n'est pas participant.
--
-- Doctrine :
--   - L'auth.uid() de la contrepartie n'est jamais retourné au client (cf. my_shared_relationships).
--   - Le RLS existant sur shared_relationship_reveals reste en défense en profondeur.
--   - my_side ('sideA' | 'sideB') remplace la comparaison client side_*_user_id === currentUserId.
--
-- Risque connu : Supabase peut réintroduire GRANT TO anon après recréation.
-- Les deux REVOKE ci-dessous sont explicites et séparés.
--
-- Vérification post-apply (SQL Editor) :
--
--   -- 1. Signature : doit lister 15 colonnes dont my_side, sans side_*_user_id
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name = 'get_my_reveal_state'
--   order by ordinal_position;
--
--   -- 2. Grants : seul "authenticated" doit apparaître
--   select grantee, privilege_type
--   from information_schema.routine_privileges
--   where routine_schema = 'public'
--     and routine_name = 'get_my_reveal_state'
--   order by grantee;
--
--   -- 3. Appel authentifié (remplacer par un UUID réel)
--   select * from get_my_reveal_state('<relationship_id_uuid>');

create or replace function public.get_my_reveal_state(p_relationship_id uuid)
returns table(
  my_side                    text,
  status                     text,
  side_a_present             boolean,
  side_b_present             boolean,
  side_a_reading_id          text,
  side_b_reading_id          text,
  cooking_started_at         timestamptz,
  unlock_at                  timestamptz,
  ready_at                   timestamptz,
  first_viewed_at            timestamptz,
  revealed_at                timestamptz,
  mutual_score               numeric,
  tier                       text,
  relationship_name_revealed boolean,
  finalized_version          integer
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
    -- Computed server-side — auth.uid() of the counterpart never leaves the DB.
    case when sr.side_a_user_id = caller_id then 'sideA' else 'sideB' end as my_side,
    sr.status,
    (sr.side_a_user_id is not null) as side_a_present,
    (sr.side_b_user_id is not null) as side_b_present,
    sr.side_a_reading_id,
    sr.side_b_reading_id,
    sr.cooking_started_at,
    sr.unlock_at,
    sr.ready_at,
    sr.first_viewed_at,
    sr.revealed_at,
    sr.mutual_score,
    sr.tier,
    sr.relationship_name_revealed,
    sr.finalized_version
  from public.shared_relationship_reveals sr
  where sr.relationship_id = p_relationship_id::text
    and (sr.side_a_user_id = caller_id or sr.side_b_user_id = caller_id);
end;
$$;

revoke all on function public.get_my_reveal_state(uuid) from public;
revoke all on function public.get_my_reveal_state(uuid) from anon;
grant execute on function public.get_my_reveal_state(uuid) to authenticated;
