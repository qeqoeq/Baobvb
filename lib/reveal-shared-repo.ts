import { supabase } from './supabase';
import type {
  SharedRelationshipRevealRecord,
  SharedRevealRecordUpsertInput,
} from './reveal-shared-types';
import { getAuthenticatedUserId } from './supabase-auth';
import type { RelationshipSideKey } from '../store/useRelationsStore';

const TABLE = 'shared_relationship_reveals';

function getSideUserColumn(side: RelationshipSideKey): 'side_a_user_id' | 'side_b_user_id' {
  return side === 'sideA' ? 'side_a_user_id' : 'side_b_user_id';
}

function getSideReadingColumn(side: RelationshipSideKey): 'side_a_reading_id' | 'side_b_reading_id' {
  return side === 'sideA' ? 'side_a_reading_id' : 'side_b_reading_id';
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
): Promise<SharedRelationshipRevealRecord> {
  const userId = await getAuthenticatedUserId();
  const sideUserColumn = getSideUserColumn(side);
  const readingColumn = getSideReadingColumn(side);
  const existing = await getSharedRevealRecordForCurrentUser(relationshipId);

  if (existing) {
    assertCurrentUserOwnsSide(existing, side, userId);
  }

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        relationship_id: relationshipId,
        [sideUserColumn]: userId,
        [readingColumn]: readingId,
      },
      { onConflict: 'relationship_id' },
    )
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return data as SharedRelationshipRevealRecord;
}

// Backward-compatible aliases while Day 2 remains helper-only.
export const getSharedRevealRecord = getSharedRevealRecordForCurrentUser;
export const upsertSharedRevealRecord = upsertSharedRevealRecordForCurrentUser;
export const attachSharedPrivateReadingReference = attachSharedPrivateReadingReferenceForCurrentUser;
