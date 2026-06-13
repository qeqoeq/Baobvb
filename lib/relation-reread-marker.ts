// Pure helpers for the private time-mark feature (Sprint W.1).
// The mark is a local-only, user-chosen ISO date pinned on a single relation
// to invite a future return. It is never persisted to the backend, never
// shared with the other side, never displayed in Garden/World, never sent
// as a notification. The doctrine is observation through time, not pressure.

export type RereadMarkerState =
  | { kind: 'unset' }
  | { kind: 'marked'; isoDate: string; humanLabel: string }
  | { kind: 'ready'; isoDate: string; humanLabel: string };

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Adds `days` to a base ISO date and returns the resulting ISO string.
 *
 * Implementation note: the calendar arithmetic uses calendar-day deltas
 * (24h × days). For W.1 presets (30/60/90), this is exact enough; DST and
 * leap-second edge cases are deliberately ignored to keep the helper
 * dependency-free and trivially testable.
 */
export function addDays(baseIso: string, days: number): string {
  const baseMs = Date.parse(baseIso);
  if (!Number.isFinite(baseMs)) {
    throw new Error('addDays: base date is not a valid ISO string');
  }
  if (!Number.isFinite(days)) {
    throw new Error('addDays: days must be a finite number');
  }
  return new Date(baseMs + days * MS_PER_DAY).toISOString();
}

/**
 * Formats an ISO date for human display in the re-read marker block.
 * Example: '2026-09-13T12:00:00.000Z' → 'September 13, 2026'.
 *
 * Uses `Intl.DateTimeFormat` with `en-US` and UTC to guarantee a stable
 * output independent of the device locale or timezone (so the displayed
 * label matches what the user picked at preset time, regardless of where
 * they open the app later).
 */
export function formatRereadDate(isoDate: string): string {
  const ms = Date.parse(isoDate);
  if (!Number.isFinite(ms)) return '';
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(ms));
}

/**
 * Returns the current display state of the marker.
 *
 * Inputs:
 *   - markedForIso: the persisted ISO string on the relation, or null/undefined.
 *   - nowIso: the current time in ISO. Injected (not derived inside the
 *     helper) so the state is deterministic and testable.
 *
 * States:
 *   - unset : no mark has been placed, or the stored value is unusable.
 *   - marked: a future date is on file → invite to "Return around DATE".
 *   - ready : the mark date is today or past → invite to "Read again".
 */
export function getRereadMarkerState(
  markedForIso: string | null | undefined,
  nowIso: string,
): RereadMarkerState {
  if (typeof markedForIso !== 'string' || markedForIso.length === 0) {
    return { kind: 'unset' };
  }
  const markedMs = Date.parse(markedForIso);
  if (!Number.isFinite(markedMs)) {
    return { kind: 'unset' };
  }
  const nowMs = Date.parse(nowIso);
  if (!Number.isFinite(nowMs)) {
    // Defensive: a malformed nowIso must not crash the renderer. Fall back to
    // 'marked' rather than 'ready' so the marker behaves like a future date
    // (no pressure to act) until the caller passes a usable now.
    const humanLabel = formatRereadDate(markedForIso);
    return { kind: 'marked', isoDate: markedForIso, humanLabel };
  }
  const humanLabel = formatRereadDate(markedForIso);
  return markedMs <= nowMs
    ? { kind: 'ready', isoDate: markedForIso, humanLabel }
    : { kind: 'marked', isoDate: markedForIso, humanLabel };
}
