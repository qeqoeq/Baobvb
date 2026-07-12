export type PrimaryNavKey = 'garden' | 'places' | 'reveals' | 'profile';

export type PrimaryNavItem = {
  key: PrimaryNavKey;
  label: string;
  /** Informational only — a badge NEVER gates whether the entry exists (B23). */
  badge: number | null;
};

/**
 * The home's permanent primary navigation (B23).
 *
 * These four entries are ALWAYS returned, in a stable order, regardless of any
 * count. A counter can only surface as an informational `badge`; it is never the
 * condition for an entry to exist. This encodes the rule "no primary navigation
 * or feature disappears when its counter hits zero".
 */
export function getPrimaryNavItems(counts: { pendingReveals: number }): PrimaryNavItem[] {
  const pending = Math.max(0, Math.floor(counts.pendingReveals || 0));
  return [
    { key: 'garden', label: 'Garden', badge: null },
    { key: 'places', label: 'Places', badge: null },
    { key: 'reveals', label: 'Reveals', badge: pending > 0 ? pending : null },
    { key: 'profile', label: 'You', badge: null },
  ];
}
