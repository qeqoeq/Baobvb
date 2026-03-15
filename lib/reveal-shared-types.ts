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
  side_a_reading_payload: SharedReadingPayload | null;
  side_b_reading_payload: SharedReadingPayload | null;
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
