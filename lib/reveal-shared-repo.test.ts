import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

vi.mock('./supabase-auth', () => ({
  getAuthenticatedUserId: vi.fn().mockResolvedValue('caller-uuid'),
}));

// Must import after vi.mock is hoisted.
import { supabase } from './supabase';
import { getSharedRevealRecordForCurrentUser } from './reveal-shared-repo';
import type { SharedRevealStateResult } from './reveal-shared-types';

const mockRpc = supabase.rpc as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockRpc.mockReset();
});

const RPC_ROW: SharedRevealStateResult = {
  my_side: 'sideA',
  status: 'revealed',
  side_a_present: true,
  side_b_present: true,
  side_a_reading_id: 'r-a',
  side_b_reading_id: 'r-b',
  cooking_started_at: '2026-01-01T00:00:00Z',
  unlock_at: '2026-01-01T00:00:15Z',
  ready_at: '2026-01-01T00:00:15Z',
  first_viewed_at: '2026-01-01T00:00:30Z',
  revealed_at: '2026-01-01T00:00:30Z',
  mutual_score: 72,
  tier: 'Steady',
  relationship_name_revealed: true,
  finalized_version: 1,
};

describe('getSharedRevealRecordForCurrentUser — UUID guard', () => {
  it('G1: legacy numeric id ("7") → null, zero RPC calls', async () => {
    const result = await getSharedRevealRecordForCurrentUser('7');
    expect(result).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('G2: legacy r-* id ("r-123") → null, zero RPC calls', async () => {
    const result = await getSharedRevealRecordForCurrentUser('r-123456789');
    expect(result).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('G3: valid UUID → RPC called exactly once', async () => {
    mockRpc.mockResolvedValueOnce({ data: [RPC_ROW], error: null });
    await getSharedRevealRecordForCurrentUser('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    expect(mockRpc).toHaveBeenCalledOnce();
  });
});

describe('getSharedRevealRecordForCurrentUser — RPC mapping', () => {
  it('R1: maps RPC row to SharedRevealStateResult with my_side', async () => {
    mockRpc.mockResolvedValueOnce({ data: [RPC_ROW], error: null });
    const result = await getSharedRevealRecordForCurrentUser('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    expect(result).not.toBeNull();
    expect(result!.my_side).toBe('sideA');
    expect(result!.status).toBe('revealed');
    expect(result!.side_a_present).toBe(true);
    expect(result!.side_b_present).toBe(true);
    expect(result!.mutual_score).toBe(72);
    expect(result!.tier).toBe('Steady');
  });

  it('R2: returns null when caller is not participant (empty result set)', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    const result = await getSharedRevealRecordForCurrentUser('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    expect(result).toBeNull();
  });

  it('R3: returns null when RPC data is null', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: null });
    const result = await getSharedRevealRecordForCurrentUser('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    expect(result).toBeNull();
  });

  it('R4: throws on Supabase error', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('rpc failed') });
    await expect(getSharedRevealRecordForCurrentUser('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).rejects.toThrow('rpc failed');
  });

  it('R5: result does not contain side_a_user_id or side_b_user_id', async () => {
    mockRpc.mockResolvedValueOnce({ data: [RPC_ROW], error: null });
    const result = await getSharedRevealRecordForCurrentUser('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    expect(result).not.toHaveProperty('side_a_user_id');
    expect(result).not.toHaveProperty('side_b_user_id');
  });

  it('R6: calls the correct RPC with p_relationship_id', async () => {
    mockRpc.mockResolvedValueOnce({ data: [RPC_ROW], error: null });
    const TARGET = 'b1111111-2222-3333-4444-555555555555';
    await getSharedRevealRecordForCurrentUser(TARGET);
    expect(mockRpc).toHaveBeenCalledWith('get_my_reveal_state', {
      p_relationship_id: TARGET,
    });
  });
});
