import type { Place, PlaceCategory, PlacePersonalFit } from '@/store/useRelationsStore';

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  bar: 'Bar',
  spot: 'Spot',
  other: 'Other',
};

export const PLACE_PERSONAL_FIT_LABELS: Record<PlacePersonalFit, string> = {
  saved:       'Saved',
  tried:       'Tried',
  kept:        'Kept',
  not_for_me:  'Not for me',
};

const PLACE_PERSONAL_FIT_FALLBACKS: Record<PlacePersonalFit, string> = {
  saved:      'Saved for later.',
  tried:      'Tried once.',
  kept:       'Kept in your places.',
  not_for_me: 'Not for me.',
};

export function getPlaceCategoryLabel(category: unknown): string {
  if (typeof category !== 'string') return PLACE_CATEGORY_LABELS.other;
  if (category in PLACE_CATEGORY_LABELS) {
    return PLACE_CATEGORY_LABELS[category as PlaceCategory];
  }
  return PLACE_CATEGORY_LABELS.other;
}

export function getPlaceFitLabel(fit: unknown): string {
  if (typeof fit === 'string' && fit in PLACE_PERSONAL_FIT_LABELS) {
    return PLACE_PERSONAL_FIT_LABELS[fit as PlacePersonalFit];
  }
  return PLACE_PERSONAL_FIT_LABELS.saved;
}

export function getPlaceReading(place: Pick<Place, 'impression' | 'personalFit'>): string {
  const impression = place.impression?.trim();
  if (impression) return impression;
  return PLACE_PERSONAL_FIT_FALLBACKS[place.personalFit] ?? PLACE_PERSONAL_FIT_FALLBACKS.saved;
}

export function sanitizePlacePersonalFit(value: unknown): PlacePersonalFit {
  const valid: PlacePersonalFit[] = ['saved', 'tried', 'kept', 'not_for_me'];
  if (typeof value === 'string' && valid.includes(value as PlacePersonalFit)) {
    return value as PlacePersonalFit;
  }
  return 'saved';
}

export function sanitizePlaceSourceRelationId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
