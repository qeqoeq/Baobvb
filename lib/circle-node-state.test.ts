import { describe, it, expect } from 'vitest';

import {
  computeEgoLayout,
  deriveCircleProximity,
  getCircleNodeStatus,
  getCircleNodeStatusLabel,
  getCircleNodeSortWeight,
  sortAndBucketEgoMembers,
  type CircleNodeStatus,
  type EgoGraphMember,
} from './circle-node-state';
import type { FoundationalReadingDerived } from './foundational-reading';
import type { Relation } from '../store/useRelationsStore';

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRevealSnapshot(
  status: 'waiting_other_side' | 'cooking_reveal' | 'reveal_ready' | 'revealed',
  extra: { revealed?: boolean; relationshipNameRevealed?: boolean } = {},
): Relation['localState']['revealSnapshot'] {
  return {
    status,
    revealed: extra.revealed ?? status === 'revealed',
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
}): FoundationalReadingDerived {
  const revealStatus = opts.revealStatus ?? 'waiting_other_side';
  return {
    hasFoundationalReading: opts.hasFoundationalReading ?? false,
    toNurture: opts.toNurture ?? false,
    relation: {
      id: 'test-id',
      name: 'Test Person',
      archived: opts.archived ?? false,
      createdAt: '2024-01-01',
      identityStatus: 'draft',
      source: 'manual',
      localState: {
        sideA: { exists: true, identityStatus: 'draft', hasPrivateReading: false },
        sideB: { exists: false, identityStatus: 'missing', hasPrivateReading: false },
        revealSnapshot: makeRevealSnapshot(revealStatus, {
          revealed: opts.revealed,
          relationshipNameRevealed: opts.relationshipNameRevealed,
        }),
      },
    },
    foundationalEvaluation: null,
    foundationalScore: null,
    linkTier: null,
    readingStatus: 'Unread',
    strongestPillar: null,
    weakestPillar: null,
    recentDate: '2024-01-01',
    badgeLabel: 'Unread',
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
  const TIER_STRINGS = ['Ghost', 'Spark', 'Thrill', 'Vibrant', 'Anchor', 'Legend'];
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
