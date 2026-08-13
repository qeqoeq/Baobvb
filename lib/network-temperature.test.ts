import { describe, it, expect } from 'vitest';

import { computeNetworkTemperature, type TemperatureRelation } from './network-temperature';

// Minimal relation shape — structurally compatible with the store Relation.
const rel = (status: string, mutualScore?: number | null): TemperatureRelation => ({
  localState: { revealSnapshot: { status, mutualScore } },
});

describe('computeNetworkTemperature', () => {
  // ── Mandatory edge cases ───────────────────────────────────────────────────
  it('empty network → neutral 0.5, NOT zero (empty is not cold)', () => {
    expect(computeNetworkTemperature([])).toBe(0.5);
  });

  it('only non-revealed relations → ignored → still neutral 0.5', () => {
    const t = computeNetworkTemperature([
      rel('reveal_ready', undefined),
      rel('waiting_other_side'),
      rel('cooking_reveal'),
    ]);
    expect(t).toBe(0.5);
  });

  it('a single relation never produces an extreme (0 or 1)', () => {
    const high = computeNetworkTemperature([rel('revealed', 100)]);
    const low = computeNetworkTemperature([rel('revealed', 0)]);
    expect(high).toBeGreaterThan(0.5);
    expect(high).toBeLessThan(1);
    expect(low).toBeLessThan(0.5);
    expect(low).toBeGreaterThan(0);
    // exact: (1 + 2*0.5)/(1+2)=0.667 ; (0 + 1)/3=0.333
    expect(high).toBeCloseTo(2 / 3, 5);
    expect(low).toBeCloseTo(1 / 3, 5);
  });

  it('non-revealed relations carry no weight (a stray score on a non-revealed row is ignored)', () => {
    const withNoise = computeNetworkTemperature([
      rel('revealed', 80),
      rel('reveal_ready', 100), // must be ignored despite a score
      rel('waiting_other_side', 10),
    ]);
    const clean = computeNetworkTemperature([rel('revealed', 80)]);
    expect(withNoise).toBe(clean);
  });

  it('revealed but WITHOUT a mutualScore → ignored', () => {
    const t = computeNetworkTemperature([rel('revealed', undefined), rel('revealed', null)]);
    expect(t).toBe(0.5);
  });

  // ── Behaviour ──────────────────────────────────────────────────────────────
  it('higher scores yield a higher temperature than lower scores', () => {
    const hot = computeNetworkTemperature([rel('revealed', 90), rel('revealed', 90)]);
    const cool = computeNetworkTemperature([rel('revealed', 30), rel('revealed', 30)]);
    expect(hot).toBeGreaterThan(cool);
  });

  it('a large, warm network converges toward the mean (prior washes out)', () => {
    const many = Array.from({ length: 10 }, () => rel('revealed', 90));
    const t = computeNetworkTemperature(many);
    expect(t).toBeGreaterThan(0.8); // (9 + 1)/12 ≈ 0.833
    expect(t).toBeLessThan(0.9);
  });

  it('always returns a value within [0, 1]', () => {
    for (const t of [
      computeNetworkTemperature([]),
      computeNetworkTemperature([rel('revealed', 100), rel('revealed', 0), rel('revealed', 55)]),
      computeNetworkTemperature([rel('revealed', 100)]),
    ]) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });

  it('out-of-range / malformed scores are clamped, never crash', () => {
    const t = computeNetworkTemperature([
      rel('revealed', 150), // clamped to 1.0
      rel('revealed', -20), // clamped to 0.0
    ]);
    // (1 + 0 + 1) / (2 + 2) = 0.5
    expect(t).toBeCloseTo(0.5, 5);
    expect(computeNetworkTemperature([rel('revealed', NaN)])).toBe(0.5); // NaN score ignored
  });
});
