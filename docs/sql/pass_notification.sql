-- pass_notification.sql
-- Date     : 2026-07-03
-- Objet    : Étend le pipeline notification_outbox pour les pass deliveries.
--            Le récepteur reçoit une notification push anonyme quand un pass
--            lui est adressé. L'émetteur ne dispose d'aucun moyen de lire
--            l'état du dispatch ou de la réception.
--
-- Changements :
--   1. Étend notification_outbox_kind_check → ajoute 'pass_delivery'
--   2. Remplace dequeue_pending_notifications_for_dispatch : supprime le filtre
--      `kind = 'reveal_ready'` pour traiter tous les kinds (pass_delivery inclus)
--   3. Crée enqueue_pass_delivery_notification() — appelée depuis create_pass_delivery
--   4. Remplace create_pass_delivery pour appeler enqueue après l'INSERT
--
-- Doctrine :
--   - payload push = {"type":"pass_delivery","pushTitle":"Baobab","pushBody":"Someone thought of you 🌱"}
--   - Aucun nom d'émetteur, aucun nom d'objet, aucun delivery_id dans le push
--   - No active token → no-op silencieux à l'enqueue
--   - L'émetteur ne peut lire ni notification_outbox ni device_push_tokens du récepteur
--
-- Vérification post-apply (SQL Editor) :
--
--   -- 1. Contrainte kind
--   select pg_get_constraintdef(oid) from pg_constraint
--   where conname = 'notification_outbox_kind_check';
--
--   -- 2. Grants enqueue_pass_delivery_notification
--   select grantee, privilege_type from information_schema.routine_privileges
--   where routine_name = 'enqueue_pass_delivery_notification';
--
--   -- 3. Smoke test : insérer une fake delivery dans notification_outbox et vérifier
--   select kind, status, payload from notification_outbox order by created_at desc limit 5;

-- ── 1. Étendre le kind check ──────────────────────────────────────────────────

alter table public.notification_outbox
  drop constraint notification_outbox_kind_check;

alter table public.notification_outbox
  add constraint notification_outbox_kind_check
  check (kind in ('reveal_ready', 'pass_delivery'));

-- ── 2. dequeue_pending_notifications_for_dispatch — tous kinds ────────────────
--
-- Seuls changements vs day14 :
--   - Bloc no-token fail : suppression du filtre `and kind = 'reveal_ready'`
--     → fail silencieux pour tous les kinds sans token actif
--   - Sélection principale : suppression de `and no.kind = 'reveal_ready'`
--     → tous les kinds pending/failed sont dequeueable
--   - Tout le reste est identique au day14

create or replace function public.dequeue_pending_notifications_for_dispatch(
  p_limit integer default 50
)
returns table (
  outbox_id       uuid,
  expo_push_token text,
  payload         jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  job_row    record;
begin
  -- Recover stale processing rows from a previous crash.
  with stale as (
    select id
    from public.notification_outbox
    where status = 'processing'
    for update skip locked
  )
  update public.notification_outbox
  set
    status     = 'pending',
    last_error = 'Recovered from stale processing state.'
  from stale
  where notification_outbox.id = stale.id;

  -- Fail rows for users who have no active push token (all kinds).
  update public.notification_outbox
  set
    status     = 'failed',
    last_error = 'No active push token for user.'
  where status in ('pending', 'failed')
    and not exists (
      select 1
      from public.device_push_tokens as dpt
      where dpt.user_id = notification_outbox.user_id
        and dpt.is_active = true
    );

  -- Select and lock eligible jobs (all kinds — reveal_ready and pass_delivery).
  for job_row in
    select
      no.id            as outbox_id,
      no.payload,
      no.attempt_count,
      best_token.expo_push_token
    from public.notification_outbox as no
    join lateral (
      select dpt.expo_push_token
      from public.device_push_tokens as dpt
      where dpt.user_id = no.user_id
        and dpt.is_active = true
      order by dpt.updated_at desc
      limit 1
    ) as best_token on true
    where no.status in ('pending', 'failed')
    order by no.created_at asc
    limit safe_limit
    for update of no skip locked
  loop
    update public.notification_outbox
    set
      status        = 'processing',
      attempt_count = job_row.attempt_count + 1,
      last_error    = null
    where id = job_row.outbox_id;

    outbox_id       := job_row.outbox_id;
    expo_push_token := job_row.expo_push_token;
    payload         := job_row.payload;
    return next;
  end loop;
end;
$$;

revoke execute on function public.dequeue_pending_notifications_for_dispatch(integer)
  from public, authenticated;
grant execute on function public.dequeue_pending_notifications_for_dispatch(integer)
  to service_role;

-- ── 3. enqueue_pass_delivery_notification ────────────────────────────────────
--
-- Appelée par create_pass_delivery (security definer) après l'INSERT.
-- Pas de grant à authenticated — les clients ne peuvent pas enqueuer directement.
-- Si le récepteur n'a aucun push token actif : return silencieux (no-op).
-- Idempotent par delivery_id via dedup_key = 'pass_delivery:{delivery_id}'.

create or replace function public.enqueue_pass_delivery_notification(
  p_delivery_id uuid,
  p_to_user_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No active token: silent no-op. Avoids accumulating undeliverable rows.
  if not exists (
    select 1 from public.device_push_tokens dpt
    where dpt.user_id = p_to_user_id
      and dpt.is_active = true
  ) then
    return;
  end if;

  insert into public.notification_outbox (
    user_id,
    kind,
    relationship_id,
    dedup_key,
    payload,
    status
  )
  values (
    p_to_user_id,
    'pass_delivery',
    p_delivery_id::text,
    format('pass_delivery:%s', p_delivery_id),
    jsonb_build_object(
      'type',      'pass_delivery',
      'pushTitle', 'Baobab',
      'pushBody',  'Someone thought of you 🌱'
    ),
    'pending'
  )
  on conflict (dedup_key) do nothing;
end;
$$;

-- Supabase réintroduit GRANT EXECUTE TO anon sur toute fonction recréée.
-- Toujours révoquer public + authenticated + anon explicitement.
revoke all on function public.enqueue_pass_delivery_notification(uuid, uuid)
  from public, authenticated, anon;
-- No grant to authenticated or anon: only called from create_pass_delivery (security definer).
-- The function owner (postgres) has implicit execute.

-- ── 4. create_pass_delivery — avec enqueue ────────────────────────────────────
--
-- Identique à la migration 20260629000000 sauf :
--   - perform public.enqueue_pass_delivery_notification(new_id, other_user_id)
--     inséré après l'INSERT ... INTO, avant return query.
-- On recrée en entier (CREATE OR REPLACE) pour ne pas risquer un diff partiel.

create or replace function public.create_pass_delivery(
  p_canonical_relation_id uuid,
  p_object_type           text,
  p_object_payload        jsonb
)
returns table (id uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id       uuid := auth.uid();
  other_user_id   uuid;
  obj_id          text;
  norm_name       text;
  norm_category   text;
  norm_note       text;
  clean_payload   jsonb;
  new_id          uuid;
  new_created_at  timestamptz;
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  if p_canonical_relation_id is null then
    raise exception 'canonical_relation_id is required';
  end if;

  if p_object_type is null or p_object_type <> 'place' then
    raise exception 'object_type must be place';
  end if;

  if p_object_payload is null or jsonb_typeof(p_object_payload) <> 'object' then
    raise exception 'object_payload must be a JSON object';
  end if;

  -- Derive to_user_id: caller must be one revealed side of the shared relation.
  select
    case
      when srr.side_a_user_id = caller_id then srr.side_b_user_id
      when srr.side_b_user_id = caller_id then srr.side_a_user_id
      else null
    end
  into other_user_id
  from public.shared_relationship_reveals srr
  where srr.relationship_id = p_canonical_relation_id::text
    and srr.status = 'revealed'
    and (srr.side_a_user_id = caller_id or srr.side_b_user_id = caller_id)
  limit 1;

  if other_user_id is null then
    raise exception 'no revealed shared relation found or counterpart not bound';
  end if;

  -- Anti-spam: max 3 deliveries from caller → this recipient in 24h.
  if (
    select count(*) from public.pass_deliveries pd
    where pd.from_user_id = caller_id
      and pd.to_user_id = other_user_id
      and pd.created_at >= now() - interval '24 hours'
  ) >= 3 then
    raise exception 'pass delivery limit reached for this recipient today';
  end if;

  -- Sanitize payload fields (strip any sourceRelationId or unknown keys).
  obj_id        := trim(p_object_payload->>'objectId');
  norm_name     := trim(p_object_payload->>'nameSnapshot');
  norm_category := p_object_payload->>'categorySnapshot';

  if obj_id is null or length(obj_id) = 0 then
    raise exception 'objectId is required';
  end if;

  if norm_name is null or length(norm_name) = 0 then
    raise exception 'nameSnapshot is required';
  end if;
  norm_name := left(norm_name, 120);

  if norm_category not in ('restaurant','cafe','bar','spot','other') then
    raise exception 'invalid categorySnapshot';
  end if;

  norm_note := trim(p_object_payload->>'note');
  if norm_note = '' then norm_note := null; end if;
  if norm_note is not null then
    norm_note := left(norm_note, 80);
  end if;

  -- Anti-duplicate: one delivery per canonical_relation_id + objectId.
  if exists (
    select 1 from public.pass_deliveries pd
    where pd.canonical_relation_id = p_canonical_relation_id
      and (pd.object_payload->>'objectId') = obj_id
  ) then
    raise exception 'delivery already exists for this relation and object';
  end if;

  -- Build clean payload — only known fields, no sourceRelationId, no status.
  clean_payload := jsonb_build_object(
    'objectId',         obj_id,
    'nameSnapshot',     norm_name,
    'categorySnapshot', norm_category
  );
  if norm_note is not null then
    clean_payload := clean_payload || jsonb_build_object('note', norm_note);
  end if;

  insert into public.pass_deliveries
    (from_user_id, to_user_id, canonical_relation_id, object_type, object_payload)
  values
    (caller_id, other_user_id, p_canonical_relation_id, p_object_type, clean_payload)
  returning pass_deliveries.id, pass_deliveries.created_at
  into new_id, new_created_at;

  -- Notify the receiver. No-op if they have no push token.
  -- Enqueue is best-effort: failure must not roll back the delivery.
  begin
    perform public.enqueue_pass_delivery_notification(new_id, other_user_id);
  exception
    when others then
      null; -- enqueue failure is silent — delivery is committed regardless
  end;

  return query select new_id, new_created_at;
end;
$$;

revoke execute on function public.create_pass_delivery(uuid, text, jsonb) from public;
grant execute on function public.create_pass_delivery(uuid, text, jsonb) to authenticated;
