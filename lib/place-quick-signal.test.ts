import { describe, expect, it } from 'vitest';

import {
  hasPlaceQuickSignal,
  sanitizePlaceContextFit,
  sanitizePlaceQuickSignal,
  sanitizeRestaurantExperienceDimensions,
} from './place-quick-signal';

describe('sanitizePlaceQuickSignal', () => {
  it('ignores an absent object', () => {
    expect(sanitizePlaceQuickSignal(undefined)).toBeUndefined();
    expect(sanitizePlaceQuickSignal(null)).toBeUndefined();
  });

  it('ignores invalid values', () => {
    expect(
      sanitizePlaceQuickSignal({
        repeatDesire: 'yes',
        shareSafe: 1,
        contextFit: 'date',
      }),
    ).toBeUndefined();
  });

  it('preserves boolean false', () => {
    expect(sanitizePlaceQuickSignal({ repeatDesire: false })).toEqual({
      repeatDesire: false,
    });
  });

  it('preserves boolean true', () => {
    expect(sanitizePlaceQuickSignal({ shareSafe: true })).toEqual({
      shareSafe: true,
    });
  });

  it('caps contextFit at max 2', () => {
    const result = sanitizePlaceContextFit(['date', 'friends', 'family']);
    expect(result).toHaveLength(2);
  });

  it('dedupes contextFit values', () => {
    const result = sanitizePlaceContextFit(['calm', 'calm', 'discovery']);
    expect(result).toEqual(['calm', 'discovery']);
  });

  it('returns contextFit in canonical order regardless of input order', () => {
    const result = sanitizePlaceContextFit(['discovery', 'date']);
    expect(result).toEqual(['date', 'discovery']);
  });

  it('returns undefined when the signal is empty', () => {
    expect(sanitizePlaceQuickSignal({})).toBeUndefined();
    expect(sanitizePlaceQuickSignal({ contextFit: [] })).toBeUndefined();
    expect(sanitizePlaceQuickSignal({ contextFit: ['not_a_real_one'] })).toBeUndefined();
  });

  it('returns the exact safe signal', () => {
    const result = sanitizePlaceQuickSignal({
      repeatDesire: true,
      shareSafe: false,
      contextFit: ['deep_talk', 'calm'],
      somethingElse: 'ignored',
    });
    expect(result).toEqual({
      repeatDesire: true,
      shareSafe: false,
      contextFit: ['deep_talk', 'calm'],
    });
  });
});

describe('sanitizeRestaurantExperienceDimensions', () => {
  it('keeps valid dimensions in the 1-5 range', () => {
    expect(sanitizeRestaurantExperienceDimensions({ food: 4, service: 2 })).toEqual({
      food: 4,
      service: 2,
    });
  });

  it('preserves the value 1 exactly, not as falsy', () => {
    expect(sanitizeRestaurantExperienceDimensions({ cleanliness: 1 })).toEqual({
      cleanliness: 1,
    });
  });

  it('preserves the value 5 exactly', () => {
    expect(sanitizeRestaurantExperienceDimensions({ food: 5 })).toEqual({ food: 5 });
  });

  it('ignores the value 0', () => {
    expect(sanitizeRestaurantExperienceDimensions({ food: 0 })).toBeUndefined();
  });

  it('ignores the value 6', () => {
    expect(sanitizeRestaurantExperienceDimensions({ food: 6 })).toBeUndefined();
  });

  it('ignores decimal values', () => {
    expect(sanitizeRestaurantExperienceDimensions({ food: 3.5 })).toBeUndefined();
  });

  it('ignores unknown dimensions', () => {
    expect(sanitizeRestaurantExperienceDimensions({ parking: 5 })).toBeUndefined();
  });
});

describe('sanitizePlaceQuickSignal — restaurantDimensions', () => {
  it('returns undefined when dimensions are empty and no other signal is set', () => {
    expect(sanitizePlaceQuickSignal({ restaurantDimensions: {} })).toBeUndefined();
    expect(sanitizePlaceQuickSignal({ restaurantDimensions: { parking: 5 } })).toBeUndefined();
  });

  it('preserves an existing quickSignal alongside dimensions', () => {
    const result = sanitizePlaceQuickSignal({
      repeatDesire: true,
      contextFit: ['calm'],
      restaurantDimensions: { food: 5 },
    });
    expect(result).toEqual({
      repeatDesire: true,
      contextFit: ['calm'],
      restaurantDimensions: { food: 5 },
    });
  });

  it('preserves false on repeatDesire/shareSafe alongside dimensions', () => {
    const result = sanitizePlaceQuickSignal({
      repeatDesire: false,
      shareSafe: false,
      restaurantDimensions: { cleanliness: 1 },
    });
    expect(result).toEqual({
      repeatDesire: false,
      shareSafe: false,
      restaurantDimensions: { cleanliness: 1 },
    });
  });

  it('returns the exact output with no derived average or global score', () => {
    const result = sanitizePlaceQuickSignal({
      restaurantDimensions: { food: 5, service: 4, atmosphere: 3, value: 4, cleanliness: 2 },
    });
    expect(result).toEqual({
      restaurantDimensions: { food: 5, service: 4, atmosphere: 3, value: 4, cleanliness: 2 },
    });
    expect(result).not.toHaveProperty('average');
    expect(result).not.toHaveProperty('score');
    expect(result).not.toHaveProperty('globalRating');
  });
});

describe('hasPlaceQuickSignal', () => {
  it('returns false for undefined', () => {
    expect(hasPlaceQuickSignal(undefined)).toBe(false);
  });

  it('returns true when at least one field is set', () => {
    expect(hasPlaceQuickSignal({ repeatDesire: false })).toBe(true);
    expect(hasPlaceQuickSignal({ contextFit: ['calm'] })).toBe(true);
  });
});
