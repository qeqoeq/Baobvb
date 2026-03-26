/**
 * Assisted reconciliation — pure read-only helper.
 *
 * Purpose:
 *   Detect when a shared-backed relation (bootstrap / claim) and an unlinked
 *   scan draft appear to involve the same real-world person, based strictly on
 *   matching public profile identifiers.
 *
 * Invariants:
 *   - 100 % read-only. No mutation, no side effect, no React state.
 *   - Returns at most one suggestion per call.
 *   - Signal used: counterpartPublicProfileId === sourcePublicProfileId.
 *   - Both fields are backend-owned public identities — no auth.uid() involved.
 *   - Archived relations are never considered as suggestion candidates.
 *   - If more than one candidate matches the signal, no suggestion is returned.
 *     Ambiguity is not resolved by arbitrary selection — silence is preferable
 *     to a misleading pointer.
 *
 * What this is NOT:
 *   - Proof that two relations are the same relation.
 *     A person can participate in multiple shared relations.
 *   - Authorization to merge or link automatically.
 *   - A heuristic based on name, handle, avatar, or timing.
 *
 * What this ENABLES:
 *   A suggestion UI inviting the user to manually review and decide.
 *   No structural change, no automatic link, no merge.
 */

import type { Relation } from '../store/useRelationsStore';

/**
 * A possible match between a shared-backed relation and an unlinked scan draft,
 * detected via matching public profile identifiers.
 *
 * Fields:
 *   sharedRelationId     — id of the shared-backed relation (the current context)
 *   draftRelationId      — id of the unlinked scan draft
 *   matchedPublicProfileId — the publicProfileId that appears on both sides
 *                            (person signal, NOT a relation key)
 */
export type AssistedReconciliationSuggestion = {
  sharedRelationId: string;
  draftRelationId: string;
  matchedPublicProfileId: string;
};

/**
 * Returns true when the relation is shared-backed:
 * canonicalRelationId present, or source is 'bootstrap' or 'claim'.
 *
 * All three conditions are equivalent in normal flows, but the union
 * protects against edge cases where one signal is temporarily absent.
 */
function isSharedBacked(relation: Relation): boolean {
  return (
    !!relation.canonicalRelationId ||
    relation.source === 'bootstrap' ||
    relation.source === 'claim'
  );
}

/**
 * Looks for an assisted reconciliation suggestion for the given relation.
 *
 * Decision matrix:
 *   1. The relation must exist in the list.
 *   2. It must be shared-backed (canonicalRelationId present, or source bootstrap/claim).
 *   3. It must have a non-empty counterpartPublicProfileId.
 *   4. There must be exactly one other relation with:
 *        - different id
 *        - source === 'scan'
 *        - no canonicalRelationId (unlinked draft)
 *        - not archived
 *        - sourcePublicProfileId === counterpartPublicProfileId
 *      More than one match → ambiguity → null (no arbitrary selection).
 *   5. Returns that single draft.
 *   6. If no match or ambiguous → null.
 *
 * Never uses: name, handle, avatar, timing, reveal status, source alone, or
 * either identifier in isolation as proof of same relation.
 */
export function findAssistedReconciliationSuggestionForRelation(
  relationId: string,
  relations: readonly Relation[],
): AssistedReconciliationSuggestion | null {
  const sharedRelation = relations.find((r) => r.id === relationId) ?? null;
  if (!sharedRelation) return null;

  const counterpartId = sharedRelation.counterpartPublicProfileId;
  if (!counterpartId) return null;

  if (!isSharedBacked(sharedRelation)) return null;

  const draftCandidates = relations.filter(
    (r) =>
      r.id !== relationId &&
      r.source === 'scan' &&
      !r.canonicalRelationId &&
      !r.archived &&
      r.sourcePublicProfileId === counterpartId,
  );

  // Ambiguity: more than one plausible draft → no suggestion.
  if (draftCandidates.length !== 1) return null;

  return {
    sharedRelationId: relationId,
    draftRelationId: draftCandidates[0].id,
    matchedPublicProfileId: counterpartId,
  };
}

/**
 * Symmetric inverse: looks for a draft resolution suggestion from the perspective
 * of an unlinked scan draft.
 *
 * Decision matrix:
 *   1. The relation must exist in the list.
 *   2. It must be an unlinked scan draft:
 *        - source === 'scan'
 *        - no canonicalRelationId
 *   3. It must have a non-empty sourcePublicProfileId.
 *   4. There must be exactly one other relation with:
 *        - different id
 *        - shared-backed (canonicalRelationId present, or source bootstrap/claim)
 *        - not archived
 *        - counterpartPublicProfileId === sourcePublicProfileId of the draft
 *      More than one match → ambiguity → null (no arbitrary selection).
 *   5. Returns that single shared relation.
 *   6. If no match or ambiguous → null.
 *
 * Same signal invariants as findAssistedReconciliationSuggestionForRelation:
 * this is a person signal, not proof of same relation. No merge, no link.
 */
export type DraftResolutionSuggestion = {
  draftRelationId: string;
  sharedRelationId: string;
  matchedPublicProfileId: string;
};

export function findDraftResolutionSuggestionForRelation(
  relationId: string,
  relations: readonly Relation[],
): DraftResolutionSuggestion | null {
  const draft = relations.find((r) => r.id === relationId) ?? null;
  if (!draft) return null;

  if (draft.source !== 'scan' || !!draft.canonicalRelationId || draft.archived) return null;

  const profileId = draft.sourcePublicProfileId;
  if (!profileId) return null;

  const sharedCandidates = relations.filter(
    (r) =>
      r.id !== relationId &&
      isSharedBacked(r) &&
      !r.archived &&
      r.counterpartPublicProfileId === profileId,
  );

  // Ambiguity: more than one plausible shared relation → no suggestion.
  if (sharedCandidates.length !== 1) return null;

  return {
    draftRelationId: relationId,
    sharedRelationId: sharedCandidates[0].id,
    matchedPublicProfileId: profileId,
  };
}
