import { supabase } from './supabase';
import type { SharedRelationBootstrapInput } from '../store/useRelationsStore';

/**
 * Fetches all canonical shared relationships the current user participates in.
 *
 * Backed by the `my_shared_relationships` RPC which:
 *   - scopes results to auth.uid() server-side (no client-supplied user_id)
 *   - excludes non-UUID relationship_ids (legacy rows silently omitted)
 *   - returns only fields needed for local materialization
 *
 * Best-effort: callers should catch errors and treat failures as non-fatal.
 */
export async function fetchMySharedRelationships(): Promise<SharedRelationBootstrapInput[]> {
  const { data, error } = await supabase.rpc('my_shared_relationships');
  if (error) throw error;
  return (data ?? []) as SharedRelationBootstrapInput[];
}
