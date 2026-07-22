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
    relationshipNameRevealed:
      relation?.localState.revealSnapshot.status === 'revealed' ||
      relation?.relationshipNameRevealed === true,
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
        stateLabel: 'Révélé ensemble',
        shortDescription: 'Cette relation a été révélée mutuellement.',
      };
    case 'ready_for_mutual_reveal':
      return {
        stateLabel: 'Prêt pour la révélation mutuelle',
        shortDescription: 'Les deux côtés sont complets et prêts à se révéler ensemble.',
      };
    case 'cooking_reveal':
      return {
        stateLabel: 'Baobab prépare ton lien',
        shortDescription: 'Tes lectures privées sont enregistrées. La révélation se débloquera bientôt sur cet appareil.',
      };
    case 'reveal_ready':
      return {
        stateLabel: 'Ton lien est prêt',
        shortDescription: 'Tu peux ouvrir ta révélation maintenant.',
      };
    case 'waiting_identity_resolution':
      return {
        stateLabel: 'En attente de résolution d’identité',
        shortDescription: 'Les deux côtés existent, mais la résolution d’identité est encore en cours.',
        waitingReason: 'La confirmation d’identité est encore en cours.',
      };
    case 'private_reading_saved_waiting_other_side':
      return {
        stateLabel: 'Lecture privée enregistrée',
        shortDescription: 'Ton côté est enregistré. En attente de l’autre côté.',
        waitingReason: 'L’autre côté n’a pas encore terminé sa lecture privée.',
      };
    case 'private_reading_pending':
      return {
        stateLabel: 'Lecture privée en attente',
        shortDescription: 'Une lecture privée est nécessaire avant toute révélation.',
      };
    case 'draft':
      return {
        stateLabel: 'Brouillon privé',
        shortDescription: 'Cette relation est encore un brouillon privé.',
      };
    case 'unresolved_invite':
    default:
      return {
        stateLabel: 'Invitation non résolue',
        shortDescription: 'Cette invitation est prête, mais la liaison des relations n’est pas encore disponible dans cette version.',
        waitingReason: 'Le contexte de ton invitation est enregistré sur cet appareil.',
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
  const revealed = input.revealStatus === 'revealed' || input.relationshipNameRevealed === true;
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
