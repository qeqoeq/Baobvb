import { describe, expect, it } from 'vitest';

import {
  canUsePrivateOpenWorlds,
  getRelationOpenWorldLabel,
  isRelationOpenWorld,
  RELATION_OPEN_WORLD_OPTIONS,
  sanitizeRelationOpenWorlds,
} from './relation-open-worlds';

describe('isRelationOpenWorld', () => {
  it('returns true for every valid world', () => {
    for (const world of RELATION_OPEN_WORLD_OPTIONS) {
      expect(isRelationOpenWorld(world)).toBe(true);
    }
  });

  it('returns false for an unknown string', () => {
    expect(isRelationOpenWorld('skills')).toBe(false);
    expect(isRelationOpenWorld('expertise')).toBe(false);
  });

  it('returns false for work (removed from V0)', () => {
    expect(isRelationOpenWorld('work')).toBe(false);
  });

  it('returns false for non-string values', () => {
    expect(isRelationOpenWorld(undefined)).toBe(false);
    expect(isRelationOpenWorld(null)).toBe(false);
    expect(isRelationOpenWorld(42)).toBe(false);
    expect(isRelationOpenWorld({})).toBe(false);
  });
});

describe('sanitizeRelationOpenWorlds', () => {
  it('returns [] for non-array input', () => {
    expect(sanitizeRelationOpenWorlds(null)).toEqual([]);
    expect(sanitizeRelationOpenWorlds(undefined)).toEqual([]);
    expect(sanitizeRelationOpenWorlds('local_life')).toEqual([]);
    expect(sanitizeRelationOpenWorlds({})).toEqual([]);
  });

  it('returns [] for empty array', () => {
    expect(sanitizeRelationOpenWorlds([])).toEqual([]);
  });

  it('filters out invalid values, including work removed from V0', () => {
    expect(sanitizeRelationOpenWorlds(['work', 'invalid', 'sport'])).toEqual(['sport']);
    expect(sanitizeRelationOpenWorlds(['work', 'learning'])).toEqual(['learning']);
  });

  it('deduplicates repeated values', () => {
    expect(sanitizeRelationOpenWorlds(['sport', 'sport', 'culture'])).toEqual(['sport', 'culture']);
  });

  it('enforces max 3 worlds', () => {
    const input = ['local_life', 'learning', 'creative', 'sport'];
    const result = sanitizeRelationOpenWorlds(input);
    expect(result).toHaveLength(3);
    expect(result).toEqual(['local_life', 'learning', 'creative']);
  });

  it('returns results in canonical order regardless of input order', () => {
    const result = sanitizeRelationOpenWorlds(['sport', 'local_life', 'culture']);
    expect(result).toEqual(['local_life', 'sport', 'culture']);
  });

  it('canonical order with max 3 — first 3 valid in input, sorted canonically', () => {
    // input: culture, travel, sport, creative → first 3 unique valid: culture, travel, sport
    // canonical order of those 3: sport (idx 4), travel (idx 5), culture (idx 6)
    const result = sanitizeRelationOpenWorlds(['culture', 'travel', 'sport', 'creative']);
    expect(result).toHaveLength(3);
    expect(result).toEqual(['sport', 'travel', 'culture']);
  });
});

describe('getRelationOpenWorldLabel', () => {
  it('returns the correct label for each V0 world', () => {
    expect(getRelationOpenWorldLabel('local_life')).toBe('Local life');
    expect(getRelationOpenWorldLabel('learning')).toBe('Learning');
    expect(getRelationOpenWorldLabel('creative')).toBe('Creative');
    expect(getRelationOpenWorldLabel('sport')).toBe('Sport');
    expect(getRelationOpenWorldLabel('travel')).toBe('Travel');
    expect(getRelationOpenWorldLabel('culture')).toBe('Culture');
  });
});

describe('canUsePrivateOpenWorlds', () => {
  it('returns true when revealed, trust >= 4, not archived', () => {
    expect(canUsePrivateOpenWorlds({ isRevealed: true, trustRating: 4 })).toBe(true);
    expect(canUsePrivateOpenWorlds({ isRevealed: true, trustRating: 5 })).toBe(true);
  });

  it('returns false when not revealed', () => {
    expect(canUsePrivateOpenWorlds({ isRevealed: false, trustRating: 5 })).toBe(false);
  });

  it('returns false when trust rating is null', () => {
    expect(canUsePrivateOpenWorlds({ isRevealed: true, trustRating: null })).toBe(false);
  });

  it('returns false when trust rating is below 4', () => {
    expect(canUsePrivateOpenWorlds({ isRevealed: true, trustRating: 3 })).toBe(false);
    expect(canUsePrivateOpenWorlds({ isRevealed: true, trustRating: 1 })).toBe(false);
  });

  it('returns false when archived', () => {
    expect(canUsePrivateOpenWorlds({ isRevealed: true, trustRating: 5, isArchived: true })).toBe(false);
  });

  it('returns true when isArchived is undefined (not archived)', () => {
    expect(canUsePrivateOpenWorlds({ isRevealed: true, trustRating: 4, isArchived: undefined })).toBe(true);
  });
});
