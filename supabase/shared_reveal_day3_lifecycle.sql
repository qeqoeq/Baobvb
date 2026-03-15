alter table public.shared_relationship_reveals
  add column if not exists side_a_reading_payload jsonb,
  add column if not exists side_b_reading_payload jsonb;

create or replace function public.shared_map_pillar_value(p_rating smallint)
returns numeric
language plpgsql
immutable
as $$
begin
  case p_rating
    when 1 then return 18;
    when 2 then return 41;
    when 3 then return 63;
    when 4 then return 82;
    when 5 then return 96;
    else
      raise exception 'pillar rating must be between 1 and 5';
  end case;
end;
$$;

create or replace function public.shared_payload_rating(
  p_payload jsonb,
  p_key text
)
returns smallint
language plpgsql
immutable
as $$
declare
  raw_value text;
  parsed_value integer;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'reading payload must be a JSON object';
  end if;

  raw_value := p_payload ->> p_key;
  if raw_value is null then
    raise exception 'reading payload missing key: %', p_key;
  end if;

  parsed_value := raw_value::integer;
  if parsed_value < 1 or parsed_value > 5 then
    raise exception 'reading payload key % must be between 1 and 5', p_key;
  end if;

  return parsed_value::smallint;
end;
$$;

create or replace function public.assert_valid_shared_reading_payload(p_payload jsonb)
returns void
language plpgsql
immutable
as $$
declare
  key_count integer;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'reading payload must be a JSON object';
  end if;

  select count(*) into key_count
  from jsonb_object_keys(p_payload);
  if key_count <> 5 then
    raise exception 'reading payload must contain exactly 5 pillar keys';
  end if;

  perform public.shared_payload_rating(p_payload, 'trust');
  perform public.shared_payload_rating(p_payload, 'support');
  perform public.shared_payload_rating(p_payload, 'interactions');
  perform public.shared_payload_rating(p_payload, 'affinity');
  perform public.shared_payload_rating(p_payload, 'sharedNetwork');
end;
$$;

create or replace function public.compute_shared_mutual_result(
  p_side_a_payload jsonb,
  p_side_b_payload jsonb
)
returns table(final_score integer, tier text)
language plpgsql
immutable
as $$
declare
  -- Formula parity reference:
  -- This mirrors lib/evaluation.ts computeMutualRelationshipScore() constants and rules.
  -- Minimal parity fixtures (same inputs should produce same final score/tier as lib/evaluation.ts):
  -- A={trust:5,support:5,interactions:4,affinity:4,sharedNetwork:3}
  -- B={trust:5,support:4,interactions:4,affinity:4,sharedNetwork:3}
  -- => expected final_score=86, tier='Anchor'
  -- A={trust:5,support:5,interactions:5,affinity:4,sharedNetwork:4}
  -- B={trust:2,support:2,interactions:3,affinity:3,sharedNetwork:2}
  -- => expected final_score=34, tier='Ghost'
  -- A={trust:2,support:5,interactions:5,affinity:4,sharedNetwork:4}
  -- B={trust:5,support:5,interactions:4,affinity:4,sharedNetwork:3}
  -- => expected final_score=59, tier='Thrill'
  -- A={trust:5,support:4,interactions:2,affinity:4,sharedNetwork:3}
  -- B={trust:4,support:4,interactions:2,affinity:3,sharedNetwork:3}
  -- => expected final_score=63, tier='Thrill'
  -- Guard script reference: npm run -s check:mutual-parity
  a_trust smallint := public.shared_payload_rating(p_side_a_payload, 'trust');
  a_support smallint := public.shared_payload_rating(p_side_a_payload, 'support');
  a_interactions smallint := public.shared_payload_rating(p_side_a_payload, 'interactions');
  a_affinity smallint := public.shared_payload_rating(p_side_a_payload, 'affinity');
  a_shared_network smallint := public.shared_payload_rating(p_side_a_payload, 'sharedNetwork');
  b_trust smallint := public.shared_payload_rating(p_side_b_payload, 'trust');
  b_support smallint := public.shared_payload_rating(p_side_b_payload, 'support');
  b_interactions smallint := public.shared_payload_rating(p_side_b_payload, 'interactions');
  b_affinity smallint := public.shared_payload_rating(p_side_b_payload, 'affinity');
  b_shared_network smallint := public.shared_payload_rating(p_side_b_payload, 'sharedNetwork');
  side_score_a numeric;
  side_score_b numeric;
  mutual_base numeric;
  gap_penalty numeric;
  critical_penalty numeric := 0;
  signature_bonus numeric := 0; -- Must remain 0 until signature policy is explicitly versioned.
  final_raw numeric;
  max_gap numeric := (96 - 18);
begin
  side_score_a :=
    public.shared_map_pillar_value(a_trust) * 0.35 +
    public.shared_map_pillar_value(a_support) * 0.20 +
    public.shared_map_pillar_value(a_interactions) * 0.20 +
    public.shared_map_pillar_value(a_affinity) * 0.15 +
    public.shared_map_pillar_value(a_shared_network) * 0.10;

  side_score_b :=
    public.shared_map_pillar_value(b_trust) * 0.35 +
    public.shared_map_pillar_value(b_support) * 0.20 +
    public.shared_map_pillar_value(b_interactions) * 0.20 +
    public.shared_map_pillar_value(b_affinity) * 0.15 +
    public.shared_map_pillar_value(b_shared_network) * 0.10;

  mutual_base := sqrt(side_score_a * side_score_b);

  gap_penalty :=
    (
      power(abs(public.shared_map_pillar_value(a_trust) - public.shared_map_pillar_value(b_trust)) / max_gap, 1.7) * 0.40 +
      power(abs(public.shared_map_pillar_value(a_support) - public.shared_map_pillar_value(b_support)) / max_gap, 1.45) * 0.22 +
      power(abs(public.shared_map_pillar_value(a_interactions) - public.shared_map_pillar_value(b_interactions)) / max_gap, 1.3) * 0.20 +
      power(abs(public.shared_map_pillar_value(a_affinity) - public.shared_map_pillar_value(b_affinity)) / max_gap, 1.15) * 0.12 +
      power(abs(public.shared_map_pillar_value(a_shared_network) - public.shared_map_pillar_value(b_shared_network)) / max_gap, 1.05) * 0.06
    ) * 28;

  if a_trust <= 2 or b_trust <= 2 then
    critical_penalty := critical_penalty + 9;
  end if;
  if a_support <= 2 or b_support <= 2 then
    critical_penalty := critical_penalty + 5;
  end if;
  if a_interactions <= 2 and b_interactions <= 2 then
    critical_penalty := critical_penalty + 4;
  end if;
  if (a_trust <= 2 and a_support <= 2) or (b_trust <= 2 and b_support <= 2) then
    critical_penalty := critical_penalty + 6;
  end if;

  final_raw := mutual_base - gap_penalty - critical_penalty + signature_bonus;

  if a_trust <= 2 or b_trust <= 2 then
    final_raw := least(final_raw, 59);
  end if;
  if a_support <= 2 or b_support <= 2 then
    final_raw := least(final_raw, 64);
  end if;
  if a_interactions <= 2 and b_interactions <= 2 then
    final_raw := least(final_raw, 63);
  end if;

  final_score := round(greatest(0, least(100, final_raw)));

  if final_score >= 90 then
    tier := 'Legend';
  elsif final_score >= 79 then
    tier := 'Anchor';
  elsif final_score >= 65 then
    tier := 'Vibrant';
  elsif final_score >= 50 then
    tier := 'Thrill';
  elsif final_score >= 35 then
    tier := 'Spark';
  else
    tier := 'Ghost';
  end if;

  return next;
end;
$$;

create or replace function public.guard_shared_reveal_participant_updates()
returns trigger
language plpgsql
as $$
declare
  current_user_id uuid := auth.uid();
  is_side_a boolean := old.side_a_user_id = current_user_id;
  is_side_b boolean := old.side_b_user_id = current_user_id;
  allow_lifecycle_update text := current_setting('baobab.allow_lifecycle_update', true);
begin
  if allow_lifecycle_update = '1' then
    return new;
  end if;

  if current_user_id is null then
    raise exception 'authenticated user required';
  end if;

  if not (is_side_a or is_side_b) then
    raise exception 'only participants may update shared reveal records';
  end if;

  if new.side_a_user_id is distinct from old.side_a_user_id
     or new.side_b_user_id is distinct from old.side_b_user_id then
    raise exception 'side participant assignment is immutable';
  end if;

  if new.status is distinct from old.status
     or new.cooking_started_at is distinct from old.cooking_started_at
     or new.unlock_at is distinct from old.unlock_at
     or new.ready_at is distinct from old.ready_at
     or new.first_viewed_at is distinct from old.first_viewed_at
     or new.revealed_at is distinct from old.revealed_at
     or new.mutual_score is distinct from old.mutual_score
     or new.tier is distinct from old.tier
     or new.relationship_name_revealed is distinct from old.relationship_name_revealed
     or new.finalized_version is distinct from old.finalized_version then
    raise exception 'lifecycle and result fields are read-only for participant updates';
  end if;

  if is_side_a then
    if new.side_b_reading_id is distinct from old.side_b_reading_id
       or new.side_b_reading_payload is distinct from old.side_b_reading_payload then
      raise exception 'side A cannot modify side B reading reference';
    end if;
    if old.side_a_reading_id is not null
       and new.side_a_reading_id is distinct from old.side_a_reading_id then
      raise exception 'side A reading reference is immutable once set';
    end if;
    if old.side_a_reading_payload is not null
       and new.side_a_reading_payload is distinct from old.side_a_reading_payload then
      raise exception 'side A reading payload is immutable once set';
    end if;
  end if;

  if is_side_b then
    if new.side_a_reading_id is distinct from old.side_a_reading_id
       or new.side_a_reading_payload is distinct from old.side_a_reading_payload then
      raise exception 'side B cannot modify side A reading reference';
    end if;
    if old.side_b_reading_id is not null
       and new.side_b_reading_id is distinct from old.side_b_reading_id then
      raise exception 'side B reading reference is immutable once set';
    end if;
    if old.side_b_reading_payload is not null
       and new.side_b_reading_payload is distinct from old.side_b_reading_payload then
      raise exception 'side B reading payload is immutable once set';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_shared_reveal_participant_updates
  on public.shared_relationship_reveals;
create trigger trg_guard_shared_reveal_participant_updates
before update on public.shared_relationship_reveals
for each row
execute function public.guard_shared_reveal_participant_updates();

create or replace function public.attach_shared_private_reading_reference(
  p_relationship_id text,
  p_side text,
  p_reading_id text,
  p_reading_payload jsonb
)
returns public.shared_relationship_reveals
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  rec public.shared_relationship_reveals;
  now_utc timestamptz := timezone('utc', now());
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;
  if p_side not in ('sideA', 'sideB') then
    raise exception 'invalid side, expected sideA or sideB';
  end if;
  if p_relationship_id is null or btrim(p_relationship_id) = '' then
    raise exception 'relationship_id is required';
  end if;
  if p_reading_id is null or btrim(p_reading_id) = '' then
    raise exception 'reading_id is required';
  end if;

  perform public.assert_valid_shared_reading_payload(p_reading_payload);

  select *
  into rec
  from public.shared_relationship_reveals
  where relationship_id = p_relationship_id
  for update;

  if not found then
    if p_side = 'sideA' then
      insert into public.shared_relationship_reveals (
        relationship_id,
        side_a_user_id,
        side_a_reading_id,
        side_a_reading_payload,
        status,
        relationship_name_revealed,
        finalized_version,
        created_at,
        updated_at
      ) values (
        p_relationship_id,
        caller_id,
        p_reading_id,
        p_reading_payload,
        'waiting_other_side',
        false,
        1,
        now_utc,
        now_utc
      )
      returning * into rec;
    else
      insert into public.shared_relationship_reveals (
        relationship_id,
        side_b_user_id,
        side_b_reading_id,
        side_b_reading_payload,
        status,
        relationship_name_revealed,
        finalized_version,
        created_at,
        updated_at
      ) values (
        p_relationship_id,
        caller_id,
        p_reading_id,
        p_reading_payload,
        'waiting_other_side',
        false,
        1,
        now_utc,
        now_utc
      )
      returning * into rec;
    end if;

    return rec;
  end if;

  if p_side = 'sideA' then
    if rec.side_b_user_id = caller_id then
      raise exception 'cannot claim both sides in the same shared reveal record';
    end if;
    if rec.side_a_user_id is not null and rec.side_a_user_id <> caller_id then
      raise exception 'side A already belongs to another participant';
    end if;
    if rec.side_a_reading_id is not null and rec.side_a_reading_id <> p_reading_id then
      raise exception 'side A reading id is already frozen';
    end if;
    if rec.side_a_reading_payload is not null and rec.side_a_reading_payload <> p_reading_payload then
      raise exception 'side A reading payload is already frozen';
    end if;

    perform set_config('baobab.allow_lifecycle_update', '1', true);

    update public.shared_relationship_reveals
    set
      side_a_user_id = coalesce(side_a_user_id, caller_id),
      side_a_reading_id = coalesce(side_a_reading_id, p_reading_id),
      side_a_reading_payload = coalesce(side_a_reading_payload, p_reading_payload)
    where relationship_id = p_relationship_id
    returning * into rec;
  else
    if rec.side_a_user_id = caller_id then
      raise exception 'cannot claim both sides in the same shared reveal record';
    end if;
    if rec.side_b_user_id is not null and rec.side_b_user_id <> caller_id then
      raise exception 'side B already belongs to another participant';
    end if;
    if rec.side_b_reading_id is not null and rec.side_b_reading_id <> p_reading_id then
      raise exception 'side B reading id is already frozen';
    end if;
    if rec.side_b_reading_payload is not null and rec.side_b_reading_payload <> p_reading_payload then
      raise exception 'side B reading payload is already frozen';
    end if;

    perform set_config('baobab.allow_lifecycle_update', '1', true);

    update public.shared_relationship_reveals
    set
      side_b_user_id = coalesce(side_b_user_id, caller_id),
      side_b_reading_id = coalesce(side_b_reading_id, p_reading_id),
      side_b_reading_payload = coalesce(side_b_reading_payload, p_reading_payload)
    where relationship_id = p_relationship_id
    returning * into rec;
  end if;

  return rec;
end;
$$;

grant execute on function public.attach_shared_private_reading_reference(text, text, text, jsonb)
  to authenticated;

create or replace function public.start_shared_cooking_reveal_if_ready(
  p_relationship_id text
)
returns public.shared_relationship_reveals
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  rec public.shared_relationship_reveals;
  computed_final_score integer;
  computed_tier text;
  now_utc timestamptz := timezone('utc', now());
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  select *
  into rec
  from public.shared_relationship_reveals
  where relationship_id = p_relationship_id
  for update;

  if not found then
    return null;
  end if;

  if caller_id <> rec.side_a_user_id and caller_id <> rec.side_b_user_id then
    raise exception 'only participants can start shared cooking reveal';
  end if;

  if rec.status in ('cooking_reveal', 'reveal_ready', 'revealed') then
    return rec;
  end if;

  if rec.side_a_user_id is null
     or rec.side_b_user_id is null
     or rec.side_a_reading_id is null
     or rec.side_b_reading_id is null
     or rec.side_a_reading_payload is null
     or rec.side_b_reading_payload is null then
    return rec;
  end if;

  select result.final_score, result.tier
  into computed_final_score, computed_tier
  from public.compute_shared_mutual_result(
    rec.side_a_reading_payload,
    rec.side_b_reading_payload
  ) as result;

  perform set_config('baobab.allow_lifecycle_update', '1', true);

  update public.shared_relationship_reveals
  set
    status = 'cooking_reveal',
    cooking_started_at = coalesce(cooking_started_at, now_utc),
    unlock_at = coalesce(unlock_at, now_utc + interval '90 seconds'),
    mutual_score = computed_final_score,
    tier = computed_tier,
    relationship_name_revealed = false,
    finalized_version = coalesce(finalized_version, 1) + 1
  where relationship_id = p_relationship_id
  returning * into rec;

  return rec;
end;
$$;

grant execute on function public.start_shared_cooking_reveal_if_ready(text)
  to authenticated;

create or replace function public.mark_shared_reveal_ready_if_unlocked(
  p_relationship_id text
)
returns public.shared_relationship_reveals
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  rec public.shared_relationship_reveals;
  now_utc timestamptz := timezone('utc', now());
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  select *
  into rec
  from public.shared_relationship_reveals
  where relationship_id = p_relationship_id
  for update;

  if not found then
    return null;
  end if;

  if caller_id <> rec.side_a_user_id and caller_id <> rec.side_b_user_id then
    raise exception 'only participants can mark shared reveal ready';
  end if;

  if rec.status <> 'cooking_reveal' then
    return rec;
  end if;
  if rec.unlock_at is null or now_utc < rec.unlock_at then
    return rec;
  end if;

  perform set_config('baobab.allow_lifecycle_update', '1', true);

  update public.shared_relationship_reveals
  set
    status = 'reveal_ready',
    ready_at = coalesce(ready_at, now_utc)
  where relationship_id = p_relationship_id
  returning * into rec;

  return rec;
end;
$$;

grant execute on function public.mark_shared_reveal_ready_if_unlocked(text)
  to authenticated;

create or replace function public.open_shared_reveal(
  p_relationship_id text
)
returns public.shared_relationship_reveals
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  rec public.shared_relationship_reveals;
  now_utc timestamptz := timezone('utc', now());
begin
  if caller_id is null then
    raise exception 'authenticated user required';
  end if;

  select *
  into rec
  from public.shared_relationship_reveals
  where relationship_id = p_relationship_id
  for update;

  if not found then
    return null;
  end if;

  if caller_id <> rec.side_a_user_id and caller_id <> rec.side_b_user_id then
    raise exception 'only participants can open shared reveal';
  end if;

  if rec.status = 'revealed' then
    return rec;
  end if;

  if rec.status = 'cooking_reveal' and rec.unlock_at is not null and now_utc >= rec.unlock_at then
    perform set_config('baobab.allow_lifecycle_update', '1', true);
    update public.shared_relationship_reveals
    set
      status = 'reveal_ready',
      ready_at = coalesce(ready_at, now_utc)
    where relationship_id = p_relationship_id
    returning * into rec;
  end if;

  if rec.status <> 'reveal_ready' then
    return rec;
  end if;

  perform set_config('baobab.allow_lifecycle_update', '1', true);

  update public.shared_relationship_reveals
  set
    status = 'revealed',
    relationship_name_revealed = true,
    first_viewed_at = coalesce(first_viewed_at, now_utc),
    revealed_at = now_utc
  where relationship_id = p_relationship_id
  returning * into rec;

  return rec;
end;
$$;

grant execute on function public.open_shared_reveal(text)
  to authenticated;
