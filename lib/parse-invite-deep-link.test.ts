import { describe, it, expect } from 'vitest';

import { parseInviteDeepLink } from './parse-invite-deep-link';

const RELATION_ID = 'a93a8e99-8415-49fb-b9bf-c1abef006d81';
const TOKEN = '839099c92461f4b459f579e5752f8e7dee3d182cd7fc8384';

describe('parseInviteDeepLink', () => {
  it('parses baobab:// custom scheme', () => {
    const url = `baobab://invite/${RELATION_ID}?token=${TOKEN}`;
    expect(parseInviteDeepLink(url)).toEqual({ relationId: RELATION_ID, token: TOKEN });
  });

  it('parses com.samo.baobab:// custom scheme', () => {
    const url = `com.samo.baobab://invite/${RELATION_ID}?token=${TOKEN}`;
    expect(parseInviteDeepLink(url)).toEqual({ relationId: RELATION_ID, token: TOKEN });
  });

  it('parses https://getbaobab.app universal link', () => {
    const url = `https://getbaobab.app/invite/${RELATION_ID}?token=${TOKEN}`;
    expect(parseInviteDeepLink(url)).toEqual({ relationId: RELATION_ID, token: TOKEN });
  });

  it('parses URL with extra slashes (baobab:///invite/...)', () => {
    const url = `baobab:///invite/${RELATION_ID}?token=${TOKEN}`;
    expect(parseInviteDeepLink(url)).toEqual({ relationId: RELATION_ID, token: TOKEN });
  });

  it('handles URL-encoded relationId', () => {
    const encoded = encodeURIComponent(RELATION_ID);
    const url = `baobab://invite/${encoded}?token=${TOKEN}`;
    expect(parseInviteDeepLink(url)).toEqual({ relationId: RELATION_ID, token: TOKEN });
  });

  it('returns null for null / empty / non-string input', () => {
    expect(parseInviteDeepLink(null)).toBeNull();
    expect(parseInviteDeepLink(undefined)).toBeNull();
    expect(parseInviteDeepLink('')).toBeNull();
  });

  it('returns null when token query param is missing', () => {
    expect(parseInviteDeepLink(`baobab://invite/${RELATION_ID}`)).toBeNull();
  });

  it('returns null when relationId is missing', () => {
    expect(parseInviteDeepLink(`baobab://invite/?token=${TOKEN}`)).toBeNull();
  });

  it('returns null for non-invite paths', () => {
    expect(parseInviteDeepLink(`baobab://relation/${RELATION_ID}?token=${TOKEN}`)).toBeNull();
    expect(parseInviteDeepLink(`baobab://tabs`)).toBeNull();
  });

  it('explicitly ignores expo-development-client launcher URLs', () => {
    const url = `com.samo.baobab://expo-development-client/?url=http%3A%2F%2F192.168.1.10%3A8081`;
    expect(parseInviteDeepLink(url)).toBeNull();
  });

  it('ignores expo-development-client even when it carries an invite path fragment', () => {
    const url = `com.samo.baobab://expo-development-client/?url=baobab%3A%2F%2Finvite%2F${RELATION_ID}%3Ftoken%3D${TOKEN}`;
    expect(parseInviteDeepLink(url)).toBeNull();
  });
});
