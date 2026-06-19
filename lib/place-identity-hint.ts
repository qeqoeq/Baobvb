export const PLACE_IDENTITY_HINT_MAX_LENGTH = 180;

/**
 * Free-text memory aid (address, link, landmark). Trim only — no URL
 * parsing, no geocoding, no normalization. Truncated, never rejected.
 */
export function sanitizePlaceIdentityHint(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.slice(0, PLACE_IDENTITY_HINT_MAX_LENGTH);
}
