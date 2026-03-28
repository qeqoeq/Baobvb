import { describe, it, expect } from 'vitest';

import { getRelationshipDisplayState } from './relationship-state';

// Minimal shape builder for getRelationshipDisplayState.
// Mirrors the production call site in relationship-reveal.ts.
// Type-asserted because Relation['localState'] carries additional required
// fields irrelevant to these tests.
type Input = Parameters<typeof getRelationshipDisplayState>[0];

function makeInput(opts: {
  revealStatus?: 'waiting_other_side' | 'cooking_reveal' | 'reveal_ready' | 'revealed';
  revealedFlag?: boolean;       // revealSnapshot.revealed
  relationExists?: boolean;     // null relation = unresolved_invite fast path
  sideAIdentity?: 'missing' | 'draft' | 'verified';
  sideAHasReading?: boolean;
  sideBExists?: boolean;
  sideBIdentity?: 'missing' | 'draft' | 'verified';
  sideBHasReading?: boolean;
}): Input {
  const relationExists = opts.relationExists ?? true;
  const revealStatus = opts.revealStatus ?? 'waiting_other_side';
  const revealedFlag = opts.revealedFlag ?? false;

  return {
    relation: relationExists
      ? {
          identityStatus: 'verified',
          relationshipNameRevealed: revealedFlag,
          localState: {
            sideA: {
              exists: true,
              identityStatus: opts.sideAIdentity ?? 'verified',
              hasPrivateReading: opts.sideAHasReading ?? false,
            },
            sideB: {
              exists: opts.sideBExists ?? false,
              identityStatus: opts.sideBIdentity ?? 'missing',
              hasPrivateReading: opts.sideBHasReading ?? false,
            },
            revealSnapshot: {
              status: revealStatus,
              revealed: revealedFlag,
              relationshipNameRevealed: revealedFlag,
            },
          },
        }
      : null,
    sideBExists: opts.sideBExists ?? false,
    sideBIdentityStatus: opts.sideBIdentity ?? 'missing',
  } as Input;
}

// ── getRelationshipDisplayState — all 9 branches ───────────────────────────
// Priority order mirrors the implementation:
// revealed > reveal_ready > cooking_reveal(explicit) > unresolved_invite >
// draft > private_reading_pending > waiting_other_side(2 sub-cases) > cooking_reveal(fallback)

describe('getRelationshipDisplayState', () => {
  it('mutually_revealed: revealSnapshot.revealed = true', () => {
    const result = getRelationshipDisplayState(
      makeInput({ revealStatus: 'revealed', revealedFlag: true }),
    );
    expect(result).toBe('mutually_revealed');
  });

  it('reveal_ready: status is reveal_ready and not yet revealed', () => {
    const result = getRelationshipDisplayState(
      makeInput({ revealStatus: 'reveal_ready' }),
    );
    expect(result).toBe('reveal_ready');
  });

  it('cooking_reveal: explicit status cooking_reveal, both sides read', () => {
    const result = getRelationshipDisplayState(
      makeInput({
        revealStatus: 'cooking_reveal',
        sideAHasReading: true,
        sideBExists: true,
        sideBHasReading: true,
        sideBIdentity: 'verified',
      }),
    );
    expect(result).toBe('cooking_reveal');
  });

  it('unresolved_invite: relation is null (no local relation found)', () => {
    const result = getRelationshipDisplayState(makeInput({ relationExists: false }));
    expect(result).toBe('unresolved_invite');
  });

  it('draft: sideA has no reading and identity is draft', () => {
    const result = getRelationshipDisplayState(
      makeInput({ sideAIdentity: 'draft', sideAHasReading: false }),
    );
    expect(result).toBe('draft');
  });

  it('private_reading_pending: sideA has no reading and identity is verified', () => {
    const result = getRelationshipDisplayState(
      makeInput({ sideAIdentity: 'verified', sideAHasReading: false }),
    );
    expect(result).toBe('private_reading_pending');
  });

  it('private_reading_saved_waiting_other_side: sideA read, sideB does not exist', () => {
    const result = getRelationshipDisplayState(
      makeInput({ sideAHasReading: true, sideBExists: false }),
    );
    expect(result).toBe('private_reading_saved_waiting_other_side');
  });

  it('private_reading_saved_waiting_other_side: sideA read, sideB exists but has no reading', () => {
    const result = getRelationshipDisplayState(
      makeInput({
        sideAHasReading: true,
        sideBExists: true,
        sideBIdentity: 'verified',
        sideBHasReading: false,
      }),
    );
    expect(result).toBe('private_reading_saved_waiting_other_side');
  });

  it('cooking_reveal (fallback): both sides have readings, no explicit status set', () => {
    // No explicit cooking_reveal status — falls through all branches to the final return.
    const result = getRelationshipDisplayState(
      makeInput({
        revealStatus: 'waiting_other_side', // not cooking_reveal or reveal_ready
        sideAHasReading: true,
        sideBExists: true,
        sideBIdentity: 'verified',
        sideBHasReading: true,
      }),
    );
    expect(result).toBe('cooking_reveal');
  });

  it('priority: revealed beats reveal_ready status', () => {
    // If revealSnapshot.revealed = true, it should return mutually_revealed
    // even when status field says reveal_ready.
    const result = getRelationshipDisplayState(
      makeInput({ revealStatus: 'reveal_ready', revealedFlag: true }),
    );
    expect(result).toBe('mutually_revealed');
  });
});
