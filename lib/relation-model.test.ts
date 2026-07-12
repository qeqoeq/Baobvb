import { describe, it, expect } from 'vitest';

import {
  getNormalizedPrivateLabel,
  PENDING_INVITE_LABEL,
  SHARED_RELATION_PLACEHOLDER,
} from './relation-model';
import type { Relation } from '../store/useRelationsStore';

function rel(over: Partial<Relation>): Relation {
  return { name: 'X', ...over } as unknown as Relation;
}

// ── getNormalizedPrivateLabel — cascade + B21 placeholder handling ────────────

describe('getNormalizedPrivateLabel', () => {
  it('C1: user override (privateLabel) wins over everything', () => {
    expect(
      getNormalizedPrivateLabel(rel({
        name: '(shared)',
        privateLabel: 'Coloc',
        counterpartDisplayName: 'Alice',
        handle: '@alice',
      })),
    ).toBe('Coloc');
  });

  it('C2: counterpartDisplayName wins over name/handle when no override', () => {
    expect(
      getNormalizedPrivateLabel(rel({
        name: '(shared)',
        counterpartDisplayName: 'Alice',
        handle: '@alice',
      })),
    ).toBe('Alice');
  });

  it('C3: a real local name is returned as-is (manual/scan)', () => {
    expect(getNormalizedPrivateLabel(rel({ name: 'Bob' }))).toBe('Bob');
  });

  // ── B21: never surface the '(shared)' placeholder ──────────────────────────

  it('B21-1: placeholder + counterpart handle → the handle', () => {
    expect(
      getNormalizedPrivateLabel(rel({ name: SHARED_RELATION_PLACEHOLDER, handle: '@iphonebb' })),
    ).toBe('@iphonebb');
  });

  it('B21-2: placeholder + no handle → explicit pending label, never "(shared)"', () => {
    const label = getNormalizedPrivateLabel(rel({ name: SHARED_RELATION_PLACEHOLDER }));
    expect(label).toBe(PENDING_INVITE_LABEL);
    expect(label).not.toBe(SHARED_RELATION_PLACEHOLDER);
  });

  it('B21-3: placeholder + blank/whitespace handle → pending label', () => {
    expect(
      getNormalizedPrivateLabel(rel({ name: SHARED_RELATION_PLACEHOLDER, handle: '   ' })),
    ).toBe(PENDING_INVITE_LABEL);
  });

  it('B21-4: placeholder but counterpartDisplayName present → name wins, no fallback', () => {
    expect(
      getNormalizedPrivateLabel(rel({
        name: SHARED_RELATION_PLACEHOLDER,
        counterpartDisplayName: 'Alice',
        handle: '@alice',
      })),
    ).toBe('Alice');
  });
});
