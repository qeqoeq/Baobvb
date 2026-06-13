import { getMutualTier, getTier, type Evaluation, type Tier } from './evaluation';

// Runtime guard: tiers currently surfaced by the lexicon (Sprint V.1).
// Kept as a const tuple so a future Tier rename triggers a typecheck failure
// here, which is the desired forward-compatibility signal.
const CURRENT_TIER_VALUES: ReadonlyArray<Tier> = [
  'Distant',
  'Forming',
  'Active',
  'Steady',
  'Anchor',
  'Rooted',
];

function isCurrentTier(value: unknown): value is Tier {
  return (
    typeof value === 'string' &&
    (CURRENT_TIER_VALUES as ReadonlyArray<string>).includes(value)
  );
}

/**
 * Re-derives the tier label from the numeric score.
 *
 * Used at hydration to harden against legacy persisted evaluations (created
 * before the Sprint V.1 taxonomy rename). Those carried tier strings like
 * 'Ghost', 'Spark', 'Thrill', 'Vibrant' or 'Legend' that no longer exist in
 * the current Tier type, which would cause:
 *   - runtime TypeError in getTierNarrative via TIER_NARRATIVES[legacy].includes(...)
 *   - leak of legacy labels through badgeLabel / lexicon lookups
 *
 * Doctrine: the score is the canonical numerical truth. The tier label is a
 * pure derivation. Idempotent — an evaluation already aligned with the current
 * taxonomy is returned with the same tier (getTier is deterministic).
 *
 * Defensive: if score is not a finite number (never expected in practice),
 * the evaluation is returned untouched.
 */
export function normalizePersistedEvaluationTier(evaluation: Evaluation): Evaluation {
  if (typeof evaluation.score !== 'number' || !Number.isFinite(evaluation.score)) {
    return evaluation;
  }
  return { ...evaluation, tier: getTier(evaluation.score) };
}

/**
 * Re-derives the reveal snapshot tier label, with mutualScore as the truth
 * when available, falling back to the raw tier only if it matches the current
 * tier vocabulary.
 *
 * Priority:
 *   1. finite mutualScore → getMutualTier(mutualScore)
 *   2. rawTier passing the current whitelist → rawTier
 *   3. otherwise → undefined
 *
 * Pure. Used at hydration to harden against legacy persisted snapshot tiers
 * (pre Sprint V.1) without losing safe modern values.
 */
export function normalizePersistedRevealSnapshotTier(
  rawTier: unknown,
  mutualScore: unknown,
): Tier | undefined {
  if (typeof mutualScore === 'number' && Number.isFinite(mutualScore)) {
    return getMutualTier(mutualScore);
  }
  return isCurrentTier(rawTier) ? rawTier : undefined;
}
