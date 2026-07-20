/**
 * B25 — Deep-link resolution for /relation/[id].
 *
 * A reveal-ready push notification deep-links by the CANONICAL relationship id
 * (see supabase migration enqueue: payload.relationId = p_relationship_id), but a
 * local relation is keyed by its LOCAL id (`r-…`) with the server UUID stored in
 * `canonicalRelationId`. Resolving by `r.id === id` alone can therefore never match
 * a notification target — the screen must accept EITHER key.
 *
 * Beyond the key mismatch, the target relation may not be materialized yet
 * (bootstrap not re-run since the reveal, B26). The phase helper below lets the
 * screen hold a loading state and re-sync before concluding "unavailable", instead
 * of flashing a hard error at the exact moment the user answers the call.
 */

export function findRelationByDeepLinkId<
  T extends { id: string; canonicalRelationId?: string | null },
>(relations: readonly T[], id: string | null | undefined): T | null {
  if (typeof id !== 'string') return null;
  const target = id.trim();
  if (!target) return null;
  return (
    relations.find(
      (r) => r.id === target || (r.canonicalRelationId ?? '').trim() === target,
    ) ?? null
  );
}

export type DeepLinkResolutionPhase = 'resolving' | 'resolved' | 'unavailable';

/**
 * Three-state decision for the screen:
 *   - relation already found          → 'resolved' (render normally)
 *   - not found, grace not exhausted  → 'resolving' (spinner + re-sync in flight)
 *   - not found, grace exhausted      → 'unavailable' (hard verdict, last resort)
 *
 * The key property: while a target id is present and the grace window is open, the
 * phase is 'resolving' — never an immediate 'unavailable'. A missing id has nothing
 * to wait for and resolves straight to 'unavailable' (the screen navigates away).
 */
export function resolveDeepLinkPhase(input: {
  hasId: boolean;
  relationFound: boolean;
  graceExhausted: boolean;
}): DeepLinkResolutionPhase {
  if (input.relationFound) return 'resolved';
  if (!input.hasId) return 'unavailable';
  return input.graceExhausted ? 'unavailable' : 'resolving';
}
