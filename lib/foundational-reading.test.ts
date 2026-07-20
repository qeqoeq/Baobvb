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
    expect(getTierNarrative(null, 'trust')).toBe('Pas encore de lecture fondatrice.');
  });

  it('Rooted → canonical narrative, no substitution', () => {
    expect(getTierNarrative('Rooted', null)).toBe(
      'Ce lien est enraciné, façonné par le temps, la confiance et des preuves répétées.',
    );
  });

  it('Anchor → canonical narrative, no substitution', () => {
    expect(getTierNarrative('Anchor', null)).toBe(
      'Ce lien est un point d’ancrage stable, avec une présence sur laquelle compter.',
    );
  });

  it('Steady + known pillar → canonical narrative (no substitution)', () => {
    expect(getTierNarrative('Steady', 'trust')).toBe(
      'Ce lien est stable aujourd’hui, avec assez de présence pour dessiner une direction commune plus claire.',
    );
  });

  it('Steady + null pillar → canonical narrative', () => {
    expect(getTierNarrative('Steady', null)).toBe(
      'Ce lien est stable aujourd’hui, avec assez de présence pour dessiner une direction commune plus claire.',
    );
  });

  it('Active + null pillar → canonical narrative', () => {
    expect(getTierNarrative('Active', null)).toBe(
      'Ce lien est en mouvement aujourd’hui. Sa forme devient plus facile à lire.',
    );
  });

  it('Forming + null pillar → canonical narrative', () => {
    expect(getTierNarrative('Forming', null)).toBe(
      'Ce lien cherche encore sa forme. Plus de moments partagés rendraient sa direction plus claire.',
    );
  });

  it('Distant + null pillar → canonical narrative', () => {
    expect(getTierNarrative('Distant', null)).toBe(
      'Ce lien est distant aujourd’hui, et pourrait se reconstruire avec une attention douce.',
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
  // fall back to 'Pas encore de lecture fondatrice.', never crash, never expose
  // the legacy label, never fabricate a relational verdict.

  it('legacy "Ghost" tier (Sprint-pre-V.1 leak) → "Pas encore de lecture fondatrice." (no crash)', () => {
    expect(getTierNarrative('Ghost' as unknown as Parameters<typeof getTierNarrative>[0], null)).toBe(
      'Pas encore de lecture fondatrice.',
    );
  });

  it('legacy "Spark" tier → "Pas encore de lecture fondatrice." (no crash)', () => {
    expect(getTierNarrative('Spark' as unknown as Parameters<typeof getTierNarrative>[0], null)).toBe(
      'Pas encore de lecture fondatrice.',
    );
  });

  it('legacy "Thrill" tier → "Pas encore de lecture fondatrice." (no crash)', () => {
    expect(getTierNarrative('Thrill' as unknown as Parameters<typeof getTierNarrative>[0], null)).toBe(
      'Pas encore de lecture fondatrice.',
    );
  });

  it('legacy "Vibrant" tier → "Pas encore de lecture fondatrice." (no crash)', () => {
    expect(getTierNarrative('Vibrant' as unknown as Parameters<typeof getTierNarrative>[0], null)).toBe(
      'Pas encore de lecture fondatrice.',
    );
  });

  it('legacy "Legend" tier → "Pas encore de lecture fondatrice." (no crash)', () => {
    expect(getTierNarrative('Legend' as unknown as Parameters<typeof getTierNarrative>[0], null)).toBe(
      'Pas encore de lecture fondatrice.',
    );
  });

  it('arbitrary unknown tier (defensive: any future / backend / bundle mismatch) → fallback', () => {
    expect(getTierNarrative('Unknown' as unknown as Parameters<typeof getTierNarrative>[0], null)).toBe(
      'Pas encore de lecture fondatrice.',
    );
  });

  it('unknown tier WITH a known weakestPillar still falls back safely (no path leaks)', () => {
    // Verifies the guard fires before the weakestPillar / substitution paths
    // could touch an undefined `base`.
    expect(getTierNarrative('Ghost' as unknown as Parameters<typeof getTierNarrative>[0], 'trust')).toBe(
      'Pas encore de lecture fondatrice.',
    );
  });

  it('valid current tier still returns its canonical narrative (regression: guard does not block valid tiers)', () => {
    expect(getTierNarrative('Distant', null)).toBe(
      'Ce lien est distant aujourd’hui, et pourrait se reconstruire avec une attention douce.',
    );
    expect(getTierNarrative('Rooted', null)).toBe(
      'Ce lien est enraciné, façonné par le temps, la confiance et des preuves répétées.',
    );
  });

  it('Active + known pillar → canonical narrative (no substitution)', () => {
    expect(getTierNarrative('Active', 'interactions')).toBe(
      'Ce lien est en mouvement aujourd’hui. Sa forme devient plus facile à lire.',
    );
  });

  it('Forming + known pillar → canonical narrative (no substitution)', () => {
    expect(getTierNarrative('Forming', 'sharedNetwork')).toBe(
      'Ce lien cherche encore sa forme. Plus de moments partagés rendraient sa direction plus claire.',
    );
  });

  it('Distant + known pillar → canonical narrative (no substitution)', () => {
    expect(getTierNarrative('Distant', 'support')).toBe(
      'Ce lien est distant aujourd’hui, et pourrait se reconstruire avec une attention douce.',
    );
  });
});

// ── getGrowthSuggestion ─────────────────────────────────────────────────────
// 3 branches: known pillar → pillar-specific suggestion;
//             null + Rooted → warm; null + other tier → nurture.

describe('getGrowthSuggestion', () => {
  it('known pillar → returns that pillar suggestion', () => {
    expect(getGrowthSuggestion('trust', 'Anchor')).toBe(
      'Pose un petit geste fiable, tenu jusqu’au bout, cette semaine.',
    );
  });

  it('known pillar (interactions) → returns interactions suggestion', () => {
    expect(getGrowthSuggestion('interactions', 'Distant')).toBe(
      'Crée des points de contact plus réguliers autour de ce lien.',
    );
  });

  it('null pillar + Rooted → "Keep this link warm" variant', () => {
    expect(getGrowthSuggestion(null, 'Rooted')).toBe(
      'Garde ce lien au chaud avec un point de contact intentionnel cette semaine.',
    );
  });

  it('null pillar + non-Rooted → "Keep nurturing" variant', () => {
    expect(getGrowthSuggestion(null, 'Forming')).toBe(
      'Continue à nourrir ce lien avec un point de contact intentionnel cette semaine.',
    );
  });

  it('null pillar + null tier → "Keep nurturing" variant', () => {
    expect(getGrowthSuggestion(null, null)).toBe(
      'Continue à nourrir ce lien avec un point de contact intentionnel cette semaine.',
    );
  });
});

// ── getGardenMicroSignal ────────────────────────────────────────────────────
// Priority: unread > toNurture > strongestPillar=trust > weakestPillar=sharedNetwork
//         > weakestPillar=interactions > fallback (steady link)

describe('getGardenMicroSignal', () => {
  it('no reading → unread signal', () => {
    expect(getGardenMicroSignal(micro({ hasFoundationalReading: false }))).toEqual({
      text: 'Non lu',
      tone: 'unread',
    });
  });

  it('toNurture=true → nurture signal', () => {
    expect(getGardenMicroSignal(micro({ toNurture: true }))).toEqual({
      text: 'À nourrir',
      tone: 'nurture',
    });
  });

  it('strongestPillar=trust, not nurture → strong trust signal', () => {
    expect(getGardenMicroSignal(micro({ strongestPillar: 'trust' }))).toEqual({
      text: 'Confiance forte',
      tone: 'stable',
    });
  });

  it('weakestPillar=sharedNetwork, strongest≠trust → watch shared network', () => {
    expect(
      getGardenMicroSignal(micro({ strongestPillar: 'affinity', weakestPillar: 'sharedNetwork' })),
    ).toEqual({ text: 'Réseau commun à surveiller', tone: 'stable' });
  });

  it('weakestPillar=interactions, strongest≠trust → watch interactions', () => {
    expect(
      getGardenMicroSignal(micro({ strongestPillar: 'affinity', weakestPillar: 'interactions' })),
    ).toEqual({ text: 'Interactions à surveiller', tone: 'stable' });
  });

  it('no special pillar condition → steady link fallback', () => {
    expect(
      getGardenMicroSignal(micro({ strongestPillar: 'affinity', weakestPillar: 'support' })),
    ).toEqual({ text: 'Lien stable', tone: 'stable' });
  });

  it('priority: toNurture=true beats strongestPillar=trust', () => {
    expect(
      getGardenMicroSignal(micro({ toNurture: true, strongestPillar: 'trust' })),
    ).toEqual({ text: 'À nourrir', tone: 'nurture' });
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
