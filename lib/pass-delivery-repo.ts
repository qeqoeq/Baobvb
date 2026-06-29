import { supabase } from './supabase';
import type { PlaceCategory } from '../store/useRelationsStore';

export type PassDeliveryPayload = {
  objectId: string;
  nameSnapshot: string;
  categorySnapshot: PlaceCategory;
  note?: string;
  // sourceRelationId is structurally excluded — never transported to the server
};

export type RemotePassDelivery = {
  id: string;
  createdAt: string;
  canonicalRelationId: string;
  objectType: 'place';
  objectPayload: PassDeliveryPayload;
  // from_user_id intentionally omitted — sender identity not exposed to receiver
};

const VALID_CATEGORIES = new Set<string>(['restaurant', 'cafe', 'bar', 'spot', 'other']);
const NOTE_MAX = 80;
const NAME_MAX = 120;

/**
 * Creates a server-side pass delivery for a revealed shared relation.
 * Fire-and-forget: returns null on any failure without throwing.
 * Never includes sourceRelationId — stripped before the RPC call.
 * The caller is responsible for the local PassedObject; this is additive only.
 */
export async function createPassDelivery(input: {
  canonicalRelationId: string;
  objectType: 'place';
  objectPayload: PassDeliveryPayload;
}): Promise<{ id: string } | null> {
  try {
    const trimmedName = input.objectPayload.nameSnapshot.trim() || 'Untitled place';
    const trimmedNote = input.objectPayload.note?.trim();

    // Build payload with only the known, allowed fields — no sourceRelationId
    const payload: Record<string, string> = {
      objectId: input.objectPayload.objectId,
      nameSnapshot: trimmedName.slice(0, NAME_MAX),
      categorySnapshot: input.objectPayload.categorySnapshot,
    };
    if (trimmedNote && trimmedNote.length > 0) {
      payload['note'] = trimmedNote.slice(0, NOTE_MAX);
    }

    const { data, error } = await supabase.rpc('create_pass_delivery', {
      p_canonical_relation_id: input.canonicalRelationId,
      p_object_type: input.objectType,
      p_object_payload: payload,
    });

    if (error || !Array.isArray(data) || !data[0]) return null;
    const row = data[0] as Record<string, unknown>;
    if (typeof row['id'] !== 'string') return null;
    return { id: row['id'] };
  } catch {
    return null;
  }
}

function isValidPayload(p: unknown): p is Record<string, unknown> {
  if (!p || typeof p !== 'object') return false;
  const obj = p as Record<string, unknown>;
  return (
    typeof obj['objectId'] === 'string' &&
    (obj['objectId'] as string).trim().length > 0 &&
    typeof obj['nameSnapshot'] === 'string' &&
    (obj['nameSnapshot'] as string).trim().length > 0 &&
    typeof obj['categorySnapshot'] === 'string' &&
    VALID_CATEGORIES.has(obj['categorySnapshot'] as string)
  );
}

function normalizeRow(row: Record<string, unknown>): RemotePassDelivery | null {
  if (
    typeof row['id'] !== 'string' ||
    typeof row['created_at'] !== 'string' ||
    typeof row['canonical_relation_id'] !== 'string' ||
    row['object_type'] !== 'place' ||
    !isValidPayload(row['object_payload'])
  ) {
    return null;
  }
  const p = row['object_payload'] as Record<string, unknown>;
  const rawNote = typeof p['note'] === 'string' ? (p['note'] as string).trim() : '';
  return {
    id: row['id'] as string,
    createdAt: row['created_at'] as string,
    canonicalRelationId: row['canonical_relation_id'] as string,
    objectType: 'place',
    objectPayload: {
      objectId: (p['objectId'] as string).trim(),
      nameSnapshot: (p['nameSnapshot'] as string).trim(),
      categorySnapshot: p['categorySnapshot'] as PlaceCategory,
      ...(rawNote.length > 0 ? { note: rawNote } : {}),
    },
  };
}

/**
 * Fetches all pass deliveries addressed to the current authenticated user.
 * Returns [] on any error — caller treats absence as non-fatal.
 * Does not mark deliveries as read. Does not mutate server state.
 * Ordered by created_at asc (oldest first for materialization).
 */
export async function fetchPassDeliveries(): Promise<RemotePassDelivery[]> {
  try {
    const { data, error } = await supabase.rpc('fetch_pass_deliveries');
    if (error || !Array.isArray(data)) return [];
    const results: RemotePassDelivery[] = [];
    for (const row of data) {
      if (!row || typeof row !== 'object') continue;
      const normalized = normalizeRow(row as Record<string, unknown>);
      if (normalized !== null) results.push(normalized);
    }
    return results;
  } catch {
    return [];
  }
}
