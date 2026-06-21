import { describe, expect, it } from 'vitest';

import {
  derivePrivateTasteSimilarity,
  type PrivateTasteSimilarity,
} from './private-taste-similarity';
import {
  derivePrivateTasteVectorFromPlaces,
  type ConfidenceWeightedSignal,
  type PrivateTasteVector,
  type PrivateTasteVectorPlaceInput,
} from './private-taste-vector';

function place(overrides: Partial<PrivateTasteVectorPlaceInput> = {}): PrivateTasteVectorPlaceInput {
  return {
    category: 'cafe',
    personalFit: 'kept',
    ...overrides,
  };
}

function emptyVector(): PrivateTasteVector {
  return derivePrivateTasteVectorFromPlaces([]);
}

function signal(value: number, confidence: number, evidenceCount: number): ConfidenceWeightedSignal {
  return { value, confidence, evidenceCount };
}

function vectorWithCategory(
  value: number,
  confidence: number,
  evidenceCount: number,
  positiveEvidenceCount: number,
): PrivateTasteVector {
  return {
    ...emptyVector(),
    evidenceCount,
    positiveEvidenceCount,
    negativeEvidenceCount: evidenceCount - positiveEvidenceCount,
    categorySignals: { cafe: signal(value, confidence, evidenceCount) },
  };
}

describe('derivePrivateTasteSimilarity', () => {
  it('1. two empty vectors → insufficient_evidence', () => {
    const result = derivePrivateTasteSimilarity(emptyVector(), emptyVector());
    expect(result.status).toBe('insufficient_evidence');
    expect(result.value).toBe(0);
    expect(result.confidence).toBe(0);
    expect(result.dimensions).toEqual({});
  });

  it('2. one empty vector + one rich vector → insufficient_evidence', () => {
    const rich = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 5 }, () => place({ personalFit: 'kept', category: 'cafe' })),
    );
    const result = derivePrivateTasteSimilarity(emptyVector(), rich);
    expect(result.status).toBe('insufficient_evidence');
    expect(result.value).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('3. two vectors with insufficient evidence → insufficient_evidence', () => {
    const a = derivePrivateTasteVectorFromPlaces([place({ personalFit: 'kept', category: 'cafe' })]);
    const b = derivePrivateTasteVectorFromPlaces([place({ personalFit: 'kept', category: 'cafe' })]);
    const result = derivePrivateTasteSimilarity(a, b);
    expect(result.status).toBe('insufficient_evidence');
    expect(result.dimensions.category).toBeUndefined();
  });

  it('4. category overlap sufficient → dimension category present', () => {
    const a = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ personalFit: 'kept', category: 'cafe' })),
    );
    const b = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ personalFit: 'kept', category: 'cafe' })),
    );
    const result = derivePrivateTasteSimilarity(a, b);
    expect(result.dimensions.category).toBeDefined();
    expect(result.dimensions.category?.evidenceCount).toBe(6);
  });

  it('5. no category overlap → category absent, not value 0', () => {
    const a = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ personalFit: 'kept', category: 'cafe' })),
    );
    const b = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ personalFit: 'kept', category: 'restaurant' })),
    );
    const result = derivePrivateTasteSimilarity(a, b);
    expect(result.dimensions.category).toBeUndefined();
    expect(result.reasons).toContain('category_no_overlap');
  });

  it('6. context overlap produces dimension context', () => {
    const a = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ quickSignal: { contextFit: ['calm'] } })),
    );
    const b = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ quickSignal: { contextFit: ['calm'] } })),
    );
    const result = derivePrivateTasteSimilarity(a, b);
    expect(result.dimensions.context).toBeDefined();
    expect(result.dimensions.context?.value).toBe(1);
  });

  it('7. driver overlap produces dimension driver', () => {
    const a = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ quickSignal: { driverDimensions: ['food'] } })),
    );
    const b = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ quickSignal: { driverDimensions: ['food'] } })),
    );
    const result = derivePrivateTasteSimilarity(a, b);
    expect(result.dimensions.driver).toBeDefined();
    expect(result.dimensions.driver?.value).toBe(1);
  });

  it('8. restaurant dimension overlap produces dimension restaurantDimension', () => {
    const a = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () =>
        place({ quickSignal: { driverDimensions: ['food'], restaurantDimensions: { food: 5 } } }),
      ),
    );
    const b = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () =>
        place({ quickSignal: { driverDimensions: ['food'], restaurantDimensions: { food: 5 } } }),
      ),
    );
    const result = derivePrivateTasteSimilarity(a, b);
    expect(result.dimensions.restaurantDimension).toBeDefined();
    expect(result.dimensions.restaurantDimension?.value).toBe(1);
  });

  it('9. restaurant dimension distance lowers value when ratings diverge', () => {
    const high = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () =>
        place({ quickSignal: { driverDimensions: ['food'], restaurantDimensions: { food: 5 } } }),
      ),
    );
    const low = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () =>
        place({ quickSignal: { driverDimensions: ['food'], restaurantDimensions: { food: 1 } } }),
      ),
    );
    const closeResult = derivePrivateTasteSimilarity(high, high);
    const farResult = derivePrivateTasteSimilarity(high, low);
    expect(farResult.dimensions.restaurantDimension!.value).toBeLessThan(
      closeResult.dimensions.restaurantDimension!.value,
    );
  });

  it('10. kept-kept alignment is stronger than not_for_me-not_for_me', () => {
    const keptA = vectorWithCategory(1, 0.5, 3, 3);
    const keptB = vectorWithCategory(1, 0.5, 3, 3);
    const notForMeA = vectorWithCategory(0, 0.5, 3, 0);
    const notForMeB = vectorWithCategory(0, 0.5, 3, 0);

    const keptResult = derivePrivateTasteSimilarity(keptA, keptB);
    const notForMeResult = derivePrivateTasteSimilarity(notForMeA, notForMeB);

    expect(keptResult.dimensions.category!.value).toBeGreaterThan(
      notForMeResult.dimensions.category!.value,
    );
  });

  it('11. not_for_me-not_for_me remains a useful but 0.7-weighted similarity', () => {
    const notForMeA = vectorWithCategory(0, 0.5, 3, 0);
    const notForMeB = vectorWithCategory(0, 0.5, 3, 0);
    const result = derivePrivateTasteSimilarity(notForMeA, notForMeB);
    expect(result.dimensions.category!.value).toBeCloseTo(0.7, 5);
  });

  it('12. kept vs not_for_me conflict strongly lowers value with sufficient evidence', () => {
    const kept = vectorWithCategory(1, 0.5, 3, 3);
    const notForMe = vectorWithCategory(0, 0.5, 3, 0);
    const result = derivePrivateTasteSimilarity(kept, notForMe);
    expect(result.dimensions.category!.value).toBe(0);
  });

  it('13. repeatVisit never creates an autonomous dimension', () => {
    const a = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ wentAgainAt: '2026-01-01T00:00:00Z' })),
    );
    const b = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ wentAgainAt: '2026-01-01T00:00:00Z' })),
    );
    const result = derivePrivateTasteSimilarity(a, b);
    const allowedKeys = ['category', 'context', 'driver', 'restaurantDimension', 'polarity'];
    for (const key of Object.keys(result.dimensions)) {
      expect(allowedKeys).toContain(key);
    }
    expect(result.dimensions).not.toHaveProperty('repeatVisit');
  });

  it('14. repeatVisit does not change the value by itself', () => {
    const reference = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 5 }, () => place({ personalFit: 'kept', category: 'cafe' })),
    );
    const withoutRepeat = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ personalFit: 'kept', category: 'cafe' })),
    );
    const withRepeat = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () =>
        place({ personalFit: 'kept', category: 'cafe', wentAgainAt: '2026-01-01T00:00:00Z' }),
      ),
    );

    const resultWithoutRepeat = derivePrivateTasteSimilarity(reference, withoutRepeat);
    const resultWithRepeat = derivePrivateTasteSimilarity(reference, withRepeat);

    expect(resultWithRepeat.dimensions.category!.value).toBe(
      resultWithoutRepeat.dimensions.category!.value,
    );
  });

  it('15. repeatVisit can increase confidence via already-existing source signals', () => {
    const reference = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 5 }, () => place({ personalFit: 'kept', category: 'cafe' })),
    );
    const withoutRepeat = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ personalFit: 'kept', category: 'cafe' })),
    );
    const withRepeat = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () =>
        place({ personalFit: 'kept', category: 'cafe', wentAgainAt: '2026-01-01T00:00:00Z' }),
      ),
    );

    const resultWithoutRepeat = derivePrivateTasteSimilarity(reference, withoutRepeat);
    const resultWithRepeat = derivePrivateTasteSimilarity(reference, withRepeat);

    expect(resultWithRepeat.dimensions.category!.confidence).toBeGreaterThan(
      resultWithoutRepeat.dimensions.category!.confidence,
    );
  });

  it('16. low global confidence blocks usable status even with a high dimension value', () => {
    const a = vectorWithCategory(1, 0.375, 3, 3);
    const b = vectorWithCategory(1, 0.375, 3, 3);
    const result = derivePrivateTasteSimilarity(a, b);
    expect(result.dimensions.category!.value).toBe(1);
    expect(result.status).toBe('insufficient_evidence');
  });

  it('17. high value + low confidence → insufficient_evidence', () => {
    const a = vectorWithCategory(1, 0.375, 3, 3);
    const b = vectorWithCategory(1, 0.375, 3, 3);
    const result = derivePrivateTasteSimilarity(a, b);
    expect(result.value).toBe(1);
    expect(result.confidence).toBeLessThan(0.25);
    expect(result.status).toBe('insufficient_evidence');
  });

  it('18. status is usable only with real overlap across multiple dimensions and sufficient confidence', () => {
    const a = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 4 }, () =>
        place({
          personalFit: 'kept',
          category: 'cafe',
          quickSignal: { contextFit: ['calm'], driverDimensions: ['food'] },
        }),
      ),
    );
    const b = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 4 }, () =>
        place({
          personalFit: 'kept',
          category: 'cafe',
          quickSignal: { contextFit: ['calm'], driverDimensions: ['food'] },
        }),
      ),
    );
    const result = derivePrivateTasteSimilarity(a, b);
    expect(result.confidence).toBeGreaterThanOrEqual(0.25);
    expect(result.status).toBe('usable');
  });

  it('19. is symmetric: derivePrivateTasteSimilarity(a, b) equals derivePrivateTasteSimilarity(b, a)', () => {
    const a = derivePrivateTasteVectorFromPlaces([
      place({ personalFit: 'kept', category: 'cafe', quickSignal: { contextFit: ['calm'] } }),
      place({ personalFit: 'not_for_me', category: 'bar' }),
    ]);
    const b = derivePrivateTasteVectorFromPlaces([
      place({ personalFit: 'kept', category: 'cafe', quickSignal: { contextFit: ['calm'] } }),
      place({ personalFit: 'kept', category: 'restaurant' }),
    ]);
    const forward = derivePrivateTasteSimilarity(a, b);
    const backward = derivePrivateTasteSimilarity(b, a);
    expect(forward).toEqual(backward);
  });

  it('20. is deterministic — same inputs always yield the same output', () => {
    const a = derivePrivateTasteVectorFromPlaces([place({ personalFit: 'kept' })]);
    const b = derivePrivateTasteVectorFromPlaces([place({ personalFit: 'kept' })]);
    const first = derivePrivateTasteSimilarity(a, b);
    const second = derivePrivateTasteSimilarity(a, b);
    expect(first).toEqual(second);
  });

  it('21. output contains no recommendation/recommended/rank/best field', () => {
    const a = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 4 }, () => place({ quickSignal: { contextFit: ['calm'] } })),
    );
    const b = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 4 }, () => place({ quickSignal: { contextFit: ['calm'] } })),
    );
    const result = derivePrivateTasteSimilarity(a, b);
    const json = JSON.stringify(result).toLowerCase();
    expect(json).not.toContain('recommend');
    expect(json).not.toContain('rank');
    expect(json).not.toContain('best');
  });

  it('22. output contains no moral label of a person', () => {
    const a = derivePrivateTasteVectorFromPlaces([
      place({ personalFit: 'kept' }),
      place({ personalFit: 'not_for_me' }),
    ]);
    const b = derivePrivateTasteVectorFromPlaces([
      place({ personalFit: 'kept' }),
      place({ personalFit: 'not_for_me' }),
    ]);
    const result = derivePrivateTasteSimilarity(a, b);
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

  it('23. never reads sourceRelationId, identityHint, or impression', () => {
    const a = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ personalFit: 'kept', category: 'cafe' })),
    );
    const b = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ personalFit: 'kept', category: 'cafe' })),
    );
    const baseline = derivePrivateTasteSimilarity(a, b);

    const aWithExtraFields = {
      ...a,
      sourceRelationId: 'rel-1',
      identityHint: '12 Rue de la Paix',
      impression: 'Loved it, would go back forever.',
    } as PrivateTasteVector;

    const polluted = derivePrivateTasteSimilarity(aWithExtraFields, b);
    expect(polluted).toEqual(baseline);
  });

  it('24. produces no user-facing text — reasons stay internal debug codes', () => {
    const result = derivePrivateTasteSimilarity(emptyVector(), emptyVector());
    expect(result.reasons.length).toBeGreaterThan(0);
    for (const reason of result.reasons) {
      expect(reason).toMatch(/^[a-zA-Z_]+$/);
      expect(reason).not.toContain(' ');
    }
  });

  it('25. full object shape is coherent on a realistic seed-like case', () => {
    const cafePlaces = (withRepeat: boolean) =>
      Array.from({ length: 4 }, () =>
        place({
          category: 'cafe',
          personalFit: 'kept',
          quickSignal: { contextFit: ['deep_talk', 'calm'] },
          ...(withRepeat ? { wentAgainAt: '2026-03-12T11:00:00Z' } : {}),
        }),
      );

    const a = derivePrivateTasteVectorFromPlaces([
      ...cafePlaces(true),
      place({ category: 'bar', personalFit: 'not_for_me' }),
    ]);
    const b = derivePrivateTasteVectorFromPlaces([
      ...cafePlaces(false),
      place({ category: 'bar', personalFit: 'not_for_me' }),
    ]);

    const result: PrivateTasteSimilarity = derivePrivateTasteSimilarity(a, b);

    expect(typeof result.value).toBe('number');
    expect(typeof result.confidence).toBe('number');
    expect(typeof result.evidenceCount).toBe('number');
    expect(['insufficient_evidence', 'usable']).toContain(result.status);
    expect(Array.isArray(result.reasons)).toBe(true);
    expect(result.dimensions.category).toBeDefined();
    expect(result.dimensions.context).toBeDefined();
  });
});
