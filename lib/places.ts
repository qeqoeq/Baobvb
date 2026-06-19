import type { Place, PlaceCategory, PlacePersonalFit } from '@/store/useRelationsStore';
import {
  PLACE_CONTEXT_FIT_OPTIONS,
  RESTAURANT_EXPERIENCE_DIMENSION_OPTIONS,
  type PlaceContextFit,
  type RestaurantExperienceDimension,
} from './place-quick-signal';
import {
  canUsePrivateOpenWorlds,
  type TrustedWorldMapEvaluationInput,
  type TrustedWorldMapRelationInput,
} from './relation-open-worlds';

export { PLACE_CONTEXT_FIT_OPTIONS, RESTAURANT_EXPERIENCE_DIMENSION_OPTIONS };
export type { PlaceContextFit, RestaurantExperienceDimension };

export const PLACE_CONTEXT_FIT_LABELS: Record<PlaceContextFit, string> = {
  date: 'Date',
  friends: 'Friends',
  family: 'Family',
  work_focus: 'Work / focus',
  quick_bite: 'Quick bite',
  deep_talk: 'Deep talk',
  calm: 'Calm',
  discovery: 'Discovery',
};

export const RESTAURANT_EXPERIENCE_DIMENSION_LABELS: Record<RestaurantExperienceDimension, string> = {
  food: 'Food quality',
  service: 'Service',
  atmosphere: 'Atmosphere',
  value: 'Value for price',
  cleanliness: 'Cleanliness',
};

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  bar: 'Bar',
  spot: 'Spot',
  other: 'Other',
};

export const PLACE_PERSONAL_FIT_LABELS: Record<PlacePersonalFit, string> = {
  saved:       'Saved',
  tried:       'Tried',
  kept:        'Kept',
  not_for_me:  'Not for me',
};

export const PLACE_PERSONAL_FIT_CAPTURE_OPTIONS: {
  id: 'saved' | 'kept' | 'not_for_me';
  label: string;
}[] = [
  { id: 'saved', label: 'Want to try' },
  { id: 'kept', label: 'Went there' },
  { id: 'not_for_me', label: 'Not for me' },
];

const PLACE_PERSONAL_FIT_FALLBACKS: Record<PlacePersonalFit, string> = {
  saved:      'Saved for later.',
  tried:      'Tried once.',
  kept:       'Kept in your places.',
  not_for_me: 'Not for me.',
};

export function getPlaceCategoryLabel(category: unknown): string {
  if (typeof category !== 'string') return PLACE_CATEGORY_LABELS.other;
  if (category in PLACE_CATEGORY_LABELS) {
    return PLACE_CATEGORY_LABELS[category as PlaceCategory];
  }
  return PLACE_CATEGORY_LABELS.other;
}

export function getPlaceFitLabel(fit: unknown): string {
  if (typeof fit === 'string' && fit in PLACE_PERSONAL_FIT_LABELS) {
    return PLACE_PERSONAL_FIT_LABELS[fit as PlacePersonalFit];
  }
  return PLACE_PERSONAL_FIT_LABELS.saved;
}

export function getPlaceReading(place: Pick<Place, 'impression' | 'personalFit'>): string {
  const impression = place.impression?.trim();
  if (impression) return impression;
  return PLACE_PERSONAL_FIT_FALLBACKS[place.personalFit] ?? PLACE_PERSONAL_FIT_FALLBACKS.saved;
}

export function sanitizePlacePersonalFit(value: unknown): PlacePersonalFit {
  const valid: PlacePersonalFit[] = ['saved', 'tried', 'kept', 'not_for_me'];
  if (typeof value === 'string' && valid.includes(value as PlacePersonalFit)) {
    return value as PlacePersonalFit;
  }
  return 'saved';
}

export function sanitizePlaceSourceRelationId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

// ── Route territory signals ──────────────────────────────────────────────────
// Internal GPS cartography layer — never persisted, never displayed with
// attribution. Derives which territories (object categories) have been opened
// by relational routes, based on places the user has kept.
//
// Doctrine:
//   sourceRelationId stays inside RouteTerritorySignal (private, internal).
//   TrustWorldTerritory strips attribution entirely — it answers only
//   "which territories has my trusted world charted?" never "who charted them."
//
// Invariants:
//   - saved / not_for_me are excluded: no behavioral proof of territory
//   - tried alone is insufficient in V1: territory requires kept evidence
//   - keptCount >= 2 → 'strong'; keptCount === 1 → 'observed'
//   - evidencePlaceIds contains only kept place ids
//   - a sourced place only contributes if its source relation passes the
//     same trust gate as deriveTrustedWorldMap / deriveKeptPlaceWorldSignals:
//     revealed, not archived, trustRating >= 4. Unknown/unverifiable sources
//     (relations/evaluations omitted) fail closed — no signal is derived.

export type RouteTerritorySignal = {
  sourceRelationId: string;
  category: PlaceCategory;
  keptCount: number;
  triedCount: number;
  evidencePlaceIds: string[];
  strength: 'observed' | 'strong';
};

export type TrustWorldTerritory = {
  categories: Array<{
    category: PlaceCategory;
    strength: 'observed' | 'strong';
  }>;
};

export function deriveRouteTerritorySignals(
  places: Place[],
  relations: TrustedWorldMapRelationInput[] = [],
  evaluations: TrustedWorldMapEvaluationInput[] = [],
): RouteTerritorySignal[] {
  const relationsById = new Map(relations.map((r) => [r.id, r]));
  const evalByRelationId = new Map(evaluations.map((e) => [e.relationId, e]));

  type GroupData = { kept: Place[]; tried: Place[] };
  const byRoute = new Map<string, Map<PlaceCategory, GroupData>>();

  for (const place of places) {
    if (!place.sourceRelationId) continue;
    if (place.personalFit === 'saved' || place.personalFit === 'not_for_me') continue;

    const relation = relationsById.get(place.sourceRelationId);
    if (!relation) continue;

    const evaluation = evalByRelationId.get(relation.id);
    const isRevealed = relation.localState?.revealSnapshot?.revealed === true;
    const trustRating = evaluation?.ratings?.trust ?? null;
    const isArchived = relation.archived === true;

    if (!canUsePrivateOpenWorlds({ isRevealed, trustRating, isArchived })) continue;

    let byCat = byRoute.get(place.sourceRelationId);
    if (!byCat) {
      byCat = new Map();
      byRoute.set(place.sourceRelationId, byCat);
    }

    let group = byCat.get(place.category);
    if (!group) {
      group = { kept: [], tried: [] };
      byCat.set(place.category, group);
    }

    if (place.personalFit === 'kept') {
      group.kept.push(place);
    } else {
      group.tried.push(place);
    }
  }

  const signals: RouteTerritorySignal[] = [];

  for (const [sourceRelationId, byCat] of byRoute) {
    for (const [category, { kept, tried }] of byCat) {
      if (kept.length === 0) continue;
      signals.push({
        sourceRelationId,
        category,
        keptCount: kept.length,
        triedCount: tried.length,
        evidencePlaceIds: kept.map((p) => p.id),
        strength: kept.length >= 2 ? 'strong' : 'observed',
      });
    }
  }

  return signals.sort((a, b) => {
    const bySource = a.sourceRelationId.localeCompare(b.sourceRelationId);
    if (bySource !== 0) return bySource;
    return a.category.localeCompare(b.category);
  });
}

export function deriveTrustWorldTerritory(
  signals: RouteTerritorySignal[],
): TrustWorldTerritory {
  const byCategory = new Map<PlaceCategory, 'observed' | 'strong'>();

  for (const signal of signals) {
    const current = byCategory.get(signal.category);
    if (current !== 'strong') {
      byCategory.set(signal.category, signal.strength);
    }
  }

  const categories = [...byCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, strength]) => ({ category, strength }));

  return { categories };
}
