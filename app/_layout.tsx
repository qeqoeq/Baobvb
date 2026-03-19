import { useEffect, useState } from 'react';
import { Stack, router, useGlobalSearchParams, usePathname } from 'expo-router';

import { getCurrentAuthenticatedUser } from '../lib/supabase-auth';
import { supabase } from '../lib/supabase';

export default function RootLayout() {
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ relationId?: string; token?: string }>();
  const [authResolved, setAuthResolved] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const user = await getCurrentAuthenticatedUser();
        setIsAuthenticated(Boolean(user));
      } finally {
        setAuthResolved(true);
      }
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
      setAuthResolved(true);
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
        router.replace({
          pathname: '/auth/sign-in',
          params: {
            redirectPath: '/invite/[relationId]',
            relationId,
            ...(token ? { token } : {}),
          },
        });
        return;
      }
      router.replace({ pathname: '/auth/sign-in', params: { redirectPath: pathname } });
      return;
    }
  }, [authResolved, isAuthenticated, pathname, globalParams.relationId, globalParams.token]);

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
      <Stack.Screen name="relation/archived" options={{ title: 'Relations archivees' }} />
    </Stack>
  );
}
