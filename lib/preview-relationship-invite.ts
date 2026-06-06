import { supabase } from './supabase';
import { getAuthenticatedUserId } from './supabase-auth';
import type { InvitePreviewResult } from './reveal-shared-types';

/**
 * Best-effort lookup of an invite's inviter identity snapshot, scoped to a
 * single token. Used by InviteArrivalScreen before claim to render a
 * contextual greeting.
 *
 * Doctrine:
 *   - UX-only. Failure MUST NEVER block the invite flow.
 *   - Returns null on any error path (network, expired token, already
 *     claimed, invalid token, missing auth). Caller falls back to "Someone".
 *   - Never throws.
 *
 * Privacy:
 *   - The underlying RPC returns only the snapshot + lifecycle timestamps.
 *   - No auth UIDs, no relationship_id, no readings.
 */
export async function previewRelationshipInviteForCurrentUser(
  inviteToken: string,
): Promise<InvitePreviewResult | null> {
  if (!inviteToken || !inviteToken.trim()) return null;
  try {
    await getAuthenticatedUserId();
  } catch {
    return null;
  }
  const { data, error } = await supabase.rpc('preview_relationship_invite', {
    p_invite_token: inviteToken,
  });
  if (error) return null;
  if (!Array.isArray(data) || !data[0]) return null;
  return data[0] as InvitePreviewResult;
}
