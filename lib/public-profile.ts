import { supabase } from './supabase';

/**
 * Returns the current user's public profile identifier, creating it if needed.
 *
 * This is the canonical provisioning call for MeProfile.publicProfileId.
 * Safe to call on every authenticated app bootstrap — the backend RPC is idempotent.
 *
 * INVARIANT: the returned ID is a UUID distinct from auth.uid().
 * It is the identity intended for QR cards, scan deduplication, and future lookup.
 * Never substitute this value with internalAuthUserId.
 *
 * Throws if the user is not authenticated or if the backend call fails.
 * The caller is responsible for handling errors gracefully (keep publicProfileId null).
 */
export async function getOrCreatePublicProfileId(): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_public_profile_id');
  if (error) throw error;
  if (!data || typeof data !== 'string') {
    throw new Error('get_or_create_public_profile_id: unexpected empty result');
  }
  return data;
}

export type UpsertHandleResult = { success: boolean; taken: boolean };

/**
 * Claims or updates the caller's Baobab handle in the backend registry.
 *
 * Idempotent: calling with the caller's current handle is a no-op.
 * Returns { success: true, taken: false } on claim or no-op.
 * Returns { success: false, taken: true } if the handle belongs to another user.
 *
 * Throws on auth error, invalid format, or network failure.
 * The caller is responsible for surfacing the 'taken' case as a user-facing error.
 *
 * Handle must be pre-normalised by the caller (normalizeHandleInput from lib/identity-format).
 */
export async function upsertUserHandle(handle: string, displayName?: string): Promise<UpsertHandleResult> {
  const params: { p_handle: string; p_display_name?: string } = { p_handle: handle };
  if (displayName?.trim()) params.p_display_name = displayName.trim();
  const { data, error } = await supabase.rpc('upsert_user_handle', params);
  if (error) throw error;
  const result = data as { success: boolean; reason?: string };
  if (!result.success && result.reason === 'taken') {
    return { success: false, taken: true };
  }
  return { success: true, taken: false };
}
