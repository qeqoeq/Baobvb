// B46 — the single aggregate value that drives the Liens-screen reactive background.
//
// ARCHITECTURE: this is the ONLY place network state is turned into a temperature.
// It reads exclusively the revealed *mutual score* — never the pillar axes
// (Confiance / Interactions / Affinité / Soutien / Réseau commun) nor any reading
// detail. When the score engine is replaced (spec B37) only the calibration
// constants below should need revisiting; the background render never changes.
//
// FORMULA (Bayesian shrinkage toward a neutral prior):
//   t = ( Σ (mutualScoreᵢ / 100)  +  k · NEUTRAL ) / ( n + k )
// where n = number of revealed relations that carry a mutualScore, and k is a
// pseudo-count that pulls small samples toward NEUTRAL. Chosen because one single
// mechanism covers all three required edge cases: empty network → NEUTRAL (not
// cold), a lone relation is damped toward the middle (never an extreme), and as
// the network grows the prior washes out so t converges to the true mean.

export type TemperatureRelation = {
  localState: { revealSnapshot: { status: string; mutualScore?: number | null } };
};

// ── Calibration (the only knobs B37 should ever need to retune) ──────────────
const NEUTRAL = 0.5;      // empty/undecided network → neutral, never 0
const PRIOR_WEIGHT = 2;   // pseudo-count: how hard small samples are pulled to NEUTRAL
const SCORE_MAX = 100;    // mutualScore domain is 0..100

export function computeNetworkTemperature(relations: readonly TemperatureRelation[]): number {
  let sum = 0;
  let n = 0;
  for (const r of relations ?? []) {
    const snap = r?.localState?.revealSnapshot;
    if (!snap || snap.status !== 'revealed') continue;   // non-revealed → ignored, no weight
    if (typeof snap.mutualScore !== 'number' || Number.isNaN(snap.mutualScore)) continue; // no score → ignored
    sum += clamp01(snap.mutualScore / SCORE_MAX);
    n += 1;
  }
  const t = (sum + PRIOR_WEIGHT * NEUTRAL) / (n + PRIOR_WEIGHT);
  return clamp01(t);
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return NEUTRAL;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
