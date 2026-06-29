import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

// Must import after vi.mock is hoisted
import { supabase } from './supabase';
import { createPassDelivery, fetchPassDeliveries } from './pass-delivery-repo';

const mockRpc = supabase.rpc as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockRpc.mockReset();
});

// ── createPassDelivery ────────────────────────────────────────────────────────

describe('createPassDelivery', () => {
  it('T1: payload sent to RPC does not contain sourceRelationId or status', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [{ id: 'delivery-uuid', created_at: '2026-06-29T00:00:00Z' }],
      error: null,
    });

    await createPassDelivery({
      canonicalRelationId: 'canon-uuid',
      objectType: 'place',
      objectPayload: {
        objectId: 'place-1',
        nameSnapshot: 'Café Test',
        categorySnapshot: 'cafe',
      },
    });

    expect(mockRpc).toHaveBeenCalledOnce();
    const sentPayload = mockRpc.mock.calls[0][1].p_object_payload as Record<string, unknown>;
    expect(sentPayload).not.toHaveProperty('sourceRelationId');
    expect(sentPayload).not.toHaveProperty('source_relation_id');
    expect(sentPayload).not.toHaveProperty('status');
    expect(sentPayload).toHaveProperty('objectId', 'place-1');
    expect(sentPayload).toHaveProperty('nameSnapshot', 'Café Test');
    expect(sentPayload).toHaveProperty('categorySnapshot', 'cafe');
  });

  it('T2: returns null on RPC error — does not throw', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('network failure') });

    const result = await createPassDelivery({
      canonicalRelationId: 'canon-uuid',
      objectType: 'place',
      objectPayload: { objectId: 'p', nameSnapshot: 'P', categorySnapshot: 'bar' },
    });

    expect(result).toBeNull();
  });

  it('T2b: returns null when rpc throws — does not propagate', async () => {
    mockRpc.mockRejectedValueOnce(new Error('timeout'));

    const result = await createPassDelivery({
      canonicalRelationId: 'canon-uuid',
      objectType: 'place',
      objectPayload: { objectId: 'p', nameSnapshot: 'P', categorySnapshot: 'bar' },
    });

    expect(result).toBeNull();
  });
});

// ── fetchPassDeliveries ────────────────────────────────────────────────────────

const VALID_ROW = {
  id: 'delivery-1',
  created_at: '2026-06-29T10:00:00Z',
  canonical_relation_id: 'canon-abc',
  object_type: 'place',
  object_payload: {
    objectId: 'place-remote-1',
    nameSnapshot: 'La Pergola',
    categorySnapshot: 'restaurant',
  },
};

describe('fetchPassDeliveries', () => {
  it('T3: normalizes valid rows from RPC into RemotePassDelivery', async () => {
    mockRpc.mockResolvedValueOnce({ data: [VALID_ROW], error: null });

    const results = await fetchPassDeliveries();

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('delivery-1');
    expect(results[0].canonicalRelationId).toBe('canon-abc');
    expect(results[0].objectType).toBe('place');
    expect(results[0].objectPayload.objectId).toBe('place-remote-1');
    expect(results[0].objectPayload.nameSnapshot).toBe('La Pergola');
    expect(results[0].objectPayload.categorySnapshot).toBe('restaurant');
    expect(results[0].objectPayload).not.toHaveProperty('sourceRelationId');
  });

  it('T4: silently drops invalid rows — returns only valid entries', async () => {
    const invalidMissingId = { ...VALID_ROW, id: undefined };
    const invalidBadType = { ...VALID_ROW, id: 'delivery-2', object_type: 'music' };
    const invalidBadCategory = {
      ...VALID_ROW,
      id: 'delivery-3',
      object_payload: { ...VALID_ROW.object_payload, categorySnapshot: 'invalid_cat' },
    };
    const invalidEmptyName = {
      ...VALID_ROW,
      id: 'delivery-4',
      object_payload: { ...VALID_ROW.object_payload, nameSnapshot: '   ' },
    };

    mockRpc.mockResolvedValueOnce({
      data: [VALID_ROW, invalidMissingId, invalidBadType, invalidBadCategory, invalidEmptyName],
      error: null,
    });

    const results = await fetchPassDeliveries();
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('delivery-1');
  });

  it('T4b: returns [] on RPC error — does not throw', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('auth failed') });

    const results = await fetchPassDeliveries();
    expect(results).toHaveLength(0);
  });
});
