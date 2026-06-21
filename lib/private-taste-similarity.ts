// Private taste similarity — compares two PrivateTasteVector (X.55) on the
// dimensions where both sides carry enough comparable evidence.
//
// Doctrine:
//   - this file NEVER produces a score visible to a user, a ranking, a
//     recommendation, a "same taste"/"best match"/"people like you"
//     claim, or a moral label on a person (no "goodTaste", "strict",
//     "picky", "reliable", "premiumTaste", "lowTaste");
//   - this file NEVER reads sourceRelationId, identityHint, or impression
//     — it only ever touches the already-aggregated PrivateTasteVector,
//     which itself never carries those fields (inherited from X.55);
//   - this file NEVER touches a relation, a route, an AI, Supabase, or any
//     UI — purely two PrivateTasteVector in, one PrivateTasteSimilarity
//     out;
//   - absence of overlap is absence of proof, never proof of dissimilarity
//     — a key present on only one side is ignored, never compared to 0;
//   - no random, no ML, no date, no route, no relation — a single,
//     documented, deterministic, symmetric V0 formula.
//
// What this proves: on the dimensions where both private histories have
// enough comparable evidence, how close their past reactions have been.
// What this never proves: shared global taste, relationship compatibility,
// a reliable recommendation, similar personality, or any certainty that
// the two will like the same future object.

import type { ConfidenceWeightedSignal, PrivateTasteVector } from './private-taste-vector';

const MIN_COMBINED_EVIDENCE = 3;
const MIN_CONFIDENCE = 0.25;
// Shared by polarity AND category signals only (X.57 rule 5) — a mutual
// rejection (both values < 0.5) is a useful but weaker signal than a
// mutual preference. Context/driver/restaurantDimension signals are
// never polarity-like, so this factor never applies to them.
const NEGATIVE_ALIGNMENT_FACTOR = 0.7;
// Global confidence is averaged over all possible dimensions (category,
// context, driver, restaurantDimension, polarity), not just the ones that
// happened to be computable. A single strong dimension on an otherwise
// thin comparison must never read as a globally confident similarity —
// confidence reflects how much of the whole comparison is covered, value
// reflects what is known on the dimensions that are covered.
const TOTAL_DIMENSIONS = 5;

export type PrivateTasteSimilarityStatus = 'insufficient_evidence' | 'usable';

export type PrivateTasteSimilarity = {
  value: number;
  confidence: number;
  evidenceCount: number;
  dimensions: {
    category?: ConfidenceWeightedSignal;
    context?: ConfidenceWeightedSignal;
    driver?: ConfidenceWeightedSignal;
    restaurantDimension?: ConfidenceWeightedSignal;
    polarity?: ConfidenceWeightedSignal;
  };
  status: PrivateTasteSimilarityStatus;
  reasons: string[];
};

/**
 * Compares two same-shape signal records (category/context/driver/
 * restaurantDimension) key by key, considering only keys present on both
 * sides. Returns undefined (with a reason) if there is no overlap, not
 * enough combined evidence, or confidence below the floor.
 */
function compareSignalRecords<K extends string>(
  a: Partial<Record<K, ConfidenceWeightedSignal>>,
  b: Partial<Record<K, ConfidenceWeightedSignal>>,
  dimensionName: string,
  isPolarityLike: boolean,
  reasons: string[],
): ConfidenceWeightedSignal | undefined {
  const commonKeys = Object.keys(a).filter((key) => key in b) as K[];

  if (commonKeys.length === 0) {
    reasons.push(`${dimensionName}_no_overlap`);
    return undefined;
  }

  let combinedEvidence = 0;
  let weightSum = 0;
  let weightedSimilaritySum = 0;

  for (const key of commonKeys) {
    const signalA = a[key] as ConfidenceWeightedSignal;
    const signalB = b[key] as ConfidenceWeightedSignal;

    combinedEvidence += signalA.evidenceCount + signalB.evidenceCount;

    const distance = Math.abs(signalA.value - signalB.value);
    let similarity = 1 - distance;
    if (isPolarityLike && signalA.value < 0.5 && signalB.value < 0.5) {
      similarity *= NEGATIVE_ALIGNMENT_FACTOR;
    }

    const weight = Math.min(signalA.confidence, signalB.confidence);
    weightSum += weight;
    weightedSimilaritySum += similarity * weight;
  }

  if (combinedEvidence < MIN_COMBINED_EVIDENCE) {
    reasons.push(`${dimensionName}_insufficient_evidence`);
    return undefined;
  }

  // Average confidence across common keys — never exceeds any individual
  // weakest-link weight, since it is built entirely from per-key minimums.
  const confidence = weightSum / commonKeys.length;
  if (confidence < MIN_CONFIDENCE) {
    reasons.push(`${dimensionName}_low_confidence`);
    return undefined;
  }

  // weightSum > 0 here, since confidence >= MIN_CONFIDENCE > 0.
  const value = weightedSimilaritySum / weightSum;

  return { value, confidence, evidenceCount: combinedEvidence };
}

/**
 * Aggregate, vector-level polarity comparison — not a per-key dimension.
 * Reuses each vector's own positive/negative evidence ratio and its
 * already-computed `confidence` (which already folds in any repeat-visit
 * bonus from X.55) — never recomputed here, to avoid double-counting.
 */
function comparePolarity(
  a: PrivateTasteVector,
  b: PrivateTasteVector,
  reasons: string[],
): ConfidenceWeightedSignal | undefined {
  if (a.evidenceCount === 0 || b.evidenceCount === 0) {
    reasons.push('polarity_insufficient_evidence');
    return undefined;
  }

  const combinedEvidence = a.evidenceCount + b.evidenceCount;
  if (combinedEvidence < MIN_COMBINED_EVIDENCE) {
    reasons.push('polarity_insufficient_evidence');
    return undefined;
  }

  const confidence = Math.min(a.confidence, b.confidence);
  if (confidence < MIN_CONFIDENCE) {
    reasons.push('polarity_low_confidence');
    return undefined;
  }

  const polarityA = a.positiveEvidenceCount / a.evidenceCount;
  const polarityB = b.positiveEvidenceCount / b.evidenceCount;

  const distance = Math.abs(polarityA - polarityB);
  let value = 1 - distance;
  if (polarityA < 0.5 && polarityB < 0.5) {
    value *= NEGATIVE_ALIGNMENT_FACTOR;
  }

  return { value, confidence, evidenceCount: combinedEvidence };
}

/**
 * Pure, symmetric, deterministic comparison of two PrivateTasteVector.
 * derivePrivateTasteSimilarity(a, b) always equals derivePrivateTasteSimilarity(b, a).
 * Only compares dimensions where both vectors carry enough overlapping,
 * confident evidence — never treats a missing key as a value of 0.
 */
export function derivePrivateTasteSimilarity(
  a: PrivateTasteVector,
  b: PrivateTasteVector,
): PrivateTasteSimilarity {
  const reasons: string[] = [];

  const category = compareSignalRecords(a.categorySignals, b.categorySignals, 'category', true, reasons);
  const context = compareSignalRecords(a.contextSignals, b.contextSignals, 'context', false, reasons);
  const driver = compareSignalRecords(a.driverSignals, b.driverSignals, 'driver', false, reasons);
  const restaurantDimension = compareSignalRecords(
    a.restaurantDimensionSignals,
    b.restaurantDimensionSignals,
    'restaurantDimension',
    false,
    reasons,
  );
  const polarity = comparePolarity(a, b, reasons);

  const dimensions: PrivateTasteSimilarity['dimensions'] = {
    ...(category ? { category } : {}),
    ...(context ? { context } : {}),
    ...(driver ? { driver } : {}),
    ...(restaurantDimension ? { restaurantDimension } : {}),
    ...(polarity ? { polarity } : {}),
  };

  const computed = Object.values(dimensions) as ConfidenceWeightedSignal[];

  if (computed.length === 0) {
    reasons.push('no_computable_dimensions');
    return { value: 0, confidence: 0, evidenceCount: 0, dimensions, status: 'insufficient_evidence', reasons };
  }

  const evidenceCount = computed.reduce((sum, signal) => sum + signal.evidenceCount, 0);
  const confidenceWeightSum = computed.reduce((sum, signal) => sum + signal.confidence, 0);
  // Averaged over all possible dimensions, not just the computed ones —
  // see TOTAL_DIMENSIONS comment above.
  const confidence = confidenceWeightSum / TOTAL_DIMENSIONS;
  const value =
    confidenceWeightSum > 0
      ? computed.reduce((sum, signal) => sum + signal.value * signal.confidence, 0) / confidenceWeightSum
      : computed.reduce((sum, signal) => sum + signal.value, 0) / computed.length;

  const status: PrivateTasteSimilarityStatus = confidence >= MIN_CONFIDENCE ? 'usable' : 'insufficient_evidence';
  if (status === 'insufficient_evidence') reasons.push('global_confidence_below_floor');

  return { value, confidence, evidenceCount, dimensions, status, reasons };
}
