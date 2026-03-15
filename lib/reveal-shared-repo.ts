import { supabase } from './supabase';
import type {
  SharedReadingPayload,
  SharedRelationshipRevealRecord,
  SharedRevealRecordUpsertInput,
} from './reveal-shared-types';
import { getAuthenticatedUserId } from './supabase-auth';
import type { RelationshipSideKey } from '../store/useRelationsStore';

const TABLE = 'shared_relationship_reveals';

function getSideUserColumn(side: RelationshipSideKey): 'side_a_user_id' | 'side_b_user_id' {
  return side === 'sideA' ? 'side_a_user_id' : 'side_b_user_id';
}

function assertCurrentUserOwnsSide(
  record: SharedRelationshipRevealRecord,
  side: RelationshipSideKey,
  userId: string,
): void {
  const sideUserId = side === 'sideA' ? record.side_a_user_id : record.side_b_user_id;
  if (sideUserId !== userId) {
    throw new Error('Current user is not bound to the requested relationship side.');
  }
}

export async function getSharedRevealRecordForCurrentUser(
  relationshipId: string,
): Promise<SharedRelationshipRevealRecord | null> {
  const userId = await getAuthenticatedUserId();

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('relationship_id', relationshipId)
    .or(`side_a_user_id.eq.${userId},side_b_user_id.eq.${userId}`)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as SharedRelationshipRevealRecord | null;
}

export async function upsertSharedRevealRecordForCurrentUser(
  input: SharedRevealRecordUpsertInput,
): Promise<SharedRelationshipRevealRecord> {
  const userId = await getAuthenticatedUserId();
  const sideUserColumn = getSideUserColumn(input.participantSide);
  const existing = await getSharedRevealRecordForCurrentUser(input.relationshipId);

  if (existing) {
    assertCurrentUserOwnsSide(existing, input.participantSide, userId);
  }

  // Day 2.1 hardening: client upsert only claims participant ownership.
  // Shared reveal lifecycle/result fields remain server-controlled for now.
  const payload = {
    relationship_id: input.relationshipId,
    [sideUserColumn]: userId,
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(payload, { onConflict: 'relationship_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as SharedRelationshipRevealRecord;
}

export async function attachSharedPrivateReadingReferenceForCurrentUser(
  relationshipId: string,
  side: RelationshipSideKey,
  readingId: string,
  readingPayload: SharedReadingPayload,
): Promise<SharedRelationshipRevealRecord> {
  await getAuthenticatedUserId();
  const { data, error } = await supabase.rpc('attach_shared_private_reading_reference', {
    p_relationship_id: relationshipId,
    p_side: side,
    p_reading_id: readingId,
    p_reading_payload: readingPayload,
  });

  if (error) {
    throw error;
  }

  return data as SharedRelationshipRevealRecord;
}

async function runSharedLifecycleAction(
  rpcName:
    | 'start_shared_cooking_reveal_if_ready'
    | 'mark_shared_reveal_ready_if_unlocked'
    | 'open_shared_reveal',
  relationshipId: string,
): Promise<SharedRelationshipRevealRecord | null> {
  await getAuthenticatedUserId();
  const { data, error } = await supabase.rpc(rpcName, {
    p_relationship_id: relationshipId,
  });

  if (error) {
    throw error;
  }

  return (data as SharedRelationshipRevealRecord | null) ?? null;
}

export async function startSharedCookingRevealIfReady(
  relationshipId: string,
): Promise<SharedRelationshipRevealRecord | null> {
  return runSharedLifecycleAction('start_shared_cooking_reveal_if_ready', relationshipId);
}

export async function markSharedRevealReadyIfUnlocked(
  relationshipId: string,
): Promise<SharedRelationshipRevealRecord | null> {
  return runSharedLifecycleAction('mark_shared_reveal_ready_if_unlocked', relationshipId);
}

export async function openSharedReveal(
  relationshipId: string,
): Promise<SharedRelationshipRevealRecord | null> {
  return runSharedLifecycleAction('open_shared_reveal', relationshipId);
}

// Backward-compatible aliases while Day 2 remains helper-only.
export const getSharedRevealRecord = getSharedRevealRecordForCurrentUser;
export const upsertSharedRevealRecord = upsertSharedRevealRecordForCurrentUser;
export const attachSharedPrivateReadingReference = attachSharedPrivateReadingReferenceForCurrentUser;
