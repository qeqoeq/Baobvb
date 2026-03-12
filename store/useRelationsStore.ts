import { useSyncExternalStore } from 'react';

import { computeScore, getTier, type Evaluation, type PillarKey, type PillarRating } from '../lib/evaluation';
import { loadPersistedState, persistState } from '../lib/storage';

export type Relation = {
  id: string;
  name: string;
  archived: boolean;
  createdAt: string;
  handle?: string;
  avatarSeed?: string;
  source: 'manual' | 'scan';
  sourceCardMeId?: string;
  sourceHandle?: string;
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
};

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
  { id: '1', name: 'Olivier', archived: false, createdAt: '2025-11-10T10:00:00Z', source: 'manual' },
  { id: '2', name: 'Nora', archived: false, createdAt: '2025-12-01T14:30:00Z', source: 'manual' },
  { id: '3', name: 'Jean', archived: true, createdAt: '2025-10-05T09:00:00Z', source: 'manual' },
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

// ── state ──────────────────────────────────────────────────────────────

const state: StoreState = {
  me: SEED_ME,
  relations: SEED_RELATIONS,
  evaluations: SEED_EVALUATIONS,
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

function getHydratedSnapshot() {
  return hydrated;
}

// ── persistence ────────────────────────────────────────────────────────

function persist() {
  if (!hydrated) return;
  persistState<StoreState>({
    me: state.me,
    relations: state.relations,
    evaluations: state.evaluations,
  });
}

// ── hydration (runs once at import time) ───────────────────────────────

loadPersistedState<StoreState>().then((persisted) => {
  if (
    persisted &&
    Array.isArray(persisted.relations) &&
    Array.isArray(persisted.evaluations)
  ) {
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
    }));
    state.evaluations = persisted.evaluations;
  } else {
    persistState<StoreState>({
      me: state.me,
      relations: state.relations,
      evaluations: state.evaluations,
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

function pushEvaluation(evaluation: Evaluation) {
  state.evaluations = [...state.evaluations, evaluation];
  emitChange();
  persist();
}

function pushRelation(name: string): Relation | null {
  const cleanName = name.trim();
  if (!cleanName) return null;

  const relation: Relation = {
    id: `r-${Date.now()}`,
    name: cleanName,
    archived: false,
    createdAt: new Date().toISOString(),
    avatarSeed: cleanName.charAt(0).toUpperCase() || '?',
    source: 'manual',
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
    handle: meta.handle,
    avatarSeed: meta.avatarSeed || cleanName.charAt(0).toUpperCase() || '?',
    source: meta.source,
    sourceCardMeId: meta.sourceCardMeId,
    sourceHandle: meta.sourceHandle,
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
  const isHydrated = useSyncExternalStore(subscribe, getHydratedSnapshot, getHydratedSnapshot);

  const activeRelations = relations.filter((r) => !r.archived);
  const archivedRelations = relations.filter((r) => r.archived);

  const archiveRelation = (id: string) => { setArchived(id, true); };
  const restoreRelation = (id: string) => { setArchived(id, false); };
  const addEvaluation = (evaluation: Evaluation) => { pushEvaluation(evaluation); };
  const addRelation = (name: string, meta?: RelationSourceMeta) => {
    if (!meta) return pushRelation(name);
    return pushRelationWithSource(name, meta);
  };
  const updateMe = (update: MeProfileUpdate) => setMe(update);
  const updateRelation = (id: string, update: RelationUpdate) => setRelation(id, update);

  return {
    me,
    relations,
    evaluations,
    activeRelations,
    archivedRelations,
    archiveRelation,
    restoreRelation,
    addEvaluation,
    addRelation,
    updateRelation,
    updateMe,
    isHydrated,
  };
}
