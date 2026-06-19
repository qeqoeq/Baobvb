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

export type PlaceQuickSignal = {
  repeatDesire?: boolean;
  shareSafe?: boolean;
  contextFit?: PlaceContextFit[];
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

  if (repeatDesire === undefined && shareSafe === undefined && contextFit === undefined) {
    return undefined;
  }

  return {
    ...(repeatDesire !== undefined ? { repeatDesire } : {}),
    ...(shareSafe !== undefined ? { shareSafe } : {}),
    ...(contextFit !== undefined ? { contextFit } : {}),
  };
}

export function hasPlaceQuickSignal(value: PlaceQuickSignal | undefined): boolean {
  if (!value) return false;
  return (
    value.repeatDesire !== undefined ||
    value.shareSafe !== undefined ||
    (value.contextFit !== undefined && value.contextFit.length > 0)
  );
}
