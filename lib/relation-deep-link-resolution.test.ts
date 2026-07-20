import { describe, it, expect } from 'vitest';

import {
  findRelationByDeepLinkId,
  resolveDeepLinkPhase,
} from './relation-deep-link-resolution';

const CANON = 'c41ab40b-6d3a-4003-8c81-15633391eb6e';
const rels = [
  { id: 'r-100', canonicalRelationId: CANON },
  { id: 'r-200', canonicalRelationId: null },
  { id: 'r-300', canonicalRelationId: 'other-canon' },
];

describe('findRelationByDeepLinkId', () => {
  it('D1: resolves a notification deep link by canonical UUID', () => {
    // The reveal-ready push carries the canonical id — the real Sou-session case.
    expect(findRelationByDeepLinkId(rels, CANON)?.id).toBe('r-100');
  });

  it('D2: still resolves by local id', () => {
    expect(findRelationByDeepLinkId(rels, 'r-200')?.id).toBe('r-200');
  });

  it('D3: unknown id → null (not a wrong match)', () => {
    expect(findRelationByDeepLinkId(rels, 'nope')).toBeNull();
  });

  it('D4: trims whitespace and ignores empty/undefined', () => {
    expect(findRelationByDeepLinkId(rels, `  ${CANON}  `)?.id).toBe('r-100');
    expect(findRelationByDeepLinkId(rels, '   ')).toBeNull();
    expect(findRelationByDeepLinkId(rels, undefined)).toBeNull();
    expect(findRelationByDeepLinkId(rels, null)).toBeNull();
  });

  it('D5: empty-string canonicalRelationId never matches an empty target', () => {
    const withEmpty = [{ id: 'r-1', canonicalRelationId: '' }];
    expect(findRelationByDeepLinkId(withEmpty, '')).toBeNull();
  });
});

describe('resolveDeepLinkPhase', () => {
  it('P1: found → resolved', () => {
    expect(
      resolveDeepLinkPhase({ hasId: true, relationFound: true, graceExhausted: false }),
    ).toBe('resolved');
  });

  it('P2: not found within grace → resolving (never an immediate hard error)', () => {
    expect(
      resolveDeepLinkPhase({ hasId: true, relationFound: false, graceExhausted: false }),
    ).toBe('resolving');
  });

  it('P3: not found after grace exhausted → unavailable (last resort)', () => {
    expect(
      resolveDeepLinkPhase({ hasId: true, relationFound: false, graceExhausted: true }),
    ).toBe('unavailable');
  });

  it('P4: no id → unavailable (nothing to wait for)', () => {
    expect(
      resolveDeepLinkPhase({ hasId: false, relationFound: false, graceExhausted: false }),
    ).toBe('unavailable');
  });

  it('P5: a found relation wins even if grace somehow exhausted', () => {
    expect(
      resolveDeepLinkPhase({ hasId: true, relationFound: true, graceExhausted: true }),
    ).toBe('resolved');
  });
});
