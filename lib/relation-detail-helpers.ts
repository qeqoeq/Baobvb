import type { Relation, RelationshipRevealSnapshot } from '../store/useRelationsStore';

export type RelationIdentityAnnotation = {
  label: string;
  subtext: string | null;
};

export type RelationContextCard = {
  title: string;
  body: string;
};

type RevealStatus = RelationshipRevealSnapshot['status'];

/**
 * Returns the identity annotation for a relation: how the person's identity was established.
 * Pure — depends only on identityStatus and sourceHandle.
 */
export function getRelationIdentityAnnotation(
  relation: Pick<Relation, 'identityStatus' | 'sourceHandle'>,
): RelationIdentityAnnotation {
  const label =
    relation.identityStatus === 'verified' ? 'Verified by scan' : 'Added manually';
  const subtext =
    relation.identityStatus === 'verified' && relation.sourceHandle
      ? `Scanned from ${relation.sourceHandle}`
      : null;
  return { label, subtext };
}

/**
 * Returns the relation context card to display in the metaZone, or null if no card applies.
 * Captures the 5-branch decision: archived > shared-backed > scan draft > manual draft > none.
 * Pure — depends only on archived, canonicalRelationId, and source.
 */
export function getRelationContextCard(
  relation: Pick<Relation, 'archived' | 'canonicalRelationId' | 'source'>,
): RelationContextCard | null {
  if (relation.archived) {
    return {
      title: 'Archived relation',
      body: 'This relation is archived locally and no longer appears in your active trust network.',
    };
  }

  const isSharedBacked =
    !!relation.canonicalRelationId ||
    relation.source === 'bootstrap' ||
    relation.source === 'claim';

  if (isSharedBacked) {
    return {
      title: 'Shared-backed relation',
      body: 'This relation is backed by a shared record. Shared status does not imply a merged local history.',
    };
  }

  if (relation.source === 'scan') {
    return {
      title: 'Local scan draft',
      body: 'This is a local draft created from a scanned public profile. It is not a shared relation.',
    };
  }

  if (relation.source === 'manual') {
    return {
      title: 'Local draft',
      body: 'This relation currently exists only on this device and is not shared.',
    };
  }

  return null;
}

/**
 * Returns the tier label visible in the badge.
 * - Revealed + has reading → named badge label (e.g. "Anchor")
 * - Not revealed + has reading → "Private reading"
 * - No reading → "Unread"
 * Pure — depends only on reveal state and reading presence.
 */
export function getVisibleTierLabel(
  nameRevealed: boolean,
  hasEvaluation: boolean,
  badgeLabel: string,
): string {
  if (nameRevealed && hasEvaluation) return badgeLabel;
  if (hasEvaluation) return 'Private reading';
  return 'Unread';
}

/**
 * Returns the reading note shown below the reading section.
 * Pure — depends only on reveal state.
 */
export function getReadingNoteText(nameRevealed: boolean, revealStatus: RevealStatus): string {
  if (nameRevealed) return 'This reading helps define how this connection is understood.';
  if (revealStatus === 'reveal_ready') return 'Opening the reveal is a one-time action.';
  return 'Your private side is saved and stays hidden until reveal.';
}

/**
 * The 6 mutually exclusive states of the reading card.
 * Replaces the 3-level ternary nesting in the relation detail screen.
 */
export type ReadingCardVariant =
  | 'unread'
  | 'revealed'
  | 'reveal_ready'
  | 'waiting_other_side'
  | 'cooking'
  | 'private_fallback';

/**
 * Resolves the active reading card variant from evaluation presence and reveal state.
 * The order of checks matters: reveal_ready exits the privateStateCard path; the inner
 * waiting/cooking/fallback branches share a common wrapper and are checked last.
 * Pure — no side effects.
 */
export function getReadingCardVariant(input: {
  hasEvaluation: boolean;
  nameRevealed: boolean;
  revealStatus: RevealStatus;
}): ReadingCardVariant {
  if (!input.hasEvaluation) return 'unread';
  if (input.nameRevealed) return 'revealed';
  if (input.revealStatus === 'reveal_ready') return 'reveal_ready';
  if (input.revealStatus === 'waiting_other_side') return 'waiting_other_side';
  if (input.revealStatus === 'cooking_reveal') return 'cooking';
  return 'private_fallback';
}
