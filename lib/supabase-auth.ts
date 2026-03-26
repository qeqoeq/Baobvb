import type { User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export async function getCurrentAuthenticatedUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    // AuthSessionMissingError means no active session — valid unauthenticated state, not a crash.
    if (error.name === 'AuthSessionMissingError') return null;
    throw error;
  }
  return data.user ?? null;
}

/**
 * Returns the authenticated User, or null if the user cancelled the Apple sign-in sheet.
 * Throws on all real failures (unavailable, network error, Supabase error).
 */
export async function signInWithApple(): Promise<User | null> {
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is only available on iOS.');
  }

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error(
      'Sign in with Apple is not available on this device.',
    );
  }

  let appleCredential: Awaited<ReturnType<typeof AppleAuthentication.signInAsync>>;
  try {
    appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (err: unknown) {
    const code = err != null && typeof err === 'object' && 'code' in err
      ? String((err as { code: unknown }).code)
      : '';
    const msg = err instanceof Error ? err.message : '';

    // User dismissed the Apple sign-in sheet — not an error.
    if (code === 'ERR_REQUEST_CANCELED') return null;

    // Apple's native "unknown reason" error — most common in the simulator
    // when no Apple ID is signed in under Settings → Apple ID, or when the
    // Sign in with Apple entitlement is missing from the build.
    if (msg.toLowerCase().includes('unknown reason')) {
      if (__DEV__) {
        throw new Error(
          'Apple Sign In failed (simulator). Sign in to an Apple ID under Settings → Apple ID, or run on a real device.',
        );
      }
      throw new Error('Sign in with Apple failed. Please try again on a real device.');
    }

    throw err instanceof Error ? err : new Error('Sign in with Apple failed. Please try again.');
  }

  if (!appleCredential.identityToken) {
    throw new Error('Apple did not return an identity token. Please try again.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: appleCredential.identityToken,
  });
  if (error || !data.user) {
    throw error ?? new Error('Sign in failed. Please try again.');
  }

  return data.user;
}

export async function ensureAuthenticatedUser(): Promise<User> {
  const existingUser = await getCurrentAuthenticatedUser();
  if (existingUser) return existingUser;

  throw new Error('Authentication required. Sign in with Apple before shared actions.');
}

export async function getAuthenticatedUserId(): Promise<string> {
  const user = await ensureAuthenticatedUser();
  return user.id;
}
