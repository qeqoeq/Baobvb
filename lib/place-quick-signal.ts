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

// outcome was the first experience verdict; it is now legacy. landingLevel
// is the active verdict. repeatDesire remains legacy-compatible until the
// adaptive evidence model lands.
export type PlaceQuickSignalOutcome = 'would_go_back' | 'depends' | 'not_for_me';

export const PLACE_QUICK_SIGNAL_OUTCOME_OPTIONS: readonly PlaceQuickSignalOutcome[] = [
  'would_go_back',
  'depends',
  'not_for_me',
] as const;

/**
 * Private intensity of experience — not a Yelp rating, not a public
 * average, not a star, never displayed as a score. Used only to open the
 * right follow-up questions (drivers, dimensions) and, later, to feed a
 * private fit estimate.
 *   1 = Avoid
 *   2 = Not for me
 *   3 = Depends
 *   4 = Would go back
 *   5 = Exceptional
 */
export type PlaceLandingLevel = 1 | 2 | 3 | 4 | 5;

export const PLACE_LANDING_LEVEL_OPTIONS: readonly PlaceLandingLevel[] = [1, 2, 3, 4, 5] as const;

export const PLACE_LANDING_LEVEL_LABELS: Record<PlaceLandingLevel, string> = {
  1: 'À éviter',
  2: 'Pas pour moi',
  3: 'Ça dépend',
  4: 'J’y retournerais',
  5: 'Exceptionnel',
};

export type PlaceQuickSignal = {
  landingLevel?: PlaceLandingLevel;
  /** @deprecated legacy verdict, superseded by landingLevel. */
  outcome?: PlaceQuickSignalOutcome;
  repeatDesire?: boolean;
  shareSafe?: boolean;
  contextFit?: PlaceContextFit[];
  /**
   * Dimensions the user picked as having mattered for this experience —
   * gates which dimensions become notable in "A closer look". No rating
   * without a driver chosen first.
   */
  driverDimensions?: RestaurantExperienceDimension[];
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

export function isPlaceQuickSignalOutcome(value: unknown): value is PlaceQuickSignalOutcome {
  return (
    typeof value === 'string' &&
    PLACE_QUICK_SIGNAL_OUTCOME_OPTIONS.includes(value as PlaceQuickSignalOutcome)
  );
}

/**
 * Invalid/unknown values are dropped silently — undefined if absent or
 * malformed. Legacy-safe: never throws on old/unrelated data shapes.
 */
export function sanitizePlaceQuickSignalOutcome(
  value: unknown,
): PlaceQuickSignalOutcome | undefined {
  return isPlaceQuickSignalOutcome(value) ? value : undefined;
}

export function isPlaceLandingLevel(value: unknown): value is PlaceLandingLevel {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5;
}

/**
 * Accepts only the integers 1-5. Rejects 0, 6, decimals, strings, null.
 * Legacy-safe: undefined input/output never throws.
 */
export function sanitizePlaceLandingLevel(value: unknown): PlaceLandingLevel | undefined {
  return isPlaceLandingLevel(value) ? value : undefined;
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
 * Max 5 driver dimensions (all catalog dimensions), deduped, returned in
 * canonical catalog order (same convention as sanitizePlaceContextFit) rather
 * than input order — keeps rendering order stable regardless of selection
 * order. Invalid values dropped silently. Legacy-safe: undefined input →
 * undefined.
 */
export function sanitizePlaceDriverDimensions(
  value: unknown,
): RestaurantExperienceDimension[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<RestaurantExperienceDimension>();
  for (const item of value) {
    if (!isRestaurantExperienceDimension(item)) continue;
    seen.add(item);
    if (seen.size === 5) break;
  }
  const result = RESTAURANT_EXPERIENCE_DIMENSION_OPTIONS.filter((option) => seen.has(option));
  return result.length > 0 ? result : undefined;
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

  const landingLevel = sanitizePlaceLandingLevel(raw.landingLevel);
  const outcome = sanitizePlaceQuickSignalOutcome(raw.outcome);
  const repeatDesire = sanitizeOptionalBoolean(raw.repeatDesire);
  const shareSafe = sanitizeOptionalBoolean(raw.shareSafe);
  const contextFit = sanitizePlaceContextFit(raw.contextFit);
  const driverDimensions = sanitizePlaceDriverDimensions(raw.driverDimensions);
  const restaurantDimensions = sanitizeRestaurantExperienceDimensions(raw.restaurantDimensions);

  if (
    landingLevel === undefined &&
    outcome === undefined &&
    repeatDesire === undefined &&
    shareSafe === undefined &&
    contextFit === undefined &&
    driverDimensions === undefined &&
    restaurantDimensions === undefined
  ) {
    return undefined;
  }

  return {
    ...(landingLevel !== undefined ? { landingLevel } : {}),
    ...(outcome !== undefined ? { outcome } : {}),
    ...(repeatDesire !== undefined ? { repeatDesire } : {}),
    ...(shareSafe !== undefined ? { shareSafe } : {}),
    ...(contextFit !== undefined ? { contextFit } : {}),
    ...(driverDimensions !== undefined ? { driverDimensions } : {}),
    ...(restaurantDimensions !== undefined ? { restaurantDimensions } : {}),
  };
}

export function hasPlaceQuickSignal(value: PlaceQuickSignal | undefined): boolean {
  if (!value) return false;
  return (
    value.landingLevel !== undefined ||
    value.outcome !== undefined ||
    value.repeatDesire !== undefined ||
    value.shareSafe !== undefined ||
    (value.contextFit !== undefined && value.contextFit.length > 0) ||
    (value.driverDimensions !== undefined && value.driverDimensions.length > 0) ||
    (value.restaurantDimensions !== undefined &&
      Object.keys(value.restaurantDimensions).length > 0)
  );
}
