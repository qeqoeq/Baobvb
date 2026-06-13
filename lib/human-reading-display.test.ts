import { describe, it, expect } from 'vitest';

import {
  getHumanRelationRevealDisplay,
  type HumanRelationRevealDisplay,
} from './human-reading-display';

describe('getHumanRelationRevealDisplay', () => {
  it('returns hidden when not revealed', () => {
    const result = getHumanRelationRevealDisplay({
      nameRevealed: false,
      visibleScore: 82,
      revealedTier: 'Anchor',
    });
    expect(result.kind).toBe('hidden');
  });

  it('returns signature with tier when revealed with score and tier', () => {
    const result = getHumanRelationRevealDisplay({
      nameRevealed: true,
      visibleScore: 82,
      revealedTier: 'Anchor',
    });
    expect(result.kind).toBe('signature');
    if (result.kind === 'signature') {
      expect(result.tier).toBe('Anchor');
    }
  });

  it('falls back to "Shared reading" tier when revealedTier is null', () => {
    const result = getHumanRelationRevealDisplay({
      nameRevealed: true,
      visibleScore: 65,
      revealedTier: null,
    });
    expect(result.kind).toBe('signature');
    if (result.kind === 'signature') {
      expect(result.tier).toBe('Shared reading');
    }
  });

  it('returns pending when revealed but visibleScore is null', () => {
    // Bootstrap / claim case: server returned revealed but mutual_score not yet loaded.
    const result = getHumanRelationRevealDisplay({
      nameRevealed: true,
      visibleScore: null,
      revealedTier: null,
    });
    expect(result.kind).toBe('pending');
  });

  it('returns pending even when tier is present but score is missing', () => {
    // Defensive: a tier without a score still means the shared payload is incomplete.
    const result = getHumanRelationRevealDisplay({
      nameRevealed: true,
      visibleScore: null,
      revealedTier: 'Steady',
    });
    expect(result.kind).toBe('pending');
  });

  // ── Structural guarantees: no numeric score ever leaks through ─────────────

  it('never exposes a "score" property on any result variant', () => {
    const variants: Array<{
      nameRevealed: boolean;
      visibleScore: number | null;
      revealedTier: string | null;
    }> = [
      { nameRevealed: false, visibleScore: 96, revealedTier: 'Rooted' },
      { nameRevealed: true, visibleScore: 96, revealedTier: 'Rooted' },
      { nameRevealed: true, visibleScore: 0, revealedTier: 'Distant' },
      { nameRevealed: true, visibleScore: null, revealedTier: null },
      { nameRevealed: true, visibleScore: 50, revealedTier: null },
    ];
    for (const input of variants) {
      const result = getHumanRelationRevealDisplay(input);
      expect(Object.prototype.hasOwnProperty.call(result, 'score')).toBe(false);
    }
  });

  it('never exposes mutualScore / foundationalScore / finalScore on any variant', () => {
    const result = getHumanRelationRevealDisplay({
      nameRevealed: true,
      visibleScore: 96,
      revealedTier: 'Rooted',
    });
    expect(Object.prototype.hasOwnProperty.call(result, 'mutualScore')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'foundationalScore')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(result, 'finalScore')).toBe(false);
  });

  it('json-serialized variants never contain a numeric score under any key', () => {
    // Catches a structurally nested score that might slip in through future
    // additions. The serialized payload must carry only the qualitative
    // signature, never a numeric value for a human relation surface.
    const inputs: Array<{
      nameRevealed: boolean;
      visibleScore: number | null;
      revealedTier: string | null;
    }> = [
      { nameRevealed: true, visibleScore: 96, revealedTier: 'Rooted' },
      { nameRevealed: true, visibleScore: 50, revealedTier: 'Active' },
      { nameRevealed: true, visibleScore: 0, revealedTier: 'Distant' },
      { nameRevealed: true, visibleScore: null, revealedTier: null },
      { nameRevealed: false, visibleScore: 96, revealedTier: 'Rooted' },
    ];
    for (const input of inputs) {
      const result = getHumanRelationRevealDisplay(input);
      const serialized = JSON.stringify(result);
      // Match scores 0-100 as bare integers; the only numbers allowed in the
      // output should not exist. Match against the specific score we passed in.
      if (input.visibleScore !== null) {
        expect(serialized.includes(String(input.visibleScore))).toBe(false);
      }
    }
  });

  it('type guard: HumanRelationRevealDisplay never has a score field at compile time', () => {
    // Compile-time assertion: this would fail TypeScript if 'score' were
    // present on any branch of the discriminated union. Runtime trivially
    // passes; the real guarantee is that tsc rejects any future addition
    // of a score field to HumanRelationRevealDisplay.
    const result: HumanRelationRevealDisplay = getHumanRelationRevealDisplay({
      nameRevealed: true,
      visibleScore: 96,
      revealedTier: 'Rooted',
    });
    // @ts-expect-error — 'score' is intentionally absent from the contract.
    const _shouldNotCompile: number | undefined = result.score;
    expect(_shouldNotCompile).toBeUndefined();
  });
});
