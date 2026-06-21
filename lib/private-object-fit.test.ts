import { describe, expect, it } from 'vitest';

import {
  derivePrivateObjectFitFromTasteVector,
  type PrivateObjectFitInput,
} from './private-object-fit';
import {
  derivePrivateTasteVectorFromPlaces,
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

function object(overrides: Partial<PrivateObjectFitInput> = {}): PrivateObjectFitInput {
  return {
    category: 'cafe',
    ...overrides,
  };
}

// Richer vector: 4 kept cafes with consistent context/driver/restaurant
// signals, enough to clear all evidence/confidence thresholds.
function richCafeVector(): PrivateTasteVector {
  return derivePrivateTasteVectorFromPlaces(
    Array.from({ length: 4 }, () =>
      place({
        category: 'cafe',
        personalFit: 'kept',
        quickSignal: {
          contextFit: ['calm', 'deep_talk'],
          driverDimensions: ['food'],
          restaurantDimensions: { food: 5 },
        },
      }),
    ),
  );
}

describe('derivePrivateObjectFitFromTasteVector', () => {
  it('1. empty taste vector → insufficient_evidence', () => {
    const result = derivePrivateObjectFitFromTasteVector(emptyVector(), object());
    expect(result.status).toBe('insufficient_evidence');
    expect(result.value).toBe(0);
    expect(result.confidence).toBe(0);
  });

  it('2. low taste vector confidence → insufficient_evidence', () => {
    const sparse = derivePrivateTasteVectorFromPlaces([place({ personalFit: 'kept' })]);
    expect(sparse.confidence).toBeLessThan(0.25);
    const result = derivePrivateObjectFitFromTasteVector(sparse, object());
    expect(result.status).toBe('insufficient_evidence');
  });

  it('3. object with no useful signal beyond category → insufficient_evidence', () => {
    const vector = richCafeVector();
    const result = derivePrivateObjectFitFromTasteVector(vector, object({ category: 'restaurant' }));
    expect(result.status).toBe('insufficient_evidence');
  });

  it('4. object with only category → insufficient_evidence', () => {
    const vector = richCafeVector();
    const result = derivePrivateObjectFitFromTasteVector(vector, object({ category: 'cafe' }));
    expect(result.status).toBe('insufficient_evidence');
    expect(result.reasons).toContain('category_alone_is_not_enough');
  });

  it('5. category signal present but alone → insufficient_evidence', () => {
    const vector = richCafeVector();
    const result = derivePrivateObjectFitFromTasteVector(vector, object({ category: 'cafe' }));
    expect(result.dimensions.category).toBeDefined();
    expect(result.status).toBe('insufficient_evidence');
  });

  it('6. context overlap produces dimension context', () => {
    const vector = richCafeVector();
    const result = derivePrivateObjectFitFromTasteVector(vector, object({ contextFit: ['calm'] }));
    expect(result.dimensions.context).toBeDefined();
    expect(result.dimensions.context?.value).toBe(1);
  });

  it('7. driver overlap produces dimension driver', () => {
    const vector = richCafeVector();
    const result = derivePrivateObjectFitFromTasteVector(vector, object({ driverDimensions: ['food'] }));
    expect(result.dimensions.driver).toBeDefined();
    expect(result.dimensions.driver?.value).toBe(1);
  });

  it('8. restaurant dimension overlap produces dimension restaurantDimension', () => {
    const vector = richCafeVector();
    const result = derivePrivateObjectFitFromTasteVector(
      vector,
      object({ driverDimensions: ['food'], restaurantDimensions: { food: 5 } }),
    );
    expect(result.dimensions.restaurantDimension).toBeDefined();
    expect(result.dimensions.restaurantDimension?.value).toBe(1);
  });

  it('9. restaurant dimension conflict lowers the value', () => {
    const vector = richCafeVector(); // historically rates food at 5 (value 1)
    const aligned = derivePrivateObjectFitFromTasteVector(
      vector,
      object({ driverDimensions: ['food'], restaurantDimensions: { food: 5 } }),
    );
    const conflicting = derivePrivateObjectFitFromTasteVector(
      vector,
      object({ driverDimensions: ['food'], restaurantDimensions: { food: 1 } }),
    );
    expect(conflicting.dimensions.restaurantDimension!.value).toBeLessThan(
      aligned.dimensions.restaurantDimension!.value,
    );
  });

  it('10. restaurantDimensions are ignored when not also listed as driverDimensions', () => {
    const vector = richCafeVector();
    const result = derivePrivateObjectFitFromTasteVector(
      vector,
      object({ driverDimensions: [], restaurantDimensions: { food: 1 } }),
    );
    expect(result.dimensions.restaurantDimension).toBeUndefined();
  });

  it('11. absence of overlap never produces a value of 0', () => {
    const vector = richCafeVector();
    const result = derivePrivateObjectFitFromTasteVector(vector, object({ contextFit: ['work_focus'] }));
    expect(result.dimensions.context).toBeUndefined();
    expect(result.reasons).toContain('context_no_overlap');
  });

  it('12. high value + low confidence → insufficient_evidence', () => {
    // A single, perfectly-matching dimension (context) is not enough to
    // clear the 4-dimension confidence floor.
    const vector = derivePrivateTasteVectorFromPlaces(
      Array.from({ length: 3 }, () => place({ quickSignal: { contextFit: ['calm'] } })),
    );
    const result = derivePrivateObjectFitFromTasteVector(vector, object({ contextFit: ['calm'] }));
    expect(result.dimensions.context?.value).toBe(1);
    expect(result.confidence).toBeLessThan(0.25);
    expect(result.status).toBe('insufficient_evidence');
  });

  it('13. usable only with at least one non-category dimension and sufficient confidence', () => {
    const vector = richCafeVector();
    const result = derivePrivateObjectFitFromTasteVector(
      vector,
      object({
        category: 'cafe',
        contextFit: ['calm', 'deep_talk'],
        driverDimensions: ['food'],
        restaurantDimensions: { food: 5 },
      }),
    );
    expect(result.status).toBe('usable');
    expect(result.confidence).toBeGreaterThanOrEqual(0.25);
  });

  it('14. never reads personalFit (not present on the input type)', () => {
    const vector = richCafeVector();
    const baseline = derivePrivateObjectFitFromTasteVector(vector, object({ contextFit: ['calm'] }));
    const polluted = derivePrivateObjectFitFromTasteVector(vector, {
      ...object({ contextFit: ['calm'] }),
      personalFit: 'kept',
    } as PrivateObjectFitInput);
    expect(polluted).toEqual(baseline);
  });

  it('15. never reads sourceRelationId', () => {
    const vector = richCafeVector();
    const baseline = derivePrivateObjectFitFromTasteVector(vector, object({ contextFit: ['calm'] }));
    const polluted = derivePrivateObjectFitFromTasteVector(vector, {
      ...object({ contextFit: ['calm'] }),
      sourceRelationId: 'rel-1',
    } as PrivateObjectFitInput);
    expect(polluted).toEqual(baseline);
  });

  it('16. never reads identityHint', () => {
    const vector = richCafeVector();
    const baseline = derivePrivateObjectFitFromTasteVector(vector, object({ contextFit: ['calm'] }));
    const polluted = derivePrivateObjectFitFromTasteVector(vector, {
      ...object({ contextFit: ['calm'] }),
      identityHint: '12 Rue de la Paix',
    } as PrivateObjectFitInput);
    expect(polluted).toEqual(baseline);
  });

  it('17. never reads impression', () => {
    const vector = richCafeVector();
    const baseline = derivePrivateObjectFitFromTasteVector(vector, object({ contextFit: ['calm'] }));
    const polluted = derivePrivateObjectFitFromTasteVector(vector, {
      ...object({ contextFit: ['calm'] }),
      impression: 'Loved it, would go back forever.',
    } as PrivateObjectFitInput);
    expect(polluted).toEqual(baseline);
  });

  it('18. never reads shareSafe', () => {
    const vector = richCafeVector();
    const baseline = derivePrivateObjectFitFromTasteVector(vector, object({ contextFit: ['calm'] }));
    const polluted = derivePrivateObjectFitFromTasteVector(vector, {
      ...object({ contextFit: ['calm'] }),
      shareSafe: true,
    } as PrivateObjectFitInput);
    expect(polluted).toEqual(baseline);
  });

  it('19. never reads worldFit', () => {
    const vector = richCafeVector();
    const baseline = derivePrivateObjectFitFromTasteVector(vector, object({ contextFit: ['calm'] }));
    const polluted = derivePrivateObjectFitFromTasteVector(vector, {
      ...object({ contextFit: ['calm'] }),
      worldFit: ['travel'],
    } as PrivateObjectFitInput);
    expect(polluted).toEqual(baseline);
  });

  it('20. never reads wentAgainAt', () => {
    const vector = richCafeVector();
    const baseline = derivePrivateObjectFitFromTasteVector(vector, object({ contextFit: ['calm'] }));
    const polluted = derivePrivateObjectFitFromTasteVector(vector, {
      ...object({ contextFit: ['calm'] }),
      wentAgainAt: '2026-03-12T11:00:00Z',
    } as PrivateObjectFitInput);
    expect(polluted).toEqual(baseline);
  });

  it('21. output contains no recommendation/recommended/rank/best field', () => {
    const vector = richCafeVector();
    const result = derivePrivateObjectFitFromTasteVector(
      vector,
      object({ contextFit: ['calm'], driverDimensions: ['food'], restaurantDimensions: { food: 5 } }),
    );
    const json = JSON.stringify(result).toLowerCase();
    expect(json).not.toContain('recommend');
    expect(json).not.toContain('rank');
    expect(json).not.toContain('best');
  });

  it('22. output contains no moral label of a person', () => {
    const vector = richCafeVector();
    const result = derivePrivateObjectFitFromTasteVector(
      vector,
      object({ contextFit: ['calm'], driverDimensions: ['food'], restaurantDimensions: { food: 5 } }),
    );
    const json = JSON.stringify(result).toLowerCase();
    for (const forbidden of [
      'goodtaste',
      'badtaste',
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

  it('23. is deterministic — same inputs always yield the same output', () => {
    const vector = richCafeVector();
    const input = object({ contextFit: ['calm'], driverDimensions: ['food'], restaurantDimensions: { food: 5 } });
    const first = derivePrivateObjectFitFromTasteVector(vector, input);
    const second = derivePrivateObjectFitFromTasteVector(vector, input);
    expect(first).toEqual(second);
  });

  it('24. does not depend on any route or relation field (structurally impossible)', () => {
    const vector = richCafeVector();
    const result = derivePrivateObjectFitFromTasteVector(vector, object({ contextFit: ['calm'] }));
    const json = JSON.stringify(result).toLowerCase();
    expect(json).not.toContain('route');
    expect(json).not.toContain('relation');
    expect(json).not.toContain('trust');
  });

  it('25. coherent snapshot on a realistic calm-cafe / deep_talk / food case', () => {
    const vector = richCafeVector();
    const result = derivePrivateObjectFitFromTasteVector(
      vector,
      object({
        category: 'cafe',
        contextFit: ['calm', 'deep_talk'],
        driverDimensions: ['food'],
        restaurantDimensions: { food: 5 },
      }),
    );
    expect(result.status).toBe('usable');
    expect(result.dimensions.category?.value).toBe(1);
    expect(result.dimensions.context?.value).toBe(1);
    expect(result.dimensions.driver?.value).toBe(1);
    expect(result.dimensions.restaurantDimension?.value).toBe(1);
    expect(result.value).toBeCloseTo(1, 5);
    expect(result.reasons).toEqual([]);
  });
});
