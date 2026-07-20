import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../../constants/colors';
import { radius, spacing } from '../../../constants/spacing';
import { deriveAvatarSeed, normalizeHandleInput } from '../../../lib/identity-format';
import { devLogLinking } from '../../../lib/dev-linking-log';
import { publishHandleBestEffort } from '../../../lib/public-profile';
import { useRelationsStore } from '../../../store/useRelationsStore';

export default function InviteIdentityScreen() {
  const { relationId, token } = useLocalSearchParams<{ relationId: string; token?: string }>();
  const relationIdTrim = typeof relationId === 'string' ? relationId.trim() : '';
  const { updateMe } = useRelationsStore();
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const returnToInvite = () => {
    router.replace({
      pathname: '/invite/[relationId]',
      params: {
        relationId: relationIdTrim,
        token: token || '',
        // Signal that B already tapped "Continue and read" before identity.
        // The arrival screen resumes that intent automatically, with all
        // doctrine guards (token, identity, no in-flight state, no error).
        continueAfterIdentity: '1',
      },
    });
  };

  const handleContinue = () => {
    const cleanName = displayName.trim();
    if (!cleanName) {
      setError('Ton nom est requis.');
      return;
    }

    const cleanHandle = normalizeHandleInput(cleanName);
    if (!cleanHandle) {
      setError('Ajoute au moins une lettre ou un chiffre pour continuer.');
      return;
    }

    const saved = updateMe({
      displayName: cleanName,
      handle: cleanHandle,
      avatarSeed: deriveAvatarSeed(cleanName),
    });

    if (!saved) {
      setError('Impossible d’enregistrer ta carte. Réessaie.');
      return;
    }

    // Best-effort (Volet A / B11): publish display_name + handle to the public
    // registry so the counterpart receives a name via my_shared_relationships()
    // even if this claimer never opens Me → Edit. Fire-and-forget: a 'taken'
    // handle or network error must never block the invite flow.
    void publishHandleBestEffort(cleanHandle, cleanName);

    returnToInvite();
  };

  if (!relationIdTrim) {
    if (__DEV__) {
      devLogLinking('invite identity: missing relationId', {});
    }
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.title}>Lien invalide</Text>
          <Text style={styles.body}>Cet écran a besoin d’un identifiant de relation dans l’URL.</Text>
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Retour</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable style={styles.screen} onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
      <View style={styles.card}>
        <Text style={styles.title}>Comment on t’appelle ?</Text>
        <Text style={styles.body}>Un prénom suffit pour ouvrir ce lien.</Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Ton nom</Text>
          <TextInput
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              if (error) setError(null);
            }}
            placeholder="Ton nom"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
            autoFocus
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable onPress={handleContinue} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Continuer</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Pas maintenant</Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  kav: {
    flex: 1,
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
  fieldBlock: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.text.muted,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.strong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text.primary,
    fontSize: 15,
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
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
});
