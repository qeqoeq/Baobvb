import type { Relation } from '../store/useRelationsStore';

export type RelationAnchorMode =
  | 'manual'
  | 'scan'
  | 'invite_number'
  | 'claim'
  | 'bootstrap'
  | 'shared';

export type RelationDepth = 'encounter' | 'known' | 'deep';

export function isRelationAnchorMode(value: unknown): value is RelationAnchorMode {
  return (
    value === 'manual' ||
    value === 'scan' ||
    value === 'invite_number' ||
    value === 'claim' ||
    value === 'bootstrap' ||
    value === 'shared'
  );
}

export function isRelationDepth(value: unknown): value is RelationDepth {
  return value === 'encounter' || value === 'known' || value === 'deep';
}

export function deriveRelationAnchorMode(
  relation: Pick<Relation, 'source' | 'canonicalRelationId'> & {
    anchorMode?: RelationAnchorMode;
  },
): RelationAnchorMode {
  if (isRelationAnchorMode(relation.anchorMode)) return relation.anchorMode;
  if (relation.source === 'claim') return 'claim';
  if (relation.source === 'bootstrap') return 'bootstrap';
  if (relation.source === 'invite_number') return 'invite_number';
  if (relation.canonicalRelationId) return 'shared';
  if (relation.source === 'scan') return 'scan';
  return 'manual';
}

export function deriveRelationDepth(
  relation: Pick<Relation, 'anchorMode' | 'localState' | 'canonicalRelationId' | 'source'>,
): RelationDepth {
  const anchorMode = deriveRelationAnchorMode(relation);
  const revealStatus = relation.localState.revealSnapshot.status;
  const sideAHasReading = relation.localState.sideA.hasPrivateReading === true;
  const sideBHasReading = relation.localState.sideB.hasPrivateReading === true;

  // Conservative rule: "deep" only once the relation has meaningful mutual structure.
  if (revealStatus === 'revealed' || sideAHasReading && sideBHasReading) {
    return 'deep';
  }

  // "Known" requires either an actual reading or stronger shared grounding.
  if (
    sideAHasReading ||
    anchorMode === 'claim' ||
    anchorMode === 'bootstrap' ||
    anchorMode === 'shared'
  ) {
    return 'known';
  }

  return 'encounter';
}

export function getNormalizedPrivateLabel(
  relation: Pick<Relation, 'name'> & { privateLabel?: string | null },
): string {
  const explicit =
    typeof relation.privateLabel === 'string' ? relation.privateLabel.trim() : '';
  if (explicit) return explicit;
  return relation.name.trim();
}

export function normalizeRelationModelFields(
  relation: Pick<
    Relation,
    | 'name'
    | 'source'
    | 'canonicalRelationId'
    | 'anchorMode'
    | 'privateLabel'
    | 'anchorValue'
    | 'handle'
    | 'sourceHandle'
    | 'sourcePublicProfileId'
    | 'relationDepth'
    | 'localState'
  >,
): Pick<Relation, 'privateLabel' | 'anchorMode' | 'anchorValue' | 'relationDepth'> {
  const privateLabel = getNormalizedPrivateLabel(relation);
  const anchorMode = deriveRelationAnchorMode(relation);
  const normalizedAnchorValue =
    typeof relation.anchorValue === 'string' && relation.anchorValue.trim().length > 0
      ? relation.anchorValue.trim()
      : relation.anchorValue === null
        ? null
        : undefined;
  const fallbackAnchorValue =
    anchorMode === 'scan'
      ? relation.sourcePublicProfileId ?? relation.sourceHandle ?? null
      : anchorMode === 'claim' || anchorMode === 'bootstrap' || anchorMode === 'shared'
        ? relation.handle ?? null
        : null;
  const anchorValue = normalizedAnchorValue ?? fallbackAnchorValue;
  const relationDepth = deriveRelationDepth({ ...relation, anchorMode });

  return {
    privateLabel,
    anchorMode,
    anchorValue,
    relationDepth,
  };
}
