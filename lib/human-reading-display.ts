import {
  getSharedRevealDisplayState,
  type SharedRevealDisplayState,
} from './relation-detail-helpers';

/**
 * ── Human Reading Display Contract ──────────────────────────────────────────
 *
 * Discriminated union that strictly forbids a numeric `score` from appearing
 * in any surface that displays a *human* relation reading.
 *
 * Doctrine
 *   Baobab never makes a numeric human score the visual hero. The mutual
 *   score is still calculated server-side, stored, persisted, and used
 *   internally (Garden ordering, Atlas circle membership, recommendation
 *   weights). But the *display* of a human relation reading must carry
 *   signature (tier name), narrative, and signals — not a raw number.
 *
 * Why a separate type
 *   `SharedRevealDisplayState` (in relation-detail-helpers.ts) carries the
 *   numeric `score` field because it serves as the internal data carrier
 *   between the store, the snapshot precedence layer, and the UI variant
 *   resolution. Removing the field there would break that internal contract.
 *
 *   This type is the *display* contract — what a human-relation UI surface
 *   is allowed to consume. By construction, it does not expose `score`. A
 *   developer wiring a new human surface (post-reveal recap, Atlas detail,
 *   relationship history, etc.) cannot accidentally render the number when
 *   sourcing data from this contract.
 *
 * Allowed for human surfaces
 *   - `kind`: 'hidden' | 'pending' | 'signature'
 *   - `tier`: qualitative signature (Legend / Anchor / Vibrant / Thrill /
 *             Spark / Ghost — or the localized fallback string)
 *
 * Forbidden in this contract
 *   - numeric score (kept internal in SharedRevealDisplayState.score)
 *   - mutual_score, finalScore, foundationalScore
 *   - any raw rating, percentage, or ranking number
 *
 * If non-human rating surfaces are introduced later, they should use a
 * distinct display contract and must not reuse this type or
 * `SharedRevealDisplayState`.
 */
export type HumanRelationRevealDisplay =
  | { kind: 'hidden' }
  | { kind: 'pending' }
  | { kind: 'signature'; tier: string };

/**
 * Derives the human-display contract for a relation reveal.
 *
 * Adapts the internal `SharedRevealDisplayState` by stripping the numeric
 * `score` field. The internal helper is reused so the same gating logic
 * (nameRevealed, visibleScore null vs present, tier fallback) applies
 * consistently — but the consumer only sees the doctrine-safe surface.
 *
 * Inputs are identical to `getSharedRevealDisplayState` so call-sites can
 * migrate in place. The numeric score remains computed, stored, and
 * available to non-display consumers (Garden, Atlas, recommendation weights).
 *
 * Pure. No React, no I/O, no side effects.
 */
export function getHumanRelationRevealDisplay(input: {
  nameRevealed: boolean;
  visibleScore: number | null;
  revealedTier: string | null;
}): HumanRelationRevealDisplay {
  const internal: SharedRevealDisplayState = getSharedRevealDisplayState(input);
  if (internal.kind === 'hidden') return { kind: 'hidden' };
  if (internal.kind === 'pending') return { kind: 'pending' };
  // internal.kind === 'score' — the only field we surface is the tier.
  return { kind: 'signature', tier: internal.tier };
}
