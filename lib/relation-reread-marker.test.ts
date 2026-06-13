import { describe, it, expect } from 'vitest';

import {
  addDays,
  formatRereadDate,
  getRereadMarkerState,
} from './relation-reread-marker';

// A fixed base date used across the suite — noon UTC to keep arithmetic
// independent of local timezone and DST transitions.
const BASE = '2026-06-13T12:00:00.000Z';

// ── addDays ──────────────────────────────────────────────────────────────────

describe('addDays', () => {
  it('adds 30 calendar days deterministically (noon UTC base)', () => {
    expect(addDays(BASE, 30)).toBe('2026-07-13T12:00:00.000Z');
  });

  it('adds 60 calendar days deterministically', () => {
    expect(addDays(BASE, 60)).toBe('2026-08-12T12:00:00.000Z');
  });

  it('adds 90 calendar days deterministically', () => {
    expect(addDays(BASE, 90)).toBe('2026-09-11T12:00:00.000Z');
  });

  it('throws on invalid base date', () => {
    expect(() => addDays('not-a-date', 30)).toThrow();
  });

  it('throws on non-finite days', () => {
    expect(() => addDays(BASE, Number.NaN)).toThrow();
    expect(() => addDays(BASE, Number.POSITIVE_INFINITY)).toThrow();
  });

  it('supports zero days (no-op semantic)', () => {
    expect(addDays(BASE, 0)).toBe(BASE);
  });
});

// ── formatRereadDate ─────────────────────────────────────────────────────────

describe('formatRereadDate', () => {
  it('formats a stable readable label in en-US / UTC', () => {
    expect(formatRereadDate('2026-09-13T12:00:00.000Z')).toBe('September 13, 2026');
  });

  it('formats month boundary correctly', () => {
    expect(formatRereadDate('2026-07-31T12:00:00.000Z')).toBe('July 31, 2026');
  });

  it('returns empty string on invalid input (defensive, never crashes)', () => {
    expect(formatRereadDate('not-a-date')).toBe('');
    expect(formatRereadDate('')).toBe('');
  });
});

// ── getRereadMarkerState ─────────────────────────────────────────────────────

describe('getRereadMarkerState', () => {
  it('null marker → unset', () => {
    const result = getRereadMarkerState(null, BASE);
    expect(result.kind).toBe('unset');
  });

  it('undefined marker → unset', () => {
    const result = getRereadMarkerState(undefined, BASE);
    expect(result.kind).toBe('unset');
  });

  it('empty string marker → unset', () => {
    const result = getRereadMarkerState('', BASE);
    expect(result.kind).toBe('unset');
  });

  it('invalid date marker → unset (defensive)', () => {
    const result = getRereadMarkerState('not-a-date', BASE);
    expect(result.kind).toBe('unset');
  });

  it('future date → marked with humanLabel', () => {
    const future = '2026-09-13T12:00:00.000Z';
    const result = getRereadMarkerState(future, BASE);
    expect(result.kind).toBe('marked');
    if (result.kind === 'marked') {
      expect(result.isoDate).toBe(future);
      expect(result.humanLabel).toBe('September 13, 2026');
    }
  });

  it('today (same instant) → ready', () => {
    const result = getRereadMarkerState(BASE, BASE);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.isoDate).toBe(BASE);
      expect(result.humanLabel).toBe('June 13, 2026');
    }
  });

  it('past date → ready', () => {
    const past = '2026-05-01T12:00:00.000Z';
    const result = getRereadMarkerState(past, BASE);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.isoDate).toBe(past);
      expect(result.humanLabel).toBe('May 1, 2026');
    }
  });

  it('integrates with addDays: marker at +30d from BASE → marked', () => {
    const futurePreset = addDays(BASE, 30);
    const result = getRereadMarkerState(futurePreset, BASE);
    expect(result.kind).toBe('marked');
    if (result.kind === 'marked') {
      expect(result.humanLabel).toBe('July 13, 2026');
    }
  });

  it('integrates with addDays: marker at +90d, now at +120d → ready', () => {
    const marker = addDays(BASE, 90);
    const now = addDays(BASE, 120);
    const result = getRereadMarkerState(marker, now);
    expect(result.kind).toBe('ready');
    if (result.kind === 'ready') {
      expect(result.isoDate).toBe(marker);
    }
  });

  it('malformed nowIso → falls back to marked (no crash, no false ready)', () => {
    const future = '2026-09-13T12:00:00.000Z';
    const result = getRereadMarkerState(future, 'not-a-date');
    // Defensive contract: a broken now must not pressure the user into a
    // false "ready" state. The marker behaves as a future date until the
    // caller passes a usable now.
    expect(result.kind).toBe('marked');
  });

  it('round-trip: clearing a marker is equivalent to setting null', () => {
    const future = '2026-09-13T12:00:00.000Z';
    expect(getRereadMarkerState(future, BASE).kind).toBe('marked');
    expect(getRereadMarkerState(null, BASE).kind).toBe('unset');
  });
});
