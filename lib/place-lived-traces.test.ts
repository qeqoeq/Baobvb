import { describe, expect, it } from 'vitest';

import { deriveLivedPlaceTraces } from './place-lived-traces';
import type { Place, PlaceReadEntry } from '@/store/useRelationsStore';

function place(overrides: Partial<Place> = {}): Place {
  return {
    id: 'p1',
    name: 'Test Place',
    category: 'cafe',
    personalFit: 'kept',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function read(overrides: Partial<PlaceReadEntry> = {}): PlaceReadEntry {
  return {
    id: 'r1',
    createdAt: '2026-03-01T00:00:00Z',
    categorySnapshot: 'cafe',
    criteriaVersion: 1,
    ...overrides,
  };
}

// ── personalFit traces ───────────────────────────────────────────────────────

describe('deriveLivedPlaceTraces — personalFit', () => {
  it('T1: kept → includes Kept', () => {
    const result = deriveLivedPlaceTraces(place({ personalFit: 'kept' }));
    expect(result).toContain('Gardé');
  });

  it('T2: not_for_me → no Kept', () => {
    const result = deriveLivedPlaceTraces(place({ personalFit: 'not_for_me' }));
    expect(result).not.toContain('Gardé');
  });

  it('T3: tried → no Kept', () => {
    const result = deriveLivedPlaceTraces(place({ personalFit: 'tried' }));
    expect(result).not.toContain('Gardé');
  });
});

// ── wentAgainAt traces ───────────────────────────────────────────────────────

describe('deriveLivedPlaceTraces — wentAgainAt', () => {
  it('T4: wentAgainAt set → includes Came back', () => {
    const result = deriveLivedPlaceTraces(
      place({ wentAgainAt: '2026-04-01T00:00:00Z' }),
    );
    expect(result).toContain('Retour');
  });

  it('T5: wentAgainAt undefined → no Came back', () => {
    const result = deriveLivedPlaceTraces(place({ wentAgainAt: undefined }));
    expect(result).not.toContain('Retour');
  });
});

// ── contextFit — legacy path (no reads) ─────────────────────────────────────

describe('deriveLivedPlaceTraces — legacy quickSignal contextFit', () => {
  it('T6: no reads, quickSignal.contextFit = [friends] → Friends', () => {
    const result = deriveLivedPlaceTraces(
      place({
        reads: undefined,
        quickSignal: { contextFit: ['friends'] },
      }),
    );
    expect(result).toContain('Amis');
  });

  it('T7: no reads, no quickSignal → no context trace', () => {
    const result = deriveLivedPlaceTraces(
      place({ reads: undefined, quickSignal: undefined }),
    );
    expect(result.some((t) => t.includes('Amis') || t.includes('Rendez-vous'))).toBe(false);
  });

  it('T8: empty reads array, quickSignal.contextFit = [calm] → Calm (legacy fallback)', () => {
    const result = deriveLivedPlaceTraces(
      place({
        reads: [],
        quickSignal: { contextFit: ['calm'] },
      }),
    );
    expect(result).toContain('Calme');
  });
});

// ── contextFit — reads[] path ────────────────────────────────────────────────

describe('deriveLivedPlaceTraces — reads[] contextFit', () => {
  it('T9: 1 read with contextFit [date], no legacy quickSignal → Date', () => {
    const result = deriveLivedPlaceTraces(
      place({
        reads: [read({ contextFit: ['date'] })],
        quickSignal: undefined,
      }),
    );
    expect(result).toContain('Rendez-vous');
  });

  it('T10: 1 read with contextFit [date], legacy quickSignal.contextFit [friends] → uses read (Date), not legacy (Friends)', () => {
    const result = deriveLivedPlaceTraces(
      place({
        reads: [read({ contextFit: ['date'] })],
        quickSignal: { contextFit: ['friends'] },
      }),
    );
    expect(result).toContain('Rendez-vous');
    expect(result).not.toContain('Amis');
  });

  it('T11: 1 read with no contextFit, legacy quickSignal.contextFit [friends] → falls back to legacy', () => {
    const result = deriveLivedPlaceTraces(
      place({
        reads: [read({ contextFit: undefined })],
        quickSignal: { contextFit: ['friends'] },
      }),
    );
    expect(result).toContain('Amis');
  });

  it('T12: 2 reads, latest has [calm], first has [friends] → uses latest (Calm)', () => {
    const result = deriveLivedPlaceTraces(
      place({
        reads: [
          read({ id: 'r1', contextFit: ['friends'] }),
          read({ id: 'r2', contextFit: ['calm'] }),
        ],
        quickSignal: undefined,
      }),
    );
    expect(result).toContain('Calme');
    expect(result).not.toContain('Amis');
  });

  it('T13: multi-context on latest read → joined with ·', () => {
    const result = deriveLivedPlaceTraces(
      place({
        reads: [read({ contextFit: ['friends', 'deep_talk'] })],
        quickSignal: undefined,
      }),
    );
    expect(result).toContain('Amis · Vraie conversation');
  });
});

// ── combined traces ──────────────────────────────────────────────────────────

describe('deriveLivedPlaceTraces — combined output', () => {
  it('T14: kept + wentAgainAt + read contextFit → three separate traces', () => {
    const result = deriveLivedPlaceTraces(
      place({
        personalFit: 'kept',
        wentAgainAt: '2026-05-01T00:00:00Z',
        reads: [read({ contextFit: ['work_focus'] })],
        quickSignal: undefined,
      }),
    );
    expect(result).toContain('Gardé');
    expect(result).toContain('Retour');
    expect(result).toContain('Travail / concentration');
    expect(result).toHaveLength(3);
  });

  it('T15: no signals at all → empty array', () => {
    const result = deriveLivedPlaceTraces(
      place({
        personalFit: 'saved',
        wentAgainAt: undefined,
        reads: undefined,
        quickSignal: undefined,
      }),
    );
    expect(result).toHaveLength(0);
  });
});
