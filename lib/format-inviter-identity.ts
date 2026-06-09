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

/**
 * Normalizes a handle for display: trims surrounding whitespace and strips
 * any leading '@' (or repeated '@'s). Returns null when the result is empty
 * so callers can treat the handle as absent.
 *
 * Why: Baobab stores some handles with the '@' prefix (e.g. '@yasmine.baobab',
 * see store seed) and some without. Without normalization, naive composition
 * `(@${handle})` produces double '@', e.g. '(@@yasmine.baobab)'.
 */
export function normalizeInviterHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const stripped = raw.trim().replace(/^@+/, '');
  return stripped || null;
}

export function formatInviterPrompt(preview: InvitePreviewResult | null): string {
  if (!preview) return FALLBACK;
  const name = preview.inviter_display_name?.trim();
  if (!name) return FALLBACK;
  const handle = normalizeInviterHandle(preview.inviter_handle);
  if (handle) return `${name} (@${handle}) opened a private space with you.`;
  return `${name} opened a private space with you.`;
}
