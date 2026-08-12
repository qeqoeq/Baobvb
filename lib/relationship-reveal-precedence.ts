import type { Relation, RelationshipRevealSnapshot } from '../store/useRelationsStore';
import { normalizePersistedRevealSnapshotTier } from './persisted-tier-normalization';
import type { RevealSnapshotSource } from './reveal-shared-types';

export function getEffectiveRevealSnapshot(
  localSnapshot: RelationshipRevealSnapshot,
  sharedReveal: RevealSnapshotSource | null,
): RelationshipRevealSnapshot {
  if (!sharedReveal) return localSnapshot;

  // B41: the reveal ceremony is per-participant, but the server's first_viewed_at is global
  // (open_shared_reveal stamps it once, for whoever opens first — not per side). A participant
  // who never ran the LOCAL ceremony (no local firstViewedAt) must NOT see revealed / score /
  // tier through the overlay: that is the pre-existing leak. Hold the gate at reveal_ready so
  // the "open reveal" CTA shows and nothing is revealed until this side opens it locally.
  if (sharedReveal.status === 'revealed' && localSnapshot.firstViewedAt === undefined) {
    return {
      ...localSnapshot,
      status: 'reveal_ready',
      revealed: false,
      relationshipNameRevealed: false,
      mutualScore: undefined,
      tier: undefined,
      firstViewedAt: undefined,
    };
  }

  // Fix A (B10): local 'revealed' wins over a less-advanced server status.
  // Happens for legacy relations where the server row is stuck at reveal_ready
  // with mutual_score IS NULL (Guard B). Absorb mutualScore/tier from the server
  // if they arrive later (e.g. after SQL backfill) so the display improves.
  if (localSnapshot.status === 'revealed' && sharedReveal.status !== 'revealed') {
    return {
      ...localSnapshot,
      mutualScore:
        typeof sharedReveal.mutual_score === 'number'
          ? sharedReveal.mutual_score
          : localSnapshot.mutualScore,
      tier:
        normalizePersistedRevealSnapshotTier(sharedReveal.tier, sharedReveal.mutual_score) ??
        localSnapshot.tier,
    };
  }

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
  sharedReveal: RevealSnapshotSource | null,
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
