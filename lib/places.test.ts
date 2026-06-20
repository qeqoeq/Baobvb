import { describe, expect, it } from 'vitest';

import type { Place } from '@/store/useRelationsStore';
import {
  PLACE_CATEGORY_LABELS,
  PLACE_PERSONAL_FIT_LABELS,
  deriveRouteTerritorySignals,
  deriveTrustWorldTerritory,
  getPlaceCategoryLabel,
  getPlaceFitLabel,
  getPlaceReading,
  mergePlaceUpdate,
  sanitizePlacePersonalFit,
  sanitizePlaceSourceRelationId,
  type RouteTerritorySignal,
} from './places';
import type {
  TrustedWorldMapEvaluationInput,
  TrustedWorldMapRelationInput,
} from './relation-open-worlds';

// ── trust gate fixtures for deriveRouteTerritorySignals ──────────────────────
// Mirrors the gate already used by deriveTrustedWorldMap /
// deriveKeptPlaceWorldSignals: revealed, not archived, trustRating >= 4.

function trustedRelation(
  id: string,
  overrides: Partial<TrustedWorldMapRelationInput> = {},
): TrustedWorldMapRelationInput {
  return {
    id,
    archived: false,
    localState: { revealSnapshot: { revealed: true } },
    ...overrides,
  };
}

function evaluationWithTrust(
  relationId: string,
  trust: number | null,
): TrustedWorldMapEvaluationInput {
  return { relationId, ratings: { trust } };
}

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

// ── sourceRelationId preservation on update (regression guard for X.15b) ──────
// setPlace spreads the existing place then overwrites only the mutable fields.
// The original bug: explicitly writing
//   sourceRelationId: sanitizePlaceSourceRelationId(update.sourceRelationId)
// resolved to undefined when the edit screen did not pass sourceRelationId,
// and that undefined overwrote the value coming from the spread.
// Fix: remove sourceRelationId from PlaceUpdateInput and from the return value.

describe('sourceRelationId preservation through place update spread', () => {
  it('spread preserves sourceRelationId when update omits it', () => {
    const existing = { id: 'p-1', name: 'Le Marché', sourceRelationId: 'rel-abc-123' };
    const updated = { ...existing, name: 'Le Nouveau Marché' };
    expect(updated.sourceRelationId).toBe('rel-abc-123');
  });

  it('demonstrates the original bug: explicit undefined write overwrites spread', () => {
    const existing = { sourceRelationId: 'rel-abc-123' };
    const buggy = { ...existing, sourceRelationId: sanitizePlaceSourceRelationId(undefined) };
    expect(buggy.sourceRelationId).toBeUndefined();
  });

  it('demonstrates the fix: no explicit write leaves spread value intact', () => {
    const existing = { sourceRelationId: 'rel-abc-123' };
    const fixed = { ...existing };
    expect(fixed.sourceRelationId).toBe('rel-abc-123');
  });
});

// ── deriveRouteTerritorySignals ──────────────────────────────────────────────

describe('deriveRouteTerritorySignals', () => {
  it('returns empty array for empty input', () => {
    expect(deriveRouteTerritorySignals([])).toEqual([]);
  });

  it('ignores places without sourceRelationId', () => {
    const places: Place[] = [
      { id: 'p-1', name: 'Café A', category: 'cafe', personalFit: 'kept' } as Place,
    ];
    expect(deriveRouteTerritorySignals(places)).toEqual([]);
  });

  it('ignores saved and not_for_me regardless of sourceRelationId', () => {
    const places: Place[] = [
      { id: 'p-1', name: 'Café A', category: 'cafe', personalFit: 'saved', sourceRelationId: 'rel-1' } as Place,
      { id: 'p-2', name: 'Bar B', category: 'bar', personalFit: 'not_for_me', sourceRelationId: 'rel-1' } as Place,
    ];
    expect(deriveRouteTerritorySignals(places)).toEqual([]);
  });

  it('kept + sourceRelationId + category produces an observed signal (trusted source)', () => {
    const places: Place[] = [
      { id: 'p-1', name: 'Café A', category: 'cafe', personalFit: 'kept', sourceRelationId: 'rel-1' } as Place,
    ];
    const relations = [trustedRelation('rel-1')];
    const evaluations = [evaluationWithTrust('rel-1', 5)];
    const signals = deriveRouteTerritorySignals(places, relations, evaluations);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      sourceRelationId: 'rel-1',
      category: 'cafe',
      keptCount: 1,
      triedCount: 0,
      evidencePlaceIds: ['p-1'],
      strength: 'observed',
    });
  });

  it('two kept in same route+category → strength strong (trusted source)', () => {
    const places: Place[] = [
      { id: 'p-1', name: 'Café A', category: 'cafe', personalFit: 'kept', sourceRelationId: 'rel-1' } as Place,
      { id: 'p-2', name: 'Café B', category: 'cafe', personalFit: 'kept', sourceRelationId: 'rel-1' } as Place,
    ];
    const relations = [trustedRelation('rel-1')];
    const evaluations = [evaluationWithTrust('rel-1', 5)];
    const signals = deriveRouteTerritorySignals(places, relations, evaluations);
    expect(signals).toHaveLength(1);
    expect(signals[0].strength).toBe('strong');
    expect(signals[0].keptCount).toBe(2);
  });

  it('tried without kept produces no signal (trusted source)', () => {
    const places: Place[] = [
      { id: 'p-1', name: 'Café A', category: 'cafe', personalFit: 'tried', sourceRelationId: 'rel-1' } as Place,
    ];
    const relations = [trustedRelation('rel-1')];
    const evaluations = [evaluationWithTrust('rel-1', 5)];
    expect(deriveRouteTerritorySignals(places, relations, evaluations)).toEqual([]);
  });

  it('tried + kept in same category → triedCount included in signal (trusted source)', () => {
    const places: Place[] = [
      { id: 'p-1', name: 'Café A', category: 'cafe', personalFit: 'kept', sourceRelationId: 'rel-1' } as Place,
      { id: 'p-2', name: 'Café B', category: 'cafe', personalFit: 'tried', sourceRelationId: 'rel-1' } as Place,
    ];
    const relations = [trustedRelation('rel-1')];
    const evaluations = [evaluationWithTrust('rel-1', 5)];
    const signals = deriveRouteTerritorySignals(places, relations, evaluations);
    expect(signals).toHaveLength(1);
    expect(signals[0].keptCount).toBe(1);
    expect(signals[0].triedCount).toBe(1);
  });

  it('evidencePlaceIds contains only kept IDs, not tried (trusted source)', () => {
    const places: Place[] = [
      { id: 'p-kept', name: 'Café A', category: 'cafe', personalFit: 'kept', sourceRelationId: 'rel-1' } as Place,
      { id: 'p-tried', name: 'Café B', category: 'cafe', personalFit: 'tried', sourceRelationId: 'rel-1' } as Place,
    ];
    const relations = [trustedRelation('rel-1')];
    const evaluations = [evaluationWithTrust('rel-1', 5)];
    const signals = deriveRouteTerritorySignals(places, relations, evaluations);
    expect(signals[0].evidencePlaceIds).toEqual(['p-kept']);
    expect(signals[0].evidencePlaceIds).not.toContain('p-tried');
  });

  it('multiple routes → separate signals per route (both trusted)', () => {
    const places: Place[] = [
      { id: 'p-1', name: 'Café A', category: 'cafe', personalFit: 'kept', sourceRelationId: 'rel-1' } as Place,
      { id: 'p-2', name: 'Café B', category: 'cafe', personalFit: 'kept', sourceRelationId: 'rel-2' } as Place,
    ];
    const relations = [trustedRelation('rel-1'), trustedRelation('rel-2')];
    const evaluations = [evaluationWithTrust('rel-1', 5), evaluationWithTrust('rel-2', 4)];
    const signals = deriveRouteTerritorySignals(places, relations, evaluations);
    expect(signals).toHaveLength(2);
    expect(signals.map((s) => s.sourceRelationId)).toContain('rel-1');
    expect(signals.map((s) => s.sourceRelationId)).toContain('rel-2');
  });

  it('same route, different categories → separate signals per category (trusted source)', () => {
    const places: Place[] = [
      { id: 'p-1', name: 'Café A', category: 'cafe', personalFit: 'kept', sourceRelationId: 'rel-1' } as Place,
      { id: 'p-2', name: 'Bar B', category: 'bar', personalFit: 'kept', sourceRelationId: 'rel-1' } as Place,
    ];
    const relations = [trustedRelation('rel-1')];
    const evaluations = [evaluationWithTrust('rel-1', 5)];
    const signals = deriveRouteTerritorySignals(places, relations, evaluations);
    expect(signals).toHaveLength(2);
    expect(signals.map((s) => s.category)).toContain('cafe');
    expect(signals.map((s) => s.category)).toContain('bar');
  });

  it('result is sorted by sourceRelationId then category (both trusted)', () => {
    const places: Place[] = [
      { id: 'p-1', name: 'Restaurant A', category: 'restaurant', personalFit: 'kept', sourceRelationId: 'rel-2' } as Place,
      { id: 'p-2', name: 'Café B', category: 'cafe', personalFit: 'kept', sourceRelationId: 'rel-1' } as Place,
      { id: 'p-3', name: 'Bar C', category: 'bar', personalFit: 'kept', sourceRelationId: 'rel-1' } as Place,
    ];
    const relations = [trustedRelation('rel-1'), trustedRelation('rel-2')];
    const evaluations = [evaluationWithTrust('rel-1', 5), evaluationWithTrust('rel-2', 4)];
    const signals = deriveRouteTerritorySignals(places, relations, evaluations);
    expect(signals[0]).toMatchObject({ sourceRelationId: 'rel-1', category: 'bar' });
    expect(signals[1]).toMatchObject({ sourceRelationId: 'rel-1', category: 'cafe' });
    expect(signals[2]).toMatchObject({ sourceRelationId: 'rel-2', category: 'restaurant' });
  });

  // ── trust gate coverage (X.38) ──────────────────────────────────────────────

  describe('trust gate', () => {
    const place: Place = {
      id: 'p-1',
      name: 'Café A',
      category: 'cafe',
      personalFit: 'kept',
      sourceRelationId: 'rel-1',
    } as Place;

    it('relation source trust 5 → signal conserved', () => {
      const relations = [trustedRelation('rel-1')];
      const evaluations = [evaluationWithTrust('rel-1', 5)];
      expect(deriveRouteTerritorySignals([place], relations, evaluations)).toHaveLength(1);
    });

    it('relation source trust 3 → signal excluded', () => {
      const relations = [trustedRelation('rel-1')];
      const evaluations = [evaluationWithTrust('rel-1', 3)];
      expect(deriveRouteTerritorySignals([place], relations, evaluations)).toEqual([]);
    });

    it('relation source archived → signal excluded', () => {
      const relations = [trustedRelation('rel-1', { archived: true })];
      const evaluations = [evaluationWithTrust('rel-1', 5)];
      expect(deriveRouteTerritorySignals([place], relations, evaluations)).toEqual([]);
    });

    it('relation source not revealed → signal excluded', () => {
      const relations = [
        trustedRelation('rel-1', { localState: { revealSnapshot: { revealed: false } } }),
      ];
      const evaluations = [evaluationWithTrust('rel-1', 5)];
      expect(deriveRouteTerritorySignals([place], relations, evaluations)).toEqual([]);
    });

    it('relation source missing from input → signal excluded', () => {
      expect(deriveRouteTerritorySignals([place], [], [])).toEqual([]);
    });

    it('relations/evaluations omitted entirely → fails closed, signal excluded', () => {
      expect(deriveRouteTerritorySignals([place])).toEqual([]);
    });
  });
});

// ── deriveTrustWorldTerritory ────────────────────────────────────────────────

describe('deriveTrustWorldTerritory', () => {
  it('returns empty categories for empty signals', () => {
    expect(deriveTrustWorldTerritory([])).toEqual({ categories: [] });
  });

  it('single observed signal → single observed territory', () => {
    const signals: RouteTerritorySignal[] = [
      { sourceRelationId: 'rel-1', category: 'cafe', keptCount: 1, triedCount: 0, evidencePlaceIds: ['p-1'], strength: 'observed' },
    ];
    expect(deriveTrustWorldTerritory(signals)).toEqual({
      categories: [{ category: 'cafe', strength: 'observed' }],
    });
  });

  it('single strong signal → single strong territory', () => {
    const signals: RouteTerritorySignal[] = [
      { sourceRelationId: 'rel-1', category: 'cafe', keptCount: 2, triedCount: 0, evidencePlaceIds: ['p-1', 'p-2'], strength: 'strong' },
    ];
    expect(deriveTrustWorldTerritory(signals)).toEqual({
      categories: [{ category: 'cafe', strength: 'strong' }],
    });
  });

  it('strong wins over observed for same category across routes', () => {
    const signals: RouteTerritorySignal[] = [
      { sourceRelationId: 'rel-1', category: 'cafe', keptCount: 1, triedCount: 0, evidencePlaceIds: ['p-1'], strength: 'observed' },
      { sourceRelationId: 'rel-2', category: 'cafe', keptCount: 2, triedCount: 0, evidencePlaceIds: ['p-2', 'p-3'], strength: 'strong' },
    ];
    const territory = deriveTrustWorldTerritory(signals);
    expect(territory.categories).toHaveLength(1);
    expect(territory.categories[0]).toEqual({ category: 'cafe', strength: 'strong' });
  });

  it('observed does not downgrade strong', () => {
    const signals: RouteTerritorySignal[] = [
      { sourceRelationId: 'rel-1', category: 'cafe', keptCount: 2, triedCount: 0, evidencePlaceIds: ['p-1', 'p-2'], strength: 'strong' },
      { sourceRelationId: 'rel-2', category: 'cafe', keptCount: 1, triedCount: 0, evidencePlaceIds: ['p-3'], strength: 'observed' },
    ];
    const territory = deriveTrustWorldTerritory(signals);
    expect(territory.categories[0].strength).toBe('strong');
  });

  it('strips sourceRelationId — territory entries carry no attribution', () => {
    const signals: RouteTerritorySignal[] = [
      { sourceRelationId: 'rel-secret', category: 'bar', keptCount: 1, triedCount: 0, evidencePlaceIds: ['p-1'], strength: 'observed' },
    ];
    const territory = deriveTrustWorldTerritory(signals);
    const entry = territory.categories[0] as Record<string, unknown>;
    expect(entry.sourceRelationId).toBeUndefined();
  });

  it('multiple categories appear in sorted order', () => {
    const signals: RouteTerritorySignal[] = [
      { sourceRelationId: 'rel-1', category: 'restaurant', keptCount: 1, triedCount: 0, evidencePlaceIds: ['p-1'], strength: 'observed' },
      { sourceRelationId: 'rel-1', category: 'bar', keptCount: 2, triedCount: 0, evidencePlaceIds: ['p-2', 'p-3'], strength: 'strong' },
      { sourceRelationId: 'rel-2', category: 'cafe', keptCount: 1, triedCount: 0, evidencePlaceIds: ['p-4'], strength: 'observed' },
    ];
    const territory = deriveTrustWorldTerritory(signals);
    expect(territory.categories.map((c) => c.category)).toEqual(['bar', 'cafe', 'restaurant']);
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

// ── mergePlaceUpdate ─────────────────────────────────────────────────────────
// Pure extraction of setPlace's fusion logic (X.45-test). Reproduces the
// store's exact rules:
//   - name/category/personalFit/impression are always overwritten by the
//     update;
//   - worldFit/quickSignal/identityHint are DROPPED from the existing place
//     whenever the update omits them — they are not preserved by default.
//     They are restored only if the update explicitly supplies a defined
//     value. This mirrors setPlace's current behavior exactly; it is the
//     caller (the UI screen) that re-supplies the current value on every
//     save to make the field appear "preserved" to the user.

function basePlace(overrides: Partial<Place> = {}): Place {
  return {
    id: 'p-1',
    name: 'Café Orée',
    category: 'cafe',
    personalFit: 'kept',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('mergePlaceUpdate', () => {
  it('overwrites name, category, personalFit, and impression from the update', () => {
    const existing = basePlace({ impression: 'Old note' });
    const result = mergePlaceUpdate(existing, {
      name: 'New name',
      category: 'restaurant',
      personalFit: 'not_for_me',
      impression: 'New note',
    });
    expect(result.name).toBe('New name');
    expect(result.category).toBe('restaurant');
    expect(result.personalFit).toBe('not_for_me');
    expect(result.impression).toBe('New note');
  });

  it('sets impression to undefined when the update omits it', () => {
    const existing = basePlace({ impression: 'Old note' });
    const result = mergePlaceUpdate(existing, {
      name: existing.name,
      category: existing.category,
      personalFit: existing.personalFit,
    });
    expect(result.impression).toBeUndefined();
  });

  it('drops worldFit when the update omits it, even if it existed on the existing place', () => {
    const existing = basePlace({ worldFit: ['culture'] });
    const result = mergePlaceUpdate(existing, {
      name: existing.name,
      category: existing.category,
      personalFit: existing.personalFit,
    });
    expect(result.worldFit).toBeUndefined();
  });

  it('replaces worldFit when the update explicitly supplies it', () => {
    const existing = basePlace({ worldFit: ['culture'] });
    const result = mergePlaceUpdate(existing, {
      name: existing.name,
      category: existing.category,
      personalFit: existing.personalFit,
      worldFit: ['travel', 'sport'],
    });
    expect(result.worldFit).toEqual(['travel', 'sport']);
  });

  it('drops quickSignal when the update omits it, even if it existed on the existing place', () => {
    const existing = basePlace({ quickSignal: { landingLevel: 4 } });
    const result = mergePlaceUpdate(existing, {
      name: existing.name,
      category: existing.category,
      personalFit: existing.personalFit,
    });
    expect(result.quickSignal).toBeUndefined();
  });

  it('replaces quickSignal when the update explicitly supplies it', () => {
    const existing = basePlace({ quickSignal: { landingLevel: 4 } });
    const result = mergePlaceUpdate(existing, {
      name: existing.name,
      category: existing.category,
      personalFit: existing.personalFit,
      quickSignal: { landingLevel: 5, shareSafe: true },
    });
    expect(result.quickSignal).toEqual({ landingLevel: 5, shareSafe: true });
  });

  it('drops identityHint when the update omits it, even if it existed on the existing place', () => {
    const existing = basePlace({ identityHint: '12 Rue de la Paix' });
    const result = mergePlaceUpdate(existing, {
      name: existing.name,
      category: existing.category,
      personalFit: existing.personalFit,
    });
    expect(result.identityHint).toBeUndefined();
  });

  it('replaces identityHint when the update explicitly supplies it', () => {
    const existing = basePlace({ identityHint: '12 Rue de la Paix' });
    const result = mergePlaceUpdate(existing, {
      name: existing.name,
      category: existing.category,
      personalFit: existing.personalFit,
      identityHint: 'maps.app.goo.gl/xyz',
    });
    expect(result.identityHint).toBe('maps.app.goo.gl/xyz');
  });

  it('does not mutate the existing place object', () => {
    const existing = basePlace({ worldFit: ['culture'], identityHint: 'old hint' });
    const existingSnapshot = { ...existing };
    mergePlaceUpdate(existing, {
      name: 'Changed',
      category: 'restaurant',
      personalFit: 'not_for_me',
      worldFit: ['sport'],
      identityHint: 'new hint',
    });
    expect(existing).toEqual(existingSnapshot);
  });

  it('preserves unrelated existing fields (id, createdAt, sourceRelationId) untouched', () => {
    const existing = basePlace({ sourceRelationId: 'rel-1', createdAt: '2026-02-02T00:00:00Z' });
    const result = mergePlaceUpdate(existing, {
      name: 'New name',
      category: 'restaurant',
      personalFit: 'kept',
    });
    expect(result.id).toBe('p-1');
    expect(result.createdAt).toBe('2026-02-02T00:00:00Z');
    expect(result.sourceRelationId).toBe('rel-1');
  });

  it('introduces no scoring, ranking, or estimate key in the merged result', () => {
    const existing = basePlace();
    const result = mergePlaceUpdate(existing, {
      name: existing.name,
      category: existing.category,
      personalFit: existing.personalFit,
      quickSignal: { landingLevel: 5 },
    });
    const keys = Object.keys(result).map((k) => k.toLowerCase());
    for (const forbidden of ['score', 'average', 'rank', 'estimate', 'percentage']) {
      expect(keys.some((k) => k.includes(forbidden))).toBe(false);
    }
  });
});
