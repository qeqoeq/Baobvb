-- X.83: pass_deliveries table + RLS + create_pass_delivery + fetch_pass_deliveries
--
-- Doctrine:
--   - no status column (no delivered/seen/opened/kept/not_for_me)
--   - no source_relation_id (prevents source chain leakage)
--   - no passed_object_id (sender gesture stays local only)
--   - receiver decision never written back to this table
--   - sender cannot read their own deliveries (no read-receipt vector)

create table public.pass_deliveries (
  id                   uuid        primary key default gen_random_uuid(),
  created_at           timestamptz not null    default now(),
  from_user_id         uuid        not null    references auth.users(id) on delete cascade,
  to_user_id           uuid        not null    references auth.users(id) on delete cascade,
  canonical_relation_id uuid       not null,
  object_type          text        not null    check (object_type = 'place'),
  object_payload       jsonb       not null,
  constraint pass_deliveries_payload_keys
    check (
      (object_payload ? 'objectId') and
      (object_payload ? 'nameSnapshot') and
      (object_payload ? 'categorySnapshot')
    ),
  constraint pass_deliveries_payload_is_object
    check (jsonb_typeof(object_payload) = 'object'),
  constraint pass_deliveries_name_nonempty
    check (length(trim(object_payload->>'nameSnapshot')) > 0),
  constraint pass_deliveries_category_valid
    check ((object_payload->>'categorySnapshot') in ('restaurant','cafe','bar','spot','other')),
  constraint pass_deliveries_payload_no_forbidden_keys
    check (
      not (object_payload ? 'sourceRelationId')
      and not (object_payload ? 'source_relation_id')
      and not (object_payload ? 'status')
      and not (object_payload ? 'delivered')
      and not (object_payload ? 'seen')
      and not (object_payload ? 'opened')
      and not (object_payload ? 'kept')
      and not (object_payload ? 'not_for_me')
    )
);

-- Receiver lookup: find deliveries for me, ordered oldest-first for materialization
create index pass_deliveries_to_user_created_idx
  on public.pass_deliveries (to_user_id, created_at asc);

-- Anti-duplicate: same relation + objectId
create index pass_deliveries_relation_object_idx
  on public.pass_deliveries (canonical_relation_id, ((object_payload->>'objectId')));

-- ── RLS ────────────────────────────────────────────────────────────────────────

alter table public.pass_deliveries enable row level security;

-- Receiver: select only their own deliveries
create policy "receiver_select_own_deliveries"
  on public.pass_deliveries
  for select
  using (to_user_id = auth.uid());

-- Sender cannot select their sent deliveries — no read-receipt vector.
-- All inserts go through create_pass_delivery (security definer) — no direct client insert.
-- No UPDATE, no DELETE policies.

-- ── RPC: create_pass_delivery ─────────────────────────────────────────────────
--
-- Client sends: (canonical_relation_id, object_type, object_payload)
-- Server derives to_user_id from shared_relationship_reveals.
-- Anti-spam: max 3 deliveries from_user → to_user per 24h.
-- Anti-duplicate: no second delivery for same canonical_relation_id + objectId.
-- Payload is sanitized server-side: sourceRelationId stripped even if injected.

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

  -- Derive to_user_id: caller must be one revealed side of the shared relation
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

  -- Anti-spam: max 3 deliveries from caller → this recipient in 24h
  if (
    select count(*) from public.pass_deliveries pd
    where pd.from_user_id = caller_id
      and pd.to_user_id = other_user_id
      and pd.created_at >= now() - interval '24 hours'
  ) >= 3 then
    raise exception 'pass delivery limit reached for this recipient today';
  end if;

  -- Sanitize payload fields (strip any sourceRelationId or unknown keys)
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

  -- Anti-duplicate: one delivery per canonical_relation_id + objectId
  if exists (
    select 1 from public.pass_deliveries pd
    where pd.canonical_relation_id = p_canonical_relation_id
      and (pd.object_payload->>'objectId') = obj_id
  ) then
    raise exception 'delivery already exists for this relation and object';
  end if;

  -- Build clean payload — only known fields, no sourceRelationId, no status
  clean_payload := jsonb_build_object(
    'objectId',       obj_id,
    'nameSnapshot',   norm_name,
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

  return query select new_id, new_created_at;
end;
$$;

-- ── RPC: fetch_pass_deliveries ────────────────────────────────────────────────
--
-- Returns all deliveries where to_user_id = auth.uid(), ordered created_at asc.
-- Does not mark as read. Does not delete. Does not expose from_user_id.

create or replace function public.fetch_pass_deliveries()
returns table (
  id                    uuid,
  created_at            timestamptz,
  canonical_relation_id uuid,
  object_type           text,
  object_payload        jsonb
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
      pd.id,
      pd.created_at,
      pd.canonical_relation_id,
      pd.object_type,
      pd.object_payload
    from public.pass_deliveries pd
    where pd.to_user_id = caller_id
    order by pd.created_at asc;
end;
$$;
