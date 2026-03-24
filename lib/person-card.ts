import type { MeProfile } from '../store/useRelationsStore';

const BAOBAB_PERSON_CARD_TYPE = 'baobab-person-card';
const BAOBAB_PERSON_CARD_VERSION = 1;

export type PersonCardPayload = {
  type: typeof BAOBAB_PERSON_CARD_TYPE;
  version: typeof BAOBAB_PERSON_CARD_VERSION;
  displayName: string;
  handle: string;
  avatarSeed: string;
  /**
   * The card owner's public identifier.
   *
   * v1 (current): holds MeProfile.id — a legacy local alias, not a stable
   * system identity. Treat as opaque for deduplication only. Do not query
   * the backend with this value as a user lookup key.
   *
   * v2 (future): will hold MeProfile.publicProfileId once provisioned.
   * A version bump to BAOBAB_PERSON_CARD_VERSION will gate the transition.
   */
  meId: string;
};

export function buildPersonCardPayload(me: MeProfile): PersonCardPayload {
  return {
    type: BAOBAB_PERSON_CARD_TYPE,
    version: BAOBAB_PERSON_CARD_VERSION,
    displayName: me.displayName,
    handle: me.handle,
    avatarSeed: me.avatarSeed,
    // v1: me.id (legacy local alias). Will become me.publicProfileId in v2.
    meId: me.id,
  };
}

export function encodePersonCardPayload(payload: PersonCardPayload): string {
  return JSON.stringify(payload);
}

export function parsePersonCardPayload(raw: string): PersonCardPayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PersonCardPayload>;
    if (parsed.type !== BAOBAB_PERSON_CARD_TYPE) return null;
    if (parsed.version !== BAOBAB_PERSON_CARD_VERSION) return null;
    if (!parsed.displayName || !parsed.meId) {
      return null;
    }
    const cleanHandle = typeof parsed.handle === 'string' ? parsed.handle.trim() : '';
    const cleanAvatarSeed = typeof parsed.avatarSeed === 'string' ? parsed.avatarSeed.trim() : '';
    return {
      type: BAOBAB_PERSON_CARD_TYPE,
      version: BAOBAB_PERSON_CARD_VERSION,
      displayName: parsed.displayName,
      handle: cleanHandle,
      avatarSeed: cleanAvatarSeed || parsed.displayName.charAt(0).toUpperCase() || '?',
      meId: parsed.meId,
    };
  } catch {
    return null;
  }
}
