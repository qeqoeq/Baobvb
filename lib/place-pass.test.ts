import { describe, it, expect } from 'vitest';

import { getPassSectionState, formatPassButtonLabel } from './place-pass';
import { getNormalizedPrivateLabel } from './relation-model';
import type { Relation } from '../store/useRelationsStore';

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

// ── formatPassButtonLabel — B24 picker shows the cascade name, not '(shared)' ──

describe('formatPassButtonLabel', () => {
  it('B1: no selection → "Pass to…"', () => {
    expect(formatPassButtonLabel(null)).toBe('Pass to…');
  });

  it('B2: a name → "Pass to <name>"', () => {
    expect(formatPassButtonLabel('iPhoneBB')).toBe('Pass to iPhoneBB');
  });

  it('B3: the picker resolves the cascade name for a "Private link" relation', () => {
    // A claimed relation with the "Private link" placeholder but a known
    // counterpart name must show the counterpart, never the placeholder.
    const relation = {
      name: 'Private link',
      counterpartDisplayName: 'iPhoneBB',
    } as unknown as Relation;
    const label = getNormalizedPrivateLabel(relation);
    expect(label).toBe('iPhoneBB');
    expect(formatPassButtonLabel(label)).toBe('Pass to iPhoneBB');
  });
});
