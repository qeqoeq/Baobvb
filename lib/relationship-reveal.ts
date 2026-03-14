import { computeMutualRelationshipScore, type Evaluation, type Tier } from './evaluation';
import {
  buildMutualRelationshipInput,
  canMutualizeRelationship,
  type MutualizationPrerequisites,
} from './relationship-mutualization';
import {
  getRelationshipDisplayState,
  type IdentityResolutionState,
  type RelationshipDisplayState,
} from './relationship-state';
import type { Relation, RelationshipRevealSnapshot } from '../store/useRelationsStore';

export type RelationshipRevealPayload = {
  isRevealable: boolean;
  revealed: boolean;
  mutualScore?: number;
  tier?: Tier;
  relationshipNameRevealed?: boolean;
  safeSummary?: {
    stateLabel: string;
    shortDescription: string;
    waitingReason?: string;
  };
};

export type RelationshipRevealInput = MutualizationPrerequisites & {
  relationshipNameRevealed?: boolean;
  revealStatus?: RelationshipRevealSnapshot['status'];
  relationExists: boolean;
  sideAHasPrivateReading?: boolean;
  sideBHasPrivateReading?: boolean;
};

export type RelationshipRevealInputContext = {
  relation: Pick<Relation, 'identityStatus' | 'relationshipNameRevealed' | 'localState'> | null;
  privateReadingA?: Evaluation | null;
  privateReadingB?: Evaluation | null;
  sideB?: {
    exists: boolean;
    identityStatus?: IdentityResolutionState;
    privateReading?: Evaluation | null;
  };
};

export function buildRelationshipRevealInput(
  context: RelationshipRevealInputContext,
): RelationshipRevealInput {
  const relation = context.relation;
  const relationExists = relation !== null;
  const sideAState = relation?.localState?.sideA;
  const sideBState = relation?.localState?.sideB;
  const fallbackSideB = context.sideB;

  const sideAIdentityStatus = relationExists
    ? sideAState?.identityStatus ?? relation.identityStatus
    : 'missing';

  const sideBExists = sideBState?.exists ?? fallbackSideB?.exists ?? false;
  const sideBIdentityStatus = sideBExists
    ? sideBState?.identityStatus ?? fallbackSideB?.identityStatus ?? 'missing'
    : 'missing';

  const sideAHasPrivateReading =
    sideAState?.hasPrivateReading ?? Boolean(context.privateReadingA);
  const sideBHasPrivateReading =
    sideBState?.hasPrivateReading ?? Boolean(context.privateReadingB ?? fallbackSideB?.privateReading);

  return {
    relationExists,
    relationshipNameRevealed: relation?.relationshipNameRevealed === true,
    revealStatus: relation?.localState.revealSnapshot.status,
    sideAIdentityStatus,
    privateReadingA: context.privateReadingA ?? null,
    sideAHasPrivateReading,
    sideBExists,
    sideBIdentityStatus,
    privateReadingB: context.privateReadingB ?? fallbackSideB?.privateReading ?? null,
    sideBHasPrivateReading,
  };
}

function buildSummaryFromDisplayState(
  state: RelationshipDisplayState,
): RelationshipRevealPayload['safeSummary'] {
  switch (state) {
    case 'mutually_revealed':
      return {
        stateLabel: 'Revealed together',
        shortDescription: 'This relationship has been mutually revealed.',
      };
    case 'ready_for_mutual_reveal':
      return {
        stateLabel: 'Ready for mutual reveal',
        shortDescription: 'Both sides are complete and ready to reveal together.',
      };
    case 'cooking_reveal':
      return {
        stateLabel: 'Baobab is preparing your link',
        shortDescription: 'Your private readings are saved. Reveal will unlock soon on this device.',
      };
    case 'reveal_ready':
      return {
        stateLabel: 'Your link is ready',
        shortDescription: 'You can open your reveal now.',
      };
    case 'waiting_identity_resolution':
      return {
        stateLabel: 'Waiting identity resolution',
        shortDescription: 'Both sides exist, but identity resolution is still pending.',
        waitingReason: 'Identity confirmation is still pending.',
      };
    case 'private_reading_saved_waiting_other_side':
      return {
        stateLabel: 'Private reading saved',
        shortDescription: 'Your side is saved. Waiting for the other side.',
        waitingReason: 'The other side has not completed their private reading yet.',
      };
    case 'private_reading_pending':
      return {
        stateLabel: 'Private reading pending',
        shortDescription: 'A private reading is needed before any reveal can happen.',
      };
    case 'draft':
      return {
        stateLabel: 'Private draft',
        shortDescription: 'This relationship is still a private draft.',
      };
    case 'unresolved_invite':
    default:
      return {
        stateLabel: 'Unresolved invitation',
        shortDescription: 'This invitation is ready, but relationship linking is not available yet in this version.',
        waitingReason: 'Your invitation context is saved on this device.',
      };
  }
}

export function canRevealRelationship(input: RelationshipRevealInput): boolean {
  if (!input.relationExists) return false;
  return canMutualizeRelationship(input);
}

export function getSafeRelationshipRevealSummary(
  input: RelationshipRevealInput,
): RelationshipRevealPayload['safeSummary'] {
  const sideAHasPrivateReading = input.sideAHasPrivateReading ?? Boolean(input.privateReadingA);
  const sideBHasPrivateReading = input.sideBHasPrivateReading ?? Boolean(input.privateReadingB);

  const displayState = getRelationshipDisplayState({
    relation: input.relationExists
      ? {
          identityStatus: input.sideAIdentityStatus === 'verified' ? 'verified' : 'draft',
          relationshipNameRevealed: input.relationshipNameRevealed === true,
          localState: {
            sideA: {
              exists: true,
              identityStatus: input.sideAIdentityStatus,
              hasPrivateReading: sideAHasPrivateReading,
              privateReadingId: undefined,
              resolvedAt: undefined,
            },
            sideB: {
              exists: input.sideBExists,
              identityStatus: input.sideBExists ? (input.sideBIdentityStatus ?? 'missing') : 'missing',
              hasPrivateReading: sideBHasPrivateReading,
              privateReadingId: undefined,
              resolvedAt: undefined,
            },
            revealSnapshot: {
              status: input.revealStatus ?? 'waiting_other_side',
              revealed: input.relationshipNameRevealed === true,
              relationshipNameRevealed: input.relationshipNameRevealed === true,
            },
          },
        }
      : null,
    privateReadingA: (input.privateReadingA as Evaluation | null | undefined) ?? null,
    privateReadingB: (input.privateReadingB as Evaluation | null | undefined) ?? null,
    sideBExists: input.sideBExists,
    sideBIdentityStatus: input.sideBIdentityStatus,
  });

  return buildSummaryFromDisplayState(displayState);
}

export function buildMutualReveal(
  input: RelationshipRevealInput,
): RelationshipRevealPayload {
  const isRevealable = canRevealRelationship(input);
  const revealed = input.relationshipNameRevealed === true;
  const safeSummary = getSafeRelationshipRevealSummary(input);

  if (!isRevealable || !revealed) {
    return {
      isRevealable,
      revealed,
      relationshipNameRevealed: revealed,
      safeSummary,
    };
  }

  const mutualInput = buildMutualRelationshipInput(input);
  if (!mutualInput) {
    return {
      isRevealable,
      revealed,
      relationshipNameRevealed: revealed,
      safeSummary,
    };
  }

  const mutual = computeMutualRelationshipScore(mutualInput.ratingsA, mutualInput.ratingsB);

  return {
    isRevealable: true,
    revealed: true,
    mutualScore: mutual.finalScore,
    tier: mutual.tier,
    relationshipNameRevealed: true,
    safeSummary,
  };
}
