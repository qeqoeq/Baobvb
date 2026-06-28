// Private place value — a personal read of a place, woven from the lived
// signals the user chose to leave behind: what they decided to keep, how it
// felt, whether they went back, what stood out. It only speaks that private
// memory back to the user — meaningful inside their own Bao, and nowhere
// else.
//
// This value gives more weight to lived proof than declaration alone, and
// it notices when signals disagree with each other. A place kept but felt
// poorly carries a real tension, not a flattering average.
//
// Internal guardrails (enforced by tests, never user-facing):
//   - never reads sourceRelationId, trust, route/source, worldFit,
//     shareSafe, repeatDesire, or category — none of these are dimensions
//     of a place's private value;
//   - never imports another private engine (PrivateObjectFit,
//     PrivateRouteObjectFit, PrivateTasteVector, PrivateTasteSimilarity) —
//     stays self-contained, reading only the minimal input it declares;
//   - restaurantDimensions are read only as a gated presence, never their
//     actual values displayed — no dimension value is ever read unless a
//     driver was chosen first, the same gate already used everywhere else
//     in this codebase;
//   - wentAgainAt is read only as a presence boolean — never a date, never
//     a frequency, never a count;
//   - confidence and signature stay strictly internal — never displayed,
//     never turned into user-facing copy;
//   - no random, no current date, no IO, no UI dependency — a single,
//     documented, deterministic, nonlinear V1 formula.

import {
  PLACE_CONTEXT_FIT_OPTIONS,
  RESTAURANT_EXPERIENCE_DIMENSION_OPTIONS,
  type PlaceContextFit,
  type PlaceExperienceLevel,
  type PlaceLandingLevel,
  type PlaceQuickSignal,
  type RestaurantExperienceDimension,
  type RestaurantExperienceDimensions,
} from './place-quick-signal';
import type { Place, PlacePersonalFit } from '@/store/useRelationsStore';

export type PrivatePlaceValueConfidence = 'low' | 'medium' | 'high';
export type PrivatePlaceValueSignature =
  | 'thin_read'
  | 'kept_trace'
  | 'return_worthy'
  | 'contextual_anchor'
  | 'deep_fit'
  | 'conflicted_read';

export type PrivatePlaceValue = {
  /** Integer, conceptually 1..99, clamped in practice to [8, 96]. */
  value: number;
  /** Internal only — never displayed. */
  confidence: PrivatePlaceValueConfidence;
  /** Internal only — never displayed, never turned into copy. */
  signature: PrivatePlaceValueSignature;
  /** Internal debug codes only — never user-facing text. */
  reasons: string[];
};

/**
 * Minimal, verdict-and-route-free description of a captured experience.
 * Deliberately excludes sourceRelationId, worldFit, shareSafe, category,
 * and identityHint — none of these are dimensions of private place value.
 */
export type PrivatePlaceValueInput = {
  personalFit: PlacePersonalFit;
  quickSignal?: PlaceQuickSignal;
  /** Presence only matters — never read as a date or frequency. */
  wentAgainAt?: string;
  /** Presence only matters — content is never read. */
  impression?: string;
};

const VALUE_MIN = 8;
const VALUE_MAX = 96;

const PERSONAL_FIT_BASE: Record<PlacePersonalFit, number> = {
  not_for_me: 17,
  saved: 31,
  tried: 46,
  kept: 64,
};

const DECLARED_INTENSITY: Record<PlaceLandingLevel, number> = {
  1: -0.3,
  2: -0.15,
  3: 0.02,
  4: 0.14,
  5: 0.26,
};

const WENT_AGAIN_EVIDENCE_UNITS = 2.0;
const CONTEXT_FIT_UNIT_WEIGHT = 0.7;
const DRIVER_DIMENSIONS_UNIT_WEIGHT = 0.8;
const GATED_RESTAURANT_EVIDENCE_UNITS = 1.0;
const IMPRESSION_EVIDENCE_UNITS = 0.5;
const COHERENCE_EVIDENCE_UNITS = 0.4;

const EVIDENCE_MULTIPLIER_FLOOR = 0.82;
const EVIDENCE_MULTIPLIER_RANGE = 0.18;
const SAVED_ARTIFACT_THRESHOLD = 1.5;
const SAVED_ARTIFACT_MULTIPLIER_CAP = 0.86;

const DIMENSION_QUALITY_NEUTRAL = 3;
const DIMENSION_QUALITY_WEIGHT = 1.2;

const KEPT_LOW_LANDING_PENALTY = 10;
const NOT_FOR_ME_HIGH_LANDING_PENALTY = 6;
const TRIED_WENT_AGAIN_PENALTY = 5;

const BEHAVIORAL_REINFORCEMENT = 1.07;

const CONFIDENCE_CAP: Record<PrivatePlaceValueConfidence, number> = {
  low: 68,
  medium: 84,
  high: 96,
};

function nonEmptyArray<T>(value: readonly T[] | undefined): readonly T[] {
  return value ?? [];
}

/**
 * Only dimensions actually selected as a driver count — mirrors the same
 * gate already applied in derivePrivateFitEvidence / private-object-fit:
 * no dimension value is ever read unless a driver was chosen first.
 */
function gatedDriverLevels(
  driverDimensions: readonly RestaurantExperienceDimension[],
  restaurantDimensions: PlaceQuickSignal['restaurantDimensions'],
): number[] {
  if (driverDimensions.length === 0 || !restaurantDimensions) return [];
  const levels: number[] = [];
  for (const dimension of driverDimensions) {
    const level = restaurantDimensions[dimension];
    if (level !== undefined) levels.push(level);
  }
  return levels;
}

/**
 * Pure, deterministic derivation of a private place value from a single
 * captured experience. Nonlinear V1: combines a personalFit base with a
 * saturating evidence multiplier, a declared-intensity multiplier, a
 * behavioral reinforcement factor, a small bounded dimension-quality
 * adjustment, and a contradiction penalty — never a flat additive sum.
 * Never reads sourceRelationId, trust, route/source, worldFit, shareSafe,
 * repeatDesire, or category — PrivatePlaceValueInput structurally cannot
 * carry most of these, and category is simply never read even though it
 * is not excluded from a hypothetical larger input.
 */
export function derivePrivatePlaceValue(input: PrivatePlaceValueInput): PrivatePlaceValue {
  const reasons: string[] = [];
  const { personalFit, quickSignal, wentAgainAt, impression } = input;

  reasons.push(`base_${personalFit}`);
  const basePotential = PERSONAL_FIT_BASE[personalFit];

  const landingLevel = quickSignal?.landingLevel;
  if (landingLevel !== undefined) reasons.push(`landing_level_${landingLevel}`);
  const declaredIntensity = landingLevel !== undefined ? DECLARED_INTENSITY[landingLevel] : 0;
  const declaredIntensityMultiplier = 1 + declaredIntensity;

  const contextFit = nonEmptyArray(quickSignal?.contextFit);
  const driverDimensions = nonEmptyArray(quickSignal?.driverDimensions);
  const hasContext = contextFit.length > 0;
  const hasDriverDimensions = driverDimensions.length > 0;
  if (hasContext) reasons.push('has_context');
  if (hasDriverDimensions) reasons.push('has_driver_dimensions');
  if (hasContext && hasDriverDimensions) reasons.push('has_context_driver_coherence');

  const driverLevels = gatedDriverLevels(driverDimensions, quickSignal?.restaurantDimensions);
  const hasGatedRestaurantDimensions = driverLevels.length > 0;
  if (hasGatedRestaurantDimensions) {
    reasons.push('has_gated_restaurant_dimensions');
  } else if (quickSignal?.restaurantDimensions !== undefined) {
    reasons.push('restaurant_dimensions_ungated');
  }

  const hasImpression = impression !== undefined && impression.trim().length > 0;
  if (hasImpression) reasons.push('has_impression');

  const hasWentAgain = wentAgainAt !== undefined;
  const isReinforcedReturn = hasWentAgain && personalFit === 'kept';
  if (isReinforcedReturn) reasons.push('behavioral_reinforcement');

  const evidenceUnits =
    (isReinforcedReturn ? WENT_AGAIN_EVIDENCE_UNITS : 0) +
    contextFit.length * CONTEXT_FIT_UNIT_WEIGHT +
    driverDimensions.length * DRIVER_DIMENSIONS_UNIT_WEIGHT +
    (hasGatedRestaurantDimensions ? GATED_RESTAURANT_EVIDENCE_UNITS : 0) +
    (hasImpression ? IMPRESSION_EVIDENCE_UNITS : 0) +
    (hasContext && hasDriverDimensions ? COHERENCE_EVIDENCE_UNITS : 0);
  reasons.push(`evidence_units_${evidenceUnits.toFixed(2).replace('.', '_')}`);

  const evidenceStrength = 1 - Math.exp(-evidenceUnits / 3);
  const evidenceStrengthBucket = evidenceStrength >= 0.6 ? 'high' : evidenceStrength >= 0.35 ? 'medium' : 'low';
  reasons.push(`evidence_strength_${evidenceStrengthBucket}`);

  let evidenceMultiplier = EVIDENCE_MULTIPLIER_FLOOR + EVIDENCE_MULTIPLIER_RANGE * evidenceStrength;
  if (personalFit === 'saved' && evidenceUnits > SAVED_ARTIFACT_THRESHOLD) {
    evidenceMultiplier = Math.min(evidenceMultiplier, SAVED_ARTIFACT_MULTIPLIER_CAP);
  }

  const behavioralReinforcement = isReinforcedReturn ? BEHAVIORAL_REINFORCEMENT : 1.0;

  let dimensionQuality = 0;
  if (hasGatedRestaurantDimensions) {
    const avgDriverLevel = driverLevels.reduce((sum, level) => sum + level, 0) / driverLevels.length;
    dimensionQuality = (avgDriverLevel - DIMENSION_QUALITY_NEUTRAL) * DIMENSION_QUALITY_WEIGHT;
    if (dimensionQuality > 0) reasons.push('dimension_quality_positive');
    if (dimensionQuality < 0) reasons.push('dimension_quality_negative');
  }

  let contradictionPenalty = 0;
  const keptLowLanding = personalFit === 'kept' && landingLevel !== undefined && landingLevel <= 2;
  const notForMeHighLanding = personalFit === 'not_for_me' && landingLevel !== undefined && landingLevel >= 4;
  const triedWentAgain = personalFit === 'tried' && hasWentAgain;
  if (keptLowLanding) {
    contradictionPenalty += KEPT_LOW_LANDING_PENALTY;
    reasons.push('contradiction_kept_low_landing');
  }
  if (notForMeHighLanding) {
    contradictionPenalty += NOT_FOR_ME_HIGH_LANDING_PENALTY;
    reasons.push('contradiction_not_for_me_high_landing');
  }
  if (triedWentAgain) {
    contradictionPenalty += TRIED_WENT_AGAIN_PENALTY;
    reasons.push('contradiction_tried_went_again');
  }
  const hasContradiction = contradictionPenalty > 0;

  const raw =
    basePotential * evidenceMultiplier * declaredIntensityMultiplier * behavioralReinforcement +
    dimensionQuality -
    contradictionPenalty;

  const hasLandingLevel = landingLevel !== undefined;
  let confidence: PrivatePlaceValueConfidence;
  if (evidenceStrength >= 0.6 || (hasLandingLevel && evidenceStrength >= 0.35)) {
    confidence = 'high';
  } else if (evidenceStrength >= 0.35 || hasLandingLevel) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }
  reasons.push(`confidence_${confidence}`);
  reasons.push(`confidence_cap_${confidence}`);

  const confidenceCap = CONFIDENCE_CAP[confidence];
  const capped = Math.min(raw, confidenceCap);
  const value = Math.round(Math.max(VALUE_MIN, Math.min(VALUE_MAX, capped)));
  if (capped > VALUE_MAX) reasons.push('clamped_high');
  if (capped < VALUE_MIN) reasons.push('clamped_low');

  let signature: PrivatePlaceValueSignature;
  if (hasContradiction) {
    signature = 'conflicted_read';
  } else if (personalFit === 'kept' && isReinforcedReturn) {
    signature = 'return_worthy';
  } else if (
    personalFit === 'kept' &&
    hasLandingLevel &&
    landingLevel >= 4 &&
    hasContext &&
    hasDriverDimensions &&
    hasGatedRestaurantDimensions
  ) {
    signature = 'deep_fit';
  } else if (personalFit === 'kept' && hasContext && hasDriverDimensions) {
    signature = 'contextual_anchor';
  } else if (personalFit === 'kept' && hasLandingLevel) {
    signature = 'kept_trace';
  } else {
    signature = 'thin_read';
  }
  reasons.push(`signature_${signature}`);

  return { value, confidence, signature, reasons };
}

/**
 * V0 resolver — "latest read wins". Kept intact so its three tests remain
 * valid as regression anchors. All production UI now uses
 * synthesizeMultiReadInput instead.
 */
export function deriveEffectivePlaceValueInput(place: Place): PrivatePlaceValueInput {
  const reads = place.reads ?? [];
  const latestRead = reads.length > 0 ? reads[reads.length - 1] : undefined;

  if (!latestRead) {
    return {
      personalFit: place.personalFit,
      quickSignal: place.quickSignal,
      wentAgainAt: place.wentAgainAt,
      impression: place.impression,
    };
  }

  return {
    personalFit: place.personalFit,
    quickSignal: {
      ...(latestRead.landingLevel !== undefined ? { landingLevel: latestRead.landingLevel } : {}),
      ...(latestRead.contextFit !== undefined ? { contextFit: latestRead.contextFit } : {}),
      ...(latestRead.driverDimensions !== undefined
        ? { driverDimensions: latestRead.driverDimensions }
        : {}),
      ...(latestRead.restaurantDimensions !== undefined
        ? { restaurantDimensions: latestRead.restaurantDimensions }
        : {}),
    },
    wentAgainAt: place.wentAgainAt,
    impression: latestRead.impression ?? place.impression,
  };
}

const RECENCY_DECAY = 0.6;

// Floating-point weighted averages for discrete 1..5 scales can produce
// values like 3.4999999999999996 instead of 3.5, causing Math.round to
// go the wrong way. Adding Number.EPSILON before rounding corrects values
// that are within machine precision of an exact .5 boundary.
function roundWeightedScore(value: number): number {
  return Math.round(value + Number.EPSILON);
}

/**
 * V2 multi-read synthesizer. Combines all accumulated reads into a single
 * PrivatePlaceValueInput using recency-weighted averaging for numeric
 * signals and frequency-ranked union for categorical signals. The engine
 * (derivePrivatePlaceValue) is never modified — only the input it receives.
 *
 * 0 reads / 1 read: delegates to deriveEffectivePlaceValueInput (no change).
 * 2+ reads: full recency-weighted synthesis; quickSignal legacy is ignored
 * in favour of the reads[] accumulation.
 */
export function synthesizeMultiReadInput(place: Place): PrivatePlaceValueInput {
  const reads = place.reads ?? [];
  if (reads.length <= 1) return deriveEffectivePlaceValueInput(place);

  // Landing level: recency-weighted from reads that carry one
  const readsWithLanding = reads.filter((r) => r.landingLevel !== undefined);
  let syntheticLandingLevel: PlaceLandingLevel | undefined;
  if (readsWithLanding.length > 0) {
    const n = readsWithLanding.length;
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < n; i++) {
      const weight = Math.pow(RECENCY_DECAY, n - 1 - i);
      weightedSum += readsWithLanding[i].landingLevel! * weight;
      totalWeight += weight;
    }
    syntheticLandingLevel = Math.min(5, Math.max(1, roundWeightedScore(weightedSum / totalWeight))) as PlaceLandingLevel;
  }

  // ContextFit: union, frequency-ranked, canonical tie-break, max 2
  const contextFreq = new Map<PlaceContextFit, number>();
  for (const read of reads) {
    for (const ctx of (read.contextFit ?? [])) {
      contextFreq.set(ctx, (contextFreq.get(ctx) ?? 0) + 1);
    }
  }
  const syntheticContextFit = PLACE_CONTEXT_FIT_OPTIONS
    .filter((ctx) => contextFreq.has(ctx))
    .sort((a, b) => (contextFreq.get(b) ?? 0) - (contextFreq.get(a) ?? 0))
    .slice(0, 2);

  // DriverDimensions: union, canonical order (max 5 is implicit — catalog has exactly 5)
  const driverSet = new Set<RestaurantExperienceDimension>();
  for (const read of reads) {
    for (const dim of (read.driverDimensions ?? [])) {
      driverSet.add(dim);
    }
  }
  const syntheticDriverDimensions = RESTAURANT_EXPERIENCE_DIMENSION_OPTIONS.filter((dim) =>
    driverSet.has(dim),
  );

  // RestaurantDimensions: recency-weighted per synthesized driver dimension
  const syntheticRestaurantDimensions: RestaurantExperienceDimensions = {};
  for (const dim of syntheticDriverDimensions) {
    const relevant = reads.filter(
      (r) => r.driverDimensions?.includes(dim) && r.restaurantDimensions?.[dim] !== undefined,
    );
    if (relevant.length === 0) continue;
    const n = relevant.length;
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < n; i++) {
      const weight = Math.pow(RECENCY_DECAY, n - 1 - i);
      weightedSum += relevant[i].restaurantDimensions![dim]! * weight;
      totalWeight += weight;
    }
    syntheticRestaurantDimensions[dim] = Math.min(
      5,
      Math.max(1, roundWeightedScore(weightedSum / totalWeight)),
    ) as PlaceExperienceLevel;
  }

  // Impression: most recent non-empty from reads[], fallback to place.impression
  let syntheticImpression: string | undefined = place.impression;
  for (let i = reads.length - 1; i >= 0; i--) {
    if (reads[i].impression?.trim()) {
      syntheticImpression = reads[i].impression;
      break;
    }
  }

  // WentAgainAt: reads.length >= 2 is behavioral return evidence; take most recent
  const returnFromReads = reads[reads.length - 1].createdAt;
  const wentAgainAt = [place.wentAgainAt, returnFromReads]
    .filter((v): v is string => v !== undefined)
    .sort()
    .reverse()[0];

  const syntheticQuickSignal: PlaceQuickSignal = {
    ...(syntheticLandingLevel !== undefined ? { landingLevel: syntheticLandingLevel } : {}),
    ...(syntheticContextFit.length > 0 ? { contextFit: syntheticContextFit } : {}),
    ...(syntheticDriverDimensions.length > 0 ? { driverDimensions: syntheticDriverDimensions } : {}),
    ...(Object.keys(syntheticRestaurantDimensions).length > 0
      ? { restaurantDimensions: syntheticRestaurantDimensions }
      : {}),
  };

  return {
    personalFit: place.personalFit,
    quickSignal: Object.keys(syntheticQuickSignal).length > 0 ? syntheticQuickSignal : undefined,
    wentAgainAt,
    impression: syntheticImpression,
  };
}
