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
import { canUsePrivateOpenWorlds, type RelationOpenWorld } from './relation-open-worlds';

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

// ── Source trust resolver ────────────────────────────────────────────────
// This resolver is a provisional binary gate for whether a relational
// source can be considered as qualitative evidence in the Private Fit
// Evidence context. It does not measure rater calibration, standard
// similarity, or the fine strength of a recommendation. Standalone by
// design in this sprint — derivePrivateFitEvidence does not call it
// automatically; a future caller wires its result into sourceTrustEligible.

export type PrivateFitEvidenceSourceTrustContext = {
  isRevealed: boolean;
  trustRating: number | null;
  isArchived?: boolean;
};

/**
 * Delegates directly to canUsePrivateOpenWorlds — the same gate already
 * used by deriveKeptPlaceWorldSignals and deriveRouteTerritorySignals.
 * Returns a plain boolean only: no relation id, no name, no level, no
 * score, no visible explanation.
 */
export function resolvePrivateFitEvidenceSourceTrust(
  params: PrivateFitEvidenceSourceTrustContext,
): boolean {
  return canUsePrivateOpenWorlds(params);
}

// ── Source context builder ───────────────────────────────────────────────
// This builder assembles a PrivateFitEvidenceSourceContext for a single
// place. It does NOT interpret evidence and never calls
// derivePrivateFitEvidence — assembling a context and reading evidence
// from it are two separate steps, kept separate on purpose.
//
// undefined sourceTrustEligible means "unknown" (no relation id, or no
// matching relation found) — it is never coerced to false. false means a
// matching relation was found and explicitly failed the trust gate (not
// revealed, archived, or trust below threshold). These are different
// facts and must never be conflated.

/** Minimal place shape — never the full store Place type. */
export type BuildPrivateFitEvidenceSourceContextPlaceInput = {
  sourceRelationId?: string;
  personalFit: PrivateFitEvidencePersonalFit;
  quickSignal?: PlaceQuickSignal;
};

/** Minimal relation shape — never the full store Relation type. */
export type BuildPrivateFitEvidenceSourceContextRelationInput = {
  id: string;
  archived?: boolean;
  revealSnapshot?: { revealed?: boolean };
};

/** Minimal evaluation shape — never the full lib/evaluation.ts Evaluation type. */
export type BuildPrivateFitEvidenceSourceContextEvaluationInput = {
  relationId: string;
  ratings?: { trust?: number | null };
};

/**
 * Assembles a PrivateFitEvidenceSourceContext for one place. Resolves
 * sourceTrustEligible via resolvePrivateFitEvidenceSourceTrust when (and
 * only when) a matching relation is found. Never returns a relation name,
 * avatar, handle, or any other human-identifying field — sourceRelationId
 * is carried as an opaque identifier only.
 */
export function buildPrivateFitEvidenceSourceContext(
  place: BuildPrivateFitEvidenceSourceContextPlaceInput,
  relations: BuildPrivateFitEvidenceSourceContextRelationInput[],
  evaluations: BuildPrivateFitEvidenceSourceContextEvaluationInput[],
): PrivateFitEvidenceSourceContext {
  const base: PrivateFitEvidenceSourceContext = {
    personalFit: place.personalFit,
    ...(place.quickSignal !== undefined ? { quickSignal: place.quickSignal } : {}),
  };

  if (place.sourceRelationId === undefined) {
    // No source relation at all — sourceTrustEligible stays unknown, not false.
    return base;
  }

  const relation = relations.find((candidate) => candidate.id === place.sourceRelationId);
  if (!relation) {
    // sourceRelationId is opaque and carried through, but with no relation
    // to resolve, sourceTrustEligible stays unknown, not false.
    return { ...base, sourceRelationId: place.sourceRelationId };
  }

  const isRevealed = relation.revealSnapshot?.revealed === true;
  const isArchived = relation.archived === true;
  const evaluation = evaluations.find((item) => item.relationId === relation.id);
  const trustRating = evaluation?.ratings?.trust ?? null;

  const sourceTrustEligible = resolvePrivateFitEvidenceSourceTrust({
    isRevealed,
    trustRating,
    isArchived,
  });

  return {
    ...base,
    sourceRelationId: place.sourceRelationId,
    sourceTrustEligible,
  };
}

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

// ── Route-object usage derivation (X.48) ─────────────────────────────────
// Pure, invisible, non-scoring assembly that connects a kept Place sourced
// from a trusted relation to descriptive usage signals — worldFit,
// contextFit, and a declared repeat visit. This is NOT a recommendation,
// NOT a fit score, NOT a ranking input. It never says how good a place is
// or whether it is "better" than another — only that a trusted route
// produced this place, and what descriptive categories/signals are
// attached to it.
//
// Doctrine:
//   - fails closed (returns undefined) if sourceRelationId is absent, the
//     source relation is not trust-eligible, or personalFit !== 'kept';
//   - sourceRelationId is never resolved to a name — carried opaquely,
//     exactly like the rest of this file;
//   - wentAgainAt enriches the signal as a plain boolean fact (a repeat
//     visit was declared) — never a count, never a frequency, never a date;
//   - worldFit/contextFit are carried as descriptive categories only —
//     never weighted, never compared, never used to rank one place above
//     another;
//   - the output has no sortable numeric field by construction (no score,
//     rank, count, percentage) — it cannot be used as a ranking input
//     without first inventing data that isn't here.

/** Minimal place shape for this derivation — never the full store Place type. */
export type RouteObjectUsagePlaceInput = {
  sourceRelationId?: string;
  personalFit: PrivateFitEvidencePersonalFit;
  worldFit?: RelationOpenWorld[];
  quickSignal?: PlaceQuickSignal;
  /** Presence alone matters — never read as a date, count, or frequency. */
  wentAgainAt?: string;
};

export type RouteObjectUsageSignal = {
  /** Always true when this signal is returned — the trust gate already passed. */
  fromTrustedRoute: true;
  /** Opaque identifier only — never resolved to a name here. */
  sourceRelationId: string;
  /** Descriptive categories the user declared on this place, if any. */
  worldFit?: RelationOpenWorld[];
  /** Descriptive usage categories from the captured experience, if any. */
  contextFit?: PlaceContextFit[];
  /** A repeat visit was explicitly declared — a fact, never a count. */
  hasDeclaredRepeatVisit: boolean;
  /** Present only if a richer experience signal could also be derived. */
  evidence?: PrivateFitEvidence;
};

/**
 * Pure derivation connecting a single kept Place, sourced from a
 * trust-eligible relation, to descriptive usage signals. Fails closed
 * (returns undefined) whenever the source route cannot be trusted or the
 * place was never kept — there is no partial-trust output.
 *
 * Never returns a score, rank, average, recommendation, "best" judgment,
 * confidence value, count, total, or percentage. Never resolves
 * sourceRelationId to a name. wentAgainAt is read only as a presence
 * check — its value is discarded, never surfaced as a date or count.
 */
export function deriveRouteObjectUsageSignal(
  place: RouteObjectUsagePlaceInput,
  relations: BuildPrivateFitEvidenceSourceContextRelationInput[],
  evaluations: BuildPrivateFitEvidenceSourceContextEvaluationInput[],
): RouteObjectUsageSignal | undefined {
  // Fail closed: only a kept place can carry a usage signal.
  if (place.personalFit !== 'kept') return undefined;

  // Fail closed: no source relation, no signal.
  if (place.sourceRelationId === undefined) return undefined;

  const relation = relations.find((candidate) => candidate.id === place.sourceRelationId);
  if (!relation) return undefined;

  const isRevealed = relation.revealSnapshot?.revealed === true;
  const isArchived = relation.archived === true;
  const evaluation = evaluations.find((item) => item.relationId === relation.id);
  const trustRating = evaluation?.ratings?.trust ?? null;

  const sourceTrustEligible = resolvePrivateFitEvidenceSourceTrust({
    isRevealed,
    trustRating,
    isArchived,
  });

  // Fail closed: source exists but does not pass the trust gate.
  if (!sourceTrustEligible) return undefined;

  const context = buildPrivateFitEvidenceSourceContext(
    { sourceRelationId: place.sourceRelationId, personalFit: place.personalFit, quickSignal: place.quickSignal },
    relations,
    evaluations,
  );
  const evidence = derivePrivateFitEvidence(context);

  return {
    fromTrustedRoute: true,
    sourceRelationId: place.sourceRelationId,
    ...(place.worldFit !== undefined && place.worldFit.length > 0
      ? { worldFit: place.worldFit }
      : {}),
    ...(place.quickSignal?.contextFit !== undefined && place.quickSignal.contextFit.length > 0
      ? { contextFit: place.quickSignal.contextFit }
      : {}),
    hasDeclaredRepeatVisit: place.wentAgainAt !== undefined,
    ...(evidence.hasExperiencedSignal ? { evidence } : {}),
  };
}
