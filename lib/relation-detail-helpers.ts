import type { Relation, RelationshipRevealSnapshot } from '../store/useRelationsStore';
import { normalizeInviterHandle } from './format-inviter-identity';
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
  // Post-reveal closing note: frames the shared reading as a direction, not
  // a verdict. Doctrine: Baobab is a private GPS for relationships, not a
  // social rating system. The reading helps orient how to read the link,
  // without reducing it to a score, label, or definitive judgement.
  if (nameRevealed) return 'A shared reading is a direction, not a verdict.';
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
    // Doctrine: the human displayName (carried by privateLabel, which is
    // sourced from the inviter snapshot for 'claim') is the primary
    // identity. The handle is a secondary identifier rendered as a discreet
    // "@handle" subtitle. The handle never replaces the human name.
    const normalizedHandle = normalizeInviterHandle(relation.handle);
    const handleDisplay = normalizedHandle ? `@${normalizedHandle}` : null;
    const supportingText =
      handleDisplay && handleDisplay !== privateLabel ? handleDisplay : null;
    return {
      privateLabel,
      primaryTitle: privateLabel,
      titleEyebrow: 'Shared identity',
      supportingText,
      stateLabel: relation.archived ? 'Archived' : 'Shared connection',
      relationDepth,
      relationDepthLabel,
      anchorLabel: 'Anchored by',
      anchorValue: handleDisplay ?? 'Shared Baobab connection',
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
    stateLabel: relation.archived ? 'Archived' : 'Private',
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

  if (input.nameRevealed) {
    return {
      title: 'Shared view unlocked',
      body: 'You can now read this connection together.',
      ctaLabel: null,
      ctaKind: null,
    };
  }

  // reveal_ready is checked before hasEvaluation: the server confirms both sides submitted
  // readings, even when no local evaluation exists (bootstrap / claim relations).
  if (input.revealStatus === 'reveal_ready') {
    return {
      title: 'You\'re both in',
      body: 'Open what Baobab found.',
      ctaLabel: 'Open reveal',
      ctaKind: 'reveal',
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

  if (input.revealStatus === 'cooking_reveal') {
    return {
      title: 'Both sides are in',
      body: 'The reveal is being prepared.',
      ctaLabel: null,
      ctaKind: null,
    };
  }

  if (input.revealStatus === 'waiting_other_side') {
    const isInviteNumber = deriveRelationAnchorMode(input.relation) === 'invite_number';

    if (input.deliveryChannelOpened) {
      return {
        title: 'Invite sent',
        body: 'Waiting for them.',
        ctaLabel: 'Send again',
        ctaKind: 'resend',
      };
    }

    if (input.relation.source === 'claim') {
      return {
        title: 'Your side is in',
        body: 'Private reading saved. The reveal waits for both sides.',
        ctaLabel: null,
        ctaKind: null,
      };
    }

    return {
      title: 'Your side is in',
      body: isInviteNumber
        ? 'Send the invite to open it together.'
        : 'Private reading saved. The reveal waits for both sides.',
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
  if (input.nameRevealed) return 'revealed';
  if (!input.hasEvaluation) return 'unread';
  if (input.revealStatus === 'reveal_ready') return 'reveal_ready';
  if (input.revealStatus === 'waiting_other_side') return 'waiting_other_side';
  if (input.revealStatus === 'cooking_reveal') return 'cooking';
  return 'private_fallback';
}

/**
 * Internal display state carrier for the shared reading section. Carries the
 * numeric `score` field because downstream non-display consumers (Garden
 * ordering, Atlas circle membership, recommendation weights) need to read
 * it through the same precedence/gating layer.
 *
 * INTERNAL DOCTRINE — never render `score` directly in a human-relation UI
 * surface. For any new human-relation display, consume the doctrine-safe
 * contract `HumanRelationRevealDisplay` from `./human-reading-display`
 * instead, which strips the numeric score by construction.
 *
 * If non-human rating surfaces are introduced later, they should use a
 * distinct display contract and must not reuse this type.
 */
export type SharedRevealDisplayState =
  | { kind: 'score'; score: number; tier: string }
  | { kind: 'pending' }
  | { kind: 'hidden' };

/**
 * Determines how the shared reading section gates after mutual reveal.
 * 'score'   — mutual (or private-fallback) score is available internally.
 *             Use this for non-display consumers (Garden, Atlas). For human
 *             display surfaces, route through `getHumanRelationRevealDisplay`
 *             so the numeric score never leaks to the UI.
 * 'pending' — revealed but server has not yet returned a score.
 * 'hidden'  — reveal has not happened.
 */
export function getSharedRevealDisplayState(input: {
  nameRevealed: boolean;
  visibleScore: number | null;
  revealedTier: string | null;
}): SharedRevealDisplayState {
  if (!input.nameRevealed) return { kind: 'hidden' };
  if (input.visibleScore !== null) {
    return { kind: 'score', score: input.visibleScore, tier: input.revealedTier ?? 'Shared reading' };
  }
  return { kind: 'pending' };
}

// ── Deeper Signal v0.1 ───────────────────────────────────────────────────────
//
// Physiorhythmic Link Reading — first deterministic layer.
// Reads Trust + Affinity from the local user's evaluation and produces a short
// editorial interpretation of the link's texture.
//
// Internal thresholds (never surfaced to the user):
//   high   = rating >= 4
//   low    = rating <= 2
//   medium = rating === 3
//
// Architectural constraints:
//   - Local-only: derived from the current user's own ratings.
//   - The other side's ratings are never exposed to the client (privacy by design).
//   - Pure, deterministic, no LLM, no network.
//   - Returns prose only; never reveals the underlying ratings or thresholds.

export type DeeperSignalKind =
  | 'safe_and_natural'        // high trust + high affinity
  | 'safer_than_intimate'     // high trust + low affinity
  | 'resonance_without_trust' // low trust + high affinity
  | 'trust_as_anchor'         // high trust + medium affinity
  | 'ease_without_proof'      // medium trust + high affinity
  | 'still_finding_shape';    // everything else

export type DeeperSignal = {
  kind: DeeperSignalKind;
  lines: string[];
};

function classifyPillar(rating: number): 'high' | 'medium' | 'low' {
  if (rating >= 4) return 'high';
  if (rating <= 2) return 'low';
  return 'medium';
}

/**
 * Returns a Deeper Signal reading from Trust + Affinity ratings.
 * Pure — no I/O, no randomness, no time dependency.
 */
export function getDeeperSignal(input: {
  trust: number;
  affinity: number;
}): DeeperSignal {
  const t = classifyPillar(input.trust);
  const a = classifyPillar(input.affinity);

  if (t === 'high' && a === 'high') {
    return {
      kind: 'safe_and_natural',
      lines: [
        'This connection feels both safe and natural.',
        'Trust holds, and being together does not ask for much translation.',
      ],
    };
  }

  if (t === 'high' && a === 'low') {
    return {
      kind: 'safer_than_intimate',
      lines: [
        'This link is reliable, even if it does not feel especially close.',
        'It may be safer than it is intimate.',
      ],
    };
  }

  if (t === 'low' && a === 'high') {
    return {
      kind: 'resonance_without_trust',
      lines: [
        'There is resonance here, but trust is still proving itself.',
        'Baobab would keep this connection private for now.',
      ],
    };
  }

  if (t === 'high' && a === 'medium') {
    return {
      kind: 'trust_as_anchor',
      lines: [
        'Trust is the strongest layer here.',
        'The connection may deepen with more shared rhythm.',
      ],
    };
  }

  if (t === 'medium' && a === 'high') {
    return {
      kind: 'ease_without_proof',
      lines: [
        'There is ease here, but the deeper layer is not fully proven yet.',
        'Trust may follow with more shared rhythm.',
      ],
    };
  }

  return {
    kind: 'still_finding_shape',
    lines: [
      'This connection is still finding its shape.',
      'Baobab needs more shared evidence before opening deeper signals.',
    ],
  };
}
