export type PillarKey = 'trust' | 'interactions' | 'affinity' | 'support' | 'sharedNetwork';
export type PillarRating = 1 | 2 | 3 | 4 | 5;
export type Tier = 'Ghost' | 'Spark' | 'Thrill' | 'Vibrant' | 'Anchor' | 'Legend';

export type Evaluation = {
  id: string;
  relationId: string;
  ratings: Record<PillarKey, PillarRating>;
  score: number;
  tier: Tier;
  createdAt: string;
};

// Existing private-reading model (kept stable for current flows).
const PRIVATE_PILLAR_WEIGHTS: Record<PillarKey, number> = {
  trust: 0.30,
  interactions: 0.25,
  affinity: 0.20,
  support: 0.15,
  sharedNetwork: 0.10,
};

const PRIVATE_RATING_TO_SCORE: Record<PillarRating, number> = {
  1: 0,
  2: 25,
  3: 50,
  4: 75,
  5: 100,
};

// Mutual model (additive for future reveal flow).
const MUTUAL_PILLAR_WEIGHTS: Record<PillarKey, number> = {
  trust: 0.35,
  support: 0.20,
  interactions: 0.20,
  affinity: 0.15,
  sharedNetwork: 0.10,
};

const RATING_TO_MAPPED_VALUE: Record<PillarRating, number> = {
  1: 18,
  2: 41,
  3: 63,
  4: 82,
  5: 96,
};

const MAX_PILLAR_GAP = RATING_TO_MAPPED_VALUE[5] - RATING_TO_MAPPED_VALUE[1];
const MAX_SIGNATURE_BONUS = 4;

const GAP_PENALTY_WEIGHTS: Record<PillarKey, number> = {
  trust: 0.40,
  support: 0.22,
  interactions: 0.20,
  affinity: 0.12,
  sharedNetwork: 0.06,
};

const GAP_EXPONENTS: Record<PillarKey, number> = {
  trust: 1.7,
  support: 1.45,
  interactions: 1.3,
  affinity: 1.15,
  sharedNetwork: 1.05,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function mapPillarValue(value: PillarRating): number {
  return RATING_TO_MAPPED_VALUE[value];
}

export function computeSideScore(ratings: Record<PillarKey, PillarRating>): number {
  let score = 0;
  for (const key of Object.keys(MUTUAL_PILLAR_WEIGHTS) as PillarKey[]) {
    score += mapPillarValue(ratings[key]) * MUTUAL_PILLAR_WEIGHTS[key];
  }
  return clamp(score, 0, 100);
}

export function computeGapPenalty(
  ratingsA: Record<PillarKey, PillarRating>,
  ratingsB: Record<PillarKey, PillarRating>,
): number {
  let penaltyRatio = 0;
  for (const key of Object.keys(GAP_PENALTY_WEIGHTS) as PillarKey[]) {
    const pillarGap = Math.abs(mapPillarValue(ratingsA[key]) - mapPillarValue(ratingsB[key]));
    const normalizedGap = pillarGap / MAX_PILLAR_GAP;
    penaltyRatio += Math.pow(normalizedGap, GAP_EXPONENTS[key]) * GAP_PENALTY_WEIGHTS[key];
  }

  return penaltyRatio * 28;
}

export function computeCriticalPenalty(
  ratingsA: Record<PillarKey, PillarRating>,
  ratingsB: Record<PillarKey, PillarRating>,
): number {
  let penalty = 0;

  if (ratingsA.trust <= 2 || ratingsB.trust <= 2) penalty += 9;
  if (ratingsA.support <= 2 || ratingsB.support <= 2) penalty += 5;
  if (ratingsA.interactions <= 2 && ratingsB.interactions <= 2) penalty += 4;
  if (
    (ratingsA.trust <= 2 && ratingsA.support <= 2) ||
    (ratingsB.trust <= 2 && ratingsB.support <= 2)
  ) {
    penalty += 6;
  }

  return penalty;
}

export function computeSignatureBonus(
  _ratingsA: Record<PillarKey, PillarRating>,
  _ratingsB: Record<PillarKey, PillarRating>,
): number {
  // Intentionally conservative until reveal rules are fully locked.
  // TODO: Replace with a validated signature policy (max +4).
  return 0;
}

export type MutualScoreBreakdown = {
  sideScoreA: number;
  sideScoreB: number;
  mutualBase: number;
  gapPenalty: number;
  criticalPenalty: number;
  signatureBonus: number;
  finalScore: number;
  tier: Tier;
};

export function getMutualTier(score: number): Tier {
  if (score >= 90) return 'Legend';
  if (score >= 79) return 'Anchor';
  if (score >= 65) return 'Vibrant';
  if (score >= 50) return 'Thrill';
  if (score >= 35) return 'Spark';
  return 'Ghost';
}

export function computeMutualRelationshipScore(
  ratingsA: Record<PillarKey, PillarRating>,
  ratingsB: Record<PillarKey, PillarRating>,
): MutualScoreBreakdown {
  const sideScoreA = computeSideScore(ratingsA);
  const sideScoreB = computeSideScore(ratingsB);
  const mutualBase = Math.sqrt(sideScoreA * sideScoreB);
  const gapPenalty = computeGapPenalty(ratingsA, ratingsB);
  const criticalPenalty = computeCriticalPenalty(ratingsA, ratingsB);
  const signatureBonus = computeSignatureBonus(ratingsA, ratingsB);
  let finalScoreRaw = mutualBase - gapPenalty - criticalPenalty + signatureBonus;

  if (ratingsA.trust <= 2 || ratingsB.trust <= 2) {
    finalScoreRaw = Math.min(finalScoreRaw, 59);
  }
  if (ratingsA.support <= 2 || ratingsB.support <= 2) {
    finalScoreRaw = Math.min(finalScoreRaw, 64);
  }
  if (ratingsA.interactions <= 2 && ratingsB.interactions <= 2) {
    finalScoreRaw = Math.min(finalScoreRaw, 63);
  }

  const finalScore = Math.round(clamp(finalScoreRaw, 0, 100));

  return {
    sideScoreA,
    sideScoreB,
    mutualBase,
    gapPenalty,
    criticalPenalty,
    signatureBonus,
    finalScore,
    tier: getMutualTier(finalScore),
  };
}

// Private reading score: keep behavior stable for existing app flows.
export function computeScore(ratings: Record<PillarKey, PillarRating>): number {
  let score = 0;
  for (const key of Object.keys(PRIVATE_PILLAR_WEIGHTS) as PillarKey[]) {
    score += PRIVATE_RATING_TO_SCORE[ratings[key]] * PRIVATE_PILLAR_WEIGHTS[key];
  }
  return Math.round(score);
}

export function getTier(score: number): Tier {
  if (score >= 85) return 'Legend';
  if (score >= 70) return 'Anchor';
  if (score >= 55) return 'Vibrant';
  if (score >= 40) return 'Thrill';
  if (score >= 25) return 'Spark';
  return 'Ghost';
}

const TIER_ACCENTS: Record<Tier, string> = {
  Legend: '#E8B87A',
  Anchor: '#2A7C7C',
  Vibrant: '#7A9E7E',
  Thrill: '#B07282',
  Spark: '#C8956C',
  Ghost: '#5C5851',
};

export function getTierAccent(tier: Tier): string {
  return TIER_ACCENTS[tier];
}
