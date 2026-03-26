import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { devLogLinking, maskIdForLog } from '../../lib/dev-linking-log';
import { getCurrentAuthenticatedUser, signInWithApple } from '../../lib/supabase-auth';

export default function AuthSignInScreen() {
  const { redirectPath, relationId, token } = useLocalSearchParams<{
    redirectPath?: string;
    relationId?: string;
    token?: string;
  }>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inviteRelationId = typeof relationId === 'string' ? relationId.trim() : '';

  const resolvePostAuthRoute = () => {
    const redirect = typeof redirectPath === 'string' ? redirectPath : '';
    const inviteToken = typeof token === 'string' ? token.trim() : '';

    devLogLinking('sign-in: post-auth route', {
      redirect,
      relationId: maskIdForLog(inviteRelationId),
      hasToken: Boolean(inviteToken),
    });

    if (redirect === '/invite/identity/[relationId]' && inviteRelationId) {
      router.replace({
        pathname: '/invite/identity/[relationId]',
        params: {
          relationId: inviteRelationId,
          ...(inviteToken ? { token: inviteToken } : {}),
        },
      });
      return;
    }

    if (redirect === '/invite/[relationId]' && inviteRelationId) {
      router.replace({
        pathname: '/invite/[relationId]',
        params: {
          relationId: inviteRelationId,
          ...(inviteToken ? { token: inviteToken } : {}),
        },
      });
      return;
    }

    const relationMatch = redirect.match(/^\/relation\/([^/]+)$/);
    if (relationMatch?.[1]) {
      router.replace({
        pathname: '/relation/[id]',
        params: { id: decodeURIComponent(relationMatch[1]) },
      });
      return;
    }

    router.replace('/(tabs)');
  };

  useEffect(() => {
    void (async () => {
      const existing = await getCurrentAuthenticatedUser();
      if (existing) {
        resolvePostAuthRoute();
      }
    })();
  }, []);

  const handleSignIn = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const user = await signInWithApple();
      // null = user cancelled the Apple sheet — reset silently, no error shown.
      if (user) resolvePostAuthRoute();
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
        <Text style={styles.title}>Sign in to Baobab</Text>
        <Text style={styles.body}>
          {inviteRelationId
            ? 'Sign in to accept this invitation and add your side of the relationship.'
            : 'Sign in to access your readings and reveals.'}
        </Text>
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
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
});
