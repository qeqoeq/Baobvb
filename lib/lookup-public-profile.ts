import { supabase } from './supabase';

/**
 * Result of a backend lookup for a scanned v2 publicProfileId.
 *
 * 'found'     — the UUID is registered in Baobab. The person is a real Baobab user.
 * 'not-found' — the UUID is not in user_public_profiles. Could be a stale QR.
 * 'error'     — network or backend failure. No conclusion can be drawn.
 *
 * A 'found' result does NOT imply:
 *   - Any relational connection with the current user.
 *   - Any shared reveal or mutual disclosure.
 *   - Access to any profile data (displayName/handle/avatarSeed live client-side only).
 */
export type PublicProfileLookupResult =
  | { status: 'found'; publicProfileId: string }
  | { status: 'not-found'; publicProfileId: string }
  | { status: 'error'; publicProfileId: string };

/**
 * Lookup state for a scanned v2 identity in add.tsx.
 *
 * 'idle'    — no publicProfileId present (v1 scan or manual add). No lookup attempted.
 * 'pending' — lookup in flight.
 * otherwise — settled result from lookupPublicProfile().
 */
export type PublicProfileLookupState =
  | { status: 'idle' }
  | { status: 'pending'; publicProfileId: string }
  | PublicProfileLookupResult;

/**
 * Checks whether a publicProfileId is registered in Baobab.
 *
 * Calls the lookup_public_profile RPC, which performs a cross-user existence
 * check on user_public_profiles without exposing any user_id.
 *
 * Requires the caller to be authenticated.
 * Safe to call with any UUID — will return 'not-found' rather than throwing on
 * unknown IDs. Only throws on network/backend errors, caught and returned as 'error'.
 */
export async function lookupPublicProfile(
  publicProfileId: string,
): Promise<PublicProfileLookupResult> {
  const { data, error } = await supabase.rpc('lookup_public_profile', {
    lookup_id: publicProfileId,
  });
  if (error) {
    return { status: 'error', publicProfileId };
  }
  return data === true
    ? { status: 'found', publicProfileId }
    : { status: 'not-found', publicProfileId };
}
