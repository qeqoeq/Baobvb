import { describe, it, expect } from 'vitest';

import {
  applyEffectiveRevealToRelation,
  getEffectiveRevealSnapshot,
} from './relationship-reveal-precedence';
import type { Relation, RelationshipRevealSnapshot } from '../store/useRelationsStore';
import type { RevealSnapshotSource, SharedRevealStatus } from './reveal-shared-types';

// ── Test fixtures ───────────────────────────────────────────────────────────

const BASELINE_LOCAL_SNAPSHOT: RelationshipRevealSnapshot = {
  status: 'waiting_other_side',
  revealed: false,
};

function buildSharedReveal(
  overrides: Partial<RevealSnapshotSource> & {
    status?: SharedRevealStatus;
  } = {},
): RevealSnapshotSource {
  return {
    status: overrides.status ?? 'revealed',
    cooking_started_at: '2026-01-01T00:00:00.000Z',
    unlock_at: '2026-01-01T00:00:15.000Z',
    ready_at: '2026-01-01T00:00:15.000Z',
    first_viewed_at: '2026-01-01T00:00:30.000Z',
    revealed_at: '2026-01-01T00:00:30.000Z',
    mutual_score: null,
    tier: null,
    relationship_name_revealed: true,
    finalized_version: 1,
    ...overrides,
  };
}

// ── getEffectiveRevealSnapshot — Sprint V.5 tier normalization ──────────────
// V.5 plugs the runtime tier leak on the live reveal-precedence path. Before
// V.5, getEffectiveRevealSnapshot assigned `tier: sharedReveal.tier ?? undefined`
// directly, so a legacy Sprint-pre-V.1 backend row carrying tier='Ghost' would
// surface as the visible tier title on the post-reveal screen, regardless of
// the V.3 hydration normalization (which only normalizes persisted AsyncStorage
// state, not the live SharedRelationshipRevealRecord pulled from Supabase).
//
// These tests lock the defensive contract: any legacy/unknown tier coming from
// the shared reveal payload must either be re-derived from mutual_score or
// stripped to undefined — never surfaced as-is to a human display surface.

describe('getEffectiveRevealSnapshot — tier normalization (Sprint V.5)', () => {
  it('legacy "Ghost" + Distant-band mutual_score → "Distant" (no leak)', () => {
    // getMutualTier(20) is in the Distant band (<35 for mutual reveal).
    const sharedReveal = buildSharedReveal({
      // Cast required: TS believes Tier no longer accepts 'Ghost', but the
      // backend row was written pre Sprint V.1 and still carries the legacy
      // label at runtime.
      tier: 'Ghost' as unknown as RevealSnapshotSource['tier'],
      mutual_score: 20,
    });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    expect(result.tier).toBe('Distant');
    expect(result.mutualScore).toBe(20);
  });

  it('legacy "Legend" + Rooted-band mutual_score → "Rooted" (no leak)', () => {
    const sharedReveal = buildSharedReveal({
      tier: 'Legend' as unknown as RevealSnapshotSource['tier'],
      mutual_score: 92,
    });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    expect(result.tier).toBe('Rooted');
  });

  it('legacy "Ghost" + null mutual_score → undefined (strip legacy, no leak)', () => {
    // Without a numerical truth to re-derive from, the legacy label is
    // stripped. The UI then falls back to its safe display contract.
    const sharedReveal = buildSharedReveal({
      tier: 'Ghost' as unknown as RevealSnapshotSource['tier'],
      mutual_score: null,
    });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    expect(result.tier).toBeUndefined();
  });

  it('current valid tier "Anchor" + null mutual_score → "Anchor" (preserved)', () => {
    const sharedReveal = buildSharedReveal({
      tier: 'Anchor',
      mutual_score: null,
    });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    expect(result.tier).toBe('Anchor');
  });

  it('inconsistent "Rooted" tier + Distant-band mutual_score → "Distant" (score wins)', () => {
    // mutual_score is the canonical truth. A disagreeing tier string yields.
    const sharedReveal = buildSharedReveal({
      tier: 'Rooted',
      mutual_score: 20,
    });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    expect(result.tier).toBe('Distant');
  });

  it('idempotent: current taxonomy tier "Distant" + Distant-band mutual_score → "Distant"', () => {
    const sharedReveal = buildSharedReveal({
      tier: 'Distant',
      mutual_score: 20,
    });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    expect(result.tier).toBe('Distant');
  });

  it('unknown future tier + valid mutual_score → derived from score', () => {
    const sharedReveal = buildSharedReveal({
      tier: 'FutureTier' as unknown as RevealSnapshotSource['tier'],
      mutual_score: 82,
    });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    // getMutualTier(82) is in the Anchor band (79-89).
    expect(result.tier).toBe('Anchor');
  });

  it('unknown future tier + null mutual_score → undefined', () => {
    const sharedReveal = buildSharedReveal({
      tier: 'FutureTier' as unknown as RevealSnapshotSource['tier'],
      mutual_score: null,
    });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    expect(result.tier).toBeUndefined();
  });
});

// ── getEffectiveRevealSnapshot — non-tier fields preserved ──────────────────
// The V.5 patch must not alter any other field of the effectiveSnapshot
// projection. These tests lock the regression contract on the surrounding
// projection logic that was already shipping.

describe('getEffectiveRevealSnapshot — non-tier fields preserved', () => {
  it('returns the local snapshot unchanged when sharedReveal is null', () => {
    const localSnapshot: RelationshipRevealSnapshot = {
      status: 'waiting_other_side',
      revealed: false,
      tier: 'Anchor',
      mutualScore: 80,
    };
    const result = getEffectiveRevealSnapshot(localSnapshot, null);
    expect(result).toBe(localSnapshot);
  });

  it('status="revealed" → revealed=true', () => {
    const sharedReveal = buildSharedReveal({ status: 'revealed' });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    expect(result.status).toBe('revealed');
    expect(result.revealed).toBe(true);
  });

  it('status="cooking_reveal" → revealed=false', () => {
    const sharedReveal = buildSharedReveal({ status: 'cooking_reveal' });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    expect(result.status).toBe('cooking_reveal');
    expect(result.revealed).toBe(false);
  });

  it('preserves cookingStartedAt / unlockAt / readyAt / revealedAt / firstViewedAt', () => {
    const sharedReveal = buildSharedReveal({
      cooking_started_at: '2026-06-13T10:00:00.000Z',
      unlock_at: '2026-06-13T10:00:15.000Z',
      ready_at: '2026-06-13T10:00:15.000Z',
      first_viewed_at: '2026-06-13T10:00:30.000Z',
      revealed_at: '2026-06-13T10:00:30.000Z',
    });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    expect(result.cookingStartedAt).toBe('2026-06-13T10:00:00.000Z');
    expect(result.unlockAt).toBe('2026-06-13T10:00:15.000Z');
    expect(result.readyAt).toBe('2026-06-13T10:00:15.000Z');
    expect(result.firstViewedAt).toBe('2026-06-13T10:00:30.000Z');
    expect(result.revealedAt).toBe('2026-06-13T10:00:30.000Z');
  });

  it('null mutual_score → mutualScore undefined', () => {
    const sharedReveal = buildSharedReveal({ mutual_score: null });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    expect(result.mutualScore).toBeUndefined();
  });

  it('preserves finalized_version', () => {
    const sharedReveal = buildSharedReveal({ finalized_version: 7 });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    expect(result.finalizedVersion).toBe(7);
  });

  it('preserves relationship_name_revealed', () => {
    const sharedReveal = buildSharedReveal({ relationship_name_revealed: false });
    const result = getEffectiveRevealSnapshot(BASELINE_LOCAL_SNAPSHOT, sharedReveal);
    expect(result.relationshipNameRevealed).toBe(false);
  });
});

// ── getEffectiveRevealSnapshot — Fix A: local revealed wins over server non-revealed ──
//
// B10 fix: a server row stuck at reveal_ready (mutual_score IS NULL, Guard B)
// must not downgrade a locally-revealed relation. Local status, firstViewedAt,
// and revealedAt are preserved. mutualScore and tier are absorbed if the server
// provides them (e.g. after SQL backfill).

describe('getEffectiveRevealSnapshot — Fix A: local revealed / server non-revealed', () => {
  const LOCAL_REVEALED: RelationshipRevealSnapshot = {
    status: 'revealed',
    revealed: true,
    firstViewedAt: '2026-07-01T12:00:00.000Z',
    revealedAt: '2026-07-01T11:59:00.000Z',
    mutualScore: undefined,
    tier: undefined,
    relationshipNameRevealed: true,
    finalizedVersion: 1,
  };

  it('A1: local revealed + server reveal_ready (no mutual_score) → keeps local status and firstViewedAt', () => {
    const server = buildSharedReveal({ status: 'reveal_ready', mutual_score: null });
    const result = getEffectiveRevealSnapshot(LOCAL_REVEALED, server);
    expect(result.status).toBe('revealed');
    expect(result.firstViewedAt).toBe('2026-07-01T12:00:00.000Z');
    expect(result.revealedAt).toBe('2026-07-01T11:59:00.000Z');
    expect(result.mutualScore).toBeUndefined();
    expect(result.tier).toBeUndefined();
  });

  it('A2: local revealed + server reveal_ready WITH mutual_score → keeps local status, absorbs mutual_score and tier', () => {
    // mutual_score:80 → getMutualTier(80) = 'Anchor' (79-89 band)
    const server = buildSharedReveal({ status: 'reveal_ready', mutual_score: 80, tier: 'Anchor' });
    const result = getEffectiveRevealSnapshot(LOCAL_REVEALED, server);
    expect(result.status).toBe('revealed');
    expect(result.firstViewedAt).toBe('2026-07-01T12:00:00.000Z');
    expect(result.mutualScore).toBe(80);
    expect(result.tier).toBe('Anchor');
  });

  it('A3: local reveal_ready + server revealed → server wins (server more advanced)', () => {
    const localReady: RelationshipRevealSnapshot = {
      status: 'reveal_ready',
      revealed: false,
      readyAt: '2026-07-01T10:00:00.000Z',
    };
    const server = buildSharedReveal({ status: 'revealed', mutual_score: 80, tier: 'Steady' });
    const result = getEffectiveRevealSnapshot(localReady, server);
    expect(result.status).toBe('revealed');
    expect(result.mutualScore).toBe(80);
  });

  it('A4: local revealed + server revealed → server wins (both revealed, normal path unchanged)', () => {
    const server = buildSharedReveal({ status: 'revealed', mutual_score: 65, tier: 'Steady', first_viewed_at: '2026-07-01T13:00:00.000Z' });
    const result = getEffectiveRevealSnapshot(LOCAL_REVEALED, server);
    expect(result.status).toBe('revealed');
    // Server firstViewedAt wins (both revealed → server path)
    expect(result.firstViewedAt).toBe('2026-07-01T13:00:00.000Z');
    expect(result.mutualScore).toBe(65);
  });

  it('A5: local revealed + server cooking_reveal → keeps local (same guard as reveal_ready)', () => {
    const server = buildSharedReveal({ status: 'cooking_reveal', mutual_score: null });
    const result = getEffectiveRevealSnapshot(LOCAL_REVEALED, server);
    expect(result.status).toBe('revealed');
    expect(result.firstViewedAt).toBe('2026-07-01T12:00:00.000Z');
  });
});

// ── applyEffectiveRevealToRelation — end-to-end tier normalization ─────────
// This wrapper is the actual entry point used by RelationDetailScreen
// (app/relation/[id].tsx:146). The patch must hold across this composition.

describe('applyEffectiveRevealToRelation — tier normalization end-to-end (Sprint V.5)', () => {
  function buildBaselineRelation(): Relation {
    return {
      id: 'rel-test',
      name: 'Test',
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      identityStatus: 'verified',
      source: 'claim',
      localState: {
        sideA: {
          exists: true,
          identityStatus: 'verified',
          hasPrivateReading: true,
        },
        sideB: {
          exists: true,
          identityStatus: 'verified',
          hasPrivateReading: true,
        },
        revealSnapshot: BASELINE_LOCAL_SNAPSHOT,
      },
    } as unknown as Relation;
  }

  it('relation merged with legacy "Ghost" sharedReveal → revealSnapshot.tier === "Distant" when mutual_score present', () => {
    const sharedReveal = buildSharedReveal({
      tier: 'Ghost' as unknown as RevealSnapshotSource['tier'],
      mutual_score: 20,
    });
    const result = applyEffectiveRevealToRelation(buildBaselineRelation(), sharedReveal);
    expect(result.localState.revealSnapshot.tier).toBe('Distant');
    // Confirm no legacy label survives anywhere on the merged snapshot.
    expect(result.localState.revealSnapshot.tier).not.toBe('Ghost');
  });

  it('relation merged with legacy "Ghost" sharedReveal without mutual_score → tier stripped', () => {
    const sharedReveal = buildSharedReveal({
      tier: 'Ghost' as unknown as RevealSnapshotSource['tier'],
      mutual_score: null,
    });
    const result = applyEffectiveRevealToRelation(buildBaselineRelation(), sharedReveal);
    expect(result.localState.revealSnapshot.tier).toBeUndefined();
  });

  it('relation merged with valid current tier sharedReveal preserves the tier', () => {
    const sharedReveal = buildSharedReveal({
      tier: 'Rooted',
      mutual_score: 95,
    });
    const result = applyEffectiveRevealToRelation(buildBaselineRelation(), sharedReveal);
    expect(result.localState.revealSnapshot.tier).toBe('Rooted');
  });

  it('relation merged with null sharedReveal preserves the original local revealSnapshot', () => {
    const relation = buildBaselineRelation();
    const result = applyEffectiveRevealToRelation(relation, null);
    expect(result.localState.revealSnapshot).toBe(relation.localState.revealSnapshot);
  });
});
