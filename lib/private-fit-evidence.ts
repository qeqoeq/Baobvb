// Private fit evidence — a non-scoring contract that reads what a single
// PlaceQuickSignal actually proves, and what it doesn't yet prove.
//
// Doctrine: this file NEVER computes a score, average, rank, estimate, or
// percentage. It only describes which private signals exist for a single
// experience, so a future engine can later combine many of these across
// trusted relations — that combination does not happen here.
//
// landingLevel is a private intensity, not a public rating. driverDimensions
// is a selection of reasons, not a weight. A dimension that was never
// selected as a driver is absent from evidence — never treated as neutral.
// sourceRelationId is carried as an opaque identifier only — this module
// never resolves it to a name or any visible attribution.

import type {
  PlaceContextFit,
  PlaceExperienceLevel,
  PlaceLandingLevel,
  PlaceQuickSignal,
  RestaurantExperienceDimension,
} from './place-quick-signal';

// Mirrors store/useRelationsStore.ts PlacePersonalFit structurally, without
// importing the store — this lib stays decoupled from store/UI concerns.
export type PrivateFitEvidencePersonalFit = 'saved' | 'tried' | 'kept' | 'not_for_me';

export type PrivateFitEvidenceSourceContext = {
  personalFit: PrivateFitEvidencePersonalFit;
  quickSignal?: PlaceQuickSignal;
  /** Opaque identifier only — never resolved to a name here. */
  sourceRelationId?: string;
  /**
   * Whether the relation behind sourceRelationId already passes the trust
   * gate elsewhere (revealed, not archived, trust >= 4). Computed by the
   * caller — this module does not evaluate trust itself.
   */
  sourceTrustEligible?: boolean;
};

export type PrivateFitEvidenceMissingSignal =
  | 'no_experience'
  | 'no_landing_level'
  | 'no_driver_dimensions'
  | 'no_dimension_signals'
  | 'no_share_signal'
  | 'no_context_fit'
  | 'no_source_relation'
  | 'source_not_trust_eligible';

export type PrivateFitEvidence = {
  /** True only when personalFit is 'kept' and a quickSignal exists. */
  hasExperiencedSignal: boolean;
  landingLevel?: PlaceLandingLevel;
  selectedDrivers?: RestaurantExperienceDimension[];
  /** Present only for dimensions that were selected as a driver. */
  dimensionSignals?: Partial<Record<RestaurantExperienceDimension, PlaceExperienceLevel>>;
  shareSafe?: boolean;
  contextFit?: PlaceContextFit[];
  sourceRelationId?: string;
  sourceTrustEligible?: boolean;
  missingSignals: PrivateFitEvidenceMissingSignal[];
};

/**
 * Pure, non-scoring read of a single experience's private evidence.
 * Never returns a score, average, rank, estimate, or percentage — only
 * what was actually captured, and what is still missing for a future
 * engine to reason about.
 */
export function derivePrivateFitEvidence(
  context: PrivateFitEvidenceSourceContext,
): PrivateFitEvidence {
  const missingSignals: PrivateFitEvidenceMissingSignal[] = [];

  // Rule 1 & 2: only a kept experience with a quickSignal can carry rich
  // evidence — saved/tried/not_for_me never pretend to have one, even if a
  // quickSignal happens to be present on the input.
  const hasExperiencedSignal =
    context.personalFit === 'kept' && context.quickSignal !== undefined;

  if (!hasExperiencedSignal) {
    missingSignals.push('no_experience');
    return {
      hasExperiencedSignal: false,
      ...(context.sourceRelationId !== undefined
        ? { sourceRelationId: context.sourceRelationId }
        : {}),
      ...(context.sourceTrustEligible !== undefined
        ? { sourceTrustEligible: context.sourceTrustEligible }
        : {}),
      missingSignals,
    };
  }

  const quickSignal = context.quickSignal as PlaceQuickSignal;

  const landingLevel = quickSignal.landingLevel;
  if (landingLevel === undefined) missingSignals.push('no_landing_level');

  const selectedDrivers = quickSignal.driverDimensions;
  const hasDrivers = selectedDrivers !== undefined && selectedDrivers.length > 0;
  if (!hasDrivers) missingSignals.push('no_driver_dimensions');

  // Rule 5 & 6: dimensionSignals exposes only the dimensions selected as
  // drivers. A dimension absent from selectedDrivers is absent here too —
  // never backfilled, never treated as a neutral middle value.
  let dimensionSignals: Partial<Record<RestaurantExperienceDimension, PlaceExperienceLevel>> | undefined;
  if (hasDrivers && quickSignal.restaurantDimensions) {
    const filtered: Partial<Record<RestaurantExperienceDimension, PlaceExperienceLevel>> = {};
    for (const driver of selectedDrivers) {
      const level = quickSignal.restaurantDimensions[driver];
      if (level !== undefined) filtered[driver] = level;
    }
    if (Object.keys(filtered).length > 0) dimensionSignals = filtered;
  }
  if (!dimensionSignals) missingSignals.push('no_dimension_signals');

  // Rule 7: shareSafe is recommendation responsibility, kept fully separate
  // from landingLevel — never combined, never used to adjust it.
  const shareSafe = quickSignal.shareSafe;
  if (shareSafe === undefined) missingSignals.push('no_share_signal');

  // Rule 8: contextFit is "when/for whom", kept separate from quality.
  const contextFit = quickSignal.contextFit;
  const hasContextFit = contextFit !== undefined && contextFit.length > 0;
  if (!hasContextFit) missingSignals.push('no_context_fit');

  // Rule 9 & 10: sourceRelationId is carried opaquely; sourceTrustEligible
  // is a qualitative flag, never a multiplier. A non-eligible source never
  // erases the experience evidence above — it only marks the route as not
  // yet usable for a future cross-person signal.
  if (context.sourceRelationId === undefined) {
    missingSignals.push('no_source_relation');
  } else if (context.sourceTrustEligible !== true) {
    missingSignals.push('source_not_trust_eligible');
  }

  return {
    hasExperiencedSignal: true,
    ...(landingLevel !== undefined ? { landingLevel } : {}),
    ...(hasDrivers ? { selectedDrivers } : {}),
    ...(dimensionSignals !== undefined ? { dimensionSignals } : {}),
    ...(shareSafe !== undefined ? { shareSafe } : {}),
    ...(hasContextFit ? { contextFit } : {}),
    ...(context.sourceRelationId !== undefined
      ? { sourceRelationId: context.sourceRelationId }
      : {}),
    ...(context.sourceTrustEligible !== undefined
      ? { sourceTrustEligible: context.sourceTrustEligible }
      : {}),
    missingSignals,
  };
}
