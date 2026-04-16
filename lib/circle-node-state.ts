import type { FoundationalReadingDerived } from './foundational-reading';
import { colors } from '../constants/colors';

// ─── Status ───────────────────────────────────────────────────────────────────

/**
 * Flow-based display state for a relation in the Circle views.
 * Encodes where the relation sits in the reveal lifecycle, plus the
 * post-reveal nurture signal. Never encodes tier, score, or pillar data.
 */
export type CircleNodeStatus =
  | 'revealed_stable'
  | 'revealed_to_nurture'
  | 'ready'
  | 'cooking'
  | 'waiting_other_side'
  | 'unread';

function isRevealComplete(reading: FoundationalReadingDerived): boolean {
  const snap = reading.relation.localState.revealSnapshot;
  return (
    snap.status === 'revealed' ||
    snap.revealed === true ||
    (reading.relation.relationshipNameRevealed ?? false)
  );
}

/**
 * Single source of truth for Circle display state.
 * Used by both the List and Map views to derive node state.
 * Does NOT return tier, score, or pillar information.
 */
export function getCircleNodeStatus(reading: FoundationalReadingDerived): CircleNodeStatus {
  if (isRevealComplete(reading)) {
    return reading.toNurture ? 'revealed_to_nurture' : 'revealed_stable';
  }
  const snap = reading.relation.localState.revealSnapshot.status;
  if (snap === 'reveal_ready') return 'ready';
  if (snap === 'cooking_reveal') return 'cooking';
  if (reading.hasFoundationalReading) return 'waiting_other_side';
  return 'unread';
}

/** Neutral display label — never a tier name. */
export function getCircleNodeStatusLabel(status: CircleNodeStatus): string {
  switch (status) {
    case 'revealed_stable':     return 'Stable';
    case 'revealed_to_nurture': return 'To nurture';
    case 'ready':               return 'Ready';
    case 'cooking':             return 'Preparing';
    case 'waiting_other_side':  return 'Waiting';
    case 'unread':              return 'Unread';
  }
}

const STATUS_SORT_WEIGHT: Record<CircleNodeStatus, number> = {
  ready:               0,
  revealed_stable:     1,
  revealed_to_nurture: 2,
  cooking:             3,
  waiting_other_side:  4,
  unread:              5,
};

/**
 * Sort weight for stable, deterministic ego graph layout.
 * Lower = higher visual priority (placed first in layout traversal).
 * Caller must apply a secondary sort (name, then id) to fully stabilize order.
 */
export function getCircleNodeSortWeight(status: CircleNodeStatus): number {
  return STATUS_SORT_WEIGHT[status];
}

/** Status dot color. Encodes flow stage, not tier. */
export const CIRCLE_NODE_STATUS_COLOR: Record<CircleNodeStatus, string> = {
  revealed_stable:     colors.accent.mutedSage,
  revealed_to_nurture: colors.accent.softCoral,
  ready:               colors.accent.deepTeal,
  cooking:             colors.text.secondary,
  waiting_other_side:  colors.accent.warmGold,
  unread:              colors.accent.warmGold,
};

// ─── Proximity ────────────────────────────────────────────────────────────────

export type Proximity = 'direct' | 'near' | 'far';

/**
 * Derives the list-view proximity bucket for a relation.
 * Rules (in order):
 *   - archived                    → far
 *   - no foundational reading     → far
 *   - mutually revealed + nurture → near
 *   - mutually revealed           → direct
 *   - not yet revealed            → direct  (never 'near' — no quality leak)
 */
export function deriveCircleProximity(reading: FoundationalReadingDerived): Proximity {
  if (reading.relation.archived) return 'far';
  if (!reading.hasFoundationalReading) return 'far';
  if (isRevealComplete(reading)) {
    return reading.toNurture ? 'near' : 'direct';
  }
  return 'direct';
}

// ─── Graph member ─────────────────────────────────────────────────────────────

/** Minimal shape required to render a node in the ego graph. */
export type EgoGraphMember = {
  id: string;
  name: string;
  status: CircleNodeStatus;
  avatarSeed?: string;
};

// ─── Sort + bucket ────────────────────────────────────────────────────────────

export type SortedBucketResult = {
  visible: EgoGraphMember[];
  overflowCount: number;
};

/**
 * Sorts members deterministically (status weight → name → id) and
 * splits into visible + overflow count.
 * Pure — no side effects, safe to test directly.
 */
export function sortAndBucketEgoMembers(
  members: EgoGraphMember[],
  maxVisible = 20,
): SortedBucketResult {
  const sorted = [...members].sort((a, b) => {
    const dw = getCircleNodeSortWeight(a.status) - getCircleNodeSortWeight(b.status);
    if (dw !== 0) return dw;
    const dn = a.name.localeCompare(b.name);
    if (dn !== 0) return dn;
    return a.id.localeCompare(b.id);
  });
  return {
    visible: sorted.slice(0, maxVisible),
    overflowCount: Math.max(0, sorted.length - maxVisible),
  };
}

// ─── Layout ───────────────────────────────────────────────────────────────────

export type EgoLayoutNode = {
  id: string;
  cx: number;
  cy: number;
};

export type CanvasSize = {
  width: number;
  height: number;
};

/** Half-diameter of a visible relation node in dp. */
export const NODE_RADIUS = 22;

/**
 * Places nodeIds evenly on a regular polygon around the canvas center.
 * Returns [] when canvas dimensions are zero (pre-layout measurement).
 *
 * IMPORTANT: nodeIds must be sorted deterministically by the caller before
 * calling this function. computeEgoLayout is layout-only and never reorders.
 */
export function computeEgoLayout(nodeIds: string[], canvas: CanvasSize): EgoLayoutNode[] {
  if (canvas.width === 0 || canvas.height === 0 || nodeIds.length === 0) return [];

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  // Reserve space for orbit node radius + label text below node + breathing room
  const margin = NODE_RADIUS + 36;
  const radius = Math.max(NODE_RADIUS * 3, Math.min(cx, cy) - margin);

  return nodeIds.map((id, i) => {
    // Start at top (−π/2), traverse clockwise
    const angle = (2 * Math.PI * i) / nodeIds.length - Math.PI / 2;
    return {
      id,
      cx: cx + radius * Math.cos(angle),
      cy: cy + radius * Math.sin(angle),
    };
  });
}
