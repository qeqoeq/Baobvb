import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(),
  },
}));

// Must import after vi.mock is hoisted
import { supabase } from './supabase';
import { publishHandleBestEffort, reconcileHandleOwnership, upsertUserHandle } from './public-profile';

const mockRpc = supabase.rpc as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockRpc.mockReset();
});

// ── upsertUserHandle — display_name parameter contract ────────────────────────

describe('upsertUserHandle', () => {
  it('U1: passes p_display_name when a non-empty display name is provided', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });
    await upsertUserHandle('@alice', 'Alice');
    expect(mockRpc).toHaveBeenCalledWith('upsert_user_handle', {
      p_handle: '@alice',
      p_display_name: 'Alice',
    });
  });

  it('U2: omits p_display_name when display name is blank', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });
    await upsertUserHandle('@alice', '   ');
    expect(mockRpc).toHaveBeenCalledWith('upsert_user_handle', { p_handle: '@alice' });
  });

  it('U3: taken → { success:false, taken:true }', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: false, reason: 'taken' }, error: null });
    await expect(upsertUserHandle('@taken', 'Bob')).resolves.toEqual({ success: false, taken: true });
  });
});

// ── publishHandleBestEffort — Volet A (B11): never throws, never blocks ────────

describe('publishHandleBestEffort', () => {
  it('P1: success → "published" and forwards handle + display_name', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });
    const outcome = await publishHandleBestEffort('@alice', 'Alice');
    expect(outcome).toBe('published');
    expect(mockRpc).toHaveBeenCalledWith('upsert_user_handle', {
      p_handle: '@alice',
      p_display_name: 'Alice',
    });
  });

  it('P2: taken handle → "taken", swallowed (no throw)', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: false, reason: 'taken' }, error: null });
    await expect(publishHandleBestEffort('@taken', 'Bob')).resolves.toBe('taken');
  });

  it('P3: RPC error → "error", swallowed (no throw)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'network down' } });
    await expect(publishHandleBestEffort('@alice', 'Alice')).resolves.toBe('error');
  });

  it('P4: thrown exception → "error", swallowed (no throw)', async () => {
    mockRpc.mockRejectedValueOnce(new Error('boom'));
    await expect(publishHandleBestEffort('@alice', 'Alice')).resolves.toBe('error');
  });
});

// ── reconcileHandleOwnership — R1+R2 (B11 Volet C): identity divergence check ──

describe('reconcileHandleOwnership', () => {
  it('R1: handle owned by me / free → "consistent" (idempotent, display_name re-published)', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: true }, error: null });
    const result = await reconcileHandleOwnership('@iphonebb', 'iPhone BB');
    expect(result).toBe('consistent');
    // R2 side effect: display_name re-published to the registry.
    expect(mockRpc).toHaveBeenCalledWith('upsert_user_handle', {
      p_handle: '@iphonebb',
      p_display_name: 'iPhone BB',
    });
  });

  it('R2: handle owned by ANOTHER auth user → "divergent" (ghost session detected)', async () => {
    mockRpc.mockResolvedValueOnce({ data: { success: false, reason: 'taken' }, error: null });
    await expect(reconcileHandleOwnership('@iphonebb', 'iPhone BB')).resolves.toBe('divergent');
  });

  it('R3: network error → "skipped", never throws (retried next boot)', async () => {
    mockRpc.mockRejectedValueOnce(new Error('offline'));
    await expect(reconcileHandleOwnership('@iphonebb', 'iPhone BB')).resolves.toBe('skipped');
  });

  it('R4: empty local handle → "skipped" without hitting the RPC', async () => {
    const result = await reconcileHandleOwnership('   ', 'iPhone BB');
    expect(result).toBe('skipped');
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
