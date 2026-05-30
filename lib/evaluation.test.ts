import { describe, it, expect } from 'vitest';

import {
  computeMutualRelationshipScore,
  computePrivateLinkScore,
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

  // computeScore is intentionally kept raw (no Trust gate) for historical parity
  // and for callers that need the bare weighted sum.
  // The trust-gated private score lives in computePrivateLinkScore.
  //
  // Inputs: trust=2 (low) + interactions/affinity/support/sharedNetwork=5.
  // With PRIVATE_RATING_TO_SCORE[2]=25, [5]=100 and weights
  // {trust:0.30, interactions:0.25, affinity:0.20, support:0.15, sharedNetwork:0.10},
  // raw = 25*0.30 + 100*0.25 + 100*0.20 + 100*0.15 + 100*0.10 = 77.5 → round = 78.
  it('computeScore stays raw: trust=2 + other pillars=5 → score=78 (no gate, historical baseline)', () => {
    const ratings: Record<PillarKey, PillarRating> = {
      trust: 2, interactions: 5, affinity: 5, support: 5, sharedNetwork: 5,
    };
    const score = computeScore(ratings);
    expect(score).toBe(78);
    expect(getTier(score)).toBe('Anchor');
  });
});

// ── computePrivateLinkScore — Trust gate ────────────────────────────────────
// Non-negotiable: Trust is a gate, not a weighted pillar.
// Affinity / Support / Interactions / SharedNetwork cannot lift a low-trust link
// out of the bands they would otherwise reach.

describe('computePrivateLinkScore — Trust gate', () => {
  it('trust=1 + all other pillars=5 → score ≤ 39 (cannot leave Spark band)', () => {
    const ratings: Record<PillarKey, PillarRating> = {
      trust: 1, interactions: 5, affinity: 5, support: 5, sharedNetwork: 5,
    };
    const score = computePrivateLinkScore(ratings);
    expect(score).toBeLessThanOrEqual(39);
  });

  it('trust=2 + all other pillars=5 → score ≤ 59 (cannot enter Vibrant band)', () => {
    const ratings: Record<PillarKey, PillarRating> = {
      trust: 2, interactions: 5, affinity: 5, support: 5, sharedNetwork: 5,
    };
    const score = computePrivateLinkScore(ratings);
    expect(score).toBeLessThanOrEqual(59);
  });

  it('trust=3 + all other pillars=5 → score > 59 (cap inactive at the boundary)', () => {
    const ratings: Record<PillarKey, PillarRating> = {
      trust: 3, interactions: 5, affinity: 5, support: 5, sharedNetwork: 5,
    };
    const score = computePrivateLinkScore(ratings);
    expect(score).toBeGreaterThan(59);
  });

  it('trust=5 + all other pillars=5 → score === 100 (cap is the only ceiling at the top)', () => {
    expect(computePrivateLinkScore(ALL_FIVES)).toBe(100);
  });

  it('trust=1, every other rating 1..5 → never exceeds 39 (Affinity/Support cannot compensate)', () => {
    for (let v = 1; v <= 5; v++) {
      const rating = v as PillarRating;
      const ratings: Record<PillarKey, PillarRating> = {
        trust: 1, interactions: rating, affinity: rating, support: rating, sharedNetwork: rating,
      };
      expect(
        computePrivateLinkScore(ratings),
        `trust=1, others=${v}`,
      ).toBeLessThanOrEqual(39);
    }
  });

  it('trust=2, every other rating 1..5 → never exceeds 59', () => {
    for (let v = 1; v <= 5; v++) {
      const rating = v as PillarRating;
      const ratings: Record<PillarKey, PillarRating> = {
        trust: 2, interactions: rating, affinity: rating, support: rating, sharedNetwork: rating,
      };
      expect(
        computePrivateLinkScore(ratings),
        `trust=2, others=${v}`,
      ).toBeLessThanOrEqual(59);
    }
  });

  it('trust=3 leaves the raw computeScore unchanged', () => {
    const ratings: Record<PillarKey, PillarRating> = {
      trust: 3, interactions: 4, affinity: 3, support: 5, sharedNetwork: 2,
    };
    expect(computePrivateLinkScore(ratings)).toBe(computeScore(ratings));
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

  // ── Trust gate — explicit invariants at the trust≤2 boundary ─────────────
  // These tests fix the contract Trust acts as a gate, not as a weighted pillar.
  // They protect the TS parity layer that mirrors the SQL compute_shared_mutual_result.
  //
  // Trust=2 is the boundary itself: the rule is "trust ≤ 2 caps the final score at 59",
  // so both trust=1 and trust=2 must yield the same ceiling.

  it('trust gate: sideA trust=2 + everything else 5 → finalScore ≤ 59 (cap active at the boundary)', () => {
    const sideA: Record<PillarKey, PillarRating> = {
      trust: 2, interactions: 5, affinity: 5, support: 5, sharedNetwork: 5,
    };
    const result = computeMutualRelationshipScore(sideA, ALL_FIVES);
    expect(result.finalScore).toBeLessThanOrEqual(59);
  });

  it('trust gate: both sides trust=2 + everything else 5 → finalScore ≤ 59', () => {
    const sideA: Record<PillarKey, PillarRating> = {
      trust: 2, interactions: 5, affinity: 5, support: 5, sharedNetwork: 5,
    };
    const sideB: Record<PillarKey, PillarRating> = {
      trust: 2, interactions: 5, affinity: 5, support: 5, sharedNetwork: 5,
    };
    const result = computeMutualRelationshipScore(sideA, sideB);
    expect(result.finalScore).toBeLessThanOrEqual(59);
  });

  it('trust gate: both sides trust=3 + everything else 5 → cap inactive, finalScore > 59', () => {
    const sideA: Record<PillarKey, PillarRating> = {
      trust: 3, interactions: 5, affinity: 5, support: 5, sharedNetwork: 5,
    };
    const sideB: Record<PillarKey, PillarRating> = {
      trust: 3, interactions: 5, affinity: 5, support: 5, sharedNetwork: 5,
    };
    const result = computeMutualRelationshipScore(sideA, sideB);
    expect(result.finalScore).toBeGreaterThan(59);
  });
});
