/**
 * Pure helpers for auth gate routing decisions in app/_layout.tsx.
 * No React, no router — decision logic only. Logging and router.replace() stay in _layout.tsx.
 */

/**
 * Params to carry to the sign-in screen when the user is not authenticated.
 * relationId and token are only present when redirecting from an invite route.
 */
export type SignInRedirectTarget = {
  redirectPath: string;
  relationId?: string;
  token?: string;
};

export type PostAuthDestination =
  | { route: '/(tabs)' }
  | { route: '/invite/identity/[relationId]'; relationId: string; token?: string }
  | { route: '/invite/[relationId]'; relationId: string; token?: string }
  | { route: '/relation/[id]'; id: string };

/**
 * Decides what params to carry to the sign-in screen when the user is not authenticated.
 * Preserves invite context (relationId, token) when redirecting from an invite route,
 * so post-auth navigation can return to the correct destination.
 */
export function resolveSignInRedirectTarget(input: {
  pathname: string;
  relationId: string;
  token: string;
}): SignInRedirectTarget {
  if (input.pathname.startsWith('/invite/') && input.relationId) {
    const isIdentityInvite = input.pathname.startsWith('/invite/identity/');
    return {
      redirectPath: isIdentityInvite ? '/invite/identity/[relationId]' : '/invite/[relationId]',
      relationId: input.relationId,
      ...(input.token ? { token: input.token } : {}),
    };
  }
  return { redirectPath: input.pathname };
}

/**
 * Resolves the post-auth destination from params preserved on the sign-in screen.
 * Handles 4 cases: invite identity, invite arrival, relation, fallback tabs.
 * Pure — no side effects, no router dependency.
 */
export function resolvePostAuthDestination(input: {
  redirectPath: string;
  relationId: string;
  inviteToken: string;
}): PostAuthDestination {
  const { redirectPath, relationId, inviteToken } = input;

  if (redirectPath === '/invite/identity/[relationId]' && relationId) {
    return {
      route: '/invite/identity/[relationId]',
      relationId,
      ...(inviteToken ? { token: inviteToken } : {}),
    };
  }
  if (redirectPath === '/invite/[relationId]' && relationId) {
    return {
      route: '/invite/[relationId]',
      relationId,
      ...(inviteToken ? { token: inviteToken } : {}),
    };
  }
  const relationMatch = redirectPath.match(/^\/relation\/([^/]+)$/);
  if (relationMatch?.[1]) {
    return {
      route: '/relation/[id]',
      id: decodeURIComponent(relationMatch[1]),
    };
  }
  return { route: '/(tabs)' };
}
