// Private place identity name normalization — a small, pure preparation
// step for a future private object reconciliation audit (X.51-pré). This
// file does NOT detect duplicates, does NOT build a candidate key, does
// NOT merge anything. It only normalizes a single name string, exactly
// mirroring the homonymy-detection pattern already used for relations in
// app/(tabs)/garden.tsx (normalizeForSearch) — lowercase, trim, diacritics
// stripped. Nothing here is displayed, stored, or compared yet.

/**
 * Lowercase, trim, and strip diacritics from a place name. Pure and
 * deterministic — same input always yields the same output.
 * Receives a plain string only, never a Place object.
 */
export function normalizePlaceIdentityName(name: string): string {
  return name.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
