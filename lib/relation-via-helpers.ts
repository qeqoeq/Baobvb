import type { Relation } from '../store/useRelationsStore';

// ── Eligibility helper for via-route declaration (Sprint X.1) ──────────────────
//
// Activates the dormant via-route subsystem on the manual-add flow: when a user
// adds a new relation, this helper produces the list of existing relations the
// new one can be declared as reached "through". Strictly declarative — the
// helper never infers a via; it only filters the available options.
//
// Doctrine:
//   - Only relations the user actually has a confirmed mutual reading with
//     are eligible — pre-reveal links are too unstable to declare a route
//     through.
//   - The target relation itself is excluded (no self-via).
//   - A simple 2-hop cycle guard excludes candidates that already point at
//     the target via their own viaRelationId.
//   - Archived relations are excluded.
//   - Relations without a displayable name are excluded (defensive).
//
// The helper returns a doctrine-safe shape (id, name, avatarSeed) — never
// scores, tiers, gateway power, or pillar data.

export type EligibleViaRelation = {
  id: string;
  name: string;
  avatarSeed?: string;
};

/**
 * Returns the list of relations a user may declare as the via-route for a
 * new or edited target relation.
 *
 * @param input.relations         — all relations the user has.
 * @param input.targetRelationId  — the relation being created or edited.
 *                                  Pass null/undefined when no target exists
 *                                  yet (e.g. picking a via during creation
 *                                  before the new id is assigned).
 *
 * Sort: alphabetic on the displayed name, en-US locale, for deterministic
 * test results across timezones and devices.
 */
export function getEligibleViaRelations(input: {
  relations: ReadonlyArray<Relation>;
  targetRelationId?: string | null;
}): EligibleViaRelation[] {
  const target = input.targetRelationId ?? null;
  const candidates: EligibleViaRelation[] = [];

  for (const rel of input.relations) {
    if (rel.archived) continue;
    if (target && rel.id === target) continue;
    // Simple 2-hop cycle guard: if the candidate already points at the
    // target via its own viaRelationId, declaring target -> candidate
    // would create a route loop. The graph engine handles deeper cycles
    // defensively, but this catches the obvious case at declaration time.
    if (target && rel.viaRelationId === target) continue;
    // Only revealed relations are eligible — pre-reveal links are still
    // forming and not yet a stable enough route to anchor a declaration.
    const isRevealed =
      rel.localState.revealSnapshot.status === 'revealed' ||
      rel.relationshipNameRevealed === true;
    if (!isRevealed) continue;
    const name = (rel.privateLabel ?? rel.name ?? '').trim();
    if (!name) continue;
    candidates.push({ id: rel.id, name, avatarSeed: rel.avatarSeed });
  }

  candidates.sort((a, b) => a.name.localeCompare(b.name, 'en-US'));
  return candidates;
}

/**
 * Resolves a viaRelationId to a displayable name from the current relations
 * list. Returns null when the via target is missing, archived, or unnamed.
 *
 * Used by RelationDetail to render the "Known through {name}" line only
 * when the route is currently valid.
 */
export function resolveViaRelationName(
  viaRelationId: string | null | undefined,
  relations: ReadonlyArray<Relation>,
): { id: string; name: string } | null {
  if (!viaRelationId) return null;
  const via = relations.find((r) => r.id === viaRelationId);
  if (!via) return null;
  if (via.archived) return null;
  const name = (via.privateLabel ?? via.name ?? '').trim();
  if (!name) return null;
  return { id: via.id, name };
}
