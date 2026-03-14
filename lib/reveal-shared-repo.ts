import { supabase } from './supabase';
import type {
  SharedRelationshipRevealRecord,
  SharedRevealRecordUpsertInput,
} from './reveal-shared-types';
import type { RelationshipSideKey } from '../store/useRelationsStore';

const TABLE = 'shared_relationship_reveals';

// Day 1 foundation only: these helpers are intentionally not wired into product flows yet.
// Production client writes require authenticated sessions + explicit RLS policies.
export async function getSharedRevealRecord(
  relationshipId: string,
): Promise<SharedRelationshipRevealRecord | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('relationship_id', relationshipId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as SharedRelationshipRevealRecord | null;
}

export async function upsertSharedRevealRecord(
  input: SharedRevealRecordUpsertInput,
): Promise<SharedRelationshipRevealRecord> {
  const payload = {
    relationship_id: input.relationshipId,
    status: input.status,
    cooking_started_at: input.cookingStartedAt,
    unlock_at: input.unlockAt,
    ready_at: input.readyAt,
    first_viewed_at: input.firstViewedAt,
    revealed_at: input.revealedAt,
    mutual_score: input.mutualScore,
    tier: input.tier,
    relationship_name_revealed: input.relationshipNameRevealed,
    finalized_version: input.finalizedVersion,
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

export async function attachSharedPrivateReadingReference(
  relationshipId: string,
  side: RelationshipSideKey,
  readingId: string,
): Promise<SharedRelationshipRevealRecord> {
  const readingColumn =
    side === 'sideA' ? 'side_a_reading_id' : 'side_b_reading_id';

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(
      {
        relationship_id: relationshipId,
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
