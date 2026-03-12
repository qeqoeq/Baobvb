import type { MeProfile } from '../store/useRelationsStore';

const BAOBAB_PERSON_CARD_TYPE = 'baobab-person-card';
const BAOBAB_PERSON_CARD_VERSION = 1;

export type PersonCardPayload = {
  type: typeof BAOBAB_PERSON_CARD_TYPE;
  version: typeof BAOBAB_PERSON_CARD_VERSION;
  displayName: string;
  handle: string;
  avatarSeed: string;
  meId: string;
};

export function buildPersonCardPayload(me: MeProfile): PersonCardPayload {
  return {
    type: BAOBAB_PERSON_CARD_TYPE,
    version: BAOBAB_PERSON_CARD_VERSION,
    displayName: me.displayName,
    handle: me.handle,
    avatarSeed: me.avatarSeed,
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
    if (!parsed.displayName || !parsed.handle || !parsed.avatarSeed || !parsed.meId) {
      return null;
    }
    return {
      type: BAOBAB_PERSON_CARD_TYPE,
      version: BAOBAB_PERSON_CARD_VERSION,
      displayName: parsed.displayName,
      handle: parsed.handle,
      avatarSeed: parsed.avatarSeed,
      meId: parsed.meId,
    };
  } catch {
    return null;
  }
}
