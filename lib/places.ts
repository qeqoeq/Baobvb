import type { Place, PlaceCategory, PlacePersonalFit } from '@/store/useRelationsStore';
import {
  PLACE_CONTEXT_FIT_OPTIONS,
  RESTAURANT_EXPERIENCE_DIMENSION_OPTIONS,
  type PlaceContextFit,
  type PlaceQuickSignal,
  type RestaurantExperienceDimension,
} from './place-quick-signal';
import {
  canUsePrivateOpenWorlds,
  type RelationOpenWorld,
  type TrustedWorldMapEvaluationInput,
  type TrustedWorldMapRelationInput,
} from './relation-open-worlds';

export { PLACE_CONTEXT_FIT_OPTIONS, RESTAURANT_EXPERIENCE_DIMENSION_OPTIONS };
export type { PlaceContextFit, RestaurantExperienceDimension };

export const PLACE_CONTEXT_FIT_LABELS: Record<PlaceContextFit, string> = {
  date: 'Rendez-vous',
  friends: 'Amis',
  family: 'Famille',
  work_focus: 'Travail / concentration',
  quick_bite: 'Sur le pouce',
  deep_talk: 'Vraie conversation',
  calm: 'Calme',
  discovery: 'Découverte',
};

export const RESTAURANT_EXPERIENCE_DIMENSION_LABELS: Record<RestaurantExperienceDimension, string> = {
  food: 'Qualité de la cuisine',
  service: 'Service',
  atmosphere: 'Ambiance',
  value: 'Rapport qualité-prix',
  cleanliness: 'Propreté',
};

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  spot: 'Coin',
  other: 'Autre',
};

export const PLACE_PERSONAL_FIT_LABELS: Record<PlacePersonalFit, string> = {
  saved:       'Enregistré',
  tried:       'Essayé',
  kept:        'Gardé',
  not_for_me:  'Pas pour moi',
};

// "Have you been there?" only confirms a real visit happened — it is not
// the verdict. The verdict (would go back / depends / not for me) lives in
// the Quick Read, not as an entry-level chip. Save for later is captured as
// a separate, secondary action (see PLACE_PERSONAL_FIT_SAVE_FOR_LATER_OPTION
// below).
export const PLACE_PERSONAL_FIT_CAPTURE_OPTIONS: {
  id: 'kept';
  label: string;
}[] = [{ id: 'kept', label: 'Oui, j’y suis allé·e' }];

export const PLACE_PERSONAL_FIT_SAVE_FOR_LATER_OPTION: {
  id: 'saved';
  label: string;
} = { id: 'saved', label: 'Garder pour plus tard' };

const PLACE_PERSONAL_FIT_FALLBACKS: Record<PlacePersonalFit, string> = {
  saved:      'Enregistré pour plus tard.',
  tried:      'Essayé une fois.',
  kept:       'Gardé dans tes lieux.',
  not_for_me: 'Pas pour moi.',
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

// ── Place update merge (testability boundary) ──────────────────────────────
// Pure extraction of setPlace's fusion logic, with no store/persistence
// dependency, so the merge rules themselves are directly testable. The
// caller (store/useRelationsStore.ts) is responsible for all sanitization
// and for detecting field presence before calling this function.
//
// Doctrine (X.45b): omitted optional structured fields are preserved;
// explicit empty values clear them. After sanitization, an omission and an
// explicit clear both collapse to `undefined` — so the caller must carry
// "was this field provided at all" separately from "what did it sanitize
// to". MergePlaceFieldUpdate captures exactly that distinction.

export type MergePlaceFieldUpdate<T> =
  | { provided: false }
  | { provided: true; value: T | undefined };

export type MergePlaceUpdateInput = {
  name: string;
  category: PlaceCategory;
  personalFit: PlacePersonalFit;
  impression?: string;
  worldFit: MergePlaceFieldUpdate<RelationOpenWorld[]>;
  quickSignal: MergePlaceFieldUpdate<PlaceQuickSignal>;
  identityHint: MergePlaceFieldUpdate<string>;
  /**
   * Private repeat-visit signal (X.46). Unlike worldFit/quickSignal/
   * identityHint, this field has no explicit-clear use case: omission
   * always preserves any existing value (via the `...rest` spread below —
   * it is never destructured out of `existing`); only a defined, sanitized
   * value ever replaces it.
   */
  wentAgainAt?: string;
};

/**
 * Pure merge of an existing Place with an already-sanitized update.
 * Reproduces setPlace's fusion rules:
 *  - name/category/personalFit/impression are always overwritten by the
 *    update (impression becomes undefined if the update's value is falsy);
 *  - worldFit/quickSignal/identityHint: { provided: false } preserves the
 *    existing value untouched; { provided: true, value } replaces it
 *    (value undefined clears the field, a defined value replaces it);
 *  - wentAgainAt: omitted (undefined) preserves the existing value; a
 *    defined value replaces it. No explicit-clear case for this field.
 * The quickSignal-only-if-kept invariant is NOT enforced here — it is the
 * caller's (setPlace's) responsibility to pass { provided: true, value:
 * undefined } for quickSignal whenever personalFit leaves 'kept', so this
 * function never needs to know about personalFit's special case.
 * Never mutates `existing`. Never touches persistence, emitChange, or the
 * store — purely an object transformation.
 */
export function mergePlaceUpdate(existing: Place, update: MergePlaceUpdateInput): Place {
  const {
    worldFit: _previousWorldFit,
    quickSignal: _previousQuickSignal,
    identityHint: _previousIdentityHint,
    ...rest
  } = existing;

  const worldFit = update.worldFit.provided ? update.worldFit.value : existing.worldFit;
  const quickSignal = update.quickSignal.provided ? update.quickSignal.value : existing.quickSignal;
  const identityHint = update.identityHint.provided ? update.identityHint.value : existing.identityHint;

  return {
    ...rest,
    name: update.name,
    category: update.category,
    personalFit: update.personalFit,
    impression: update.impression ? update.impression : undefined,
    ...(worldFit !== undefined ? { worldFit } : {}),
    ...(quickSignal !== undefined ? { quickSignal } : {}),
    ...(identityHint !== undefined ? { identityHint } : {}),
    ...(update.wentAgainAt !== undefined ? { wentAgainAt: update.wentAgainAt } : {}),
  };
}
