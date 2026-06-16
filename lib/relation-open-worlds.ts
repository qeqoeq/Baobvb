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
  local_life: 'Local life',
  learning: 'Learning',
  creative: 'Creative',
  sport: 'Sport',
  travel: 'Travel',
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
