import type { Relation, RelationshipRevealSnapshot } from '../store/useRelationsStore';
import {
  deriveRelationAnchorMode,
  deriveRelationDepth,
  getNormalizedPrivateLabel,
  type RelationDepth,
} from './relation-model';

export type RelationIdentityAnnotation = {
  label: string;
  subtext: string | null;
};

export type RelationContextCard = {
  title: string;
  body: string;
};

export type RelationSheetIdentity = {
  privateLabel: string;
  primaryTitle: string;
  titleEyebrow: string;
  supportingText: string | null;
  stateLabel: string;
  relationDepth: RelationDepth;
  relationDepthLabel: string;
  anchorLabel: string;
  anchorValue: string;
  anchorHint: string | null;
};

export type RelationNextAction = {
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaKind: 'evaluate' | 'invite' | 'reveal' | 'resend' | null;
};

type RevealStatus = RelationshipRevealSnapshot['status'];

function isSharedBackedRelation(
  relation: Pick<Relation, 'canonicalRelationId' | 'source'>,
): boolean {
  return (
    !!relation.canonicalRelationId ||
    relation.source === 'bootstrap' ||
    relation.source === 'claim'
  );
}

function maskPhoneAnchor(anchorValue?: string | null): string | null {
  if (!anchorValue) return null;
  const digits = anchorValue.replace(/\D/g, '');
  if (digits.length >= 4) return `Ends in ${digits.slice(-4)}`;
  if (digits.length > 0) return 'Number saved on this device';
  return null;
}

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
      title: 'Archived',
      body: 'No longer in your active network.',
    };
  }

  if (relation.source === 'invite_number') {
    return {
      title: 'Invite sent',
      body: 'Waiting for them to join.',
    };
  }

  const isSharedBacked = isSharedBackedRelation(relation);

  if (isSharedBacked) {
    return {
      title: 'Shared connection',
      body: 'Both sides are connected.',
    };
  }

  if (relation.source === 'scan') {
    return {
      title: 'Added from scan',
      body: 'Not yet a shared relationship.',
    };
  }

  if (relation.source === 'manual') {
    return {
      title: 'Private draft',
      body: 'Only on this device — not shared yet.',
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
  if (nameRevealed) return 'Reading is one layer of this link.';
  if (revealStatus === 'reveal_ready') return 'The reveal is a one-time action.';
  return 'Your reading stays private until both sides share.';
}

export function getTemporaryRelationDepth(input: {
  relation: Pick<Relation, 'anchorMode' | 'canonicalRelationId' | 'localState' | 'source'>;
}): RelationDepth {
  return deriveRelationDepth(input.relation);
}

export function getRelationSheetIdentity(input: {
  relation: Pick<
    Relation,
    | 'name'
    | 'privateLabel'
    | 'archived'
    | 'source'
    | 'anchorMode'
    | 'handle'
    | 'sourceHandle'
    | 'anchorValue'
    | 'canonicalRelationId'
    | 'relationDepth'
    | 'localState'
  >;
}): RelationSheetIdentity {
  const { relation } = input;
  const relationDepth = relation.relationDepth ?? getTemporaryRelationDepth({ relation });
  const relationDepthLabel =
    relationDepth === 'encounter'
      ? 'Encounter'
      : relationDepth === 'known'
        ? 'Known'
        : 'Deep';
  const privateLabel = getNormalizedPrivateLabel(relation);
  const anchorMode = deriveRelationAnchorMode(relation);

  if (anchorMode === 'invite_number') {
    const isRevealed = relation.localState.revealSnapshot.status === 'revealed';
    return {
      privateLabel,
      primaryTitle: privateLabel,
      titleEyebrow: isRevealed ? 'Shared connection' : 'Added by phone',
      supportingText: null,
      stateLabel: relation.archived ? 'Archived' : (isRevealed ? 'Shared connection' : 'Private'),
      relationDepth,
      relationDepthLabel,
      anchorLabel: 'Anchored by',
      anchorValue: 'Phone number',
      anchorHint: maskPhoneAnchor(relation.anchorValue) ?? null,
    };
  }

  if (anchorMode === 'claim' || anchorMode === 'bootstrap' || anchorMode === 'shared') {
    const sharedTitle = relation.handle ?? privateLabel;
    const supportingText =
      relation.handle && relation.handle !== privateLabel
        ? `Label: ${privateLabel}`
        : null;
    return {
      privateLabel,
      primaryTitle: sharedTitle,
      titleEyebrow: 'Shared identity',
      supportingText,
      stateLabel: relation.archived ? 'Archived' : 'Shared connection',
      relationDepth,
      relationDepthLabel,
      anchorLabel: 'Anchored by',
      anchorValue: relation.handle ?? 'Shared Baobab connection',
      anchorHint: 'Active on Baobab.',
    };
  }

  if (anchorMode === 'scan') {
    return {
      privateLabel,
      primaryTitle: privateLabel,
      titleEyebrow: 'Scanned contact',
      supportingText: relation.sourceHandle ? `From ${relation.sourceHandle}` : null,
      stateLabel: relation.archived ? 'Archived' : 'Scanned',
      relationDepth,
      relationDepthLabel,
      anchorLabel: 'Anchored by',
      anchorValue: 'Scan',
      anchorHint: null,
    };
  }

  return {
    privateLabel,
    primaryTitle: privateLabel,
    titleEyebrow: 'Private label',
    supportingText: null,
    stateLabel: relation.archived ? 'Archived' : 'Private only',
    relationDepth,
    relationDepthLabel,
    anchorLabel: 'Anchored by',
    anchorValue: 'Local label',
    anchorHint: null,
  };
}

export function getRelationNextAction(input: {
  relation: Pick<Relation, 'archived' | 'source' | 'canonicalRelationId' | 'anchorMode'>;
  hasEvaluation: boolean;
  revealStatus: RevealStatus;
  nameRevealed: boolean;
  deliveryChannelOpened: boolean;
}): RelationNextAction {
  if (input.relation.archived) {
    return {
      title: 'Archived',
      body: 'Not in your active network.',
      ctaLabel: null,
      ctaKind: null,
    };
  }

  if (!input.hasEvaluation) {
    return {
      title: 'Start with a private reading',
      body: 'Stays private until both sides are in.',
      ctaLabel: 'Read this relationship',
      ctaKind: 'evaluate',
    };
  }

  if (input.nameRevealed) {
    return {
      title: 'Shared reading open',
      body: 'See it below.',
      ctaLabel: null,
      ctaKind: null,
    };
  }

  if (input.revealStatus === 'reveal_ready') {
    return {
      title: 'Reveal is ready',
      body: 'Both sides are in.',
      ctaLabel: 'Reveal now',
      ctaKind: 'reveal',
    };
  }

  if (input.revealStatus === 'cooking_reveal') {
    return {
      title: 'Preparing',
      body: 'Both sides are in.',
      ctaLabel: null,
      ctaKind: null,
    };
  }

  if (input.revealStatus === 'waiting_other_side') {
    const isInviteNumber = deriveRelationAnchorMode(input.relation) === 'invite_number';

    if (isInviteNumber && input.deliveryChannelOpened) {
      return {
        title: 'Invite sent',
        body: 'Waiting for them.',
        ctaLabel: 'Send again',
        ctaKind: 'resend',
      };
    }

    if (input.relation.source === 'claim') {
      return {
        title: 'Reading saved',
        body: 'Preparing the shared view.',
        ctaLabel: null,
        ctaKind: null,
      };
    }

    return {
      title: isInviteNumber
        ? 'Reading saved'
        : 'Waiting for the other side',
      body: isInviteNumber
        ? 'Send invite to continue.'
        : (isSharedBackedRelation(input.relation) ? 'Waiting on their side.' : 'Ready when they join.'),
      ctaLabel: isInviteNumber ? 'Send invite' : 'Invite them',
      ctaKind: 'invite',
    };
  }

  return {
    title: 'Private reading saved',
    body: 'No shared step yet.',
    ctaLabel: null,
    ctaKind: null,
  };
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
