import { describe, it, expect } from 'vitest';

import { isRevealedNetworkMember, isLexiconDiscoverable } from './relation-visibility';
import type { Relation } from '../store/useRelationsStore';

// Minimal relation shape for the predicates (only the fields they read).
function makeRelation(over: {
  archived?: boolean;
  status?: string;
  firstViewedAt?: string;
  relationshipNameRevealed?: boolean;
}): Relation {
  return {
    archived: over.archived ?? false,
    relationshipNameRevealed: over.relationshipNameRevealed ?? true,
    localState: {
      revealSnapshot: {
        status: (over.status ?? 'revealed') as never,
        revealed: (over.status ?? 'revealed') === 'revealed',
        ...(over.firstViewedAt !== undefined ? { firstViewedAt: over.firstViewedAt } : {}),
      },
    },
  } as unknown as Relation;
}

// ── isRevealedNetworkMember — B20 canvas/counter/gateway visibility ────────────

describe('isRevealedNetworkMember', () => {
  it('N1: revealed + not archived → true', () => {
    expect(isRevealedNetworkMember(makeRelation({ status: 'revealed', archived: false }))).toBe(true);
  });

  it('N2: revealed + ARCHIVED → false (the B20 leak)', () => {
    expect(isRevealedNetworkMember(makeRelation({ status: 'revealed', archived: true }))).toBe(false);
  });

  it('N3: not revealed + not archived → false', () => {
    expect(isRevealedNetworkMember(makeRelation({ status: 'waiting_other_side', archived: false }))).toBe(false);
  });

  it('N4: not revealed + archived → false', () => {
    expect(isRevealedNetworkMember(makeRelation({ status: 'cooking_reveal', archived: true }))).toBe(false);
  });

  it('N5: counting a mixed set excludes archived (counter is correct)', () => {
    const set = [
      makeRelation({ status: 'revealed', archived: false }),
      makeRelation({ status: 'revealed', archived: true }),  // archived ghost
      makeRelation({ status: 'revealed', archived: false }),
      makeRelation({ status: 'waiting_other_side', archived: false }),
    ];
    expect(set.filter(isRevealedNetworkMember).length).toBe(2);
  });
});

// ── isLexiconDiscoverable — B20 lexicon contribution ──────────────────────────

describe('isLexiconDiscoverable', () => {
  it('L1: name revealed + firstViewedAt + not archived → true', () => {
    expect(
      isLexiconDiscoverable(
        makeRelation({ relationshipNameRevealed: true, firstViewedAt: '2026-07-01T00:00:00Z', archived: false }),
      ),
    ).toBe(true);
  });

  it('L2: same but ARCHIVED → false', () => {
    expect(
      isLexiconDiscoverable(
        makeRelation({ relationshipNameRevealed: true, firstViewedAt: '2026-07-01T00:00:00Z', archived: true }),
      ),
    ).toBe(false);
  });

  it('L3: name revealed but never opened (no firstViewedAt) → false', () => {
    expect(
      isLexiconDiscoverable(makeRelation({ relationshipNameRevealed: true, archived: false })),
    ).toBe(false);
  });
});
