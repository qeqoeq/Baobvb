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
  { key: 'reliability', pillar: 'trust', label: 'Reliability', hint: 'Do they keep their word when it matters?' },
  { key: 'discretion', pillar: 'trust', label: 'Discretion', hint: 'Can private things stay private with them?' },
  { key: 'boundaryRespect', pillar: 'trust', label: 'Boundary respect', hint: 'Do they respect your limits without pressure?' },
  { key: 'repairCapacity', pillar: 'trust', label: 'Repair capacity', hint: 'Can the link recover after tension?' },
  { key: 'consistency', pillar: 'trust', label: 'Consistency', hint: 'Does trust hold over time?' },
];

const INTERACTIONS_CRITERIA: ReadonlyArray<ProgressiveCriterion> = [
  { key: 'exchangeQuality', pillar: 'interactions', label: 'Quality of exchange', hint: 'Do your exchanges feel clear and meaningful?' },
  { key: 'initiativeBalance', pillar: 'interactions', label: 'Initiative balance', hint: 'Do both sides naturally make effort?' },
  { key: 'attention', pillar: 'interactions', label: 'Shared attention', hint: 'Do they feel present when you connect?' },
  { key: 'conversationDepth', pillar: 'interactions', label: 'Conversation depth', hint: 'Can conversations go beyond the surface?' },
];

const AFFINITY_CRITERIA: ReadonlyArray<ProgressiveCriterion> = [
  { key: 'ease', pillar: 'affinity', label: 'Ease', hint: 'Does being together feel natural?' },
  { key: 'humor', pillar: 'affinity', label: 'Humor', hint: 'Do you laugh or lighten each other naturally?' },
  { key: 'sharedRhythm', pillar: 'affinity', label: 'Shared rhythm', hint: 'Does the connection have an easy rhythm?' },
  { key: 'emotionalComfort', pillar: 'affinity', label: 'Emotional comfort', hint: 'Do you feel emotionally relaxed around them?' },
];

const SUPPORT_CRITERIA: ReadonlyArray<ProgressiveCriterion> = [
  { key: 'availability', pillar: 'support', label: 'Availability', hint: 'Are they present when support matters?' },
  { key: 'emotionalPresence', pillar: 'support', label: 'Emotional presence', hint: 'Do they make space for what you feel?' },
  { key: 'practicalHelp', pillar: 'support', label: 'Practical help', hint: 'Can they help concretely when needed?' },
  { key: 'encouragement', pillar: 'support', label: 'Encouragement', hint: 'Do they help you feel stronger, not smaller?' },
];

const SHARED_NETWORK_CRITERIA: ReadonlyArray<ProgressiveCriterion> = [
  { key: 'mutualCircles', pillar: 'sharedNetwork', label: 'Mutual circles', hint: 'Do you share trusted people or contexts?' },
  { key: 'introductionSafety', pillar: 'sharedNetwork', label: 'Introduction safety', hint: 'Would an introduction through this link feel safe?' },
  { key: 'contextReliability', pillar: 'sharedNetwork', label: 'Context reliability', hint: 'Is this link reliable in shared settings?' },
  { key: 'trustedPathStrength', pillar: 'sharedNetwork', label: 'Trusted path strength', hint: 'Does this link make paths feel safer?' },
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
