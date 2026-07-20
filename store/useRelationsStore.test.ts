import { beforeEach, describe, expect, it } from 'vitest';

import {
  addPassedObject,
  addReceivedObject,
  appendPlaceRead,
  applyHydratedState,
  getEvaluationsSnapshot,
  getMeSnapshot,
  getPassedObjectsSnapshot,
  getPlacesSnapshot,
  getReceivedObjectsSnapshot,
  getRelationSnapshotById,
  getRelationsSnapshot,
  materializePassDeliveries,
  reconcileOrphanedSharedRelations,
  openMutualRevealForTest,
  purgeSeedData,
  resetDevStateToSeed,
  sanitizePersistedPassedObjects,
  sanitizePersistedPlaceReads,
  sanitizePersistedReceivedObjects,
  SEED_VERSION,
  setReceivedObjectStatus,
  syncLocalSnapshotForTest,
  upsertBootstrappedSharedRelations,
  type PassDeliveryMaterializationInput,
  type Place,
  type SharedRelationBootstrapInput,
} from './useRelationsStore';
import { getNormalizedPrivateLabel } from '../lib/relation-model';

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

// ── addReceivedObject ────────────────────────────────────────────────────────

const RECEIVED_INPUT = {
  objectId: 'seed-place-4',
  fromRelationId: '6',
  nameSnapshot: 'Maison Luma',
  categorySnapshot: 'restaurant' as const,
};

describe('addReceivedObject', () => {
  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('R1: append-only — two calls create two distinct entries', () => {
    addReceivedObject(RECEIVED_INPUT);
    addReceivedObject(RECEIVED_INPUT);
    // seed already has 2 entries; 2 more = 4 total
    const all = getReceivedObjectsSnapshot();
    const added = all.filter((r) => r.objectId === 'seed-place-4' && r.fromRelationId === '6');
    // at least 2 added (seed may also have recv-seed-1 which matches)
    expect(added.length).toBeGreaterThanOrEqual(2);
  });

  it('R2: id, createdAt, objectType, status generated by store', () => {
    addReceivedObject(RECEIVED_INPUT);
    const all = getReceivedObjectsSnapshot();
    const entry = all[all.length - 1];
    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
    expect(Number.isNaN(new Date(entry.createdAt).getTime())).toBe(false);
    expect(entry.objectType).toBe('place');
    expect(entry.status).toBe('new');
  });

  it('R3: caller cannot inject id, createdAt, objectType, status, or decidedAt', () => {
    addReceivedObject({
      ...RECEIVED_INPUT,
      id: 'spoofed-id',
      createdAt: '1999-01-01T00:00:00Z',
      objectType: 'other',
      status: 'kept',
      decidedAt: '1999-01-01T00:00:00Z',
    } as never);
    const all = getReceivedObjectsSnapshot();
    const entry = all[all.length - 1];
    expect(entry.id).not.toBe('spoofed-id');
    expect(entry.createdAt).not.toBe('1999-01-01T00:00:00Z');
    expect(entry.objectType).toBe('place');
    expect(entry.status).toBe('new');
    expect(entry.decidedAt).toBeUndefined();
  });

  it('R4: status is always new on creation', () => {
    addReceivedObject(RECEIVED_INPUT);
    const all = getReceivedObjectsSnapshot();
    expect(all[all.length - 1].status).toBe('new');
  });

  it('R5: note is trimmed', () => {
    addReceivedObject({ ...RECEIVED_INPUT, note: '  great spot  ' });
    const all = getReceivedObjectsSnapshot();
    expect(all[all.length - 1].note).toBe('great spot');
  });

  it('R6: empty note after trim is not stored', () => {
    addReceivedObject({ ...RECEIVED_INPUT, note: '   ' });
    const all = getReceivedObjectsSnapshot();
    expect(all[all.length - 1].note).toBeUndefined();
  });

  it('R7: note longer than 80 chars is truncated to 80', () => {
    addReceivedObject({ ...RECEIVED_INPUT, note: 'x'.repeat(120) });
    const all = getReceivedObjectsSnapshot();
    expect(all[all.length - 1].note).toHaveLength(80);
  });

  it('R8: sourceRelationId preserved if provided', () => {
    addReceivedObject({ ...RECEIVED_INPUT, sourceRelationId: '10' });
    const all = getReceivedObjectsSnapshot();
    expect(all[all.length - 1].sourceRelationId).toBe('10');
  });

  it('R9: nameSnapshot is trimmed', () => {
    addReceivedObject({ ...RECEIVED_INPUT, nameSnapshot: '  Maison Luma  ' });
    const all = getReceivedObjectsSnapshot();
    expect(all[all.length - 1].nameSnapshot).toBe('Maison Luma');
  });

  it('R9b: whitespace-only nameSnapshot falls back to Untitled place', () => {
    addReceivedObject({ ...RECEIVED_INPUT, nameSnapshot: '   ' });
    const all = getReceivedObjectsSnapshot();
    expect(all[all.length - 1].nameSnapshot).toBe('Untitled place');
  });

  it('R25: addReceivedObject does not affect passedObjects', () => {
    const passedBefore = getPassedObjectsSnapshot().length;
    addReceivedObject(RECEIVED_INPUT);
    expect(getPassedObjectsSnapshot()).toHaveLength(passedBefore);
  });
});

// ── setReceivedObjectStatus ──────────────────────────────────────────────────

describe('setReceivedObjectStatus', () => {
  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('R10: new → kept allowed', () => {
    const entry = addReceivedObject(RECEIVED_INPUT);
    const result = setReceivedObjectStatus(entry.id, 'kept');
    expect(result?.status).toBe('kept');
    const found = getReceivedObjectsSnapshot().find((r) => r.id === entry.id);
    expect(found?.status).toBe('kept');
  });

  it('R11: new → not_for_me allowed', () => {
    const entry = addReceivedObject(RECEIVED_INPUT);
    const result = setReceivedObjectStatus(entry.id, 'not_for_me');
    expect(result?.status).toBe('not_for_me');
  });

  it('R12: kept → not_for_me blocked', () => {
    const entry = addReceivedObject(RECEIVED_INPUT);
    setReceivedObjectStatus(entry.id, 'kept');
    const result = setReceivedObjectStatus(entry.id, 'not_for_me');
    expect(result).toBeUndefined();
    const found = getReceivedObjectsSnapshot().find((r) => r.id === entry.id);
    expect(found?.status).toBe('kept');
  });

  it('R13: not_for_me → kept blocked', () => {
    const entry = addReceivedObject(RECEIVED_INPUT);
    setReceivedObjectStatus(entry.id, 'not_for_me');
    const result = setReceivedObjectStatus(entry.id, 'kept');
    expect(result).toBeUndefined();
    const found = getReceivedObjectsSnapshot().find((r) => r.id === entry.id);
    expect(found?.status).toBe('not_for_me');
  });

  it('R14: decidedAt absent when new, present after decision', () => {
    const entry = addReceivedObject(RECEIVED_INPUT);
    expect(entry.decidedAt).toBeUndefined();
    const result = setReceivedObjectStatus(entry.id, 'kept');
    expect(typeof result?.decidedAt).toBe('string');
    expect(Number.isNaN(new Date(result!.decidedAt!).getTime())).toBe(false);
  });

  it('R15: keep creates minimal Place saved if objectId unknown', () => {
    const newId = `test-place-${Date.now()}`;
    const entry = addReceivedObject({
      objectId: newId,
      fromRelationId: '6',
      nameSnapshot: 'Test Spot',
      categorySnapshot: 'spot',
    });
    const beforePlaces = getPlacesSnapshot().find((p) => p.id === newId);
    expect(beforePlaces).toBeUndefined();

    setReceivedObjectStatus(entry.id, 'kept');

    const created = getPlacesSnapshot().find((p) => p.id === newId);
    expect(created).toBeDefined();
    expect(created?.name).toBe('Test Spot');
    expect(created?.category).toBe('spot');
    expect(created?.personalFit).toBe('saved');
    expect(created?.sourceRelationId).toBe('6');
  });

  it('R16: keep does not overwrite existing Place personalFit if tried/kept/not_for_me', () => {
    // seed-place-4 exists with personalFit: 'kept'
    const before = getPlacesSnapshot().find((p) => p.id === 'seed-place-4');
    expect(before?.personalFit).toBe('kept');

    const entry = addReceivedObject(RECEIVED_INPUT); // objectId: seed-place-4
    setReceivedObjectStatus(entry.id, 'kept');

    const after = getPlacesSnapshot().find((p) => p.id === 'seed-place-4');
    expect(after?.personalFit).toBe('kept'); // unchanged
  });

  it('R17: keep does not modify evaluations (relation trust unchanged)', () => {
    const evalsBefore = getEvaluationsSnapshot().map((e) => ({ ...e }));
    const entry = addReceivedObject(RECEIVED_INPUT);
    setReceivedObjectStatus(entry.id, 'kept');
    const evalsAfter = getEvaluationsSnapshot();
    expect(evalsAfter).toHaveLength(evalsBefore.length);
    expect(evalsAfter).toEqual(evalsBefore);
  });

  it('R18: not_for_me does not create Place', () => {
    const newId = `test-place-notforme-${Date.now()}`;
    const entry = addReceivedObject({
      objectId: newId,
      fromRelationId: '6',
      nameSnapshot: 'Somewhere',
      categorySnapshot: 'bar',
    });
    setReceivedObjectStatus(entry.id, 'not_for_me');
    const created = getPlacesSnapshot().find((p) => p.id === newId);
    expect(created).toBeUndefined();
  });

  it('R19: not_for_me does not affect passedObjects', () => {
    const passedBefore = getPassedObjectsSnapshot().length;
    const entry = addReceivedObject(RECEIVED_INPUT);
    setReceivedObjectStatus(entry.id, 'not_for_me');
    expect(getPassedObjectsSnapshot()).toHaveLength(passedBefore);
  });

  it('R20: getReceivedObjectsSnapshot returns all received objects', () => {
    const before = getReceivedObjectsSnapshot().length;
    addReceivedObject(RECEIVED_INPUT);
    expect(getReceivedObjectsSnapshot()).toHaveLength(before + 1);
  });
});

// ── sanitizePersistedReceivedObjects ─────────────────────────────────────────

describe('sanitizePersistedReceivedObjects', () => {
  const VALID_RECEIVED = {
    id: 'recv-1',
    createdAt: '2026-06-20T10:00:00Z',
    objectType: 'place' as const,
    objectId: 'seed-place-4',
    fromRelationId: '6',
    nameSnapshot: 'Maison Luma',
    categorySnapshot: 'restaurant' as const,
    status: 'new' as const,
  };

  it('R21: preserves a fully valid ReceivedObject', () => {
    const result = sanitizePersistedReceivedObjects([VALID_RECEIVED]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('recv-1');
    expect(result[0].status).toBe('new');
  });

  it('R22: drops entry with invalid status (seen/opened/pending/ignored)', () => {
    const bad_seen = { ...VALID_RECEIVED, status: 'seen' };
    const bad_opened = { ...VALID_RECEIVED, id: 'recv-2', status: 'opened' };
    const bad_pending = { ...VALID_RECEIVED, id: 'recv-3', status: 'pending' };
    const bad_ignored = { ...VALID_RECEIVED, id: 'recv-4', status: 'ignored' };
    expect(sanitizePersistedReceivedObjects([bad_seen])).toHaveLength(0);
    expect(sanitizePersistedReceivedObjects([bad_opened])).toHaveLength(0);
    expect(sanitizePersistedReceivedObjects([bad_pending])).toHaveLength(0);
    expect(sanitizePersistedReceivedObjects([bad_ignored])).toHaveLength(0);
  });

  it('R23: drops entry missing nameSnapshot', () => {
    const { nameSnapshot: _, ...bad } = VALID_RECEIVED;
    expect(sanitizePersistedReceivedObjects([bad])).toHaveLength(0);
  });

  it('R23b: drops entry with whitespace-only nameSnapshot', () => {
    const bad = { ...VALID_RECEIVED, id: 'recv-ws', nameSnapshot: '   ' };
    expect(sanitizePersistedReceivedObjects([bad])).toHaveLength(0);
  });

  it('R24: mixed array keeps valid, drops invalid', () => {
    const invalid = { id: 'bad', createdAt: '2026-01-01T00:00:00Z' };
    const result = sanitizePersistedReceivedObjects([VALID_RECEIVED, invalid]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('recv-1');
  });

  it('T5: migrates legacy fromPassId to fromDeliveryId', () => {
    const legacy = { ...VALID_RECEIVED, fromPassId: 'old-delivery-id' };
    const result = sanitizePersistedReceivedObjects([legacy]);
    expect(result).toHaveLength(1);
    expect(result[0].fromDeliveryId).toBe('old-delivery-id');
  });

  it('T5b: fromDeliveryId takes precedence over legacy fromPassId', () => {
    const both = { ...VALID_RECEIVED, fromPassId: 'old-id', fromDeliveryId: 'new-id' };
    const result = sanitizePersistedReceivedObjects([both as never]);
    expect(result).toHaveLength(1);
    expect(result[0].fromDeliveryId).toBe('new-id');
  });
});

// ── addReceivedObject — fromDeliveryId ───────────────────────────────────────

const RECEIVED_INPUT_BASE = {
  objectId: 'seed-place-4',
  fromRelationId: '6',
  nameSnapshot: 'Maison Luma',
  categorySnapshot: 'restaurant' as const,
};

describe('addReceivedObject — fromDeliveryId', () => {
  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('T6: addReceivedObject stores fromDeliveryId', () => {
    const entry = addReceivedObject({ ...RECEIVED_INPUT_BASE, fromDeliveryId: 'delivery-abc' });
    expect(entry.fromDeliveryId).toBe('delivery-abc');
    const found = getReceivedObjectsSnapshot().find((r) => r.id === entry.id);
    expect(found?.fromDeliveryId).toBe('delivery-abc');
  });

  it('T6b: addReceivedObject without fromDeliveryId produces no fromDeliveryId field', () => {
    const entry = addReceivedObject(RECEIVED_INPUT_BASE);
    expect(entry.fromDeliveryId).toBeUndefined();
    expect((entry as never as { fromPassId?: string }).fromPassId).toBeUndefined();
  });
});

// ── materializePassDeliveries ─────────────────────────────────────────────────

function makeBootstrapRow(canonicalId: string): SharedRelationBootstrapInput {
  return {
    relationship_id: canonicalId,
    status: 'revealed',
    my_side: 'sideA',
    side_a_present: true,
    side_b_present: true,
    side_a_reading_id: null,
    side_b_reading_id: null,
    cooking_started_at: null,
    unlock_at: null,
    ready_at: null,
    revealed_at: '2026-01-01T00:00:00Z',
    relationship_name_revealed: true,
    counterpart_public_profile_id: null,
    counterpart_display_name: null,
    counterpart_handle: null,
  };
}

describe('materializePassDeliveries', () => {
  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('T7: creates ReceivedObject for known canonicalRelationId', () => {
    upsertBootstrappedSharedRelations([makeBootstrapRow('canonical-t7')]);
    const before = getReceivedObjectsSnapshot().length;

    const created = materializePassDeliveries([{
      fromDeliveryId: 'delivery-t7',
      canonicalRelationId: 'canonical-t7',
      objectType: 'place',
      objectPayload: { objectId: 'remote-place-1', nameSnapshot: 'Remote Café', categorySnapshot: 'cafe' },
    }]);

    expect(created).toHaveLength(1);
    expect(getReceivedObjectsSnapshot()).toHaveLength(before + 1);
    expect(created[0].fromDeliveryId).toBe('delivery-t7');
    expect(created[0].nameSnapshot).toBe('Remote Café');
    expect(created[0].status).toBe('new');
    expect(created[0].categorySnapshot).toBe('cafe');
  });

  it('T8: idempotent — repeated call with same fromDeliveryId creates no duplicate', () => {
    upsertBootstrappedSharedRelations([makeBootstrapRow('canonical-t8')]);

    const delivery: PassDeliveryMaterializationInput[] = [{
      fromDeliveryId: 'delivery-t8',
      canonicalRelationId: 'canonical-t8',
      objectType: 'place',
      objectPayload: { objectId: 'place-t8', nameSnapshot: 'Idem Café', categorySnapshot: 'cafe' },
    }];

    materializePassDeliveries(delivery);
    const afterFirst = getReceivedObjectsSnapshot().length;

    materializePassDeliveries(delivery);
    expect(getReceivedObjectsSnapshot()).toHaveLength(afterFirst);
  });

  it('T9: skips unknown canonicalRelationId', () => {
    const before = getReceivedObjectsSnapshot().length;
    const created = materializePassDeliveries([{
      fromDeliveryId: 'delivery-t9',
      canonicalRelationId: 'non-existent-canonical',
      objectType: 'place',
      objectPayload: { objectId: 'place-x', nameSnapshot: 'Unknown', categorySnapshot: 'bar' },
    }]);
    expect(created).toHaveLength(0);
    expect(getReceivedObjectsSnapshot()).toHaveLength(before);
  });

  it('T10: does not modify passedObjects', () => {
    const passedBefore = getPassedObjectsSnapshot().length;
    materializePassDeliveries([{
      fromDeliveryId: 'delivery-t10',
      canonicalRelationId: 'non-existent',
      objectType: 'place',
      objectPayload: { objectId: 'x', nameSnapshot: 'Y', categorySnapshot: 'bar' },
    }]);
    expect(getPassedObjectsSnapshot()).toHaveLength(passedBefore);
  });

  it('T11: does not modify evaluations', () => {
    const evalsBefore = getEvaluationsSnapshot().map((e) => ({ ...e }));
    materializePassDeliveries([]);
    expect(getEvaluationsSnapshot()).toEqual(evalsBefore);
  });

  it('T12: setReceivedObjectStatus is local — evaluations and passedObjects unchanged', () => {
    upsertBootstrappedSharedRelations([makeBootstrapRow('canonical-t12')]);
    const evalsBefore = getEvaluationsSnapshot().map((e) => ({ ...e }));
    const passedBefore = getPassedObjectsSnapshot().length;

    const [created] = materializePassDeliveries([{
      fromDeliveryId: 'delivery-t12',
      canonicalRelationId: 'canonical-t12',
      objectType: 'place',
      objectPayload: { objectId: 'place-t12', nameSnapshot: 'La Place', categorySnapshot: 'spot' },
    }]);
    setReceivedObjectStatus(created.id, 'kept');

    expect(getEvaluationsSnapshot()).toEqual(evalsBefore);
    expect(getPassedObjectsSnapshot()).toHaveLength(passedBefore);
  });

  it('T14: sourceRelationId never materialized from delivery payload', () => {
    upsertBootstrappedSharedRelations([makeBootstrapRow('canonical-t14')]);

    const created = materializePassDeliveries([{
      fromDeliveryId: 'delivery-t14',
      canonicalRelationId: 'canonical-t14',
      objectType: 'place',
      objectPayload: { objectId: 'place-t14', nameSnapshot: 'Test', categorySnapshot: 'spot' },
    }]);

    expect(created[0].sourceRelationId).toBeUndefined();
  });
});

// ── getRelationSnapshotById — B25 canonical-id resolution ────────────────────
//
// A reveal-ready push deep-links by the canonical relationship UUID, which never
// equals the local `r-…` id. The lookup must accept either key.
describe('getRelationSnapshotById — B25 canonical resolution', () => {
  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('B25-S1: resolves a bootstrapped relation by its canonical id', () => {
    upsertBootstrappedSharedRelations([makeBootstrapRow('canonical-b25')]);
    const snap = getRelationSnapshotById('canonical-b25');
    expect(snap).toBeDefined();
    expect(snap!.canonicalRelationId).toBe('canonical-b25');
    // The local id is a generated `r-…`, distinct from the canonical id.
    expect(snap!.id).not.toBe('canonical-b25');
  });

  it('B25-S2: still resolves by local id', () => {
    upsertBootstrappedSharedRelations([makeBootstrapRow('canonical-b25b')]);
    const byCanonical = getRelationSnapshotById('canonical-b25b')!;
    expect(getRelationSnapshotById(byCanonical.id)?.id).toBe(byCanonical.id);
  });

  it('B25-S3: unknown id → undefined', () => {
    expect(getRelationSnapshotById('no-such-id')).toBeUndefined();
  });
});

// ── purgeSeedData (X.88) ─────────────────────────────────────────────────────
//
// Verifies that the surgical seed purge:
//   - removes all four seed entity families by ID pattern
//   - leaves non-seed entities (bootstrap / user-created) untouched
//   - is idempotent (second call returns false, state unchanged)
//
// Tests use resetDevStateToSeed() to populate the store with the full seed
// fixture (23 relations, 22 evaluations, 12 places, 2 receivedObjects), then
// call purgeSeedData() directly — same path as the production boot-time purge.
//
describe('purgeSeedData', () => {
  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('X1: removes all seed relations, evaluations, places, and receivedObjects', () => {
    const changed = purgeSeedData();

    expect(changed).toBe(true);
    expect(getRelationsSnapshot().filter((r) => /^\d+$/.test(r.id))).toHaveLength(0);
    expect(getEvaluationsSnapshot().filter((e) => /^e\d+$/.test(e.id))).toHaveLength(0);
    expect(getPlacesSnapshot().filter((p) => p.id.startsWith('seed-place-'))).toHaveLength(0);
    expect(getReceivedObjectsSnapshot().filter((ro) => ro.id.startsWith('recv-seed-'))).toHaveLength(0);
  });

  it('X2: leaves bootstrap relations (r- IDs) untouched', () => {
    upsertBootstrappedSharedRelations([makeBootstrapRow('canonical-x2')]);
    const beforePurge = getRelationsSnapshot().length;

    purgeSeedData();

    const afterPurge = getRelationsSnapshot();
    expect(afterPurge.some((r) => r.canonicalRelationId === 'canonical-x2')).toBe(true);
    // All 23 seeds removed, the 1 bootstrap relation remains
    expect(afterPurge).toHaveLength(beforePurge - 23);
  });

  it('X3: leaves user-created places (p- IDs) and evaluations (eval- IDs) untouched', () => {
    // Build a mixed persisted state (seeds + real user entities) and load it
    // via applyHydratedState so that purgeSeedData() can be called explicitly.
    // applyHydratedState does NOT call purgeSeedData internally — only the
    // production boot path does, after applyHydratedState returns.
    const userPlaceId = `p-${Date.now()}`;
    const userRelId = `r-${Date.now()}-x3`;
    const userEvalId = `eval-${userRelId}-${Date.now()}`;

    const minimalLocalState = {
      sideA: { exists: true, identityStatus: 'draft' as const, hasPrivateReading: false },
      sideB: { exists: false, identityStatus: 'missing' as const, hasPrivateReading: false },
      revealSnapshot: { status: 'waiting_other_side' as const, revealed: false, relationshipNameRevealed: false },
    };

    applyHydratedState({
      seedVersion: SEED_VERSION,
      me: { id: 'me-local-001', displayName: 'Yasmine', handle: '@yasmine.baobab', avatarSeed: 'Y', isProfileSetup: true },
      relations: [
        // 1 seed relation
        { id: '3', name: 'Jean', source: 'manual', archived: true, createdAt: '2025-12-20T09:00:00Z', identityStatus: 'draft', relationshipNameRevealed: false, avatarSeed: 'J', anchorMode: 'manual', anchorValue: null, relationDepth: 'encounter', privateLabel: 'Jean', localState: minimalLocalState },
        // 1 non-seed relation (bootstrap r- ID)
        { id: userRelId, name: 'Alice', source: 'bootstrap', archived: false, createdAt: '2026-01-01T00:00:00Z', identityStatus: 'verified', relationshipNameRevealed: false, avatarSeed: 'A', anchorMode: 'bootstrap', anchorValue: null, relationDepth: 'known', privateLabel: 'Alice', canonicalRelationId: 'canonical-x3', localState: { sideA: { exists: true, identityStatus: 'verified' as const, hasPrivateReading: false }, sideB: { exists: true, identityStatus: 'verified' as const, hasPrivateReading: false }, revealSnapshot: { status: 'revealed' as const, revealed: true, relationshipNameRevealed: false } } },
      ],
      evaluations: [
        // 1 seed evaluation
        { id: 'e2', relationId: '3', ratings: { trust: 2, interactions: 1, affinity: 2, support: 1, sharedNetwork: 1 }, score: 15, tier: 'Distant', createdAt: '2025-12-20T09:00:00Z' },
        // 1 non-seed evaluation (eval-* ID)
        { id: userEvalId, relationId: userRelId, ratings: { trust: 3, interactions: 3, affinity: 3, support: 3, sharedNetwork: 3 }, score: 50, tier: 'Active', createdAt: '2026-01-01T00:00:00Z' },
      ],
      places: [
        // 1 seed place
        { id: 'seed-place-2', name: 'Le Comptoir Calme', category: 'cafe', personalFit: 'kept', createdAt: '2026-03-05T09:30:00Z' },
        // 1 non-seed place (p-{timestamp} ID)
        { id: userPlaceId, name: 'My Café', category: 'cafe', personalFit: 'kept', createdAt: '2026-06-01T10:00:00Z' },
      ],
      receivedObjects: [],
      passedObjects: [],
      progressivePrivateSignals: {},
    });

    // State is now: 1 seed rel + 1 non-seed rel, 1 seed eval + 1 non-seed eval,
    // 1 seed place + 1 non-seed place. purgeSeedData has NOT yet run.
    expect(getRelationsSnapshot()).toHaveLength(2);
    expect(getEvaluationsSnapshot()).toHaveLength(2);
    expect(getPlacesSnapshot()).toHaveLength(2);

    purgeSeedData();

    // Seeds removed
    expect(getRelationsSnapshot().find((r) => r.id === '3')).toBeUndefined();
    expect(getEvaluationsSnapshot().find((e) => e.id === 'e2')).toBeUndefined();
    expect(getPlacesSnapshot().find((p) => p.id === 'seed-place-2')).toBeUndefined();

    // Non-seed entities survived
    expect(getRelationsSnapshot().find((r) => r.id === userRelId)).toBeDefined();
    expect(getEvaluationsSnapshot().find((e) => e.id === userEvalId)).toBeDefined();
    expect(getPlacesSnapshot().find((p) => p.id === userPlaceId)).toBeDefined();
  });

  it('X4: is idempotent — second call returns false and changes nothing', () => {
    purgeSeedData();
    const afterFirst = {
      relations: getRelationsSnapshot().length,
      evaluations: getEvaluationsSnapshot().length,
      places: getPlacesSnapshot().length,
      receivedObjects: getReceivedObjectsSnapshot().length,
    };

    const secondResult = purgeSeedData();

    expect(secondResult).toBe(false);
    expect(getRelationsSnapshot()).toHaveLength(afterFirst.relations);
    expect(getEvaluationsSnapshot()).toHaveLength(afterFirst.evaluations);
    expect(getPlacesSnapshot()).toHaveLength(afterFirst.places);
    expect(getReceivedObjectsSnapshot()).toHaveLength(afterFirst.receivedObjects);
  });

  it('X5: mixed state — seeds removed, non-seed entities preserved', () => {
    // Add 1 bootstrap relation and 1 bootstrap-linked receivedObject
    upsertBootstrappedSharedRelations([makeBootstrapRow('canonical-x5')]);
    const [delivered] = materializePassDeliveries([{
      fromDeliveryId: 'delivery-x5',
      canonicalRelationId: 'canonical-x5',
      objectType: 'place',
      objectPayload: { objectId: 'remote-x5', nameSnapshot: 'Test Place', categorySnapshot: 'cafe' },
    }]);

    purgeSeedData();

    // Bootstrap relation survived
    expect(getRelationsSnapshot().some((r) => r.canonicalRelationId === 'canonical-x5')).toBe(true);
    // Materialized receivedObject survived (id: recv-{timestamp}-{suffix}, not recv-seed-*)
    expect(getReceivedObjectsSnapshot().some((ro) => ro.id === delivered.id)).toBe(true);
    // All seeds gone
    expect(getRelationsSnapshot().filter((r) => /^\d+$/.test(r.id))).toHaveLength(0);
    expect(getReceivedObjectsSnapshot().filter((ro) => ro.id.startsWith('recv-seed-'))).toHaveLength(0);
  });
});

// ── B1: seed me purge in production ──────────────────────────────────────────
//
// __DEV__ = false in vitest (vitest.config.ts define). These tests confirm that
// the seed Yasmine identity never surfaces in a production context.
//
describe('purgeSeedData — me slice (B1)', () => {
  it('M1: fresh prod install — me starts blank (no displayName, no handle)', () => {
    // resetDevStateToSeed forcibly sets state.me = SEED_ME (test-only helper).
    // In prod, state initializes to BLANK_ME. Simulate by applying a state with
    // no persisted me — the else branch in applyHydratedState persists blank me.
    applyHydratedState(null);
    const me = getMeSnapshot();
    expect(me.displayName).toBe('');
    expect(me.handle).toBe('');
    expect(me.isProfileSetup).toBe(false);
  });

  it('M2: existing install with persisted seed me — purge resets to blank', () => {
    // Simulate a polluted prod installation: seed me was persisted before B1 fix.
    applyHydratedState({
      seedVersion: SEED_VERSION,
      me: { id: 'me-local-001', displayName: 'Yasmine', handle: '@yasmine.baobab', avatarSeed: 'Y', isProfileSetup: false },
      relations: [],
      evaluations: [],
      places: [],
      receivedObjects: [],
      passedObjects: [],
      progressivePrivateSignals: {},
    });
    // At this point me has been hydrated with seed values.
    expect(getMeSnapshot().handle).toBe('@yasmine.baobab');

    // Production boot calls purgeSeedData() after hydration.
    purgeSeedData();

    const me = getMeSnapshot();
    expect(me.displayName).toBe('');
    expect(me.handle).toBe('');
    expect(me.isProfileSetup).toBe(false);
  });
});

// ── upsertBootstrappedSharedRelations — counterpartPublicProfileId backfill ──
//
// Covers the day11 patch: when the RPC returns counterpart_public_profile_id
// for a relation that was previously materialized with null (e.g. before day11),
// the existing relation must be updated in-place without touching other fields.

describe('upsertBootstrappedSharedRelations — counterpartPublicProfileId backfill', () => {
  const CANON = 'b1-canonical-ppid-test';
  const PPID  = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  function makeRow(overrides: Partial<SharedRelationBootstrapInput> = {}): SharedRelationBootstrapInput {
    return {
      relationship_id:               CANON,
      status:                        'revealed',
      my_side:                       'sideA',
      side_a_present:                true,
      side_b_present:                true,
      side_a_reading_id:             null,
      side_b_reading_id:             null,
      cooking_started_at:            null,
      unlock_at:                     null,
      ready_at:                      null,
      revealed_at:                   '2026-01-01T00:00:00Z',
      relationship_name_revealed:    true,
      counterpart_public_profile_id: null,
      counterpart_display_name:      null,
      counterpart_handle:            null,
      ...overrides,
    };
  }

  beforeEach(() => {
    resetDevStateToSeed();
    // Pre-materialize the relation with null counterpartPublicProfileId
    upsertBootstrappedSharedRelations([makeRow()]);
    const pre = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON);
    expect(pre).toBeDefined();
    expect(pre!.counterpartPublicProfileId).toBeNull();
  });

  it('B1: patches null → non-null when RPC now provides a value', () => {
    upsertBootstrappedSharedRelations([makeRow({ counterpart_public_profile_id: PPID })]);
    const rel = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON);
    expect(rel!.counterpartPublicProfileId).toBe(PPID);
  });

  it('B2: does not overwrite an already-set counterpartPublicProfileId', () => {
    // Patch once to set PPID
    upsertBootstrappedSharedRelations([makeRow({ counterpart_public_profile_id: PPID })]);
    // Call again with a different value
    const OTHER = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    upsertBootstrappedSharedRelations([makeRow({ counterpart_public_profile_id: OTHER })]);
    const rel = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON);
    // Original PPID is preserved — non-null is never overwritten
    expect(rel!.counterpartPublicProfileId).toBe(PPID);
  });

  it('B3: leaves relation unchanged when RPC row has null counterpart_public_profile_id', () => {
    const snapshot = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON);
    const before = { ...snapshot };
    upsertBootstrappedSharedRelations([makeRow({ counterpart_public_profile_id: null })]);
    const after = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON);
    expect(after!.counterpartPublicProfileId).toBeNull();
    expect(after!.id).toBe(before.id);
    expect(after!.name).toBe(before.name);
  });

  it('B4: patch does not alter any other field on the relation', () => {
    const before = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON)!;
    upsertBootstrappedSharedRelations([makeRow({ counterpart_public_profile_id: PPID })]);
    const after = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON)!;
    // Only counterpartPublicProfileId changed
    expect(after.id).toBe(before.id);
    expect(after.name).toBe(before.name);
    expect(after.source).toBe(before.source);
    expect(after.canonicalRelationId).toBe(before.canonicalRelationId);
    expect(after.archived).toBe(before.archived);
    expect(after.identityStatus).toBe(before.identityStatus);
    expect(after.counterpartPublicProfileId).toBe(PPID);
  });
});

// ── upsertBootstrappedSharedRelations — counterpart identity (B4 / B11 Volet B) ─
//
// New contract (B11 Volet B): counterpart_display_name is stored in the
// server-owned field `counterpartDisplayName`. `name` stays the '(shared)'
// placeholder (last-resort cascade fallback) and `privateLabel` is left unset
// so the display cascade (getNormalizedPrivateLabel) resolves to the server
// name until the user sets a private override via the edit screen.

describe('upsertBootstrappedSharedRelations — counterpart identity (B4 / B11 Volet B)', () => {
  const CANON_NEW  = 'b4-new-canon-001';
  const CANON_EXIST = 'b4-exist-canon-002';

  function makeB4Row(canonicalId: string, overrides: Partial<SharedRelationBootstrapInput> = {}): SharedRelationBootstrapInput {
    return {
      relationship_id:               canonicalId,
      status:                        'revealed',
      my_side:                       'sideA',
      side_a_present:                true,
      side_b_present:                true,
      side_a_reading_id:             null,
      side_b_reading_id:             null,
      cooking_started_at:            null,
      unlock_at:                     null,
      ready_at:                      null,
      revealed_at:                   '2026-01-01T00:00:00Z',
      relationship_name_revealed:    true,
      counterpart_public_profile_id: null,
      counterpart_display_name:      null,
      counterpart_handle:            null,
      ...overrides,
    };
  }

  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('N1: new row stores counterpart_display_name in counterpartDisplayName; name stays placeholder, privateLabel unset', () => {
    upsertBootstrappedSharedRelations([
      makeB4Row(CANON_NEW, { counterpart_display_name: 'Alice', counterpart_handle: '@alice' }),
    ]);
    const rel = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON_NEW);
    expect(rel).toBeDefined();
    expect(rel!.counterpartDisplayName).toBe('Alice');
    expect(rel!.name).toBe('(shared)');
    expect(rel!.privateLabel).toBeUndefined();
    expect(rel!.handle).toBe('@alice');
    expect(rel!.avatarSeed).toBe('A');
    // Display cascade resolves to the server name.
    expect(getNormalizedPrivateLabel(rel!)).toBe('Alice');
  });

  it('N2: new row with null counterpart_display_name → placeholder, counterpartDisplayName null', () => {
    upsertBootstrappedSharedRelations([makeB4Row(CANON_NEW)]);
    const rel = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON_NEW);
    expect(rel!.name).toBe('(shared)');
    expect(rel!.counterpartDisplayName).toBeNull();
    expect(rel!.avatarSeed).toBe('?');
    expect(rel!.handle).toBeUndefined();
    // B21: the '(shared)' placeholder is never surfaced — no name, no handle →
    // explicit pending label instead.
    expect(getNormalizedPrivateLabel(rel!)).toBe('Invitation pending');
  });

  it('N3 (backfill initial): existing placeholder relation gains counterpartDisplayName on next bootstrap', () => {
    // First bootstrap: no display_name → placeholder, counterpartDisplayName null
    upsertBootstrappedSharedRelations([makeB4Row(CANON_EXIST)]);
    const before = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON_EXIST)!;
    expect(before.name).toBe('(shared)');
    expect(before.counterpartDisplayName).toBeNull();

    // Second bootstrap (after B4 SQL apply): RPC now returns display_name
    upsertBootstrappedSharedRelations([
      makeB4Row(CANON_EXIST, { counterpart_display_name: 'Bob', counterpart_handle: '@bob' }),
    ]);
    const after = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON_EXIST)!;
    expect(after.counterpartDisplayName).toBe('Bob');
    expect(after.name).toBe('(shared)');       // never touched
    expect(after.privateLabel).toBeUndefined(); // never touched
    expect(after.handle).toBe('@bob');
    expect(after.avatarSeed).toBe('B');
    expect(after.id).toBe(before.id);
    expect(getNormalizedPrivateLabel(after)).toBe('Bob');
  });

  it('N4 (rename propagated): a changed counterpart_display_name updates counterpartDisplayName', () => {
    upsertBootstrappedSharedRelations([makeB4Row(CANON_EXIST, { counterpart_display_name: 'Alice' })]);
    const first = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON_EXIST)!;
    expect(first.counterpartDisplayName).toBe('Alice');

    // Counterpart renamed themselves server-side → RPC returns a new name.
    upsertBootstrappedSharedRelations([
      makeB4Row(CANON_EXIST, { counterpart_display_name: 'Alice B.' }),
    ]);
    const after = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON_EXIST)!;
    expect(after.counterpartDisplayName).toBe('Alice B.');
    expect(getNormalizedPrivateLabel(after)).toBe('Alice B.');
  });

  it('N5 (local edit preserved): a privateLabel override wins over server counterpartDisplayName', () => {
    // Inject a relation the user has renamed ('Coloc du 3e') that already
    // carries a server name. The override is neither '(shared)' nor === name,
    // so hydration keeps it.
    applyHydratedState({
      me: getMeSnapshot(),
      relations: [
        {
          id: 'b11-edited',
          name: '(shared)',
          privateLabel: 'Coloc du 3e',
          counterpartDisplayName: 'Alice',
          source: 'bootstrap' as const,
          archived: false,
          createdAt: '2026-01-01T00:00:00Z',
          identityStatus: 'verified' as const,
          relationshipNameRevealed: true,
          avatarSeed: 'C',
          anchorMode: 'bootstrap' as const,
          anchorValue: null,
          relationDepth: 'known' as const,
          canonicalRelationId: CANON_EXIST,
          localState: {
            sideA: { exists: true, identityStatus: 'verified' as const, hasPrivateReading: true },
            sideB: { exists: true, identityStatus: 'verified' as const, hasPrivateReading: true },
            revealSnapshot: { status: 'revealed', revealed: true },
          },
        },
      ],
      evaluations: [],
      places: [],
      passedObjects: [],
      receivedObjects: [],
      progressivePrivateSignals: {},
      seedVersion: SEED_VERSION,
    });
    // Server sends a fresh name — counterpartDisplayName updates, override untouched.
    upsertBootstrappedSharedRelations([
      makeB4Row(CANON_EXIST, { counterpart_display_name: 'Alice B.' }),
    ]);
    const rel = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON_EXIST)!;
    expect(rel.privateLabel).toBe('Coloc du 3e');       // user override preserved
    expect(rel.counterpartDisplayName).toBe('Alice B.'); // server truth still refreshed
    expect(getNormalizedPrivateLabel(rel)).toBe('Coloc du 3e'); // override wins
  });

  it('N6 (empty name → no patch): a null counterpart_display_name never clobbers an existing one', () => {
    upsertBootstrappedSharedRelations([makeB4Row(CANON_EXIST, { counterpart_display_name: 'Alice' })]);
    // Later bootstrap where the RPC momentarily returns null (counterpart profile gap).
    upsertBootstrappedSharedRelations([makeB4Row(CANON_EXIST, { counterpart_display_name: null })]);
    const rel = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON_EXIST)!;
    expect(rel.counterpartDisplayName).toBe('Alice'); // preserved, not wiped
  });
});

// ── upsertBootstrappedSharedRelations — B22 reveal status re-sync ──────────────
//
// The bootstrap row is server truth for status. An existing relation must adopt
// a MORE advanced server status (waiting → revealed) so it becomes pass-eligible,
// while never downgrading a local reveal and preserving firstViewedAt/mutualScore.

describe('upsertBootstrappedSharedRelations — B22 reveal status re-sync', () => {
  const CANON = 'b22-canon-001';
  const SIDES = {
    sideA: { exists: true, identityStatus: 'verified' as const, hasPrivateReading: true },
    sideB: { exists: true, identityStatus: 'verified' as const, hasPrivateReading: true },
  };

  function serverRow(status: string, over: Partial<SharedRelationBootstrapInput> = {}): SharedRelationBootstrapInput {
    return {
      relationship_id: CANON,
      status,
      my_side: 'sideA',
      side_a_present: true,
      side_b_present: true,
      side_a_reading_id: 'ev-a',
      side_b_reading_id: 'ev-b',
      cooking_started_at: null,
      unlock_at: null,
      ready_at: status === 'reveal_ready' || status === 'revealed' ? '2026-07-01T00:00:00Z' : null,
      revealed_at: status === 'revealed' ? '2026-07-01T00:00:00Z' : null,
      relationship_name_revealed: status === 'revealed',
      counterpart_public_profile_id: null,
      counterpart_display_name: 'iPhoneBB',
      counterpart_handle: '@iphonebb',
      ...over,
    };
  }

  function injectExisting(snapshot: object) {
    applyHydratedState({
      me: getMeSnapshot(),
      relations: [
        {
          id: 'b22-rel',
          name: '(shared)',
          source: 'bootstrap' as const,
          archived: false,
          createdAt: '2026-05-01T00:00:00Z',
          identityStatus: 'verified' as const,
          relationshipNameRevealed: false,
          avatarSeed: 'I',
          anchorMode: 'bootstrap' as const,
          anchorValue: null,
          relationDepth: 'known' as const,
          canonicalRelationId: CANON,
          counterpartDisplayName: 'iPhoneBB',
          localState: { ...SIDES, revealSnapshot: snapshot },
        },
      ],
      evaluations: [],
      places: [],
      passedObjects: [],
      receivedObjects: [],
      progressivePrivateSignals: {},
      seedVersion: SEED_VERSION,
    });
    return getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON)!;
  }

  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('Y1: existing waiting + server revealed → local advances to revealed', () => {
    injectExisting({ status: 'waiting_other_side', revealed: false });
    upsertBootstrappedSharedRelations([serverRow('revealed')]);
    const rel = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON)!;
    expect(rel.localState.revealSnapshot.status).toBe('revealed');
    expect(rel.localState.revealSnapshot.revealed).toBe(true);
    expect(rel.relationshipNameRevealed).toBe(true);
  });

  it('Y2: firstViewedAt is preserved when advancing (B5 gate not reset)', () => {
    injectExisting({ status: 'reveal_ready', revealed: false, firstViewedAt: '2026-06-01T09:00:00Z' });
    upsertBootstrappedSharedRelations([serverRow('revealed')]);
    const rel = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON)!;
    expect(rel.localState.revealSnapshot.status).toBe('revealed');
    expect(rel.localState.revealSnapshot.firstViewedAt).toBe('2026-06-01T09:00:00Z');
  });

  it('Y3: local revealed + server waiting → NO downgrade (B10 Fix A)', () => {
    injectExisting({ status: 'revealed', revealed: true, firstViewedAt: '2026-06-01T09:00:00Z' });
    upsertBootstrappedSharedRelations([serverRow('waiting_other_side')]);
    const rel = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON)!;
    expect(rel.localState.revealSnapshot.status).toBe('revealed');
    expect(rel.localState.revealSnapshot.revealed).toBe(true);
  });

  it('Y4: local mutualScore/tier preserved (server row carries neither)', () => {
    // Hydration re-derives tier from mutualScore: getMutualTier(26) = 'Distant'.
    injectExisting({ status: 'revealed', revealed: true, mutualScore: 26, tier: 'Distant', firstViewedAt: '2026-06-01T09:00:00Z' });
    upsertBootstrappedSharedRelations([serverRow('revealed')]);
    const rel = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON)!;
    expect(rel.localState.revealSnapshot.mutualScore).toBe(26);
    expect(rel.localState.revealSnapshot.tier).toBe('Distant');
  });

  it('Y5: a re-synced relation is pass-eligible (revealed + canonicalRelationId + !archived)', () => {
    injectExisting({ status: 'waiting_other_side', revealed: false });
    upsertBootstrappedSharedRelations([serverRow('revealed')]);
    const rel = getRelationsSnapshot().find((r) => r.canonicalRelationId === CANON)!;
    const eligible = rel.localState.revealSnapshot.revealed && !!rel.canonicalRelationId && !rel.archived;
    expect(eligible).toBe(true);
  });

  it('Y6: a brand-new revealed row still creates a revealed relation (creation path unchanged)', () => {
    upsertBootstrappedSharedRelations([serverRow('revealed', { relationship_id: 'b22-new-canon' })]);
    const rel = getRelationsSnapshot().find((r) => r.canonicalRelationId === 'b22-new-canon')!;
    expect(rel).toBeDefined();
    expect(rel.localState.revealSnapshot.revealed).toBe(true);
  });
});

// ── applyHydratedState — legacy privateLabel cleanup (B11 Volet B) ────────────
//
// Older builds auto-set privateLabel = name (or the '(shared)' placeholder).
// Hydration strips that auto-set signature so the display cascade can fall
// through to counterpartDisplayName. Genuine user overrides are preserved.

describe('applyHydratedState — legacy privateLabel cleanup (B11 Volet B)', () => {
  function hydrateOne(relation: Record<string, unknown>) {
    applyHydratedState({
      me: getMeSnapshot(),
      relations: [
        {
          id: 'legacy-1',
          name: '(shared)',
          source: 'bootstrap' as const,
          archived: false,
          createdAt: '2026-01-01T00:00:00Z',
          identityStatus: 'verified' as const,
          relationshipNameRevealed: true,
          avatarSeed: '?',
          anchorMode: 'bootstrap' as const,
          anchorValue: null,
          relationDepth: 'known' as const,
          canonicalRelationId: 'legacy-canon',
          localState: {
            sideA: { exists: true, identityStatus: 'verified' as const, hasPrivateReading: true },
            sideB: { exists: true, identityStatus: 'verified' as const, hasPrivateReading: true },
            revealSnapshot: { status: 'revealed', revealed: true },
          },
          ...relation,
        },
      ],
      evaluations: [],
      places: [],
      passedObjects: [],
      receivedObjects: [],
      progressivePrivateSignals: {},
      seedVersion: SEED_VERSION,
    });
    return getRelationsSnapshot().find((r) => r.id === 'legacy-1')!;
  }

  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('L1: privateLabel === "(shared)" placeholder is stripped', () => {
    const rel = hydrateOne({ name: '(shared)', privateLabel: '(shared)', counterpartDisplayName: 'Alice' });
    expect(rel.privateLabel).toBeUndefined();
    expect(getNormalizedPrivateLabel(rel)).toBe('Alice');
  });

  it('L2: privateLabel === name (auto-set signature) is stripped', () => {
    const rel = hydrateOne({ name: 'Alice', privateLabel: 'Alice', counterpartDisplayName: 'Alice B.' });
    expect(rel.privateLabel).toBeUndefined();
    // Cascade now falls through name → counterpartDisplayName wins over name.
    expect(getNormalizedPrivateLabel(rel)).toBe('Alice B.');
  });

  it('L3: a genuine user override (privateLabel !== name, !== placeholder) is preserved', () => {
    const rel = hydrateOne({ name: '(shared)', privateLabel: 'Coloc du 3e', counterpartDisplayName: 'Alice' });
    expect(rel.privateLabel).toBe('Coloc du 3e');
    expect(getNormalizedPrivateLabel(rel)).toBe('Coloc du 3e');
  });
});

// ── reconcileOrphanedSharedRelations — B17 orphan archival ────────────────────
//
// Shared-backed relations whose canonical id is no longer returned by
// my_shared_relationships() (server row purged) linger as local '(shared)'
// ghosts. Reconciliation archives them — but ONLY on a resolved server response
// carrying ≥1 id, and never touches manual/scan/invite_number relations.

describe('reconcileOrphanedSharedRelations — B17 orphan archival', () => {
  const SIDES = {
    sideA: { exists: true, identityStatus: 'verified' as const, hasPrivateReading: true },
    sideB: { exists: true, identityStatus: 'verified' as const, hasPrivateReading: true },
  };
  const SNAP = { status: 'revealed' as const, revealed: true, firstViewedAt: '2026-07-01T00:00:00Z' };

  function rel(over: Record<string, unknown>) {
    return {
      id: 'x',
      name: '(shared)',
      source: 'bootstrap' as const,
      archived: false,
      createdAt: '2026-01-01T00:00:00Z',
      identityStatus: 'verified' as const,
      relationshipNameRevealed: true,
      avatarSeed: '?',
      anchorMode: 'bootstrap' as const,
      anchorValue: null,
      relationDepth: 'known' as const,
      localState: { ...SIDES, revealSnapshot: SNAP },
      ...over,
    };
  }

  function hydrate(relations: Record<string, unknown>[]) {
    applyHydratedState({
      me: getMeSnapshot(),
      relations,
      evaluations: [],
      places: [],
      passedObjects: [],
      receivedObjects: [],
      progressivePrivateSignals: {},
      seedVersion: SEED_VERSION,
    });
  }

  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('A1: a bootstrap orphan (canonical id absent from server set) is archived', () => {
    hydrate([rel({ id: 'orphan-b', source: 'bootstrap', canonicalRelationId: 'canon-gone' })]);
    const n = reconcileOrphanedSharedRelations(new Set(['canon-present']));
    expect(n).toBe(1);
    expect(getRelationsSnapshot().find((r) => r.id === 'orphan-b')!.archived).toBe(true);
  });

  it('A2: a claim orphan is archived too', () => {
    hydrate([rel({ id: 'orphan-c', source: 'claim', canonicalRelationId: 'canon-gone' })]);
    const n = reconcileOrphanedSharedRelations(new Set(['canon-present']));
    expect(n).toBe(1);
    expect(getRelationsSnapshot().find((r) => r.id === 'orphan-c')!.archived).toBe(true);
  });

  it('A3: a legitimate shared relation present in the server set is untouched', () => {
    hydrate([rel({ id: 'legit', source: 'bootstrap', canonicalRelationId: 'canon-present' })]);
    const n = reconcileOrphanedSharedRelations(new Set(['canon-present']));
    expect(n).toBe(0);
    expect(getRelationsSnapshot().find((r) => r.id === 'legit')!.archived).toBe(false);
  });

  it('A4: manual / scan relations are never archived, even absent from the set', () => {
    hydrate([
      rel({ id: 'manual', source: 'manual', anchorMode: 'manual', name: 'Alice', canonicalRelationId: null }),
      rel({ id: 'scan', source: 'scan', anchorMode: 'scan', name: 'Bob', canonicalRelationId: null }),
    ]);
    const n = reconcileOrphanedSharedRelations(new Set(['canon-present']));
    expect(n).toBe(0);
    expect(getRelationsSnapshot().find((r) => r.id === 'manual')!.archived).toBe(false);
    expect(getRelationsSnapshot().find((r) => r.id === 'scan')!.archived).toBe(false);
  });

  it('A5: an empty server set is a no-op (covers rows-vide AND network-failure — no server truth → archive nothing)', () => {
    hydrate([rel({ id: 'orphan-b', source: 'bootstrap', canonicalRelationId: 'canon-gone' })]);
    const n = reconcileOrphanedSharedRelations(new Set());
    expect(n).toBe(0);
    expect(getRelationsSnapshot().find((r) => r.id === 'orphan-b')!.archived).toBe(false);
  });

  it('A6: an already-archived orphan is left alone (count not inflated)', () => {
    hydrate([rel({ id: 'was-archived', source: 'bootstrap', archived: true, canonicalRelationId: 'canon-gone' })]);
    const n = reconcileOrphanedSharedRelations(new Set(['canon-present']));
    expect(n).toBe(0);
  });
});

// ── openMutualRevealForTest — B5 firstViewedAt gate ──────────────────────────
//
// Verifies the B5 fix: bootstrapped relations arrive with status='revealed' but
// no firstViewedAt (server truth, not local action). openMutualReveal stamps
// firstViewedAt so the local gate opens — idempotent on second call.

describe('openMutualRevealForTest — B5 firstViewedAt gate', () => {
  // Seed id '7' is status='revealed', revealed=true, no firstViewedAt.
  const SEED_REVEALED_ID = '7';

  beforeEach(() => {
    resetDevStateToSeed();
    const rel = getRelationsSnapshot().find((r) => r.id === SEED_REVEALED_ID);
    expect(rel).toBeDefined();
    expect(rel!.localState.revealSnapshot.status).toBe('revealed');
  });

  it('B5-G1: gate closed — seed revealed relation has no firstViewedAt by default', () => {
    const rel = getRelationsSnapshot().find((r) => r.id === SEED_REVEALED_ID)!;
    expect(rel.localState.revealSnapshot.firstViewedAt).toBeUndefined();
  });

  it('B5-G2: openMutualReveal stamps firstViewedAt on bootstrap-revealed relation', () => {
    openMutualRevealForTest(SEED_REVEALED_ID);
    const rel = getRelationsSnapshot().find((r) => r.id === SEED_REVEALED_ID)!;
    expect(rel.localState.revealSnapshot.firstViewedAt).toBeDefined();
    expect(typeof rel.localState.revealSnapshot.firstViewedAt).toBe('string');
  });

  it('B5-G3: openMutualReveal is idempotent — firstViewedAt not overwritten on second call', () => {
    openMutualRevealForTest(SEED_REVEALED_ID);
    const after1 = getRelationsSnapshot().find((r) => r.id === SEED_REVEALED_ID)!;
    const ts1 = after1.localState.revealSnapshot.firstViewedAt;
    expect(ts1).toBeDefined();

    openMutualRevealForTest(SEED_REVEALED_ID);
    const after2 = getRelationsSnapshot().find((r) => r.id === SEED_REVEALED_ID)!;
    expect(after2.localState.revealSnapshot.firstViewedAt).toBe(ts1);
  });

  it('B5-G4: openMutualReveal does not alter other snapshot fields on already-revealed relation', () => {
    const before = getRelationsSnapshot().find((r) => r.id === SEED_REVEALED_ID)!;
    const snapBefore = { ...before.localState.revealSnapshot };

    openMutualRevealForTest(SEED_REVEALED_ID);

    const after = getRelationsSnapshot().find((r) => r.id === SEED_REVEALED_ID)!;
    const snapAfter = after.localState.revealSnapshot;

    expect(snapAfter.status).toBe(snapBefore.status);
    expect(snapAfter.revealed).toBe(snapBefore.revealed);
    expect(snapAfter.mutualScore).toBe(snapBefore.mutualScore);
    expect(snapAfter.revealedAt).toBe(snapBefore.revealedAt);
    // Only firstViewedAt should differ (was undefined, now set)
    expect(snapBefore.firstViewedAt).toBeUndefined();
    expect(snapAfter.firstViewedAt).toBeDefined();
  });
});

// ── openMutualRevealForTest — B10: return values for every local status ───────
//
// Documents the exact boolean contract of openMutualRevealInState so Fix B can
// branch correctly. Six cases from the B10 diagnostic correction-1 table.
// Seed relations used: '1' (waiting_other_side), '4' (cooking_reveal, no unlockAt),
// '5' (reveal_ready), '7' (revealed, no firstViewedAt).
// Cases 2c (cooking elapsed) and 7-fvt (revealed with firstViewedAt) use
// applyHydratedState to inject the required state.

describe('openMutualRevealForTest — B10 return values per local status', () => {
  const MINIMAL_SIDES = {
    sideA: { exists: true, identityStatus: 'verified' as const, hasPrivateReading: true },
    sideB: { exists: true, identityStatus: 'verified' as const, hasPrivateReading: true },
  };

  function injectRelation(id: string, revealSnapshot: object) {
    applyHydratedState({
      me: getMeSnapshot(),
      relations: [
        {
          id,
          name: 'Test',
          source: 'bootstrap' as const,
          archived: false,
          createdAt: '2026-01-01T00:00:00Z',
          identityStatus: 'verified' as const,
          relationshipNameRevealed: false,
          avatarSeed: 'T',
          anchorMode: 'bootstrap' as const,
          anchorValue: null,
          relationDepth: 'known' as const,
          privateLabel: 'Test',
          canonicalRelationId: null,
          localState: { ...MINIMAL_SIDES, revealSnapshot },
        },
      ],
      evaluations: [],
      places: [],
      passedObjects: [],
      receivedObjects: [],
      progressivePrivateSignals: {},
      seedVersion: SEED_VERSION,
    });
  }

  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('B10-R1: waiting_other_side → returns false, local status unchanged', () => {
    // Seed '1' has status 'waiting_other_side'
    const returned = openMutualRevealForTest('1');
    expect(returned).toBe(false);
    const rel = getRelationsSnapshot().find((r) => r.id === '1');
    expect(rel!.localState.revealSnapshot.status).toBe('waiting_other_side');
  });

  it('B10-R2: cooking_reveal without unlockAt → returns false, local status unchanged', () => {
    // Seed '4' has status 'cooking_reveal' with no unlockAt — markRevealReady exits early
    const returned = openMutualRevealForTest('4');
    expect(returned).toBe(false);
    const rel = getRelationsSnapshot().find((r) => r.id === '4');
    expect(rel!.localState.revealSnapshot.status).toBe('cooking_reveal');
  });

  it('B10-R3: cooking_reveal with elapsed unlockAt → returns true, transitions to revealed', () => {
    injectRelation('cook-elapsed', {
      status: 'cooking_reveal',
      revealed: false,
      cookingStartedAt: '2026-01-01T10:00:00Z',
      unlockAt: '2026-01-01T10:00:15Z', // past
      relationshipNameRevealed: false,
    });
    const returned = openMutualRevealForTest('cook-elapsed');
    expect(returned).toBe(true);
    const snap = getRelationSnapshotById('cook-elapsed')!.localState.revealSnapshot;
    expect(snap.status).toBe('revealed');
    expect(snap.firstViewedAt).toBeDefined();
  });

  it('B10-R4: reveal_ready → returns true, transitions to revealed', () => {
    // Seed '5' has status 'reveal_ready'
    const returned = openMutualRevealForTest('5');
    expect(returned).toBe(true);
    const snap = getRelationsSnapshot().find((r) => r.id === '5')!.localState.revealSnapshot;
    expect(snap.status).toBe('revealed');
    expect(snap.firstViewedAt).toBeDefined();
  });

  it('B10-R5: revealed without firstViewedAt → stamps firstViewedAt, returns false', () => {
    // Seed '7' has status 'revealed', no firstViewedAt — the bootstrap case (B5)
    const before = getRelationsSnapshot().find((r) => r.id === '7')!;
    expect(before.localState.revealSnapshot.status).toBe('revealed');
    expect(before.localState.revealSnapshot.firstViewedAt).toBeUndefined();

    const returned = openMutualRevealForTest('7');
    expect(returned).toBe(false); // movedToReady=false, returns movedToReady (line 1875)

    const after = getRelationsSnapshot().find((r) => r.id === '7')!;
    expect(after.localState.revealSnapshot.firstViewedAt).toBeDefined(); // stamp succeeded
    expect(after.localState.revealSnapshot.status).toBe('revealed'); // status unchanged
  });

  it('B10-R6: revealed with firstViewedAt already set → no-op, returns false', () => {
    // First call stamps firstViewedAt
    openMutualRevealForTest('7');
    const ts = getRelationsSnapshot().find((r) => r.id === '7')!.localState.revealSnapshot.firstViewedAt;
    expect(ts).toBeDefined();

    // Second call: firstViewedAt already set → no-op
    const returned = openMutualRevealForTest('7');
    expect(returned).toBe(false);

    const after = getRelationsSnapshot().find((r) => r.id === '7')!;
    expect(after.localState.revealSnapshot.firstViewedAt).toBe(ts); // unchanged
  });
});

// ── syncLocalSnapshotForTest — B10: sync stale local snapshot to reveal_ready ──
//
// Verifies that syncLocalSnapshotToRevealReady patches the local revealSnapshot
// regardless of current status (waiting_other_side, cooking_reveal, reveal_ready),
// allowing openMutualRevealInState to run Branch 3 reliably on the next call.

describe('syncLocalSnapshotForTest — B10 local snapshot sync', () => {
  const SERVER_RECORD = {
    cooking_started_at: '2026-01-01T10:00:00Z',
    unlock_at: '2026-01-01T10:00:15Z',
    ready_at: '2026-01-01T10:00:15Z',
  };

  beforeEach(() => {
    resetDevStateToSeed();
  });

  it('S1: patches waiting_other_side to reveal_ready and absorbs server timestamps', () => {
    // Seed '1' is waiting_other_side
    syncLocalSnapshotForTest('1', SERVER_RECORD);
    const snap = getRelationSnapshotById('1')!.localState.revealSnapshot;
    expect(snap.status).toBe('reveal_ready');
    expect(snap.unlockAt).toBe('2026-01-01T10:00:15Z');
    expect(snap.readyAt).toBe('2026-01-01T10:00:15Z');
  });

  it('S2: after sync, openMutualRevealForTest on patched waiting_other_side returns true and transitions to revealed', () => {
    syncLocalSnapshotForTest('1', SERVER_RECORD);
    const returned = openMutualRevealForTest('1');
    expect(returned).toBe(true);
    const snap = getRelationSnapshotById('1')!.localState.revealSnapshot;
    expect(snap.status).toBe('revealed');
    expect(snap.firstViewedAt).toBeDefined();
  });

  it('S3: patches cooking_reveal (no unlockAt) to reveal_ready and absorbs server timestamps', () => {
    // Seed '4' is cooking_reveal without unlockAt
    syncLocalSnapshotForTest('4', SERVER_RECORD);
    const snap = getRelationSnapshotById('4')!.localState.revealSnapshot;
    expect(snap.status).toBe('reveal_ready');
    expect(snap.unlockAt).toBe('2026-01-01T10:00:15Z');
  });

  it('S4: does not alter relation id, name, or other fields', () => {
    const before = getRelationsSnapshot().find((r) => r.id === '1')!;
    syncLocalSnapshotForTest('1', SERVER_RECORD);
    const after = getRelationSnapshotById('1')!;
    expect(after.id).toBe(before.id);
    expect(after.name).toBe(before.name);
    expect(after.canonicalRelationId).toBe(before.canonicalRelationId);
    expect(after.archived).toBe(before.archived);
  });
});
