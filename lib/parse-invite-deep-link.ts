// Pure deep-link parser for invite URLs.
//
// Lives in its own module (no expo-linking / react-native imports) so it stays
// testable under vitest. Uses the standard URL constructor, which is available
// in both Hermes/JSC and Node.

export type ParsedInviteDeepLink = {
  relationId: string;
  token: string;
};

/**
 * Parses an inbound deep link URL into invite params, or returns null when the URL
 * is not a valid invite link. Supports three shapes:
 *   - baobab://invite/{relationId}?token={token}
 *   - com.samo.baobab://invite/{relationId}?token={token}
 *   - https://getbaobab.app/invite/{relationId}?token={token}
 *
 * Explicitly ignores expo-development-client launcher URLs.
 * Pure: no I/O, no router dependency.
 */
export function parseInviteDeepLink(url: string | null | undefined): ParsedInviteDeepLink | null {
  if (typeof url !== 'string' || url.length === 0) return null;
  if (url.includes('expo-development-client')) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const hostname = parsed.hostname;
  const pathname = parsed.pathname.replace(/^\/+/, '');

  // Two URL shapes to recognize after parsing:
  //   custom scheme → hostname='invite', pathname='/{relationId}'
  //   universal link → hostname='getbaobab.app', pathname='/invite/{relationId}'
  let relationIdRaw: string | undefined;
  if (hostname === 'invite' && pathname.length > 0) {
    relationIdRaw = pathname.split('/')[0];
  } else if (pathname.startsWith('invite/')) {
    relationIdRaw = pathname.slice('invite/'.length).split('/')[0];
  } else {
    return null;
  }
  if (!relationIdRaw) return null;

  const tokenRaw = parsed.searchParams.get('token');
  const token = typeof tokenRaw === 'string' ? tokenRaw.trim() : '';
  const relationId = (() => {
    try {
      return decodeURIComponent(relationIdRaw).trim();
    } catch {
      return relationIdRaw.trim();
    }
  })();

  if (!relationId || !token) return null;
  return { relationId, token };
}
