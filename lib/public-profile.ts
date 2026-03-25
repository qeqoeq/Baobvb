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
