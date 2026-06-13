import { describe, it, expect } from 'vitest';

import {
  getStrongestAndWeakestPillars,
  getTierNarrative,
  getGrowthSuggestion,
  getGardenMicroSignal,
  type FoundationalReadingDerived,
} from './foundational-reading';
import type { Evaluation, PillarKey, PillarRating } from './evaluation';

// Factory for getGardenMicroSignal inputs.
// Only 4 fields are read by the function; the rest are irrelevant.
type MicroInput = Parameters<typeof getGardenMicroSignal>[0];

function micro(opts: {
  hasFoundationalReading?: boolean;
  toNurture?: boolean;
  strongestPillar?: PillarKey | null;
  weakestPillar?: PillarKey | null;
}): MicroInput {
  return {
    hasFoundationalReading: opts.hasFoundationalReading ?? true,
    toNurture: opts.toNurture ?? false,
    strongestPillar: opts.strongestPillar ?? null,
    weakestPillar: opts.weakestPillar ?? null,
  } as MicroInput;
}

// ── getTierNarrative ────────────────────────────────────────────────────────
// Post Sprint V.1: narratives are canonical descriptive strings, none contain
// %s. The substitution path is preserved in the helper for future re-use but
// is never taken with the current taxonomy.
// Edge case: null tier → fallback message.

describe('getTierNarrative', () => {
  it('null tier → no-reading fallback', () => {
    expect(getTierNarrative(null, 'trust')).toBe('No foundational reading yet.');
  });

  it('Rooted → canonical narrative, no substitution', () => {
    expect(getTierNarrative('Rooted', null)).toBe(
      'This link feels rooted, shaped by time, trust, and repeated evidence.',
    );
  });

  it('Anchor → canonical narrative, no substitution', () => {
    expect(getTierNarrative('Anchor', null)).toBe(
      'This link feels like a stable point of trust, with presence that can be counted on.',
    );
  });

  it('Steady + known pillar → canonical narrative (no substitution)', () => {
    expect(getTierNarrative('Steady', 'trust')).toBe(
      'This link feels steady today, with enough presence to create a clearer shared direction.',
    );
  });

  it('Steady + null pillar → canonical narrative', () => {
    expect(getTierNarrative('Steady', null)).toBe(
      'This link feels steady today, with enough presence to create a clearer shared direction.',
    );
  });

  it('Active + null pillar → canonical narrative', () => {
    expect(getTierNarrative('Active', null)).toBe(
      'This link has active movement today. Its shape is becoming easier to read.',
    );
  });

  it('Forming + null pillar → canonical narrative', () => {
    expect(getTierNarrative('Forming', null)).toBe(
      'This link is still finding its form. More shared moments could make its direction clearer.',
    );
  });

  it('Distant + null pillar → canonical narrative', () => {
    expect(getTierNarrative('Distant', null)).toBe(
      'This link feels distant today, and could be rebuilt through gentle attention.',
    );
  });

  it('null pillar narratives never contain a "-" placeholder', () => {
    for (const tier of ['Rooted', 'Anchor', 'Steady', 'Active', 'Forming', 'Distant'] as const) {
      expect(getTierNarrative(tier, null).includes(' -')).toBe(false);
    }
  });

  // ── Sprint V.4: runtime guard against unknown / legacy tier labels ───────
  // The device crashed in production with:
  //   TypeError: Cannot read property 'includes' of undefined
  //   at getTierNarrative (lib/foundational-reading.ts)
  // The root cause is a `tier` value that is truthy but absent from
  // TIER_NARRATIVES — typically a legacy Sprint-pre-V.1 string ('Ghost' /
  // 'Spark' / 'Thrill' / 'Vibrant' / 'Legend') that escaped Sprint V.3
  // hydration normalization through a runtime mutation path, or an unknown
  // value injected from a backend / bundle mismatch. These tests reproduce
  // the crash and lock the defensive contract: any unrecognized tier must
  // fall back to 'No foundational reading yet.', never crash, never expose
  // the legacy label, never fabricate a relational verdict.

  it('legacy "Ghost" tier (Sprint-pre-V.1 leak) → "No foundational reading yet." (no crash)', () => {
    expect(getTierNarrative('Ghost' as unknown as Parameters<typeof getTierNarrative>[0], null)).toBe(
      'No foundational reading yet.',
    );
  });

  it('legacy "Spark" tier → "No foundational reading yet." (no crash)', () => {
    expect(getTierNarrative('Spark' as unknown as Parameters<typeof getTierNarrative>[0], null)).toBe(
      'No foundational reading yet.',
    );
  });

  it('legacy "Thrill" tier → "No foundational reading yet." (no crash)', () => {
    expect(getTierNarrative('Thrill' as unknown as Parameters<typeof getTierNarrative>[0], null)).toBe(
      'No foundational reading yet.',
    );
  });

  it('legacy "Vibrant" tier → "No foundational reading yet." (no crash)', () => {
    expect(getTierNarrative('Vibrant' as unknown as Parameters<typeof getTierNarrative>[0], null)).toBe(
      'No foundational reading yet.',
    );
  });

  it('legacy "Legend" tier → "No foundational reading yet." (no crash)', () => {
    expect(getTierNarrative('Legend' as unknown as Parameters<typeof getTierNarrative>[0], null)).toBe(
      'No foundational reading yet.',
    );
  });

  it('arbitrary unknown tier (defensive: any future / backend / bundle mismatch) → fallback', () => {
    expect(getTierNarrative('Unknown' as unknown as Parameters<typeof getTierNarrative>[0], null)).toBe(
      'No foundational reading yet.',
    );
  });

  it('unknown tier WITH a known weakestPillar still falls back safely (no path leaks)', () => {
    // Verifies the guard fires before the weakestPillar / substitution paths
    // could touch an undefined `base`.
    expect(getTierNarrative('Ghost' as unknown as Parameters<typeof getTierNarrative>[0], 'trust')).toBe(
      'No foundational reading yet.',
    );
  });

  it('valid current tier still returns its canonical narrative (regression: guard does not block valid tiers)', () => {
    expect(getTierNarrative('Distant', null)).toBe(
      'This link feels distant today, and could be rebuilt through gentle attention.',
    );
    expect(getTierNarrative('Rooted', null)).toBe(
      'This link feels rooted, shaped by time, trust, and repeated evidence.',
    );
  });

  it('Active + known pillar → canonical narrative (no substitution)', () => {
    expect(getTierNarrative('Active', 'interactions')).toBe(
      'This link has active movement today. Its shape is becoming easier to read.',
    );
  });

  it('Forming + known pillar → canonical narrative (no substitution)', () => {
    expect(getTierNarrative('Forming', 'sharedNetwork')).toBe(
      'This link is still finding its form. More shared moments could make its direction clearer.',
    );
  });

  it('Distant + known pillar → canonical narrative (no substitution)', () => {
    expect(getTierNarrative('Distant', 'support')).toBe(
      'This link feels distant today, and could be rebuilt through gentle attention.',
    );
  });
});

// ── getGrowthSuggestion ─────────────────────────────────────────────────────
// 3 branches: known pillar → pillar-specific suggestion;
//             null + Rooted → warm; null + other tier → nurture.

describe('getGrowthSuggestion', () => {
  it('known pillar → returns that pillar suggestion', () => {
    expect(getGrowthSuggestion('trust', 'Anchor')).toBe(
      'Create one small act of reliable follow-through this week.',
    );
  });

  it('known pillar (interactions) → returns interactions suggestion', () => {
    expect(getGrowthSuggestion('interactions', 'Distant')).toBe(
      'Create more regular touchpoints around this link.',
    );
  });

  it('null pillar + Rooted → "Keep this link warm" variant', () => {
    expect(getGrowthSuggestion(null, 'Rooted')).toBe(
      'Keep this link warm with one intentional touchpoint this week.',
    );
  });

  it('null pillar + non-Rooted → "Keep nurturing" variant', () => {
    expect(getGrowthSuggestion(null, 'Forming')).toBe(
      'Keep nurturing this link through one intentional touchpoint this week.',
    );
  });

  it('null pillar + null tier → "Keep nurturing" variant', () => {
    expect(getGrowthSuggestion(null, null)).toBe(
      'Keep nurturing this link through one intentional touchpoint this week.',
    );
  });
});

// ── getGardenMicroSignal ────────────────────────────────────────────────────
// Priority: unread > toNurture > strongestPillar=trust > weakestPillar=sharedNetwork
//         > weakestPillar=interactions > fallback (steady link)

describe('getGardenMicroSignal', () => {
  it('no reading → unread signal', () => {
    expect(getGardenMicroSignal(micro({ hasFoundationalReading: false }))).toEqual({
      text: 'Unread',
      tone: 'unread',
    });
  });

  it('toNurture=true → nurture signal', () => {
    expect(getGardenMicroSignal(micro({ toNurture: true }))).toEqual({
      text: 'To nurture',
      tone: 'nurture',
    });
  });

  it('strongestPillar=trust, not nurture → strong trust signal', () => {
    expect(getGardenMicroSignal(micro({ strongestPillar: 'trust' }))).toEqual({
      text: 'Strong trust',
      tone: 'stable',
    });
  });

  it('weakestPillar=sharedNetwork, strongest≠trust → watch shared network', () => {
    expect(
      getGardenMicroSignal(micro({ strongestPillar: 'affinity', weakestPillar: 'sharedNetwork' })),
    ).toEqual({ text: 'Watch shared network', tone: 'stable' });
  });

  it('weakestPillar=interactions, strongest≠trust → watch interactions', () => {
    expect(
      getGardenMicroSignal(micro({ strongestPillar: 'affinity', weakestPillar: 'interactions' })),
    ).toEqual({ text: 'Watch interactions', tone: 'stable' });
  });

  it('no special pillar condition → steady link fallback', () => {
    expect(
      getGardenMicroSignal(micro({ strongestPillar: 'affinity', weakestPillar: 'support' })),
    ).toEqual({ text: 'Steady link', tone: 'stable' });
  });

  it('priority: toNurture=true beats strongestPillar=trust', () => {
    expect(
      getGardenMicroSignal(micro({ toNurture: true, strongestPillar: 'trust' })),
    ).toEqual({ text: 'To nurture', tone: 'nurture' });
  });
});

// ── getStrongestAndWeakestPillars ───────────────────────────────────────────
// Doctrine: never invent a strong/weak signal that the evaluation does not
// honestly support. Equal ratings, ties at the top, ties at the bottom — all
// return null for the corresponding slot. The function must never return the
// same pillar in both slots when non-null.

function evalWith(ratings: Record<PillarKey, PillarRating>): Evaluation {
  return {
    id: 'e-test',
    relationId: 'r-test',
    ratings,
    score: 0,
    tier: 'Distant',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('getStrongestAndWeakestPillars', () => {
  it('null evaluation → both null', () => {
    expect(getStrongestAndWeakestPillars(null)).toEqual({
      strongestPillar: null,
      weakestPillar: null,
    });
  });

  it('all ratings at 3/3/3/3/3 → both null', () => {
    expect(
      getStrongestAndWeakestPillars(
        evalWith({ trust: 3, interactions: 3, affinity: 3, support: 3, sharedNetwork: 3 }),
      ),
    ).toEqual({ strongestPillar: null, weakestPillar: null });
  });

  it('all ratings at 5/5/5/5/5 → both null', () => {
    expect(
      getStrongestAndWeakestPillars(
        evalWith({ trust: 5, interactions: 5, affinity: 5, support: 5, sharedNetwork: 5 }),
      ),
    ).toEqual({ strongestPillar: null, weakestPillar: null });
  });

  it('all ratings at 1/1/1/1/1 → both null', () => {
    expect(
      getStrongestAndWeakestPillars(
        evalWith({ trust: 1, interactions: 1, affinity: 1, support: 1, sharedNetwork: 1 }),
      ),
    ).toEqual({ strongestPillar: null, weakestPillar: null });
  });

  it('clear strong + clear weak → returns both unique pillars', () => {
    // trust=5 (unique max), interactions=1 (unique min)
    expect(
      getStrongestAndWeakestPillars(
        evalWith({ trust: 5, interactions: 1, affinity: 3, support: 2, sharedNetwork: 4 }),
      ),
    ).toEqual({ strongestPillar: 'trust', weakestPillar: 'interactions' });
  });

  it('tied at top, clear weak → strongest null, weakest returned', () => {
    // trust=5, interactions=5 (tied max), sharedNetwork=2 (unique min)
    expect(
      getStrongestAndWeakestPillars(
        evalWith({ trust: 5, interactions: 5, affinity: 4, support: 3, sharedNetwork: 2 }),
      ),
    ).toEqual({ strongestPillar: null, weakestPillar: 'sharedNetwork' });
  });

  it('clear strong, tied at bottom → strongest returned, weakest null', () => {
    // trust=5 (unique max), interactions=4, affinity=4, support=4, sharedNetwork=4 (tied min)
    expect(
      getStrongestAndWeakestPillars(
        evalWith({ trust: 5, interactions: 4, affinity: 4, support: 4, sharedNetwork: 4 }),
      ),
    ).toEqual({ strongestPillar: 'trust', weakestPillar: null });
  });

  it('all near-equal with one clear lower → strongest null, weakest returned', () => {
    // trust=4, interactions=4, affinity=4, support=3 (unique min), sharedNetwork=4 (tied max)
    expect(
      getStrongestAndWeakestPillars(
        evalWith({ trust: 4, interactions: 4, affinity: 4, support: 3, sharedNetwork: 4 }),
      ),
    ).toEqual({ strongestPillar: null, weakestPillar: 'support' });
  });

  it('never returns strongestPillar === weakestPillar when both are non-null', () => {
    // Exhaustive sweep of every PillarRating combination (3125 cases).
    const ratings: PillarRating[] = [1, 2, 3, 4, 5];
    for (const t of ratings) {
      for (const i of ratings) {
        for (const a of ratings) {
          for (const s of ratings) {
            for (const n of ratings) {
              const result = getStrongestAndWeakestPillars(
                evalWith({ trust: t, interactions: i, affinity: a, support: s, sharedNetwork: n }),
              );
              if (result.strongestPillar !== null && result.weakestPillar !== null) {
                expect(result.strongestPillar).not.toBe(result.weakestPillar);
              }
            }
          }
        }
      }
    }
  });
});
