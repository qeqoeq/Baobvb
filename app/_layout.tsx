import { useEffect, useRef, useState } from 'react';
import { Stack, router, useGlobalSearchParams, usePathname } from 'expo-router';

import { devLogLinking, maskIdForLog } from '../lib/dev-linking-log';
import {
  addRevealReadyNotificationResponseListener,
  configureNotificationPresentation,
  getLaunchRelationIdFromLastNotification,
  registerDevicePushTokenForCurrentUser,
} from '../lib/push-notifications';
import { getOrCreatePublicProfileId } from '../lib/public-profile';
import { getCurrentAuthenticatedUser } from '../lib/supabase-auth';
import { supabase } from '../lib/supabase';
import { useRelationsStore } from '../store/useRelationsStore';

export default function RootLayout() {
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ relationId?: string; token?: string }>();
  const [authResolved, setAuthResolved] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const pushRegistrationRef = useRef(false);
  const { me, setAuthIdentity, setPublicProfileId } = useRelationsStore();
  const provisionedForUserIdRef = useRef<string | null>(null);

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
    if (!isAuthenticated && !onAuthScreen) {
      const relationId =
        typeof globalParams.relationId === 'string' ? globalParams.relationId.trim() : '';
      const token = typeof globalParams.token === 'string' ? globalParams.token.trim() : '';
      if (pathname.startsWith('/invite/') && relationId) {
        const isIdentityInvite = pathname.startsWith('/invite/identity/');
        devLogLinking('auth-gate → sign-in (invite)', {
          pathname,
          inviteKind: isIdentityInvite ? 'identity' : 'arrival',
          relationId: maskIdForLog(relationId),
          hasToken: Boolean(token),
        });
        router.replace({
          pathname: '/auth/sign-in',
          params: {
            redirectPath: isIdentityInvite ? '/invite/identity/[relationId]' : '/invite/[relationId]',
            relationId,
            ...(token ? { token } : {}),
          },
        });
        return;
      }
      devLogLinking('auth-gate → sign-in (generic)', { pathname });
      router.replace({ pathname: '/auth/sign-in', params: { redirectPath: pathname } });
      return;
    }
  }, [authResolved, isAuthenticated, pathname, globalParams.relationId, globalParams.token]);

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
        options={{ title: 'My card', presentation: 'modal' }}
      />
      <Stack.Screen
        name="me/scan"
        options={{ title: 'Scan card', presentation: 'modal' }}
      />
      <Stack.Screen
        name="me/edit"
        options={{ title: 'Edit my card', presentation: 'modal' }}
      />
      <Stack.Screen
        name="relation/add"
        options={{ title: 'Add a person', presentation: 'modal' }}
      />
      <Stack.Screen
        name="relation/edit/[id]"
        options={{ title: 'Edit relation', presentation: 'modal' }}
      />
      {/* Places routes are intentionally hidden from MVP navigation; files are kept parked for later. */}
      <Stack.Screen
        name="relation/[id]"
        options={{ title: 'Relationship', headerBackTitle: 'Garden' }}
      />
      <Stack.Screen name="invite/[relationId]" options={{ title: 'Reveal together' }} />
      <Stack.Screen
        name="invite/identity/[relationId]"
        options={{ title: 'Create your card', presentation: 'modal' }}
      />
      <Stack.Screen name="relation/lexicon" options={{ title: 'Relationship lexicon' }} />
      <Stack.Screen name="relation/evaluate/[id]" options={{ title: 'Foundational reading' }} />
      <Stack.Screen name="relation/archived" options={{ title: 'Archived relationships' }} />
    </Stack>
  );
}
