import { PLACE_CONTEXT_FIT_LABELS } from './places';
import type { Place } from '@/store/useRelationsStore';

/**
 * Derives concise lived traces from a place's local signals.
 * Reads contextFit from reads[] (latest read) when present,
 * falling back to the legacy quickSignal for places that predate reads[].
 *
 * Used only in the 0-reads display path — never shown alongside
 * the Memory Stack (2+ reads) or Latest Read (1 read) sections.
 */
export function deriveLivedPlaceTraces(place: Place): string[] {
  const traces: string[] = [];

  if (place.personalFit === 'kept') traces.push('Gardé');
  if (place.wentAgainAt !== undefined) traces.push('Retour');

  const reads = place.reads ?? [];
  const latestRead = reads.length > 0 ? reads[reads.length - 1] : undefined;
  const readsContextFit = latestRead?.contextFit ?? [];
  const contextFit =
    readsContextFit.length > 0
      ? readsContextFit
      : (place.quickSignal?.contextFit ?? []);

  if (contextFit.length > 0) {
    traces.push(
      contextFit
        .map((ctx) => PLACE_CONTEXT_FIT_LABELS[ctx])
        .filter(Boolean)
        .join(' · '),
    );
  }

  return traces.filter(Boolean);
}
