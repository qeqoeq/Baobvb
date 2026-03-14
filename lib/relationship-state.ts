import type { Evaluation } from './evaluation';
import type { Relation } from '../store/useRelationsStore';

export type IdentityResolutionState = 'missing' | 'draft' | 'verified';

export type RelationshipDisplayState =
  | 'draft'
  | 'private_reading_pending'
  | 'private_reading_saved_waiting_other_side'
  | 'cooking_reveal'
  | 'reveal_ready'
  | 'unresolved_invite'
  | 'waiting_identity_resolution'
  | 'ready_for_mutual_reveal'
  | 'mutually_revealed';

export type RelationshipStateInput = {
  relation: Pick<Relation, 'identityStatus' | 'relationshipNameRevealed' | 'localState'> | null;
  privateReadingA?: Evaluation | null;
  privateReadingB?: Evaluation | null;
  sideBExists: boolean;
  sideBIdentityStatus?: IdentityResolutionState;
};

export type RelationshipSideStatus = {
  exists: boolean;
  identityStatus: IdentityResolutionState;
  isIdentityResolved: boolean;
  hasPrivateReading: boolean;
};

export type RelationshipCompletionState = {
  sideA: RelationshipSideStatus;
  sideB: RelationshipSideStatus;
  bothSidesExist: boolean;
  bothPrivateReadingsComplete: boolean;
  bothIdentitiesResolved: boolean;
  canMutualReveal: boolean;
  revealed: boolean;
};

function normalizeIdentityStatus(
  status: Relation['identityStatus'] | IdentityResolutionState | undefined,
): IdentityResolutionState {
  if (status === 'verified') return 'verified';
  if (status === 'draft') return 'draft';
  return 'missing';
}

function getSideStatus({
  exists,
  identityStatus,
  hasPrivateReading,
}: {
  exists: boolean;
  identityStatus: IdentityResolutionState;
  hasPrivateReading: boolean;
}): RelationshipSideStatus {
  return {
    exists,
    identityStatus,
    isIdentityResolved: identityStatus === 'verified',
    hasPrivateReading,
  };
}

export function getRelationshipSideStatus(input: RelationshipStateInput): {
  sideA: RelationshipSideStatus;
  sideB: RelationshipSideStatus;
} {
  const sideAState = input.relation?.localState?.sideA;
  const sideBState = input.relation?.localState?.sideB;

  const sideAExists = sideAState?.exists ?? Boolean(input.relation);
  const sideAIdentity = normalizeIdentityStatus(sideAState?.identityStatus ?? input.relation?.identityStatus);
  const sideAHasReading = sideAState?.hasPrivateReading ?? Boolean(input.privateReadingA);

  const sideBExists = sideBState?.exists ?? input.sideBExists;
  const sideBIdentity = sideBExists
    ? normalizeIdentityStatus(sideBState?.identityStatus ?? input.sideBIdentityStatus)
    : 'missing';
  const sideBHasReading = sideBState?.hasPrivateReading ?? Boolean(input.privateReadingB);

  return {
    sideA: getSideStatus({
      exists: sideAExists,
      identityStatus: sideAIdentity,
      hasPrivateReading: sideAHasReading,
    }),
    sideB: getSideStatus({
      exists: sideBExists,
      identityStatus: sideBIdentity,
      hasPrivateReading: sideBHasReading,
    }),
  };
}

export function getRelationshipCompletionState(
  input: RelationshipStateInput,
): RelationshipCompletionState {
  const { sideA, sideB } = getRelationshipSideStatus(input);
  const bothSidesExist = sideA.exists && sideB.exists;
  const bothPrivateReadingsComplete = sideA.hasPrivateReading && sideB.hasPrivateReading;
  const bothIdentitiesResolved = sideA.isIdentityResolved && sideB.isIdentityResolved;
  const canMutualReveal = bothSidesExist && bothPrivateReadingsComplete && bothIdentitiesResolved;
  const revealStatus = input.relation?.localState?.revealSnapshot.status;
  const revealed =
    revealStatus === 'revealed' ||
    input.relation?.localState?.revealSnapshot.revealed === true ||
    input.relation?.relationshipNameRevealed === true;

  return {
    sideA,
    sideB,
    bothSidesExist,
    bothPrivateReadingsComplete,
    bothIdentitiesResolved,
    canMutualReveal,
    revealed,
  };
}

export function getRelationshipDisplayState(
  input: RelationshipStateInput,
): RelationshipDisplayState {
  const completion = getRelationshipCompletionState(input);
  const revealStatus = input.relation?.localState?.revealSnapshot.status;

  if (completion.revealed) return 'mutually_revealed';
  if (revealStatus === 'reveal_ready') return 'reveal_ready';
  if (revealStatus === 'cooking_reveal') return 'cooking_reveal';
  if (!completion.sideA.exists) return 'unresolved_invite';

  if (!completion.sideA.hasPrivateReading) {
    return completion.sideA.identityStatus === 'draft'
      ? 'draft'
      : 'private_reading_pending';
  }

  if (!completion.sideB.exists) return 'private_reading_saved_waiting_other_side';
  if (!completion.sideB.isIdentityResolved) return 'waiting_identity_resolution';
  if (!completion.sideB.hasPrivateReading) return 'private_reading_saved_waiting_other_side';
  if (completion.canMutualReveal) return 'ready_for_mutual_reveal';

  return 'private_reading_saved_waiting_other_side';
}
