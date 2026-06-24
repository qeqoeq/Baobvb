import { beforeEach, describe, expect, it } from 'vitest';

import {
  appendPlaceRead,
  getPlacesSnapshot,
  resetDevStateToSeed,
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

  it('7. driverDimensions is limited to 2', () => {
    appendPlaceRead(KEPT_RESTAURANT_ID, {
      driverDimensions: ['food', 'service', 'atmosphere'] as never,
    });
    const entry = findPlace(KEPT_RESTAURANT_ID).reads![0];
    expect(entry.driverDimensions?.length).toBeLessThanOrEqual(2);
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
