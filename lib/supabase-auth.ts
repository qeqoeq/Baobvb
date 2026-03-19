import type { User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export async function getCurrentAuthenticatedUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  return data.user ?? null;
}

export async function signInWithApple(): Promise<User> {
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is currently available on iOS only.');
  }

  const appleCredential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!appleCredential.identityToken) {
    throw new Error('Apple sign-in did not return an identity token.');
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: appleCredential.identityToken,
  });
  if (error || !data.user) {
    throw error ?? new Error('Supabase Apple sign-in failed.');
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
