import { describe, expect, it } from 'vitest';

import {
  derivePrivateTasteVectorFromPlaces,
  type PrivateTasteVectorPlaceInput,
} from './private-taste-vector';

function place(overrides: Partial<PrivateTasteVectorPlaceInput> = {}): PrivateTasteVectorPlaceInput {
  return {
    category: 'cafe',
    personalFit: 'kept',
    ...overrides,
  };
}

describe('derivePrivateTasteVectorFromPlaces', () => {
  it('1. returns an empty vector with confidence 0 when places is empty', () => {
    const result = derivePrivateTasteVectorFromPlaces([]);
    expect(result.evidenceCount).toBe(0);
    expect(result.positiveEvidenceCount).toBe(0);
    expect(result.negativeEvidenceCount).toBe(0);
    expect(result.repeatVisitEvidenceCount).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.categorySignals).toEqual({});
    expect(result.contextSignals).toEqual({});
    expect(result.driverSignals).toEqual({});
    expect(result.restaurantDimensionSignals).toEqual({});
  });

  it('2. ignores saved places without experience', () => {
    const result = derivePrivateTasteVectorFromPlaces([
      place({ personalFit: 'saved', category: 'restaurant' }),
    ]);
    expect(result.evidenceCount).toBe(0);
    expect(result.categorySignals.restaurant).toBeUndefined();
  });

  it('3. ignores tried places without a useful quickSignal', () => {
    const result = derivePrivateTasteVectorFromPlaces([
      place({ personalFit: 'tried', category: 'bar' }),
    ]);
    expect(result.evidenceCount).toBe(0);
    expect(result.categorySignals.bar).toBeUndefined();
  });

  it('4. counts kept as positive evidence', () => {
    const result = derivePrivateTasteVectorFromPlaces([place({ personalFit: 'kept' })]);
    expect(result.positiveEvidenceCount).toBe(1);
    expect(result.negativeEvidenceCount).toBe(0);
    expect(result.evidenceCount).toBe(1);
  });

  it('5. counts not_for_me as negative evidence', () => {
    const result = derivePrivateTasteVectorFromPlaces([place({ personalFit: 'not_for_me' })]);
    expect(result.positiveEvidenceCount).toBe(0);
    expect(result.negativeEvidenceCount).toBe(1);
    expect(result.evidenceCount).toBe(1);
  });

  it('6. counts wentAgainAt as repeat visit evidence', () => {
    const result = derivePrivateTasteVectorFromPlaces([
      place({ personalFit: 'kept', wentAgainAt: '2026-03-12T11:00:00Z' }),
    ]);
    expect(result.repeatVisitEvidenceCount).toBe(1);
  });

  it('does not count repeat visit evidence when wentAgainAt is absent', () => {
    const result = derivePrivateTasteVectorFromPlaces([place({ personalFit: 'kept' })]);
    expect(result.repeatVisitEvidenceCount).toBe(0);
  });

  it('7. aggregates contextFit from kept places', () => {
    const result = derivePrivateTasteVectorFromPlaces([
      place({ quickSignal: { contextFit: ['calm', 'deep_talk'] } }),
    ]);
    expect(result.contextSignals.calm?.evidenceCount).toBe(1);
    expect(result.contextSignals.calm?.value).toBe(1);
    expect(result.contextSignals.deep_talk?.evidenceCount).toBe(1);
  });

  it('8. aggregates driverDimensions from kept places', () => {
    const result = derivePrivateTasteVectorFromPlaces([
      place({ quickSignal: { driverDimensions: ['food', 'service'] } }),
    ]);
    expect(result.driverSignals.food?.evidenceCount).toBe(1);
    expect(result.driverSignals.food?.value).toBe(1);
    expect(result.driverSignals.service?.evidenceCount).toBe(1);
  });

  it('9. aggregates restaurantDimensions gated by driverDimensions', () => {
    const result = derivePrivateTasteVectorFromPlaces([
      place({
        quickSignal: {
          driverDimensions: ['food'],
          restaurantDimensions: { food: 5, service: 1 },
        },
      }),
    ]);
    // food was selected as a driver: counted.
    expect(result.restaurantDimensionSignals.food?.evidenceCount).toBe(1);
    expect(result.restaurantDimensionSignals.food?.value).toBe(1); // (5-1)/4 = 1
    // service was rated but never selected as a driver: not counted.
    expect(result.restaurantDimensionSignals.service).toBeUndefined();
  });

  it('10. produces higher confidence with more evidence', () => {
    const single = derivePrivateTasteVectorFromPlaces([place({ personalFit: 'kept' })]);
    const many = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 4 }, () => place({ personalFit: 'kept' })),
    );
    expect(many.confidence).toBeGreaterThan(single.confidence);
  });

  it('11. never exceeds confidence 1', () => {
    const result = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 50 }, () =>
        place({ personalFit: 'kept', wentAgainAt: '2026-01-01T00:00:00Z' }),
      ),
    );
    expect(result.confidence).toBe(1);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it('12. never reads sourceRelationId (absent from the input type, cannot influence the result)', () => {
    const withoutSource = derivePrivateTasteVectorFromPlaces([place({ personalFit: 'kept' })]);
    const withSource = derivePrivateTasteVectorFromPlaces([
      { ...place({ personalFit: 'kept' }), sourceRelationId: 'rel-1' } as PrivateTasteVectorPlaceInput,
    ]);
    expect(withSource).toEqual(withoutSource);
  });

  it('13. never reads identityHint', () => {
    const withoutHint = derivePrivateTasteVectorFromPlaces([place({ personalFit: 'kept' })]);
    const withHint = derivePrivateTasteVectorFromPlaces([
      { ...place({ personalFit: 'kept' }), identityHint: '12 Rue de la Paix' } as PrivateTasteVectorPlaceInput,
    ]);
    expect(withHint).toEqual(withoutHint);
  });

  it('14. never reads impression', () => {
    const withoutImpression = derivePrivateTasteVectorFromPlaces([place({ personalFit: 'kept' })]);
    const withImpression = derivePrivateTasteVectorFromPlaces([
      { ...place({ personalFit: 'kept' }), impression: 'Loved it, would go back forever.' } as PrivateTasteVectorPlaceInput,
    ]);
    expect(withImpression).toEqual(withoutImpression);
  });

  it('15. does not depend on the order of places', () => {
    const a = place({ category: 'cafe', personalFit: 'kept', quickSignal: { contextFit: ['calm'] } });
    const b = place({ category: 'restaurant', personalFit: 'not_for_me' });
    const c = place({ category: 'bar', personalFit: 'kept', wentAgainAt: '2026-02-01T00:00:00Z' });

    const forward = derivePrivateTasteVectorFromPlaces([a, b, c]);
    const reversed = derivePrivateTasteVectorFromPlaces([c, b, a]);
    const shuffled = derivePrivateTasteVectorFromPlaces([b, c, a]);

    expect(forward).toEqual(reversed);
    expect(forward).toEqual(shuffled);
  });

  it('16. is deterministic — same input always yields the same output', () => {
    const input = [
      place({ category: 'cafe', personalFit: 'kept', quickSignal: { landingLevel: 4 } }),
      place({ category: 'bar', personalFit: 'not_for_me' }),
    ];
    const first = derivePrivateTasteVectorFromPlaces(input);
    const second = derivePrivateTasteVectorFromPlaces(input);
    expect(first).toEqual(second);
  });

  it('17. exports no visible scoring function — only the derivation and its types', async () => {
    const moduleExports = await import('./private-taste-vector');
    const exportedNames = Object.keys(moduleExports);
    expect(exportedNames).toEqual(['derivePrivateTasteVectorFromPlaces']);
  });

  it('18. produces no recommendation field anywhere in the output', () => {
    const result = derivePrivateTasteVectorFromPlaces([
      place({ personalFit: 'kept', quickSignal: { contextFit: ['calm'], driverDimensions: ['food'] } }),
    ]);
    const json = JSON.stringify(result).toLowerCase();
    expect(json).not.toContain('recommend');
    expect(json).not.toContain('best');
    expect(json).not.toContain('rank');
  });

  it('19. produces no moral label of a person anywhere in the output', () => {
    const result = derivePrivateTasteVectorFromPlaces([
      place({ personalFit: 'kept' }),
      place({ personalFit: 'not_for_me' }),
    ]);
    const json = JSON.stringify(result).toLowerCase();
    for (const forbidden of [
      'goodtaste',
      'strict',
      'generous',
      'reliable',
      'difficult',
      'picky',
      'premiumtaste',
      'lowtaste',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('20. covers a realistic seed-like case (Café Orée / Maison Luma pattern)', () => {
    const result = derivePrivateTasteVectorFromPlaces([
      place({
        category: 'cafe',
        personalFit: 'kept',
        quickSignal: { contextFit: ['deep_talk', 'calm'] },
        wentAgainAt: '2026-03-12T11:00:00Z',
      }),
      place({
        category: 'restaurant',
        personalFit: 'kept',
        quickSignal: {
          contextFit: ['deep_talk', 'calm'],
          driverDimensions: ['food', 'service'],
          restaurantDimensions: { food: 5, service: 4, atmosphere: 3, value: 4, cleanliness: 2 },
        },
      }),
    ]);
    expect(result.evidenceCount).toBe(2);
    expect(result.positiveEvidenceCount).toBe(2);
    expect(result.repeatVisitEvidenceCount).toBe(1);
    expect(result.categorySignals.cafe?.evidenceCount).toBe(1);
    expect(result.categorySignals.restaurant?.evidenceCount).toBe(1);
    expect(result.contextSignals.calm?.evidenceCount).toBe(2);
    expect(result.restaurantDimensionSignals.food?.value).toBe(1);
    expect(result.restaurantDimensionSignals.atmosphere).toBeUndefined();
  });
});
