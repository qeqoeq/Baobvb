// Private route object fit — combines a PrivateObjectFit (X.59) with a
// minimal human route context, strictly gated.
//
// Doctrine:
//   - this file NEVER reads or exposes sourceRelationId, a relation id, or
//     any source name — PrivateRouteObjectFitRouteContext structurally
//     cannot carry them, and the output never echoes them back;
//   - this file NEVER reads shareSafe, PrivateTasteSimilarity, or
//     PrivateFitEvidence — all three were explicitly excluded from V0 by
//     X.60-pré (responsibility-of-sharing, recipient-ranking, and
//     event-based source evidence respectively belong to later, separate
//     layers, never to this one);
//   - trust is a gate, never a taste multiplier. It can only block or
//     allow a route — it never increases objectFit.value, never increases
//     confidence beyond objectFit.confidence, and never rescues an
//     insufficiently-proven objectFit;
//   - this file NEVER produces a recommendation, a ranking, a "best
//     match", a "send this", a candidate, a visible score, or a moral
//     label on a person;
//   - this file is strictly directional and bounded to the only route
//     direction the rest of the codebase actually captures: an object
//     that has already arrived via a source relation, toward the current
//     user. It is never used to decide whether to send an object to
//     someone else — that direction is not supported by any data this
//     codebase captures today (X.60-pré §11);
//   - no random, no ML, no AI, no date, no full store/relation read — a
//     single, documented, deterministic V0 formula.
//
// What this proves: whether a PrivateObjectFit is usable, AND whether the
// minimal human route context passes the same confidence gate already
// used elsewhere in this codebase for private open worlds / source trust.
// If both hold, this route-object pair MAY be considered later by a
// separate, still-unbuilt candidate layer — nothing more.
// What this never proves: that the object should be sent, that the
// source is right, that the source has good taste, that the recipient
// will like it, or that trust makes the object better.

import { resolvePrivateFitEvidenceSourceTrust } from './private-fit-evidence';
import type { PrivateObjectFit } from './private-object-fit';

export type PrivateRouteObjectFitStatus = 'insufficient_evidence' | 'blocked' | 'usable';
export type PrivateRouteObjectFitRouteStatus = 'not_evaluated' | 'blocked' | 'usable';

/**
 * Minimal, opaque route context — never a relation id, never a name.
 * Mirrors the trust gate already used by canUsePrivateOpenWorlds /
 * resolvePrivateFitEvidenceSourceTrust.
 */
export type PrivateRouteObjectFitRouteContext = {
  isRevealed: boolean;
  trustRating: 1 | 2 | 3 | 4 | 5;
  isArchived?: boolean;
};

export type PrivateRouteObjectFit = {
  status: PrivateRouteObjectFitStatus;
  objectFit: PrivateObjectFit;
  route: {
    status: PrivateRouteObjectFitRouteStatus;
    reasons: string[];
  };
  confidence: number;
  reasons: string[];
};

/**
 * Pure, deterministic combination of a PrivateObjectFit with a minimal
 * route context. Gates on objectFit first — the route is never evaluated
 * if the object itself is not proven. Gates on route trust second, reusing
 * the same doctrinal gate already used elsewhere in this codebase. Never
 * mutates objectFit, never reads or exposes any source identifier.
 */
export function derivePrivateRouteObjectFit(
  objectFit: PrivateObjectFit,
  route: PrivateRouteObjectFitRouteContext,
): PrivateRouteObjectFit {
  if (objectFit.status !== 'usable') {
    return {
      status: 'insufficient_evidence',
      objectFit,
      route: { status: 'not_evaluated', reasons: ['object_fit_insufficient'] },
      confidence: 0,
      reasons: ['object_fit_insufficient'],
    };
  }

  const routeReasons: string[] = [];
  if (route.isArchived === true) routeReasons.push('route_archived');
  if (route.isRevealed !== true) routeReasons.push('route_not_revealed');
  if (route.trustRating < 4) routeReasons.push('route_trust_below_floor');

  const routeIsUsable = resolvePrivateFitEvidenceSourceTrust({
    isRevealed: route.isRevealed,
    trustRating: route.trustRating,
    isArchived: route.isArchived,
  });

  if (!routeIsUsable) {
    return {
      status: 'blocked',
      objectFit,
      route: { status: 'blocked', reasons: routeReasons },
      confidence: 0,
      reasons: routeReasons,
    };
  }

  return {
    status: 'usable',
    objectFit,
    route: { status: 'usable', reasons: [] },
    confidence: objectFit.confidence,
    reasons: [],
  };
}
