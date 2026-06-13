import { describe, it, expect } from 'vitest';

import {
  getEligibleViaRelations,
  resolveViaRelationName,
} from './relation-via-helpers';
import type { Relation } from '../store/useRelationsStore';

// ── Test fixture builder ──────────────────────────────────────────────────────

function makeRelation(overrides: {
  id: string;
  name?: string;
  privateLabel?: string;
  avatarSeed?: string;
  archived?: boolean;
  revealed?: boolean;
  relationshipNameRevealed?: boolean;
  viaRelationId?: string | null;
}): Relation {
  return {
    id: overrides.id,
    name: overrides.name ?? overrides.id,
    privateLabel: overrides.privateLabel,
    avatarSeed: overrides.avatarSeed,
    archived: overrides.archived ?? false,
    createdAt: '2026-01-01T00:00:00.000Z',
    identityStatus: 'verified',
    source: 'manual',
    relationshipNameRevealed: overrides.relationshipNameRevealed,
    viaRelationId: overrides.viaRelationId ?? undefined,
    localState: {
      sideA: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      sideB: { exists: true, identityStatus: 'verified', hasPrivateReading: true },
      revealSnapshot: overrides.revealed
        ? { status: 'revealed', revealed: true, relationshipNameRevealed: true, mutualScore: 80 }
        : { status: 'waiting_other_side', revealed: false },
    },
  } as Relation;
}

// ── getEligibleViaRelations ───────────────────────────────────────────────────

describe('getEligibleViaRelations', () => {
  it('returns [] when no candidates exist', () => {
    const result = getEligibleViaRelations({ relations: [], targetRelationId: 'x' });
    expect(result).toEqual([]);
  });

  it('keeps revealed active relations and returns id+name+avatarSeed shape', () => {
    const yasmine = makeRelation({
      id: 'rel-yas',
      name: 'Yasmine',
      avatarSeed: 'Y',
      revealed: true,
    });
    const result = getEligibleViaRelations({
      relations: [yasmine],
      targetRelationId: 'rel-new',
    });
    expect(result).toEqual([{ id: 'rel-yas', name: 'Yasmine', avatarSeed: 'Y' }]);
  });

  it('excludes archived relations', () => {
    const yasmine = makeRelation({ id: 'rel-yas', name: 'Yasmine', revealed: true });
    const archived = makeRelation({
      id: 'rel-arc',
      name: 'Old Friend',
      revealed: true,
      archived: true,
    });
    const result = getEligibleViaRelations({
      relations: [yasmine, archived],
      targetRelationId: 'rel-new',
    });
    expect(result.map((r) => r.id)).toEqual(['rel-yas']);
  });

  it('excludes the target relation itself (no self-via)', () => {
    const yasmine = makeRelation({ id: 'rel-yas', name: 'Yasmine', revealed: true });
    const karim = makeRelation({ id: 'rel-kar', name: 'Karim', revealed: true });
    const result = getEligibleViaRelations({
      relations: [yasmine, karim],
      targetRelationId: 'rel-yas',
    });
    expect(result.map((r) => r.id)).toEqual(['rel-kar']);
  });

  it('excludes relations not yet revealed (status !== revealed AND no relationshipNameRevealed)', () => {
    const revealed = makeRelation({ id: 'rel-rev', name: 'Yasmine', revealed: true });
    const waiting = makeRelation({ id: 'rel-wait', name: 'Karim', revealed: false });
    const result = getEligibleViaRelations({
      relations: [revealed, waiting],
      targetRelationId: 'rel-new',
    });
    expect(result.map((r) => r.id)).toEqual(['rel-rev']);
  });

  it('accepts relationshipNameRevealed=true as alternative reveal signal', () => {
    // Some legacy paths surface relationshipNameRevealed at the Relation level
    // independently of the localState.revealSnapshot.status. The helper must
    // accept either signal so the picker shows the relation in both cases.
    const alt = makeRelation({
      id: 'rel-alt',
      name: 'Alt',
      revealed: false,
      relationshipNameRevealed: true,
    });
    const result = getEligibleViaRelations({
      relations: [alt],
      targetRelationId: 'rel-new',
    });
    expect(result.map((r) => r.id)).toEqual(['rel-alt']);
  });

  it('excludes a candidate whose own viaRelationId === target (simple 2-hop cycle guard)', () => {
    // Target = rel-target. Candidate = rel-yas, whose viaRelationId points
    // at rel-target. Declaring rel-target.viaRelationId = rel-yas would
    // create a loop: rel-target → rel-yas → rel-target.
    const yasmine = makeRelation({
      id: 'rel-yas',
      name: 'Yasmine',
      revealed: true,
      viaRelationId: 'rel-target',
    });
    const karim = makeRelation({ id: 'rel-kar', name: 'Karim', revealed: true });
    const result = getEligibleViaRelations({
      relations: [yasmine, karim],
      targetRelationId: 'rel-target',
    });
    expect(result.map((r) => r.id)).toEqual(['rel-kar']);
  });

  it('excludes relations without a usable name (defensive)', () => {
    const empty = makeRelation({ id: 'rel-empty', name: '   ', privateLabel: '', revealed: true });
    const yasmine = makeRelation({ id: 'rel-yas', name: 'Yasmine', revealed: true });
    const result = getEligibleViaRelations({
      relations: [empty, yasmine],
      targetRelationId: 'rel-new',
    });
    expect(result.map((r) => r.id)).toEqual(['rel-yas']);
  });

  it('prefers privateLabel over name when both exist', () => {
    const rel = makeRelation({
      id: 'rel-1',
      name: 'Yasmine Karoui',
      privateLabel: 'Yasmine',
      revealed: true,
    });
    const result = getEligibleViaRelations({
      relations: [rel],
      targetRelationId: 'rel-new',
    });
    expect(result[0].name).toBe('Yasmine');
  });

  it('returns a stable alphabetic sort by displayed name', () => {
    const c = makeRelation({ id: 'rel-c', name: 'Camille', revealed: true });
    const a = makeRelation({ id: 'rel-a', name: 'Alex', revealed: true });
    const b = makeRelation({ id: 'rel-b', name: 'Bob', revealed: true });
    const result = getEligibleViaRelations({
      relations: [c, a, b],
      targetRelationId: 'rel-new',
    });
    expect(result.map((r) => r.name)).toEqual(['Alex', 'Bob', 'Camille']);
  });

  it('without targetRelationId, applies no target-based exclusion', () => {
    const yasmine = makeRelation({
      id: 'rel-yas',
      name: 'Yasmine',
      revealed: true,
      viaRelationId: 'rel-other',
    });
    const result = getEligibleViaRelations({ relations: [yasmine] });
    expect(result.map((r) => r.id)).toEqual(['rel-yas']);
  });
});

// ── resolveViaRelationName ────────────────────────────────────────────────────

describe('resolveViaRelationName', () => {
  it('returns null when viaRelationId is null/undefined', () => {
    expect(resolveViaRelationName(null, [])).toBeNull();
    expect(resolveViaRelationName(undefined, [])).toBeNull();
  });

  it('returns null when the relation cannot be found', () => {
    const yasmine = makeRelation({ id: 'rel-yas', name: 'Yasmine', revealed: true });
    expect(resolveViaRelationName('rel-missing', [yasmine])).toBeNull();
  });

  it('returns null when the via relation is archived', () => {
    const archived = makeRelation({
      id: 'rel-arc',
      name: 'Old',
      revealed: true,
      archived: true,
    });
    expect(resolveViaRelationName('rel-arc', [archived])).toBeNull();
  });

  it('returns null when the via relation has no usable name', () => {
    const empty = makeRelation({ id: 'rel-empty', name: '', privateLabel: '', revealed: true });
    expect(resolveViaRelationName('rel-empty', [empty])).toBeNull();
  });

  it('returns id+name when the via relation is valid', () => {
    const yasmine = makeRelation({ id: 'rel-yas', name: 'Yasmine', revealed: true });
    expect(resolveViaRelationName('rel-yas', [yasmine])).toEqual({
      id: 'rel-yas',
      name: 'Yasmine',
    });
  });

  it('prefers privateLabel over name', () => {
    const rel = makeRelation({
      id: 'rel-1',
      name: 'Full Name',
      privateLabel: 'Nick',
      revealed: true,
    });
    expect(resolveViaRelationName('rel-1', [rel])).toEqual({ id: 'rel-1', name: 'Nick' });
  });
});
