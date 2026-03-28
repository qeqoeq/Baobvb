import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { signInWithApple } from '../../lib/supabase-auth';

export default function AuthSignInScreen() {
  const { relationId } = useLocalSearchParams<{
    relationId?: string;
  }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteRelationId = typeof relationId === 'string' ? relationId.trim() : '';

  // Post-auth navigation is handled entirely by the auth gate in _layout.tsx,
  // triggered by onAuthStateChange → setIsAuthenticated(true). This prevents a
  // race condition where router.replace() would change the pathname before
  // isAuthenticated propagated, causing the auth gate to redirect back to sign-in.
  const handleSignIn = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await signInWithApple();
      // On success: onAuthStateChange fires → _layout auth gate navigates.
      // On null (user cancelled): no action needed, button resets via finally.
    } catch (authError) {
      const message =
        authError instanceof Error
          ? authError.message
          : 'Could not sign in right now. Please try again.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.copyZone}>
          <Text style={styles.title}>Sign in to Baobab</Text>
          <Text style={styles.body}>
            {inviteRelationId
              ? 'Sign in to accept this invitation and add your side of the relationship.'
              : 'Sign in to access your readings and reveals.'}
          </Text>
        </View>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable onPress={() => void handleSignIn()} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>
            {isSubmitting ? 'Signing in...' : 'Continue with Apple'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  copyZone: {
    gap: spacing.xs,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: colors.text.primary,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
  },
  errorText: {
    fontSize: 12,
    color: colors.semantic.alert,
    lineHeight: 18,
  },
  primaryButton: {
    borderRadius: radius.md,
    backgroundColor: colors.accent.deepTeal,
    alignItems: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
});
