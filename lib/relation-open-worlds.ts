export type RelationOpenWorld =
  | 'local_life'
  | 'learning'
  | 'creative'
  | 'sport'
  | 'travel'
  | 'culture';

export const RELATION_OPEN_WORLD_OPTIONS: readonly RelationOpenWorld[] = [
  'local_life',
  'learning',
  'creative',
  'sport',
  'travel',
  'culture',
] as const;

const RELATION_OPEN_WORLD_LABELS: Record<RelationOpenWorld, string> = {
  local_life: 'Vie locale',
  learning: 'Apprentissage',
  creative: 'Créatif',
  sport: 'Sport',
  travel: 'Voyage',
  culture: 'Culture',
};

export function isRelationOpenWorld(value: unknown): value is RelationOpenWorld {
  return (
    typeof value === 'string' &&
    (RELATION_OPEN_WORLD_OPTIONS as readonly string[]).includes(value)
  );
}

export function sanitizeRelationOpenWorlds(input: unknown): RelationOpenWorld[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<RelationOpenWorld>();
  for (const item of input) {
    if (!isRelationOpenWorld(item)) continue;
    seen.add(item);
    if (seen.size === 3) break;
  }
  return RELATION_OPEN_WORLD_OPTIONS.filter((w) => seen.has(w));
}

export function getRelationOpenWorldLabel(world: RelationOpenWorld): string {
  return RELATION_OPEN_WORLD_LABELS[world];
}

export function canUsePrivateOpenWorlds(params: {
  isRevealed: boolean;
  trustRating: number | null;
  isArchived?: boolean;
}): boolean {
  return (
    params.isRevealed === true &&
    params.trustRating !== null &&
    params.trustRating >= 4 &&
    params.isArchived !== true
  );
}

export type TrustedWorldMapRelationInput = {
  id: string;
  archived?: boolean;
  privateOpenWorlds?: unknown;
  localState?: {
    revealSnapshot?: {
      revealed?: boolean;
    };
  };
};

export type TrustedWorldMapEvaluationInput = {
  relationId: string;
  ratings?: {
    trust?: number | null;
  };
};

export function deriveTrustedWorldMap(
  relations: TrustedWorldMapRelationInput[],
  evaluations: TrustedWorldMapEvaluationInput[],
): RelationOpenWorld[] {
  const evalByRelationId = new Map(evaluations.map((e) => [e.relationId, e]));
  const collected = new Set<RelationOpenWorld>();

  for (const relation of relations) {
    const evaluation = evalByRelationId.get(relation.id);
    const isRevealed = relation.localState?.revealSnapshot?.revealed === true;
    const trustRating = evaluation?.ratings?.trust ?? null;
    const isArchived = relation.archived === true;

    if (!canUsePrivateOpenWorlds({ isRevealed, trustRating, isArchived })) continue;

    for (const world of sanitizeRelationOpenWorlds(relation.privateOpenWorlds)) {
      collected.add(world);
    }
  }

  return RELATION_OPEN_WORLD_OPTIONS.filter((w) => collected.has(w));
}

// ─── Kept-place world signals ─────────────────────────────────────────────────
// Non-attributive derivation of RelationOpenWorld signals from kept places.
//
// Doctrine:
//   A kept place can carry a world signal from two sources:
//     A. Direct worldFit — the user's own qualification of the place. No
//        relation gate: it is the user's intention on their own object.
//     B. Relation source — a kept place sourced via an eligible relation
//        carries a world signal from that relation's privateOpenWorlds.
//        This is behavioral evidence, not a declared preference.
//
//   The output is strictly RelationOpenWorld[]. No relation ids, place ids,
//   counts, scores, confidence, or evidence surfaces. Attribution is fully
//   stripped: only the world dimensions survive aggregation.
//
// Gate for source B only (same as deriveTrustedWorldMap):
//   relation.localState.revealSnapshot.revealed === true
//   AND trustRating >= 4
//   AND !archived

export type KeptPlaceWorldSignalPlaceInput = {
  personalFit: string;
  sourceRelationId?: string | null;
  /**
   * Direct world intention declared by the user on their own object.
   * No relation gate — this is the user's own qualification, not behavioral
   * evidence routed through a relation.
   */
  worldFit?: readonly string[] | readonly RelationOpenWorld[];
};

export function deriveKeptPlaceWorldSignals(
  places: KeptPlaceWorldSignalPlaceInput[],
  relations: TrustedWorldMapRelationInput[],
  evaluations: TrustedWorldMapEvaluationInput[],
): RelationOpenWorld[] {
  const relationsById = new Map(relations.map((r) => [r.id, r]));
  const evalByRelationId = new Map(evaluations.map((e) => [e.relationId, e]));
  const collected = new Set<RelationOpenWorld>();

  for (const place of places) {
    if (place.personalFit !== 'kept') continue;

    // Source A — direct worldFit declared by the user. No relation gate.
    for (const world of sanitizeRelationOpenWorlds(place.worldFit)) {
      collected.add(world);
    }

    // Source B — relation source (behavioral evidence via an eligible relation).
    if (!place.sourceRelationId) continue;

    const relation = relationsById.get(place.sourceRelationId);
    if (!relation) continue;

    const evaluation = evalByRelationId.get(relation.id);
    const isRevealed = relation.localState?.revealSnapshot?.revealed === true;
    const trustRating = evaluation?.ratings?.trust ?? null;
    const isArchived = relation.archived === true;

    if (!canUsePrivateOpenWorlds({ isRevealed, trustRating, isArchived })) continue;

    for (const world of sanitizeRelationOpenWorlds(relation.privateOpenWorlds)) {
      collected.add(world);
    }
  }

  return RELATION_OPEN_WORLD_OPTIONS.filter((w) => collected.has(w));
}

// ─── World kept places ────────────────────────────────────────────────────────
// Returns the kept places that contributed to a specific world signal.
//
// Output is { id, name, category, impression? } only. sourceRelationId and all
// relational attribution are stripped at this boundary — they cannot surface in
// the UI by construction.

export type WorldKeptPlaceInput = {
  id: string;
  name: string;
  category: string;
  personalFit: string;
  impression?: string;
  sourceRelationId?: string | null;
  /**
   * Direct world intention declared by the user on their own object.
   * No relation gate — this is the user's own qualification, not behavioral
   * evidence routed through a relation.
   */
  worldFit?: readonly string[] | readonly RelationOpenWorld[];
};

export type WorldKeptPlaceItem = {
  id: string;
  name: string;
  category: string;
  impression?: string;
};

export function deriveWorldKeptPlaces(
  world: RelationOpenWorld,
  places: WorldKeptPlaceInput[],
  relations: TrustedWorldMapRelationInput[],
  evaluations: TrustedWorldMapEvaluationInput[],
): WorldKeptPlaceItem[] {
  if (!isRelationOpenWorld(world)) return [];

  const relationsById = new Map(relations.map((r) => [r.id, r]));
  const evalByRelationId = new Map(evaluations.map((e) => [e.relationId, e]));
  const result: WorldKeptPlaceItem[] = [];

  for (const place of places) {
    if (place.personalFit !== 'kept') continue;

    const hasDirectWorldFit = sanitizeRelationOpenWorlds(place.worldFit).includes(world);

    let hasRelationWorld = false;
    if (place.sourceRelationId) {
      const relation = relationsById.get(place.sourceRelationId);
      if (relation) {
        const evaluation = evalByRelationId.get(relation.id);
        const isRevealed = relation.localState?.revealSnapshot?.revealed === true;
        const trustRating = evaluation?.ratings?.trust ?? null;
        const isArchived = relation.archived === true;

        if (canUsePrivateOpenWorlds({ isRevealed, trustRating, isArchived })) {
          hasRelationWorld = sanitizeRelationOpenWorlds(relation.privateOpenWorlds).includes(world);
        }
      }
    }

    if (!hasDirectWorldFit && !hasRelationWorld) continue;

    result.push({
      id: place.id,
      name: place.name,
      category: place.category,
      ...(place.impression !== undefined ? { impression: place.impression } : {}),
    });
  }

  return result;
}
