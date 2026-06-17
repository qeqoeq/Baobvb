import { describe, expect, it } from 'vitest';

import {
  canUsePrivateOpenWorlds,
  deriveKeptPlaceWorldSignals,
  deriveTrustedWorldMap,
  getRelationOpenWorldLabel,
  isRelationOpenWorld,
  RELATION_OPEN_WORLD_OPTIONS,
  sanitizeRelationOpenWorlds,
  type KeptPlaceWorldSignalPlaceInput,
  type TrustedWorldMapEvaluationInput,
  type TrustedWorldMapRelationInput,
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

describe('deriveTrustedWorldMap', () => {
  function makeRelation(
    overrides: Partial<TrustedWorldMapRelationInput> & { id?: string } = {},
  ): TrustedWorldMapRelationInput {
    return {
      id: 'r1',
      archived: false,
      privateOpenWorlds: undefined,
      localState: { revealSnapshot: { revealed: true } },
      ...overrides,
    };
  }

  function makeEval(
    relationId: string,
    trust: number | null | undefined = 4,
  ): TrustedWorldMapEvaluationInput {
    return { relationId, ratings: { trust } };
  }

  it('returns [] for empty inputs', () => {
    expect(deriveTrustedWorldMap([], [])).toEqual([]);
  });

  it('returns [] when no relation has privateOpenWorlds', () => {
    const r = makeRelation({ privateOpenWorlds: undefined });
    expect(deriveTrustedWorldMap([r], [makeEval('r1')])).toEqual([]);
  });

  it('returns [] when relation has worlds but is not revealed', () => {
    const r = makeRelation({
      privateOpenWorlds: ['sport'],
      localState: { revealSnapshot: { revealed: false } },
    });
    expect(deriveTrustedWorldMap([r], [makeEval('r1')])).toEqual([]);
  });

  it('returns [] when relation has worlds but trust < 4', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport'] });
    expect(deriveTrustedWorldMap([r], [makeEval('r1', 3)])).toEqual([]);
  });

  it('returns [] when relation has worlds but is archived', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport'], archived: true });
    expect(deriveTrustedWorldMap([r], [makeEval('r1')])).toEqual([]);
  });

  it('returns [] when no evaluation exists for the relation', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport'] });
    expect(deriveTrustedWorldMap([r], [])).toEqual([]);
  });

  it('returns [] when evaluation has no ratings.trust', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport'] });
    const e: TrustedWorldMapEvaluationInput = { relationId: 'r1', ratings: {} };
    expect(deriveTrustedWorldMap([r], [e])).toEqual([]);
  });

  it('returns [] when evaluation has no ratings object', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport'] });
    const e: TrustedWorldMapEvaluationInput = { relationId: 'r1' };
    expect(deriveTrustedWorldMap([r], [e])).toEqual([]);
  });

  it('aggregates worlds from multiple eligible relations', () => {
    const r1 = makeRelation({ id: 'r1', privateOpenWorlds: ['sport', 'learning'] });
    const r2 = makeRelation({ id: 'r2', privateOpenWorlds: ['culture'] });
    const result = deriveTrustedWorldMap([r1, r2], [makeEval('r1'), makeEval('r2')]);
    expect(result).toEqual(['learning', 'sport', 'culture']);
  });

  it('deduplicates a world present on multiple relations', () => {
    const r1 = makeRelation({ id: 'r1', privateOpenWorlds: ['sport'] });
    const r2 = makeRelation({ id: 'r2', privateOpenWorlds: ['sport', 'travel'] });
    const result = deriveTrustedWorldMap([r1, r2], [makeEval('r1'), makeEval('r2')]);
    expect(result).toEqual(['sport', 'travel']);
  });

  it('returns worlds in canonical order regardless of input order', () => {
    const r = makeRelation({ privateOpenWorlds: ['culture', 'local_life', 'sport'] });
    const result = deriveTrustedWorldMap([r], [makeEval('r1')]);
    expect(result).toEqual(['local_life', 'sport', 'culture']);
  });

  it('drops invalid world values via sanitization', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport', 'invalid_world', 42] });
    expect(deriveTrustedWorldMap([r], [makeEval('r1')])).toEqual(['sport']);
  });

  it('ignores legacy work value', () => {
    const r = makeRelation({ privateOpenWorlds: ['work', 'learning'] });
    expect(deriveTrustedWorldMap([r], [makeEval('r1')])).toEqual(['learning']);
  });

  it('ignores worlds from ineligible relations even when eligible ones are present', () => {
    const eligible = makeRelation({ id: 'r1', privateOpenWorlds: ['sport'] });
    const ineligible = makeRelation({
      id: 'r2',
      privateOpenWorlds: ['culture'],
      localState: { revealSnapshot: { revealed: false } },
    });
    const result = deriveTrustedWorldMap(
      [eligible, ineligible],
      [makeEval('r1'), makeEval('r2')],
    );
    expect(result).toEqual(['sport']);
  });

  it('output is strictly RelationOpenWorld[] — no ids, counts, or sources', () => {
    const r = makeRelation({ privateOpenWorlds: ['travel', 'creative'] });
    const result = deriveTrustedWorldMap([r], [makeEval('r1')]);
    expect(Array.isArray(result)).toBe(true);
    result.forEach((item) => {
      expect(typeof item).toBe('string');
    });
    expect(result).toEqual(['creative', 'travel']);
  });
});

describe('deriveKeptPlaceWorldSignals', () => {
  function makePlace(overrides: Partial<KeptPlaceWorldSignalPlaceInput> = {}): KeptPlaceWorldSignalPlaceInput {
    return { personalFit: 'kept', sourceRelationId: 'r1', ...overrides };
  }

  function makeRelation(
    overrides: Partial<TrustedWorldMapRelationInput> & { id?: string } = {},
  ): TrustedWorldMapRelationInput {
    return {
      id: 'r1',
      archived: false,
      privateOpenWorlds: undefined,
      localState: { revealSnapshot: { revealed: true } },
      ...overrides,
    };
  }

  function makeEval(
    relationId: string,
    trust: number | null | undefined = 4,
  ): TrustedWorldMapEvaluationInput {
    return { relationId, ratings: { trust } };
  }

  it('returns [] when no places are provided', () => {
    expect(deriveKeptPlaceWorldSignals([], [], [])).toEqual([]);
  });

  it('returns [] when no place is kept', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport'] });
    expect(deriveKeptPlaceWorldSignals([makePlace({ personalFit: 'saved' })], [r], [makeEval('r1')])).toEqual([]);
    expect(deriveKeptPlaceWorldSignals([makePlace({ personalFit: 'tried' })], [r], [makeEval('r1')])).toEqual([]);
    expect(deriveKeptPlaceWorldSignals([makePlace({ personalFit: 'not_for_me' })], [r], [makeEval('r1')])).toEqual([]);
  });

  it('ignores kept places without a sourceRelationId', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport'] });
    expect(deriveKeptPlaceWorldSignals([makePlace({ sourceRelationId: undefined })], [r], [makeEval('r1')])).toEqual([]);
    expect(deriveKeptPlaceWorldSignals([makePlace({ sourceRelationId: null })], [r], [makeEval('r1')])).toEqual([]);
  });

  it('ignores kept places whose source relation is missing from the relation list', () => {
    const r = makeRelation({ id: 'r1', privateOpenWorlds: ['sport'] });
    const place = makePlace({ sourceRelationId: 'r-unknown' });
    expect(deriveKeptPlaceWorldSignals([place], [r], [makeEval('r1')])).toEqual([]);
  });

  it('ignores kept places via non-revealed relations', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport'], localState: { revealSnapshot: { revealed: false } } });
    expect(deriveKeptPlaceWorldSignals([makePlace()], [r], [makeEval('r1')])).toEqual([]);
  });

  it('ignores kept places via relations with trust < 4', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport'] });
    expect(deriveKeptPlaceWorldSignals([makePlace()], [r], [makeEval('r1', 3)])).toEqual([]);
    expect(deriveKeptPlaceWorldSignals([makePlace()], [r], [makeEval('r1', 1)])).toEqual([]);
  });

  it('ignores kept places via relations with null trust', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport'] });
    expect(deriveKeptPlaceWorldSignals([makePlace()], [r], [makeEval('r1', null)])).toEqual([]);
  });

  it('ignores kept places via archived relations', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport'], archived: true });
    expect(deriveKeptPlaceWorldSignals([makePlace()], [r], [makeEval('r1')])).toEqual([]);
  });

  it('ignores kept places when no evaluation exists for the source relation', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport'] });
    expect(deriveKeptPlaceWorldSignals([makePlace()], [r], [])).toEqual([]);
  });

  it('collects worlds from eligible kept-place routes', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport', 'learning'] });
    const result = deriveKeptPlaceWorldSignals([makePlace()], [r], [makeEval('r1')]);
    expect(result).toEqual(['learning', 'sport']);
  });

  it('two kept places via the same relation yield worlds once only', () => {
    const p1 = makePlace({ sourceRelationId: 'r1' });
    const p2 = makePlace({ sourceRelationId: 'r1' });
    const r = makeRelation({ id: 'r1', privateOpenWorlds: ['travel', 'culture'] });
    const result = deriveKeptPlaceWorldSignals([p1, p2], [r], [makeEval('r1')]);
    expect(result).toEqual(['travel', 'culture']);
  });

  it('two different relations sharing a world produce it once', () => {
    const p1 = makePlace({ sourceRelationId: 'r1' });
    const p2 = makePlace({ sourceRelationId: 'r2' });
    const r1 = makeRelation({ id: 'r1', privateOpenWorlds: ['sport'] });
    const r2 = makeRelation({ id: 'r2', privateOpenWorlds: ['sport', 'travel'] });
    const result = deriveKeptPlaceWorldSignals([p1, p2], [r1, r2], [makeEval('r1'), makeEval('r2')]);
    expect(result).toEqual(['sport', 'travel']);
  });

  it('returns worlds in canonical order regardless of relation or place order', () => {
    const r = makeRelation({ privateOpenWorlds: ['culture', 'local_life', 'sport'] });
    const result = deriveKeptPlaceWorldSignals([makePlace()], [r], [makeEval('r1')]);
    expect(result).toEqual(['local_life', 'sport', 'culture']);
  });

  it('sanitizes invalid world values in relation privateOpenWorlds', () => {
    const r = makeRelation({ privateOpenWorlds: ['sport', 'invalid_world', 42] });
    expect(deriveKeptPlaceWorldSignals([makePlace()], [r], [makeEval('r1')])).toEqual(['sport']);
  });

  it('ignores legacy work value in relation privateOpenWorlds', () => {
    const r = makeRelation({ privateOpenWorlds: ['work', 'learning'] });
    expect(deriveKeptPlaceWorldSignals([makePlace()], [r], [makeEval('r1')])).toEqual(['learning']);
  });

  it('eligible and ineligible routes together — only eligible contribute', () => {
    const pEligible = makePlace({ sourceRelationId: 'r1' });
    const pIneligible = makePlace({ sourceRelationId: 'r2' });
    const rEligible = makeRelation({ id: 'r1', privateOpenWorlds: ['sport'] });
    const rIneligible = makeRelation({
      id: 'r2',
      privateOpenWorlds: ['culture'],
      localState: { revealSnapshot: { revealed: false } },
    });
    const result = deriveKeptPlaceWorldSignals(
      [pEligible, pIneligible],
      [rEligible, rIneligible],
      [makeEval('r1'), makeEval('r2')],
    );
    expect(result).toEqual(['sport']);
  });

  it('output is strictly RelationOpenWorld[] — no ids, counts, scores, or evidence', () => {
    const r = makeRelation({ privateOpenWorlds: ['travel', 'creative'] });
    const result = deriveKeptPlaceWorldSignals([makePlace()], [r], [makeEval('r1')]);
    expect(Array.isArray(result)).toBe(true);
    result.forEach((item) => expect(typeof item).toBe('string'));
    expect(result).toEqual(['creative', 'travel']);
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
