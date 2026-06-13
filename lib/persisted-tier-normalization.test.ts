import { describe, it, expect } from 'vitest';

import type { Evaluation, PillarKey, PillarRating } from './evaluation';
import {
  normalizePersistedEvaluationTier,
  normalizePersistedRevealSnapshotTier,
} from './persisted-tier-normalization';

const COMPLETE_RATINGS: Record<PillarKey, PillarRating> = {
  trust: 3,
  interactions: 3,
  affinity: 3,
  support: 3,
  sharedNetwork: 3,
};

function buildEvaluation(
  overrides: Partial<Evaluation> & { score: number; tier: Evaluation['tier'] },
): Evaluation {
  return {
    id: 'eval-test',
    relationId: 'rel-test',
    ratings: COMPLETE_RATINGS,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── normalizePersistedEvaluationTier ────────────────────────────────────────
// Doctrine: score is the canonical truth; tier is a pure derivation.
// Legacy strings ('Ghost'/'Spark'/'Thrill'/'Vibrant'/'Legend') are TypeScript-
// erased at runtime and could survive in AsyncStorage from pre Sprint V.1
// installs. The helper must re-derive tier from score on hydration.

describe('normalizePersistedEvaluationTier', () => {
  it('legacy persisted evaluation: tier "Ghost" + low score → tier "Distant"', () => {
    // getTier(10) is in the Distant band (<25 for private reading).
    // The legacy 'Ghost' label is type-erased at runtime but matches the
    // pre-V.1 lexicon — must be replaced with the current Distant label.
    const input = buildEvaluation({ score: 10, tier: 'Ghost' as unknown as Evaluation['tier'] });
    const result = normalizePersistedEvaluationTier(input);
    expect(result.tier).toBe('Distant');
    expect(result.score).toBe(10);
  });

  it('idempotent: tier "Distant" + low score → tier "Distant"', () => {
    const input = buildEvaluation({ score: 10, tier: 'Distant' });
    const result = normalizePersistedEvaluationTier(input);
    expect(result.tier).toBe('Distant');
  });

  it('inconsistent: tier "Rooted" + low score → tier "Distant" (score wins)', () => {
    // The score is the canonical truth. A mismatched tier (whether legacy or
    // accidentally inconsistent) must be corrected from the numerical truth.
    const input = buildEvaluation({ score: 10, tier: 'Rooted' });
    const result = normalizePersistedEvaluationTier(input);
    expect(result.tier).toBe('Distant');
  });

  it('legacy "Legend" + Rooted-band score → tier "Rooted"', () => {
    // Mapping that comes naturally from re-derivation rather than a manual
    // table: high score still maps to the top tier, but under the new label.
    const input = buildEvaluation({
      score: 95,
      tier: 'Legend' as unknown as Evaluation['tier'],
    });
    const result = normalizePersistedEvaluationTier(input);
    expect(result.tier).toBe('Rooted');
  });

  it('legacy "Spark" + Forming-band score → tier "Forming"', () => {
    const input = buildEvaluation({
      score: 30,
      tier: 'Spark' as unknown as Evaluation['tier'],
    });
    const result = normalizePersistedEvaluationTier(input);
    expect(result.tier).toBe('Forming');
  });

  it('does not mutate the input evaluation (returns a new object)', () => {
    const input = buildEvaluation({ score: 10, tier: 'Ghost' as unknown as Evaluation['tier'] });
    const result = normalizePersistedEvaluationTier(input);
    expect(result).not.toBe(input);
    // The original carrier still carries its legacy value; the helper is pure.
    expect(input.tier).toBe('Ghost');
  });

  it('preserves untouched fields (id, relationId, ratings, createdAt)', () => {
    const input = buildEvaluation({
      score: 10,
      tier: 'Ghost' as unknown as Evaluation['tier'],
      id: 'eval-keep',
      relationId: 'rel-keep',
      createdAt: '2025-11-30T00:00:00.000Z',
    });
    const result = normalizePersistedEvaluationTier(input);
    expect(result.id).toBe('eval-keep');
    expect(result.relationId).toBe('rel-keep');
    expect(result.createdAt).toBe('2025-11-30T00:00:00.000Z');
    expect(result.ratings).toBe(input.ratings);
  });

  it('non-finite score is returned untouched (defensive)', () => {
    const input = buildEvaluation({
      score: Number.NaN as unknown as number,
      tier: 'Distant',
    });
    const result = normalizePersistedEvaluationTier(input);
    // Defensive contract: NaN score → no re-derivation (we don't know the band).
    expect(result.tier).toBe('Distant');
  });
});

// ── normalizePersistedRevealSnapshotTier ─────────────────────────────────────
// Doctrine: mutualScore is the canonical truth for revealed snapshots.
// A legacy persisted tier string is only trusted when mutualScore is missing
// AND the raw value matches the current vocabulary.

describe('normalizePersistedRevealSnapshotTier', () => {
  it('legacy "Legend" + Rooted-band mutualScore → "Rooted"', () => {
    // getMutualTier(92) is in the Rooted band (>=90 for mutual reveal).
    const result = normalizePersistedRevealSnapshotTier('Legend', 92);
    expect(result).toBe('Rooted');
  });

  it('inconsistent "Rooted" tier + Distant-band mutualScore → "Distant" (mutualScore wins)', () => {
    // mutualScore is the truth. A tier-string that disagrees with the score
    // must yield to the score-derived tier.
    const result = normalizePersistedRevealSnapshotTier('Rooted', 20);
    expect(result).toBe('Distant');
  });

  it('idempotent: "Rooted" + Rooted-band mutualScore → "Rooted"', () => {
    const result = normalizePersistedRevealSnapshotTier('Rooted', 95);
    expect(result).toBe('Rooted');
  });

  it('valid current tier + no mutualScore → trusts rawTier', () => {
    // Defensive fallback path for snapshots where the server hasn't
    // surfaced mutualScore yet but the tier label is in the current vocabulary.
    const result = normalizePersistedRevealSnapshotTier('Steady', undefined);
    expect(result).toBe('Steady');
  });

  it('legacy "Ghost" + no mutualScore → undefined (strip legacy)', () => {
    // Without a numerical truth to re-derive from, a legacy label is stripped
    // rather than surfaced. The UI then falls back to the safe "Shared reading"
    // tier display per the existing helper contract.
    const result = normalizePersistedRevealSnapshotTier('Ghost', undefined);
    expect(result).toBeUndefined();
  });

  it('unknown string + no mutualScore → undefined', () => {
    // Defensive: any non-whitelisted tier string is stripped.
    const result = normalizePersistedRevealSnapshotTier('Bogus', undefined);
    expect(result).toBeUndefined();
  });

  it('non-finite mutualScore + valid rawTier → falls back to rawTier', () => {
    const result = normalizePersistedRevealSnapshotTier('Anchor', Number.NaN);
    expect(result).toBe('Anchor');
  });

  it('undefined rawTier + valid mutualScore → derived from mutualScore', () => {
    // getMutualTier(82) is in the Anchor band (79-89 for mutual reveal).
    const result = normalizePersistedRevealSnapshotTier(undefined, 82);
    expect(result).toBe('Anchor');
  });

  it('null rawTier + no mutualScore → undefined', () => {
    const result = normalizePersistedRevealSnapshotTier(null, undefined);
    expect(result).toBeUndefined();
  });

  it('non-string non-null rawTier (e.g. number) + no mutualScore → undefined', () => {
    const result = normalizePersistedRevealSnapshotTier(42, undefined);
    expect(result).toBeUndefined();
  });
});
