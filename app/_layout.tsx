import { useEffect, useRef, useState } from 'react';
import * as Linking from 'expo-linking';
import { Stack, router, useGlobalSearchParams, usePathname, type Href } from 'expo-router';

import { colors } from '../constants/colors';
import { devLogLinking, maskIdForLog } from '../lib/dev-linking-log';
import { fetchMySharedRelationships } from '../lib/bootstrap-shared-relations';
import { fetchPassDeliveries } from '../lib/pass-delivery-repo';
import { materializePassDeliveries } from '../store/useRelationsStore';
import { parseInviteDeepLink } from '../lib/parse-invite-deep-link';
import {
  addPassDeliveryNotificationResponseListener,
  addRevealReadyNotificationResponseListener,
  configureNotificationPresentation,
  getLaunchPassDeliveryFromLastNotification,
  getLaunchRelationIdFromLastNotification,
  registerDevicePushTokenForCurrentUser,
} from '../lib/push-notifications';
import { loadOrCreateIdentityKeyPair } from '../lib/identity-keypair';
import { getOrCreatePublicProfileId, reconcileHandleOwnership } from '../lib/public-profile';
import { resolvePostAuthDestination, resolveSignInRedirectTarget } from '../lib/auth-routing';
import { supabase } from '../lib/supabase';
import { useRelationsStore } from '../store/useRelationsStore';

export default function RootLayout() {
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams<{ redirectPath?: string; relationId?: string; token?: string }>();
  const [authResolved, setAuthResolved] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const pushRegistrationRef = useRef(false);
  const { me, isHydrated, identityDivergent, setIdentityDivergence, setAuthIdentity, setPublicProfileId, setIdentitySuffix, bootstrapSharedRelations } = useRelationsStore();
  const provisionedForUserIdRef = useRef<string | null>(null);
  const bootstrappedForUserIdRef = useRef<string | null>(null);
  const reconciledForUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    configureNotificationPresentation();
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    void loadOrCreateIdentityKeyPair().then((result) => {
      setIdentitySuffix(result?.suffix ?? null);
    });
  // setIdentitySuffix is a stable function ref — safe to omit from deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated]);

  useEffect(() => {
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        setIsAuthenticated(Boolean(data.session?.user));
        setAuthIdentity(data.session?.user?.id ?? null);
      } catch (err) {
        // getSession failed - auth gate will redirect to sign-in.
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
    // Identity conflict wins: let the conflict gate hold the screen.
    if (identityDivergent) return;
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
  }, [authResolved, isAuthenticated, identityDivergent, pathname, globalParams.redirectPath, globalParams.relationId, globalParams.token]);

  // Profile setup gate — runs continuously so it catches both first-run and
  // Cancel-back-to-tabs. Exits immediately for every authenticated+setup user.
  useEffect(() => {
    if (identityDivergent) return; // conflict gate wins
    if (!isAuthenticated || !isHydrated || me.isProfileSetup) return;
    // Don't interrupt invite/auth flows that handle identity themselves.
    if (pathname === '/me/edit') return;
    if (pathname.startsWith('/auth/') || pathname.startsWith('/invite/')) return;
    devLogLinking('auth-gate → profile setup (first-run)', { pathname });
    router.replace({ pathname: '/me/edit', params: { setup: '1' } });
  }, [isAuthenticated, isHydrated, identityDivergent, me.isProfileSetup, pathname]);

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
    // Retry up to 3 attempts with backoff (2 s, 4 s) to survive cold-start network
    // conditions. Each await checks the userId guard to abort if the user signs out
    // between attempts.
    void (async () => {
      const MAX_ATTEMPTS = 3;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const id = await getOrCreatePublicProfileId();
          if (provisionedForUserIdRef.current !== userId) return;
          setPublicProfileId(id);
          return;
        } catch (err) {
          if (__DEV__) {
            console.warn(`[identity] provisioning attempt ${attempt}/${MAX_ATTEMPTS} failed:`, err);
          }
          if (attempt < MAX_ATTEMPTS) {
            await new Promise<void>((resolve) => setTimeout(resolve, attempt * 2000));
            if (provisionedForUserIdRef.current !== userId) return;
          }
        }
      }
      // All attempts exhausted — allow the QR screen's own retry to take over.
      provisionedForUserIdRef.current = null;
      if (__DEV__) {
        console.warn('[identity] publicProfileId provisioning exhausted — QR screen retry available');
      }
    })();
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
      .then(() => fetchPassDeliveries())
      .then((deliveries) => {
        if (deliveries.length === 0) return;
        materializePassDeliveries(
          deliveries.map((d) => ({
            fromDeliveryId: d.id,
            canonicalRelationId: d.canonicalRelationId,
            objectType: d.objectType,
            objectPayload: d.objectPayload,
          })),
        );
      })
      .catch(() => {
        // Best-effort: bootstrap or delivery failure is silent.
        // The store retains whatever was previously persisted.
        // Will retry on next app launch when the user is still authenticated.
        // fetchPassDeliveries never throws (returns [] on error), so this catch
        // only fires on bootstrap failure — same behavior as before.
        bootstrappedForUserIdRef.current = null;
      });
  }, [me.internalAuthUserId]);

  // Identity reconciliation (B11 Volet C — R1+R2). Once per authenticated user:
  // verify the local handle still belongs to the active auth session and
  // defensively re-publish display_name. A 'divergent' result means the
  // persisted Supabase session drifted from the local MeProfile (ghost auth) —
  // surface the conflict screen. Never signs out silently.
  useEffect(() => {
    const userId = me.internalAuthUserId ?? null;
    if (!userId || !isHydrated) {
      reconciledForUserIdRef.current = null;
      return;
    }
    const handle = me.handle?.trim();
    if (!handle) return; // nothing to reconcile until the profile has a handle
    if (reconciledForUserIdRef.current === userId) return;
    reconciledForUserIdRef.current = userId;
    void reconcileHandleOwnership(handle, me.displayName ?? '').then((result) => {
      if (reconciledForUserIdRef.current !== userId) return;
      if (result === 'divergent') {
        setIdentityDivergence(true);
      } else if (result === 'skipped') {
        // Network hiccup — allow a retry on the next launch.
        reconciledForUserIdRef.current = null;
      }
    });
  // setIdentityDivergence is a stable store action — safe to omit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.internalAuthUserId, me.handle, me.displayName, isHydrated]);

  // Identity-conflict gate. Takes precedence over the other gates: when a ghost
  // session is detected, route to the explanatory screen and keep the user
  // there until they choose a clean re-auth (never a silent logout).
  useEffect(() => {
    if (!identityDivergent) return;
    if (pathname === '/identity/conflict') return;
    // Cast: expo-router's typed-route table (.expo/types/router.d.ts) is
    // generated on `expo start`; this newly-added static route is not in it yet.
    router.replace('/identity/conflict' as Href);
  }, [identityDivergent, pathname]);

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

    const removeRevealListener = addRevealReadyNotificationResponseListener((relationId) => {
      router.push({ pathname: '/relation/[id]', params: { id: relationId } });
    });

    const removePassListener = addPassDeliveryNotificationResponseListener(() => {
      void fetchPassDeliveries().then((deliveries) => {
        if (deliveries.length > 0) {
          materializePassDeliveries(
            deliveries.map((d) => ({
              fromDeliveryId: d.id,
              canonicalRelationId: d.canonicalRelationId,
              objectType: d.objectType,
              objectPayload: d.objectPayload,
            })),
          );
        }
      });
    });

    void (async () => {
      // Reveal-ready cold-start: open the relation screen.
      const relationId = await getLaunchRelationIdFromLastNotification();
      if (relationId) {
        router.push({ pathname: '/relation/[id]', params: { id: relationId } });
        return;
      }
      // Pass delivery cold-start: materialize so the object is visible on Home.
      const wasPassDelivery = await getLaunchPassDeliveryFromLastNotification();
      if (wasPassDelivery) {
        const deliveries = await fetchPassDeliveries();
        if (deliveries.length > 0) {
          materializePassDeliveries(
            deliveries.map((d) => ({
              fromDeliveryId: d.id,
              canonicalRelationId: d.canonicalRelationId,
              objectType: d.objectType,
              objectPayload: d.objectPayload,
            })),
          );
        }
      }
    })();

    return () => {
      removeRevealListener();
      removePassListener();
    };
  }, [isAuthenticated]);

  // Deep link router for invite URLs.
  // expo-router does not always pick up custom-scheme URLs when the app is launched
  // via the dev-client launcher (launchMode: "launcher"). We therefore wire both
  // cold-start (getInitialURL) and runtime (addEventListener) ourselves and route
  // to /invite/[relationId] explicitly. The auth gate already handles the rest.
  const lastHandledInviteUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const route = (url: string | null | undefined, origin: 'initial' | 'runtime') => {
      if (!url) return;
      if (lastHandledInviteUrlRef.current === url) return;
      if (url.includes('expo-development-client')) {
        devLogLinking('linking: ignored dev-client url', { origin });
        return;
      }
      const parsed = parseInviteDeepLink(url);
      if (!parsed) {
        devLogLinking('linking: non-invite url', { origin });
        return;
      }
      lastHandledInviteUrlRef.current = url;
      devLogLinking('linking: invite route', {
        origin,
        relationId: maskIdForLog(parsed.relationId),
        hasToken: Boolean(parsed.token),
      });
      router.push({
        pathname: '/invite/[relationId]',
        params: { relationId: parsed.relationId, token: parsed.token },
      });
    };

    void Linking.getInitialURL()
      .then((url) => route(url, 'initial'))
      .catch(() => {
        // Best-effort: ignore failures, listener still active for runtime URLs.
      });

    const subscription = Linking.addEventListener('url', ({ url }) => {
      route(url, 'runtime');
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <Stack>
      <Stack.Screen
        name="auth/sign-in"
        options={{ title: 'Sign in', presentation: 'modal', gestureEnabled: false }}
      />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="identity/conflict"
        options={{ headerShown: false, gestureEnabled: false }}
      />
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
        options={{ title: 'Invite by number' }}
      />
      <Stack.Screen
        name="relation/add"
        options={{ headerShown: false, presentation: 'modal' }}
      />
      <Stack.Screen
        name="relation/edit/[id]"
        options={{ title: 'Edit relation', presentation: 'modal' }}
      />
      {/* place/add is configured as a modal so it can be opened from relation context (X.11). */}
      <Stack.Screen
        name="place/add"
        options={{
          presentation: 'modal',
          title: 'Save a place',
          headerStyle: { backgroundColor: colors.background.primary },
          headerTintColor: colors.text.primary,
          headerShadowVisible: false,
        }}
      />
      {/* Place Index (X.65/X.71): dark header, no title (the screen already
          carries its own BAOBAB branding inline), native back chevron kept —
          same pattern already used for relation/[id] and through/[id]. */}
      <Stack.Screen
        name="place/index"
        options={{
          title: '',
          headerBackTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: { backgroundColor: colors.background.primary },
          headerTintColor: colors.text.primary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen
        name="relation/[id]"
        options={{
          title: '',
          headerBackTitle: '',
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: { backgroundColor: colors.background.primary },
          headerTintColor: colors.text.primary,
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen name="invite/[relationId]" options={{ title: 'Baobab', headerBackTitle: '' }} />
      <Stack.Screen
        name="invite/identity/[relationId]"
        options={{ title: 'Create your card', presentation: 'modal' }}
      />
      <Stack.Screen name="relation/lexicon" options={{ title: 'Relationship lexicon' }} />
      <Stack.Screen
        name="relation/evaluate/[id]"
        options={{
          title: 'Foundational reading',
          headerBackTitle: '',
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
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
