// PlaceQuickSignal — first structured word-of-mouth primitive for places.
// Private, optional, never displayed as a score, rating, or count. Feeds the
// algorithm only: repeat-desire, share-safety, and situational context.

export type PlaceContextFit =
  | 'date'
  | 'friends'
  | 'family'
  | 'work_focus'
  | 'quick_bite'
  | 'deep_talk'
  | 'calm'
  | 'discovery';

export const PLACE_CONTEXT_FIT_OPTIONS: readonly PlaceContextFit[] = [
  'date',
  'friends',
  'family',
  'work_focus',
  'quick_bite',
  'deep_talk',
  'calm',
  'discovery',
] as const;

export type PlaceExperienceLevel = 1 | 2 | 3 | 4 | 5;

export type RestaurantExperienceDimension =
  | 'food'
  | 'service'
  | 'atmosphere'
  | 'value'
  | 'cleanliness';

export const RESTAURANT_EXPERIENCE_DIMENSION_OPTIONS: readonly RestaurantExperienceDimension[] = [
  'food',
  'service',
  'atmosphere',
  'value',
  'cleanliness',
] as const;

export type RestaurantExperienceDimensions = Partial<
  Record<RestaurantExperienceDimension, PlaceExperienceLevel>
>;

export type PlaceQuickSignal = {
  repeatDesire?: boolean;
  shareSafe?: boolean;
  contextFit?: PlaceContextFit[];
  restaurantDimensions?: RestaurantExperienceDimensions;
};

export function isPlaceContextFit(value: unknown): value is PlaceContextFit {
  return (
    typeof value === 'string' &&
    PLACE_CONTEXT_FIT_OPTIONS.includes(value as PlaceContextFit)
  );
}

/**
 * Max 2 contexts, deduped, canonical order. Invalid values dropped silently.
 */
export function sanitizePlaceContextFit(value: unknown): PlaceContextFit[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<PlaceContextFit>();
  for (const item of value) {
    if (!isPlaceContextFit(item)) continue;
    seen.add(item);
    if (seen.size === 2) break;
  }
  const result = PLACE_CONTEXT_FIT_OPTIONS.filter((option) => seen.has(option));
  return result.length > 0 ? result : undefined;
}

function sanitizeOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function isRestaurantExperienceDimension(
  value: unknown,
): value is RestaurantExperienceDimension {
  return (
    typeof value === 'string' &&
    RESTAURANT_EXPERIENCE_DIMENSION_OPTIONS.includes(value as RestaurantExperienceDimension)
  );
}

export function isPlaceExperienceLevel(value: unknown): value is PlaceExperienceLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

/**
 * Unknown dimensions and out-of-range/non-integer values are dropped
 * silently. 1 and 5 are preserved exactly — never treated as falsy.
 */
export function sanitizeRestaurantExperienceDimensions(
  value: unknown,
): RestaurantExperienceDimensions | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;

  const result: RestaurantExperienceDimensions = {};
  for (const dimension of RESTAURANT_EXPERIENCE_DIMENSION_OPTIONS) {
    const level = raw[dimension];
    if (isPlaceExperienceLevel(level)) {
      result[dimension] = level;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * Returns undefined if all fields end up empty — quickSignal is never
 * stored as an empty object.
 */
export function sanitizePlaceQuickSignal(value: unknown): PlaceQuickSignal | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;

  const repeatDesire = sanitizeOptionalBoolean(raw.repeatDesire);
  const shareSafe = sanitizeOptionalBoolean(raw.shareSafe);
  const contextFit = sanitizePlaceContextFit(raw.contextFit);
  const restaurantDimensions = sanitizeRestaurantExperienceDimensions(raw.restaurantDimensions);

  if (
    repeatDesire === undefined &&
    shareSafe === undefined &&
    contextFit === undefined &&
    restaurantDimensions === undefined
  ) {
    return undefined;
  }

  return {
    ...(repeatDesire !== undefined ? { repeatDesire } : {}),
    ...(shareSafe !== undefined ? { shareSafe } : {}),
    ...(contextFit !== undefined ? { contextFit } : {}),
    ...(restaurantDimensions !== undefined ? { restaurantDimensions } : {}),
  };
}

export function hasPlaceQuickSignal(value: PlaceQuickSignal | undefined): boolean {
  if (!value) return false;
  return (
    value.repeatDesire !== undefined ||
    value.shareSafe !== undefined ||
    (value.contextFit !== undefined && value.contextFit.length > 0) ||
    (value.restaurantDimensions !== undefined &&
      Object.keys(value.restaurantDimensions).length > 0)
  );
}
