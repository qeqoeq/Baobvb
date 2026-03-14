import type { Evaluation, PillarKey, PillarRating } from './evaluation';
import type { IdentityResolutionState } from './relationship-state';

type PrivateReading = Pick<Evaluation, 'ratings'> | null | undefined;

export type MutualRelationshipInput = {
  ratingsA: Record<PillarKey, PillarRating>;
  ratingsB: Record<PillarKey, PillarRating>;
};

export type MutualizationPrerequisites = {
  sideAIdentityStatus: IdentityResolutionState;
  sideBIdentityStatus: IdentityResolutionState;
  sideBExists: boolean;
  privateReadingA?: PrivateReading;
  privateReadingB?: PrivateReading;
};

const REQUIRED_PILLARS: PillarKey[] = [
  'trust',
  'interactions',
  'affinity',
  'support',
  'sharedNetwork',
];

function isValidPillarRating(value: unknown): value is PillarRating {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function hasCompletePrivateReading(reading: PrivateReading): reading is Pick<Evaluation, 'ratings'> {
  if (!reading) return false;
  return REQUIRED_PILLARS.every((pillar) => isValidPillarRating(reading.ratings[pillar]));
}

export function hasCompletePrivateReadings(
  privateReadingA?: PrivateReading,
  privateReadingB?: PrivateReading,
): boolean {
  return hasCompletePrivateReading(privateReadingA) && hasCompletePrivateReading(privateReadingB);
}

export function canMutualizeRelationship(
  prerequisites: MutualizationPrerequisites,
): boolean {
  const identitiesResolved =
    prerequisites.sideAIdentityStatus === 'verified' &&
    prerequisites.sideBIdentityStatus === 'verified';

  if (!prerequisites.sideBExists) return false;
  if (!identitiesResolved) return false;
  return hasCompletePrivateReadings(prerequisites.privateReadingA, prerequisites.privateReadingB);
}

export function buildMutualRelationshipInput(
  prerequisites: MutualizationPrerequisites,
): MutualRelationshipInput | null {
  if (!canMutualizeRelationship(prerequisites)) return null;

  return {
    ratingsA: prerequisites.privateReadingA!.ratings,
    ratingsB: prerequisites.privateReadingB!.ratings,
  };
}
