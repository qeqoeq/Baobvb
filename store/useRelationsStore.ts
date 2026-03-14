import { useSyncExternalStore } from 'react';

import {
  computeScore,
  getTier,
  type Evaluation,
  type PillarKey,
  type PillarRating,
  type Tier,
} from '../lib/evaluation';
import { loadPersistedState, persistState } from '../lib/storage';

export type RelationshipSideIdentityStatus = 'missing' | 'draft' | 'verified';

export type RelationshipSideLocalState = {
  exists: boolean;
  identityStatus: RelationshipSideIdentityStatus;
  hasPrivateReading: boolean;
  privateReadingId?: string;
  resolvedAt?: string;
};

export type RelationshipRevealSnapshot = {
  revealed: boolean;
  revealedAt?: string;
  mutualScore?: number;
  tier?: Tier;
};

export type RelationshipLocalState = {
  sideA: RelationshipSideLocalState;
  sideB: RelationshipSideLocalState;
  revealSnapshot: RelationshipRevealSnapshot;
};

export type Relation = {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  identityStatus: 'draft' | 'verified';
  relationshipNameRevealed?: boolean;
  handle?: string;
  avatarSeed?: string;
  source: 'manual' | 'scan';
  sourceCardMeId?: string;
  sourceHandle?: string;
  localState: RelationshipLocalState;
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
  id: string;
  displayName: string;
  handle: string;
  avatarSeed: string;
  trustPassportStatus: 'new' | 'growing' | 'steady';
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
      revealSnapshot: { revealed: false },
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
      revealSnapshot: { revealed: false },
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
      revealSnapshot: { revealed: false },
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
};

const SEED_PLACES: Place[] = [];
const PLACE_CATEGORIES: PlaceCategory[] = ['restaurant', 'cafe', 'bar', 'spot', 'other'];
const TIER_VALUES: Tier[] = ['Ghost', 'Spark', 'Thrill', 'Vibrant', 'Anchor', 'Legend'];

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
      revealed: relation.relationshipNameRevealed === true,
    },
  };
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
  const revealed = relation.relationshipNameRevealed === true || rawReveal?.revealed === true;
  const tier =
    rawReveal?.tier && TIER_VALUES.includes(rawReveal.tier)
      ? rawReveal.tier
      : undefined;

  return {
    sideA: fallback.sideA,
    sideB: {
      exists: sideBExists,
      identityStatus: sideBTierStatus,
      hasPrivateReading: sideBHasReading,
      privateReadingId: sideBHasReading ? sideBReadingId : undefined,
      resolvedAt: sideBResolvedAt,
    },
    revealSnapshot: {
      revealed,
      revealedAt:
        revealed && typeof rawReveal?.revealedAt === 'string' && rawReveal.revealedAt.length > 0
          ? rawReveal.revealedAt
          : undefined,
      mutualScore:
        revealed && typeof rawReveal?.mutualScore === 'number'
          ? rawReveal.mutualScore
          : undefined,
      tier: revealed ? tier : undefined,
    },
  };
}

// ── persistence ────────────────────────────────────────────────────────

function persist() {
  if (!hydrated) return;
  persistState<StoreState>({
    me: state.me,
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
      };
    }
    state.relations = persisted.relations.map((relation) => ({
      ...relation,
      avatarSeed:
        relation.avatarSeed ||
        relation.name?.trim().charAt(0).toUpperCase() ||
        '?',
      source: relation.source === 'scan' ? 'scan' : 'manual',
      identityStatus:
        relation.identityStatus === 'verified' || relation.source === 'scan'
          ? 'verified'
          : 'draft',
      relationshipNameRevealed: relation.relationshipNameRevealed === true,
      localState: normalizeRelationshipLocalState({
        id: relation.id,
        identityStatus:
          relation.identityStatus === 'verified' || relation.source === 'scan'
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
        revealed: false,
      },
    },
  };
  state.relations = [relation, ...state.relations];
  emitChange();
  persist();
  return relation;
}

type RelationSourceMeta = {
  source: 'manual' | 'scan';
  handle?: string;
  avatarSeed?: string;
  sourceCardMeId?: string;
  sourceHandle?: string;
};

function pushRelationWithSource(
  name: string,
  meta: RelationSourceMeta,
): Relation | null {
  const cleanName = name.trim();
  if (!cleanName) return null;

  const relation: Relation = {
    id: `r-${Date.now()}`,
    name: cleanName,
    archived: false,
    createdAt: new Date().toISOString(),
    identityStatus: meta.source === 'scan' ? 'verified' : 'draft',
    relationshipNameRevealed: false,
    handle: meta.handle,
    avatarSeed: meta.avatarSeed || cleanName.charAt(0).toUpperCase() || '?',
    source: meta.source,
    sourceCardMeId: meta.sourceCardMeId,
    sourceHandle: meta.sourceHandle,
    localState: {
      sideA: {
        exists: true,
        identityStatus: meta.source === 'scan' ? 'verified' : 'draft',
        hasPrivateReading: false,
      },
      sideB: {
        exists: false,
        identityStatus: 'missing',
        hasPrivateReading: false,
      },
      revealSnapshot: {
        revealed: false,
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

  const normalizedHandle = normalizeOptionalHandle(update.handle ?? '');
  const normalizedAvatarSeed = normalizeAvatarSeed(update.avatarSeed ?? '', cleanName);

  let didUpdate = false;
  state.relations = state.relations.map((relation) => {
    if (relation.id !== id) return relation;
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
    updateMe,
    addPlace,
    isHydrated,
  };
}
