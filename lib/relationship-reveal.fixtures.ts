import type { PillarKey, PillarRating } from './evaluation';
import {
  buildMutualReveal,
  getSafeRelationshipRevealSummary,
  type RelationshipRevealInput,
} from './relationship-reveal';

type FixtureExpected = {
  isRevealable: boolean;
  revealed: boolean;
  stateLabel: string;
};

type RelationshipRevealFixture = {
  id: string;
  label: string;
  input: RelationshipRevealInput;
  expected: FixtureExpected;
};

const COMPLETE_RATINGS: Record<PillarKey, PillarRating> = {
  trust: 4,
  interactions: 4,
  affinity: 4,
  support: 4,
  sharedNetwork: 3,
};

export const RELATIONSHIP_REVEAL_FIXTURES: RelationshipRevealFixture[] = [
  {
    id: 'one_sided_draft_unresolved_invite',
    label: 'One-sided draft / unresolved invite',
    input: {
      relationExists: false,
      relationshipNameRevealed: false,
      sideAIdentityStatus: 'missing',
      sideBIdentityStatus: 'missing',
      sideBExists: false,
      privateReadingA: null,
      privateReadingB: null,
    },
    expected: {
      isRevealable: false,
      revealed: false,
      stateLabel: 'Unresolved invitation',
    },
  },
  {
    id: 'private_reading_saved_waiting_other_side',
    label: 'Private reading saved, waiting for other side',
    input: {
      relationExists: true,
      relationshipNameRevealed: false,
      sideAIdentityStatus: 'verified',
      sideBIdentityStatus: 'missing',
      sideBExists: false,
      privateReadingA: { ratings: COMPLETE_RATINGS },
      privateReadingB: null,
    },
    expected: {
      isRevealable: false,
      revealed: false,
      stateLabel: 'Private reading saved',
    },
  },
  {
    id: 'both_sides_complete_waiting_identity',
    label: 'Both sides complete but identities unresolved',
    input: {
      relationExists: true,
      relationshipNameRevealed: false,
      sideAIdentityStatus: 'verified',
      sideBIdentityStatus: 'draft',
      sideBExists: true,
      privateReadingA: { ratings: COMPLETE_RATINGS },
      privateReadingB: { ratings: COMPLETE_RATINGS },
    },
    expected: {
      isRevealable: false,
      revealed: false,
      stateLabel: 'Waiting identity resolution',
    },
  },
  {
    id: 'revealable_mutual_state',
    label: 'Revealable mutual state',
    input: {
      relationExists: true,
      relationshipNameRevealed: false,
      sideAIdentityStatus: 'verified',
      sideBIdentityStatus: 'verified',
      sideBExists: true,
      privateReadingA: { ratings: COMPLETE_RATINGS },
      privateReadingB: { ratings: COMPLETE_RATINGS },
    },
    expected: {
      isRevealable: true,
      revealed: false,
      stateLabel: 'Ready for mutual reveal',
    },
  },
  {
    id: 'already_revealed_state',
    label: 'Already revealed state',
    input: {
      relationExists: true,
      relationshipNameRevealed: true,
      sideAIdentityStatus: 'verified',
      sideBIdentityStatus: 'verified',
      sideBExists: true,
      privateReadingA: { ratings: COMPLETE_RATINGS },
      privateReadingB: { ratings: COMPLETE_RATINGS },
    },
    expected: {
      isRevealable: true,
      revealed: true,
      stateLabel: 'Revealed together',
    },
  },
];

// Dev-only fixture outputs to manually inspect helper semantics without a full test framework.
export const RELATIONSHIP_REVEAL_FIXTURE_RESULTS = RELATIONSHIP_REVEAL_FIXTURES.map((fixture) => {
  const payload = buildMutualReveal(fixture.input);
  const summary = getSafeRelationshipRevealSummary(fixture.input);
  return {
    id: fixture.id,
    label: fixture.label,
    expected: fixture.expected,
    actual: {
      isRevealable: payload.isRevealable,
      revealed: payload.revealed,
      stateLabel: summary?.stateLabel ?? '',
    },
  };
});
