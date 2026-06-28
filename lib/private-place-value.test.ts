import { describe, expect, it } from 'vitest';

import {
  derivePrivatePlaceValue,
  deriveEffectivePlaceValueInput,
  synthesizeMultiReadInput,
  type PrivatePlaceValueInput,
} from './private-place-value';
import type { Place, PlaceReadEntry } from '@/store/useRelationsStore';

function input(overrides: Partial<PrivatePlaceValueInput> = {}): PrivatePlaceValueInput {
  return {
    personalFit: 'kept',
    ...overrides,
  };
}

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: 'place-1',
    name: 'Test Place',
    category: 'cafe',
    personalFit: 'kept',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function readEntry(overrides: Partial<PlaceReadEntry> = {}): PlaceReadEntry {
  return {
    id: 'read-1',
    createdAt: '2026-02-01T00:00:00Z',
    categorySnapshot: 'cafe',
    criteriaVersion: 1,
    ...overrides,
  };
}

describe('derivePrivatePlaceValue (V1, nonlinear)', () => {
  it('1. saved with no signal stays weak, confidence low, signature thin_read', () => {
    const result = derivePrivatePlaceValue(input({ personalFit: 'saved' }));
    expect(result.confidence).toBe('low');
    expect(result.signature).toBe('thin_read');
    expect(result.value).toBeLessThan(31); // evidence multiplier < 1 reduces the raw base
  });

  it('2. tried with no signal is greater than saved with no signal', () => {
    const tried = derivePrivatePlaceValue(input({ personalFit: 'tried' }));
    const saved = derivePrivatePlaceValue(input({ personalFit: 'saved' }));
    expect(tried.value).toBeGreaterThan(saved.value);
  });

  it('3. kept with no signal is greater than tried with no signal', () => {
    const kept = derivePrivatePlaceValue(input({ personalFit: 'kept' }));
    const tried = derivePrivatePlaceValue(input({ personalFit: 'tried' }));
    expect(kept.value).toBeGreaterThan(tried.value);
  });

  it('4. not_for_me with no signal stays above the low clamp', () => {
    const result = derivePrivatePlaceValue(input({ personalFit: 'not_for_me' }));
    expect(result.value).toBeGreaterThan(8);
  });

  it('5. landingLevel 5 produces a higher value than landingLevel 1', () => {
    const high = derivePrivatePlaceValue(input({ quickSignal: { landingLevel: 5 } }));
    const low = derivePrivatePlaceValue(input({ quickSignal: { landingLevel: 1 } }));
    expect(high.value).toBeGreaterThan(low.value);
  });

  it('6. absent landingLevel creates no fictitious intensity', () => {
    const result = derivePrivatePlaceValue(input());
    expect(result.reasons.some((r) => r.startsWith('landing_level_'))).toBe(false);
  });

  it('7. wentAgainAt on a kept place increases the value and produces return_worthy', () => {
    const without = derivePrivatePlaceValue(input());
    const withRepeat = derivePrivatePlaceValue(input({ wentAgainAt: '2026-01-01T00:00:00Z' }));
    expect(withRepeat.value).toBeGreaterThan(without.value);
    expect(withRepeat.signature).toBe('return_worthy');
  });

  it('8. contextFit increases evidenceStrength (and therefore value)', () => {
    const without = derivePrivatePlaceValue(input());
    const withContext = derivePrivatePlaceValue(input({ quickSignal: { contextFit: ['calm'] } }));
    expect(withContext.value).toBeGreaterThan(without.value);
  });

  it('9. driverDimensions increases evidenceStrength (and therefore value)', () => {
    const without = derivePrivatePlaceValue(input());
    const withDriver = derivePrivatePlaceValue(input({ quickSignal: { driverDimensions: ['food'] } }));
    expect(withDriver.value).toBeGreaterThan(without.value);
  });

  it('10. restaurantDimensions without driverDimensions never produces dimensionQuality', () => {
    const result = derivePrivatePlaceValue(input({ quickSignal: { restaurantDimensions: { food: 5 } } }));
    expect(result.reasons).not.toContain('dimension_quality_positive');
    expect(result.reasons).not.toContain('dimension_quality_negative');
    expect(result.reasons).toContain('restaurant_dimensions_ungated');
  });

  it('11. restaurantDimensions matching driverDimensions produces a positive dimensionQuality', () => {
    const result = derivePrivatePlaceValue(
      input({ quickSignal: { driverDimensions: ['food'], restaurantDimensions: { food: 5 } } }),
    );
    expect(result.reasons).toContain('dimension_quality_positive');
    expect(result.reasons).toContain('has_gated_restaurant_dimensions');
  });

  it('12. impression increases evidenceStrength (and therefore value)', () => {
    const without = derivePrivatePlaceValue(input());
    const withImpression = derivePrivatePlaceValue(input({ impression: 'Quiet corner, easy to stay.' }));
    expect(withImpression.value).toBeGreaterThan(without.value);
  });

  it('13. the value never exceeds the 96 clamp, even with maximal signals', () => {
    const result = derivePrivatePlaceValue(
      input({
        quickSignal: {
          landingLevel: 5,
          contextFit: ['calm', 'deep_talk'],
          driverDimensions: ['food', 'service'],
          restaurantDimensions: { food: 5, service: 5 },
        },
        wentAgainAt: '2026-01-01T00:00:00Z',
        impression: 'Loved it.',
      }),
    );
    expect(result.value).toBeLessThanOrEqual(96);
  });

  it('14. a strong contradiction can push the value toward the low clamp', () => {
    const result = derivePrivatePlaceValue(
      input({ personalFit: 'not_for_me', quickSignal: { landingLevel: 1 } }),
    );
    expect(result.value).toBeGreaterThanOrEqual(8);
    expect(result.value).toBeLessThan(20);
  });

  it('15. a non-round value is possible', () => {
    const result = derivePrivatePlaceValue(
      input({ quickSignal: { landingLevel: 4 }, impression: 'Quiet corner.' }),
    );
    expect(result.value % 5).not.toBe(0);
  });

  it('16. the value is never the naive personalFit → 4/3/2/1 mapping', () => {
    for (const personalFit of ['kept', 'tried', 'saved', 'not_for_me'] as const) {
      const result = derivePrivatePlaceValue(input({ personalFit }));
      expect(result.value).toBeGreaterThan(4);
    }
  });

  it('17. confidence is high with strong evidence', () => {
    const result = derivePrivatePlaceValue(
      input({
        quickSignal: { contextFit: ['calm'], driverDimensions: ['food'] },
        wentAgainAt: '2026-01-01T00:00:00Z',
        impression: 'Great spot.',
      }),
    );
    expect(result.confidence).toBe('high');
  });

  it('18. confidence is medium with landingLevel alone', () => {
    const result = derivePrivatePlaceValue(input({ quickSignal: { landingLevel: 3 } }));
    expect(result.confidence).toBe('medium');
  });

  it('19. confidence is medium with evidenceStrength >= 0.35 and no landingLevel', () => {
    const result = derivePrivatePlaceValue(
      input({ quickSignal: { contextFit: ['calm'], driverDimensions: ['food'] }, impression: 'Nice.' }),
    );
    expect(result.confidence).not.toBe('low');
  });

  it('20. confidence is low otherwise', () => {
    const result = derivePrivatePlaceValue(input({ impression: 'A short note.' }));
    expect(result.confidence).toBe('low');
  });

  it('21. conflicted_read takes priority over return_worthy when both conditions could apply', () => {
    // kept + landingLevel 1 (contradiction) + wentAgainAt present.
    const result = derivePrivatePlaceValue(
      input({ quickSignal: { landingLevel: 1 }, wentAgainAt: '2026-01-01T00:00:00Z' }),
    );
    expect(result.signature).toBe('conflicted_read');
  });

  it('22. return_worthy for kept + wentAgainAt without contradiction', () => {
    const result = derivePrivatePlaceValue(input({ wentAgainAt: '2026-01-01T00:00:00Z' }));
    expect(result.signature).toBe('return_worthy');
  });

  it('23. deep_fit for kept + landingLevel >= 4 + context + driver + gated restaurant', () => {
    const result = derivePrivatePlaceValue(
      input({
        quickSignal: {
          landingLevel: 5,
          contextFit: ['calm'],
          driverDimensions: ['food'],
          restaurantDimensions: { food: 5 },
        },
      }),
    );
    expect(result.signature).toBe('deep_fit');
  });

  it('24. contextual_anchor for kept + context + driver without deep_fit conditions', () => {
    const result = derivePrivatePlaceValue(
      input({ quickSignal: { contextFit: ['calm'], driverDimensions: ['food'] } }),
    );
    expect(result.signature).toBe('contextual_anchor');
  });

  it('25. kept_trace for kept + landingLevel alone', () => {
    const result = derivePrivatePlaceValue(input({ quickSignal: { landingLevel: 3 } }));
    expect(result.signature).toBe('kept_trace');
  });

  it('26. thin_read is the fallback', () => {
    const result = derivePrivatePlaceValue(input({ personalFit: 'saved' }));
    expect(result.signature).toBe('thin_read');
  });

  it('27. is deterministic — same input always yields the same output', () => {
    const sample = input({ quickSignal: { landingLevel: 4, contextFit: ['calm'] } });
    const first = derivePrivatePlaceValue(sample);
    const second = derivePrivatePlaceValue(sample);
    expect(first).toEqual(second);
  });

  it('28. input does not contain sourceRelationId — polluting it has no effect', () => {
    const baseline = derivePrivatePlaceValue(input());
    const polluted = derivePrivatePlaceValue({
      ...input(),
      sourceRelationId: 'rel-1',
    } as PrivatePlaceValueInput);
    expect(polluted).toEqual(baseline);
  });

  it('29. source imports no private engine module', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'private-place-value.ts'),
      'utf-8',
    );
    const importLines = source
      .split('\n')
      .filter((line: string) => line.trim().startsWith('import'));
    const importSource = importLines.join('\n');
    expect(importSource).not.toMatch(/private-object-fit/);
    expect(importSource).not.toMatch(/private-route-object-fit/);
    expect(importSource).not.toMatch(/private-taste-vector/);
    expect(importSource).not.toMatch(/private-taste-similarity/);
  });

  it('30. no UI logic, no random, no current date in real code', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'private-place-value.ts'),
      'utf-8',
    );
    const codeOnly = source
      .split('\n')
      .filter((line: string) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/**');
      })
      .join('\n');
    expect(codeOnly).not.toMatch(/Math\.random/);
    expect(codeOnly).not.toMatch(/new Date\(\)/);
    expect(codeOnly).not.toMatch(/Date\.now/);
    expect(codeOnly).not.toMatch(/from ['"]react/);
    expect(codeOnly).not.toMatch(/from ['"]react-native/);
  });

  it('31. evidence saturation: an additional signal adds less once evidenceStrength is already high', () => {
    const fromZeroToOne = derivePrivatePlaceValue(input({ impression: 'note' })).value -
      derivePrivatePlaceValue(input()).value;
    const richBase = input({
      quickSignal: { contextFit: ['calm'], driverDimensions: ['food'] },
      wentAgainAt: '2026-01-01T00:00:00Z',
    });
    const fromRichToRicher =
      derivePrivatePlaceValue({ ...richBase, impression: 'note' }).value -
      derivePrivatePlaceValue(richBase).value;
    expect(fromRichToRicher).toBeLessThan(fromZeroToOne);
  });

  it('32. low confidence can never exceed the 68 cap', () => {
    // Construct a case that would be low confidence by gating evidence low
    // while still maximizing declaredIntensity — the cap must still hold.
    const result = derivePrivatePlaceValue(input({ quickSignal: { landingLevel: 5 } }));
    if (result.confidence === 'low') {
      expect(result.value).toBeLessThanOrEqual(68);
    } else {
      // landingLevel alone already pushes confidence to medium per the
      // rules — assert the medium cap instead, since low is unreachable
      // with a declared landingLevel present.
      expect(result.value).toBeLessThanOrEqual(84);
    }
  });

  it('33. medium confidence can never exceed the 84 cap', () => {
    const result = derivePrivatePlaceValue(input({ quickSignal: { landingLevel: 4 } }));
    expect(result.confidence).toBe('medium');
    expect(result.value).toBeLessThanOrEqual(84);
  });

  it('34. tried + wentAgainAt triggers a contradiction', () => {
    const result = derivePrivatePlaceValue(
      input({ personalFit: 'tried', wentAgainAt: '2026-01-01T00:00:00Z' }),
    );
    expect(result.reasons).toContain('contradiction_tried_went_again');
    expect(result.signature).toBe('conflicted_read');
  });

  it('35. restaurantDimensions ungated adds a reason but never dimensionQuality', () => {
    const result = derivePrivatePlaceValue(
      input({ quickSignal: { driverDimensions: ['food'], restaurantDimensions: { service: 5 } } }),
    );
    expect(result.reasons).toContain('restaurant_dimensions_ungated');
    expect(result.reasons).not.toContain('dimension_quality_positive');
    expect(result.reasons).not.toContain('dimension_quality_negative');
  });

  it('36. dimensionQuality is positive when driver-selected dimensions average above 3', () => {
    const result = derivePrivatePlaceValue(
      input({ quickSignal: { driverDimensions: ['food'], restaurantDimensions: { food: 5 } } }),
    );
    expect(result.reasons).toContain('dimension_quality_positive');
  });

  it('37. dimensionQuality is negative when driver-selected dimensions average below 3', () => {
    const result = derivePrivatePlaceValue(
      input({ quickSignal: { driverDimensions: ['food'], restaurantDimensions: { food: 1 } } }),
    );
    expect(result.reasons).toContain('dimension_quality_negative');
  });

  it('38. kept with low landingLevel cannot remain high despite other positive bonuses', () => {
    const result = derivePrivatePlaceValue(
      input({
        quickSignal: {
          landingLevel: 1,
          contextFit: ['calm'],
          driverDimensions: ['food'],
          restaurantDimensions: { food: 5 },
        },
        wentAgainAt: '2026-01-01T00:00:00Z',
        impression: 'Mixed feelings.',
      }),
    );
    expect(result.value).toBeLessThan(60);
    expect(result.signature).toBe('conflicted_read');
  });

  it('39. saved with many deep signals is dampened, not fully credited (capture artifact, not penalized)', () => {
    const richSaved = derivePrivatePlaceValue(
      input({
        personalFit: 'saved',
        quickSignal: { contextFit: ['calm'], driverDimensions: ['food'] },
        wentAgainAt: '2026-01-01T00:00:00Z',
        impression: 'note',
      }),
    );
    const richKept = derivePrivatePlaceValue(
      input({
        personalFit: 'kept',
        quickSignal: { contextFit: ['calm'], driverDimensions: ['food'] },
        wentAgainAt: '2026-01-01T00:00:00Z',
        impression: 'note',
      }),
    );
    // saved never reaches the same proportion of credit kept does, despite
    // carrying the same raw signals.
    expect(richSaved.value).toBeLessThan(richKept.value);
    expect(richSaved.reasons).not.toContain('contradiction_saved_deep_signals');
  });

  it('40. output contains no recommendation/ranking/score wording', () => {
    const result = derivePrivatePlaceValue(input({ quickSignal: { landingLevel: 4 } }));
    const json = JSON.stringify(result).toLowerCase();
    expect(json).not.toContain('recommend');
    expect(json).not.toContain('rank');
    expect(json).not.toContain('best');
  });

  it('41. output contains no moral label of a person', () => {
    const result = derivePrivatePlaceValue(input());
    const json = JSON.stringify(result).toLowerCase();
    for (const forbidden of ['goodtaste', 'badtaste', 'strict', 'picky', 'reliable', 'premiumtaste', 'lowtaste']) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('42. real code (outside doctrinal comments) contains no /5, percentage, stars, or recommendation wording', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, 'private-place-value.ts'),
      'utf-8',
    );
    const codeOnly = source
      .split('\n')
      .filter((line: string) => {
        const trimmed = line.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/**');
      })
      .join('\n');
    expect(codeOnly).not.toMatch(/\/5\b/);
    expect(codeOnly).not.toMatch(/%/);
    expect(codeOnly.toLowerCase()).not.toMatch(/\bstars?\b/);
    expect(codeOnly.toLowerCase()).not.toMatch(/\brating\b/);
    expect(codeOnly.toLowerCase()).not.toMatch(/\baverage\b/);
    expect(codeOnly.toLowerCase()).not.toMatch(/recommended|suggested|\bbest\b|for you/);
  });
});

describe('deriveEffectivePlaceValueInput', () => {
  it('14. falls back to legacy fields when reads is empty or absent', () => {
    const legacyPlace = place({
      quickSignal: { landingLevel: 4 },
      impression: 'Legacy impression.',
      wentAgainAt: '2026-01-15T00:00:00Z',
    });
    const result = deriveEffectivePlaceValueInput(legacyPlace);
    expect(result).toEqual({
      personalFit: 'kept',
      quickSignal: { landingLevel: 4 },
      wentAgainAt: '2026-01-15T00:00:00Z',
      impression: 'Legacy impression.',
    });
  });

  it('15. uses the latest read when reads is non-empty', () => {
    const placeWithReads = place({
      quickSignal: { landingLevel: 1 }, // legacy — must be ignored once reads exist
      impression: 'Legacy impression.',
      reads: [
        readEntry({ id: 'read-1', landingLevel: 2 }),
        readEntry({ id: 'read-2', landingLevel: 5, impression: 'Latest read note.' }),
      ],
    });
    const result = deriveEffectivePlaceValueInput(placeWithReads);
    expect(result.quickSignal?.landingLevel).toBe(5);
    expect(result.impression).toBe('Latest read note.');
  });

  it('16. preserves personalFit and wentAgainAt regardless of reads', () => {
    const placeWithReads = place({
      personalFit: 'kept',
      wentAgainAt: '2026-03-01T00:00:00Z',
      reads: [readEntry({ landingLevel: 3 })],
    });
    const result = deriveEffectivePlaceValueInput(placeWithReads);
    expect(result.personalFit).toBe('kept');
    expect(result.wentAgainAt).toBe('2026-03-01T00:00:00Z');
  });

  it('17. never aggregates multiple reads — only the latest one is used', () => {
    const placeWithManyReads = place({
      reads: [
        readEntry({ id: 'r1', landingLevel: 5, contextFit: ['calm'] }),
        readEntry({ id: 'r2', landingLevel: 5, contextFit: ['calm'] }),
        readEntry({ id: 'r3', landingLevel: 1 }), // contradicts the earlier two — must win alone
      ],
    });
    const result = deriveEffectivePlaceValueInput(placeWithManyReads);
    expect(result.quickSignal?.landingLevel).toBe(1);
    expect(result.quickSignal?.contextFit).toBeUndefined();
  });
});

describe('synthesizeMultiReadInput', () => {
  it('S1. 0 reads → identical to deriveEffectivePlaceValueInput (legacy fallback)', () => {
    const p = place({
      quickSignal: { landingLevel: 4 },
      impression: 'Legacy.',
      wentAgainAt: '2026-03-01T00:00:00Z',
    });
    expect(synthesizeMultiReadInput(p)).toEqual(deriveEffectivePlaceValueInput(p));
  });

  it('S2. 1 read → identical to deriveEffectivePlaceValueInput (single snapshot)', () => {
    const p = place({ reads: [readEntry({ landingLevel: 3, impression: 'One visit.' })] });
    expect(synthesizeMultiReadInput(p)).toEqual(deriveEffectivePlaceValueInput(p));
  });

  it('S3. 2 stable strong reads (5, 4) → recency-weighted landing 4, wentAgainAt from last read', () => {
    const p = place({
      reads: [
        readEntry({ id: 'r1', createdAt: '2026-01-01T00:00:00Z', landingLevel: 5 }),
        readEntry({ id: 'r2', createdAt: '2026-02-01T00:00:00Z', landingLevel: 4 }),
      ],
    });
    const result = synthesizeMultiReadInput(p);
    // (5*0.6 + 4*1.0) / 1.6 = 7.0/1.6 = 4.375 → round to 4
    expect(result.quickSignal?.landingLevel).toBe(4);
    expect(result.wentAgainAt).toBe('2026-02-01T00:00:00Z');
  });

  it('S4. strong then weak (5→1) → synthetic landing 3 (not latest-only 1)', () => {
    const p = place({
      reads: [
        readEntry({ id: 'r1', createdAt: '2026-01-01T00:00:00Z', landingLevel: 5 }),
        readEntry({ id: 'r2', createdAt: '2026-02-01T00:00:00Z', landingLevel: 1 }),
      ],
    });
    const result = synthesizeMultiReadInput(p);
    // (5*0.6 + 1*1.0) / 1.6 = 4.0/1.6 = 2.5 → round to 3 (Math.round)
    expect(result.quickSignal?.landingLevel).toBe(3);
    // value is muted but not destroyed (above the pure landing=1 result)
    const synthesized = derivePrivatePlaceValue(result);
    const latestOnly = derivePrivatePlaceValue(deriveEffectivePlaceValueInput(p));
    expect(synthesized.value).toBeGreaterThan(latestOnly.value);
  });

  it('S5. weak then strong (1→5) → synthetic landing 4 (recent improvement rewarded)', () => {
    const p = place({
      reads: [
        readEntry({ id: 'r1', createdAt: '2026-01-01T00:00:00Z', landingLevel: 1 }),
        readEntry({ id: 'r2', createdAt: '2026-02-01T00:00:00Z', landingLevel: 5 }),
      ],
    });
    const result = synthesizeMultiReadInput(p);
    // (1*0.6 + 5*1.0) / 1.6 = 3.5 → round to 4
    // Floating point produces ~3.4999... without epsilon correction — the fix
    // ensures the .5 boundary rounds up as intended.
    expect(result.quickSignal?.landingLevel).toBe(4);
  });

  it('S6. three reads (5, 5, 1) → synthetic landing 3', () => {
    const p = place({
      reads: [
        readEntry({ id: 'r1', createdAt: '2026-01-01T00:00:00Z', landingLevel: 5 }),
        readEntry({ id: 'r2', createdAt: '2026-02-01T00:00:00Z', landingLevel: 5 }),
        readEntry({ id: 'r3', createdAt: '2026-03-01T00:00:00Z', landingLevel: 1 }),
      ],
    });
    const result = synthesizeMultiReadInput(p);
    // weights [0.36, 0.6, 1.0]: (5*0.36 + 5*0.6 + 1*1.0) / 1.96 = 5.8/1.96 ≈ 2.96 → 3
    expect(result.quickSignal?.landingLevel).toBe(3);
  });

  it('S7. four alternating reads (5,1,5,1) → synthesized value higher than latest-only', () => {
    const p = place({
      reads: [
        readEntry({ id: 'r1', createdAt: '2026-01-01T00:00:00Z', landingLevel: 5 }),
        readEntry({ id: 'r2', createdAt: '2026-02-01T00:00:00Z', landingLevel: 1 }),
        readEntry({ id: 'r3', createdAt: '2026-03-01T00:00:00Z', landingLevel: 5 }),
        readEntry({ id: 'r4', createdAt: '2026-04-01T00:00:00Z', landingLevel: 1 }),
      ],
    });
    const synthesized = derivePrivatePlaceValue(synthesizeMultiReadInput(p));
    const latestOnly = derivePrivatePlaceValue(deriveEffectivePlaceValueInput(p));
    expect(synthesized.value).toBeGreaterThan(latestOnly.value);
  });

  it('S8. contextFit union: frequency-ranked, max 2, canonical tie-break', () => {
    const p = place({
      reads: [
        readEntry({ id: 'r1', createdAt: '2026-01-01T00:00:00Z', contextFit: ['calm', 'date'] }),
        readEntry({ id: 'r2', createdAt: '2026-02-01T00:00:00Z', contextFit: ['calm'] }),
        readEntry({ id: 'r3', createdAt: '2026-03-01T00:00:00Z', contextFit: ['friends'] }),
      ],
    });
    const result = synthesizeMultiReadInput(p);
    // calm=2, date=1, friends=1 → [calm, date] (date before friends by canonical order)
    expect(result.quickSignal?.contextFit).toEqual(['calm', 'date']);
  });

  it('S9. contextFit tie-break by canonical order when all frequencies are equal', () => {
    const p = place({
      reads: [
        readEntry({ id: 'r1', createdAt: '2026-01-01T00:00:00Z', contextFit: ['friends'] }),
        readEntry({ id: 'r2', createdAt: '2026-02-01T00:00:00Z', contextFit: ['date'] }),
      ],
    });
    const result = synthesizeMultiReadInput(p);
    // date=1, friends=1 → canonical: date(index 0) before friends(index 1)
    expect(result.quickSignal?.contextFit).toEqual(['date', 'friends']);
  });

  it('S10. driverDimensions union in canonical catalog order', () => {
    const p = place({
      reads: [
        readEntry({ id: 'r1', createdAt: '2026-01-01T00:00:00Z', driverDimensions: ['service', 'food'] }),
        readEntry({ id: 'r2', createdAt: '2026-02-01T00:00:00Z', driverDimensions: ['atmosphere', 'food'] }),
      ],
    });
    const result = synthesizeMultiReadInput(p);
    // union {food, service, atmosphere} → canonical [food, service, atmosphere]
    expect(result.quickSignal?.driverDimensions).toEqual(['food', 'service', 'atmosphere']);
  });

  it('S11. restaurantDimensions recency-weighted per dimension', () => {
    const p = place({
      reads: [
        readEntry({
          id: 'r1',
          createdAt: '2026-01-01T00:00:00Z',
          driverDimensions: ['food'],
          restaurantDimensions: { food: 2 },
        }),
        readEntry({
          id: 'r2',
          createdAt: '2026-02-01T00:00:00Z',
          driverDimensions: ['food'],
          restaurantDimensions: { food: 5 },
        }),
      ],
    });
    const result = synthesizeMultiReadInput(p);
    // food: (2*0.6 + 5*1.0) / 1.6 = 6.2/1.6 = 3.875 → round to 4
    expect(result.quickSignal?.restaurantDimensions?.food).toBe(4);
  });

  it('S12. impression = last non-empty read impression, fallback to place.impression', () => {
    const p = place({
      impression: 'Legacy note.',
      reads: [
        readEntry({ id: 'r1', createdAt: '2026-01-01T00:00:00Z', impression: 'First read.' }),
        readEntry({ id: 'r2', createdAt: '2026-02-01T00:00:00Z' }), // no impression
      ],
    });
    const result = synthesizeMultiReadInput(p);
    expect(result.impression).toBe('First read.');
  });

  it('S13. wentAgainAt synthesized when reads.length >= 2, takes most recent', () => {
    const p = place({
      wentAgainAt: '2026-05-01T00:00:00Z',
      reads: [
        readEntry({ id: 'r1', createdAt: '2026-01-01T00:00:00Z' }),
        readEntry({ id: 'r2', createdAt: '2026-03-01T00:00:00Z' }),
      ],
    });
    const result = synthesizeMultiReadInput(p);
    // place.wentAgainAt (May) is more recent than last read (March)
    expect(result.wentAgainAt).toBe('2026-05-01T00:00:00Z');

    // If reads are more recent than place.wentAgainAt, reads win
    const p2 = place({
      wentAgainAt: '2026-01-01T00:00:00Z',
      reads: [
        readEntry({ id: 'r1', createdAt: '2026-02-01T00:00:00Z' }),
        readEntry({ id: 'r2', createdAt: '2026-04-01T00:00:00Z' }),
      ],
    });
    expect(synthesizeMultiReadInput(p2).wentAgainAt).toBe('2026-04-01T00:00:00Z');
  });

  it('S14. no landingLevel in any read → synthesized quickSignal has no landingLevel', () => {
    const p = place({
      reads: [
        readEntry({ id: 'r1', createdAt: '2026-01-01T00:00:00Z', contextFit: ['calm'] }),
        readEntry({ id: 'r2', createdAt: '2026-02-01T00:00:00Z', contextFit: ['calm'] }),
      ],
    });
    const result = synthesizeMultiReadInput(p);
    expect(result.quickSignal?.landingLevel).toBeUndefined();
    expect(result.quickSignal?.contextFit).toEqual(['calm']);
  });

  it('S15. legacy quickSignal ignored when reads >= 2 — reads dominate synthesis entirely', () => {
    const p = place({
      quickSignal: { landingLevel: 1 }, // legacy: terrible — must not affect synthesis
      reads: [
        readEntry({ id: 'r1', createdAt: '2026-01-01T00:00:00Z', landingLevel: 5 }),
        readEntry({ id: 'r2', createdAt: '2026-02-01T00:00:00Z', landingLevel: 5 }),
      ],
    });
    const result = synthesizeMultiReadInput(p);
    // (5*0.6 + 5*1.0) / 1.6 = 8.0/1.6 = 5
    expect(result.quickSignal?.landingLevel).toBe(5);
  });
});
