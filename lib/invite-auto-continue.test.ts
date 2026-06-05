import { describe, it, expect } from 'vitest';

import {
  shouldAutoContinueInvite,
  type InviteAutoContinueInput,
} from './invite-auto-continue';

const baseInput: InviteAutoContinueInput = {
  continueAfterIdentity: '1',
  hasLocalIdentity: true,
  token: 'token-abc',
  isSubmitting: false,
  claimError: null,
  brokenLink: false,
  showUnresolvedContinuation: false,
};

describe('shouldAutoContinueInvite', () => {
  it('returns true when all guards are satisfied', () => {
    expect(shouldAutoContinueInvite(baseInput)).toBe(true);
  });

  it('returns false when continueAfterIdentity is undefined', () => {
    expect(
      shouldAutoContinueInvite({ ...baseInput, continueAfterIdentity: undefined }),
    ).toBe(false);
  });

  it('returns false when continueAfterIdentity is not exactly "1"', () => {
    expect(
      shouldAutoContinueInvite({ ...baseInput, continueAfterIdentity: 'true' }),
    ).toBe(false);
    expect(
      shouldAutoContinueInvite({ ...baseInput, continueAfterIdentity: '0' }),
    ).toBe(false);
  });

  it('returns false when hasLocalIdentity is false', () => {
    expect(
      shouldAutoContinueInvite({ ...baseInput, hasLocalIdentity: false }),
    ).toBe(false);
  });

  it('returns false when token is empty or whitespace', () => {
    expect(shouldAutoContinueInvite({ ...baseInput, token: '' })).toBe(false);
    expect(shouldAutoContinueInvite({ ...baseInput, token: '   ' })).toBe(false);
    expect(shouldAutoContinueInvite({ ...baseInput, token: undefined })).toBe(false);
  });

  it('returns false when isSubmitting is true', () => {
    expect(
      shouldAutoContinueInvite({ ...baseInput, isSubmitting: true }),
    ).toBe(false);
  });

  it('returns false when claimError is present', () => {
    expect(
      shouldAutoContinueInvite({ ...baseInput, claimError: 'expired' }),
    ).toBe(false);
  });

  it('returns false when brokenLink is true', () => {
    expect(
      shouldAutoContinueInvite({ ...baseInput, brokenLink: true }),
    ).toBe(false);
  });

  it('returns false when showUnresolvedContinuation is true', () => {
    expect(
      shouldAutoContinueInvite({ ...baseInput, showUnresolvedContinuation: true }),
    ).toBe(false);
  });
});
