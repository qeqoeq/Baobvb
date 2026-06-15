import { describe, expect, it } from 'vitest';

import {
  PLACE_CATEGORY_LABELS,
  PLACE_PERSONAL_FIT_LABELS,
  getPlaceCategoryLabel,
  getPlaceFitLabel,
  getPlaceReading,
  sanitizePlacePersonalFit,
  sanitizePlaceSourceRelationId,
} from './places';

// ── getPlaceCategoryLabel ────────────────────────────────────────────────────

describe('getPlaceCategoryLabel', () => {
  it('returns correct label for each known category', () => {
    expect(getPlaceCategoryLabel('restaurant')).toBe(PLACE_CATEGORY_LABELS.restaurant);
    expect(getPlaceCategoryLabel('cafe')).toBe(PLACE_CATEGORY_LABELS.cafe);
    expect(getPlaceCategoryLabel('bar')).toBe(PLACE_CATEGORY_LABELS.bar);
    expect(getPlaceCategoryLabel('spot')).toBe(PLACE_CATEGORY_LABELS.spot);
    expect(getPlaceCategoryLabel('other')).toBe(PLACE_CATEGORY_LABELS.other);
  });

  it('returns "Other" for unknown string', () => {
    expect(getPlaceCategoryLabel('museum')).toBe('Other');
    expect(getPlaceCategoryLabel('')).toBe('Other');
  });

  it('returns "Other" for non-string inputs', () => {
    expect(getPlaceCategoryLabel(null)).toBe('Other');
    expect(getPlaceCategoryLabel(undefined)).toBe('Other');
    expect(getPlaceCategoryLabel(3)).toBe('Other');
  });
});

// ── getPlaceFitLabel ─────────────────────────────────────────────────────────

describe('getPlaceFitLabel', () => {
  it('returns correct label for each valid fit', () => {
    expect(getPlaceFitLabel('saved')).toBe(PLACE_PERSONAL_FIT_LABELS.saved);
    expect(getPlaceFitLabel('tried')).toBe(PLACE_PERSONAL_FIT_LABELS.tried);
    expect(getPlaceFitLabel('kept')).toBe(PLACE_PERSONAL_FIT_LABELS.kept);
    expect(getPlaceFitLabel('not_for_me')).toBe(PLACE_PERSONAL_FIT_LABELS.not_for_me);
  });

  it('returns "Saved" as fallback for unknown string', () => {
    expect(getPlaceFitLabel('loved_it')).toBe('Saved');
    expect(getPlaceFitLabel('')).toBe('Saved');
  });

  it('returns "Saved" for non-string inputs', () => {
    expect(getPlaceFitLabel(null)).toBe('Saved');
    expect(getPlaceFitLabel(undefined)).toBe('Saved');
    expect(getPlaceFitLabel(4)).toBe('Saved');
  });

  it('labels contain no numeric score', () => {
    for (const label of Object.values(PLACE_PERSONAL_FIT_LABELS)) {
      expect(label).not.toMatch(/\d/);
    }
  });
});

// ── getPlaceReading ──────────────────────────────────────────────────────────

describe('getPlaceReading', () => {
  it('returns impression when present', () => {
    const place = { personalFit: 'saved' as const, impression: 'Great light in the morning.' };
    expect(getPlaceReading(place)).toBe('Great light in the morning.');
  });

  it('returns impression even for not_for_me', () => {
    const place = { personalFit: 'not_for_me' as const, impression: 'Too loud for me.' };
    expect(getPlaceReading(place)).toBe('Too loud for me.');
  });

  it('returns fit fallback when no impression — saved', () => {
    expect(getPlaceReading({ personalFit: 'saved' })).toBe('Saved for later.');
  });

  it('returns fit fallback when no impression — tried', () => {
    expect(getPlaceReading({ personalFit: 'tried' })).toBe('Tried once.');
  });

  it('returns fit fallback when no impression — kept', () => {
    expect(getPlaceReading({ personalFit: 'kept' })).toBe('Kept in your places.');
  });

  it('returns fit fallback when no impression — not_for_me', () => {
    expect(getPlaceReading({ personalFit: 'not_for_me' })).toBe('Not for me.');
  });

  it('returns fallback when impression is empty string', () => {
    const place = { personalFit: 'tried' as const, impression: '   ' };
    expect(getPlaceReading(place)).toBe('Tried once.');
  });

  it('fallback text contains no numeric score', () => {
    const fits = ['saved', 'tried', 'kept', 'not_for_me'] as const;
    for (const fit of fits) {
      const text = getPlaceReading({ personalFit: fit });
      expect(text).not.toMatch(/\d/);
    }
  });
});

// ── sanitizePlacePersonalFit ─────────────────────────────────────────────────

describe('sanitizePlacePersonalFit', () => {
  it('accepts all valid fits', () => {
    expect(sanitizePlacePersonalFit('saved')).toBe('saved');
    expect(sanitizePlacePersonalFit('tried')).toBe('tried');
    expect(sanitizePlacePersonalFit('kept')).toBe('kept');
    expect(sanitizePlacePersonalFit('not_for_me')).toBe('not_for_me');
  });

  it('returns "saved" for unknown string', () => {
    expect(sanitizePlacePersonalFit('loved_it')).toBe('saved');
    expect(sanitizePlacePersonalFit('5')).toBe('saved');
    expect(sanitizePlacePersonalFit('')).toBe('saved');
  });

  it('returns "saved" for non-string inputs', () => {
    expect(sanitizePlacePersonalFit(null)).toBe('saved');
    expect(sanitizePlacePersonalFit(undefined)).toBe('saved');
    expect(sanitizePlacePersonalFit(4)).toBe('saved');
    expect(sanitizePlacePersonalFit({})).toBe('saved');
  });
});

// ── legacy hydration (numeric rating → personalFit) ──────────────────────────
// The store's sanitizePlacePersonalFit handles legacy numeric values.
// This covers the conversion in the lib helper used by display surfaces.

describe('sanitizePlacePersonalFit — legacy numeric rating migration', () => {
  it('numeric input falls back to "saved" (migration is store-level, not lib-level)', () => {
    // lib/places.ts sanitizePlacePersonalFit intentionally does not handle
    // legacy numeric values — that conversion lives in the store hydration layer
    // where both `personalFit` and `rating` fields can be inspected together.
    expect(sanitizePlacePersonalFit(5)).toBe('saved');
    expect(sanitizePlacePersonalFit(1)).toBe('saved');
  });
});

// ── sanitizePlaceSourceRelationId ────────────────────────────────────────────

describe('sanitizePlaceSourceRelationId', () => {
  it('returns trimmed string for valid non-empty input', () => {
    expect(sanitizePlaceSourceRelationId('abc')).toBe('abc');
    expect(sanitizePlaceSourceRelationId('  abc  ')).toBe('abc');
    expect(sanitizePlaceSourceRelationId('rel-uuid-123')).toBe('rel-uuid-123');
  });

  it('returns undefined for empty or whitespace-only strings', () => {
    expect(sanitizePlaceSourceRelationId('')).toBeUndefined();
    expect(sanitizePlaceSourceRelationId('   ')).toBeUndefined();
  });

  it('returns undefined for non-string inputs', () => {
    expect(sanitizePlaceSourceRelationId(null)).toBeUndefined();
    expect(sanitizePlaceSourceRelationId(undefined)).toBeUndefined();
    expect(sanitizePlaceSourceRelationId(42)).toBeUndefined();
    expect(sanitizePlaceSourceRelationId({})).toBeUndefined();
    expect(sanitizePlaceSourceRelationId([])).toBeUndefined();
    expect(sanitizePlaceSourceRelationId(true)).toBeUndefined();
  });
});
