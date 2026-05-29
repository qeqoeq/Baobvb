import { describe, it, expect } from 'vitest';

import {
  getRelationContextCard,
  getReadingCardVariant,
  getReadingNoteText,
  getVisibleTierLabel,
  getRelationNextAction,
  getSharedRevealDisplayState,
} from './relation-detail-helpers';

// ── getRelationContextCard ──────────────────────────────────────────────────

describe('getRelationContextCard', () => {
  it('returns archived card when archived is true', () => {
    const result = getRelationContextCard({
      archived: true,
      canonicalRelationId: null,
      source: 'manual',
    });
    expect(result?.title).toBe('Archived');
  });

  it('returns shared-backed when canonicalRelationId is set', () => {
    const result = getRelationContextCard({
      archived: false,
      canonicalRelationId: 'some-uuid',
      source: 'manual',
    });
    expect(result?.title).toBe('Shared connection');
  });

  it('returns shared-backed when source is bootstrap', () => {
    const result = getRelationContextCard({
      archived: false,
      canonicalRelationId: null,
      source: 'bootstrap',
    });
    expect(result?.title).toBe('Shared connection');
  });

  it('returns shared-backed when source is claim', () => {
    const result = getRelationContextCard({
      archived: false,
      canonicalRelationId: null,
      source: 'claim',
    });
    expect(result?.title).toBe('Shared connection');
  });

  it('returns scan draft when source is scan', () => {
    const result = getRelationContextCard({
      archived: false,
      canonicalRelationId: null,
      source: 'scan',
    });
    expect(result?.title).toBe('Added from scan');
  });

  it('returns local draft when source is manual', () => {
    const result = getRelationContextCard({
      archived: false,
      canonicalRelationId: null,
      source: 'manual',
    });
    expect(result?.title).toBe('Private draft');
  });

  it('archived takes priority over shared-backed source', () => {
    const result = getRelationContextCard({
      archived: true,
      canonicalRelationId: 'some-uuid',
      source: 'bootstrap',
    });
    expect(result?.title).toBe('Archived');
  });
});

// ── getVisibleTierLabel ─────────────────────────────────────────────────────

describe('getVisibleTierLabel', () => {
  it('returns badge label when revealed and has evaluation', () => {
    expect(getVisibleTierLabel(true, true, 'Anchor')).toBe('Anchor');
  });

  it('returns "Private reading" when not revealed but has evaluation', () => {
    expect(getVisibleTierLabel(false, true, 'Anchor')).toBe('Private reading');
  });

  it('returns "Unread" when no evaluation regardless of reveal', () => {
    expect(getVisibleTierLabel(false, false, 'Anchor')).toBe('Unread');
    expect(getVisibleTierLabel(true, false, 'Anchor')).toBe('Unread');
  });
});

// ── getReadingNoteText ──────────────────────────────────────────────────────

describe('getReadingNoteText', () => {
  it('returns revealed note when nameRevealed is true', () => {
    expect(getReadingNoteText(true, 'revealed')).toBe(
      'Reading is one layer of this link.',
    );
  });

  it('returns one-time action note when reveal_ready and not yet revealed', () => {
    expect(getReadingNoteText(false, 'reveal_ready')).toBe(
      'The reveal is a one-time action.',
    );
  });

  it('returns private note for waiting_other_side', () => {
    expect(getReadingNoteText(false, 'waiting_other_side')).toBe(
      'Your reading stays private until both sides share.',
    );
  });

  it('returns private note for cooking_reveal', () => {
    expect(getReadingNoteText(false, 'cooking_reveal')).toBe(
      'Your reading stays private until both sides share.',
    );
  });

  it('nameRevealed takes priority over reveal_ready status', () => {
    // Status is reveal_ready but name is already revealed → revealed note wins
    expect(getReadingNoteText(true, 'reveal_ready')).toBe(
      'Reading is one layer of this link.',
    );
  });
});

// ── getReadingCardVariant ───────────────────────────────────────────────────

describe('getReadingCardVariant', () => {
  it('returns unread when no evaluation', () => {
    expect(
      getReadingCardVariant({ hasEvaluation: false, nameRevealed: false, revealStatus: 'waiting_other_side' }),
    ).toBe('unread');
  });

  it('returns revealed when nameRevealed is true', () => {
    expect(
      getReadingCardVariant({ hasEvaluation: true, nameRevealed: true, revealStatus: 'revealed' }),
    ).toBe('revealed');
  });

  it('returns reveal_ready when status is reveal_ready', () => {
    expect(
      getReadingCardVariant({ hasEvaluation: true, nameRevealed: false, revealStatus: 'reveal_ready' }),
    ).toBe('reveal_ready');
  });

  it('returns waiting_other_side when status is waiting_other_side', () => {
    expect(
      getReadingCardVariant({ hasEvaluation: true, nameRevealed: false, revealStatus: 'waiting_other_side' }),
    ).toBe('waiting_other_side');
  });

  it('returns cooking when status is cooking_reveal', () => {
    expect(
      getReadingCardVariant({ hasEvaluation: true, nameRevealed: false, revealStatus: 'cooking_reveal' }),
    ).toBe('cooking');
  });

  it('returns private_fallback for revealed status without nameRevealed', () => {
    expect(
      getReadingCardVariant({ hasEvaluation: true, nameRevealed: false, revealStatus: 'revealed' }),
    ).toBe('private_fallback');
  });

  it('nameRevealed takes priority over missing evaluation', () => {
    // Mutual reveal wins even without local evaluation (bootstrap / claim relations have no local eval)
    expect(
      getReadingCardVariant({ hasEvaluation: false, nameRevealed: true, revealStatus: 'revealed' }),
    ).toBe('revealed');
  });
});

// ── getRelationNextAction ───────────────────────────────────────────────────

const baseRelation = {
  archived: false,
  source: 'manual' as const,
  canonicalRelationId: 'some-uuid',
  anchorMode: undefined,
};

describe('getRelationNextAction', () => {
  it('cooking_reveal leads with "Both sides are in"', () => {
    const result = getRelationNextAction({
      relation: baseRelation,
      hasEvaluation: true,
      revealStatus: 'cooking_reveal',
      nameRevealed: false,
      deliveryChannelOpened: false,
    });
    expect(result.title).toBe('Both sides are in');
    expect(result.body).toBe('The reveal is being prepared.');
  });

  it('claim + waiting_other_side shows accurate waiting copy', () => {
    const result = getRelationNextAction({
      relation: { ...baseRelation, source: 'claim' as const },
      hasEvaluation: true,
      revealStatus: 'waiting_other_side',
      nameRevealed: false,
      deliveryChannelOpened: false,
    });
    expect(result.title).toBe('Reading private');
    expect(result.body).toBe('Saved on your side. The reveal waits for both.');
  });

  it('reveal_ready without local evaluation shows Open reveal (bootstrap / claim relations)', () => {
    const result = getRelationNextAction({
      relation: { ...baseRelation, source: 'bootstrap' as const },
      hasEvaluation: false,
      revealStatus: 'reveal_ready',
      nameRevealed: false,
      deliveryChannelOpened: false,
    });
    expect(result.ctaKind).toBe('reveal');
    expect(result.ctaLabel).toBe('Open reveal');
  });

  it('nameRevealed shows the shared view unlocked message with no CTA', () => {
    const result = getRelationNextAction({
      relation: baseRelation,
      hasEvaluation: true,
      revealStatus: 'revealed',
      nameRevealed: true,
      deliveryChannelOpened: false,
    });
    expect(result.title).toBe('Shared view unlocked');
    expect(result.body).toBe('You can now read this connection together.');
    expect(result.ctaKind).toBeNull();
    expect(result.ctaLabel).toBeNull();
  });
});

// ── getSharedRevealDisplayState ─────────────────────────────────────────────

describe('getSharedRevealDisplayState', () => {
  it('returns hidden when not revealed', () => {
    const result = getSharedRevealDisplayState({ nameRevealed: false, visibleScore: 82, revealedTier: 'Anchor' });
    expect(result.kind).toBe('hidden');
  });

  it('returns score when revealed with score and tier', () => {
    const result = getSharedRevealDisplayState({ nameRevealed: true, visibleScore: 82, revealedTier: 'Anchor' });
    expect(result.kind).toBe('score');
    if (result.kind === 'score') {
      expect(result.score).toBe(82);
      expect(result.tier).toBe('Anchor');
    }
  });

  it('uses "Shared reading" as tier fallback when revealedTier is null', () => {
    const result = getSharedRevealDisplayState({ nameRevealed: true, visibleScore: 65, revealedTier: null });
    expect(result.kind).toBe('score');
    if (result.kind === 'score') {
      expect(result.tier).toBe('Shared reading');
    }
  });

  it('returns pending when revealed but score is null — no "Private reading" fallback', () => {
    // This is the bootstrap/claim case: server returned status revealed but mutual_score: null
    const result = getSharedRevealDisplayState({ nameRevealed: true, visibleScore: null, revealedTier: null });
    expect(result.kind).toBe('pending');
  });

  it('returns score when revealed with score even if tier is null', () => {
    const result = getSharedRevealDisplayState({ nameRevealed: true, visibleScore: 45, revealedTier: null });
    expect(result.kind).toBe('score');
    if (result.kind === 'score') {
      expect(result.score).toBe(45);
      expect(result.tier).toBe('Shared reading');
    }
  });

  it('returns pending when revealed + visibleScore null + revealedTier null — bootstrap before score loads', () => {
    // Bootstrap/claim relations have no local evaluation and my_shared_relationships() does not
    // return mutual_score. If the reveal is opened before the full shared record is fetched,
    // visibleScore is null and the display must show pending, not a fabricated score.
    const result = getSharedRevealDisplayState({ nameRevealed: true, visibleScore: null, revealedTier: null });
    expect(result.kind).toBe('pending');
  });
});
