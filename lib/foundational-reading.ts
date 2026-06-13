import type { Evaluation, PillarKey, Tier } from './evaluation';
import type { Relation } from '../store/useRelationsStore';

export type ReadingStatus = 'Read' | 'Unread';

export type FoundationalReadingDerived = {
  relation: Relation;
  hasFoundationalReading: boolean;
  foundationalEvaluation: Evaluation | null;
  foundationalScore: number | null;
  linkTier: Tier | null;
  readingStatus: ReadingStatus;
  toNurture: boolean;
  strongestPillar: PillarKey | null;
  weakestPillar: PillarKey | null;
  recentDate: string;
  badgeLabel: string;
  pillarDots: Record<PillarKey, boolean[]> | null;
};

export type GardenMicroSignal = {
  text: string;
  tone: 'unread' | 'nurture' | 'stable';
};

const NURTURE_THRESHOLD = 60;
const DOT_STEPS = [1, 2, 3, 4, 5] as const;
const PILLAR_ORDER: PillarKey[] = [
  'trust',
  'interactions',
  'affinity',
  'support',
  'sharedNetwork',
];

const PILLAR_LABELS: Record<PillarKey, string> = {
  trust: 'Trust',
  interactions: 'Interactions',
  affinity: 'Affinity',
  support: 'Support',
  sharedNetwork: 'Shared network',
};

const TIER_NARRATIVES: Record<Tier, string> = {
  Rooted: 'This link feels rooted, shaped by time, trust, and repeated evidence.',
  Anchor: 'This link feels like a stable point of trust, with presence that can be counted on.',
  Steady: 'This link feels steady today, with enough presence to create a clearer shared direction.',
  Active: 'This link has active movement today. Its shape is becoming easier to read.',
  Forming: 'This link is still finding its form. More shared moments could make its direction clearer.',
  Distant: 'This link feels distant today, and could be rebuilt through gentle attention.',
};

// Fallback narratives used when the link is balanced enough that no single
// pillar stands out as weakest. Preserves the warm tone of the canonical
// narratives without injecting a placeholder ("-") that would feel evaluative.
// Post Sprint V.1: narratives no longer carry %s substitution; the fallback
// table mirrors the canonical narratives so the function path stays sound
// even though the substitution branch is no longer triggered.
const TIER_NARRATIVES_NO_PILLAR: Record<Tier, string> = {
  Rooted: TIER_NARRATIVES.Rooted,
  Anchor: TIER_NARRATIVES.Anchor,
  Steady: TIER_NARRATIVES.Steady,
  Active: TIER_NARRATIVES.Active,
  Forming: TIER_NARRATIVES.Forming,
  Distant: TIER_NARRATIVES.Distant,
};

const GROWTH_SUGGESTIONS: Record<PillarKey, string> = {
  trust: 'Create one small act of reliable follow-through this week.',
  interactions: 'Create more regular touchpoints around this link.',
  affinity: 'Make space for one more natural, unforced conversation.',
  support: 'Find one concrete way to show up for this person.',
  sharedNetwork: 'Introduce more shared context around this link.',
};

function getLatestEvaluationByRelation(evaluations: Evaluation[]): Map<string, Evaluation> {
  const byRelation = new Map<string, Evaluation>();
  for (const evaluation of evaluations) {
    const existing = byRelation.get(evaluation.relationId);
    if (!existing || evaluation.createdAt > existing.createdAt) {
      byRelation.set(evaluation.relationId, evaluation);
    }
  }
  return byRelation;
}

/**
 * Honestly derives the strongest and weakest pillar of an evaluation.
 *
 * Doctrine:
 *   - Never returns a pillar that is also returned for the other slot.
 *     If a single value covers every pillar (all equal), both slots are null.
 *   - If multiple pillars are tied at the top, no single one is "the
 *     strongest" — the slot returns null. Same rule for the bottom.
 *   - The function never invents a strong or weak point when the evaluation
 *     cannot honestly support one. Callers should hide the corresponding
 *     "Where it's strong / can grow" line when null.
 *
 * Exported so the doctrine can be tested directly (pure helper).
 */
export function getStrongestAndWeakestPillars(
  evaluation: Evaluation | null,
): { strongestPillar: PillarKey | null; weakestPillar: PillarKey | null } {
  if (!evaluation) {
    return { strongestPillar: null, weakestPillar: null };
  }

  // Single pass to find max and min values.
  let maxValue = evaluation.ratings[PILLAR_ORDER[0]];
  let minValue = evaluation.ratings[PILLAR_ORDER[0]];
  for (const key of PILLAR_ORDER) {
    const value = evaluation.ratings[key];
    if (value > maxValue) maxValue = value;
    if (value < minValue) minValue = value;
  }

  // All pillars carry the same rating → no honest strong or weak signal.
  if (maxValue === minValue) {
    return { strongestPillar: null, weakestPillar: null };
  }

  // Count occurrences and capture the first key hitting max/min.
  // PILLAR_ORDER iteration is stable, so "first" is deterministic.
  let maxCount = 0;
  let minCount = 0;
  let firstMax: PillarKey | null = null;
  let firstMin: PillarKey | null = null;
  for (const key of PILLAR_ORDER) {
    const value = evaluation.ratings[key];
    if (value === maxValue) {
      maxCount += 1;
      if (firstMax === null) firstMax = key;
    }
    if (value === minValue) {
      minCount += 1;
      if (firstMin === null) firstMin = key;
    }
  }

  // Strict uniqueness: only return a pillar when nothing else ties it.
  const strongestPillar = maxCount === 1 ? firstMax : null;
  const weakestPillar = minCount === 1 ? firstMin : null;

  return { strongestPillar, weakestPillar };
}

function getPillarDots(evaluation: Evaluation | null): Record<PillarKey, boolean[]> | null {
  if (!evaluation) {
    return null;
  }

  return {
    trust: DOT_STEPS.map((step) => step <= evaluation.ratings.trust),
    interactions: DOT_STEPS.map((step) => step <= evaluation.ratings.interactions),
    affinity: DOT_STEPS.map((step) => step <= evaluation.ratings.affinity),
    support: DOT_STEPS.map((step) => step <= evaluation.ratings.support),
    sharedNetwork: DOT_STEPS.map((step) => step <= evaluation.ratings.sharedNetwork),
  };
}

function buildDerived(
  relation: Relation,
  latestEvaluation: Evaluation | null,
): FoundationalReadingDerived {
  const hasFoundationalReading = latestEvaluation !== null;
  const foundationalScore = latestEvaluation?.score ?? null;
  const linkTier = latestEvaluation?.tier ?? null;
  const readingStatus: ReadingStatus = hasFoundationalReading ? 'Read' : 'Unread';
  const toNurture =
    hasFoundationalReading && foundationalScore !== null && foundationalScore < NURTURE_THRESHOLD;
  const recentDate = latestEvaluation?.createdAt ?? relation.createdAt;
  const badgeLabel = linkTier ?? 'Unread';
  const pillarDots = getPillarDots(latestEvaluation);
  const { strongestPillar, weakestPillar } = getStrongestAndWeakestPillars(latestEvaluation);

  return {
    relation,
    hasFoundationalReading,
    foundationalEvaluation: latestEvaluation,
    foundationalScore,
    linkTier,
    readingStatus,
    toNurture,
    strongestPillar,
    weakestPillar,
    recentDate,
    badgeLabel,
    pillarDots,
  };
}

export function getFoundationalReadingForRelation(
  relation: Relation,
  evaluations: Evaluation[],
): FoundationalReadingDerived {
  const latestEvaluation = getLatestEvaluationByRelation(evaluations).get(relation.id) ?? null;
  return buildDerived(relation, latestEvaluation);
}

export function getFoundationalReadings(
  relations: Relation[],
  evaluations: Evaluation[],
): FoundationalReadingDerived[] {
  const latestByRelation = getLatestEvaluationByRelation(evaluations);
  return relations.map((relation) => buildDerived(relation, latestByRelation.get(relation.id) ?? null));
}

export function getPillarLabel(pillar: PillarKey | null): string {
  if (!pillar) return '-';
  return PILLAR_LABELS[pillar];
}

export function getTierNarrative(
  tier: Tier | null,
  weakestPillar: PillarKey | null,
): string {
  if (!tier) return 'No foundational reading yet.';
  const base = TIER_NARRATIVES[tier];
  if (!base.includes('%s')) return base;
  // When no pillar is honestly weakest, swap to a balanced fallback narrative
  // instead of substituting the placeholder "-" (which used to leak through).
  if (!weakestPillar) return TIER_NARRATIVES_NO_PILLAR[tier];
  return base.replace('%s', getPillarLabel(weakestPillar).toLowerCase());
}

export function getGrowthSuggestion(
  weakestPillar: PillarKey | null,
  tier: Tier | null,
): string {
  if (!weakestPillar) {
    return tier === 'Rooted'
      ? 'Keep this link warm with one intentional touchpoint this week.'
      : 'Keep nurturing this link through one intentional touchpoint this week.';
  }
  return GROWTH_SUGGESTIONS[weakestPillar];
}

export function getGardenMicroSignal(
  reading: FoundationalReadingDerived,
): GardenMicroSignal {
  if (!reading.hasFoundationalReading) {
    return { text: 'Unread', tone: 'unread' };
  }

  if (reading.toNurture) {
    return { text: 'To nurture', tone: 'nurture' };
  }

  if (reading.strongestPillar === 'trust') {
    return { text: 'Strong trust', tone: 'stable' };
  }
  if (reading.weakestPillar === 'sharedNetwork') {
    return { text: 'Watch shared network', tone: 'stable' };
  }
  if (reading.weakestPillar === 'interactions') {
    return { text: 'Watch interactions', tone: 'stable' };
  }

  return { text: 'Steady link', tone: 'stable' };
}
