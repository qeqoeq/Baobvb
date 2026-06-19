import { describe, expect, it } from 'vitest';

import { PLACE_IDENTITY_HINT_MAX_LENGTH, sanitizePlaceIdentityHint } from './place-identity-hint';

describe('sanitizePlaceIdentityHint', () => {
  it('returns undefined for an empty string', () => {
    expect(sanitizePlaceIdentityHint('')).toBeUndefined();
  });

  it('returns undefined for a whitespace-only string', () => {
    expect(sanitizePlaceIdentityHint('   ')).toBeUndefined();
  });

  it('returns undefined for non-string inputs', () => {
    expect(sanitizePlaceIdentityHint(undefined)).toBeUndefined();
    expect(sanitizePlaceIdentityHint(null)).toBeUndefined();
    expect(sanitizePlaceIdentityHint(42)).toBeUndefined();
    expect(sanitizePlaceIdentityHint({})).toBeUndefined();
    expect(sanitizePlaceIdentityHint([])).toBeUndefined();
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizePlaceIdentityHint('  12 Rue de la Paix  ')).toBe('12 Rue de la Paix');
  });

  it('preserves a valid string unchanged when within length', () => {
    expect(sanitizePlaceIdentityHint('maps.app.goo.gl/abc123')).toBe('maps.app.goo.gl/abc123');
  });

  it('truncates to PLACE_IDENTITY_HINT_MAX_LENGTH characters', () => {
    const long = 'a'.repeat(PLACE_IDENTITY_HINT_MAX_LENGTH + 50);
    const result = sanitizePlaceIdentityHint(long);
    expect(result).toHaveLength(PLACE_IDENTITY_HINT_MAX_LENGTH);
    expect(result).toBe('a'.repeat(PLACE_IDENTITY_HINT_MAX_LENGTH));
  });

  it('does not truncate a string exactly at the max length', () => {
    const exact = 'b'.repeat(PLACE_IDENTITY_HINT_MAX_LENGTH);
    expect(sanitizePlaceIdentityHint(exact)).toBe(exact);
  });

  it('never rejects an over-long value — truncates instead', () => {
    const long = 'x'.repeat(500);
    expect(sanitizePlaceIdentityHint(long)).not.toBeUndefined();
  });
});
