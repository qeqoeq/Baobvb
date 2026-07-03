import { supabase } from './supabase';
import type {
  SharedInviteClaimResult,
  SharedRelationshipInvite,
  SharedReadingPayload,
  SharedRelationshipRevealRecord,
  SharedRevealStateResult,
} from './reveal-shared-types';
import { getAuthenticatedUserId } from './supabase-auth';
import { normalizePhoneForAnchor } from './phone-normalize';
import type { RelationshipSideKey } from '../store/useRelationsStore';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getSharedRevealRecordForCurrentUser(
  relationshipId: string,
): Promise<SharedRevealStateResult | null> {
  if (!UUID_RE.test(relationshipId)) return null;
  await getAuthenticatedUserId();
  const { data, error } = await supabase.rpc('get_my_reveal_state', {
    p_relationship_id: relationshipId,
  });

  if (error) {
    throw error;
  }

  if (!Array.isArray(data) || !data[0]) return null;
  return data[0] as SharedRevealStateResult;
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
  inviterIdentity?: {
    displayName: string;
    handle: string;
    avatarSeed: string;
  },
): Promise<SharedRelationshipInvite> {
  await getAuthenticatedUserId();
  // Snapshot is frozen at send time. Empty string / null defaults preserve
  // back-compat with pre-snapshot call-sites; the client renders "Someone"
  // as fallback when the recipient previews the invite.
  const { data, error } = await supabase.rpc('create_relationship_invite', {
    p_relationship_id: relationshipId,
    p_inviter_side: inviterSide,
    p_ttl_minutes: ttlMinutes,
    p_inviter_display_name: inviterIdentity?.displayName ?? '',
    p_inviter_handle: inviterIdentity?.handle ?? null,
    p_inviter_avatar_seed: inviterIdentity?.avatarSeed ?? null,
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

// phoneE164 must never be logged — raw phone number must not appear in any log or error payload.
export async function registerPhoneInviteAnchorForCurrentUser(
  relationshipId: string,
  phoneE164: string,
): Promise<void> {
  await getAuthenticatedUserId();
  const { error } = await supabase.rpc('register_phone_invite_anchor', {
    p_relationship_id: relationshipId,
    p_phone_e164: phoneE164,
  });

  if (error) {
    throw error;
  }
}

// Normalises rawPhone and registers a phone anchor for the given relationship.
// Additive and silent: failure — including normalisation failure for local numbers
// without an international prefix — is swallowed. Must never block invite delivery.
export async function tryRegisterPhoneAnchorSilently(
  relationshipId: string,
  rawPhone: string,
): Promise<void> {
  const normalized = normalizePhoneForAnchor(rawPhone);
  if (!normalized) return;
  try {
    await registerPhoneInviteAnchorForCurrentUser(relationshipId, normalized.e164);
  } catch {
    // Additive — anchor registration failure must never block invite delivery.
  }
}

export const attachSharedPrivateReadingReference = attachSharedPrivateReadingReferenceForCurrentUser;
