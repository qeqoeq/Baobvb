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

const PILLAR_WEIGHTS: Record<PillarKey, number> = {
  trust: 0.30,
  interactions: 0.25,
  affinity: 0.20,
  support: 0.15,
  sharedNetwork: 0.10,
};

const RATING_TO_SCORE: Record<PillarRating, number> = {
  1: 0,
  2: 25,
  3: 50,
  4: 75,
  5: 100,
};

export function computeScore(ratings: Record<PillarKey, PillarRating>): number {
  let score = 0;
  for (const key of Object.keys(PILLAR_WEIGHTS) as PillarKey[]) {
    score += RATING_TO_SCORE[ratings[key]] * PILLAR_WEIGHTS[key];
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
