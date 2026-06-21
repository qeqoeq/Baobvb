// Private taste vector — the first real engine calculation in Baobab.
// Transforms a person's local Place history into a private, internal
// aggregate of taste signals. Strictly device-local, never displayed,
// never tied to a relation or a route.
//
// Doctrine:
//   - this file NEVER reads sourceRelationId, identityHint, or impression —
//     taste is built from experience evidence only, never from object
//     identity, free text, or relational routing;
//   - this file NEVER produces a moral label on a person (no "goodTaste",
//     "strict", "generous", "reliable", "picky", "premiumTaste",
//     "lowTaste") — every field stays a calculable, private dimension;
//   - this file NEVER scores, ranks, recommends, or generates user-facing
//     text — it produces a PrivateTasteVector meant to feed future,
//     still-unbuilt calculations: tasteSimilarity(A, B), objectFit(place,
//     person), routeUtility(A→B, object), Send through Bao, AI grounded
//     explanation. None of those exist yet — this file only prepares
//     their raw material;
//   - no ML, no randomness, no date decay, no route, no relation in this
//     sprint — a single, simple, documented, testable V0 formula.
//
// personalFit gate (mirrors derivePrivateFitEvidence's own gate):
//   - 'saved' and 'tried' alone never count as taste evidence — wanting to
//     try or having tried without a verdict proves nothing about taste;
//   - 'kept' is positive evidence; 'not_for_me' is negative evidence;
//   - quickSignal sub-fields (landingLevel, driverDimensions,
//     restaurantDimensions, contextFit) are only read on 'kept' places,
//     consistent with the rest of the codebase ("no rating without a
//     driver chosen first", and quickSignal is only ever captured when
//     personalFit is 'kept').
//
// wentAgainAt is read only as a presence boolean — never as a date, never
// as a frequency — and only strengthens confidence, never the value
// itself (a repeat visit makes us more sure of the verdict, it does not
// retroactively make the verdict more positive).

import type { PlaceCategory, PlacePersonalFit } from '@/store/useRelationsStore';
import type { PlaceContextFit, PlaceQuickSignal, RestaurantExperienceDimension } from './place-quick-signal';

/** Minimal place shape this module needs — never the full store Place type. */
export type PrivateTasteVectorPlaceInput = {
  category: PlaceCategory;
  personalFit: PlacePersonalFit;
  quickSignal?: PlaceQuickSignal;
  wentAgainAt?: string;
};

export type ConfidenceWeightedSignal = {
  /** 0..1. Meaning depends on the signal: quality for category/restaurant
   * dimensions, plain presence (always 1) for context/driver dimensions. */
  value: number;
  /** 0..1. Grows with evidence volume, capped at 1. Never a probability of
   * truth — only a measure of how much evidence backs `value`. */
  confidence: number;
  /** Raw count of places that contributed to this signal. */
  evidenceCount: number;
};

export type PrivateTasteVector = {
  /** Places that contributed any evidence (kept + not_for_me). */
  evidenceCount: number;
  positiveEvidenceCount: number;
  negativeEvidenceCount: number;
  /** Count of kept places with a declared repeat visit — presence only. */
  repeatVisitEvidenceCount: number;
  categorySignals: Partial<Record<PlaceCategory, ConfidenceWeightedSignal>>;
  contextSignals: Partial<Record<PlaceContextFit, ConfidenceWeightedSignal>>;
  driverSignals: Partial<Record<RestaurantExperienceDimension, ConfidenceWeightedSignal>>;
  restaurantDimensionSignals: Partial<Record<RestaurantExperienceDimension, ConfidenceWeightedSignal>>;
  confidence: number;
};

// Confidence reaches 1 once a signal has accumulated the equivalent of 8
// pieces of evidence. A declared repeat visit (wentAgainAt) adds half an
// extra unit of confidence weight to every signal that place contributed
// to — it strengthens how sure we are, never the value itself.
const CONFIDENCE_EVIDENCE_CEILING = 8;
const REPEAT_VISIT_CONFIDENCE_BONUS = 0.5;

function toConfidence(weight: number): number {
  return Math.min(1, weight / CONFIDENCE_EVIDENCE_CEILING);
}

function normalizeLevel1to5(level: number): number {
  return (level - 1) / 4;
}

type Accumulator = {
  /** Sum of per-place values, for averaging into `value`. */
  valueSum: number;
  /** Raw count of contributing places — becomes `evidenceCount`. */
  count: number;
  /** Confidence weight — count plus any repeat-visit bonus. */
  confidenceWeight: number;
};

function newAccumulator(): Accumulator {
  return { valueSum: 0, count: 0, confidenceWeight: 0 };
}

function addEvidence(acc: Accumulator, value: number, hasRepeatVisit: boolean): void {
  acc.valueSum += value;
  acc.count += 1;
  acc.confidenceWeight += hasRepeatVisit ? 1 + REPEAT_VISIT_CONFIDENCE_BONUS : 1;
}

function toSignal(acc: Accumulator): ConfidenceWeightedSignal {
  return {
    value: acc.count > 0 ? acc.valueSum / acc.count : 0,
    confidence: toConfidence(acc.confidenceWeight),
    evidenceCount: acc.count,
  };
}

function toPartialRecord<K extends string>(
  accumulators: Map<K, Accumulator>,
): Partial<Record<K, ConfidenceWeightedSignal>> {
  const result: Partial<Record<K, ConfidenceWeightedSignal>> = {};
  for (const [key, acc] of accumulators) {
    result[key] = toSignal(acc);
  }
  return result;
}

/**
 * Pure aggregation of a person's local Place history into a private taste
 * vector. Reads only category, personalFit, quickSignal, and the presence
 * of wentAgainAt — never sourceRelationId, identityHint, or impression.
 * Deterministic and order-independent: the same set of places always
 * yields the same vector, regardless of array order.
 */
export function derivePrivateTasteVectorFromPlaces(
  places: readonly PrivateTasteVectorPlaceInput[],
): PrivateTasteVector {
  const categoryAcc = new Map<PlaceCategory, Accumulator>();
  const contextAcc = new Map<PlaceContextFit, Accumulator>();
  const driverAcc = new Map<RestaurantExperienceDimension, Accumulator>();
  const restaurantDimensionAcc = new Map<RestaurantExperienceDimension, Accumulator>();

  let positiveEvidenceCount = 0;
  let negativeEvidenceCount = 0;
  let repeatVisitEvidenceCount = 0;
  let totalConfidenceWeight = 0;

  for (const place of places) {
    // saved/tried alone never count as taste evidence.
    if (place.personalFit !== 'kept' && place.personalFit !== 'not_for_me') continue;

    const hasRepeatVisit = place.wentAgainAt !== undefined;
    const isPositive = place.personalFit === 'kept';

    if (isPositive) {
      positiveEvidenceCount += 1;
    } else {
      negativeEvidenceCount += 1;
    }
    if (hasRepeatVisit) repeatVisitEvidenceCount += 1;
    totalConfidenceWeight += hasRepeatVisit ? 1 + REPEAT_VISIT_CONFIDENCE_BONUS : 1;

    // Category signal: landingLevel refines the value when present;
    // otherwise a kept place defaults to a full positive (1) and a
    // not_for_me place to a full negative (0) — mirroring the +1/-1
    // weighting, mapped onto the 0..1 value range.
    const landingLevel = isPositive ? place.quickSignal?.landingLevel : undefined;
    const categoryValue = landingLevel !== undefined ? normalizeLevel1to5(landingLevel) : isPositive ? 1 : 0;
    let categoryEntry = categoryAcc.get(place.category);
    if (!categoryEntry) {
      categoryEntry = newAccumulator();
      categoryAcc.set(place.category, categoryEntry);
    }
    addEvidence(categoryEntry, categoryValue, hasRepeatVisit);

    // quickSignal sub-fields only carry meaning on kept places.
    if (!isPositive || !place.quickSignal) continue;

    const driverDimensions = place.quickSignal.driverDimensions ?? [];
    for (const dimension of driverDimensions) {
      // Presence only — strengthens importance, never quality.
      let entry = driverAcc.get(dimension);
      if (!entry) {
        entry = newAccumulator();
        driverAcc.set(dimension, entry);
      }
      addEvidence(entry, 1, hasRepeatVisit);
    }

    // Restaurant dimension quality is only meaningful for dimensions the
    // user picked as a driver — same gate already used elsewhere in this
    // codebase ("no rating without a driver chosen first").
    const restaurantDimensions = place.quickSignal.restaurantDimensions;
    if (restaurantDimensions) {
      for (const dimension of driverDimensions) {
        const level = restaurantDimensions[dimension];
        if (level === undefined) continue;
        let entry = restaurantDimensionAcc.get(dimension);
        if (!entry) {
          entry = newAccumulator();
          restaurantDimensionAcc.set(dimension, entry);
        }
        addEvidence(entry, normalizeLevel1to5(level), hasRepeatVisit);
      }
    }

    const contextFit = place.quickSignal.contextFit ?? [];
    for (const context of contextFit) {
      // Presence only — strengthens context correspondence, never quality.
      let entry = contextAcc.get(context);
      if (!entry) {
        entry = newAccumulator();
        contextAcc.set(context, entry);
      }
      addEvidence(entry, 1, hasRepeatVisit);
    }
  }

  return {
    evidenceCount: positiveEvidenceCount + negativeEvidenceCount,
    positiveEvidenceCount,
    negativeEvidenceCount,
    repeatVisitEvidenceCount,
    categorySignals: toPartialRecord(categoryAcc),
    contextSignals: toPartialRecord(contextAcc),
    driverSignals: toPartialRecord(driverAcc),
    restaurantDimensionSignals: toPartialRecord(restaurantDimensionAcc),
    confidence: toConfidence(totalConfidenceWeight),
  };
}
