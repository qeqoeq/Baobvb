import { describe, it, expect } from 'vitest';

import { getPrimaryNavItems } from './primary-nav';

// ── getPrimaryNavItems — B23 permanent navigation invariant ───────────────────

describe('getPrimaryNavItems', () => {
  it('N1: always returns the four entries in a stable order', () => {
    const keys = getPrimaryNavItems({ pendingReveals: 5 }).map((i) => i.key);
    expect(keys).toEqual(['garden', 'places', 'reveals', 'profile']);
  });

  it('N2: entries are ALL present even when every count is zero (the B23 rule)', () => {
    const items = getPrimaryNavItems({ pendingReveals: 0 });
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.key)).toEqual(['garden', 'places', 'reveals', 'profile']);
    // Every entry exists — none is gated by a count.
    expect(items.every((i) => i.label.length > 0)).toBe(true);
  });

  it('N3: pendingReveals surfaces as an informational badge on reveals only', () => {
    const items = getPrimaryNavItems({ pendingReveals: 3 });
    const byKey = Object.fromEntries(items.map((i) => [i.key, i.badge]));
    expect(byKey.reveals).toBe(3);
    expect(byKey.garden).toBeNull();
    expect(byKey.places).toBeNull();
    expect(byKey.profile).toBeNull();
  });

  it('N4: zero pendingReveals → reveals badge is null but the entry still exists', () => {
    const reveals = getPrimaryNavItems({ pendingReveals: 0 }).find((i) => i.key === 'reveals')!;
    expect(reveals).toBeDefined();
    expect(reveals.badge).toBeNull();
  });

  it('N5: negative / fractional counts are floored and clamped to a null badge', () => {
    expect(getPrimaryNavItems({ pendingReveals: -2 }).find((i) => i.key === 'reveals')!.badge).toBeNull();
    expect(getPrimaryNavItems({ pendingReveals: 2.9 }).find((i) => i.key === 'reveals')!.badge).toBe(2);
  });
});
