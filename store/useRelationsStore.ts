import { useSyncExternalStore } from 'react';

import {
  computeMutualRelationshipScore,
  computeScore,
  getTier,
  type Evaluation,
  type PillarKey,
  type PillarRating,
  type Tier,
} from '../lib/evaluation';
import { clearPersistedState, loadPersistedState, persistState } from '../lib/storage';
import {
  findAssistedReconciliationSuggestionForRelation,
  findDraftResolutionSuggestionForRelation,
} from '../lib/assisted-reconciliation';

export type RelationshipSideIdentityStatus = 'missing' | 'draft' | 'verified';

export type RelationshipSideLocalState = {
  exists: boolean;
  identityStatus: RelationshipSideIdentityStatus;
  hasPrivateReading: boolean;
  privateReadingId?: string;
  resolvedAt?: string;
};

export type RelationshipRevealSnapshot = {
  status: 'waiting_other_side' | 'cooking_reveal' | 'reveal_ready' | 'revealed';
  revealed: boolean;
  cookingStartedAt?: string;
  unlockAt?: string;
  readyAt?: string;
  firstViewedAt?: string;
  revealedAt?: string;
  mutualScore?: number;
  tier?: Tier;
  relationshipNameRevealed?: boolean;
  finalizedVersion?: number;
};

export type RelationshipLocalState = {
  sideA: RelationshipSideLocalState;
  sideB: RelationshipSideLocalState;
  revealSnapshot: RelationshipRevealSnapshot;
};

export type Relation = {
  /**
   * Local draft ID. Device-local, non-canonical.
   * Used for navigation params, AsyncStorage keying, and store lookups.
   * Must never be sent to the backend as a relation join key.
   * See: lib/identity.ts — LocalDraftId
   */
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  identityStatus: 'draft' | 'verified';
  relationshipNameRevealed?: boolean;
  handle?: string;
  avatarSeed?: string;
  /**
   * 'manual'    — created by hand
   * 'scan'      — seeded from a scanned QR card
   * 'claim'     — materialized after claiming a shared invite.
   *               Both sides known to exist. canonicalRelationId always set.
   * 'bootstrap' — recovered from backend at app start (shared continuity bootstrap).
   *               Both sides known to exist. canonicalRelationId always set.
   *               Name is a placeholder until the user renames it.
   */
  source: 'manual' | 'scan' | 'claim' | 'bootstrap';
  /**
   * The scanned card's meId field.
   * v1 QR: opaque legacy local alias — not backend-queryable.
   * v2 QR: mirrors publicProfileId — same value as sourcePublicProfileId.
   * Used for local dedup. Do not use as a backend lookup key without checking version.
   */
  sourceCardMeId?: string;
  /**
   * Canonical public profile identifier of the scanned card owner.
   * Only present for v2 QR scans. Undefined for v1 scans and manual relations.
   * Backend-queryable — use for future lookup and cross-user reconciliation.
   */
  sourcePublicProfileId?: string;
  sourceHandle?: string;
  localState: RelationshipLocalState;
  /**
   * Canonical relation UUID. Null for purely local relations.
   * Set when this relation is promoted to shared (at invite creation time).
   * This is the only valid cross-user join key for this relation.
   * See: lib/identity.ts — CanonicalRelationId
   */
  canonicalRelationId?: string | null;
  /**
   * The publicProfileId of the other participant in this shared relation.
   * Only set for source: 'claim' and source: 'bootstrap' — never for 'manual' or 'scan'.
   * Null when the counterpart has not provisioned a public profile yet.
   *
   * This is a person signal, not a relation key:
   *   - one person can participate in multiple shared relations
   *   - canonicalRelationId remains the only valid shared↔local join key
   *
   * Current use: persisted for future UI-assisted reconciliation suggestion.
   * Not used for any automatic merge today.
   */
  counterpartPublicProfileId?: string | null;
};

export type PlaceCategory = 'restaurant' | 'cafe' | 'bar' | 'spot' | 'other';

export type Place = {
  id: string;
  name: string;
  category: PlaceCategory;
  rating: 1 | 2 | 3 | 4 | 5;
  impression?: string;
  createdAt: string;
};

export type MeProfile = {
  /**
   * Legacy local alias. Not an auth UUID, not a publicProfileId.
   * Kept for backward compatibility. Do not use as a system identity key.
   */
  id: string;
  displayName: string;
  handle: string;
  avatarSeed: string;
  trustPassportStatus: 'new' | 'growing' | 'steady';
  /**
   * The Supabase auth UUID (auth.uid()). Private, backend-internal.
   * Never expose in QR cards or public flows.
   * Null until the user has authenticated at least once in this session.
   */
  internalAuthUserId?: string | null;
  /**
   * Stable shareable public profile identifier.
   * Intended for QR cards, scan deduplication, and future social lookup.
   * Null until explicitly provisioned — do not substitute internalAuthUserId.
   */
  publicProfileId?: string | null;
};

export type MeProfileUpdate = {
  displayName: string;
  handle: string;
  avatarSeed: string;
};

type StoreState = {
  me: MeProfile;
  relations: Relation[];
  evaluations: Evaluation[];
  places: Place[];
};

export type RelationshipSideKey = 'sideA' | 'sideB';

export type RelationUpdate = {
  name: string;
  handle?: string;
  avatarSeed?: string;
};

function buildEvaluation(
  id: string,
  relationId: string,
  ratings: Record<PillarKey, PillarRating>,
  createdAt: string,
): Evaluation {
  const score = computeScore(ratings);
  return { id, relationId, ratings, score, tier: getTier(score), createdAt };
}

const SEED_RELATIONS: Relation[] = [
  {
    id: '1',
    name: 'Olivier',
    archived: false,
    createdAt: '2025-11-10T10:00:00Z',
    identityStatus: 'draft',
    relationshipNameRevealed: false,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'draft', hasPrivateReading: true, privateReadingId: 'e1' },
      sideB: { exists: false, identityStatus: 'missing', hasPrivateReading: false },
      revealSnapshot: { status: 'waiting_other_side', revealed: false, relationshipNameRevealed: false },
    },
  },
  {
    id: '2',
    name: 'Nora',
    archived: false,
    createdAt: '2025-12-01T14:30:00Z',
    identityStatus: 'draft',
    relationshipNameRevealed: false,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'draft', hasPrivateReading: false },
      sideB: { exists: false, identityStatus: 'missing', hasPrivateReading: false },
      revealSnapshot: { status: 'waiting_other_side', revealed: false, relationshipNameRevealed: false },
    },
  },
  {
    id: '3',
    name: 'Jean',
    archived: true,
    createdAt: '2025-10-05T09:00:00Z',
    identityStatus: 'draft',
    relationshipNameRevealed: false,
    source: 'manual',
    localState: {
      sideA: { exists: true, identityStatus: 'draft', hasPrivateReading: true, privateReadingId: 'e2' },
      sideB: { exists: false, identityStatus: 'missing', hasPrivateReading: false },
      revealSnapshot: { status: 'waiting_other_side', revealed: false, relationshipNameRevealed: false },
    },
  },
];

const SEED_EVALUATIONS: Evaluation[] = [
  buildEvaluation('e1', '1', {
    trust: 4,
    interactions: 4,
    affinity: 3,
    support: 4,
    sharedNetwork: 3,
  }, '2026-01-15T12:00:00Z'),
  buildEvaluation('e2', '3', {
    trust: 2,
    interactions: 1,
    affinity: 2,
    support: 1,
    sharedNetwork: 1,
  }, '2025-12-20T09:00:00Z'),
];

const SEED_ME: MeProfile = {
  id: 'me-local-001',
  displayName: 'Yasmine',
  handle: '@yasmine.baobab',
  avatarSeed: 'Y',
  trustPassportStatus: 'growing',
  internalAuthUserId: null,
  publicProfileId: null,
};

const SEED_PLACES: Place[] = [];
const PLACE_CATEGORIES: PlaceCategory[] = ['restaurant', 'cafe', 'bar', 'spot', 'other'];
const TIER_VALUES: Tier[] = ['Ghost', 'Spark', 'Thrill', 'Vibrant', 'Anchor', 'Legend'];
const REVEAL_UNLOCK_DELAY_MS = 90_000;

// ── state ──────────────────────────────────────────────────────────────

const state: StoreState = {
  me: SEED_ME,
  relations: SEED_RELATIONS,
  evaluations: SEED_EVALUATIONS,
  places: SEED_PLACES,
};

let hydrated = false;

// ── pub/sub ────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ── snapshots ──────────────────────────────────────────────────────────

function getRelationsSnapshot() {
  return state.relations;
}

function getMeSnapshot() {
  return state.me;
}

function getEvaluationsSnapshot() {
  return state.evaluations;
}

function getPlacesSnapshot() {
  return state.places;
}

function getHydratedSnapshot() {
  return hydrated;
}

function sanitizePlaceCategory(value: unknown): PlaceCategory {
  if (typeof value === 'string' && PLACE_CATEGORIES.includes(value as PlaceCategory)) {
    return value as PlaceCategory;
  }
  return 'other';
}

function sanitizePlaceRating(value: unknown): 1 | 2 | 3 | 4 | 5 {
  if (typeof value !== 'number') return 3;
  if (value <= 1) return 1;
  if (value >= 5) return 5;
  return Math.round(value) as 1 | 2 | 3 | 4 | 5;
}

function normalizeSideIdentityStatus(
  value: unknown,
  fallback: RelationshipSideIdentityStatus,
): RelationshipSideIdentityStatus {
  if (value === 'verified' || value === 'draft' || value === 'missing') return value;
  return fallback;
}

function getLatestEvaluationForRelation(
  evaluations: Evaluation[],
  relationId: string,
): Evaluation | null {
  let latest: Evaluation | null = null;
  for (const evaluation of evaluations) {
    if (evaluation.relationId !== relationId) continue;
    if (!latest || evaluation.createdAt > latest.createdAt) {
      latest = evaluation;
    }
  }
  return latest;
}

function buildDefaultRelationshipLocalState(
  relation: Pick<Relation, 'id' | 'identityStatus' | 'relationshipNameRevealed'>,
  evaluations: Evaluation[],
): RelationshipLocalState {
  const latestEvaluation = getLatestEvaluationForRelation(evaluations, relation.id);

  return {
    sideA: {
      exists: true,
      identityStatus: relation.identityStatus,
      hasPrivateReading: Boolean(latestEvaluation),
      privateReadingId: latestEvaluation?.id,
    },
    sideB: {
      exists: false,
      identityStatus: 'missing',
      hasPrivateReading: false,
      privateReadingId: undefined,
    },
    revealSnapshot: {
      status: 'waiting_other_side',
      revealed: relation.relationshipNameRevealed === true,
      relationshipNameRevealed: relation.relationshipNameRevealed === true,
    },
  };
}

function isRevealStatus(value: unknown): value is RelationshipRevealSnapshot['status'] {
  return (
    value === 'waiting_other_side' ||
    value === 'cooking_reveal' ||
    value === 'reveal_ready' ||
    value === 'revealed'
  );
}

function deriveRevealStatus({
  revealed,
  sideAHasReading,
  sideBHasReading,
}: {
  revealed: boolean;
  sideAHasReading: boolean;
  sideBHasReading: boolean;
}): RelationshipRevealSnapshot['status'] {
  if (revealed) return 'revealed';
  if (sideAHasReading && sideBHasReading) return 'reveal_ready';
  return 'waiting_other_side';
}

function isStatusRevealed(status: RelationshipRevealSnapshot['status']): boolean {
  return status === 'revealed';
}

function normalizeRelationshipLocalState(
  relation: Pick<Relation, 'id' | 'identityStatus' | 'relationshipNameRevealed'> & {
    localState?: Partial<RelationshipLocalState> | null;
  },
  evaluations: Evaluation[],
): RelationshipLocalState {
  const fallback = buildDefaultRelationshipLocalState(relation, evaluations);
  const raw = relation.localState;
  if (!raw) return fallback;

  const rawSideB = raw.sideB;
  const sideBExists = rawSideB?.exists === true;
  const sideBReadingId =
    typeof rawSideB?.privateReadingId === 'string' && rawSideB.privateReadingId.length > 0
      ? rawSideB.privateReadingId
      : undefined;
  const sideBTierStatus = sideBExists
    ? normalizeSideIdentityStatus(rawSideB?.identityStatus, 'missing')
    : 'missing';
  const sideBHasReading = sideBExists && (rawSideB?.hasPrivateReading === true || Boolean(sideBReadingId));
  const sideBResolvedAt =
    sideBExists && typeof rawSideB?.resolvedAt === 'string' && rawSideB.resolvedAt.length > 0
      ? rawSideB.resolvedAt
      : undefined;

  const rawReveal = raw.revealSnapshot;
  const statusCandidate = isRevealStatus(rawReveal?.status)
    ? rawReveal.status
    : deriveRevealStatus({
        revealed: relation.relationshipNameRevealed === true || rawReveal?.revealed === true,
        sideAHasReading: fallback.sideA.hasPrivateReading,
        sideBHasReading,
      });
  const forceRevealed =
    relation.relationshipNameRevealed === true || rawReveal?.revealed === true;
  const revealStatus = forceRevealed ? 'revealed' : statusCandidate;
  const revealed = isStatusRevealed(revealStatus);
  const tier =
    rawReveal?.tier && TIER_VALUES.includes(rawReveal.tier)
      ? rawReveal.tier
      : undefined;

  // sideA: derive from local evaluations (fallback), but upgrade hasPrivateReading if the
  // persisted raw state carries backend truth (bootstrap/claim sources).
  // This prevents silent downgrade of sideA.hasPrivateReading on re-hydration for
  // relations where the reading truth comes from the backend, not a local evaluation.
  // INVARIANT: only upgrades (false → true), never downgrades (true → false).
  const rawSideA = raw.sideA;
  const sideAHasReadingFromBackend = rawSideA?.hasPrivateReading === true;

  return {
    sideA: {
      ...fallback.sideA,
      hasPrivateReading: fallback.sideA.hasPrivateReading || sideAHasReadingFromBackend,
    },
    sideB: {
      exists: sideBExists,
      identityStatus: sideBTierStatus,
      hasPrivateReading: sideBHasReading,
      privateReadingId: sideBHasReading ? sideBReadingId : undefined,
      resolvedAt: sideBResolvedAt,
    },
    revealSnapshot: {
      status: revealStatus,
      revealed,
      cookingStartedAt:
        typeof rawReveal?.cookingStartedAt === 'string' && rawReveal.cookingStartedAt.length > 0
          ? rawReveal.cookingStartedAt
          : undefined,
      unlockAt:
        typeof rawReveal?.unlockAt === 'string' && rawReveal.unlockAt.length > 0
          ? rawReveal.unlockAt
          : undefined,
      readyAt:
        typeof rawReveal?.readyAt === 'string' && rawReveal.readyAt.length > 0
          ? rawReveal.readyAt
          : undefined,
      firstViewedAt:
        typeof rawReveal?.firstViewedAt === 'string' && rawReveal.firstViewedAt.length > 0
          ? rawReveal.firstViewedAt
          : undefined,
      revealedAt:
        isStatusRevealed(revealStatus) &&
        typeof rawReveal?.revealedAt === 'string' &&
        rawReveal.revealedAt.length > 0
          ? rawReveal.revealedAt
          : undefined,
      mutualScore:
        isStatusRevealed(revealStatus) && typeof rawReveal?.mutualScore === 'number'
          ? rawReveal.mutualScore
          : undefined,
      tier: isStatusRevealed(revealStatus) ? tier : undefined,
      relationshipNameRevealed: isStatusRevealed(revealStatus),
      finalizedVersion:
        typeof rawReveal?.finalizedVersion === 'number' && Number.isFinite(rawReveal.finalizedVersion)
          ? rawReveal.finalizedVersion
          : undefined,
    },
  };
}

// ── persistence ────────────────────────────────────────────────────────

function persist() {
  if (!hydrated) return;
  // internalAuthUserId and publicProfileId are runtime fields — not persisted.
  // internalAuthUserId is always re-derived from the live Supabase session on bootstrap.
  // publicProfileId will be provisioned from the backend, not from AsyncStorage.
  // Using undefined so JSON.stringify omits these keys entirely.
  const { internalAuthUserId: _a, publicProfileId: _b, ...persistableMe } = state.me;
  persistState<StoreState>({
    me: persistableMe as MeProfile,
    relations: state.relations,
    evaluations: state.evaluations,
    places: state.places,
  });
}

// ── hydration (runs once at import time) ───────────────────────────────

loadPersistedState<StoreState>().then((persisted) => {
  if (
    persisted &&
    Array.isArray(persisted.relations) &&
    Array.isArray(persisted.evaluations)
  ) {
    const persistedEvaluations = persisted.evaluations;
    if (persisted.me) {
      state.me = {
        ...SEED_ME,
        ...persisted.me,
        id: persisted.me.id ?? SEED_ME.id,
        // Runtime fields are never read from AsyncStorage — always re-derived at runtime.
        // Preserve any value already set from onAuthStateChange firing before this
        // hydration completes (race condition: auth can resolve before AsyncStorage).
        internalAuthUserId: state.me.internalAuthUserId ?? null,
        publicProfileId: state.me.publicProfileId ?? null,
      };
    }
    state.relations = persisted.relations.map((relation) => ({
      ...relation,
      avatarSeed:
        relation.avatarSeed ||
        relation.name?.trim().charAt(0).toUpperCase() ||
        '?',
      source:
        relation.source === 'scan' ? 'scan' :
        relation.source === 'claim' ? 'claim' :
        relation.source === 'bootstrap' ? 'bootstrap' :
        'manual',
      identityStatus:
        relation.identityStatus === 'verified' ||
        relation.source === 'scan' ||
        relation.source === 'claim' ||
        relation.source === 'bootstrap'
          ? 'verified'
          : 'draft',
      relationshipNameRevealed: relation.relationshipNameRevealed === true,
      localState: normalizeRelationshipLocalState({
        id: relation.id,
        identityStatus:
          relation.identityStatus === 'verified' ||
          relation.source === 'scan' ||
          relation.source === 'claim' ||
          relation.source === 'bootstrap'
            ? 'verified'
            : 'draft',
        relationshipNameRevealed: relation.relationshipNameRevealed === true,
        localState: relation.localState,
      }, persistedEvaluations),
    }));
    state.evaluations = persistedEvaluations;
    state.places = Array.isArray(persisted.places)
      ? persisted.places.reduce<Place[]>((acc, rawPlace) => {
          if (!rawPlace || typeof rawPlace !== 'object') return acc;
          const place = rawPlace as Partial<Place>;
          const name = typeof place.name === 'string' ? place.name.trim() : '';
          if (!name) return acc;

          acc.push({
            id:
              typeof place.id === 'string' && place.id.length > 0
                ? place.id
                : `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name,
            category: sanitizePlaceCategory(place.category),
            rating: sanitizePlaceRating(place.rating),
            impression:
              typeof place.impression === 'string' && place.impression.trim().length > 0
                ? place.impression.trim()
                : undefined,
            createdAt:
              typeof place.createdAt === 'string' && place.createdAt.length > 0
                ? place.createdAt
                : new Date().toISOString(),
          });

          return acc;
        }, [])
      : [];
  } else {
    persistState<StoreState>({
      me: state.me,
      relations: state.relations,
      evaluations: state.evaluations,
      places: state.places,
    });
  }
  hydrated = true;
  emitChange();
});

// ── mutations ──────────────────────────────────────────────────────────

/**
 * Provisions or clears the internal auth identity in the local profile.
 *
 * Call this at two points:
 *   1. App bootstrap — when the existing session is resolved via getCurrentAuthenticatedUser()
 *   2. Every auth state change — via supabase.auth.onAuthStateChange()
 *
 * Pass null to clear (sign-out, unauthenticated state).
 *
 * This function does NOT call persist() — internalAuthUserId is a runtime field
 * that is always re-derived from the live session, never read from AsyncStorage.
 */
function hydrateAuthIdentity(userId: string | null): void {
  if (state.me.internalAuthUserId === userId) return;
  state.me = { ...state.me, internalAuthUserId: userId };
  emitChange();
}

/**
 * Provisions or clears the public profile identity in the local profile.
 *
 * Call this once the backend provisioning flow for publicProfileId is implemented.
 * Until then, publicProfileId remains null and QR cards are emitted as v1.
 *
 * INVARIANT: never pass internalAuthUserId here. publicProfileId must be a
 * distinct identifier provisioned by the backend — not derived from auth.uid().
 *
 * This function does NOT call persist() — publicProfileId is a runtime field
 * provisioned from the backend on demand, not stored in AsyncStorage.
 */
function hydratePublicProfileId(id: string | null): void {
  if (state.me.publicProfileId === id) return;
  state.me = { ...state.me, publicProfileId: id };
  emitChange();
}

function setArchived(id: string, archived: boolean) {
  state.relations = state.relations.map((relation) =>
    relation.id === id ? { ...relation, archived } : relation,
  );
  emitChange();
  persist();
}

function setPrivateReadingOnSide(
  relation: Relation,
  side: RelationshipSideKey,
  evaluationId: string,
): Relation {
  const localState = relation.localState ?? buildDefaultRelationshipLocalState(relation, state.evaluations);

  if (side === 'sideA') {
    return {
      ...relation,
      localState: {
        ...localState,
        sideA: {
          ...localState.sideA,
          exists: true,
          identityStatus: relation.identityStatus,
          hasPrivateReading: true,
          privateReadingId: evaluationId,
        },
      },
    };
  }

  if (!localState.sideB.exists) {
    return relation;
  }

  return {
    ...relation,
    localState: {
      ...localState,
      sideB: {
        ...localState.sideB,
        hasPrivateReading: true,
        privateReadingId: evaluationId,
      },
    },
  };
}

function finalizeCookingStartInState(relationId: string): boolean {
  const relation = state.relations.find((item) => item.id === relationId);
  if (!relation) return false;

  const localState = relation.localState ?? buildDefaultRelationshipLocalState(relation, state.evaluations);
  const snapshot = localState.revealSnapshot;
  if (snapshot.status === 'cooking_reveal' || snapshot.status === 'reveal_ready' || snapshot.status === 'revealed') {
    return false;
  }
  if (!localState.sideA.exists || !localState.sideB.exists) return false;
  if (!localState.sideA.hasPrivateReading || !localState.sideB.hasPrivateReading) return false;

  const readingAId = localState.sideA.privateReadingId;
  const readingBId = localState.sideB.privateReadingId;
  if (!readingAId || !readingBId) return false;

  const readingA = state.evaluations.find((item) => item.id === readingAId);
  const readingB = state.evaluations.find((item) => item.id === readingBId);
  if (!readingA || !readingB) return false;

  const mutual = computeMutualRelationshipScore(readingA.ratings, readingB.ratings);
  const cookingStartedAt = new Date().toISOString();
  const unlockAt = new Date(Date.now() + REVEAL_UNLOCK_DELAY_MS).toISOString();

  state.relations = state.relations.map((item) => {
    if (item.id !== relationId) return item;
    const current = item.localState ?? buildDefaultRelationshipLocalState(item, state.evaluations);
    return {
      ...item,
      relationshipNameRevealed: false,
      localState: {
        ...current,
        revealSnapshot: {
          ...current.revealSnapshot,
          status: 'cooking_reveal',
          revealed: false,
          relationshipNameRevealed: false,
          cookingStartedAt,
          unlockAt,
          readyAt: undefined,
          firstViewedAt: undefined,
          revealedAt: undefined,
          mutualScore: mutual.finalScore,
          tier: mutual.tier,
          finalizedVersion: (current.revealSnapshot.finalizedVersion ?? 0) + 1,
        },
      },
    };
  });

  return true;
}

function markRevealReadyIfUnlockedInState(relationId: string): boolean {
  const relation = state.relations.find((item) => item.id === relationId);
  if (!relation) return false;

  const snapshot = relation.localState.revealSnapshot;
  if (snapshot.status !== 'cooking_reveal') return false;
  if (!snapshot.unlockAt) return false;

  const unlockAtMs = Date.parse(snapshot.unlockAt);
  if (!Number.isFinite(unlockAtMs) || Date.now() < unlockAtMs) return false;

  const now = new Date().toISOString();
  state.relations = state.relations.map((item) => {
    if (item.id !== relationId) return item;
    return {
      ...item,
      localState: {
        ...item.localState,
        revealSnapshot: {
          ...item.localState.revealSnapshot,
          status: 'reveal_ready',
          readyAt: item.localState.revealSnapshot.readyAt ?? now,
          revealed: false,
          relationshipNameRevealed: false,
        },
      },
    };
  });

  return true;
}

function openMutualRevealInState(relationId: string): boolean {
  const movedToReady = markRevealReadyIfUnlockedInState(relationId);
  const relation = state.relations.find((item) => item.id === relationId);
  if (!relation) return false;

  const snapshot = relation.localState.revealSnapshot;
  if (snapshot.status === 'revealed') return movedToReady;
  if (snapshot.status !== 'reveal_ready') return movedToReady;

  const now = new Date().toISOString();
  state.relations = state.relations.map((item) => {
    if (item.id !== relationId) return item;
    return {
      ...item,
      relationshipNameRevealed: true,
      localState: {
        ...item.localState,
        revealSnapshot: {
          ...item.localState.revealSnapshot,
          status: 'revealed',
          revealed: true,
          relationshipNameRevealed: true,
          firstViewedAt: item.localState.revealSnapshot.firstViewedAt ?? now,
          revealedAt: now,
        },
      },
    };
  });

  return true;
}

function pushEvaluationForSide(
  evaluation: Evaluation,
  side: RelationshipSideKey,
): boolean {
  const relation = state.relations.find((item) => item.id === evaluation.relationId);
  if (!relation) return false;

  const localState = relation.localState ?? buildDefaultRelationshipLocalState(relation, state.evaluations);
  if (side === 'sideB' && !localState.sideB.exists) return false;

  state.evaluations = [...state.evaluations, evaluation];
  state.relations = state.relations.map((relation) => {
    if (relation.id !== evaluation.relationId) return relation;
    return setPrivateReadingOnSide(relation, side, evaluation.id);
  });
  finalizeCookingStartInState(evaluation.relationId);
  emitChange();
  persist();
  return true;
}

function pushEvaluation(evaluation: Evaluation) {
  return pushEvaluationForSide(evaluation, 'sideA');
}

function resolveInviteSideB(relationId: string): boolean {
  const meHasIdentity = Boolean(state.me.displayName.trim() && state.me.handle.trim());
  if (!meHasIdentity) return false;

  let didResolve = false;
  state.relations = state.relations.map((relation) => {
    if (relation.id !== relationId) return relation;

    const localState = relation.localState ?? buildDefaultRelationshipLocalState(relation, state.evaluations);
    const alreadyResolved =
      localState.sideB.exists &&
      localState.sideB.identityStatus !== 'missing';
    if (alreadyResolved) return relation;

    const sideBIdentityStatus =
      localState.sideB.identityStatus === 'verified'
        ? 'verified'
        : 'draft';

    didResolve = true;
    return {
      ...relation,
      localState: {
        ...localState,
        sideB: {
          ...localState.sideB,
          exists: true,
          identityStatus: sideBIdentityStatus,
          hasPrivateReading: localState.sideB.hasPrivateReading,
          privateReadingId: localState.sideB.privateReadingId,
          resolvedAt: localState.sideB.resolvedAt ?? new Date().toISOString(),
        },
      },
    };
  });

  if (!didResolve) return false;
  emitChange();
  persist();
  return true;
}

function finalizeCookingStart(relationId: string): boolean {
  const changed = finalizeCookingStartInState(relationId);
  if (!changed) return false;
  emitChange();
  persist();
  return true;
}

function markRevealReadyIfUnlocked(relationId: string): boolean {
  const changed = markRevealReadyIfUnlockedInState(relationId);
  if (!changed) return false;
  emitChange();
  persist();
  return true;
}

function openMutualReveal(relationId: string): boolean {
  const changed = openMutualRevealInState(relationId);
  if (!changed) return false;
  emitChange();
  persist();
  return true;
}

export type PlaceCreateInput = {
  name: string;
  category: PlaceCategory;
  rating: 1 | 2 | 3 | 4 | 5;
  impression?: string;
};

export type PlaceUpdateInput = {
  name: string;
  category: PlaceCategory;
  rating: 1 | 2 | 3 | 4 | 5;
  impression?: string;
};

function pushPlace(input: PlaceCreateInput): Place | null {
  const cleanName = input.name.trim();
  if (!cleanName) return null;

  const category = sanitizePlaceCategory(input.category);
  const rating = sanitizePlaceRating(input.rating);
  const cleanImpression = input.impression?.trim();
  const place: Place = {
    id: `p-${Date.now()}`,
    name: cleanName,
    category,
    rating,
    impression: cleanImpression ? cleanImpression : undefined,
    createdAt: new Date().toISOString(),
  };
  state.places = [place, ...state.places];
  emitChange();
  persist();
  return place;
}

function setPlace(id: string, update: PlaceUpdateInput): boolean {
  const cleanName = update.name.trim();
  if (!cleanName) return false;

  const category = sanitizePlaceCategory(update.category);
  const rating = sanitizePlaceRating(update.rating);
  const cleanImpression = update.impression?.trim();

  let didUpdate = false;
  state.places = state.places.map((place) => {
    if (place.id !== id) return place;
    didUpdate = true;
    return {
      ...place,
      name: cleanName,
      category,
      rating,
      impression: cleanImpression ? cleanImpression : undefined,
    };
  });

  if (!didUpdate) return false;
  emitChange();
  persist();
  return true;
}

function pushRelation(name: string): Relation | null {
  const cleanName = name.trim();
  if (!cleanName) return null;

  const relation: Relation = {
    id: `r-${Date.now()}`,
    name: cleanName,
    archived: false,
    createdAt: new Date().toISOString(),
    identityStatus: 'draft',
    relationshipNameRevealed: false,
    avatarSeed: cleanName.charAt(0).toUpperCase() || '?',
    source: 'manual',
    localState: {
      sideA: {
        exists: true,
        identityStatus: 'draft',
        hasPrivateReading: false,
      },
      sideB: {
        exists: false,
        identityStatus: 'missing',
        hasPrivateReading: false,
      },
      revealSnapshot: {
        status: 'waiting_other_side',
        revealed: false,
        relationshipNameRevealed: false,
      },
    },
  };
  state.relations = [relation, ...state.relations];
  emitChange();
  persist();
  return relation;
}

type RelationSourceMeta = {
  source: 'manual' | 'scan' | 'claim';
  handle?: string;
  avatarSeed?: string;
  sourceCardMeId?: string;
  sourcePublicProfileId?: string;
  sourceHandle?: string;
  /**
   * For 'claim' source only.
   * The canonical relation UUID from the claim response (claim.relationship_id).
   * Set as Relation.canonicalRelationId at creation time.
   */
  canonicalRelationId?: string;
  /**
   * For 'claim' source only.
   * The full shared_record from the claim response, projected via buildSharedRevealLocalState.
   * When present, provides accurate initial localState instead of the conservative default.
   */
  claimSharedRecord?: SharedRelationBootstrapInput;
};

function pushRelationWithSource(
  name: string,
  meta: RelationSourceMeta,
): Relation | null {
  const cleanName = name.trim();
  if (!cleanName) return null;

  const isClaim = meta.source === 'claim';
  const isVerified = meta.source === 'scan' || isClaim;

  const relation: Relation = {
    id: `r-${Date.now()}`,
    name: cleanName,
    archived: false,
    createdAt: new Date().toISOString(),
    identityStatus: isVerified ? 'verified' : 'draft',
    relationshipNameRevealed: false,
    handle: meta.handle,
    avatarSeed: meta.avatarSeed || cleanName.charAt(0).toUpperCase() || '?',
    source: meta.source,
    sourceCardMeId: meta.sourceCardMeId,
    sourcePublicProfileId: meta.sourcePublicProfileId,
    sourceHandle: meta.sourceHandle,
    // For claim source: canonicalRelationId is known at creation time.
    // For other sources: null (set later via setCanonicalRelationId at invite creation).
    canonicalRelationId: meta.canonicalRelationId ?? null,
    // For claim source only: the counterpart's public profile signal, if available.
    // Null for manual/scan sources (not applicable) and when counterpart hasn't provisioned.
    counterpartPublicProfileId: isClaim
      ? (meta.claimSharedRecord?.counterpart_public_profile_id ?? null)
      : undefined,
    localState: isClaim
      ? meta.claimSharedRecord
        ? buildSharedRevealLocalState(meta.claimSharedRecord)
        : {
            // Conservative default when shared_record was not transported (should not happen
            // in normal flow; claim-shared-record-handoff module is the primary path).
            // Both sides are proven to exist: inviter created the invite, claimer just claimed it.
            sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: false },
            sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: false },
            revealSnapshot: { status: 'waiting_other_side', revealed: false, relationshipNameRevealed: false },
          }
      : {
          sideA: {
            exists: true,
            identityStatus: isVerified ? 'verified' : 'draft',
            hasPrivateReading: false,
          },
          sideB: {
            exists: false,
            identityStatus: 'missing',
            hasPrivateReading: false,
          },
          revealSnapshot: {
            status: 'waiting_other_side',
            revealed: false,
            relationshipNameRevealed: false,
          },
        },
  };
  state.relations = [relation, ...state.relations];
  emitChange();
  persist();
  return relation;
}

function normalizeHandle(raw: string) {
  const noSpaces = raw.trim().toLowerCase().replace(/\s+/g, '');
  const noAt = noSpaces.replace(/^@+/, '');
  const safe = noAt.replace(/[^a-z0-9._-]/g, '');
  if (!safe) return '';
  return `@${safe}`;
}

function normalizeAvatarSeed(raw: string, displayName: string) {
  const seed = raw.trim().toUpperCase().replace(/\s+/g, '').slice(0, 2);
  if (seed) return seed;
  const fallback = displayName.trim().charAt(0).toUpperCase();
  return fallback || '?';
}

function normalizeOptionalHandle(raw: string) {
  const normalized = normalizeHandle(raw);
  return normalized || undefined;
}

function setMe(update: MeProfileUpdate): boolean {
  const displayName = update.displayName.trim();
  const handle = normalizeHandle(update.handle);
  const avatarSeed = normalizeAvatarSeed(update.avatarSeed, displayName);

  if (!displayName || !handle) return false;

  state.me = {
    ...state.me,
    displayName,
    handle,
    avatarSeed,
  };
  emitChange();
  persist();
  return true;
}

function setRelation(id: string, update: RelationUpdate): boolean {
  const cleanName = update.name.trim();
  if (!cleanName) return false;

  let didUpdate = false;
  state.relations = state.relations.map((relation) => {
    if (relation.id !== id) return relation;
    const normalizedHandle = update.handle === undefined
      ? relation.handle
      : normalizeOptionalHandle(update.handle);
    const normalizedAvatarSeed = update.avatarSeed === undefined
      ? relation.avatarSeed ?? normalizeAvatarSeed('', cleanName)
      : normalizeAvatarSeed(update.avatarSeed, cleanName);
    didUpdate = true;
    return {
      ...relation,
      name: cleanName,
      handle: normalizedHandle,
      avatarSeed: normalizedAvatarSeed,
    };
  });

  if (!didUpdate) return false;
  emitChange();
  persist();
  return true;
}

function attachCanonicalRelationId(localId: string, canonicalId: string): boolean {
  let didUpdate = false;
  state.relations = state.relations.map((relation) => {
    if (relation.id !== localId) return relation;
    // Never overwrite an existing canonicalRelationId — it is immutable once set.
    if (relation.canonicalRelationId) return relation;
    didUpdate = true;
    return { ...relation, canonicalRelationId: canonicalId };
  });
  if (!didUpdate) return false;
  emitChange();
  persist();
  return true;
}

/**
 * Minimal input shape expected from the my_shared_relationships RPC.
 * Defined here so the store owns the contract; the fetch layer (lib/bootstrap-shared-relations.ts)
 * imports this type rather than the reverse.
 */
export type SharedRelationBootstrapInput = {
  relationship_id: string;
  /** One of the SharedRevealStatus values, as returned by the backend. */
  status: string;
  /** Which side the current user occupies: 'sideA' or 'sideB'. Server-computed. */
  my_side: string;
  /** Explicit proof that sideA participant is bound (side_a_user_id is not null). */
  side_a_present: boolean;
  /** Explicit proof that sideB participant is bound (side_b_user_id is not null). */
  side_b_present: boolean;
  side_a_reading_id: string | null;
  side_b_reading_id: string | null;
  /** ISO timestamp — when cooking_reveal phase began. Null if not yet in cooking state. */
  cooking_started_at: string | null;
  /** ISO timestamp — when the cooking timer expires and reveal becomes available. */
  unlock_at: string | null;
  /** ISO timestamp — when reveal_ready state was entered. */
  ready_at: string | null;
  /** ISO timestamp — when the reveal was opened. */
  revealed_at: string | null;
  /** Whether the relationship name was revealed. Only meaningful when status is 'revealed'. */
  relationship_name_revealed: boolean;
  /**
   * The publicProfileId of the other participant.
   * Computed server-side — no auth.uid() is ever exposed.
   * Null when the counterpart has not provisioned a public profile, or their slot is empty.
   *
   * Signal only — not a relation key. Does not authorize automatic merge.
   */
  counterpart_public_profile_id: string | null;
};

/**
 * Pure helper: projects shared backend truth into a local RelationshipLocalState.
 *
 * Used by both bootstrap materialization and (eventually) claim materialization.
 * Centralizes the mapping: presence + reading ids + status + timestamps → local state.
 *
 * Invariants:
 *   - hasPrivateReading requires both presence AND a non-null reading_id.
 *   - revealSnapshot timestamps are only set if truthy strings.
 *   - Timestamps beyond the current status are not projected (e.g., revealed_at
 *     is only set when status is 'revealed').
 */
function buildSharedRevealLocalState(data: SharedRelationBootstrapInput): RelationshipLocalState {
  const normalizedStatus: RelationshipRevealSnapshot['status'] = isRevealStatus(data.status)
    ? data.status
    : 'waiting_other_side';
  const revealed = normalizedStatus === 'revealed';
  const isCooking = normalizedStatus === 'cooking_reveal';
  const isReady = normalizedStatus === 'reveal_ready';

  const sideAPresent = data.side_a_present === true;
  const sideBPresent = data.side_b_present === true;

  function toOptionalTs(value: string | null | undefined): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  return {
    sideA: {
      exists: sideAPresent,
      identityStatus: sideAPresent ? 'verified' : 'missing',
      hasPrivateReading: sideAPresent && data.side_a_reading_id !== null,
    },
    sideB: {
      exists: sideBPresent,
      identityStatus: sideBPresent ? 'verified' : 'missing',
      hasPrivateReading: sideBPresent && data.side_b_reading_id !== null,
    },
    revealSnapshot: {
      status: normalizedStatus,
      revealed,
      relationshipNameRevealed: revealed ? data.relationship_name_revealed === true : false,
      // cooking_started_at and unlock_at are only meaningful during cooking_reveal.
      // ready_at is only meaningful from reveal_ready onward.
      // revealed_at is only meaningful once revealed.
      cookingStartedAt: isCooking || isReady || revealed ? toOptionalTs(data.cooking_started_at) : undefined,
      unlockAt: isCooking ? toOptionalTs(data.unlock_at) : undefined,
      readyAt: isReady || revealed ? toOptionalTs(data.ready_at) : undefined,
      revealedAt: revealed ? toOptionalTs(data.revealed_at) : undefined,
    },
  };
}

/**
 * Idempotent upsert: for each backend row, create a minimal local relation if one
 * with the same canonicalRelationId does not already exist.
 *
 * Dedup key: canonicalRelationId only — never name / handle / heuristic.
 * Relations already present in the store (any source) are untouched.
 * Non-canonical rows (missing relationship_id) are silently skipped.
 */
function upsertBootstrappedSharedRelations(rows: SharedRelationBootstrapInput[]): void {
  if (!rows.length) return;

  let didChange = false;
  for (const row of rows) {
    const canonicalId = typeof row.relationship_id === 'string' ? row.relationship_id.trim() : '';
    if (!canonicalId) continue;

    // Idempotent: skip if already materialized by any source.
    if (state.relations.some((r) => r.canonicalRelationId === canonicalId)) continue;

    const localState = buildSharedRevealLocalState(row);
    const revealed = localState.revealSnapshot.revealed;

    const relation: Relation = {
      // Suffix ensures uniqueness when multiple rows are bootstrapped in the same tick.
      id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      // Placeholder: name is not available from the shared record.
      // The user can rename via the relation edit screen.
      name: '(shared)',
      archived: false,
      createdAt: new Date().toISOString(),
      identityStatus: 'verified',
      relationshipNameRevealed: revealed,
      avatarSeed: '?',
      source: 'bootstrap',
      canonicalRelationId: canonicalId,
      counterpartPublicProfileId: row.counterpart_public_profile_id ?? null,
      localState,
    };

    state.relations = [relation, ...state.relations];
    didChange = true;
  }

  if (didChange) {
    emitChange();
    persist();
  }
}

function resetDevStateToSeed() {
  state.me = { ...SEED_ME };
  state.relations = [...SEED_RELATIONS];
  state.evaluations = [...SEED_EVALUATIONS];
  state.places = [...SEED_PLACES];
  hydrated = true;
  emitChange();
  void clearPersistedState().finally(() => {
    persistState<StoreState>({
      me: state.me,
      relations: state.relations,
      evaluations: state.evaluations,
      places: state.places,
    });
  });
}

// ── hook ───────────────────────────────────────────────────────────────

export function useRelationsStore() {
  const me = useSyncExternalStore(subscribe, getMeSnapshot, getMeSnapshot);
  const relations = useSyncExternalStore(subscribe, getRelationsSnapshot, getRelationsSnapshot);
  const evaluations = useSyncExternalStore(subscribe, getEvaluationsSnapshot, getEvaluationsSnapshot);
  const places = useSyncExternalStore(subscribe, getPlacesSnapshot, getPlacesSnapshot);
  const isHydrated = useSyncExternalStore(subscribe, getHydratedSnapshot, getHydratedSnapshot);

  const activeRelations = relations.filter((r) => !r.archived);
  const archivedRelations = relations.filter((r) => r.archived);

  const archiveRelation = (id: string) => { setArchived(id, true); };
  const restoreRelation = (id: string) => { setArchived(id, false); };
  const addEvaluation = (evaluation: Evaluation) => pushEvaluation(evaluation);
  const attachPrivateReadingToRelationshipSide = (
    evaluation: Evaluation,
    side: RelationshipSideKey,
  ) => pushEvaluationForSide(evaluation, side);
  const addRelation = (name: string, meta?: RelationSourceMeta) => {
    if (!meta) return pushRelation(name);
    return pushRelationWithSource(name, meta);
  };
  const updateMe = (update: MeProfileUpdate) => setMe(update);
  const updateRelation = (id: string, update: RelationUpdate) => setRelation(id, update);
  const addPlace = (input: PlaceCreateInput) => pushPlace(input);
  const updatePlace = (id: string, update: PlaceUpdateInput) => setPlace(id, update);
  const resolveInvitedSideB = (relationId: string) => resolveInviteSideB(relationId);
  const startCookingReveal = (relationId: string) => finalizeCookingStart(relationId);
  const syncRevealReadyState = (relationId: string) => markRevealReadyIfUnlocked(relationId);
  const revealMutualRelationship = (relationId: string) => openMutualReveal(relationId);
  const resetDevState = () => resetDevStateToSeed();
  const setAuthIdentity = (userId: string | null) => hydrateAuthIdentity(userId);
  const setPublicProfileId = (id: string | null) => hydratePublicProfileId(id);
  const setCanonicalRelationId = (localId: string, canonicalId: string) =>
    attachCanonicalRelationId(localId, canonicalId);
  const bootstrapSharedRelations = (rows: SharedRelationBootstrapInput[]) =>
    upsertBootstrappedSharedRelations(rows);

  const getAssistedReconciliationSuggestionForRelation = (relationId: string) =>
    findAssistedReconciliationSuggestionForRelation(relationId, relations);

  const getDraftResolutionSuggestionForRelation = (relationId: string) =>
    findDraftResolutionSuggestionForRelation(relationId, relations);

  return {
    me,
    relations,
    evaluations,
    places,
    activeRelations,
    archivedRelations,
    archiveRelation,
    restoreRelation,
    addEvaluation,
    attachPrivateReadingToRelationshipSide,
    addRelation,
    updateRelation,
    updatePlace,
    resolveInvitedSideB,
    startCookingReveal,
    syncRevealReadyState,
    revealMutualRelationship,
    resetDevState,
    updateMe,
    addPlace,
    isHydrated,
    setAuthIdentity,
    setPublicProfileId,
    setCanonicalRelationId,
    bootstrapSharedRelations,
    getAssistedReconciliationSuggestionForRelation,
    getDraftResolutionSuggestionForRelation,
  };
}
