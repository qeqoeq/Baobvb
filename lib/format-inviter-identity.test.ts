import { describe, it, expect } from 'vitest';

import { formatInviterPrompt } from './format-inviter-identity';
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
});
