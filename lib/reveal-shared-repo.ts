import { supabase } from './supabase';
import type {
  SharedInviteClaimResult,
  SharedRelationshipInvite,
  SharedReadingPayload,
  SharedRelationshipRevealRecord,
  SharedRevealRecordUpsertInput,
} from './reveal-shared-types';
import { getAuthenticatedUserId } from './supabase-auth';
import type { RelationshipSideKey } from '../store/useRelationsStore';

const TABLE = 'shared_relationship_reveals';

export async function getSharedRevealRecordForCurrentUser(
  relationshipId: string,
): Promise<SharedRelationshipRevealRecord | null> {
  const userId = await getAuthenticatedUserId();

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('relationship_id', relationshipId)
    .or(`side_a_user_id.eq.${userId},side_b_user_id.eq.${userId}`)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data as SharedRelationshipRevealRecord | null;
}

export async function upsertSharedRevealRecordForCurrentUser(
  input: SharedRevealRecordUpsertInput,
): Promise<SharedRelationshipRevealRecord> {
  await getAuthenticatedUserId();
  throw new Error(
    `Client-side participant claiming is deprecated for ${input.relationshipId}/${input.participantSide}. Use invite create/claim RPCs.`,
  );
}

export async function attachSharedPrivateReadingReferenceForCurrentUser(
  relationshipId: string,
  side: RelationshipSideKey,
  readingId: string,
  readingPayload: SharedReadingPayload,
): Promise<SharedRelationshipRevealRecord> {
  await getAuthenticatedUserId();
  const { data, error } = await supabase.rpc('attach_shared_private_reading_reference', {
    p_relationship_id: relationshipId,
    p_side: side,
    p_reading_id: readingId,
    p_reading_payload: readingPayload,
  });

  if (error) {
    throw error;
  }

  return data as SharedRelationshipRevealRecord;
}

export async function createRelationshipInviteForCurrentUser(
  relationshipId: string,
  inviterSide: RelationshipSideKey,
  ttlMinutes = 60 * 24 * 7,
): Promise<SharedRelationshipInvite> {
  await getAuthenticatedUserId();
  const { data, error } = await supabase.rpc('create_relationship_invite', {
    p_relationship_id: relationshipId,
    p_inviter_side: inviterSide,
    p_ttl_minutes: ttlMinutes,
  });

  if (error) {
    throw error;
  }
  if (!Array.isArray(data) || !data[0]) {
    throw new Error('Invite creation returned no invite payload.');
  }

  return data[0] as SharedRelationshipInvite;
}

export async function claimRelationshipInviteForCurrentUser(
  inviteToken: string,
): Promise<SharedInviteClaimResult> {
  await getAuthenticatedUserId();
  const { data, error } = await supabase.rpc('claim_relationship_invite', {
    p_invite_token: inviteToken,
  });

  if (error) {
    throw error;
  }
  if (!Array.isArray(data) || !data[0]) {
    throw new Error('Invite claim returned no claim payload.');
  }

  return data[0] as SharedInviteClaimResult;
}

async function runSharedLifecycleAction(
  rpcName:
    | 'start_shared_cooking_reveal_if_ready'
    | 'mark_shared_reveal_ready_if_unlocked'
    | 'open_shared_reveal',
  relationshipId: string,
): Promise<SharedRelationshipRevealRecord | null> {
  await getAuthenticatedUserId();
  const { data, error } = await supabase.rpc(rpcName, {
    p_relationship_id: relationshipId,
  });

  if (error) {
    throw error;
  }

  return (data as SharedRelationshipRevealRecord | null) ?? null;
}

export async function startSharedCookingRevealIfReady(
  relationshipId: string,
): Promise<SharedRelationshipRevealRecord | null> {
  return runSharedLifecycleAction('start_shared_cooking_reveal_if_ready', relationshipId);
}

export async function markSharedRevealReadyIfUnlocked(
  relationshipId: string,
): Promise<SharedRelationshipRevealRecord | null> {
  return runSharedLifecycleAction('mark_shared_reveal_ready_if_unlocked', relationshipId);
}

export async function openSharedReveal(
  relationshipId: string,
): Promise<SharedRelationshipRevealRecord | null> {
  return runSharedLifecycleAction('open_shared_reveal', relationshipId);
}

// Backward-compatible aliases while Day 2 remains helper-only.
export const getSharedRevealRecord = getSharedRevealRecordForCurrentUser;
export const upsertSharedRevealRecord = upsertSharedRevealRecordForCurrentUser;
export const attachSharedPrivateReadingReference = attachSharedPrivateReadingReferenceForCurrentUser;
