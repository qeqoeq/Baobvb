import { useEffect, useRef, useState } from 'react';
import { Stack, router, useGlobalSearchParams, usePathname } from 'expo-router';

import { colors } from '../constants/colors';
import { devLogLinking, maskIdForLog } from '../lib/dev-linking-log';
import { fetchMySharedRelationships } from '../lib/bootstrap-shared-relations';
import {
  addRevealReadyNotificationResponseListener,
  configureNotificationPresentation,
  getLaunchRelationIdFromLastNotification,
  registerDevicePushTokenForCurrentUser,
} from '../lib/push-notifications';
import { getOrCreatePublicProfileId } from '../lib/public-profile';
import { resolvePostAuthDestination, resolveSignInRedirectTarget } from '../lib/auth-routing';
import { getCurrentAuthenticatedUser } from '../lib/supabase-auth';
import { supabase } from '../lib/supabase';
import { useRelationsStore } from '../store/useRelationsStore';

export default function RootLayout() {
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ redirectPath?: string; relationId?: string; token?: string }>();
  const [authResolved, setAuthResolved] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const pushRegistrationRef = useRef(false);
  const { me, isHydrated, setAuthIdentity, setPublicProfileId, bootstrapSharedRelations } = useRelationsStore();
  const provisionedForUserIdRef = useRef<string | null>(null);
  const bootstrappedForUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    configureNotificationPresentation();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const user = await getCurrentAuthenticatedUser();
        setIsAuthenticated(Boolean(user));
        setAuthIdentity(user?.id ?? null);
      } finally {
        setAuthResolved(true);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
      setAuthResolved(true);
      setAuthIdentity(session?.user?.id ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authResolved) return;
    const onAuthScreen = pathname === '/auth/sign-in';

    // Not authenticated and not already on the auth screen → redirect to sign-in.
    if (!isAuthenticated && !onAuthScreen) {
      const signInTarget = resolveSignInRedirectTarget({
        pathname,
        relationId: typeof globalParams.relationId === 'string' ? globalParams.relationId.trim() : '',
        token: typeof globalParams.token === 'string' ? globalParams.token.trim() : '',
      });
      if (signInTarget.relationId) {
        devLogLinking('auth-gate → sign-in (invite)', {
          pathname,
          inviteKind: signInTarget.redirectPath.startsWith('/invite/identity/') ? 'identity' : 'arrival',
          relationId: maskIdForLog(signInTarget.relationId),
          hasToken: Boolean(signInTarget.token),
        });
      } else {
        devLogLinking('auth-gate → sign-in (generic)', { pathname });
      }
      router.replace({
        pathname: '/auth/sign-in',
        params: {
          redirectPath: signInTarget.redirectPath,
          ...(signInTarget.relationId ? { relationId: signInTarget.relationId } : {}),
          ...(signInTarget.token ? { token: signInTarget.token } : {}),
        },
      });
      return;
    }

    // Authenticated and still on the sign-in screen → navigate to destination.
    // This is the only place post-auth navigation happens, ensuring isAuthenticated
    // is already true before any route change occurs (no race with the auth gate).
    if (isAuthenticated && onAuthScreen) {
      const redirectPath =
        typeof globalParams.redirectPath === 'string' ? globalParams.redirectPath.trim() : '';
      const relationId =
        typeof globalParams.relationId === 'string' ? globalParams.relationId.trim() : '';
      const inviteToken =
        typeof globalParams.token === 'string' ? globalParams.token.trim() : '';

      const destination = resolvePostAuthDestination({ redirectPath, relationId, inviteToken });

      if (destination.route === '/invite/identity/[relationId]') {
        devLogLinking('auth-gate → invite identity (post-auth)', {
          relationId: maskIdForLog(destination.relationId),
          hasToken: Boolean(destination.token),
        });
        router.replace({
          pathname: '/invite/identity/[relationId]',
          params: { relationId: destination.relationId, ...(destination.token ? { token: destination.token } : {}) },
        });
        return;
      }
      if (destination.route === '/invite/[relationId]') {
        devLogLinking('auth-gate → invite arrival (post-auth)', {
          relationId: maskIdForLog(destination.relationId),
          hasToken: Boolean(destination.token),
        });
        router.replace({
          pathname: '/invite/[relationId]',
          params: { relationId: destination.relationId, ...(destination.token ? { token: destination.token } : {}) },
        });
        return;
      }
      if (destination.route === '/relation/[id]') {
        devLogLinking('auth-gate → relation (post-auth)', {
          id: maskIdForLog(destination.id),
        });
        router.replace({
          pathname: '/relation/[id]',
          params: { id: destination.id },
        });
        return;
      }
      devLogLinking('auth-gate → tabs (post-auth)', { redirectPath });
      router.replace('/(tabs)');
      return;
    }
  }, [authResolved, isAuthenticated, pathname, globalParams.redirectPath, globalParams.relationId, globalParams.token]);

  // Profile setup gate — runs continuously so it catches both first-run and
  // Cancel-back-to-tabs. Exits immediately for every authenticated+setup user.
  useEffect(() => {
    if (!isAuthenticated || !isHydrated || me.isProfileSetup) return;
    // Don't interrupt invite/auth flows that handle identity themselves.
    if (pathname === '/me/edit') return;
    if (pathname.startsWith('/auth/') || pathname.startsWith('/invite/')) return;
    devLogLinking('auth-gate → profile setup (first-run)', { pathname });
    router.replace({ pathname: '/me/edit', params: { setup: '1' } });
  }, [isAuthenticated, isHydrated, me.isProfileSetup, pathname]);

  useEffect(() => {
    const userId = me.internalAuthUserId ?? null;
    if (!userId) {
      // Signed out or not yet resolved — reset so a different account can provision cleanly.
      provisionedForUserIdRef.current = null;
      setPublicProfileId(null);
      return;
    }
    if (provisionedForUserIdRef.current === userId) return;
    provisionedForUserIdRef.current = userId;
    void getOrCreatePublicProfileId()
      .then((id) => {
        setPublicProfileId(id);
      })
      .catch(() => {
        // Best-effort: publicProfileId stays null, QR remains v1, app is unaffected.
        // Will retry on next app launch when the user is still authenticated.
        provisionedForUserIdRef.current = null;
        if (__DEV__) {
          console.warn('[identity] publicProfileId provisioning failed — QR stays v1');
        }
      });
  }, [me.internalAuthUserId]);

  useEffect(() => {
    const userId = me.internalAuthUserId ?? null;
    if (!userId) {
      bootstrappedForUserIdRef.current = null;
      return;
    }
    if (bootstrappedForUserIdRef.current === userId) return;
    bootstrappedForUserIdRef.current = userId;
    void fetchMySharedRelationships()
      .then((rows) => bootstrapSharedRelations(rows))
      .catch(() => {
        // Best-effort: bootstrap failure is silent.
        // The store retains whatever was previously persisted.
        // Will retry on next app launch when the user is still authenticated.
        bootstrappedForUserIdRef.current = null;
      });
  }, [me.internalAuthUserId]);

  useEffect(() => {
    if (!isAuthenticated || pushRegistrationRef.current) return;
    pushRegistrationRef.current = true;
    void registerDevicePushTokenForCurrentUser().catch(() => {
      // Final-path behavior: backend registration is best-effort on app bootstrap.
      // The same authenticated user will re-attempt on next app launch.
      pushRegistrationRef.current = false;
    });
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const removeListener = addRevealReadyNotificationResponseListener((relationId) => {
      router.push({ pathname: '/relation/[id]', params: { id: relationId } });
    });

    void (async () => {
      const relationId = await getLaunchRelationIdFromLastNotification();
      if (!relationId) return;
      router.push({ pathname: '/relation/[id]', params: { id: relationId } });
    })();

    return () => {
      removeListener();
    };
  }, [isAuthenticated]);

  return (
    <Stack>
      <Stack.Screen
        name="auth/sign-in"
        options={{ title: 'Sign in', presentation: 'modal', gestureEnabled: false }}
      />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="me/qr"
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="me/scan"
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="me/profile"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="me/edit"
        options={{ title: 'Edit profile', presentation: 'modal' }}
      />
      <Stack.Screen
        name="me/settings"
        options={{
          title: 'Settings',
          headerBackTitle: '',
          headerStyle: { backgroundColor: colors.background.primary },
          headerTintColor: colors.text.primary,
        }}
      />
      <Stack.Screen
        name="me/invite-by-number"
        options={{ title: 'Invite by number', presentation: 'modal' }}
      />
      <Stack.Screen
        name="relation/add"
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="relation/edit/[id]"
        options={{ title: 'Edit relation', presentation: 'modal' }}
      />
      {/* Places routes are intentionally hidden from MVP navigation; files are kept parked for later. */}
      <Stack.Screen
        name="relation/[id]"
        options={{ title: 'Relationship', headerBackTitle: '' }}
      />
      <Stack.Screen name="invite/[relationId]" options={{ title: 'Reveal together' }} />
      <Stack.Screen
        name="invite/identity/[relationId]"
        options={{ title: 'Create your card', presentation: 'modal' }}
      />
      <Stack.Screen name="relation/lexicon" options={{ title: 'Relationship lexicon' }} />
      <Stack.Screen name="relation/evaluate/[id]" options={{ title: 'Foundational reading' }} />
      <Stack.Screen name="relation/archived" options={{ title: 'Archived relationships' }} />
      <Stack.Screen
        name="through/[id]"
        options={{
          headerTransparent: true,
          headerTitle: () => null,
          headerBackTitle: '',
          headerTintColor: colors.text.primary,
        }}
      />
    </Stack>
  );
}
