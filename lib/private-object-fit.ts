// Private object fit — compares a PrivateTasteVector (X.55) against a
// minimally described object, on the dimensions where both carry enough
// comparable evidence.
//
// Doctrine:
//   - this file NEVER reads personalFit. personalFit is a person's verdict
//     on an object — it belongs to whoever captured it, never to the
//     object itself. If A keeps a restaurant and sends it to B, that
//     'kept' belongs to A, not to B — B's fit must never be computed from
//     A's verdict. PrivateObjectFitInput therefore carries no verdict
//     field at all;
//   - this file NEVER reads sourceRelationId, identityHint, impression,
//     shareSafe, worldFit, or wentAgainAt — none of these are dimensions
//     of taste, and PrivateObjectFitInput structurally cannot carry them;
//   - this file NEVER produces a score visible to a user, a ranking, a
//     recommendation, a "you will like this"/"recommended"/"best match"
//     claim, or a moral label on a person;
//   - this file NEVER touches a relation, a route, an AI, Supabase, or any
//     UI — purely a PrivateTasteVector + a PrivateObjectFitInput in, one
//     PrivateObjectFit out;
//   - absence of overlap is absence of proof, never proof of dissimilarity
//     — a dimension the object doesn't carry is simply not compared,
//     never treated as 0;
//   - category alone can never make the result usable — a single
//     category match is too thin to say anything about a precise object;
//   - no random, no ML, no date, no route, no relation — a single,
//     documented, deterministic V0 formula.
//
// What this proves: on the dimensions where the taste vector has enough
// evidence and the object carries a comparable dimension, how close this
// object is to what the vector's owner has historically valued.
// What this never proves: that the person will like the object, that the
// object is good, that it should be recommended, that a human route
// carrying it is trustworthy, or that the object is objectively fitting.

import type {
  PlaceContextFit,
  RestaurantExperienceDimension,
  RestaurantExperienceDimensions,
} from './place-quick-signal';
import type { ConfidenceWeightedSignal, PrivateTasteVector } from './private-taste-vector';
import type { PlaceCategory } from '@/store/useRelationsStore';

const MIN_SIGNAL_EVIDENCE = 3;
const MIN_CONFIDENCE = 0.25;
// Global confidence is averaged over all 4 possible dimensions (category,
// context, driver, restaurantDimension), not just the ones that happened
// to be computable — a single strong dimension on an otherwise sparse
// object must never read as a globally confident fit.
const TOTAL_DIMENSIONS = 4;

/**
 * Minimal, verdict-free description of an object. Deliberately excludes
 * personalFit (a person's verdict, never a property of the object),
 * sourceRelationId, identityHint, impression, shareSafe, worldFit, and
 * wentAgainAt — none of these are dimensions of taste.
 */
export type PrivateObjectFitInput = {
  category: PlaceCategory;
  contextFit?: readonly PlaceContextFit[];
  driverDimensions?: readonly RestaurantExperienceDimension[];
  restaurantDimensions?: RestaurantExperienceDimensions;
};

export type PrivateObjectFitStatus = 'insufficient_evidence' | 'usable';

export type PrivateObjectFit = {
  value: number;
  confidence: number;
  evidenceCount: number;
  dimensions: {
    category?: ConfidenceWeightedSignal;
    context?: ConfidenceWeightedSignal;
    driver?: ConfidenceWeightedSignal;
    restaurantDimension?: ConfidenceWeightedSignal;
  };
  status: PrivateObjectFitStatus;
  reasons: string[];
};

function normalizeLevel1to5(level: number): number {
  return (level - 1) / 4;
}

function isSignalUsable(signal: ConfidenceWeightedSignal | undefined): signal is ConfidenceWeightedSignal {
  return (
    signal !== undefined && signal.evidenceCount >= MIN_SIGNAL_EVIDENCE && signal.confidence >= MIN_CONFIDENCE
  );
}

/**
 * Compares a single vector signal against an object value that is always
 * "present" (context/driver: presence-only, object value = 1). The
 * object itself carries no confidence of its own (a single observation,
 * never an aggregate) — the signal's confidence is the sole source of
 * weight, exactly as the source signal's own evidence already reflects.
 */
function fitAgainstPresence(
  vectorSignal: ConfidenceWeightedSignal | undefined,
  reasonPrefix: string,
  reasons: string[],
): ConfidenceWeightedSignal | undefined {
  if (!isSignalUsable(vectorSignal)) {
    reasons.push(`${reasonPrefix}_insufficient_evidence`);
    return undefined;
  }
  const similarity = 1 - Math.abs(vectorSignal.value - 1);
  return { value: similarity, confidence: vectorSignal.confidence, evidenceCount: vectorSignal.evidenceCount };
}

/**
 * Pure, deterministic comparison of a PrivateTasteVector against a
 * minimally described object. Never reads personalFit, sourceRelationId,
 * identityHint, impression, shareSafe, worldFit, or wentAgainAt — none of
 * these exist on PrivateObjectFitInput, so they cannot influence the
 * result even if an extraneous, polluted object is passed in.
 */
export function derivePrivateObjectFitFromTasteVector(
  tasteVector: PrivateTasteVector,
  object: PrivateObjectFitInput,
): PrivateObjectFit {
  const reasons: string[] = [];

  if (tasteVector.confidence < MIN_CONFIDENCE) {
    reasons.push('taste_vector_confidence_below_floor');
    return { value: 0, confidence: 0, evidenceCount: 0, dimensions: {}, status: 'insufficient_evidence', reasons };
  }

  // Category: compared against the object's single declared category.
  // Never sufficient alone to reach `usable` (enforced in the status
  // check below, not by inflating its own evidence/confidence here).
  const categorySignal = tasteVector.categorySignals[object.category];
  const category = fitAgainstPresence(categorySignal, 'category', reasons);

  // Context: only keys the object actually declares, intersected with
  // the vector's known context signals. A context the object doesn't
  // carry is never compared — absence of overlap, not dissimilarity.
  const contextFit = object.contextFit ?? [];
  const contextMatches = contextFit
    .map((context) => tasteVector.contextSignals[context])
    .filter(isSignalUsable);
  const context =
    contextMatches.length > 0
      ? aggregatePresenceMatches(contextMatches)
      : (reasons.push('context_no_overlap'), undefined);

  // Driver: same mechanism as context.
  const driverDimensions = object.driverDimensions ?? [];
  const driverMatches = driverDimensions
    .map((dimension) => tasteVector.driverSignals[dimension])
    .filter(isSignalUsable);
  const driver =
    driverMatches.length > 0
      ? aggregatePresenceMatches(driverMatches)
      : (reasons.push('driver_no_overlap'), undefined);

  // Restaurant dimension: only read for dimensions the object also lists
  // as a driver — "no rating without a driver chosen first", the same
  // gate already applied everywhere else in this codebase.
  const restaurantDimensionEntries: ConfidenceWeightedSignal[] = [];
  for (const dimension of driverDimensions) {
    const objectLevel = object.restaurantDimensions?.[dimension];
    const vectorSignal = tasteVector.restaurantDimensionSignals[dimension];
    if (objectLevel === undefined || !isSignalUsable(vectorSignal)) continue;
    const distance = Math.abs(vectorSignal.value - normalizeLevel1to5(objectLevel));
    restaurantDimensionEntries.push({
      value: 1 - distance,
      confidence: vectorSignal.confidence,
      evidenceCount: vectorSignal.evidenceCount,
    });
  }
  const restaurantDimension =
    restaurantDimensionEntries.length > 0
      ? aggregatePresenceMatches(restaurantDimensionEntries)
      : (reasons.push('restaurantDimension_no_overlap'), undefined);

  const dimensions: PrivateObjectFit['dimensions'] = {
    ...(category ? { category } : {}),
    ...(context ? { context } : {}),
    ...(driver ? { driver } : {}),
    ...(restaurantDimension ? { restaurantDimension } : {}),
  };

  const computed = Object.values(dimensions) as ConfidenceWeightedSignal[];
  const hasNonCategoryDimension = Boolean(context || driver || restaurantDimension);

  if (computed.length === 0) {
    reasons.push('no_computable_dimensions');
    return { value: 0, confidence: 0, evidenceCount: 0, dimensions, status: 'insufficient_evidence', reasons };
  }

  const evidenceCount = computed.reduce((sum, signal) => sum + signal.evidenceCount, 0);
  const confidenceWeightSum = computed.reduce((sum, signal) => sum + signal.confidence, 0);
  // Averaged over all 4 possible dimensions, not just the computed ones.
  const confidence = confidenceWeightSum / TOTAL_DIMENSIONS;
  const value = computed.reduce((sum, signal) => sum + signal.value * signal.confidence, 0) / confidenceWeightSum;

  const status: PrivateObjectFitStatus =
    hasNonCategoryDimension && confidence >= MIN_CONFIDENCE ? 'usable' : 'insufficient_evidence';
  if (status === 'insufficient_evidence') {
    if (!hasNonCategoryDimension) reasons.push('category_alone_is_not_enough');
    if (confidence < MIN_CONFIDENCE) reasons.push('global_confidence_below_floor');
  }

  return { value, confidence, evidenceCount, dimensions, status, reasons };
}

/**
 * Aggregates several presence-style matches (context/driver/restaurant
 * dimension entries already compared against the vector) into a single
 * confidence-weighted signal for that dimension.
 */
function aggregatePresenceMatches(matches: ConfidenceWeightedSignal[]): ConfidenceWeightedSignal {
  const evidenceCount = matches.reduce((sum, signal) => sum + signal.evidenceCount, 0);
  const weightSum = matches.reduce((sum, signal) => sum + signal.confidence, 0);
  const confidence = weightSum / matches.length;
  const value =
    weightSum > 0
      ? matches.reduce((sum, signal) => sum + signal.value * signal.confidence, 0) / weightSum
      : matches.reduce((sum, signal) => sum + signal.value, 0) / matches.length;
  return { value, confidence, evidenceCount };
}
