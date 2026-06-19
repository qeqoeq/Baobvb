import { describe, expect, it } from 'vitest';

import {
  hasPlaceQuickSignal,
  sanitizePlaceContextFit,
  sanitizePlaceQuickSignal,
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

describe('hasPlaceQuickSignal', () => {
  it('returns false for undefined', () => {
    expect(hasPlaceQuickSignal(undefined)).toBe(false);
  });

  it('returns true when at least one field is set', () => {
    expect(hasPlaceQuickSignal({ repeatDesire: false })).toBe(true);
    expect(hasPlaceQuickSignal({ contextFit: ['calm'] })).toBe(true);
  });
});
