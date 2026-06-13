import type { Relation, RelationshipRevealSnapshot } from '../store/useRelationsStore';
import { normalizePersistedRevealSnapshotTier } from './persisted-tier-normalization';
import type { SharedRelationshipRevealRecord } from './reveal-shared-types';

export function getEffectiveRevealSnapshot(
  localSnapshot: RelationshipRevealSnapshot,
  sharedReveal: SharedRelationshipRevealRecord | null,
): RelationshipRevealSnapshot {
  if (!sharedReveal) return localSnapshot;

  const status = sharedReveal.status;
  const revealed = status === 'revealed';

  return {
    status,
    revealed,
    cookingStartedAt: sharedReveal.cooking_started_at ?? undefined,
    unlockAt: sharedReveal.unlock_at ?? undefined,
    readyAt: sharedReveal.ready_at ?? undefined,
    firstViewedAt: sharedReveal.first_viewed_at ?? undefined,
    revealedAt: sharedReveal.revealed_at ?? undefined,
    mutualScore: typeof sharedReveal.mutual_score === 'number' ? sharedReveal.mutual_score : undefined,
    // Re-derive the tier from mutual_score when available, falling back to a
    // whitelisted rawTier otherwise. Defensive against legacy backend rows
    // (Sprint-pre-V.1 taxonomy stored server-side as 'Ghost' / 'Spark' /
    // 'Thrill' / 'Vibrant' / 'Legend') that would otherwise survive the
    // store-hydration normalization (V.3) and surface as the visible tier
    // title on the post-reveal screen.
    tier: normalizePersistedRevealSnapshotTier(sharedReveal.tier, sharedReveal.mutual_score),
    relationshipNameRevealed: sharedReveal.relationship_name_revealed,
    finalizedVersion: sharedReveal.finalized_version,
  };
}

export function applyEffectiveRevealToRelation(
  relation: Relation,
  sharedReveal: SharedRelationshipRevealRecord | null,
): Relation {
  const effectiveSnapshot = getEffectiveRevealSnapshot(
    relation.localState.revealSnapshot,
    sharedReveal,
  );

  return {
    ...relation,
    relationshipNameRevealed: effectiveSnapshot.status === 'revealed',
    localState: {
      ...relation.localState,
      revealSnapshot: effectiveSnapshot,
    },
  };
}
