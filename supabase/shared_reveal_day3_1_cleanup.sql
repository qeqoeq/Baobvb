drop trigger if exists trg_prevent_shared_reveal_participant_reassignment
  on public.shared_relationship_reveals;

drop function if exists public.prevent_shared_reveal_participant_reassignment();
