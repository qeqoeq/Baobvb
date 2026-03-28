import { describe, it, expect } from 'vitest';

import { resolveSignInRedirectTarget, resolvePostAuthDestination } from './auth-routing';

// ── resolveSignInRedirectTarget ─────────────────────────────────────────────

describe('resolveSignInRedirectTarget', () => {
  it('returns pathname as redirectPath for non-invite routes', () => {
    const result = resolveSignInRedirectTarget({
      pathname: '/(tabs)',
      relationId: '',
      token: '',
    });
    expect(result).toEqual({ redirectPath: '/(tabs)' });
  });

  it('returns pathname for invite route without relationId', () => {
    const result = resolveSignInRedirectTarget({
      pathname: '/invite/some-id',
      relationId: '',
      token: '',
    });
    expect(result).toEqual({ redirectPath: '/invite/some-id' });
  });

  it('preserves invite arrival context with relationId', () => {
    const result = resolveSignInRedirectTarget({
      pathname: '/invite/some-id',
      relationId: 'rel-123',
      token: '',
    });
    expect(result).toEqual({
      redirectPath: '/invite/[relationId]',
      relationId: 'rel-123',
    });
  });

  it('preserves invite identity context with relationId', () => {
    const result = resolveSignInRedirectTarget({
      pathname: '/invite/identity/some-id',
      relationId: 'rel-123',
      token: '',
    });
    expect(result).toEqual({
      redirectPath: '/invite/identity/[relationId]',
      relationId: 'rel-123',
    });
  });

  it('includes token when present on invite route', () => {
    const result = resolveSignInRedirectTarget({
      pathname: '/invite/some-id',
      relationId: 'rel-123',
      token: 'tok-abc',
    });
    expect(result).toEqual({
      redirectPath: '/invite/[relationId]',
      relationId: 'rel-123',
      token: 'tok-abc',
    });
  });

  it('omits token key when token is empty', () => {
    const result = resolveSignInRedirectTarget({
      pathname: '/invite/some-id',
      relationId: 'rel-123',
      token: '',
    });
    expect(result).not.toHaveProperty('token');
  });
});

// ── resolvePostAuthDestination ──────────────────────────────────────────────

describe('resolvePostAuthDestination', () => {
  it('returns tabs for empty redirectPath', () => {
    const result = resolvePostAuthDestination({
      redirectPath: '',
      relationId: '',
      inviteToken: '',
    });
    expect(result).toEqual({ route: '/(tabs)' });
  });

  it('returns tabs for unrecognized redirectPath', () => {
    const result = resolvePostAuthDestination({
      redirectPath: '/some/random/path',
      relationId: '',
      inviteToken: '',
    });
    expect(result).toEqual({ route: '/(tabs)' });
  });

  it('resolves invite identity destination', () => {
    const result = resolvePostAuthDestination({
      redirectPath: '/invite/identity/[relationId]',
      relationId: 'rel-123',
      inviteToken: '',
    });
    expect(result).toEqual({
      route: '/invite/identity/[relationId]',
      relationId: 'rel-123',
    });
  });

  it('resolves invite arrival destination', () => {
    const result = resolvePostAuthDestination({
      redirectPath: '/invite/[relationId]',
      relationId: 'rel-123',
      inviteToken: '',
    });
    expect(result).toEqual({
      route: '/invite/[relationId]',
      relationId: 'rel-123',
    });
  });

  it('includes token in invite destination when present', () => {
    const result = resolvePostAuthDestination({
      redirectPath: '/invite/[relationId]',
      relationId: 'rel-123',
      inviteToken: 'tok-abc',
    });
    expect(result).toEqual({
      route: '/invite/[relationId]',
      relationId: 'rel-123',
      token: 'tok-abc',
    });
  });

  it('resolves relation destination from path', () => {
    const result = resolvePostAuthDestination({
      redirectPath: '/relation/abc-123',
      relationId: '',
      inviteToken: '',
    });
    expect(result).toEqual({
      route: '/relation/[id]',
      id: 'abc-123',
    });
  });

  it('decodes URI-encoded relation id', () => {
    const result = resolvePostAuthDestination({
      redirectPath: '/relation/abc%20123',
      relationId: '',
      inviteToken: '',
    });
    expect(result).toEqual({
      route: '/relation/[id]',
      id: 'abc 123',
    });
  });

  it('ignores invite destination when relationId is empty', () => {
    const result = resolvePostAuthDestination({
      redirectPath: '/invite/[relationId]',
      relationId: '',
      inviteToken: '',
    });
    expect(result).toEqual({ route: '/(tabs)' });
  });
});
