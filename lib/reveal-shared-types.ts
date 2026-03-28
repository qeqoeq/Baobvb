import type { PillarKey, PillarRating, Tier } from './evaluation';

export type SharedRevealStatus =
  | 'waiting_other_side'
  | 'cooking_reveal'
  | 'reveal_ready'
  | 'revealed';

export type SharedRelationshipRevealRecord = {
  relationship_id: string;
  side_a_user_id: string | null;
  side_b_user_id: string | null;
  status: SharedRevealStatus;
  side_a_reading_id: string | null;
  side_b_reading_id: string | null;
  // side_a_reading_payload and side_b_reading_payload are intentionally omitted.
  // Private ratings are never needed on the client — the mutual score is computed
  // server-side and frozen. Exposing raw payloads would violate reading privacy
  // before the reveal is opened.
  cooking_started_at: string | null;
  unlock_at: string | null;
  ready_at: string | null;
  first_viewed_at: string | null;
  revealed_at: string | null;
  mutual_score: number | null;
  tier: Tier | null;
  relationship_name_revealed: boolean;
  finalized_version: number;
  created_at: string;
  updated_at: string;
};

export type SharedRevealRecordUpsertInput = {
  relationshipId: string;
  participantSide: 'sideA' | 'sideB';
};

export type SharedReadingPayload = Record<PillarKey, PillarRating>;

export type SharedRelationshipInvite = {
  relationship_id: string;
  invite_token: string;
  expires_at: string;
  inviter_side: 'sideA' | 'sideB';
  target_side: 'sideA' | 'sideB';
};

/**
 * Sanitized payload returned by claim_relationship_invite().
 *
 * No auth UIDs, no reading payloads, no internal row metadata.
 * Only the fields the client actually needs to materialize the local relation.
 * side_a_present / side_b_present are pre-computed booleans — the client never
 * needs to inspect auth UIDs to determine participant binding.
 */
export type SharedInviteClaimResult = {
  relationship_id: string;
  claimed_side: 'sideA' | 'sideB';
  /**
   * The publicProfileId of the other participant in this shared relation.
   * Computed server-side from user_public_profiles — no auth.uid() is exposed.
   * Null when the inviter has not provisioned a public profile yet.
   *
   * Signal only — not a relation key. One person can participate in many shared relations.
   * Does not authorize automatic merge with an existing local draft.
   */
  counterpart_public_profile_id: string | null;
  status: SharedRevealStatus;
  side_a_present: boolean;
  side_b_present: boolean;
  side_a_reading_id: string | null;
  side_b_reading_id: string | null;
  cooking_started_at: string | null;
  unlock_at: string | null;
  ready_at: string | null;
  revealed_at: string | null;
  relationship_name_revealed: boolean;
};
