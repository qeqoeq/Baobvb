import { describe, it, expect } from 'vitest';

import { getProgressiveUnlocks } from './progressive-criteria';
import type { PillarKey } from './evaluation';

const ZERO: Partial<Record<PillarKey, number | null | undefined>> = {
  trust: null, interactions: null, affinity: null, support: null, sharedNetwork: null,
};

describe('getProgressiveUnlocks — level by rating', () => {
  it('rating === 5 unlocks deep criteria', () => {
    const u = getProgressiveUnlocks({ ...ZERO, trust: 5 });
    expect(u.trust.level).toBe('deep');
    expect(u.trust.criteria.length).toBeGreaterThanOrEqual(3);
  });

  it('rating === 4 unlocks light criteria', () => {
    const u = getProgressiveUnlocks({ ...ZERO, trust: 4 });
    expect(u.trust.level).toBe('light');
    expect(u.trust.criteria.length).toBeGreaterThan(0);
    expect(u.trust.criteria.length).toBeLessThan(getProgressiveUnlocks({ ...ZERO, trust: 5 }).trust.criteria.length);
  });

  it('rating <= 3 unlocks none', () => {
    for (const r of [3, 2, 1] as const) {
      const u = getProgressiveUnlocks({ ...ZERO, trust: r });
      expect(u.trust.level).toBe('none');
      expect(u.trust.criteria).toHaveLength(0);
    }
  });

  it('rating null/undefined unlocks none', () => {
    const u1 = getProgressiveUnlocks({ ...ZERO });
    expect(u1.trust.level).toBe('none');
    expect(u1.trust.criteria).toHaveLength(0);
    const u2 = getProgressiveUnlocks({ ...ZERO, trust: null });
    expect(u2.trust.level).toBe('none');
  });
});

describe('getProgressiveUnlocks — per-pillar isolation', () => {
  it('Trust = 5 unlocks Trust criteria only (no cross-pillar leak)', () => {
    const u = getProgressiveUnlocks({ ...ZERO, trust: 5 });
    expect(u.trust.level).toBe('deep');
    expect(u.interactions.level).toBe('none');
    expect(u.affinity.level).toBe('none');
    expect(u.support.level).toBe('none');
    expect(u.sharedNetwork.level).toBe('none');
    for (const c of u.trust.criteria) {
      expect(c.pillar).toBe('trust');
    }
  });

  it('Affinity = 5 unlocks Affinity criteria only', () => {
    const u = getProgressiveUnlocks({ ...ZERO, affinity: 5 });
    expect(u.affinity.level).toBe('deep');
    for (const c of u.affinity.criteria) {
      expect(c.pillar).toBe('affinity');
    }
    expect(u.trust.level).toBe('none');
  });

  it('Trust deep set contains the 5 expected keys', () => {
    const u = getProgressiveUnlocks({ ...ZERO, trust: 5 });
    const keys = u.trust.criteria.map((c) => c.key).sort();
    expect(keys).toEqual([
      'boundaryRespect', 'consistency', 'discretion', 'reliability', 'repairCapacity',
    ]);
  });

  it('Trust light set is a strict subset of the deep set', () => {
    const deep = getProgressiveUnlocks({ ...ZERO, trust: 5 }).trust.criteria.map((c) => c.key);
    const light = getProgressiveUnlocks({ ...ZERO, trust: 4 }).trust.criteria.map((c) => c.key);
    expect(light.length).toBeLessThan(deep.length);
    for (const k of light) expect(deep).toContain(k);
  });
});

describe('getProgressiveUnlocks — non-negotiable: Affinity never compensates low Trust', () => {
  // The product invariant lives in the network/recommendation layer, which
  // does not exist yet. The engine guarantees something subtler: it never
  // emits any network or recommendation field, so low Trust + high Affinity
  // can never accidentally surface as a "recommendable link".
  it('Trust=2 + Affinity=5 → affinity opens, trust stays closed, no network field anywhere', () => {
    const u = getProgressiveUnlocks({ ...ZERO, trust: 2, affinity: 5 });
    expect(u.affinity.level).toBe('deep');
    expect(u.trust.level).toBe('none');

    // Shape guard: the returned structure only exposes per-pillar unlocks.
    // No top-level recommendation, no network_open, no aggregate.
    const allowedKeys: ReadonlyArray<PillarKey> = ['trust', 'interactions', 'affinity', 'support', 'sharedNetwork'];
    expect(Object.keys(u).sort()).toEqual([...allowedKeys].sort());
    for (const pillar of allowedKeys) {
      const slot = u[pillar];
      expect(Object.keys(slot).sort()).toEqual(['criteria', 'level']);
    }
  });
});

describe('getProgressiveUnlocks — vocabulary guard', () => {
  // The engine carries user-facing copy (label + hint). It must never adopt
  // the vocabulary of public rating / reputation / dating-style apps.
  it('no forbidden word appears in any label or hint, on any unlock', () => {
    const forbiddenWords = [
      'rated', 'reviewed', 'reputation', 'rank', 'ranking', 'popularity',
      'crush', 'hot', 'beauty', 'charm', 'attractive',
    ];
    const forbiddenPhrases = [
      'score received', 'someone rated', 'people think', 'unlock your reputation',
      'rate them deeper', 'more notes', 'advanced ratings',
    ];

    const allFive = { trust: 5, interactions: 5, affinity: 5, support: 5, sharedNetwork: 5 } as const;
    const unlocks = getProgressiveUnlocks(allFive);

    for (const pillar of Object.keys(unlocks) as PillarKey[]) {
      for (const c of unlocks[pillar].criteria) {
        for (const text of [c.label, c.hint]) {
          const lower = text.toLowerCase();
          for (const w of forbiddenWords) {
            const re = new RegExp(`\\b${w}\\b`);
            expect(re.test(lower), `"${text}" contains forbidden word "${w}"`).toBe(false);
          }
          for (const p of forbiddenPhrases) {
            expect(lower.includes(p), `"${text}" contains forbidden phrase "${p}"`).toBe(false);
          }
        }
      }
    }
  });
});

describe('getProgressiveUnlocks — determinism', () => {
  it('returns equal shape and counts for repeated calls with same input', () => {
    const a = getProgressiveUnlocks({ trust: 5, interactions: 4, affinity: 3, support: 5, sharedNetwork: 1 });
    const b = getProgressiveUnlocks({ trust: 5, interactions: 4, affinity: 3, support: 5, sharedNetwork: 1 });
    for (const pillar of ['trust', 'interactions', 'affinity', 'support', 'sharedNetwork'] as const) {
      expect(a[pillar].level).toBe(b[pillar].level);
      expect(a[pillar].criteria.map((c) => c.key)).toEqual(b[pillar].criteria.map((c) => c.key));
    }
  });

  it('covers all 5 pillars in the output', () => {
    const u = getProgressiveUnlocks({ ...ZERO });
    expect(u.trust).toBeDefined();
    expect(u.interactions).toBeDefined();
    expect(u.affinity).toBeDefined();
    expect(u.support).toBeDefined();
    expect(u.sharedNetwork).toBeDefined();
  });
});
