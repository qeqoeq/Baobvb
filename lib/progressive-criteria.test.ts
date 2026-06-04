import { describe, it, expect } from 'vitest';

import {
  applyProgressivePrivateSignal,
  getMissingDeepSignalsForPillar,
  getMissingRequiredSignalsForPillar,
  getProgressiveCriteriaForPillar,
  getProgressiveUnlocks,
  type ProgressivePrivateSignalsByRelation,
} from './progressive-criteria';
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

// ── applyProgressivePrivateSignal ──────────────────────────────────────────
// The store wraps this pure helper to mutate its persisted map. Each test
// targets a privacy or isolation guarantee.

describe('applyProgressivePrivateSignal', () => {
  it('stores a rating under relationId/pillar/criterion', () => {
    const next = applyProgressivePrivateSignal({}, 'rel-1', 'trust', 'reliability', 5);
    expect(next['rel-1']?.trust?.reliability).toBe(5);
  });

  it('preserves siblings within the same pillar bucket', () => {
    const start: ProgressivePrivateSignalsByRelation = {
      'rel-1': { trust: { reliability: 5 } },
    };
    const next = applyProgressivePrivateSignal(start, 'rel-1', 'trust', 'discretion', 4);
    expect(next['rel-1']?.trust?.reliability).toBe(5);
    expect(next['rel-1']?.trust?.discretion).toBe(4);
  });

  it('preserves other pillars of the same relation', () => {
    const start: ProgressivePrivateSignalsByRelation = {
      'rel-1': { trust: { reliability: 5 }, affinity: { ease: 4 } },
    };
    const next = applyProgressivePrivateSignal(start, 'rel-1', 'trust', 'discretion', 3);
    expect(next['rel-1']?.affinity?.ease).toBe(4);
  });

  it('relation A signals do not affect relation B', () => {
    const start: ProgressivePrivateSignalsByRelation = {
      'rel-A': { trust: { reliability: 5 } },
    };
    const next = applyProgressivePrivateSignal(start, 'rel-B', 'affinity', 'humor', 4);
    expect(next['rel-A']?.trust?.reliability).toBe(5);
    expect(next['rel-B']?.affinity?.humor).toBe(4);
  });

  it('updating an existing criterion overwrites in place', () => {
    const start: ProgressivePrivateSignalsByRelation = {
      'rel-1': { trust: { reliability: 3 } },
    };
    const next = applyProgressivePrivateSignal(start, 'rel-1', 'trust', 'reliability', 5);
    expect(next['rel-1']?.trust?.reliability).toBe(5);
  });

  it('rejects an empty relationId by returning the same reference', () => {
    const start: ProgressivePrivateSignalsByRelation = { 'rel-1': { trust: { reliability: 5 } } };
    const next = applyProgressivePrivateSignal(start, '', 'trust', 'reliability', 4);
    expect(next).toBe(start);
  });

  it('output is structurally a new object (does not mutate input)', () => {
    const start: ProgressivePrivateSignalsByRelation = { 'rel-1': { trust: { reliability: 3 } } };
    const next = applyProgressivePrivateSignal(start, 'rel-1', 'trust', 'reliability', 5);
    expect(next).not.toBe(start);
    expect(start['rel-1']?.trust?.reliability).toBe(3); // input unchanged
  });

  it('serialization shape contains no score/recommendation/network field', () => {
    // Guard against accidental shape drift: the leaf is just the numeric rating.
    // No "score", no "recommendable", no "shared", no "network" anywhere.
    const next = applyProgressivePrivateSignal({}, 'rel-1', 'trust', 'reliability', 5);
    const serialized = JSON.stringify(next);
    expect(serialized).not.toMatch(/score/i);
    expect(serialized).not.toMatch(/recommend/i);
    expect(serialized).not.toMatch(/network/i);
    expect(serialized).not.toMatch(/reputation/i);
    expect(serialized).not.toMatch(/rank/i);
  });

  // Doctrine guard (v0.4.1): progressive private signals must never be averaged
  // or aggregated into the parent pillar score. The persisted shape must stay
  // a 3-level map (relationId → pillar → criterion → 1..5) with no derived
  // aggregate field, so a future regression cannot silently introduce one.
  it('persisted shape contains no average/bonus/final/mutual field (no-average doctrine)', () => {
    const next = applyProgressivePrivateSignal({}, 'rel-1', 'trust', 'reliability', 5);
    const serialized = JSON.stringify(next);
    expect(serialized).not.toMatch(/average/i);
    expect(serialized).not.toMatch(/bonus/i);
    expect(serialized).not.toMatch(/final/i);
    expect(serialized).not.toMatch(/mutual/i);
  });
});

// ── getProgressiveCriteriaForPillar ────────────────────────────────────────

describe('getProgressiveCriteriaForPillar', () => {
  it('returns the Trust catalog in a stable, catalog-driven order', () => {
    const keys = getProgressiveCriteriaForPillar('trust').map((c) => c.key);
    expect(keys).toEqual([
      'reliability',
      'discretion',
      'boundaryRespect',
      'repairCapacity',
      'consistency',
    ]);
  });

  it('returns the same order on repeated calls (deterministic)', () => {
    const first = getProgressiveCriteriaForPillar('affinity').map((c) => c.key);
    const second = getProgressiveCriteriaForPillar('affinity').map((c) => c.key);
    expect(first).toEqual(second);
  });

  it('every criterion belongs to its requested pillar', () => {
    for (const pillar of ['trust', 'interactions', 'affinity', 'support', 'sharedNetwork'] as PillarKey[]) {
      for (const criterion of getProgressiveCriteriaForPillar(pillar)) {
        expect(criterion.pillar).toBe(pillar);
      }
    }
  });
});

// ── getMissingDeepSignalsForPillar ─────────────────────────────────────────

describe('getMissingDeepSignalsForPillar', () => {
  it('returns the entire Trust deep catalog when no signals are rated', () => {
    const missing = getMissingDeepSignalsForPillar('trust', undefined);
    const keys = missing.map((c) => c.key);
    expect(keys).toEqual([
      'reliability',
      'discretion',
      'boundaryRespect',
      'repairCapacity',
      'consistency',
    ]);
  });

  it('returns the entire catalog when the pillarSignals object is empty', () => {
    const missing = getMissingDeepSignalsForPillar('trust', {});
    expect(missing).toHaveLength(5);
  });

  it('returns only the missing keys when partially rated', () => {
    const missing = getMissingDeepSignalsForPillar('trust', {
      reliability: 5,
      discretion: 4,
    });
    const keys = missing.map((c) => c.key);
    expect(keys).toEqual(['boundaryRespect', 'repairCapacity', 'consistency']);
  });

  it('returns empty array when every deep criterion is rated', () => {
    const missing = getMissingDeepSignalsForPillar('trust', {
      reliability: 5,
      discretion: 4,
      boundaryRespect: 3,
      repairCapacity: 2,
      consistency: 1,
    });
    expect(missing).toHaveLength(0);
  });

  it('treats a 0 / undefined rating slot as missing (falsy guard)', () => {
    // Although the store type forbids 0, defensive: if some past corruption
    // left a falsy value in the map, treat it as not rated.
    const missing = getMissingDeepSignalsForPillar('affinity', {
      ease: 5,
      humor: 0 as unknown as 1, // simulate corrupted slot
    });
    const keys = missing.map((c) => c.key);
    expect(keys).toContain('humor');
    expect(keys).not.toContain('ease');
  });

  it('works independently for each pillar', () => {
    const trustMissing = getMissingDeepSignalsForPillar('trust', { reliability: 5 });
    const affinityMissing = getMissingDeepSignalsForPillar('affinity', undefined);
    expect(trustMissing.every((c) => c.pillar === 'trust')).toBe(true);
    expect(affinityMissing.every((c) => c.pillar === 'affinity')).toBe(true);
  });

  it('returned criteria carry catalog labels (no toxic vocabulary)', () => {
    const missing = getMissingDeepSignalsForPillar('trust', undefined);
    for (const c of missing) {
      const lower = c.label.toLowerCase();
      expect(lower).not.toMatch(/\b(score|rank|rating|missing|required|incomplete)\b/);
    }
  });
});

// ── getMissingRequiredSignalsForPillar ─────────────────────────────────────

describe('getMissingRequiredSignalsForPillar (threshold semantics: 4 → ≥1 light, 5 → ≥2 deep)', () => {
  it('rating <= 3 returns [] (no obligation)', () => {
    for (const rating of [3, 2, 1, 0, null, undefined] as Array<number | null | undefined>) {
      expect(getMissingRequiredSignalsForPillar('trust', rating, undefined)).toEqual([]);
      expect(getMissingRequiredSignalsForPillar('trust', rating, { reliability: 5 })).toEqual([]);
    }
  });

  it('rating === 4 + no signals → blocks (returns non-empty)', () => {
    const missing = getMissingRequiredSignalsForPillar('trust', 4, undefined);
    expect(missing.length).toBeGreaterThan(0);
  });

  it('rating === 4 + one light signal rated → passes (returns [])', () => {
    const missing = getMissingRequiredSignalsForPillar('trust', 4, { reliability: 5 });
    expect(missing).toEqual([]);
  });

  it('rating === 4 + a single light signal at any value 1..5 → passes', () => {
    for (const v of [1, 2, 3, 4, 5] as const) {
      expect(getMissingRequiredSignalsForPillar('trust', 4, { reliability: v })).toEqual([]);
    }
  });

  it('rating === 4 + only a deep-only signal rated → still blocks (light gate not met)', () => {
    // boundaryRespect is deep only, not in light. Light catalog = [reliability, consistency].
    const missing = getMissingRequiredSignalsForPillar('trust', 4, { boundaryRespect: 5 });
    expect(missing.length).toBeGreaterThan(0);
  });

  it('rating === 5 + no signals → blocks', () => {
    const missing = getMissingRequiredSignalsForPillar('trust', 5, undefined);
    expect(missing.length).toBeGreaterThan(0);
  });

  it('rating === 5 + one deep signal rated → still blocks (threshold is 2)', () => {
    const missing = getMissingRequiredSignalsForPillar('trust', 5, { reliability: 5 });
    expect(missing.length).toBeGreaterThan(0);
  });

  it('rating === 5 + two deep signals rated → passes', () => {
    const missing = getMissingRequiredSignalsForPillar('trust', 5, {
      reliability: 5,
      discretion: 4,
    });
    expect(missing).toEqual([]);
  });

  it('rating === 5 + three or more deep signals rated → still passes', () => {
    const missing = getMissingRequiredSignalsForPillar('trust', 5, {
      reliability: 5,
      discretion: 4,
      boundaryRespect: 3,
    });
    expect(missing).toEqual([]);
  });

  it('rating === 5 + any two valid 1..5 deep ratings → passes', () => {
    const missing = getMissingRequiredSignalsForPillar('trust', 5, {
      reliability: 1,
      consistency: 2,
    });
    expect(missing).toEqual([]);
  });

  it('treats a 0 / falsy rating slot as not rated', () => {
    // Affinity light = [ease, sharedRhythm]. Only `ease` set to a corrupted 0
    // and `sharedRhythm` unset → 0 counted, still blocks.
    const missing = getMissingRequiredSignalsForPillar('affinity', 4, {
      ease: 0 as unknown as 1,
    });
    expect(missing.length).toBeGreaterThan(0);
  });

  it('isolates across pillars: Trust signals do not unblock Affinity at 4', () => {
    // Affinity at 4 needs at least 1 affinity light signal. Trust signals never satisfy it.
    const missing = getMissingRequiredSignalsForPillar('affinity', 4, {
      reliability: 5,
      consistency: 5,
    });
    expect(missing.length).toBeGreaterThan(0);
  });

  it('returned criteria belong to the requested pillar', () => {
    for (const pillar of ['trust', 'interactions', 'affinity', 'support', 'sharedNetwork'] as PillarKey[]) {
      const missing5 = getMissingRequiredSignalsForPillar(pillar, 5, undefined);
      const missing4 = getMissingRequiredSignalsForPillar(pillar, 4, undefined);
      for (const c of [...missing5, ...missing4]) {
        expect(c.pillar).toBe(pillar);
      }
    }
  });

  it('labels contain no toxic vocabulary', () => {
    const missing = getMissingRequiredSignalsForPillar('support', 4, undefined);
    for (const c of missing) {
      const lower = c.label.toLowerCase();
      expect(lower).not.toMatch(/\b(score|rank|rating|reputation|popularity|missing|required|incomplete)\b/);
    }
  });
});
