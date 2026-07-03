// ── X.88 — production hydration + purge path ─────────────────────────────────
//
// Tests the ACTUAL boot sequence:
//   loadPersistedState().then(persisted => {
//     applyHydratedState(persisted);
//     if (!__DEV__ && purgeSeedData()) persist();
//     emitChange();
//   });
//
// Strategy:
//   1. vi.hoisted() creates the spy and fixture before any imports (vi.mock
//      factories are also hoisted, so all shared data must be in vi.hoisted).
//   2. vi.mock('../lib/storage') makes loadPersistedState() return the fixture.
//   3. Importing the store triggers the top-level .then() with the mocked data.
//   4. beforeAll awaits one microtask tick to let the resolved promise settle.
//   5. Assertions check state snapshots AND the persistState spy call.
//
// Module isolation: vitest runs each test file in its own module registry, so
// this file gets a fresh store instance independent of useRelationsStore.test.ts.
//

import { vi, describe, it, expect, beforeAll } from 'vitest';

// ── all hoisted data (accessible in vi.mock factories) ───────────────────────

const H = vi.hoisted(() => {
  // Entity IDs
  const USER_REL_ID   = 'r-9999000001-boot';
  const USER_EVAL_ID  = 'eval-r-9999000001-boot-1700000001';
  const USER_PLACE_ID = 'p-9999000001';
  const USER_RO_ID    = 'recv-9999000001-boot5';
  const SEED_REL_ID   = '7';              // bare integer  → /^\d+$/
  const SEED_EVAL_ID  = 'e6';            // e + integer   → /^e\d+$/
  const SEED_PLACE_ID = 'seed-place-3';  // seed-place-*  prefix
  const SEED_RO_ID    = 'recv-seed-2';   // recv-seed-*   prefix

  const minimalLocalState = {
    sideA: { exists: true, identityStatus: 'draft', hasPrivateReading: false },
    sideB: { exists: false, identityStatus: 'missing', hasPrivateReading: false },
    revealSnapshot: { status: 'waiting_other_side', revealed: false, relationshipNameRevealed: false },
  };

  // Mixed persisted state: 1 seed + 1 non-seed per family
  const mixed = {
    seedVersion: 14, // SEED_VERSION — hardcoded to avoid circular import before mock setup
    me: { id: 'me-local-001', displayName: 'Yasmine', handle: '@yasmine.baobab', avatarSeed: 'Y', isProfileSetup: true },
    relations: [
      // Seed relation (bare integer ID)
      { id: SEED_REL_ID, name: 'Paul', source: 'manual', archived: false, createdAt: '2026-01-12T09:00:00Z', identityStatus: 'draft', relationshipNameRevealed: false, avatarSeed: 'P', anchorMode: 'manual', anchorValue: null, relationDepth: 'encounter', privateLabel: 'Paul', localState: minimalLocalState },
      // Non-seed relation
      { id: USER_REL_ID, name: 'Alice', source: 'bootstrap', archived: false, createdAt: '2026-06-01T10:00:00Z', identityStatus: 'verified', relationshipNameRevealed: false, avatarSeed: 'A', anchorMode: 'bootstrap', anchorValue: null, relationDepth: 'known', privateLabel: 'Alice', canonicalRelationId: 'canonical-boot-h1', localState: { sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: false }, sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: false }, revealSnapshot: { status: 'revealed', revealed: true, relationshipNameRevealed: false } } },
    ],
    evaluations: [
      // Seed evaluation
      { id: SEED_EVAL_ID, relationId: SEED_REL_ID, ratings: { trust: 1, interactions: 1, affinity: 1, support: 1, sharedNetwork: 1 }, score: 8, tier: 'Distant', createdAt: '2026-01-12T09:00:00Z' },
      // Non-seed evaluation
      { id: USER_EVAL_ID, relationId: USER_REL_ID, ratings: { trust: 4, interactions: 3, affinity: 4, support: 3, sharedNetwork: 3 }, score: 65, tier: 'Steady', createdAt: '2026-06-01T10:00:00Z' },
    ],
    places: [
      // Seed place
      { id: SEED_PLACE_ID, name: 'Passage Verde', category: 'cafe', personalFit: 'tried', createdAt: '2026-03-18T14:00:00Z' },
      // Non-seed place
      { id: USER_PLACE_ID, name: 'My Café', category: 'cafe', personalFit: 'kept', createdAt: '2026-06-01T10:00:00Z' },
    ],
    receivedObjects: [
      // Seed receivedObject
      { id: SEED_RO_ID, createdAt: '2026-06-21T14:00:00Z', objectType: 'place', objectId: 'recv-place-new-1', fromRelationId: SEED_REL_ID, nameSnapshot: 'La Pergola', categorySnapshot: 'cafe', status: 'new' },
      // Non-seed receivedObject
      { id: USER_RO_ID, createdAt: '2026-06-25T10:00:00Z', objectType: 'place', objectId: USER_PLACE_ID, fromRelationId: USER_REL_ID, nameSnapshot: 'My Café', categorySnapshot: 'cafe', status: 'new' },
    ],
    passedObjects: [],
    progressivePrivateSignals: {},
  };

  return {
    USER_REL_ID, USER_EVAL_ID, USER_PLACE_ID, USER_RO_ID,
    SEED_REL_ID, SEED_EVAL_ID, SEED_PLACE_ID, SEED_RO_ID,
    mixed,
    persistState: vi.fn().mockResolvedValue(undefined) as ReturnType<typeof vi.fn>,
  };
});

// ── storage mock ──────────────────────────────────────────────────────────────

vi.mock('../lib/storage', () => ({
  loadPersistedState: () => Promise.resolve(H.mixed),
  persistState: H.persistState,
  clearPersistedState: vi.fn().mockResolvedValue(undefined),
}));

// Store import triggers the top-level loadPersistedState().then(...) immediately.
// The promise resolves in the next microtask — beforeAll awaits it below.
import {
  getEvaluationsSnapshot,
  getPlacesSnapshot,
  getReceivedObjectsSnapshot,
  getRelationsSnapshot,
} from './useRelationsStore';

// ── tests ─────────────────────────────────────────────────────────────────────

describe('X.88 — production hydration + purge boot path', () => {
  beforeAll(async () => {
    // loadPersistedState() returned Promise.resolve(H.mixed).
    // Its .then() callback is a microtask — one await tick flushes it.
    await Promise.resolve();
  });

  // ── dump: before / after counts by family ─────────────────────────────────

  it('dump: before (persisted) and after (state) counts by family', () => {
    const before = {
      relations:       H.mixed.relations.length,       // 2 (1 seed + 1 non-seed)
      evaluations:     H.mixed.evaluations.length,     // 2
      places:          H.mixed.places.length,          // 2
      receivedObjects: H.mixed.receivedObjects.length, // 2
    };
    const after = {
      relations:       getRelationsSnapshot().length,       // 1 (only non-seed)
      evaluations:     getEvaluationsSnapshot().length,     // 1
      places:          getPlacesSnapshot().length,          // 1
      receivedObjects: getReceivedObjectsSnapshot().length, // 1
    };

    expect(before).toEqual({ relations: 2, evaluations: 2, places: 2, receivedObjects: 2 });
    expect(after).toEqual({ relations: 1, evaluations: 1, places: 1, receivedObjects: 1 });
  });

  // ── H1: seeds absent from live state ─────────────────────────────────────

  it('H1a: seed relation absent from state after boot', () => {
    expect(getRelationsSnapshot().find((r) => r.id === H.SEED_REL_ID)).toBeUndefined();
  });

  it('H1b: seed evaluation absent from state after boot', () => {
    expect(getEvaluationsSnapshot().find((e) => e.id === H.SEED_EVAL_ID)).toBeUndefined();
  });

  it('H1c: seed place absent from state after boot', () => {
    expect(getPlacesSnapshot().find((p) => p.id === H.SEED_PLACE_ID)).toBeUndefined();
  });

  it('H1d: seed receivedObject absent from state after boot', () => {
    expect(getReceivedObjectsSnapshot().find((ro) => ro.id === H.SEED_RO_ID)).toBeUndefined();
  });

  // ── H2: non-seed entities intact ─────────────────────────────────────────

  it('H2a: non-seed relation present in state after boot', () => {
    expect(getRelationsSnapshot().find((r) => r.id === H.USER_REL_ID)).toBeDefined();
  });

  it('H2b: non-seed evaluation present in state after boot', () => {
    expect(getEvaluationsSnapshot().find((e) => e.id === H.USER_EVAL_ID)).toBeDefined();
  });

  it('H2c: non-seed place present in state after boot', () => {
    expect(getPlacesSnapshot().find((p) => p.id === H.USER_PLACE_ID)).toBeDefined();
  });

  it('H2d: non-seed receivedObject present in state after boot', () => {
    expect(getReceivedObjectsSnapshot().find((ro) => ro.id === H.USER_RO_ID)).toBeDefined();
  });

  // ── H3: re-persisted state (written back after purge) contains no seeds ───
  //
  // purgeSeedData() returns true → persist() → persistState(currentState).
  // We locate the post-purge persist call and verify its content is seed-free.

  it('H3: re-persisted state contains no seed entities', () => {
    expect(H.persistState).toHaveBeenCalled();

    // Identify the post-purge call: it's the one where relations has no bare-integer IDs.
    const purgedCall = H.persistState.mock.calls.find((call) => {
      const data = call[0] as Record<string, unknown[]>;
      return (
        Array.isArray(data.relations) &&
        !(data.relations as { id: string }[]).some((r) => /^\d+$/.test(r.id))
      );
    });

    expect(purgedCall).toBeDefined();
    const data = purgedCall![0] as {
      relations: { id: string }[];
      evaluations: { id: string }[];
      places: { id: string }[];
      receivedObjects: { id: string }[];
    };

    expect(data.relations.some((r) => /^\d+$/.test(r.id))).toBe(false);
    expect(data.evaluations.some((e) => /^e\d+$/.test(e.id))).toBe(false);
    expect(data.places.some((p) => p.id.startsWith('seed-place-'))).toBe(false);
    expect(data.receivedObjects.some((ro) => ro.id.startsWith('recv-seed-'))).toBe(false);
  });
});
