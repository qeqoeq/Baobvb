// B47 — name-only boundary for the contact picker.
//
// expo-contacts returns a full Contact on pick (phoneNumbers, emails, a contact
// id, an image) alongside the name. This helper is the single frontier where a
// picked contact enters our code: it reads ONLY the display name and returns a
// plain string — number, email, id and photo are dropped here and never reach
// state, persistence, or logs. Doctrine: the picked contact is a private
// on-device label, not an account.

export type PickedContactNameInput = {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

/** The display name only, trimmed. '' when the contact carries no usable name. */
export function contactDisplayName(contact: PickedContactNameInput | null | undefined): string {
  if (!contact) return '';
  const full = contact.name?.trim();
  if (full) return full;
  return [contact.firstName, contact.lastName]
    .map((part) => part?.trim() ?? '')
    .filter(Boolean)
    .join(' ');
}

/**
 * Resolve a picker result into the name to apply, or null.
 * null means "make no change": the user cancelled the native picker, or the
 * contact had no usable name — the caller must leave the free-text field intact
 * (no dead-end). A non-null string is the private label to set.
 */
export function resolvePickedContactName(
  contact: PickedContactNameInput | null | undefined,
): string | null {
  if (!contact) return null;
  const name = contactDisplayName(contact);
  return name.length > 0 ? name : null;
}
