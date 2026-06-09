import { describe, it, expect } from 'vitest';

import {
  formatInviterPrompt,
  normalizeInviterHandle,
} from './format-inviter-identity';
import type { InvitePreviewResult } from './reveal-shared-types';

const base: InvitePreviewResult = {
  inviter_display_name: 'Alice',
  inviter_handle: 'alice.bao',
  inviter_avatar_seed: 'A',
  expires_at: '2026-06-14T00:00:00.000Z',
  claimed_at: null,
};

describe('formatInviterPrompt', () => {
  it('falls back to "Someone" when preview is null', () => {
    expect(formatInviterPrompt(null)).toBe(
      'Someone opened a private space with you.',
    );
  });

  it('falls back to "Someone" when displayName is empty', () => {
    expect(
      formatInviterPrompt({ ...base, inviter_display_name: '' }),
    ).toBe('Someone opened a private space with you.');
  });

  it('falls back to "Someone" when displayName is whitespace only', () => {
    expect(
      formatInviterPrompt({ ...base, inviter_display_name: '   ' }),
    ).toBe('Someone opened a private space with you.');
  });

  it('shows displayName alone when handle is null', () => {
    expect(
      formatInviterPrompt({ ...base, inviter_handle: null }),
    ).toBe('Alice opened a private space with you.');
  });

  it('shows displayName alone when handle is empty', () => {
    expect(
      formatInviterPrompt({ ...base, inviter_handle: '' }),
    ).toBe('Alice opened a private space with you.');
  });

  it('shows displayName alone when handle is whitespace only', () => {
    expect(
      formatInviterPrompt({ ...base, inviter_handle: '   ' }),
    ).toBe('Alice opened a private space with you.');
  });

  it('shows "displayName (@handle)" when both are present', () => {
    expect(formatInviterPrompt(base)).toBe(
      'Alice (@alice.bao) opened a private space with you.',
    );
  });

  it('trims surrounding whitespace from displayName and handle', () => {
    expect(
      formatInviterPrompt({
        ...base,
        inviter_display_name: '  Bob  ',
        inviter_handle: '  bob.bao  ',
      }),
    ).toBe('Bob (@bob.bao) opened a private space with you.');
  });

  it('renders a single @ when the stored handle already has a leading @', () => {
    expect(
      formatInviterPrompt({
        ...base,
        inviter_display_name: 'Yasmine',
        inviter_handle: '@yasmine.baobab',
      }),
    ).toBe('Yasmine (@yasmine.baobab) opened a private space with you.');
  });

  it('collapses repeated @ in the stored handle to a single @', () => {
    expect(
      formatInviterPrompt({
        ...base,
        inviter_display_name: 'Yasmine',
        inviter_handle: '@@yasmine.baobab',
      }),
    ).toBe('Yasmine (@yasmine.baobab) opened a private space with you.');
  });

  it('trims whitespace before stripping the @ prefix', () => {
    expect(
      formatInviterPrompt({
        ...base,
        inviter_display_name: 'Yasmine',
        inviter_handle: '   @yasmine.baobab   ',
      }),
    ).toBe('Yasmine (@yasmine.baobab) opened a private space with you.');
  });

  it('never produces "@@" or "((" in any rendered output', () => {
    const cases: Array<string | null> = [
      'yasmine.baobab',
      '@yasmine.baobab',
      '@@yasmine.baobab',
      '@@@yasmine.baobab',
      '  @yasmine.baobab  ',
      null,
      '',
      '   ',
    ];
    for (const handle of cases) {
      const out = formatInviterPrompt({
        ...base,
        inviter_display_name: 'Yasmine',
        inviter_handle: handle,
      });
      expect(out.includes('@@')).toBe(false);
      expect(out.includes('((')).toBe(false);
    }
  });
});

describe('normalizeInviterHandle', () => {
  it('returns null for null / undefined / empty / whitespace', () => {
    expect(normalizeInviterHandle(null)).toBeNull();
    expect(normalizeInviterHandle(undefined)).toBeNull();
    expect(normalizeInviterHandle('')).toBeNull();
    expect(normalizeInviterHandle('   ')).toBeNull();
    expect(normalizeInviterHandle('@')).toBeNull();
    expect(normalizeInviterHandle('@@@')).toBeNull();
  });

  it('strips a single leading @', () => {
    expect(normalizeInviterHandle('@alice.bao')).toBe('alice.bao');
  });

  it('strips repeated leading @', () => {
    expect(normalizeInviterHandle('@@@alice.bao')).toBe('alice.bao');
  });

  it('leaves a non-@-prefixed handle untouched', () => {
    expect(normalizeInviterHandle('alice.bao')).toBe('alice.bao');
  });

  it('trims surrounding whitespace before stripping @', () => {
    expect(normalizeInviterHandle('   @alice.bao   ')).toBe('alice.bao');
  });
});
