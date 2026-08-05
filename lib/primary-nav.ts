export type PrimaryNavKey = 'home' | 'garden' | 'places' | 'reveals' | 'profile';

export type PrimaryNavItem = {
  key: PrimaryNavKey;
  label: string;
  /** Informational only — a badge NEVER gates whether the entry exists (B23). */
  badge: number | null;
};

/**
 * The permanent primary navigation, shared across all five primary surfaces (B23 + B30).
 *
 * These five entries are ALWAYS returned, in a stable order, regardless of any
 * count. A counter can only surface as an informational `badge`; it is never the
 * condition for an entry to exist. This encodes the rule "no primary navigation
 * or feature disappears when its counter hits zero".
 *
 * B30: `home` (the Jardin — the ego-graph home) is the first entry. `garden` is the
 * search/list consultation mode of the Jardin, renamed « Rechercher » (it is no
 * longer a second "home"). See docs/DIAG-B30.md.
 */
export function getPrimaryNavItems(counts: { pendingReveals: number }): PrimaryNavItem[] {
  const pending = Math.max(0, Math.floor(counts.pendingReveals || 0));
  return [
    { key: 'home', label: 'Jardin', badge: null },
    { key: 'garden', label: 'Rechercher', badge: null },
    { key: 'places', label: 'Lieux', badge: null },
    { key: 'reveals', label: 'Révélations', badge: pending > 0 ? pending : null },
    { key: 'profile', label: 'Toi', badge: null },
  ];
}
