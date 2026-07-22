import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { supabase } from '../../lib/supabase';
import { useRelationsStore } from '../../store/useRelationsStore';

/**
 * Identity conflict screen (B11 Volet C — R1).
 *
 * Shown when bootstrap reconciliation detects that the local handle belongs to
 * a different auth account than the active session (a drifted "ghost" session).
 * We NEVER sign the user out silently: this screen explains the situation and
 * lets the user choose a clean re-authentication.
 */
export default function IdentityConflictScreen() {
  const { me, setIdentityDivergence } = useRelationsStore();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleReauthenticate = () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    // Clear the flag first so the auth gate can route to sign-in once the
    // session ends — otherwise the conflict gate would keep holding this screen.
    setIdentityDivergence(false);
    void supabase.auth.signOut().catch(() => {
      // The auth state listener in _layout.tsx handles the redirect to sign-in.
    });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>{'Reconnectons ton compte'}</Text>
        <Text style={styles.body}>
          {'Cet appareil est connecté sous un compte différent de ta carte Baobab '}
          {me.handle ? (
            <Text style={styles.handle}>{me.handle}</Text>
          ) : (
            'ta carte Baobab'
          )}
          {'. Pour garder tes relations synchronisées, reconnecte-toi avec le compte propriétaire de cette carte.'}
        </Text>
        <Text style={styles.reassure}>
          {'Rien n’est supprimé sur cet appareil. Tes notes privées et tes lectures restent exactement où elles sont.'}
        </Text>

        <Pressable
          onPress={handleReauthenticate}
          style={[styles.primaryButton, isSigningOut && styles.primaryButtonDisabled]}
          disabled={isSigningOut}
        >
          <Text style={styles.primaryButtonText}>
            {isSigningOut ? 'Déconnexion…' : 'Se reconnecter'}
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
  handle: {
    color: colors.text.primary,
    fontWeight: '700',
  },
  reassure: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.muted,
  },
  primaryButton: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.accent.deepTeal,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
});
