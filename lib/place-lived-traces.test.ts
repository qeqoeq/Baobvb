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
    expect(result).toContain('Kept');
  });

  it('T2: not_for_me → no Kept', () => {
    const result = deriveLivedPlaceTraces(place({ personalFit: 'not_for_me' }));
    expect(result).not.toContain('Kept');
  });

  it('T3: tried → no Kept', () => {
    const result = deriveLivedPlaceTraces(place({ personalFit: 'tried' }));
    expect(result).not.toContain('Kept');
  });
});

// ── wentAgainAt traces ───────────────────────────────────────────────────────

describe('deriveLivedPlaceTraces — wentAgainAt', () => {
  it('T4: wentAgainAt set → includes Came back', () => {
    const result = deriveLivedPlaceTraces(
      place({ wentAgainAt: '2026-04-01T00:00:00Z' }),
    );
    expect(result).toContain('Came back');
  });

  it('T5: wentAgainAt undefined → no Came back', () => {
    const result = deriveLivedPlaceTraces(place({ wentAgainAt: undefined }));
    expect(result).not.toContain('Came back');
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
    expect(result).toContain('Friends');
  });

  it('T7: no reads, no quickSignal → no context trace', () => {
    const result = deriveLivedPlaceTraces(
      place({ reads: undefined, quickSignal: undefined }),
    );
    expect(result.some((t) => t.includes('Friends') || t.includes('Date'))).toBe(false);
  });

  it('T8: empty reads array, quickSignal.contextFit = [calm] → Calm (legacy fallback)', () => {
    const result = deriveLivedPlaceTraces(
      place({
        reads: [],
        quickSignal: { contextFit: ['calm'] },
      }),
    );
    expect(result).toContain('Calm');
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
    expect(result).toContain('Date');
  });

  it('T10: 1 read with contextFit [date], legacy quickSignal.contextFit [friends] → uses read (Date), not legacy (Friends)', () => {
    const result = deriveLivedPlaceTraces(
      place({
        reads: [read({ contextFit: ['date'] })],
        quickSignal: { contextFit: ['friends'] },
      }),
    );
    expect(result).toContain('Date');
    expect(result).not.toContain('Friends');
  });

  it('T11: 1 read with no contextFit, legacy quickSignal.contextFit [friends] → falls back to legacy', () => {
    const result = deriveLivedPlaceTraces(
      place({
        reads: [read({ contextFit: undefined })],
        quickSignal: { contextFit: ['friends'] },
      }),
    );
    expect(result).toContain('Friends');
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
    expect(result).toContain('Calm');
    expect(result).not.toContain('Friends');
  });

  it('T13: multi-context on latest read → joined with ·', () => {
    const result = deriveLivedPlaceTraces(
      place({
        reads: [read({ contextFit: ['friends', 'deep_talk'] })],
        quickSignal: undefined,
      }),
    );
    expect(result).toContain('Friends · Deep talk');
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
    expect(result).toContain('Kept');
    expect(result).toContain('Came back');
    expect(result).toContain('Work / focus');
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
