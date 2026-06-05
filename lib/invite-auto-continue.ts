/**
 * Pure helper for the post-identity auto-continue gate in the invite flow.
 *
 * After B creates their identity, InviteIdentityScreen redirects back to
 * InviteArrivalScreen with continueAfterIdentity='1'. This helper decides
 * whether to resume B's explicit intent (the prior tap on "Continue and read")
 * by triggering handleAddMySide automatically — claim + bootstrap + Evaluate.
 *
 * Doctrine guards:
 *   - continueAfterIdentity must be exactly '1' (signal from identity screen).
 *   - hasLocalIdentity must be true (never auto-continue without B's name).
 *   - token must be non-empty (never claim without a valid invite token).
 *   - no in-flight submit, no claim error, no broken link, no unresolved
 *     continuation — auto-continue only on a clean nominal state.
 *
 * No React, no router, no I/O. Trivially testable.
 */
export type InviteAutoContinueInput = {
  continueAfterIdentity: string | undefined;
  hasLocalIdentity: boolean;
  token: string | undefined;
  isSubmitting: boolean;
  claimError: string | null;
  brokenLink: boolean;
  showUnresolvedContinuation: boolean;
};

export function shouldAutoContinueInvite(input: InviteAutoContinueInput): boolean {
  if (input.continueAfterIdentity !== '1') return false;
  if (!input.hasLocalIdentity) return false;
  if (!input.token || !input.token.trim()) return false;
  if (input.isSubmitting) return false;
  if (input.claimError) return false;
  if (input.brokenLink) return false;
  if (input.showUnresolvedContinuation) return false;
  return true;
}
