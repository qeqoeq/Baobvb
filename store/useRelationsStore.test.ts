import { beforeEach, describe, expect, it } from 'vitest';

import {
  addPassedObject,
  appendPlaceRead,
  getPassedObjectsSnapshot,
  getPlacesSnapshot,
  resetDevStateToSeed,
  sanitizePersistedPassedObjects,
  sanitizePersistedPlaceReads,
  type Place,
} from './useRelationsStore';

// Stable seed ids already used elsewhere in this codebase (X.71 distribution
// script) — kept and tried places with no quickSignal/restaurant dimensions,
// safe anchors for append-only behavior tests.
const KEPT_RESTAURANT_ID = 'seed-place-4'; // Maison Luma — restaurant, kept
const TRIED_CAFE_ID = 'seed-place-3'; // Passage Verde — cafe, tried
const KEPT_SPOT_ID = 'seed-place-5'; // Jardin Haut — spot, kept

function findPlace(id: string): Place {
  const place = getPlacesSnapshot().find((item) => item.id === id);
  if (!place) throw new Error(`Test setup error: place ${id} not found in seed`);
  return place;
}

describe('appendPlaceRead', () => {
  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('1. appends a read to a place with no prior reads', () => {
    const before = findPlace(TRIED_CAFE_ID);
    expect(before.reads ?? []).toHaveLength(0);

    appendPlaceRead(TRIED_CAFE_ID, { impression: 'Quiet today.' });

    const after = findPlace(TRIED_CAFE_ID);
    expect(after.reads).toHaveLength(1);
  });

  it('2. two calls create two entries, in order', () => {
    appendPlaceRead(TRIED_CAFE_ID, { landingLevel: 3 });
    appendPlaceRead(TRIED_CAFE_ID, { landingLevel: 4 });

    const after = findPlace(TRIED_CAFE_ID);
    expect(after.reads).toHaveLength(2);
    expect(after.reads?.[0].landingLevel).toBe(3);
    expect(after.reads?.[1].landingLevel).toBe(4);
  });

  it('3. old reads are never modified by a later append', () => {
    appendPlaceRead(TRIED_CAFE_ID, { landingLevel: 3, impression: 'First visit.' });
    const firstEntrySnapshot = { ...findPlace(TRIED_CAFE_ID).reads![0] };

    appendPlaceRead(TRIED_CAFE_ID, { landingLevel: 5, impression: 'Second visit.' });

    const firstEntryAfter = findPlace(TRIED_CAFE_ID).reads![0];
    expect(firstEntryAfter).toEqual(firstEntrySnapshot);
  });

  it('4. the entry receives id, createdAt, categorySnapshot, criteriaVersion', () => {
    appendPlaceRead(TRIED_CAFE_ID, {});
    const entry = findPlace(TRIED_CAFE_ID).reads![0];

    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
    expect(Number.isNaN(new Date(entry.createdAt).getTime())).toBe(false);
    expect(entry.categorySnapshot).toBe('cafe');
    expect(entry.criteriaVersion).toBe(1);
  });

  it('5. the caller cannot inject id or createdAt', () => {
    appendPlaceRead(TRIED_CAFE_ID, {
      id: 'spoofed-id',
      createdAt: '1999-01-01T00:00:00Z',
    } as never);
    const entry = findPlace(TRIED_CAFE_ID).reads![0];

    expect(entry.id).not.toBe('spoofed-id');
    expect(entry.createdAt).not.toBe('1999-01-01T00:00:00Z');
  });

  it('6. contextFit is limited to 2', () => {
    appendPlaceRead(TRIED_CAFE_ID, {
      contextFit: ['date', 'friends', 'family'] as never,
    });
    const entry = findPlace(TRIED_CAFE_ID).reads![0];
    expect(entry.contextFit?.length).toBeLessThanOrEqual(2);
  });

  it('7. driverDimensions accepts up to 5 catalog dimensions', () => {
    appendPlaceRead(KEPT_RESTAURANT_ID, {
      driverDimensions: ['food', 'service', 'atmosphere', 'value', 'cleanliness'],
    });
    const entry = findPlace(KEPT_RESTAURANT_ID).reads![0];
    expect(entry.driverDimensions?.length).toBeLessThanOrEqual(5);
    expect(entry.driverDimensions).toEqual([
      'food',
      'service',
      'atmosphere',
      'value',
      'cleanliness',
    ]);
  });

  it('8. restaurantDimensions is dropped if driverDimensions is empty', () => {
    appendPlaceRead(KEPT_RESTAURANT_ID, {
      restaurantDimensions: { food: 5 },
    });
    const entry = findPlace(KEPT_RESTAURANT_ID).reads![0];
    expect(entry.restaurantDimensions).toBeUndefined();
  });

  it('9. driverDimensions and restaurantDimensions are dropped for spot/other', () => {
    appendPlaceRead(KEPT_SPOT_ID, {
      driverDimensions: ['food'],
      restaurantDimensions: { food: 5 },
    });
    const entry = findPlace(KEPT_SPOT_ID).reads![0];
    expect(entry.driverDimensions).toBeUndefined();
    expect(entry.restaurantDimensions).toBeUndefined();
  });

  it('10. empty impression is omitted', () => {
    appendPlaceRead(TRIED_CAFE_ID, { impression: '   ' });
    const entry = findPlace(TRIED_CAFE_ID).reads![0];
    expect(entry.impression).toBeUndefined();
  });

  it('11. legacy quickSignal is never overwritten by addPlaceRead', () => {
    const before = findPlace(KEPT_RESTAURANT_ID).quickSignal;
    appendPlaceRead(KEPT_RESTAURANT_ID, { landingLevel: 1 });
    const after = findPlace(KEPT_RESTAURANT_ID).quickSignal;
    expect(after).toEqual(before);
  });

  it('12. legacy impression is never overwritten by addPlaceRead', () => {
    const before = findPlace(KEPT_RESTAURANT_ID).impression;
    appendPlaceRead(KEPT_RESTAURANT_ID, { impression: 'A brand new note.' });
    const after = findPlace(KEPT_RESTAURANT_ID).impression;
    expect(after).toBe(before);
  });

  it('13. personalFit and wentAgainAt are untouched by addPlaceRead', () => {
    const before = findPlace(KEPT_RESTAURANT_ID);
    appendPlaceRead(KEPT_RESTAURANT_ID, { landingLevel: 2 });
    const after = findPlace(KEPT_RESTAURANT_ID);
    expect(after.personalFit).toBe(before.personalFit);
    expect(after.wentAgainAt).toBe(before.wentAgainAt);
  });

  it('returns false for an unknown place id', () => {
    const result = appendPlaceRead('not-a-real-place', { landingLevel: 3 });
    expect(result).toBe(false);
  });
});

// ── sanitizePersistedPlaceReads — reads hydration regression ────────────────
//
// Regression coverage for the bug discovered in X.80c device check:
// reads[] persisted via addPlaceRead + persist() were silently dropped on
// app restart because the hydration code did not include them in the
// reconstructed place. The Memory Stack disappeared after every relaunch.
//
describe('sanitizePersistedPlaceReads', () => {
  const VALID_READ = {
    id: 'r-1',
    createdAt: '2026-04-15T14:00:00Z',
    categorySnapshot: 'cafe',
    criteriaVersion: 1 as const,
    impression: 'Quiet corner.',
    landingLevel: 4,
    contextFit: ['calm'],
  };

  // ── 1. Valid reads are preserved ─────────────────────────────────────────

  it('H1: preserves a fully valid read entry', () => {
    const result = sanitizePersistedPlaceReads([VALID_READ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r-1');
    expect(result[0].createdAt).toBe('2026-04-15T14:00:00Z');
    expect(result[0].criteriaVersion).toBe(1);
    expect(result[0].impression).toBe('Quiet corner.');
  });

  it('H2: preserves multiple valid reads in order', () => {
    const read2 = { ...VALID_READ, id: 'r-2', createdAt: '2026-06-10T11:00:00Z' };
    const result = sanitizePersistedPlaceReads([VALID_READ, read2]);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('r-1');
    expect(result[1].id).toBe('r-2');
  });

  it('H3: read with only required fields (no optional) is preserved', () => {
    const minimal = { id: 'r-min', createdAt: '2026-01-01T00:00:00Z', criteriaVersion: 1 as const, categorySnapshot: 'cafe' };
    const result = sanitizePersistedPlaceReads([minimal]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r-min');
  });

  // ── 2. Invalid reads are filtered out ────────────────────────────────────

  it('H4: drops a read with missing id', () => {
    const bad = { createdAt: '2026-04-15T14:00:00Z', criteriaVersion: 1, categorySnapshot: 'cafe' };
    expect(sanitizePersistedPlaceReads([bad])).toHaveLength(0);
  });

  it('H5: drops a read with missing createdAt', () => {
    const bad = { id: 'r-1', criteriaVersion: 1, categorySnapshot: 'cafe' };
    expect(sanitizePersistedPlaceReads([bad])).toHaveLength(0);
  });

  it('H6: drops a read with wrong criteriaVersion', () => {
    const bad = { id: 'r-1', createdAt: '2026-04-15T14:00:00Z', criteriaVersion: 2, categorySnapshot: 'cafe' };
    expect(sanitizePersistedPlaceReads([bad])).toHaveLength(0);
  });

  it('H7: drops a read where criteriaVersion is missing entirely', () => {
    const bad = { id: 'r-1', createdAt: '2026-04-15T14:00:00Z', categorySnapshot: 'cafe' };
    expect(sanitizePersistedPlaceReads([bad])).toHaveLength(0);
  });

  it('H8: drops a null entry in the array', () => {
    expect(sanitizePersistedPlaceReads([null])).toHaveLength(0);
  });

  it('H9: drops a string entry in the array', () => {
    expect(sanitizePersistedPlaceReads(['not-an-object'])).toHaveLength(0);
  });

  it('H10: mixed array — keeps valid, drops invalid', () => {
    const invalid = { id: 'bad', createdAt: '2026-01-01T00:00:00Z' }; // missing criteriaVersion
    const result = sanitizePersistedPlaceReads([VALID_READ, invalid]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('r-1');
  });

  // ── 3. Legacy — no reads field ────────────────────────────────────────────

  it('H11: returns empty array when reads is undefined', () => {
    expect(sanitizePersistedPlaceReads(undefined)).toHaveLength(0);
  });

  it('H12: returns empty array when reads is null', () => {
    expect(sanitizePersistedPlaceReads(null)).toHaveLength(0);
  });

  it('H13: returns empty array when reads is an empty array', () => {
    expect(sanitizePersistedPlaceReads([])).toHaveLength(0);
  });

  it('H14: returns empty array when reads is not an array (object)', () => {
    expect(sanitizePersistedPlaceReads({ id: 'r-1' })).toHaveLength(0);
  });

  // ── 4. Preservation — optional fields pass through untouched ─────────────

  it('H15: impression, landingLevel, contextFit survive sanitization', () => {
    const result = sanitizePersistedPlaceReads([VALID_READ]);
    expect(result[0].impression).toBe('Quiet corner.');
    expect(result[0].landingLevel).toBe(4);
    expect(result[0].contextFit).toEqual(['calm']);
  });
});

// ── addPassedObject — pass gesture store tests ───────────────────────────────
//
// Regression coverage for X.81 local pass gesture.
// Verifies append-only semantics, caller-injection protection, note sanitation,
// and persistence-layer sanitize function.
//
describe('addPassedObject', () => {
  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('P1: adds a PassedObject entry, append-only', () => {
    const before = getPassedObjectsSnapshot().length;
    addPassedObject({
      objectId: 'seed-place-4',
      toRelationId: '6',
      categorySnapshot: 'restaurant',
    });
    expect(getPassedObjectsSnapshot()).toHaveLength(before + 1);
  });

  it('P2: id and createdAt are generated by the store', () => {
    addPassedObject({
      objectId: 'seed-place-4',
      toRelationId: '6',
      categorySnapshot: 'restaurant',
    });
    const entry = getPassedObjectsSnapshot()[0];
    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
    expect(Number.isNaN(new Date(entry.createdAt).getTime())).toBe(false);
  });

  it('P3: caller cannot inject id, createdAt, or objectType', () => {
    addPassedObject({
      objectId: 'seed-place-4',
      toRelationId: '6',
      categorySnapshot: 'restaurant',
      id: 'spoofed-id',
      createdAt: '1999-01-01T00:00:00Z',
      objectType: 'person',
    } as never);
    const entry = getPassedObjectsSnapshot()[0];
    expect(entry.id).not.toBe('spoofed-id');
    expect(entry.createdAt).not.toBe('1999-01-01T00:00:00Z');
    expect(entry.objectType).toBe('place');
  });

  it('P4: objectType is always place', () => {
    addPassedObject({
      objectId: 'seed-place-5',
      toRelationId: '10',
      categorySnapshot: 'spot',
    });
    expect(getPassedObjectsSnapshot()[0].objectType).toBe('place');
  });

  it('P5: double pass same place + same relation creates two distinct entries', () => {
    addPassedObject({ objectId: 'seed-place-4', toRelationId: '6', categorySnapshot: 'restaurant' });
    addPassedObject({ objectId: 'seed-place-4', toRelationId: '6', categorySnapshot: 'restaurant' });
    const all = getPassedObjectsSnapshot();
    expect(all).toHaveLength(2);
    expect(all[0].id).not.toBe(all[1].id);
  });

  it('P6: note is trimmed', () => {
    addPassedObject({
      objectId: 'seed-place-4',
      toRelationId: '6',
      categorySnapshot: 'restaurant',
      note: '  reminded me of that evening  ',
    });
    expect(getPassedObjectsSnapshot()[0].note).toBe('reminded me of that evening');
  });

  it('P7: empty note after trim is not stored', () => {
    addPassedObject({
      objectId: 'seed-place-4',
      toRelationId: '6',
      categorySnapshot: 'restaurant',
      note: '   ',
    });
    expect(getPassedObjectsSnapshot()[0].note).toBeUndefined();
  });

  it('P8: note longer than 80 chars is truncated to 80', () => {
    const longNote = 'a'.repeat(120);
    addPassedObject({
      objectId: 'seed-place-4',
      toRelationId: '6',
      categorySnapshot: 'restaurant',
      note: longNote,
    });
    expect(getPassedObjectsSnapshot()[0].note).toHaveLength(80);
  });

  it('P9: sourceRelationId is preserved if provided', () => {
    addPassedObject({
      objectId: 'seed-place-4',
      toRelationId: '10',
      categorySnapshot: 'restaurant',
      sourceRelationId: '6',
    });
    expect(getPassedObjectsSnapshot()[0].sourceRelationId).toBe('6');
  });

  it('P10: sourceRelationId absent when not provided', () => {
    addPassedObject({
      objectId: 'seed-place-4',
      toRelationId: '6',
      categorySnapshot: 'restaurant',
    });
    expect(getPassedObjectsSnapshot()[0].sourceRelationId).toBeUndefined();
  });

  it('P11: getPassedObjectsSnapshot returns current passes', () => {
    expect(getPassedObjectsSnapshot()).toHaveLength(0);
    addPassedObject({ objectId: 'seed-place-4', toRelationId: '6', categorySnapshot: 'restaurant' });
    addPassedObject({ objectId: 'seed-place-5', toRelationId: '10', categorySnapshot: 'spot' });
    expect(getPassedObjectsSnapshot()).toHaveLength(2);
    expect(getPassedObjectsSnapshot()[1].objectId).toBe('seed-place-5');
  });
});

// ── sanitizePersistedPassedObjects — hydration regression ────────────────────

describe('sanitizePersistedPassedObjects', () => {
  const VALID_PASS = {
    id: 'pass-1',
    createdAt: '2026-06-01T10:00:00Z',
    objectType: 'place' as const,
    objectId: 'seed-place-4',
    toRelationId: '6',
    categorySnapshot: 'restaurant' as const,
  };

  it('S1: preserves a fully valid PassedObject', () => {
    const result = sanitizePersistedPassedObjects([VALID_PASS]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pass-1');
    expect(result[0].objectType).toBe('place');
  });

  it('S2: preserves optional note and sourceRelationId', () => {
    const withOptionals = { ...VALID_PASS, note: 'Thought of you', sourceRelationId: '10' };
    const result = sanitizePersistedPassedObjects([withOptionals]);
    expect(result[0].note).toBe('Thought of you');
    expect(result[0].sourceRelationId).toBe('10');
  });

  it('S3: drops entry missing objectType', () => {
    const { objectType: _, ...bad } = VALID_PASS;
    expect(sanitizePersistedPassedObjects([bad])).toHaveLength(0);
  });

  it('S4: drops entry with wrong objectType', () => {
    const bad = { ...VALID_PASS, objectType: 'person' };
    expect(sanitizePersistedPassedObjects([bad])).toHaveLength(0);
  });

  it('S5: drops entry missing id', () => {
    const { id: _, ...bad } = VALID_PASS;
    expect(sanitizePersistedPassedObjects([bad])).toHaveLength(0);
  });

  it('S6: drops entry missing toRelationId', () => {
    const { toRelationId: _, ...bad } = VALID_PASS;
    expect(sanitizePersistedPassedObjects([bad])).toHaveLength(0);
  });

  it('S7: drops entry with invalid categorySnapshot', () => {
    const bad = { ...VALID_PASS, categorySnapshot: 'museum' };
    expect(sanitizePersistedPassedObjects([bad])).toHaveLength(0);
  });

  it('S8: mixed array — keeps valid, drops invalid', () => {
    const invalid = { id: 'bad', createdAt: '2026-01-01T00:00:00Z' };
    const result = sanitizePersistedPassedObjects([VALID_PASS, invalid]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('pass-1');
  });

  it('S9: returns empty for undefined', () => {
    expect(sanitizePersistedPassedObjects(undefined)).toHaveLength(0);
  });

  it('S10: returns empty for empty array', () => {
    expect(sanitizePersistedPassedObjects([])).toHaveLength(0);
  });
});
