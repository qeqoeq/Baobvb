import { describe, it, expect } from 'vitest';

import {
  computeMutualRelationshipScore,
  computeScore,
  getMutualTier,
  getTier,
  type PillarKey,
  type PillarRating,
} from './evaluation';

const ALL_ONES: Record<PillarKey, PillarRating> = {
  trust: 1, interactions: 1, affinity: 1, support: 1, sharedNetwork: 1,
};
const ALL_THREES: Record<PillarKey, PillarRating> = {
  trust: 3, interactions: 3, affinity: 3, support: 3, sharedNetwork: 3,
};
const ALL_FIVES: Record<PillarKey, PillarRating> = {
  trust: 5, interactions: 5, affinity: 5, support: 5, sharedNetwork: 5,
};

// ── getTier (private reading) ───────────────────────────────────────────────
// Thresholds: Ghost<25, Spark<40, Thrill<55, Vibrant<70, Anchor<85, Legend

describe('getTier', () => {
  it('Ghost: score 0', () => expect(getTier(0)).toBe('Ghost'));
  it('Ghost: score 24', () => expect(getTier(24)).toBe('Ghost'));
  it('Spark: score 25', () => expect(getTier(25)).toBe('Spark'));
  it('Spark: score 39', () => expect(getTier(39)).toBe('Spark'));
  it('Thrill: score 40', () => expect(getTier(40)).toBe('Thrill'));
  it('Thrill: score 54', () => expect(getTier(54)).toBe('Thrill'));
  it('Vibrant: score 55', () => expect(getTier(55)).toBe('Vibrant'));
  it('Vibrant: score 69', () => expect(getTier(69)).toBe('Vibrant'));
  it('Anchor: score 70', () => expect(getTier(70)).toBe('Anchor'));
  it('Anchor: score 84', () => expect(getTier(84)).toBe('Anchor'));
  it('Legend: score 85', () => expect(getTier(85)).toBe('Legend'));
  it('Legend: score 100', () => expect(getTier(100)).toBe('Legend'));
});

// ── getMutualTier (mutual reveal — different thresholds) ────────────────────
// Thresholds: Ghost<35, Spark<50, Thrill<65, Vibrant<79, Anchor<90, Legend

describe('getMutualTier', () => {
  it('Ghost: score 0', () => expect(getMutualTier(0)).toBe('Ghost'));
  it('Ghost: score 34', () => expect(getMutualTier(34)).toBe('Ghost'));
  it('Spark: score 35', () => expect(getMutualTier(35)).toBe('Spark'));
  it('Spark: score 49', () => expect(getMutualTier(49)).toBe('Spark'));
  it('Thrill: score 50', () => expect(getMutualTier(50)).toBe('Thrill'));
  it('Thrill: score 64', () => expect(getMutualTier(64)).toBe('Thrill'));
  it('Vibrant: score 65', () => expect(getMutualTier(65)).toBe('Vibrant'));
  it('Vibrant: score 78', () => expect(getMutualTier(78)).toBe('Vibrant'));
  it('Anchor: score 79', () => expect(getMutualTier(79)).toBe('Anchor'));
  it('Anchor: score 89', () => expect(getMutualTier(89)).toBe('Anchor'));
  it('Legend: score 90', () => expect(getMutualTier(90)).toBe('Legend'));
  it('Legend: score 100', () => expect(getMutualTier(100)).toBe('Legend'));
});

// ── computeScore (private weighted sum) ────────────────────────────────────

describe('computeScore', () => {
  it('all ratings 1 → score 0', () => {
    expect(computeScore(ALL_ONES)).toBe(0);
  });

  it('all ratings 3 → score 50 (all pillars at midpoint)', () => {
    // PRIVATE_RATING_TO_SCORE[3] = 50, weights sum to 1.0 → 50 × 1.0 = 50
    expect(computeScore(ALL_THREES)).toBe(50);
  });

  it('all ratings 5 → score 100 (max)', () => {
    expect(computeScore(ALL_FIVES)).toBe(100);
  });
});

// ── computeMutualRelationshipScore — cap rules ──────────────────────────────
// These caps are the non-obvious constraints in the mutual score model.

describe('computeMutualRelationshipScore', () => {
  it('perfect mutual: both sides all 5s → score 96 and Legend tier', () => {
    const result = computeMutualRelationshipScore(ALL_FIVES, ALL_FIVES);
    expect(result.finalScore).toBe(96);
    expect(result.tier).toBe('Legend');
  });

  it('trust cap: sideA trust=1 forces finalScore ≤ 59 regardless of other pillars', () => {
    // Without cap, raw score ≈ 61 (high mutual base from strong support/affinity etc.)
    // The trust≤2 rule hard-caps the ceiling at 59.
    const sideA: Record<PillarKey, PillarRating> = {
      trust: 1, interactions: 5, affinity: 5, support: 5, sharedNetwork: 5,
    };
    const result = computeMutualRelationshipScore(sideA, ALL_FIVES);
    expect(result.finalScore).toBe(59);
    expect(result.tier).toBe('Thrill');
  });

  it('support cap: sideA support=1 forces finalScore ≤ 64', () => {
    // Without cap, raw score ≈ 77. The support≤2 rule hard-caps at 64.
    const sideA: Record<PillarKey, PillarRating> = {
      trust: 5, interactions: 5, affinity: 5, support: 1, sharedNetwork: 5,
    };
    const result = computeMutualRelationshipScore(sideA, ALL_FIVES);
    expect(result.finalScore).toBe(64);
    expect(result.tier).toBe('Thrill');
  });
});
