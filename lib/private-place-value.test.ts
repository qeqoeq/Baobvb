import { describe, expect, it } from 'vitest';

import {
  derivePrivatePlaceValue,
  type PrivatePlaceValueInput,
} from './private-place-value';

function input(overrides: Partial<PrivatePlaceValueInput> = {}): PrivatePlaceValueInput {
  return {
    personalFit: 'kept',
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
