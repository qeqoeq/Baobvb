import type { MeProfile } from '../store/useRelationsStore';

const BAOBAB_PERSON_CARD_TYPE = 'baobab-person-card';

// ── Version constants ─────────────────────────────────────────────────────────

/**
 * v1: Legacy payload.
 * meId holds MeProfile.id — a device-local alias, opaque, not backend-queryable.
 * Use for local scan deduplication only.
 */
const PERSON_CARD_VERSION_1 = 1 as const;

/**
 * v2: Canonical payload.
 * meId holds MeProfile.publicProfileId — a stable, shareable public identity.
 * The raw JSON also includes a dedicated `publicProfileId` field.
 * Emitted only when publicProfileId is provisioned (isQrV2Ready returns true).
 */
const PERSON_CARD_VERSION_2 = 2 as const;

export type PersonCardVersion = typeof PERSON_CARD_VERSION_1 | typeof PERSON_CARD_VERSION_2;

// ── Payload type ──────────────────────────────────────────────────────────────

/**
 * Parsed representation of a Baobab person card QR payload (v1 or v2).
 *
 * meId semantics by version:
 *   v1 — MeProfile.id (legacy local alias). Opaque. Not a backend lookup key.
 *   v2 — MeProfile.publicProfileId (stable shareable identity). Backend-queryable.
 *        Identical to the publicProfileId field in v2 payloads.
 *
 * Always check `payload.version` before treating meId as a canonical identity.
 * publicProfileId is only present when version === 2.
 */
export type PersonCardPayload = {
  type: typeof BAOBAB_PERSON_CARD_TYPE;
  version: PersonCardVersion;
  displayName: string;
  handle: string;
  avatarSeed: string;
  /**
   * The card owner's public identifier.
   * v1: MeProfile.id (legacy local alias, opaque, not backend-queryable).
   * v2: MeProfile.publicProfileId (stable shareable identity, backend-queryable).
   *     Set to the same value as publicProfileId for backward compat with v1 consumers.
   */
  meId: string;
  /**
   * Present only in v2 cards.
   * The card owner's canonical public profile identifier.
   * Identical to meId for v2. Undefined for v1 cards.
   */
  publicProfileId?: string;
};

// ── Build helpers ─────────────────────────────────────────────────────────────

/**
 * Returns true if the given profile has a provisioned publicProfileId,
 * and can therefore emit a canonical v2 QR card.
 *
 * When false, buildPersonCardPayload falls back to v1 (safe, legacy default).
 *
 * INVARIANT: publicProfileId must never be internalAuthUserId.
 * This guard only checks presence — provisioning correctness is the backend's responsibility.
 */
export function isQrV2Ready(me: Pick<MeProfile, 'publicProfileId'>): boolean {
  return typeof me.publicProfileId === 'string' && me.publicProfileId.length > 0;
}

/**
 * Builds the QR payload for the current user's person card.
 *
 * Emits v1 by default, regardless of whether publicProfileId is provisioned.
 * Emits v2 only when both conditions are met:
 *   1. options.preferV2 is explicitly true
 *   2. publicProfileId is provisioned (isQrV2Ready returns true)
 *
 * If preferV2 is true but publicProfileId is absent, silently falls back to v1.
 * This decouples "publicProfileId provisioned" from "v2 QR rollout activated" —
 * the caller decides when v2 emission is appropriate.
 *
 * INVARIANT: never uses internalAuthUserId. Never exposes auth.uid() publicly.
 */
export function buildPersonCardPayload(
  me: MeProfile,
  options?: { preferV2?: boolean },
): PersonCardPayload {
  if (options?.preferV2 && isQrV2Ready(me) && me.publicProfileId) {
    return {
      type: BAOBAB_PERSON_CARD_TYPE,
      version: PERSON_CARD_VERSION_2,
      displayName: me.displayName,
      handle: me.handle,
      avatarSeed: me.avatarSeed,
      meId: me.publicProfileId,
      publicProfileId: me.publicProfileId,
    };
  }
  // Default path: v1 legacy. meId = MeProfile.id (local alias).
  return {
    type: BAOBAB_PERSON_CARD_TYPE,
    version: PERSON_CARD_VERSION_1,
    displayName: me.displayName,
    handle: me.handle,
    avatarSeed: me.avatarSeed,
    meId: me.id,
  };
}

// ── Encode / parse ────────────────────────────────────────────────────────────

export function encodePersonCardPayload(payload: PersonCardPayload): string {
  return JSON.stringify(payload);
}

/**
 * Parses a raw QR string into a PersonCardPayload.
 * Accepts both v1 and v2 payloads — forward and backward compatible.
 *
 * v1 result: meId = legacy local alias. publicProfileId = undefined.
 * v2 result: meId = publicProfileId (populated for backward compat with v1 consumers).
 *            publicProfileId = the canonical public identity.
 *
 * Backward compat guarantee: existing v1 consumers that only read payload.meId
 * continue to work without change for both v1 and v2 cards.
 *
 * Returns null if the payload is not a valid Baobab person card.
 */
export function parsePersonCardPayload(raw: string): PersonCardPayload | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.type !== BAOBAB_PERSON_CARD_TYPE) return null;

    const version = parsed.version;
    if (version !== PERSON_CARD_VERSION_1 && version !== PERSON_CARD_VERSION_2) return null;

    const displayName = typeof parsed.displayName === 'string' ? parsed.displayName.trim() : '';
    if (!displayName) return null;

    const cleanHandle = typeof parsed.handle === 'string' ? parsed.handle.trim() : '';
    const cleanAvatarSeed =
      typeof parsed.avatarSeed === 'string' ? parsed.avatarSeed.trim() : '';
    const normalizedSeed = cleanAvatarSeed || displayName.charAt(0).toUpperCase() || '?';

    if (version === PERSON_CARD_VERSION_2) {
      const publicProfileId =
        typeof parsed.publicProfileId === 'string' ? parsed.publicProfileId.trim() : '';
      if (!publicProfileId) return null;
      return {
        type: BAOBAB_PERSON_CARD_TYPE,
        version: PERSON_CARD_VERSION_2,
        displayName,
        handle: cleanHandle,
        avatarSeed: normalizedSeed,
        // meId is set to publicProfileId so v1 consumers (scan/add) work without change.
        meId: publicProfileId,
        publicProfileId,
      };
    }

    // v1
    const meId = typeof parsed.meId === 'string' ? parsed.meId.trim() : '';
    if (!meId) return null;
    return {
      type: BAOBAB_PERSON_CARD_TYPE,
      version: PERSON_CARD_VERSION_1,
      displayName,
      handle: cleanHandle,
      avatarSeed: normalizedSeed,
      meId,
    };
  } catch {
    return null;
  }
}
