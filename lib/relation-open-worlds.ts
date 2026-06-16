export type RelationOpenWorld =
  | 'local_life'
  | 'learning'
  | 'work'
  | 'creative'
  | 'sport'
  | 'travel'
  | 'culture';

export const RELATION_OPEN_WORLD_OPTIONS: readonly RelationOpenWorld[] = [
  'local_life',
  'learning',
  'work',
  'creative',
  'sport',
  'travel',
  'culture',
] as const;

const RELATION_OPEN_WORLD_LABELS: Record<RelationOpenWorld, string> = {
  local_life: 'Local life',
  learning: 'Learning',
  work: 'Work',
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
