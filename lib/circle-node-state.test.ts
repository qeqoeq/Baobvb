import { describe, it, expect } from 'vitest';

import {
  applyMapFilter,
  applyNodeSpread,
  computeAngularGaps,
  computeEgoLayout,
  computeEgoLayoutV2,
  computeMemberSimilarity,
  deriveCircleProximity,
  deriveGatewayAccessState,
  deriveGatewayPowerBand,
  deriveLinkQualityBand,
  derivePresenceMode,
  deriveProximityBand,
  deriveTerritorialProfile,
  deriveViaState,
  GATEWAY_NODE_RADIUS,
  getCircleNodeStatus,
  getCircleNodeStatusLabel,
  getCircleNodeSortWeight,
  orderMembersTopologically,
  resolveDisplayNames,
  sortAndBucketEgoMembers,
  type CircleNodeStatus,
  type EgoGraphMember,
  type EgoLayoutNodeV2,
  type GatewayPowerBand,
  type MapMember,
  type TerritorialCategory,
  type TerritorialProfile,
} from './circle-node-state';
import type { FoundationalReadingDerived } from './foundational-reading';
import type { Evaluation } from './evaluation';
import type { Relation } from '../store/useRelationsStore';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRevealSnapshot(
  status: 'waiting_other_side' | 'cooking_reveal' | 'reveal_ready' | 'revealed',
  extra: { revealed?: boolean; relationshipNameRevealed?: boolean; firstViewedAt?: string | null } = {},
): Relation['localState']['revealSnapshot'] {
  const defaultFirstViewedAt = status === 'revealed' ? '2024-01-01T00:00:00Z' : undefined;
  const firstViewedAt = extra.firstViewedAt === null
    ? undefined
    : (extra.firstViewedAt ?? defaultFirstViewedAt);
  return {
    status,
    revealed: extra.revealed ?? status === 'revealed',
    ...(firstViewedAt !== undefined ? { firstViewedAt } : {}),
    ...(extra.relationshipNameRevealed !== undefined
      ? { relationshipNameRevealed: extra.relationshipNameRevealed }
      : {}),
  };
}

function makeReading(opts: {
  revealStatus?: 'waiting_other_side' | 'cooking_reveal' | 'reveal_ready' | 'revealed';
  revealed?: boolean;
  relationshipNameRevealed?: boolean;
  hasFoundationalReading?: boolean;
  toNurture?: boolean;
  archived?: boolean;
  mutualScore?: number;
  sharedNetwork?: 1 | 2 | 3 | 4 | 5;
  trust?: 1 | 2 | 3 | 4 | 5;
  viaRelationId?: string;
}): FoundationalReadingDerived {
  const revealStatus = opts.revealStatus ?? 'waiting_other_side';
  const evaluation: Evaluation | null = opts.sharedNetwork != null
    ? {
        id: 'eval-test',
        relationId: 'test-id',
        ratings: {
          trust: opts.trust ?? 3, interactions: 3, affinity: 3, support: 3,
          sharedNetwork: opts.sharedNetwork,
        },
        score: 50,
        tier: 'Steady',
        createdAt: '2024-01-01',
      }
    : null;

  return {
    hasFoundationalReading: opts.hasFoundationalReading ?? (evaluation !== null),
    toNurture: opts.toNurture ?? false,
    relation: {
      id: 'test-id',
      name: 'Test Person',
      archived: opts.archived ?? false,
      createdAt: '2024-01-01',
      identityStatus: 'draft',
      source: 'manual',
      ...(opts.viaRelationId !== undefined ? { viaRelationId: opts.viaRelationId } : {}),
      localState: {
        sideA: { exists: true, identityStatus: 'draft', hasPrivateReading: false },
        sideB: { exists: false, identityStatus: 'missing', hasPrivateReading: false },
        revealSnapshot: {
          ...makeRevealSnapshot(revealStatus, {
            revealed: opts.revealed,
            relationshipNameRevealed: opts.relationshipNameRevealed,
          }),
          ...(opts.mutualScore !== undefined ? { mutualScore: opts.mutualScore } : {}),
        },
      },
    },
    foundationalEvaluation: evaluation,
    foundationalScore: evaluation?.score ?? null,
    linkTier: evaluation?.tier ?? null,
    readingStatus: evaluation !== null ? 'Read' : 'Unread',
    strongestPillar: null,
    weakestPillar: null,
    recentDate: '2024-01-01',
    badgeLabel: evaluation?.tier ?? 'Unread',
    pillarDots: null,
  } as FoundationalReadingDerived;
}

function makeMember(
  id: string,
  name: string,
  status: CircleNodeStatus,
): EgoGraphMember {
  return { id, name, status };
}

function makeMapMember(
  id: string,
  name: string,
  status: CircleNodeStatus,
  overrides: Partial<MapMember> = {},
): MapMember {
  return {
    id, name, status,
    proximityBand: 'edge',
    gatewayPowerBand: 'low',
    gatewayAccessState: 'none',
    linkQualityBand: 'faint',
    viaState: { kind: 'direct' },
    presenceMode: 'direct',
    ...overrides,
  };
}

// ─── A: getCircleNodeStatus — pre-reveal never shows tier-adjacent statuses ───

describe('getCircleNodeStatus — pre-reveal safety', () => {
  it('waiting_other_side, no reading → unread', () => {
    expect(getCircleNodeStatus(makeReading({
      revealStatus: 'waiting_other_side',
      hasFoundationalReading: false,
    }))).toBe('unread');
  });

  it('waiting_other_side, has reading → waiting_other_side', () => {
    expect(getCircleNodeStatus(makeReading({
      revealStatus: 'waiting_other_side',
      hasFoundationalReading: true,
    }))).toBe('waiting_other_side');
  });

  it('cooking_reveal → cooking regardless of toNurture', () => {
    expect(getCircleNodeStatus(makeReading({
      revealStatus: 'cooking_reveal',
      hasFoundationalReading: true,
      toNurture: true,
    }))).toBe('cooking');
  });

  it('reveal_ready → ready regardless of toNurture', () => {
    expect(getCircleNodeStatus(makeReading({
      revealStatus: 'reveal_ready',
      hasFoundationalReading: true,
      toNurture: true,
    }))).toBe('ready');
  });

  it('revealed, toNurture=false → revealed_stable', () => {
    expect(getCircleNodeStatus(makeReading({
      revealStatus: 'revealed',
      hasFoundationalReading: true,
      toNurture: false,
    }))).toBe('revealed_stable');
  });

  it('revealed, toNurture=true → revealed_to_nurture', () => {
    expect(getCircleNodeStatus(makeReading({
      revealStatus: 'revealed',
      hasFoundationalReading: true,
      toNurture: true,
    }))).toBe('revealed_to_nurture');
  });

  it('revealed_stable and revealed_to_nurture only reachable when status=revealed', () => {
    const pre: Array<'waiting_other_side' | 'cooking_reveal' | 'reveal_ready'> =
      ['waiting_other_side', 'cooking_reveal', 'reveal_ready'];
    for (const revealStatus of pre) {
      const s = getCircleNodeStatus(makeReading({ revealStatus, hasFoundationalReading: true }));
      expect(s).not.toBe('revealed_stable');
      expect(s).not.toBe('revealed_to_nurture');
    }
  });
});

// ─── B: getCircleNodeStatusLabel — exhaustive, no tier string leaks ───────────

describe('getCircleNodeStatusLabel — no tier strings', () => {
  const TIER_STRINGS = ['Distant', 'Forming', 'Active', 'Steady', 'Anchor', 'Rooted'];
  const ALL_STATUSES: CircleNodeStatus[] = [
    'revealed_stable',
    'revealed_to_nurture',
    'ready',
    'cooking',
    'waiting_other_side',
    'unread',
  ];

  it('every status returns a non-empty label', () => {
    for (const s of ALL_STATUSES) {
      expect(getCircleNodeStatusLabel(s).length).toBeGreaterThan(0);
    }
  });

  it('no label matches a tier string', () => {
    for (const s of ALL_STATUSES) {
      const label = getCircleNodeStatusLabel(s);
      expect(TIER_STRINGS).not.toContain(label);
    }
  });

  it('spot-check: revealed_stable → Stable', () => {
    expect(getCircleNodeStatusLabel('revealed_stable')).toBe('Stable');
  });

  it('spot-check: unread → Unread', () => {
    expect(getCircleNodeStatusLabel('unread')).toBe('Unread');
  });
});

// ─── C: getCircleNodeSortWeight — sort order is stable and total ──────────────

describe('getCircleNodeSortWeight — sort priority', () => {
  it('ready < revealed_stable < revealed_to_nurture', () => {
    expect(getCircleNodeSortWeight('ready')).toBeLessThan(getCircleNodeSortWeight('revealed_stable'));
    expect(getCircleNodeSortWeight('revealed_stable')).toBeLessThan(getCircleNodeSortWeight('revealed_to_nurture'));
  });

  it('revealed_to_nurture < cooking < waiting_other_side < unread', () => {
    expect(getCircleNodeSortWeight('revealed_to_nurture')).toBeLessThan(getCircleNodeSortWeight('cooking'));
    expect(getCircleNodeSortWeight('cooking')).toBeLessThan(getCircleNodeSortWeight('waiting_other_side'));
    expect(getCircleNodeSortWeight('waiting_other_side')).toBeLessThan(getCircleNodeSortWeight('unread'));
  });

  it('all 6 statuses have distinct weights', () => {
    const all: CircleNodeStatus[] = [
      'revealed_stable', 'revealed_to_nurture', 'ready',
      'cooking', 'waiting_other_side', 'unread',
    ];
    const weights = all.map(getCircleNodeSortWeight);
    expect(new Set(weights).size).toBe(6);
  });
});

// ─── D: computeEgoLayout ─────────────────────────────────────────────────────

describe('computeEgoLayout', () => {
  it('returns [] for zero canvas', () => {
    expect(computeEgoLayout(['a', 'b'], { width: 0, height: 0 })).toEqual([]);
  });

  it('returns [] for empty nodeIds', () => {
    expect(computeEgoLayout([], { width: 300, height: 300 })).toEqual([]);
  });

  it('returns one node per id', () => {
    const ids = ['a', 'b', 'c'];
    const nodes = computeEgoLayout(ids, { width: 300, height: 300 });
    expect(nodes).toHaveLength(3);
    expect(nodes.map((n) => n.id)).toEqual(ids);
  });

  it('all nodes are within canvas bounds', () => {
    const canvas = { width: 320, height: 480 };
    const ids = Array.from({ length: 10 }, (_, i) => `id-${i}`);
    const nodes = computeEgoLayout(ids, canvas);
    for (const n of nodes) {
      expect(n.cx).toBeGreaterThanOrEqual(0);
      expect(n.cx).toBeLessThanOrEqual(canvas.width);
      expect(n.cy).toBeGreaterThanOrEqual(0);
      expect(n.cy).toBeLessThanOrEqual(canvas.height);
    }
  });

  it('layout is deterministic — same input → same output', () => {
    const ids = ['x', 'y', 'z'];
    const canvas = { width: 400, height: 600 };
    expect(computeEgoLayout(ids, canvas)).toEqual(computeEgoLayout(ids, canvas));
  });

  it('first node is at the top (cy < center)', () => {
    const canvas = { width: 300, height: 300 };
    const nodes = computeEgoLayout(['a', 'b', 'c'], canvas);
    // angle starts at -π/2 → first node is directly above center
    expect(nodes[0].cy).toBeLessThan(canvas.height / 2);
  });
});

// ─── E: sortAndBucketEgoMembers — sort order + overflow ──────────────────────

describe('sortAndBucketEgoMembers — sort and overflow', () => {
  it('sorts by status weight ascending', () => {
    const members = [
      makeMember('1', 'Alice', 'unread'),
      makeMember('2', 'Bob', 'ready'),
      makeMember('3', 'Carol', 'cooking'),
    ];
    const { visible } = sortAndBucketEgoMembers(members, 20);
    expect(visible[0].status).toBe('ready');
    expect(visible[1].status).toBe('cooking');
    expect(visible[2].status).toBe('unread');
  });

  it('tie-breaks on name then id', () => {
    const members = [
      makeMember('z', 'Zoe', 'unread'),
      makeMember('a', 'Anna', 'unread'),
      makeMember('m', 'Max', 'unread'),
    ];
    const { visible } = sortAndBucketEgoMembers(members, 20);
    expect(visible.map((m) => m.name)).toEqual(['Anna', 'Max', 'Zoe']);
  });

  it('same name ties broken by id', () => {
    const members = [
      makeMember('id-z', 'Sam', 'cooking'),
      makeMember('id-a', 'Sam', 'cooking'),
    ];
    const { visible } = sortAndBucketEgoMembers(members, 20);
    expect(visible[0].id).toBe('id-a');
    expect(visible[1].id).toBe('id-z');
  });

  it('overflowCount = 0 when members ≤ maxVisible', () => {
    const members = Array.from({ length: 5 }, (_, i) =>
      makeMember(`id-${i}`, `Person ${i}`, 'unread'),
    );
    const { overflowCount } = sortAndBucketEgoMembers(members, 20);
    expect(overflowCount).toBe(0);
  });

  it('overflowCount > 0 when members > maxVisible', () => {
    const members = Array.from({ length: 25 }, (_, i) =>
      makeMember(`id-${i}`, `Person ${i}`, 'unread'),
    );
    const { visible, overflowCount } = sortAndBucketEgoMembers(members, 20);
    expect(visible).toHaveLength(20);
    expect(overflowCount).toBe(5);
  });

  it('overflow contains the lowest-priority nodes (unread last)', () => {
    // 21 members: 20 'ready' + 1 'unread'. The unread one should overflow.
    const ready = Array.from({ length: 20 }, (_, i) =>
      makeMember(`r-${i}`, `Ready ${i}`, 'ready'),
    );
    const unread = makeMember('u-0', 'Zzz', 'unread');
    const { visible, overflowCount } = sortAndBucketEgoMembers([unread, ...ready], 20);
    expect(overflowCount).toBe(1);
    expect(visible.every((m) => m.status === 'ready')).toBe(true);
  });

  it('does not mutate the input array', () => {
    const members = [
      makeMember('1', 'Zoe', 'unread'),
      makeMember('2', 'Anna', 'ready'),
    ];
    const original = [...members];
    sortAndBucketEgoMembers(members, 20);
    expect(members).toEqual(original);
  });

  it('empty input → visible=[], overflowCount=0', () => {
    const { visible, overflowCount } = sortAndBucketEgoMembers([], 20);
    expect(visible).toEqual([]);
    expect(overflowCount).toBe(0);
  });
});

// ─── F: deriveCircleProximity — no quality leak pre-reveal ───────────────────

describe('deriveCircleProximity — pre-reveal safety', () => {
  it('archived → far', () => {
    expect(deriveCircleProximity(makeReading({
      archived: true,
      revealStatus: 'revealed',
      hasFoundationalReading: true,
      toNurture: true,
    }))).toBe('far');
  });

  it('no foundational reading → far', () => {
    expect(deriveCircleProximity(makeReading({
      hasFoundationalReading: false,
      revealStatus: 'waiting_other_side',
    }))).toBe('far');
  });

  it('pre-reveal with reading → always direct (never near)', () => {
    const pre: Array<'waiting_other_side' | 'cooking_reveal' | 'reveal_ready'> =
      ['waiting_other_side', 'cooking_reveal', 'reveal_ready'];
    for (const revealStatus of pre) {
      // toNurture=true would leak quality signal if used pre-reveal
      const p = deriveCircleProximity(makeReading({
        revealStatus,
        hasFoundationalReading: true,
        toNurture: true,
      }));
      expect(p).toBe('direct');
      expect(p).not.toBe('near');
    }
  });

  it('revealed + toNurture=false → direct', () => {
    expect(deriveCircleProximity(makeReading({
      revealStatus: 'revealed',
      hasFoundationalReading: true,
      toNurture: false,
    }))).toBe('direct');
  });

  it('revealed + toNurture=true → near', () => {
    expect(deriveCircleProximity(makeReading({
      revealStatus: 'revealed',
      hasFoundationalReading: true,
      toNurture: true,
    }))).toBe('near');
  });

  it('"near" is only reachable post-reveal', () => {
    // Exhaustively verify: no pre-reveal reading can yield 'near'
    const pre: Array<'waiting_other_side' | 'cooking_reveal' | 'reveal_ready'> =
      ['waiting_other_side', 'cooking_reveal', 'reveal_ready'];
    for (const revealStatus of pre) {
      for (const toNurture of [true, false]) {
        expect(deriveCircleProximity(makeReading({
          revealStatus,
          hasFoundationalReading: true,
          toNurture,
        }))).not.toBe('near');
      }
    }
  });
});

// ─── K: deriveLinkQualityBand ─────────────────────────────────────────────────

describe('K: deriveLinkQualityBand', () => {
  it('K01 — mutualScore ≥ 70 → strong', () => {
    expect(deriveLinkQualityBand(makeReading({ revealStatus: 'revealed', mutualScore: 70 }))).toBe('strong');
    expect(deriveLinkQualityBand(makeReading({ revealStatus: 'revealed', mutualScore: 82 }))).toBe('strong');
    expect(deriveLinkQualityBand(makeReading({ revealStatus: 'revealed', mutualScore: 100 }))).toBe('strong');
  });

  it('K02 — mutualScore 40–69 → moderate', () => {
    expect(deriveLinkQualityBand(makeReading({ revealStatus: 'revealed', mutualScore: 40 }))).toBe('moderate');
    expect(deriveLinkQualityBand(makeReading({ revealStatus: 'revealed', mutualScore: 62 }))).toBe('moderate');
    expect(deriveLinkQualityBand(makeReading({ revealStatus: 'revealed', mutualScore: 69 }))).toBe('moderate');
  });

  it('K03 — mutualScore < 40 → faint', () => {
    expect(deriveLinkQualityBand(makeReading({ revealStatus: 'revealed', mutualScore: 0 }))).toBe('faint');
    expect(deriveLinkQualityBand(makeReading({ revealStatus: 'revealed', mutualScore: 28 }))).toBe('faint');
    expect(deriveLinkQualityBand(makeReading({ revealStatus: 'revealed', mutualScore: 39 }))).toBe('faint');
  });

  it('K04 — mutualScore absent, foundationalScore ≥ 70 → strong (fallback)', () => {
    // sharedNetwork=5 → foundationalScore=50 in makeReading factory (score field)
    // Use a custom reading with foundationalScore=75
    const reading = makeReading({ revealStatus: 'revealed' });
    (reading as any).foundationalScore = 75;
    expect(deriveLinkQualityBand(reading)).toBe('strong');
  });

  it('K05 — mutualScore absent, foundationalScore 40–69 → moderate (fallback)', () => {
    const reading = makeReading({ revealStatus: 'revealed' });
    (reading as any).foundationalScore = 50;
    expect(deriveLinkQualityBand(reading)).toBe('moderate');
  });

  it('K06 — mutualScore absent, foundationalScore null → faint', () => {
    const reading = makeReading({ revealStatus: 'revealed' });
    (reading as any).foundationalScore = null;
    expect(deriveLinkQualityBand(reading)).toBe('faint');
  });

  it('K07 — mutualScore takes priority over foundationalScore', () => {
    // mutualScore=28 → faint, even though foundationalScore would be moderate
    const reading = makeReading({ revealStatus: 'revealed', mutualScore: 28 });
    (reading as any).foundationalScore = 65;
    expect(deriveLinkQualityBand(reading)).toBe('faint');
  });

  // ── Pre-reveal safety: private score never leaks into the visual band ────
  // Without this gate, a strong private foundationalScore would render a
  // pre-reveal node as 'strong' on the Map, leaking private quality.

  it('K08 — pre-reveal (waiting_other_side) + foundationalScore=75 → faint (no leak)', () => {
    const reading = makeReading({ revealStatus: 'waiting_other_side' });
    (reading as any).foundationalScore = 75;
    expect(deriveLinkQualityBand(reading)).toBe('faint');
  });

  it('K09 — pre-reveal (cooking_reveal) + foundationalScore=82 → faint (no leak)', () => {
    const reading = makeReading({ revealStatus: 'cooking_reveal' });
    (reading as any).foundationalScore = 82;
    expect(deriveLinkQualityBand(reading)).toBe('faint');
  });

  it('K10 — pre-reveal (reveal_ready) + foundationalScore=95 → faint (no leak)', () => {
    const reading = makeReading({ revealStatus: 'reveal_ready' });
    (reading as any).foundationalScore = 95;
    expect(deriveLinkQualityBand(reading)).toBe('faint');
  });

  it('K11 — B5 gate: revealStatus=revealed but firstViewedAt absent → faint', () => {
    // Bootstrapped relation: server says revealed, but this side hasn't opened locally.
    // Must stay faint on the EgoGraph so no tier-derived visual leaks.
    const reading = makeReading({ revealStatus: 'revealed', mutualScore: 90 });
    // Override to remove firstViewedAt (simulate missing local-open stamp)
    (reading.relation.localState.revealSnapshot as any).firstViewedAt = undefined;
    expect(deriveLinkQualityBand(reading)).toBe('faint');
  });
});

// ─── G: deriveProximityBand ───────────────────────────────────────────────────

describe('deriveProximityBand', () => {
  it('revealed + mutualScore ≥ 75 → core', () => {
    expect(deriveProximityBand(makeReading({ revealStatus: 'revealed', mutualScore: 80 }))).toBe('core');
  });

  it('revealed + mutualScore = 75 → core (boundary)', () => {
    expect(deriveProximityBand(makeReading({ revealStatus: 'revealed', mutualScore: 75 }))).toBe('core');
  });

  it('revealed + mutualScore 55–74 → close', () => {
    expect(deriveProximityBand(makeReading({ revealStatus: 'revealed', mutualScore: 65 }))).toBe('close');
    expect(deriveProximityBand(makeReading({ revealStatus: 'revealed', mutualScore: 55 }))).toBe('close');
  });

  it('revealed + mutualScore 35–54 → outer', () => {
    expect(deriveProximityBand(makeReading({ revealStatus: 'revealed', mutualScore: 45 }))).toBe('outer');
    expect(deriveProximityBand(makeReading({ revealStatus: 'revealed', mutualScore: 35 }))).toBe('outer');
  });

  it('revealed + mutualScore < 35 → edge', () => {
    expect(deriveProximityBand(makeReading({ revealStatus: 'revealed', mutualScore: 20 }))).toBe('edge');
  });

  it('revealed + no mutualScore + toNurture=false → close (fallback)', () => {
    expect(deriveProximityBand(makeReading({ revealStatus: 'revealed', toNurture: false }))).toBe('close');
  });

  it('revealed + no mutualScore + toNurture=true → outer (fallback)', () => {
    expect(deriveProximityBand(makeReading({ revealStatus: 'revealed', toNurture: true }))).toBe('outer');
  });

  it('reveal_ready → outer', () => {
    expect(deriveProximityBand(makeReading({ revealStatus: 'reveal_ready' }))).toBe('outer');
  });

  it('cooking_reveal → outer', () => {
    expect(deriveProximityBand(makeReading({ revealStatus: 'cooking_reveal' }))).toBe('outer');
  });

  it('waiting_other_side → edge', () => {
    expect(deriveProximityBand(makeReading({ revealStatus: 'waiting_other_side' }))).toBe('edge');
  });
});

// ─── H: deriveGatewayPowerBand ────────────────────────────────────────────────

describe('deriveGatewayPowerBand', () => {
  it('sharedNetwork = 5 → strong', () => {
    expect(deriveGatewayPowerBand(makeReading({ sharedNetwork: 5 }))).toBe('strong');
  });

  it('sharedNetwork = 4 → moderate', () => {
    expect(deriveGatewayPowerBand(makeReading({ sharedNetwork: 4 }))).toBe('moderate');
  });

  it('sharedNetwork = 3 → moderate', () => {
    expect(deriveGatewayPowerBand(makeReading({ sharedNetwork: 3 }))).toBe('moderate');
  });

  it('sharedNetwork = 2 → low', () => {
    expect(deriveGatewayPowerBand(makeReading({ sharedNetwork: 2 }))).toBe('low');
  });

  it('sharedNetwork = 1 → low', () => {
    expect(deriveGatewayPowerBand(makeReading({ sharedNetwork: 1 }))).toBe('low');
  });

  it('no evaluation → low', () => {
    expect(deriveGatewayPowerBand(makeReading({}))).toBe('low');
  });

  it('trust = 1 blocks strong gateway regardless of sharedNetwork breadth', () => {
    expect(deriveGatewayPowerBand(makeReading({ sharedNetwork: 5, trust: 1 }))).toBe('low');
  });

  it('trust = 2 blocks moderate/strong gateway regardless of sharedNetwork breadth', () => {
    expect(deriveGatewayPowerBand(makeReading({ sharedNetwork: 5, trust: 2 }))).toBe('low');
    expect(deriveGatewayPowerBand(makeReading({ sharedNetwork: 4, trust: 2 }))).toBe('low');
  });

  it('trust = 3 leaves gate inactive — sharedNetwork determines band', () => {
    expect(deriveGatewayPowerBand(makeReading({ sharedNetwork: 5, trust: 3 }))).toBe('strong');
    expect(deriveGatewayPowerBand(makeReading({ sharedNetwork: 3, trust: 3 }))).toBe('moderate');
  });
});

// ─── I: deriveGatewayAccessState ─────────────────────────────────────────────

describe('deriveGatewayAccessState', () => {
  const revealed = makeReading({ revealStatus: 'revealed' });
  const preReveal = makeReading({ revealStatus: 'waiting_other_side' });

  it('low band → none regardless of reveal state', () => {
    expect(deriveGatewayAccessState(revealed, 'low')).toBe('none');
    expect(deriveGatewayAccessState(preReveal, 'low')).toBe('none');
  });

  it('moderate + revealed → open', () => {
    expect(deriveGatewayAccessState(revealed, 'moderate')).toBe('open');
  });

  it('moderate + pre-reveal → locked', () => {
    expect(deriveGatewayAccessState(preReveal, 'moderate')).toBe('locked');
  });

  it('strong + revealed → open', () => {
    expect(deriveGatewayAccessState(revealed, 'strong')).toBe('open');
  });

  it('strong + pre-reveal → locked', () => {
    expect(deriveGatewayAccessState(preReveal, 'strong')).toBe('locked');
  });

  it('none is the only result when band is low — never open or locked', () => {
    const bands: GatewayPowerBand[] = ['strong', 'moderate', 'low'];
    for (const band of bands) {
      const state = deriveGatewayAccessState(preReveal, band);
      if (band === 'low') {
        expect(state).toBe('none');
      } else {
        expect(state).not.toBe('none');
      }
    }
  });
});

// ─── J: computeEgoLayoutV2 ───────────────────────────────────────────────────

describe('computeEgoLayoutV2', () => {
  it('returns [] for zero canvas', () => {
    const m = makeMapMember('a', 'Alice', 'unread');
    expect(computeEgoLayoutV2([m], { width: 0, height: 0 })).toEqual([]);
  });

  it('returns [] for empty members', () => {
    expect(computeEgoLayoutV2([], { width: 300, height: 300 })).toEqual([]);
  });

  it('returns one node per member', () => {
    const members = [
      makeMapMember('a', 'Alice', 'unread'),
      makeMapMember('b', 'Bob', 'ready'),
    ];
    expect(computeEgoLayoutV2(members, { width: 300, height: 300 })).toHaveLength(2);
  });

  it('all nodes within canvas bounds', () => {
    const canvas = { width: 375, height: 500 };
    const members = Array.from({ length: 6 }, (_, i) =>
      makeMapMember(`id-${i}`, `Person ${i}`, 'unread'),
    );
    const nodes = computeEgoLayoutV2(members, canvas);
    for (const n of nodes) {
      expect(n.cx).toBeGreaterThan(0);
      expect(n.cx).toBeLessThan(canvas.width);
      expect(n.cy).toBeGreaterThan(0);
      expect(n.cy).toBeLessThan(canvas.height);
    }
  });

  it('inner orbit (core/close) is closer to center than outer orbit (edge)', () => {
    const canvas = { width: 400, height: 600 };
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const inner = makeMapMember('i', 'Inner', 'revealed_stable', { proximityBand: 'core' });
    const outer = makeMapMember('o', 'Outer', 'unread',          { proximityBand: 'edge' });

    const nodes = computeEgoLayoutV2([inner, outer], canvas);
    const iNode = nodes.find((n) => n.id === 'i')!;
    const oNode = nodes.find((n) => n.id === 'o')!;

    const distI = Math.hypot(iNode.cx - cx, iNode.cy - cy);
    const distO = Math.hypot(oNode.cx - cx, oNode.cy - cy);
    expect(distI).toBeLessThan(distO);
  });

  it('node radius reflects gateway power band', () => {
    const canvas = { width: 400, height: 400 };
    const strong   = makeMapMember('s', 'Strong',   'revealed_stable', { gatewayPowerBand: 'strong' });
    const moderate = makeMapMember('m', 'Moderate', 'revealed_stable', { gatewayPowerBand: 'moderate' });
    const low      = makeMapMember('l', 'Low',      'unread',          { gatewayPowerBand: 'low' });

    const nodes = computeEgoLayoutV2([strong, moderate, low], canvas);
    const rStrong   = nodes.find((n) => n.id === 's')!.nodeRadius;
    const rModerate = nodes.find((n) => n.id === 'm')!.nodeRadius;
    const rLow      = nodes.find((n) => n.id === 'l')!.nodeRadius;

    expect(rStrong).toBe(GATEWAY_NODE_RADIUS.strong);
    expect(rModerate).toBe(GATEWAY_NODE_RADIUS.moderate);
    expect(rLow).toBe(GATEWAY_NODE_RADIUS.low);
    expect(rStrong).toBeGreaterThan(rModerate);
    expect(rModerate).toBeGreaterThan(rLow);
  });

  it('layout is deterministic — same input → same output', () => {
    const canvas = { width: 400, height: 600 };
    const members = [
      makeMapMember('x', 'X', 'cooking', { proximityBand: 'outer' }),
      makeMapMember('y', 'Y', 'unread',  { proximityBand: 'edge'  }),
    ];
    expect(computeEgoLayoutV2(members, canvas)).toEqual(computeEgoLayoutV2(members, canvas));
  });

  it('within same orbit, equal-quality nodes are tiebroken by id', () => {
    const canvas = { width: 400, height: 400 };
    const members = [
      makeMapMember('z-id', 'Zoe', 'unread', { proximityBand: 'edge' }),
      makeMapMember('a-id', 'Amy', 'unread', { proximityBand: 'edge' }),
    ];
    const nodes = computeEgoLayoutV2(members, canvas);
    // Same gatewayAccessState (none) + linkQualityBand (faint) → tiebreak by id
    // a-id < z-id → a-id is at angle -π/2 (top)
    const aNode = nodes.find((n) => n.id === 'a-id')!;
    const zNode = nodes.find((n) => n.id === 'z-id')!;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    expect(aNode.cy).toBeLessThan(cy); // top position for first sorted member
    expect(aNode.cx).toBeCloseTo(cx, 0); // near horizontal center
    expect(zNode).toBeDefined();
  });

  it('J-semantic: open gateway sorts before non-gateway within same orbit despite id order', () => {
    const canvas = { width: 400, height: 400 };
    // 'a' would sort first alphabetically but has no gateway
    const plain = makeMapMember('a', 'Alice', 'revealed_stable', {
      proximityBand: 'edge',
      gatewayAccessState: 'none',
      linkQualityBand: 'strong',
    });
    // 'b' sorts second alphabetically but is an open gateway
    const gateway = makeMapMember('b', 'Bob', 'revealed_stable', {
      proximityBand: 'edge',
      gatewayAccessState: 'open',
      linkQualityBand: 'strong',
    });
    const nodes = computeEgoLayoutV2([plain, gateway], canvas);
    const gNode = nodes.find((n) => n.id === 'b')!;
    const pNode = nodes.find((n) => n.id === 'a')!;
    const cy = canvas.height / 2;
    // Gateway (b) sorts first → top position (cy < center)
    expect(gNode.cy).toBeLessThan(cy);
    // Non-gateway (a) sorts second → bottom position (cy > center)
    expect(pNode.cy).toBeGreaterThan(cy);
  });
});

// ─── L: deriveViaState ────────────────────────────────────────────────────────

describe('L: deriveViaState', () => {
  const activeMap = new Map([
    ['lena-id', 'Lena'],
    ['camille-id', 'Camille'],
  ]);

  it('L01 — no viaRelationId → direct', () => {
    expect(deriveViaState(makeReading({}), activeMap)).toEqual({ kind: 'direct' });
  });

  it('L02 — viaRelationId found in map → via with name', () => {
    const r = makeReading({ viaRelationId: 'lena-id' });
    expect(deriveViaState(r, activeMap)).toEqual({ kind: 'via', relId: 'lena-id', viaName: 'Lena' });
  });

  it('L03 — viaRelationId not in map (archived or unknown) → direct fallback', () => {
    const r = makeReading({ viaRelationId: 'unknown-id' });
    expect(deriveViaState(r, activeMap)).toEqual({ kind: 'direct' });
  });

  it('L04 — self-referential viaRelationId → direct (loop guard)', () => {
    // makeReading creates relation with id 'test-id'
    const r = makeReading({ viaRelationId: 'test-id' });
    const mapWithSelf = new Map([...activeMap, ['test-id', 'Test Person']]);
    expect(deriveViaState(r, mapWithSelf)).toEqual({ kind: 'direct' });
  });
});

// ─── M: derivePresenceMode ────────────────────────────────────────────────────

describe('M: derivePresenceMode', () => {
  it('M01 — no viaRelationId → direct', () => {
    const r = makeReading({ mutualScore: 20 }); // faint quality, but no via intent
    expect(derivePresenceMode(r, { kind: 'direct' })).toBe('direct');
  });

  it('M02 — via resolved + faint quality → primarily_via', () => {
    const r = makeReading({ mutualScore: 20 });
    const via: import('./circle-node-state').ViaState = { kind: 'via', relId: 'lena-id', viaName: 'Lena' };
    expect(derivePresenceMode(r, via)).toBe('primarily_via');
  });

  it('M03 — revealed + via resolved + moderate quality → direct', () => {
    // Quality band is only meaningful post-reveal; M03/M04 specify revealStatus explicitly
    // so they validate the legitimate post-reveal case (was implicit before the pre-reveal gate).
    const r = makeReading({ revealStatus: 'revealed', mutualScore: 55 });
    const via: import('./circle-node-state').ViaState = { kind: 'via', relId: 'lena-id', viaName: 'Lena' };
    expect(derivePresenceMode(r, via)).toBe('direct');
  });

  it('M04 — revealed + via resolved + strong quality → direct', () => {
    const r = makeReading({ revealStatus: 'revealed', mutualScore: 85 });
    const via: import('./circle-node-state').ViaState = { kind: 'via', relId: 'lena-id', viaName: 'Lena' };
    expect(derivePresenceMode(r, via)).toBe('direct');
  });

  it('M05 — unresolvable via (kind: direct) + faint quality → direct', () => {
    // viaRelationId was set but target was archived/unknown → deriveViaState returned direct
    const r = makeReading({ mutualScore: 15 });
    expect(derivePresenceMode(r, { kind: 'direct' })).toBe('direct');
  });
});

// ─── N: resolveDisplayNames ───────────────────────────────────────────────────

describe('N: resolveDisplayNames', () => {
  it('N01 — no collision → first name only', () => {
    const m = [
      { id: '1', name: 'Lena' },
      { id: '2', name: 'Paul' },
      { id: '3', name: 'Sophie Martin' },
    ];
    const result = resolveDisplayNames(m);
    expect(result.get('1')).toBe('Lena');
    expect(result.get('2')).toBe('Paul');
    expect(result.get('3')).toBe('Sophie');
  });

  it('N02 — collision with last names → disambiguate with initial', () => {
    const m = [
      { id: 'a', name: 'Paul Martin' },
      { id: 'b', name: 'Paul Renard' },
    ];
    const result = resolveDisplayNames(m);
    expect(result.get('a')).toBe('Paul M.');
    expect(result.get('b')).toBe('Paul R.');
  });

  it('N03 — collision, one member has no last name → full name fallback', () => {
    const m = [
      { id: 'a', name: 'Paul Martin' },
      { id: 'b', name: 'Paul' },
    ];
    const result = resolveDisplayNames(m);
    expect(result.get('a')).toBe('Paul M.');
    expect(result.get('b')).toBe('Paul'); // no last name → full name as-is
  });

  it('N04 — partial collision: only colliders are disambiguated', () => {
    const m = [
      { id: '1', name: 'Paul Durand' },
      { id: '2', name: 'Paul Lebrun' },
      { id: '3', name: 'Lena' },
    ];
    const result = resolveDisplayNames(m);
    expect(result.get('1')).toBe('Paul D.');
    expect(result.get('2')).toBe('Paul L.');
    expect(result.get('3')).toBe('Lena'); // untouched
  });

  it('N05 — case-insensitive first-name comparison', () => {
    const m = [
      { id: 'a', name: 'paul Martin' },
      { id: 'b', name: 'Paul Renard' },
    ];
    const result = resolveDisplayNames(m);
    // Both detected as same first name despite casing
    expect(result.get('a')).toBeDefined();
    expect(result.get('b')).toBeDefined();
    // Both must be disambiguated (contain a last initial)
    expect(result.get('a')).toMatch(/\./);
    expect(result.get('b')).toMatch(/\./);
  });
});

// ─── O: applyMapFilter ────────────────────────────────────────────────────────

describe('O: applyMapFilter', () => {
  const gateway = makeMapMember('g', 'Lena', 'revealed_stable', {
    proximityBand: 'close',
    gatewayAccessState: 'open',
    linkQualityBand: 'strong',
  });
  const closest = makeMapMember('c', 'Sophie', 'revealed_stable', {
    proximityBand: 'core',
    gatewayAccessState: 'none',
    linkQualityBand: 'strong',
  });
  const nurture = makeMapMember('n', 'Antoine', 'revealed_to_nurture', {
    proximityBand: 'outer',
    gatewayAccessState: 'none',
    linkQualityBand: 'faint',
  });
  const plain = makeMapMember('p', 'Max', 'revealed_stable', {
    proximityBand: 'outer',
    gatewayAccessState: 'none',
    linkQualityBand: 'moderate',
  });

  const all = [gateway, closest, nurture, plain];

  it('O01 — none returns the same array reference', () => {
    expect(applyMapFilter(all, 'none')).toBe(all);
  });

  it('O02 — gateways returns only open gateways', () => {
    expect(applyMapFilter(all, 'gateways')).toEqual([gateway]);
  });

  it('O03 — closest returns core + close bands only', () => {
    const result = applyMapFilter(all, 'closest');
    expect(result).toContain(closest);
    expect(result).not.toContain(nurture);
    expect(result).not.toContain(plain);
  });

  it('O04 — nurture returns revealed_to_nurture + faint quality', () => {
    const result = applyMapFilter(all, 'nurture');
    expect(result).toContain(nurture);
    expect(result).not.toContain(closest);
    expect(result).not.toContain(plain);
  });

  it('O05 — empty input returns empty for any filter', () => {
    expect(applyMapFilter([], 'gateways')).toHaveLength(0);
    expect(applyMapFilter([], 'closest')).toHaveLength(0);
    expect(applyMapFilter([], 'nurture')).toHaveLength(0);
  });
});

// ─── P: deriveTerritorialProfile ─────────────────────────────────────────────

describe('P: deriveTerritorialProfile', () => {
  function makePrimarilyVia(id: string, relId: string): MapMember {
    return makeMapMember(id, `Via-${id}`, 'revealed_stable', {
      presenceMode: 'primarily_via',
      viaState: { kind: 'via', relId, viaName: 'Gateway' },
      gatewayAccessState: 'none',
      linkQualityBand: 'faint',
    });
  }

  it('P01 — open gateway + via-members → world_opener', () => {
    const gateway = makeMapMember('g1', 'Lena', 'revealed_stable', {
      gatewayAccessState: 'open',
      linkQualityBand: 'strong',
    });
    const viaA = makePrimarilyVia('v1', 'g1');
    const viaB = makePrimarilyVia('v2', 'g1');
    const all = [gateway, viaA, viaB];
    const p = deriveTerritorialProfile(gateway, all);
    expect(p.category).toBe('world_opener');
    expect(p.viaCount).toBe(2);
    expect(p.memberId).toBe('g1');
  });

  it('P02 — open gateway + no via-members → gateway_potential', () => {
    const gateway = makeMapMember('g2', 'Max', 'revealed_stable', {
      gatewayAccessState: 'open',
      linkQualityBand: 'moderate',
    });
    const other = makeMapMember('x1', 'Other', 'revealed_stable');
    const p = deriveTerritorialProfile(gateway, [gateway, other]);
    expect(p.category).toBe('gateway_potential');
    expect(p.viaCount).toBe(0);
  });

  it('P03 — locked gateway → future_world', () => {
    const locked = makeMapMember('g3', 'Paul', 'waiting_other_side', {
      gatewayAccessState: 'locked',
    });
    const p = deriveTerritorialProfile(locked, [locked]);
    expect(p.category).toBe('future_world');
  });

  it('P04 — no gateway + strong quality → deep_link', () => {
    const link = makeMapMember('l1', 'Antoine', 'revealed_stable', {
      gatewayAccessState: 'none',
      linkQualityBand: 'strong',
    });
    const p = deriveTerritorialProfile(link, [link]);
    expect(p.category).toBe('deep_link');
    expect(p.viaCount).toBe(0);
  });

  it('P05 — no gateway + moderate quality → ambient', () => {
    const link = makeMapMember('l2', 'Théo', 'revealed_stable', {
      gatewayAccessState: 'none',
      linkQualityBand: 'moderate',
    });
    const p = deriveTerritorialProfile(link, [link]);
    expect(p.category).toBe('ambient');
  });

  it('P06 — faint quality + no gateway → ambient', () => {
    const link = makeMapMember('l3', 'Faint', 'revealed_stable', {
      gatewayAccessState: 'none',
      linkQualityBand: 'faint',
    });
    const p = deriveTerritorialProfile(link, [link]);
    expect(p.category).toBe('ambient');
  });

  it('P07 — only primarily_via members pointing to this node are counted', () => {
    const gateway = makeMapMember('g4', 'Sophie', 'revealed_stable', {
      gatewayAccessState: 'open',
    });
    // Points to g4 — should count
    const viaCorrect = makePrimarilyVia('v3', 'g4');
    // Points to a different node — should not count
    const viaOther = makePrimarilyVia('v4', 'g-other');
    // Direct member — should not count
    const direct = makeMapMember('d1', 'Direct', 'revealed_stable');
    const p = deriveTerritorialProfile(gateway, [gateway, viaCorrect, viaOther, direct]);
    expect(p.viaCount).toBe(1);
  });
});

// ─── Q: computeEgoLayoutV2 — topological placement ───────────────────────────

describe('Q: computeEgoLayoutV2 topological placement', () => {
  function makePrimarilyVia(id: string, relId: string): MapMember {
    return makeMapMember(id, `Via-${id}`, 'revealed_stable', {
      presenceMode: 'primarily_via',
      viaState: { kind: 'via', relId, viaName: 'Gateway' },
      gatewayAccessState: 'none',
      linkQualityBand: 'faint',
    });
  }

  it('Q01 — anchor (highest viaCount) lands at 12 oclock (top of canvas)', () => {
    const canvas = { width: 400, height: 400 };
    const cy = canvas.height / 2;
    const cx = canvas.width / 2;

    // 'b' = world_opener with viaCount=1, 'a' = gateway_potential with viaCount=0
    const opener = makeMapMember('b', 'Lena', 'revealed_stable', {
      proximityBand: 'edge', gatewayAccessState: 'open',
    });
    const potential = makeMapMember('a', 'Max', 'revealed_stable', {
      proximityBand: 'edge', gatewayAccessState: 'open',
    });
    const via = makePrimarilyVia('v1', 'b');
    const allGraph = [opener, potential, via];

    const nodes = computeEgoLayoutV2([opener, potential], canvas, allGraph);
    const anchorNode = nodes.find((n) => n.id === 'b')!; // highest viaCount → anchor

    // Anchor at i=0 → angle = -π/2 → top of canvas
    expect(anchorNode.cy).toBeLessThan(cy);
    expect(anchorNode.cx).toBeCloseTo(cx, 0);
  });

  it('Q02 — with 2 members, anchor at top and second member at bottom (N=2 uniform)', () => {
    const canvas = { width: 400, height: 400 };
    const cy = canvas.height / 2;

    // opener has viaCount=1 → anchor; deep_link has viaCount=0 → second
    const opener = makeMapMember('a', 'Lena', 'revealed_stable', {
      proximityBand: 'edge', gatewayAccessState: 'open',
    });
    const deep = makeMapMember('b', 'Antoine', 'revealed_stable', {
      proximityBand: 'edge', gatewayAccessState: 'none', linkQualityBand: 'strong',
    });
    const via = makePrimarilyVia('v1', 'a');
    const allGraph = [opener, deep, via];

    const nodes = computeEgoLayoutV2([opener, deep], canvas, allGraph);
    const anchorNode = nodes.find((n) => n.id === 'a')!;
    const secondNode = nodes.find((n) => n.id === 'b')!;

    // N=2: i=0 → angle=-π/2 (top), i=1 → angle=π/2 (bottom)
    expect(anchorNode.cy).toBeLessThan(cy);
    expect(secondNode.cy).toBeGreaterThan(cy);
  });

  it('Q03 — without allGraphMembers falls back to gateway-first sort', () => {
    const canvas = { width: 400, height: 400 };
    const cy = canvas.height / 2;

    // 'b' sorts after 'a' by id, but 'b' is open gateway — should be at top
    const plain = makeMapMember('a', 'Alice', 'revealed_stable', {
      proximityBand: 'edge', gatewayAccessState: 'none', linkQualityBand: 'strong',
    });
    const gateway = makeMapMember('b', 'Bob', 'revealed_stable', {
      proximityBand: 'edge', gatewayAccessState: 'open', linkQualityBand: 'strong',
    });

    // No allGraphMembers → falls back to layoutSortKey (gateway-first, uniform spread)
    const nodes = computeEgoLayoutV2([plain, gateway], canvas);
    const gNode = nodes.find((n) => n.id === 'b')!;
    const pNode = nodes.find((n) => n.id === 'a')!;
    expect(gNode.cy).toBeLessThan(cy);
    expect(pNode.cy).toBeGreaterThan(cy);
  });
});

// ─── T: computeMemberSimilarity ───────────────────────────────────────────────

describe('T: computeMemberSimilarity', () => {
  function makeProfile(
    id: string,
    category: TerritorialCategory,
    viaCount = 0,
  ): TerritorialProfile {
    return { memberId: id, category, viaCount };
  }

  it('T01 — identical category, no via signal → 0.7 (catSim=1.0, viaSim=0)', () => {
    const a = makeProfile('a', 'ambient');
    const b = makeProfile('b', 'ambient');
    expect(computeMemberSimilarity(a, b)).toBeCloseTo(0.7, 5);
  });

  it('T02 — world_opener vs ambient, no via → 0.0 (catSim=0.0, viaSim=0)', () => {
    const a = makeProfile('a', 'world_opener');
    const b = makeProfile('b', 'ambient');
    expect(computeMemberSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it('T03 — world_opener vs gateway_potential, no via → 0.56 (0.8 × 0.7)', () => {
    const a = makeProfile('a', 'world_opener');
    const b = makeProfile('b', 'gateway_potential');
    expect(computeMemberSimilarity(a, b)).toBeCloseTo(0.56, 5);
  });

  it('T04 — identical category + same viaCount > 0 → 1.0 (catSim=1.0, viaSim=1.0)', () => {
    const a = makeProfile('a', 'world_opener', 3);
    const b = makeProfile('b', 'world_opener', 3);
    // 1.0 * 0.7 + 1.0 * 0.3 = 1.0
    expect(computeMemberSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it('T05 — one viaCount=0 → via component is 0 regardless of other', () => {
    const a = makeProfile('a', 'world_opener', 3);
    const b = makeProfile('b', 'world_opener', 0);
    // catSim=1.0 → 0.7, viaSim=0 (b has no via signal)
    expect(computeMemberSimilarity(a, b)).toBeCloseTo(0.7, 5);
  });

  it('T06 — deep_link vs ambient, no via → 0.49 (0.7 × 0.7)', () => {
    const a = makeProfile('a', 'deep_link');
    const b = makeProfile('b', 'ambient');
    expect(computeMemberSimilarity(a, b)).toBeCloseTo(0.49, 5);
  });

  it('T07 — similarity is symmetric', () => {
    const pairs: [TerritorialCategory, TerritorialCategory][] = [
      ['world_opener', 'gateway_potential'],
      ['deep_link', 'future_world'],
      ['ambient', 'world_opener'],
    ];
    for (const [ca, cb] of pairs) {
      const a = makeProfile('a', ca, 2);
      const b = makeProfile('b', cb, 2);
      expect(computeMemberSimilarity(a, b)).toBeCloseTo(computeMemberSimilarity(b, a), 10);
    }
  });
});

// ─── U: orderMembersTopologically ────────────────────────────────────────────

describe('U: orderMembersTopologically', () => {
  function makeProfile(
    id: string,
    category: TerritorialCategory,
    viaCount = 0,
  ): [string, TerritorialProfile] {
    return [id, { memberId: id, category, viaCount }];
  }

  it('U01 — empty input → []', () => {
    expect(orderMembersTopologically([], new Map())).toEqual([]);
  });

  it('U02 — single member → [member]', () => {
    const m = makeMapMember('a', 'Alice', 'revealed_stable');
    const pm = new Map([makeProfile('a', 'world_opener', 1)]);
    expect(orderMembersTopologically([m], pm)).toEqual([m]);
  });

  it('U03 — anchor = highest viaCount member, regardless of input order', () => {
    const low  = makeMapMember('a', 'Alice', 'revealed_stable');
    const high = makeMapMember('b', 'Bob',   'revealed_stable');
    const pm = new Map([
      makeProfile('a', 'world_opener', 1),
      makeProfile('b', 'world_opener', 3),
    ]);
    const result = orderMembersTopologically([low, high], pm);
    // 'b' has higher viaCount → must be first
    expect(result[0].id).toBe('b');
  });

  it('U04 — tiebreak by id asc when viaCount equal', () => {
    const z = makeMapMember('z', 'Zoe', 'revealed_stable');
    const a = makeMapMember('a', 'Amy', 'revealed_stable');
    const pm = new Map([
      makeProfile('z', 'world_opener', 2),
      makeProfile('a', 'world_opener', 2),
    ]);
    const result = orderMembersTopologically([z, a], pm);
    expect(result[0].id).toBe('a'); // 'a' < 'z'
  });

  it('U05 — nearest-neighbor: structurally similar member follows anchor', () => {
    // Anchor = world_opener viaCount=2.
    // gateway_potential (similar) should come before ambient (dissimilar).
    const anchor = makeMapMember('a', 'Anchor',  'revealed_stable');
    const similar = makeMapMember('b', 'Similar', 'revealed_stable');
    const distant = makeMapMember('c', 'Distant', 'revealed_stable');
    const pm = new Map([
      makeProfile('a', 'world_opener',      2),
      makeProfile('b', 'gateway_potential', 0),
      makeProfile('c', 'ambient',           0),
    ]);
    const result = orderMembersTopologically([anchor, similar, distant], pm);
    expect(result[0].id).toBe('a');  // anchor first
    expect(result[1].id).toBe('b');  // gateway_potential closer to world_opener than ambient
    expect(result[2].id).toBe('c');
  });

  it('U06 — deterministic: same input always produces same order', () => {
    const members = [
      makeMapMember('x', 'X', 'revealed_stable'),
      makeMapMember('y', 'Y', 'revealed_stable'),
      makeMapMember('z', 'Z', 'revealed_stable'),
    ];
    const pm = new Map([
      makeProfile('x', 'world_opener',      2),
      makeProfile('y', 'ambient',           0),
      makeProfile('z', 'gateway_potential', 1),
    ]);
    const r1 = orderMembersTopologically(members, pm);
    const r2 = orderMembersTopologically(members, pm);
    expect(r1.map((m) => m.id)).toEqual(r2.map((m) => m.id));
  });
});

// ─── V: computeAngularGaps ────────────────────────────────────────────────────

describe('V: computeAngularGaps', () => {
  function p(category: TerritorialCategory, viaCount = 0): TerritorialProfile {
    return { memberId: 'x', category, viaCount };
  }

  it('V01 — dissimilar pair gets larger gap than similar pair', () => {
    // 3-node ring: [world_opener, gateway_potential, ambient]
    //   gap[0] ∝ 1 − sim(world_opener, gateway_potential) = 1 − 0.8 = 0.2  (similar)
    //   gap[1] ∝ 1 − sim(gateway_potential, ambient)      = 1 − 0.1 = 0.9  (dissimilar)
    // → gap[0] must be strictly smaller than gap[1].
    const profiles = [p('world_opener'), p('gateway_potential'), p('ambient')];
    const [gap0, gap1] = computeAngularGaps(profiles);
    expect(gap0).toBeLessThan(gap1);
  });

  it('V02 — topological order is not modified by gap computation', () => {
    // computeAngularGaps is pure and takes profiles in the order returned by
    // orderMembersTopologically; verify it never reorders the input.
    const profiles = [
      p('world_opener',      2),
      p('gateway_potential', 1),
      p('ambient',           0),
    ];
    const gaps = computeAngularGaps(profiles);
    // Gaps are indexed by position — we only verify length matches input length
    expect(gaps).toHaveLength(profiles.length);
  });

  it('V03 — deterministic: same input → same gaps', () => {
    const profiles = [
      p('world_opener',      2),
      p('gateway_potential', 0),
      p('deep_link',         0),
      p('ambient',           0),
    ];
    const g1 = computeAngularGaps(profiles);
    const g2 = computeAngularGaps(profiles);
    expect(g1).toEqual(g2);
  });

  it('V04 — sum of all gaps = 2π', () => {
    const profiles = [
      p('world_opener',      3),
      p('gateway_potential', 1),
      p('future_world',      0),
      p('deep_link',         0),
      p('ambient',           0),
    ];
    const gaps = computeAngularGaps(profiles);
    const total = gaps.reduce((s, g) => s + g, 0);
    expect(total).toBeCloseTo(2 * Math.PI, 10);
  });

  it('V05 — uniform fallback: all pairs equally similar → gaps = 2π/N each', () => {
    // Four ambient nodes — all pairwise sims identical → raw weights identical
    // → normalized gaps must equal 2π/4 = π/2 each.
    const profiles = [p('ambient'), p('ambient'), p('ambient'), p('ambient')];
    const gaps = computeAngularGaps(profiles);
    const expected = (2 * Math.PI) / 4;
    for (const g of gaps) {
      expect(g).toBeCloseTo(expected, 10);
    }
  });
});

// ─── W: applyNodeSpread ───────────────────────────────────────────────────────

describe('W: applyNodeSpread', () => {
  function makeLayoutNode(
    id: string,
    cx: number,
    cy: number,
    nodeRadius = 19,
  ): EgoLayoutNodeV2 {
    return {
      id,
      cx,
      cy,
      nodeRadius,
      gatewayPowerBand: 'moderate',
      gatewayAccessState: 'none',
    };
  }

  const CX = 200;
  const CY = 200;

  it('W01 — output length equals input length', () => {
    const nodes = [
      makeLayoutNode('a', 120, 200),
      makeLayoutNode('b', 280, 200),
      makeLayoutNode('c', 200, 120),
    ];
    expect(applyNodeSpread(nodes, CX, CY)).toHaveLength(3);
  });

  it('W02 — deterministic: same input → identical output', () => {
    const nodes = [
      makeLayoutNode('alpha', 130, 190),
      makeLayoutNode('beta',  270, 210),
      makeLayoutNode('gamma', 200, 130),
      makeLayoutNode('delta', 200, 270),
    ];
    const r1 = applyNodeSpread(nodes, CX, CY);
    const r2 = applyNodeSpread(nodes, CX, CY);
    r1.forEach((n, i) => {
      expect(n.cx).toBe(r2[i].cx);
      expect(n.cy).toBe(r2[i].cy);
    });
  });

  it('W03 — jitter displaces nodes from their original positions', () => {
    // Single node: no repulsion, only jitter. Position must change.
    // (Single-node edge case returns as-is — use 2 nodes placed far apart.)
    const nodes = [
      makeLayoutNode('p1', 110, 200),
      makeLayoutNode('p2', 290, 200),
    ];
    const result = applyNodeSpread(nodes, CX, CY);
    // At least one axis must differ from the original for each node
    const p1moved = result[0].cx !== nodes[0].cx || result[0].cy !== nodes[0].cy;
    const p2moved = result[1].cx !== nodes[1].cx || result[1].cy !== nodes[1].cy;
    expect(p1moved).toBe(true);
    expect(p2moved).toBe(true);
  });
});
