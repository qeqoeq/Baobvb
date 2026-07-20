import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the three collaborators. resyncSharedRelations only touches these.
vi.mock('./bootstrap-shared-relations', () => ({
  fetchMySharedRelationships: vi.fn(),
}));
vi.mock('./pass-delivery-repo', () => ({
  fetchPassDeliveries: vi.fn(),
}));
vi.mock('../store/useRelationsStore', () => ({
  upsertBootstrappedSharedRelations: vi.fn(),
  materializePassDeliveries: vi.fn(),
  // Present in the mock only so the "never reconciles" assertion is meaningful:
  // resync must NOT import or call this (arbitration A — reconciliation is
  // cold-start only).
  reconcileOrphanedSharedRelations: vi.fn(),
}));

import { fetchMySharedRelationships } from './bootstrap-shared-relations';
import { fetchPassDeliveries } from './pass-delivery-repo';
import {
  upsertBootstrappedSharedRelations,
  materializePassDeliveries,
  reconcileOrphanedSharedRelations,
} from '../store/useRelationsStore';
import { resyncSharedRelations, __resetResyncStateForTest } from './resync-shared-relations';

const mockFetchRelations = fetchMySharedRelationships as ReturnType<typeof vi.fn>;
const mockFetchDeliveries = fetchPassDeliveries as ReturnType<typeof vi.fn>;
const mockUpsert = upsertBootstrappedSharedRelations as ReturnType<typeof vi.fn>;
const mockMaterialize = materializePassDeliveries as ReturnType<typeof vi.fn>;
const mockReconcile = reconcileOrphanedSharedRelations as ReturnType<typeof vi.fn>;

const ROWS = [{ relationship_id: 'canon-1', status: 'revealed' }];
const DELIVERY = {
  id: 'delivery-1',
  canonicalRelationId: 'canon-1',
  objectType: 'place',
  objectPayload: { objectId: 'p1', nameSnapshot: 'Café', categorySnapshot: 'cafe' },
};

beforeEach(() => {
  vi.clearAllMocks();
  __resetResyncStateForTest();
  mockFetchRelations.mockResolvedValue(ROWS);
  mockFetchDeliveries.mockResolvedValue([]);
});

describe('resyncSharedRelations — orchestration', () => {
  it('R1: happy path fetches relations + deliveries and upserts, returns synced', async () => {
    mockFetchDeliveries.mockResolvedValueOnce([DELIVERY]);

    const outcome = await resyncSharedRelations();

    expect(outcome).toBe('synced');
    expect(mockFetchRelations).toHaveBeenCalledOnce();
    expect(mockUpsert).toHaveBeenCalledWith(ROWS);
    expect(mockFetchDeliveries).toHaveBeenCalledOnce();
    expect(mockMaterialize).toHaveBeenCalledOnce();
    // Deliveries are mapped to the materialization input shape.
    expect(mockMaterialize).toHaveBeenCalledWith([
      {
        fromDeliveryId: 'delivery-1',
        canonicalRelationId: 'canon-1',
        objectType: 'place',
        objectPayload: DELIVERY.objectPayload,
      },
    ]);
  });

  it('R2: never reconciles orphans (cold-start only)', async () => {
    await resyncSharedRelations();
    expect(mockReconcile).not.toHaveBeenCalled();
  });

  it('R3: empty deliveries → materialize not called', async () => {
    mockFetchDeliveries.mockResolvedValueOnce([]);
    await resyncSharedRelations();
    expect(mockMaterialize).not.toHaveBeenCalled();
  });
});

describe('resyncSharedRelations — throttle', () => {
  it('R4: a second throttled call within the window short-circuits', async () => {
    const first = await resyncSharedRelations();
    const second = await resyncSharedRelations();

    expect(first).toBe('synced');
    expect(second).toBe('throttled');
    // Only the first call hit the network.
    expect(mockFetchRelations).toHaveBeenCalledOnce();
  });

  it('R5: force bypasses the throttle', async () => {
    await resyncSharedRelations();
    const forced = await resyncSharedRelations({ force: true });

    expect(forced).toBe('synced');
    expect(mockFetchRelations).toHaveBeenCalledTimes(2);
  });
});

describe('resyncSharedRelations — in-flight guard', () => {
  it('R6: concurrent calls issue a single request', async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    mockFetchRelations.mockImplementationOnce(
      () => new Promise((resolve) => { resolveFetch = resolve; }),
    );

    const p1 = resyncSharedRelations();
    const p2 = resyncSharedRelations(); // fires while p1 is still pending

    expect(await p2).toBe('in_flight');
    resolveFetch(ROWS);
    expect(await p1).toBe('synced');
    expect(mockFetchRelations).toHaveBeenCalledOnce();
  });
});

describe('resyncSharedRelations — network failure', () => {
  it('R7: bootstrap fetch rejection is silent (failed) and does not throw', async () => {
    mockFetchRelations.mockRejectedValueOnce(new Error('network down'));

    const outcome = await resyncSharedRelations();

    expect(outcome).toBe('failed');
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it('R8: a failed attempt does not advance the throttle — next call retries', async () => {
    mockFetchRelations.mockRejectedValueOnce(new Error('network down'));
    const failed = await resyncSharedRelations();
    expect(failed).toBe('failed');

    // Next (non-force) call is NOT throttled because the failure didn't count as a sync.
    const retry = await resyncSharedRelations();
    expect(retry).toBe('synced');
    expect(mockFetchRelations).toHaveBeenCalledTimes(2);
  });
});
