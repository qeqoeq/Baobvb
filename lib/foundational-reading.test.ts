import { describe, it, expect } from 'vitest';

import {
  getTierNarrative,
  getGrowthSuggestion,
  getGardenMicroSignal,
  type FoundationalReadingDerived,
} from './foundational-reading';
import type { PillarKey } from './evaluation';

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
// Tiers without %s: Legend, Anchor (fixed strings).
// Tiers with %s:    Vibrant, Thrill, Spark, Ghost (pillar label substituted).
// Edge cases: null tier → fallback message; null pillar → '-' substituted.

describe('getTierNarrative', () => {
  it('null tier → no-reading fallback', () => {
    expect(getTierNarrative(null, 'trust')).toBe('No foundational reading yet.');
  });

  it('Legend → fixed string, no substitution', () => {
    expect(getTierNarrative('Legend', null)).toBe(
      'This link feels exceptional, deeply rooted, and consistently strong.',
    );
  });

  it('Anchor → fixed string, no substitution', () => {
    expect(getTierNarrative('Anchor', null)).toBe(
      'This link feels grounded and reliable, with strong long-term potential.',
    );
  });

  it('Vibrant + known pillar → substitutes lowercase pillar label', () => {
    expect(getTierNarrative('Vibrant', 'trust')).toBe(
      'This link feels vibrant and already grounded, with room to grow through trust.',
    );
  });

  it('Vibrant + null pillar → substitutes "-"', () => {
    expect(getTierNarrative('Vibrant', null)).toBe(
      'This link feels vibrant and already grounded, with room to grow through -.',
    );
  });

  it('Thrill + known pillar → substitutes lowercase pillar label', () => {
    expect(getTierNarrative('Thrill', 'interactions')).toBe(
      'This link feels alive and promising, but it still needs steadier roots in interactions.',
    );
  });

  it('Spark + known pillar → substitutes pillar label', () => {
    expect(getTierNarrative('Spark', 'sharedNetwork')).toBe(
      'This link is emerging and meaningful, and can grow with more shared network.',
    );
  });

  it('Ghost + known pillar → substitutes in "gentle %s" phrasing', () => {
    expect(getTierNarrative('Ghost', 'support')).toBe(
      'This link feels distant today, and could be rebuilt through gentle support.',
    );
  });
});

// ── getGrowthSuggestion ─────────────────────────────────────────────────────
// 3 branches: known pillar → pillar-specific suggestion;
//             null + Legend → warm; null + other tier → nurture.

describe('getGrowthSuggestion', () => {
  it('known pillar → returns that pillar suggestion', () => {
    expect(getGrowthSuggestion('trust', 'Anchor')).toBe(
      'Create one small act of reliable follow-through this week.',
    );
  });

  it('known pillar (interactions) → returns interactions suggestion', () => {
    expect(getGrowthSuggestion('interactions', 'Ghost')).toBe(
      'Create more regular touchpoints around this link.',
    );
  });

  it('null pillar + Legend → "Keep this link warm" variant', () => {
    expect(getGrowthSuggestion(null, 'Legend')).toBe(
      'Keep this link warm with one intentional touchpoint this week.',
    );
  });

  it('null pillar + non-Legend → "Keep nurturing" variant', () => {
    expect(getGrowthSuggestion(null, 'Spark')).toBe(
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
