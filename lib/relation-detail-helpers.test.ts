import { describe, it, expect } from 'vitest';

import {
  getRelationContextCard,
  getReadingCardVariant,
  getReadingNoteText,
  getVisibleTierLabel,
} from './relation-detail-helpers';

// ── getRelationContextCard ──────────────────────────────────────────────────

describe('getRelationContextCard', () => {
  it('returns archived card when archived is true', () => {
    const result = getRelationContextCard({
      archived: true,
      canonicalRelationId: null,
      source: 'manual',
    });
    expect(result?.title).toBe('Archived relation');
  });

  it('returns shared-backed when canonicalRelationId is set', () => {
    const result = getRelationContextCard({
      archived: false,
      canonicalRelationId: 'some-uuid',
      source: 'manual',
    });
    expect(result?.title).toBe('Shared-backed relation');
  });

  it('returns shared-backed when source is bootstrap', () => {
    const result = getRelationContextCard({
      archived: false,
      canonicalRelationId: null,
      source: 'bootstrap',
    });
    expect(result?.title).toBe('Shared-backed relation');
  });

  it('returns shared-backed when source is claim', () => {
    const result = getRelationContextCard({
      archived: false,
      canonicalRelationId: null,
      source: 'claim',
    });
    expect(result?.title).toBe('Shared-backed relation');
  });

  it('returns scan draft when source is scan', () => {
    const result = getRelationContextCard({
      archived: false,
      canonicalRelationId: null,
      source: 'scan',
    });
    expect(result?.title).toBe('Local scan draft');
  });

  it('returns local draft when source is manual', () => {
    const result = getRelationContextCard({
      archived: false,
      canonicalRelationId: null,
      source: 'manual',
    });
    expect(result?.title).toBe('Local draft');
  });

  it('archived takes priority over shared-backed source', () => {
    const result = getRelationContextCard({
      archived: true,
      canonicalRelationId: 'some-uuid',
      source: 'bootstrap',
    });
    expect(result?.title).toBe('Archived relation');
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
      'This reading helps define how this connection is understood.',
    );
  });

  it('returns one-time action note when reveal_ready and not yet revealed', () => {
    expect(getReadingNoteText(false, 'reveal_ready')).toBe(
      'Opening the reveal is a one-time action.',
    );
  });

  it('returns private note for waiting_other_side', () => {
    expect(getReadingNoteText(false, 'waiting_other_side')).toBe(
      'Your private side is saved and stays hidden until reveal.',
    );
  });

  it('returns private note for cooking_reveal', () => {
    expect(getReadingNoteText(false, 'cooking_reveal')).toBe(
      'Your private side is saved and stays hidden until reveal.',
    );
  });

  it('nameRevealed takes priority over reveal_ready status', () => {
    // Status is reveal_ready but name is already revealed → revealed note wins
    expect(getReadingNoteText(true, 'reveal_ready')).toBe(
      'This reading helps define how this connection is understood.',
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

  it('unread takes priority over nameRevealed', () => {
    // No evaluation — always unread even if nameRevealed were somehow true
    expect(
      getReadingCardVariant({ hasEvaluation: false, nameRevealed: true, revealStatus: 'revealed' }),
    ).toBe('unread');
  });
});
