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
 * NOTE (2026-07-20 arbitration): the branded FR words are Samo's to choose, not to
 * be guessed. Until validated words are provided, this map falls back to the
 * canonical English name so nothing renders blank or wrong. Fill TIER_DISPLAY_FR
 * with the validated words to complete the French reveal surface.
 *
 * "Legend" is NOT a client Tier — it is a server-side label (getMutualTier(90)
 * returns 'Rooted' client-side). No client render path needs it.
 */
const TIER_DISPLAY_FR: Partial<Record<Tier, string>> = {
  // Rooted: '…',
  // Anchor: '…',
  // Steady: '…',
  // Active: '…',
  // Forming: '…',
  // Distant: '…',
};

export function getTierDisplayLabel(tier: Tier): string {
  return TIER_DISPLAY_FR[tier] ?? tier;
}
