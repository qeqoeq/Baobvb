import type { Place } from '../store/useRelationsStore';

export type PassSectionState = 'hidden' | 'cta' | 'empty';

/**
 * Decides how the "pass this place" affordance renders on a place sheet (B22).
 *
 * - 'hidden': the place isn't in a passable personalFit (only kept/tried places
 *   can be passed).
 * - 'cta':    at least one eligible relation → show the pass button.
 * - 'empty':  passable place but no eligible relation → show an explicit empty
 *   state ("Reveal a relation to start passing places") instead of nothing.
 *   The pass affordance must never disappear silently.
 */
export function getPassSectionState(
  personalFit: Place['personalFit'],
  eligibleCount: number,
): PassSectionState {
  if (personalFit !== 'kept' && personalFit !== 'tried') return 'hidden';
  return eligibleCount > 0 ? 'cta' : 'empty';
}

/**
 * Label for the pass button (B24). `name` should already be the cascade display
 * name (getNormalizedPrivateLabel), never the raw relation.name placeholder.
 */
export function formatPassButtonLabel(name: string | null): string {
  return name ? `Passer à ${name}` : 'Passer à…';
}
