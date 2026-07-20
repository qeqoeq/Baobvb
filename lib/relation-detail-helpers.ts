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
  if (digits.length >= 4) return `Se termine par ${digits.slice(-4)}`;
  if (digits.length > 0) return 'Numéro enregistré sur cet appareil';
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
    relation.identityStatus === 'verified' ? 'Vérifié par scan' : 'Ajouté manuellement';
  const subtext =
    relation.identityStatus === 'verified' && relation.sourceHandle
      ? `Scanné depuis ${relation.sourceHandle}`
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
      title: 'Archivé',
      body: 'N’est plus dans ton réseau actif.',
    };
  }

  if (relation.source === 'invite_number') {
    return {
      title: 'Invitation envoyée',
      body: 'En attente de sa réponse.',
    };
  }

  const isSharedBacked = isSharedBackedRelation(relation);

  if (isSharedBacked) {
    return {
      title: 'Connexion partagée',
      body: 'Les deux côtés sont connectés.',
    };
  }

  if (relation.source === 'scan') {
    return {
      title: 'Ajouté par scan',
      body: 'Pas encore une relation partagée.',
    };
  }

  if (relation.source === 'manual') {
    return {
      title: 'Brouillon privé',
      body: 'Seulement sur cet appareil — pas encore partagé.',
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
  if (hasEvaluation) return 'Lecture privée';
  return 'Non lu';
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
  if (nameRevealed) return 'Une lecture partagée est une direction, pas un verdict.';
  if (revealStatus === 'reveal_ready') return 'La révélation est une action unique.';
  return 'Ta lecture reste privée jusqu’à ce que les deux côtés partagent.';
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
      ? 'Rencontre'
      : relationDepth === 'known'
        ? 'Connu'
        : 'Profond';
  const privateLabel = getNormalizedPrivateLabel(relation);
  const anchorMode = deriveRelationAnchorMode(relation);

  if (anchorMode === 'invite_number') {
    const isRevealed = relation.localState.revealSnapshot.status === 'revealed';
    return {
      privateLabel,
      primaryTitle: privateLabel,
      titleEyebrow: isRevealed ? 'Connexion partagée' : 'Ajouté par téléphone',
      supportingText: null,
      stateLabel: relation.archived ? 'Archivé' : (isRevealed ? 'Connexion partagée' : 'Privé'),
      relationDepth,
      relationDepthLabel,
      anchorLabel: 'Ancré par',
      anchorValue: 'Numéro de téléphone',
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
      titleEyebrow: 'Identité partagée',
      supportingText,
      stateLabel: relation.archived ? 'Archivé' : 'Connexion partagée',
      relationDepth,
      relationDepthLabel,
      anchorLabel: 'Ancré par',
      anchorValue: handleDisplay ?? 'Connexion Baobab partagée',
      anchorHint: 'Actif sur Baobab.',
    };
  }

  if (anchorMode === 'scan') {
    return {
      privateLabel,
      primaryTitle: privateLabel,
      titleEyebrow: 'Contact scanné',
      supportingText: relation.sourceHandle ? `Depuis ${relation.sourceHandle}` : null,
      stateLabel: relation.archived ? 'Archivé' : 'Scanné',
      relationDepth,
      relationDepthLabel,
      anchorLabel: 'Ancré par',
      anchorValue: 'Scan',
      anchorHint: null,
    };
  }

  return {
    privateLabel,
    primaryTitle: privateLabel,
    titleEyebrow: 'Étiquette privée',
    supportingText: null,
    stateLabel: relation.archived ? 'Archivé' : 'Privé',
    relationDepth,
    relationDepthLabel,
    anchorLabel: 'Ancré par',
    anchorValue: 'Étiquette locale',
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
      title: 'Archivé',
      body: 'Pas dans ton réseau actif.',
      ctaLabel: null,
      ctaKind: null,
    };
  }

  if (input.nameRevealed) {
    return {
      title: 'Vue partagée débloquée',
      body: 'Vous pouvez maintenant lire cette connexion ensemble.',
      ctaLabel: null,
      ctaKind: null,
    };
  }

  // Server says revealed but this side hasn't opened locally yet (bootstrapped relation,
  // or cold-boot after the other side completed the reveal). Show the open button so the
  // cinematic plays on first view — same UX as reveal_ready, no score info exposed.
  if (input.revealStatus === 'revealed') {
    return {
      title: 'Vous y êtes tous les deux',
      body: 'Ouvre ce que Baobab a trouvé.',
      ctaLabel: 'Ouvrir la révélation',
      ctaKind: 'reveal',
    };
  }

  // reveal_ready is checked before hasEvaluation: the server confirms both sides submitted
  // readings, even when no local evaluation exists (bootstrap / claim relations).
  if (input.revealStatus === 'reveal_ready') {
    return {
      title: 'Vous y êtes tous les deux',
      body: 'Ouvre ce que Baobab a trouvé.',
      ctaLabel: 'Ouvrir la révélation',
      ctaKind: 'reveal',
    };
  }

  if (!input.hasEvaluation) {
    return {
      title: 'Commence par une lecture privée',
      body: 'Reste privée jusqu’à ce que les deux côtés y soient.',
      ctaLabel: 'Lire cette relation',
      ctaKind: 'evaluate',
    };
  }

  if (input.revealStatus === 'cooking_reveal') {
    return {
      title: 'Les deux côtés y sont',
      body: 'La révélation se prépare.',
      ctaLabel: null,
      ctaKind: null,
    };
  }

  if (input.revealStatus === 'waiting_other_side') {
    const isInviteNumber = deriveRelationAnchorMode(input.relation) === 'invite_number';

    if (input.deliveryChannelOpened) {
      return {
        title: 'Invitation envoyée',
        body: 'En attente de sa réponse.',
        ctaLabel: 'Renvoyer',
        ctaKind: 'resend',
      };
    }

    if (input.relation.source === 'claim') {
      return {
        title: 'Ton côté est prêt',
        body: 'Lecture privée enregistrée. La révélation attend les deux côtés.',
        ctaLabel: null,
        ctaKind: null,
      };
    }

    return {
      title: 'Ton côté est prêt',
      body: isInviteNumber
        ? 'Envoie l’invitation pour l’ouvrir ensemble.'
        : 'Lecture privée enregistrée. La révélation attend les deux côtés.',
      ctaLabel: isInviteNumber ? 'Envoyer l’invitation' : 'Inviter',
      ctaKind: 'invite',
    };
  }

  return {
    title: 'Lecture privée enregistrée',
    body: 'Pas encore d’étape partagée.',
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
  // Server-revealed but not locally opened yet — treat as reveal_ready so the
  // "Open reveal" CTA renders and the reading section stays non-revealing.
  if (input.revealStatus === 'revealed') return 'reveal_ready';
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
    return { kind: 'score', score: input.visibleScore, tier: input.revealedTier ?? 'Lecture partagée' };
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
        'Cette connexion est à la fois sûre et naturelle.',
        'La confiance tient, et être ensemble ne demande presque aucune traduction.',
      ],
    };
  }

  if (t === 'high' && a === 'low') {
    return {
      kind: 'safer_than_intimate',
      lines: [
        'Ce lien est fiable, même s’il ne semble pas particulièrement proche.',
        'Il est peut-être plus sûr qu’intime.',
      ],
    };
  }

  if (t === 'low' && a === 'high') {
    return {
      kind: 'resonance_without_trust',
      lines: [
        'Il y a de la résonance ici, mais la confiance fait encore ses preuves.',
        'Baobab garderait cette connexion privée pour l’instant.',
      ],
    };
  }

  if (t === 'high' && a === 'medium') {
    return {
      kind: 'trust_as_anchor',
      lines: [
        'La confiance est la couche la plus forte ici.',
        'La connexion pourrait s’approfondir avec plus de rythme partagé.',
      ],
    };
  }

  if (t === 'medium' && a === 'high') {
    return {
      kind: 'ease_without_proof',
      lines: [
        'Il y a de l’aisance ici, mais la couche plus profonde n’est pas encore pleinement prouvée.',
        'La confiance pourrait suivre avec plus de rythme partagé.',
      ],
    };
  }

  return {
    kind: 'still_finding_shape',
    lines: [
      'Cette connexion cherche encore sa forme.',
      'Baobab a besoin de plus de preuves partagées avant d’ouvrir des signaux plus profonds.',
    ],
  };
}
