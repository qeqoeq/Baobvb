/**
 * phone-normalize.ts
 *
 * Pure helper for normalizing phone numbers to E.164 format.
 *
 * INTENT
 * ──────
 * This module prepares a future backend `pending_phone_anchor` table:
 * when Alice and Bob both invite the same phone number, the server will be
 * able to group those invites under a single anchor keyed by
 * sha256(normalizedE164). That hash is computed and stored server-side only.
 *
 * WHAT THIS MODULE IS
 * ───────────────────
 * A pure, stateless parsing layer. Input: raw phone string from the iOS
 * contacts picker or manual entry. Output: E.164 canonical form, or null if
 * the number cannot be reliably normalized.
 *
 * WHAT THIS MODULE IS NOT
 * ───────────────────────
 * - Not a proof of identity. A normalized number ≠ verified number.
 * - Not a claim mechanism. Normalization alone never links two people.
 * - Not to be used to expose, score, or merge persons on the client side.
 * - Not a substitute for server-side OTP verification.
 *
 * The E.164 form returned here must only be used to:
 *   1. Drive the SMS/WhatsApp delivery URL (replacing the current ad-hoc
 *      replace(/\s/g, '') pattern in phone-invite-sheet.ts).
 *   2. Compute a backend hash in a future `register_phone_invite_anchor` RPC.
 *
 * The raw anchorValue in the store remains unchanged — this helper does not
 * persist anything.
 */

import { parsePhoneNumber, type CountryCode } from 'libphonenumber-js/mobile';

export type NormalizedPhone = {
  /** E.164 canonical form, e.g. "+33612345678". */
  e164: string;
  /** ISO 3166-1 alpha-2 country code resolved by the parser, e.g. "FR". */
  country?: string;
  /** National significant number without country code, e.g. "612345678". */
  nationalNumber?: string;
};

/**
 * Parses and normalizes a raw phone number string to E.164.
 *
 * @param rawPhone       The phone number as received from expo-contacts or
 *                       manual entry. Any format is accepted (+33, 06, 0033…).
 * @param defaultCountry ISO 3166-1 alpha-2 hint used when the number has no
 *                       international prefix (e.g. "FR", "US"). Ignored when
 *                       the number already includes a country code (+33…).
 *                       OPEN: without this hint, local numbers (e.g. "06 12 34 56 78")
 *                       return null. expo-contacts may expose phoneNumbers[n].countryCode
 *                       on iOS, but this field is absent on many contacts.
 *                       The device locale is the next best fallback.
 *                       Resolving the defaultCountry sourcing strategy is part of
 *                       the future pending_phone_anchor backend sprint — do not
 *                       assume it is already solved.
 * @returns Normalized form, or null if the number is missing, too short,
 *          invalid, or cannot be resolved to a valid mobile number.
 */
export function normalizePhoneForAnchor(
  rawPhone: string,
  defaultCountry?: string,
): NormalizedPhone | null {
  if (!rawPhone || !rawPhone.trim()) return null;

  try {
    const parsed = parsePhoneNumber(
      rawPhone.trim(),
      defaultCountry as CountryCode | undefined,
    );

    if (!parsed || !parsed.isValid()) return null;

    return {
      e164: parsed.format('E.164'),
      country: parsed.country,
      nationalNumber: parsed.nationalNumber,
    };
  } catch {
    // parsePhoneNumber throws ParseError on clearly invalid input.
    // Return null — callers must handle absence gracefully.
    return null;
  }
}
