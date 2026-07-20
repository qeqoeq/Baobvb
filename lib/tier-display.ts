import type { Tier } from './evaluation';

/**
 * B27 — Display-layer FR mapping for tier names.
 *
 * The `Tier` enum values (Rooted/Anchor/Steady/Active/Forming/Distant) are
 * load-bearing: they drive scoring (lib/evaluation.ts), are persisted in the local
 * reveal snapshot, and are matched across the test suite. They must NEVER be
 * translated in place. This map converts them to French for display ONLY, at the
 * render edge — the enum stays intact end to end.
 *
 * Branded FR words validated by Samo + auditor (2026-07-21). Enum unchanged.
 *
 * "Legend" is NOT a client Tier — it is a server-side label (getMutualTier(90)
 * returns 'Rooted' client-side, so no client render path emits it). It is mapped
 * here defensively so that if a legacy/server 'Legend' string ever reaches this
 * function via a cast, it still renders 'Légende' rather than the raw word.
 */
const TIER_DISPLAY_FR: Record<Tier | 'Legend', string> = {
  Rooted: 'Enraciné',
  Anchor: 'Pilier',
  Steady: 'Stable',
  Active: 'Vivant',
  Forming: 'Naissant',
  Distant: 'Distant',
  Legend: 'Légende',
};

export function getTierDisplayLabel(tier: Tier): string {
  return TIER_DISPLAY_FR[tier] ?? tier;
}
