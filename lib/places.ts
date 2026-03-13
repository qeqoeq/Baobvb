import type { Place, PlaceCategory } from '@/store/useRelationsStore';

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  bar: 'Bar',
  spot: 'Spot',
  other: 'Other',
};

export function getPlaceCategoryLabel(category: unknown): string {
  if (typeof category !== 'string') return PLACE_CATEGORY_LABELS.other;
  if (category in PLACE_CATEGORY_LABELS) {
    return PLACE_CATEGORY_LABELS[category as PlaceCategory];
  }
  return PLACE_CATEGORY_LABELS.other;
}

export function getPlaceRatingSignature(rating: unknown): string {
  const safeRating = sanitizeRating(rating);
  if (safeRating >= 5) return 'Loved it';
  if (safeRating >= 4) return 'Strong pick';
  if (safeRating >= 3) return 'Worth a try';
  if (safeRating >= 2) return 'Mixed feeling';
  return 'Not for me';
}

export function getPlaceReading(place: Pick<Place, 'impression' | 'rating'>): string {
  const impression = place.impression?.trim();
  if (impression) return impression;
  return getPlaceRatingSignature(place.rating);
}

export function getPlaceTone(rating: unknown): {
  tint: string;
  border: string;
  accent: string;
} {
  const safeRating = sanitizeRating(rating);
  if (safeRating >= 5) {
    return { tint: '#1D2A24', border: '#395248', accent: '#8FB49A' };
  }
  if (safeRating >= 4) {
    return { tint: '#1D262B', border: '#37454F', accent: '#8EA9BE' };
  }
  if (safeRating >= 3) {
    return { tint: '#232524', border: '#404443', accent: '#A7A08D' };
  }
  if (safeRating >= 2) {
    return { tint: '#2A2521', border: '#4B3F35', accent: '#B88C6E' };
  }
  return { tint: '#2A2020', border: '#4C3535', accent: '#C27E7E' };
}

export function sanitizeRating(rating: unknown): 1 | 2 | 3 | 4 | 5 {
  if (typeof rating !== 'number' || Number.isNaN(rating)) return 3;
  if (rating <= 1) return 1;
  if (rating >= 5) return 5;
  return Math.round(rating) as 1 | 2 | 3 | 4 | 5;
}
