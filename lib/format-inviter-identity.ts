import type { InvitePreviewResult } from './reveal-shared-types';

/**
 * Pure formatter for the InviteArrivalScreen first body line.
 *
 * Doctrine:
 *   - Falls back to "Someone opened a private space with you." when the
 *     preview is unavailable, the displayName is empty/whitespace, or any
 *     other degraded case. Never displays UUIDs or raw IDs.
 *   - Handle is shown as `(@handle)` when present and non-empty.
 *   - Pure, no React, no I/O. Trivially testable.
 */
const FALLBACK = 'Someone opened a private space with you.';

export function formatInviterPrompt(preview: InvitePreviewResult | null): string {
  if (!preview) return FALLBACK;
  const name = preview.inviter_display_name?.trim();
  if (!name) return FALLBACK;
  const handle = preview.inviter_handle?.trim();
  if (handle) return `${name} (@${handle}) opened a private space with you.`;
  return `${name} opened a private space with you.`;
}
