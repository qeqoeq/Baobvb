// Progressive criteria unlock — engine v0.1
//
// When a user gives a strong rating to a base pillar, Baobab opens a private,
// optional layer of finer-grained criteria attached to THAT pillar. They are:
//   - private and local-only (never sent to the server in v0.1)
//   - never shown to the other side
//   - never used for network opening, recommendation, or shared reading
//   - never aggregated, never compared, never ranked
//
// Mechanic:
//   rating === 5 → 'deep'  unlock (3 to 5 criteria attached to the pillar)
//   rating === 4 → 'light' unlock (1 to 2 lighter criteria)
//   rating <= 3  → 'none'  unlock (still forming, no questionnaire)
//
// Trust gate stays intact elsewhere (computePrivateLinkScore + Deeper Signal):
// Affinity child criteria can open even if Trust is low, but they remain
// strictly private — no recommendation, no network field, no shared exposure.
//
// This module is a pure, deterministic, side-effect-free derivation of the
// 5 base ratings. It has no RN / expo / supabase dependency so it stays
// testable under vitest.

import type { PillarKey } from './evaluation';

export type ProgressiveCriterionKey =
  // trust
  | 'reliability' | 'discretion' | 'boundaryRespect' | 'repairCapacity' | 'consistency'
  // interactions
  | 'exchangeQuality' | 'initiativeBalance' | 'attention' | 'conversationDepth'
  // affinity
  | 'ease' | 'humor' | 'sharedRhythm' | 'emotionalComfort'
  // support
  | 'availability' | 'emotionalPresence' | 'practicalHelp' | 'encouragement'
  // sharedNetwork
  | 'mutualCircles' | 'introductionSafety' | 'contextReliability' | 'trustedPathStrength';

export type ProgressiveCriterion = {
  key: ProgressiveCriterionKey;
  pillar: PillarKey;
  label: string;
  hint: string;
};

export type ProgressiveUnlockLevel = 'none' | 'light' | 'deep';

export type ProgressiveUnlock = {
  level: ProgressiveUnlockLevel;
  criteria: ReadonlyArray<ProgressiveCriterion>;
};

export type ProgressiveUnlocks = Record<PillarKey, ProgressiveUnlock>;

// ── Catalog ──────────────────────────────────────────────────────────────────
// Source of truth for v0.1. Wording follows the Baobab editorial rules:
// invitation-shaped questions, no rating/reputation/ranking vocabulary.

const TRUST_CRITERIA: ReadonlyArray<ProgressiveCriterion> = [
  { key: 'reliability', pillar: 'trust', label: 'Fiabilité', hint: 'Tient-elle parole quand ça compte ?' },
  { key: 'discretion', pillar: 'trust', label: 'Discrétion', hint: 'Ce qui est privé peut-il le rester avec elle ?' },
  { key: 'boundaryRespect', pillar: 'trust', label: 'Respect des limites', hint: 'Respecte-t-elle tes limites sans forcer ?' },
  { key: 'repairCapacity', pillar: 'trust', label: 'Capacité à réparer', hint: 'Le lien peut-il se remettre après une tension ?' },
  { key: 'consistency', pillar: 'trust', label: 'Constance', hint: 'La confiance tient-elle dans le temps ?' },
];

const INTERACTIONS_CRITERIA: ReadonlyArray<ProgressiveCriterion> = [
  { key: 'exchangeQuality', pillar: 'interactions', label: 'Qualité des échanges', hint: 'Tes échanges sont-ils clairs et pleins de sens ?' },
  { key: 'initiativeBalance', pillar: 'interactions', label: 'Équilibre des initiatives', hint: 'Les deux côtés font-ils naturellement l’effort ?' },
  { key: 'attention', pillar: 'interactions', label: 'Attention partagée', hint: 'Est-elle vraiment présente quand vous échangez ?' },
  { key: 'conversationDepth', pillar: 'interactions', label: 'Profondeur des conversations', hint: 'Les conversations vont-elles au-delà de la surface ?' },
];

const AFFINITY_CRITERIA: ReadonlyArray<ProgressiveCriterion> = [
  { key: 'ease', pillar: 'affinity', label: 'Aisance', hint: 'Être ensemble semble-t-il naturel ?' },
  { key: 'humor', pillar: 'affinity', label: 'Humour', hint: 'Riez-vous ou vous allégez-vous naturellement ?' },
  { key: 'sharedRhythm', pillar: 'affinity', label: 'Rythme partagé', hint: 'La connexion a-t-elle un rythme facile ?' },
  { key: 'emotionalComfort', pillar: 'affinity', label: 'Confort émotionnel', hint: 'Te sens-tu émotionnellement détendu·e avec elle ?' },
];

const SUPPORT_CRITERIA: ReadonlyArray<ProgressiveCriterion> = [
  { key: 'availability', pillar: 'support', label: 'Disponibilité', hint: 'Est-elle présente quand le soutien compte ?' },
  { key: 'emotionalPresence', pillar: 'support', label: 'Présence émotionnelle', hint: 'Fait-elle de la place à ce que tu ressens ?' },
  { key: 'practicalHelp', pillar: 'support', label: 'Aide concrète', hint: 'Peut-elle aider concrètement au besoin ?' },
  { key: 'encouragement', pillar: 'support', label: 'Encouragement', hint: 'Te fait-elle sentir plus fort·e, pas plus petit·e ?' },
];

const SHARED_NETWORK_CRITERIA: ReadonlyArray<ProgressiveCriterion> = [
  { key: 'mutualCircles', pillar: 'sharedNetwork', label: 'Cercles communs', hint: 'Partagez-vous des personnes ou des contextes de confiance ?' },
  { key: 'introductionSafety', pillar: 'sharedNetwork', label: 'Sécurité des présentations', hint: 'Une présentation via ce lien semblerait-elle sûre ?' },
  { key: 'contextReliability', pillar: 'sharedNetwork', label: 'Fiabilité en contexte', hint: 'Ce lien est-il fiable dans les cadres partagés ?' },
  { key: 'trustedPathStrength', pillar: 'sharedNetwork', label: 'Force du chemin de confiance', hint: 'Ce lien rend-il les chemins plus sûrs ?' },
];

const DEEP_BY_PILLAR: Record<PillarKey, ReadonlyArray<ProgressiveCriterion>> = {
  trust: TRUST_CRITERIA,
  interactions: INTERACTIONS_CRITERIA,
  affinity: AFFINITY_CRITERIA,
  support: SUPPORT_CRITERIA,
  sharedNetwork: SHARED_NETWORK_CRITERIA,
};

// Light unlock = a curated subset of the deep set, picked to be the most
// structurally informative for a "still proving itself" link.
const LIGHT_BY_PILLAR: Record<PillarKey, ReadonlyArray<ProgressiveCriterion>> = {
  trust: TRUST_CRITERIA.filter((c) => c.key === 'reliability' || c.key === 'consistency'),
  interactions: INTERACTIONS_CRITERIA.filter((c) => c.key === 'exchangeQuality' || c.key === 'initiativeBalance'),
  affinity: AFFINITY_CRITERIA.filter((c) => c.key === 'ease' || c.key === 'sharedRhythm'),
  support: SUPPORT_CRITERIA.filter((c) => c.key === 'availability' || c.key === 'emotionalPresence'),
  sharedNetwork: SHARED_NETWORK_CRITERIA.filter((c) => c.key === 'mutualCircles' || c.key === 'contextReliability'),
};

const PILLARS: ReadonlyArray<PillarKey> = ['trust', 'interactions', 'affinity', 'support', 'sharedNetwork'];

function deriveLevel(rating: number | null | undefined): ProgressiveUnlockLevel {
  if (typeof rating !== 'number') return 'none';
  if (rating >= 5) return 'deep';
  if (rating >= 4) return 'light';
  return 'none';
}

function buildUnlock(pillar: PillarKey, rating: number | null | undefined): ProgressiveUnlock {
  const level = deriveLevel(rating);
  if (level === 'deep') return { level, criteria: DEEP_BY_PILLAR[pillar] };
  if (level === 'light') return { level, criteria: LIGHT_BY_PILLAR[pillar] };
  return { level: 'none', criteria: [] };
}

/**
 * Returns the progressive unlock state for each base pillar, given the
 * user's ratings. Pure: same input → same output, no side effects.
 *
 * Privacy guarantees by construction:
 *   - No network/recommendation/score field anywhere in the returned shape.
 *   - No cross-pillar derivation: each pillar is judged on its own rating.
 *   - The Trust gate does not "lock" Affinity criteria — they may still
 *     open as private signals. The non-negotiable that "Affinity never
 *     compensates low Trust for recommendation" lives in the network
 *     opening layer (not built yet) and is therefore not weakened here.
 */
export function getProgressiveUnlocks(
  ratings: Partial<Record<PillarKey, number | null | undefined>>,
): ProgressiveUnlocks {
  const out = {} as ProgressiveUnlocks;
  for (const pillar of PILLARS) {
    out[pillar] = buildUnlock(pillar, ratings[pillar]);
  }
  return out;
}

/**
 * Returns the full catalog of criteria for a given pillar, in stable catalog
 * order. The Relation Detail Readback iterates over this to render private
 * signals in a deterministic order, independent of the user's input order.
 *
 * Pure read accessor. No IO, no store dependency. Returns a ReadonlyArray to
 * make accidental mutation impossible.
 */
export function getProgressiveCriteriaForPillar(
  pillarKey: PillarKey,
): ReadonlyArray<ProgressiveCriterion> {
  return DEEP_BY_PILLAR[pillarKey] ?? [];
}

/**
 * Returns the deep criteria of a pillar that have NOT yet been rated, given the
 * current set of progressive private signals for that pillar.
 *
 * Used by evaluate/[id].tsx to require deep signals when the parent rating is
 * 5: the user cannot save a "5" reading until every deep criterion of that
 * pillar carries a 1-5 child rating.
 *
 * Pure: no IO, no store, no scoring. Returns an empty array when the pillar
 * is fully rated. Returns the full catalog when `pillarSignals` is undefined.
 *
 * Note: a child rating value can never be 0 or out of range — the store only
 * accepts 1 | 2 | 3 | 4 | 5. A `falsy` check therefore correctly identifies
 * "no rating yet".
 */
export function getMissingDeepSignalsForPillar(
  pillarKey: PillarKey,
  pillarSignals: Partial<Record<ProgressiveCriterionKey, ProgressivePrivateSignalsRating>> | undefined,
): ReadonlyArray<ProgressiveCriterion> {
  const catalog = DEEP_BY_PILLAR[pillarKey];
  if (!catalog) return [];
  if (!pillarSignals) return catalog;
  return catalog.filter((criterion) => !pillarSignals[criterion.key]);
}

/**
 * Returns the private signals of a pillar that are still required, based on
 * its parent rating:
 *   - parentRating === 5 → at least 2 deep criteria must be rated
 *   - parentRating === 4 → at least 1 light criterion must be rated
 *   - parentRating <= 3 (or null/undefined) → nothing required (returns [])
 *
 * Returns ReadonlyArray to forbid mutation:
 *   - empty array → the threshold has been reached, pillar is unblocked
 *   - non-empty → the pillar is still blocked. The returned items are the
 *     UNRATED criteria of the relevant catalog (useful when future UI wants
 *     to surface suggestions); only `.length > 0` matters for the gate.
 *
 * Pure: no IO, no store, no scoring. Falsy/0 rating slots are treated as
 * "not rated" defensively (store type allows 1-5 only but historic patches
 * may have left other values).
 */
export function getMissingRequiredSignalsForPillar(
  pillarKey: PillarKey,
  parentRating: number | null | undefined,
  pillarSignals: Partial<Record<ProgressiveCriterionKey, ProgressivePrivateSignalsRating>> | undefined,
): ReadonlyArray<ProgressiveCriterion> {
  let catalog: ReadonlyArray<ProgressiveCriterion> | undefined;
  let requiredCount: number;
  if (parentRating === 5) {
    catalog = DEEP_BY_PILLAR[pillarKey];
    requiredCount = 2;
  } else if (parentRating === 4) {
    catalog = LIGHT_BY_PILLAR[pillarKey];
    requiredCount = 1;
  } else {
    return [];
  }
  if (!catalog) return [];

  let ratedCount = 0;
  const unrated: ProgressiveCriterion[] = [];
  for (const criterion of catalog) {
    if (pillarSignals && pillarSignals[criterion.key]) {
      ratedCount += 1;
    } else {
      unrated.push(criterion);
    }
  }
  if (ratedCount >= requiredCount) return [];
  return unrated;
}

// ── Local persistence shape ────────────────────────────────────────────────
// Used by the store to persist the user's private signal ratings keyed by
// relation.id. Strictly local: NEVER serialized into a Supabase payload, NEVER
// merged into Evaluation.ratings, NEVER read by computePrivateLinkScore.

export type ProgressivePrivateSignalsRating = 1 | 2 | 3 | 4 | 5;

export type ProgressivePrivateSignals =
  Partial<Record<PillarKey, Partial<Record<ProgressiveCriterionKey, ProgressivePrivateSignalsRating>>>>;

export type ProgressivePrivateSignalsByRelation =
  Record<string, ProgressivePrivateSignals>;

/**
 * Pure mutation helper. Returns a new map with the given rating applied,
 * preserving every other relation and every other (pillar, criterion) entry.
 * Tested directly; the store wraps this and adds persist + emit side effects.
 */
export function applyProgressivePrivateSignal(
  current: ProgressivePrivateSignalsByRelation,
  relationId: string,
  pillarKey: PillarKey,
  criterionKey: ProgressiveCriterionKey,
  rating: ProgressivePrivateSignalsRating,
): ProgressivePrivateSignalsByRelation {
  if (!relationId) return current;
  const existing = current[relationId] ?? {};
  const pillarBucket = existing[pillarKey] ?? {};
  return {
    ...current,
    [relationId]: {
      ...existing,
      [pillarKey]: {
        ...pillarBucket,
        [criterionKey]: rating,
      },
    },
  };
}
