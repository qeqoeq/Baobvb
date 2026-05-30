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

export type SortedBucketResult<T extends EgoGraphMember = EgoGraphMember> = {
  visible: T[];
  overflowCount: number;
};

/**
 * Sorts members deterministically (status weight → name → id) and
 * splits into visible + overflow count.
 * Generic: works with EgoGraphMember and any subtype (e.g. MapMember).
 * Pure — no side effects, safe to test directly.
 */
export function sortAndBucketEgoMembers<T extends EgoGraphMember>(
  members: T[],
  maxVisible = 20,
): SortedBucketResult<T> {
  const sorted: T[] = [...members].sort((a, b) => {
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

// ─── Map v2 ───────────────────────────────────────────────────────────────────

/**
 * Semantic proximity band for a relation node in Map v2.
 * 4 values at the data layer; maps to 3 visual orbits (core+close share inner orbit)
 * because 4 well-separated orbits are geometrically unsound on iPhone screen sizes.
 */
export type ProximityBand = 'core' | 'close' | 'outer' | 'edge';

/**
 * Gateway power band — how much this link can open other worlds.
 * PROXY DEBT: derived from sharedNetwork pillar rating (user's subjective perception),
 * not from an actual 2nd-degree trust graph. Replace when neighborhood data exists.
 */
export type GatewayPowerBand = 'strong' | 'moderate' | 'low';

/**
 * Whether the user can currently consult the world through this gateway.
 * - open:   revealed + has gateway power → link is accessible
 * - locked: gateway potential exists but mutual reveal not yet complete
 * - none:   link is not a gateway (low gateway power)
 */
export type GatewayAccessState = 'open' | 'locked' | 'none';

// ─── Link quality ─────────────────────────────────────────────────────────────

/**
 * Visual quality tier for a revealed link.
 * Derived from mutualScore (preferred, bilateral) or foundationalScore (fallback).
 * Only meaningful after mutual reveal — never shown pre-reveal.
 */
export type LinkQualityBand = 'strong' | 'moderate' | 'faint';

export function deriveLinkQualityBand(reading: FoundationalReadingDerived): LinkQualityBand {
  // Quality bands are only meaningful after mutual reveal — pre-reveal stays neutral
  // even when a strong private foundational score exists. This closes the private
  // score leak through the Map / proximity layer.
  if (reading.relation.localState.revealSnapshot.status !== 'revealed') return 'faint';
  // Post-reveal: prefer mutualScore (bilateral truth), fall back to foundationalScore
  // for bootstrap/claim relations where the server may not have set mutualScore yet.
  const score =
    reading.relation.localState.revealSnapshot.mutualScore ??
    reading.foundationalScore;
  if (score === null || score === undefined) return 'faint';
  if (score >= 70) return 'strong';
  if (score >= 40) return 'moderate';
  return 'faint';
}

/** Node fill + stroke by link quality band. Applied only on revealed nodes. */
export const LINK_QUALITY_NODE_COLOR: Record<
  LinkQualityBand,
  { fill: string; fillOpacity: number; stroke: string; strokeOpacity: number; strokeWidth: number }
> = {
  strong:   { fill: colors.accent.deepTeal,     fillOpacity: 0.18, stroke: colors.accent.deepTeal,  strokeOpacity: 0.80, strokeWidth: 1.5 },
  moderate: { fill: colors.accent.mutedSage,     fillOpacity: 0.14, stroke: colors.accent.mutedSage, strokeOpacity: 0.70, strokeWidth: 1   },
  faint:    { fill: colors.background.secondary, fillOpacity: 1,    stroke: colors.border.strong,     strokeOpacity: 1,    strokeWidth: 1   },
};

// ─── Via ──────────────────────────────────────────────────────────────────────

/**
 * Whether a relation is best reached directly or through another relation.
 *
 * V1 CONSTRAINT: declarative only — set explicitly via Relation.viaRelationId.
 * No algorithmic inference from sharedNetwork or score combinations.
 * 2nd-degree trust graph data does not exist yet; any automatic inference
 * would be epistemically false.
 *
 * When the referenced relation is unresolvable (missing, archived, or
 * self-referential), falls back to 'direct'.
 */
export type ViaState =
  | { kind: 'direct' }
  | { kind: 'via'; relId: string; viaName: string };

/**
 * Derives the via state for a relation.
 * activeRelationsById: Map<relationId, name> — only non-archived relations.
 * Returns 'direct' if no viaRelationId is declared or it cannot be resolved.
 */
export function deriveViaState(
  reading: FoundationalReadingDerived,
  activeRelationsById: Map<string, string>,
): ViaState {
  const viaId = reading.relation.viaRelationId;
  if (!viaId) return { kind: 'direct' };
  if (viaId === reading.relation.id) return { kind: 'direct' }; // self-reference guard
  const viaName = activeRelationsById.get(viaId);
  if (!viaName) return { kind: 'direct' };
  return { kind: 'via', relId: viaId, viaName };
}

// ─── Presence mode ────────────────────────────────────────────────────────────

/**
 * V1 presence classification for a revealed relation.
 *
 * 'primarily_via' requires BOTH signals — declarative intent AND data confirmation:
 *   1. viaRelationId is declared and resolves (user says "better through X")
 *   2. linkQualityBand === 'faint' (data confirms the direct link is weak)
 *
 * A strong/moderate direct link + viaRelationId → 'direct':
 * the via annotation is supplementary, not primary classification.
 *
 * Primarily_via nodes remain in the canvas (no alternative home in V1),
 * but are excluded from direct-network metrics (close/gateway/care counts).
 */
export type PresenceMode = 'direct' | 'primarily_via';

export function derivePresenceMode(
  reading: FoundationalReadingDerived,
  viaState: ViaState,
): PresenceMode {
  if (viaState.kind !== 'via') return 'direct';
  return deriveLinkQualityBand(reading) === 'faint' ? 'primarily_via' : 'direct';
}

/** Extended member type for Map v2 — carries full display metrics. */
export type MapMember = EgoGraphMember & {
  proximityBand: ProximityBand;
  gatewayPowerBand: GatewayPowerBand;
  gatewayAccessState: GatewayAccessState;
  linkQualityBand: LinkQualityBand;
  viaState: ViaState;
  presenceMode: PresenceMode;
};

/** Extended layout node for Map v2 — carries render-time metrics. */
export type EgoLayoutNodeV2 = EgoLayoutNode & {
  nodeRadius: number;
  gatewayPowerBand: GatewayPowerBand;
  gatewayAccessState: GatewayAccessState;
};

/** Node display radius by gateway power band. */
export const GATEWAY_NODE_RADIUS: Record<GatewayPowerBand, number> = {
  strong:   26,
  moderate: 19,
  low:      13,
};

/**
 * Proximity band from reveal data.
 *
 * Derivation order:
 *   1. revealed + mutualScore present → 4 bands from score thresholds
 *   2. revealed + no mutualScore → toNurture proxy (outer/close)
 *   3. reveal_ready | cooking_reveal → outer (high reciprocity, pre-reveal)
 *   4. everything else → edge
 */
export function deriveProximityBand(reading: FoundationalReadingDerived): ProximityBand {
  const snap = reading.relation.localState.revealSnapshot;
  if (snap.status === 'revealed') {
    if (snap.mutualScore !== undefined) {
      if (snap.mutualScore >= 75) return 'core';
      if (snap.mutualScore >= 55) return 'close';
      if (snap.mutualScore >= 35) return 'outer';
      return 'edge';
    }
    // No mutualScore available yet: use toNurture as weakest proxy.
    return reading.toNurture ? 'outer' : 'close';
  }
  if (snap.status === 'reveal_ready' || snap.status === 'cooking_reveal') return 'outer';
  return 'edge';
}

/**
 * PROXY DEBT: uses sharedNetwork pillar rating as gateway power.
 * sharedNetwork encodes the user's subjective sense of network overlap with this person.
 * It is NOT an objective count of that person's trusted connections.
 * This must be replaced with real neighborhood data when available.
 */
export function deriveGatewayPowerBand(reading: FoundationalReadingDerived): GatewayPowerBand {
  const rating = reading.foundationalEvaluation?.ratings.sharedNetwork ?? null;
  if (rating === null) return 'low';
  if (rating >= 5) return 'strong';
  if (rating >= 3) return 'moderate';
  return 'low';
}

/**
 * Gateway access state: can the user currently explore what this link offers?
 * Requires gateway power ≥ moderate AND mutual reveal complete for 'open'.
 */
export function deriveGatewayAccessState(
  reading: FoundationalReadingDerived,
  band: GatewayPowerBand,
): GatewayAccessState {
  if (band === 'low') return 'none';
  const isRevealed = reading.relation.localState.revealSnapshot.status === 'revealed';
  return isRevealed ? 'open' : 'locked';
}

// 4 conceptual bands → 3 visual orbits.
// core + close → orbit 0 (inner), outer → orbit 1 (mid), edge → orbit 2 (outer).
function proximityToOrbitIndex(band: ProximityBand): 0 | 1 | 2 {
  if (band === 'core') return 0;
  if (band === 'close') return 1;
  return 2;  // outer + edge
}

// Orbit fractions of maxR (from center). Minimums guarantee center clearance.
const CENTER_CLEARANCE = 30 + 26 + 10; // CENTER_RADIUS + max node radius + gap = 66
const ORBIT_FRACS = [0.33, 0.62, 0.90] as const;
const ORBIT_MINS  = [CENTER_CLEARANCE, CENTER_CLEARANCE + 40, 0] as const;

/**
 * Returns the 3 visual orbit radii for the given canvas.
 * Used to draw structural ring guides in the atlas canvas.
 * Mirrors the radius computation inside computeEgoLayoutV2 — keep in sync.
 */
export function computeOrbitRadii(canvas: CanvasSize): [number, number, number] {
  if (canvas.width === 0 || canvas.height === 0) return [0, 0, 0];
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const maxR = Math.min(cx, cy) - GATEWAY_NODE_RADIUS.strong - 28;
  return [0, 1, 2].map((oi) =>
    Math.min(maxR, Math.max(ORBIT_MINS[oi as 0 | 1 | 2], maxR * ORBIT_FRACS[oi as 0 | 1 | 2])),
  ) as [number, number, number];
}

/**
 * Angular sort key within an orbit — fallback when no territorial data.
 *
 * Priority: open gateways first → locked → non-gateway.
 * Within each bucket: strong quality → moderate → faint.
 * Tiebreak: id (stable, deterministic).
 */
function layoutSortKey(m: MapMember): string {
  const g = m.gatewayAccessState === 'open' ? '0'
    : m.gatewayAccessState === 'locked' ? '1' : '2';
  const q = m.linkQualityBand === 'strong' ? '0'
    : m.linkQualityBand === 'moderate' ? '1' : '2';
  return `${g}${q}${m.id}`;
}

// ─── Territorial profile ──────────────────────────────────────────────────────

/**
 * World-character categories for angular clustering in the home atlas.
 *
 * - world_opener:      open gateway + has actual via-members (visible via-world)
 * - gateway_potential: open gateway + no via-members yet (declared but empty world)
 * - future_world:      locked gateway (mutual reveal not yet complete)
 * - deep_link:         non-gateway, strong quality
 * - ambient:           non-gateway, moderate or faint quality
 *
 * Derived exclusively from per-link signals + declarative viaRelationId data.
 * No cross-link inference, no score combinations, no fabricated graph edges.
 */
export type TerritorialCategory =
  | 'world_opener'
  | 'gateway_potential'
  | 'future_world'
  | 'deep_link'
  | 'ambient';

export type TerritorialProfile = {
  memberId: string;
  category: TerritorialCategory;
  /** Count of primarily_via members in allGraphMembers that reach the world through this node. */
  viaCount: number;
};

/**
 * Derives the territorial profile for a single canvas member.
 * allGraphMembers must include both direct and primarily_via revealed members
 * so viaCount can be computed from the full graph.
 * Pure — no side effects, safe to call in tests.
 */
export function deriveTerritorialProfile(
  member: MapMember,
  allGraphMembers: readonly MapMember[],
): TerritorialProfile {
  const viaCount = allGraphMembers.filter(
    (m) =>
      m.presenceMode === 'primarily_via' &&
      m.viaState.kind === 'via' &&
      m.viaState.relId === member.id,
  ).length;

  let category: TerritorialCategory;
  if (member.gatewayAccessState === 'open') {
    category = viaCount > 0 ? 'world_opener' : 'gateway_potential';
  } else if (member.gatewayAccessState === 'locked') {
    category = 'future_world';
  } else if (member.linkQualityBand === 'strong') {
    category = 'deep_link';
  } else {
    category = 'ambient';
  }

  return { memberId: member.id, category, viaCount };
}

// ─── Topological placement ────────────────────────────────────────────────────

/**
 * Structural similarity matrix between territorial categories.
 * Symmetric. Values: 1 = identical role, 0 = no structural overlap.
 *
 * Design rationale:
 *   - world_opener / gateway_potential share gateway semantics → 0.8
 *   - deep_link / ambient share non-gateway intimacy semantics → 0.7
 *   - cross-family pairs (opener ↔ deep) are structurally distant → 0.0–0.1
 */
const CATEGORY_SIMILARITY: Record<TerritorialCategory, Record<TerritorialCategory, number>> = {
  world_opener:      { world_opener: 1.0, gateway_potential: 0.8, future_world: 0.4, deep_link: 0.1, ambient: 0.0 },
  gateway_potential: { world_opener: 0.8, gateway_potential: 1.0, future_world: 0.6, deep_link: 0.1, ambient: 0.1 },
  future_world:      { world_opener: 0.4, gateway_potential: 0.6, future_world: 1.0, deep_link: 0.2, ambient: 0.3 },
  deep_link:         { world_opener: 0.1, gateway_potential: 0.1, future_world: 0.2, deep_link: 1.0, ambient: 0.7 },
  ambient:           { world_opener: 0.0, gateway_potential: 0.1, future_world: 0.3, deep_link: 0.7, ambient: 1.0 },
};

/**
 * Via-count component of member similarity.
 * Returns 0 when either member has no via signal — asymmetric worlds carry no comparison.
 * Returns 1/(1+|a−b|) when both have signal — closer counts = more similar.
 */
function viaCountSimilarity(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return 1 / (1 + Math.abs(a - b));
}

/**
 * Structural similarity between two territorial profiles.
 * Range: [0, 1]. Combines category affinity (70%) and via-count proximity (30%).
 * Pure — no side effects, safe to call in tests.
 */
export function computeMemberSimilarity(
  a: TerritorialProfile,
  b: TerritorialProfile,
): number {
  return CATEGORY_SIMILARITY[a.category][b.category] * 0.7
       + viaCountSimilarity(a.viaCount, b.viaCount) * 0.3;
}

/**
 * Minimum gap weight as a fraction of the maximum possible gap weight.
 * Prevents visually similar neighbors from fusing into a single perceived point.
 * At 0.25: gap between maximally similar pair ≥ 25% of gap between maximally
 * dissimilar pair. Maximum angular spread ratio: 4:1.
 */
const MIN_GAP_RATIO = 0.25;

/**
 * Computes N angular gap sizes (radians) for N profiles arranged in a ring.
 *
 * gap[i] = angular distance between profiles[i] and profiles[(i+1) % N].
 * Inversely proportional to the structural similarity of each consecutive pair.
 * Floored at MIN_GAP_RATIO × maxWeight to prevent visual fusion.
 * Normalized so sum(gaps) = 2π (covers the full orbit).
 *
 * Special cases:
 *   - N=0: returns []
 *   - N=1: returns [2π]
 *   - All pairs equally similar → uniform 2π/N (automatic, no special branch)
 *
 * Pure — no side effects, safe to call in tests.
 */
export function computeAngularGaps(
  profiles: readonly TerritorialProfile[],
): number[] {
  const N = profiles.length;
  if (N === 0) return [];
  if (N === 1) return [2 * Math.PI];

  const rawWeights: number[] = [];
  for (let i = 0; i < N; i++) {
    const sim = computeMemberSimilarity(profiles[i], profiles[(i + 1) % N]);
    // High similarity → small gap (low dissimilarity weight), floored at MIN_GAP_RATIO.
    rawWeights.push(MIN_GAP_RATIO + (1 - MIN_GAP_RATIO) * (1 - sim));
  }

  const total = rawWeights.reduce((s, w) => s + w, 0);
  return rawWeights.map((w) => (w / total) * 2 * Math.PI);
}

/**
 * Orders members by greedy nearest-neighbor traversal from a stable anchor.
 *
 * Anchor: member with the highest viaCount (richest gateway world).
 * Tiebreak: id ascending — fully deterministic, no randomness.
 *
 * Each step: pick the unvisited member most similar to the current position.
 * Equal-similarity tiebreak: id ascending.
 *
 * Members without a profile in profileMap are appended last, sorted by id.
 * O(N²) — fine for N ≤ 20.
 * Pure — no side effects, safe to call in tests.
 */
export function orderMembersTopologically(
  members: readonly MapMember[],
  profileMap: Map<string, TerritorialProfile>,
): MapMember[] {
  if (members.length === 0) return [];
  if (members.length === 1) return [...members];

  const withProfile: Array<{ member: MapMember; profile: TerritorialProfile }> = [];
  const noProfile: MapMember[] = [];

  for (const m of members) {
    const p = profileMap.get(m.id);
    if (p) {
      withProfile.push({ member: m, profile: p });
    } else {
      noProfile.push(m);
    }
  }

  noProfile.sort((a, b) => a.id.localeCompare(b.id));

  if (withProfile.length === 0) return noProfile;

  // Anchor: highest viaCount, tiebreak id asc
  withProfile.sort((a, b) => {
    const vc = b.profile.viaCount - a.profile.viaCount;
    if (vc !== 0) return vc;
    return a.member.id.localeCompare(b.member.id);
  });

  const ordered: Array<{ member: MapMember; profile: TerritorialProfile }> = [withProfile[0]];
  const remaining = new Map(withProfile.slice(1).map((x) => [x.member.id, x]));

  while (remaining.size > 0) {
    const current = ordered[ordered.length - 1].profile;
    let bestId = '';
    let bestSim = -1;

    for (const [id, item] of remaining) {
      const sim = computeMemberSimilarity(current, item.profile);
      if (sim > bestSim || (sim === bestSim && id.localeCompare(bestId) < 0)) {
        bestSim = sim;
        bestId = id;
      }
    }

    ordered.push(remaining.get(bestId)!);
    remaining.delete(bestId);
  }

  return [...ordered.map((x) => x.member), ...noProfile];
}

/**
 * Multi-band concentric ego layout for Map v2.
 * Nodes are distributed across 3 orbits by proximity band.
 *
 * Angular placement within each orbit:
 *   - When allGraphMembers is provided (home atlas): zone-based placement.
 *     Members are clustered into 3 geographic regions (opener/deep/emergent).
 *     World-openers anchor the top; deep private links anchor lower-left;
 *     emergent/future links anchor lower-right.
 *   - When absent (Through X atlas): uniform sort fallback —
 *     open gateways first → quality → id. The Through X center IS already
 *     a gateway, so territorial zoning there would be meaningless.
 *
 * Input: MapMember[] (includes overflow pseudo-member if needed).
 */
export function computeEgoLayoutV2(
  members: MapMember[],
  canvas: CanvasSize,
  allGraphMembers?: readonly MapMember[],
): EgoLayoutNodeV2[] {
  if (canvas.width === 0 || canvas.height === 0 || members.length === 0) return [];

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const maxR = Math.min(cx, cy) - GATEWAY_NODE_RADIUS.strong - 28;

  const profileMap: Map<string, TerritorialProfile> | null = allGraphMembers
    ? new Map(members.map((m) => [m.id, deriveTerritorialProfile(m, allGraphMembers)]))
    : null;

  const orbits: MapMember[][] = [[], [], []];
  for (const m of members) orbits[proximityToOrbitIndex(m.proximityBand)].push(m);

  const result: EgoLayoutNodeV2[] = [];
  for (let oi = 0 as 0 | 1 | 2; oi < 3; oi++) {
    const group = orbits[oi];
    if (group.length === 0) continue;

    const orbitR = Math.min(maxR, Math.max(ORBIT_MINS[oi], maxR * ORBIT_FRACS[oi]));

    if (profileMap) {
      // Topological placement: order by structural similarity from a stable anchor,
      // then distribute with weighted angular gaps from −π/2 (12h).
      // The anchor (highest viaCount) lands at 12 o'clock; similar members cluster
      // angularly (small gap); dissimilar neighbors are visually separated (large gap).
      const ordered = orderMembersTopologically(group, profileMap);
      const orderedProfiles = ordered.map((m) => profileMap.get(m.id)!);
      const gaps = computeAngularGaps(orderedProfiles);
      let angle = -Math.PI / 2;
      ordered.forEach((m, i) => {
        result.push({
          id: m.id,
          cx: cx + orbitR * Math.cos(angle),
          cy: cy + orbitR * Math.sin(angle),
          nodeRadius: GATEWAY_NODE_RADIUS[m.gatewayPowerBand],
          gatewayPowerBand: m.gatewayPowerBand,
          gatewayAccessState: m.gatewayAccessState,
        });
        angle += gaps[i];
      });
    } else {
      // Fallback: uniform sort (Through X, no territorial context)
      group.sort((a, b) => layoutSortKey(a).localeCompare(layoutSortKey(b)));
      group.forEach((m, i) => {
        const angle = (2 * Math.PI * i) / group.length - Math.PI / 2;
        result.push({
          id: m.id,
          cx: cx + orbitR * Math.cos(angle),
          cy: cy + orbitR * Math.sin(angle),
          nodeRadius: GATEWAY_NODE_RADIUS[m.gatewayPowerBand],
          gatewayPowerBand: m.gatewayPowerBand,
          gatewayAccessState: m.gatewayAccessState,
        });
      });
    }
  }

  return result;
}

// ─── Cloud spread ────────────────────────────────────────────────────────────

/**
 * Deterministic integer hash: str × seed → float in [0, 1).
 * Uses Knuth multiplicative hashing with 31× polynomial accumulation.
 * Produces distinct distributions for different seeds.
 * Private — exposed only through applyNodeSpread.
 */
function stableHash(str: string, seed: number): number {
  let h = seed;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 65521) / 65521; // 65521 = largest prime < 2^16
}

/**
 * Applies a two-phase deterministic spread to ego layout nodes.
 *
 * Phase 1 — Radial + angular jitter.
 *   Each node is displaced from its orbit-circle position by a small stable
 *   amount derived from its id. Produces the "cloud" feel without randomness.
 *   Radial: ±11% of orbit radius. Angular: ±8°.
 *
 * Phase 2 — Bounded pair repulsion.
 *   3 passes of O(N²) collision relaxation. At most MAX_PUSH_PX displacement
 *   per pair per pass. Eliminates visible overlap without chaotic drift.
 *
 * The center node is NOT part of this array (not passed in).
 * Pure — no side effects. Memoize-safe. O(N²), fine for N ≤ 20.
 */
export function applyNodeSpread(
  nodes: readonly EgoLayoutNodeV2[],
  canvasCx: number,
  canvasCy: number,
): EgoLayoutNodeV2[] {
  if (nodes.length <= 1) return [...nodes];

  // Phase 1: stable jitter
  const jittered: EgoLayoutNodeV2[] = nodes.map((n) => {
    const rh = stableHash(n.id, 7);
    const ah = stableHash(n.id, 13);
    const dx = n.cx - canvasCx;
    const dy = n.cy - canvasCy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const angle = Math.atan2(dy, dx);
    const newDist = dist * (1 + (rh - 0.5) * 0.26);
    const newAngle = angle + (ah - 0.5) * 0.28;
    return {
      ...n,
      cx: canvasCx + newDist * Math.cos(newAngle),
      cy: canvasCy + newDist * Math.sin(newAngle),
    };
  });

  // Phase 2: pair repulsion
  const pos = jittered.map((n) => ({ cx: n.cx, cy: n.cy }));
  const MAX_PUSH = 10;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const minDist = jittered[i].nodeRadius + jittered[j].nodeRadius + 6;
        const ddx = pos[j].cx - pos[i].cx;
        const ddy = pos[j].cy - pos[i].cy;
        const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.01;
        if (d < minDist) {
          const push = Math.min((minDist - d) * 0.5, MAX_PUSH);
          const ux = ddx / d;
          const uy = ddy / d;
          pos[i].cx -= ux * push;
          pos[i].cy -= uy * push;
          pos[j].cx += ux * push;
          pos[j].cy += uy * push;
        }
      }
    }
  }

  return jittered.map((n, idx) => ({ ...n, cx: pos[idx].cx, cy: pos[idx].cy }));
}

// ─── MapFilter ────────────────────────────────────────────────────────────────

export type MapFilter = 'none' | 'gateways' | 'closest' | 'nurture';

/**
 * Pure filter — applies a named filter to a set of canvas members.
 * 'none' returns the same array reference unchanged.
 */
export function applyMapFilter(
  members: readonly MapMember[],
  filter: MapFilter,
): readonly MapMember[] {
  switch (filter) {
    case 'gateways': return members.filter((m) => m.gatewayAccessState === 'open');
    case 'closest':  return members.filter((m) => m.proximityBand === 'core' || m.proximityBand === 'close');
    case 'nurture':  return members.filter((m) => m.status === 'revealed_to_nurture' || m.linkQualityBand === 'faint');
    case 'none':     return members;
  }
}

/**
 * Resolves display labels for a visible set of members.
 *
 * Default: first name token only (e.g. "Lena", "Paul").
 * On first-name collision within the same set: first name + last initial
 * (e.g. "Paul M." / "Paul R.").
 * If a colliding member has no last name token: full name is used as-is.
 *
 * Truncation is left to the caller (e.g. EgoGraph clips at 8 chars).
 */
export function resolveDisplayNames(
  members: ReadonlyArray<{ id: string; name: string }>,
): Map<string, string> {
  const result = new Map<string, string>();

  // Bucket members by first name token (case-insensitive)
  const byFirst = new Map<string, Array<{ id: string; name: string }>>();
  for (const m of members) {
    const first = m.name.split(' ')[0] || m.name;
    const key = first.toLowerCase();
    const bucket = byFirst.get(key);
    if (bucket) {
      bucket.push(m);
    } else {
      byFirst.set(key, [m]);
    }
  }

  for (const group of byFirst.values()) {
    if (group.length === 1) {
      // No collision — show first name only
      const m = group[0];
      result.set(m.id, m.name.split(' ')[0] || m.name);
    } else {
      // Collision — disambiguate with last initial
      for (const m of group) {
        const parts = m.name.split(' ');
        const first = parts[0] || m.name;
        const lastInitial = parts[1]?.charAt(0).toUpperCase();
        result.set(m.id, lastInitial ? `${first} ${lastInitial}.` : m.name);
      }
    }
  }

  return result;
}
