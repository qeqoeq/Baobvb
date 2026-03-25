import type { SharedInviteClaimResult } from './reveal-shared-types';
import type { SharedRelationBootstrapInput } from '../store/useRelationsStore';

/**
 * Ephemeral in-memory handoff registry for claim shared records.
 *
 * Problem: claim_relationship_invite returns a shared_record with reading state
 * and lifecycle data, but this truth is lost when navigating from invite/[relationId]
 * to relation/add via route params (strings only).
 *
 * Solution: store the projected claim data here (keyed by canonicalRelationId),
 * consume it exactly once in the add flow, then delete it.
 *
 * Properties:
 *   - In-memory only. Never persisted to AsyncStorage.
 *   - One-shot: takeClaimRecord deletes the entry after reading it.
 *   - Keyed by canonicalRelationId (the same key used for local dedup).
 *   - Not a global sync cache — strictly bounded to the claim → add flow.
 *   - If the flow is abandoned before consumption, the entry is GC'd with the module.
 *     Bootstrap shared relations is the durable recovery path.
 */
const registry = new Map<string, SharedRelationBootstrapInput>();

/**
 * Stores the shared_record from a successful claim result before navigating to the add flow.
 *
 * Converts SharedInviteClaimResult → SharedRelationBootstrapInput so that
 * buildSharedRevealLocalState (already used in bootstrap) can project localState
 * with the same logic for both paths.
 *
 * Called in invite/[relationId].tsx immediately after claim succeeds,
 * before router.push('/relation/add').
 */
export function putClaimRecord(
  canonicalRelationId: string,
  claimResult: SharedInviteClaimResult,
): void {
  const rec = claimResult.shared_record;
  registry.set(canonicalRelationId, {
    relationship_id: canonicalRelationId,
    status: rec.status,
    my_side: claimResult.claimed_side,
    side_a_present: rec.side_a_user_id !== null,
    side_b_present: rec.side_b_user_id !== null,
    side_a_reading_id: rec.side_a_reading_id,
    side_b_reading_id: rec.side_b_reading_id,
    cooking_started_at: rec.cooking_started_at,
    unlock_at: rec.unlock_at,
    ready_at: rec.ready_at,
    revealed_at: rec.revealed_at,
    relationship_name_revealed: rec.relationship_name_revealed,
  });
}

/**
 * Consumes and removes the stored claim record for the given canonicalRelationId.
 *
 * One-shot: a second call for the same id returns null (entry was already deleted).
 * Returns null if no record was stored (flow abandoned, already consumed, etc.).
 *
 * Called in relation/add.tsx at materialization time.
 */
export function takeClaimRecord(
  canonicalRelationId: string,
): SharedRelationBootstrapInput | null {
  const record = registry.get(canonicalRelationId) ?? null;
  registry.delete(canonicalRelationId);
  return record;
}
