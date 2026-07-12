import { describe, it, expect } from 'vitest';

import { getPassSectionState } from './place-pass';

// ── getPassSectionState — B22 pass affordance never disappears silently ────────

describe('getPassSectionState', () => {
  it('P1: kept + eligible → cta', () => {
    expect(getPassSectionState('kept', 2)).toBe('cta');
  });

  it('P2: tried + eligible → cta', () => {
    expect(getPassSectionState('tried', 1)).toBe('cta');
  });

  it('P3: kept + NO eligible → empty (explicit state, not hidden)', () => {
    expect(getPassSectionState('kept', 0)).toBe('empty');
  });

  it('P4: tried + NO eligible → empty', () => {
    expect(getPassSectionState('tried', 0)).toBe('empty');
  });

  it('P5: not a passable personalFit → hidden regardless of eligibility', () => {
    expect(getPassSectionState('saved', 3)).toBe('hidden');
    expect(getPassSectionState('not_for_me', 3)).toBe('hidden');
  });
});
