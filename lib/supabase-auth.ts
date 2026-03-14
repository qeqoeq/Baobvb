import type { User } from '@supabase/supabase-js';

import { supabase } from './supabase';

async function getCurrentAuthenticatedUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    throw error;
  }
  return data.user ?? null;
}

export async function ensureAuthenticatedUser(): Promise<User> {
  const existingUser = await getCurrentAuthenticatedUser();
  if (existingUser) return existingUser;

  // Day 2 bridge: relies on Supabase anonymous auth being enabled for the project.
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw error;
  }
  if (!data.user) {
    throw new Error('Supabase anonymous sign-in succeeded without a user.');
  }

  return data.user;
}

export async function getAuthenticatedUserId(): Promise<string> {
  const user = await ensureAuthenticatedUser();
  return user.id;
}
