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
  Legend: 'This link feels exceptional, deeply rooted, and consistently strong.',
  Anchor: 'This link feels grounded and reliable, with strong long-term potential.',
  Vibrant: 'This link feels vibrant and already grounded, with room to grow through %s.',
  Thrill: 'This link feels alive and promising, but it still needs steadier roots in %s.',
  Spark: 'This link is emerging and meaningful, and can grow with more %s.',
  Ghost: 'This link feels distant today, and could be rebuilt through gentle %s.',
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

function getStrongestAndWeakestPillars(
  evaluation: Evaluation | null,
): { strongestPillar: PillarKey | null; weakestPillar: PillarKey | null } {
  if (!evaluation) {
    return { strongestPillar: null, weakestPillar: null };
  }

  let strongestPillar = PILLAR_ORDER[0];
  let weakestPillar = PILLAR_ORDER[0];
  let strongestValue = evaluation.ratings[strongestPillar];
  let weakestValue = evaluation.ratings[weakestPillar];

  for (const key of PILLAR_ORDER) {
    const value = evaluation.ratings[key];
    if (value > strongestValue) {
      strongestPillar = key;
      strongestValue = value;
    }
    if (value < weakestValue) {
      weakestPillar = key;
      weakestValue = value;
    }
  }

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
  const weakestLabel = getPillarLabel(weakestPillar).toLowerCase();
  return base.includes('%s') ? base.replace('%s', weakestLabel) : base;
}
