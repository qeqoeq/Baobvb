import { fetchMySharedRelationships } from './bootstrap-shared-relations';
import { fetchPassDeliveries } from './pass-delivery-repo';
import {
  materializePassDeliveries,
  upsertBootstrappedSharedRelations,
} from '../store/useRelationsStore';

/**
 * B26 — Lightweight foreground re-sync of shared relations + pass deliveries.
 *
 * The one-shot bootstrap in app/_layout.tsx runs once per authenticated session
 * (guarded by bootstrappedForUserIdRef) and only re-runs on a full app relaunch.
 * A user who never kills the app therefore sees frozen local state — statuses
 * (waiting → revealed), counterpart names, and counters stay stale even after the
 * server has advanced. This primitive is the re-entrant refresh the bootstrap ref
 * blocks: it is safe to call repeatedly.
 *
 * Safety by construction (no new invariants introduced):
 *   - upsertBootstrappedSharedRelations dedups by canonicalRelationId and, via
 *     mergeBootstrappedRevealSnapshot, ONLY adopts a strictly-more-advanced server
 *     status — never downgrades a local `revealed`, and preserves firstViewedAt /
 *     mutualScore / tier (B10 Fix A, B22).
 *   - NO reconcileOrphanedSharedRelations here (arbitration A, 2026-07-20):
 *     orphan reconciliation — which ARCHIVES relations absent from the server
 *     response — stays at cold-start only, where a resolved non-empty response is
 *     guaranteed. A foreground re-sync on a flaky network must never archive.
 *   - Network failure is silent: fetchMySharedRelationships throws on error (caught
 *     here → 'failed'); the store keeps whatever was previously persisted.
 *
 * Guards:
 *   - in-flight flag: concurrent calls short-circuit ('in_flight'), so overlapping
 *     AppState/focus/pull events issue a single request.
 *   - throttle: throttled callers within RESYNC_THROTTLE_MS of the last SUCCESSFUL
 *     sync short-circuit ('throttled'). Pass { force: true } (explicit user intent:
 *     pull-to-refresh, deep-link resolution) to bypass the throttle — the in-flight
 *     guard still applies.
 */
export const RESYNC_THROTTLE_MS = 45_000;

export type ResyncOutcome = 'synced' | 'throttled' | 'in_flight' | 'failed';

let lastSyncedAt = 0;
let inFlight = false;

export async function resyncSharedRelations(options?: { force?: boolean }): Promise<ResyncOutcome> {
  if (inFlight) return 'in_flight';
  if (!options?.force && Date.now() - lastSyncedAt < RESYNC_THROTTLE_MS) {
    return 'throttled';
  }

  inFlight = true;
  try {
    const rows = await fetchMySharedRelationships();
    upsertBootstrappedSharedRelations(rows);

    // fetchPassDeliveries never throws (returns [] on error) — best-effort.
    const deliveries = await fetchPassDeliveries();
    if (deliveries.length > 0) {
      materializePassDeliveries(
        deliveries.map((d) => ({
          fromDeliveryId: d.id,
          canonicalRelationId: d.canonicalRelationId,
          objectType: d.objectType,
          objectPayload: d.objectPayload,
        })),
      );
    }

    // Only a resolved bootstrap fetch counts as a successful sync for throttling.
    lastSyncedAt = Date.now();
    return 'synced';
  } catch {
    // Bootstrap fetch failed — leave the store untouched and let the next
    // trigger (a later foreground, focus, or pull) retry. Not throttled: a failed
    // attempt does not advance lastSyncedAt.
    return 'failed';
  } finally {
    inFlight = false;
  }
}

/** Test-only: reset throttle + in-flight state between cases. */
export function __resetResyncStateForTest(): void {
  lastSyncedAt = 0;
  inFlight = false;
}
